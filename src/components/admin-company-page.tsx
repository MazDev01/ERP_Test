"use client";

/*
 * ข้อมูลบริษัท — รายการผู้ออกเอกสาร (ผู้ใช้สั่ง 18 ก.ย. 2569: ดรอปดาวน์ "ออกในนาม" ต้องเพิ่มเองได้)
 *
 * แต่ละรายคือหัวกระดาษของใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จที่ออกในนามนั้น (issuerInfo ใน quotation-paper.tsx)
 * + บัญชีรับเงิน + จด VAT หรือไม่ (มีผลกับยอดในใบเสนอราคา) + ตัวนำหน้าเลขใบเสนอราคา + เอกสารแนบ
 * รหัส (MAZ, B1 ...) ตั้งได้ตอนเพิ่มเท่านั้น — ใบเสนอราคาเก็บรหัสนี้ไว้
 * ลบได้เฉพาะรายที่ยังไม่เคยออกใบเสนอราคา และต้องเหลืออย่างน้อยหนึ่งราย
 * แก้แล้วเอกสารที่เปิดดูหลังจากนี้ใช้ข้อมูลใหม่ รวมถึงเอกสารเก่าที่พิมพ์ซ้ำ
 */

import { useRef, useState } from "react";
import { bkkNow, thaiDate, todayIso } from "@/lib/format";
import type { Issuer, IssuerDoc, IssuerImage } from "@/lib/system-settings";
import { useCrm } from "@/lib/crm-store";
import { AdminHead, Card, IconBtn, Input2, SaveBar, Switch, inputCls, thCls, trCls, useSectionDraft } from "./admin-ui";
import { ConfirmDialog } from "./confirm-dialog";
import { Sheet } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

type TextKey = "label" | "name" | "taxId" | "address" | "phone" | "email" | "callCenter" | "bankName" | "bankAccountName" | "bankAccountNo" | "prefix" | "signName" | "signTitle";

const LABEL: Record<TextKey, string> = {
  label: "ชื่อในรายการ ‘ออกในนาม’",
  name: "ชื่อบนเอกสาร",
  taxId: "เลขประจำตัวผู้เสียภาษี",
  address: "ที่อยู่",
  phone: "โทรศัพท์",
  email: "อีเมล",
  callCenter: "Call Center",
  bankName: "ธนาคาร",
  bankAccountName: "ชื่อบัญชี",
  bankAccountNo: "เลขที่บัญชี",
  prefix: "ตัวนำหน้าเลขใบเสนอราคา",
  signName: "ชื่อผู้ลงนาม",
  signTitle: "ตำแหน่งผู้ลงนาม",
};

/* รูปลายเซ็น/ตราประทับ — ใช้ในประวัติการตั้งค่าและกล่องยืนยันลบ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
const SIG_LABEL = { sign: "รูปลายเซ็นผู้มีอำนาจลงนาม", stamp: "รูปตราประทับบริษัท" } as const;
type SigKey = keyof typeof SIG_LABEL;

function describe(a: Issuer[], b: Issuer[]) {
  const out: string[] = [];
  for (const x of b) {
    const was = a.find((y) => y.code === x.code);
    if (!was) {
      out.push(`เพิ่มผู้ออกเอกสาร ${x.code} ${x.name}`);
      continue;
    }
    for (const k of Object.keys(LABEL) as TextKey[])
      if ((was[k] ?? "") !== (x[k] ?? "")) out.push(`${x.code} ${LABEL[k]}: ${(x[k] ?? "").replace(/\n/g, " ")}`);
    if (was.vat !== x.vat) out.push(`${x.code} ${x.vat ? "จด VAT" : "ไม่จด VAT"}`);
    const had = new Set((was.docs ?? []).map((f) => f.id));
    for (const f of x.docs ?? []) if (!had.has(f.id)) out.push(`${x.code} แนบเอกสาร ${f.name}`);
    const now = new Set((x.docs ?? []).map((f) => f.id));
    for (const f of was.docs ?? []) if (!now.has(f.id)) out.push(`${x.code} เอาเอกสารออก ${f.name}`);
    for (const k of Object.keys(SIG_LABEL) as SigKey[])
      if ((was[k]?.src ?? "") !== (x[k]?.src ?? ""))
        out.push(`${x.code} ${!x[k] ? "ลบ" : was[k] ? "เปลี่ยน" : "เพิ่ม"}${SIG_LABEL[k]}${x[k] ? ` (${x[k]!.name})` : ""}`);
  }
  for (const x of a) if (!b.some((y) => y.code === x.code)) out.push(`ลบผู้ออกเอกสาร ${x.code} ${x.name}`);
  return out;
}

function problemOf(list: Issuer[]) {
  /* รูปทั้งหมดเก็บในเครื่องพร้อมการตั้งค่า — เกินโควตาเบราว์เซอร์แล้วบันทึกไม่ลงแบบเงียบ ๆ จึงกันไว้ก่อน (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  /* รวมรูปลายเซ็นและตราประทับในงบเดียวกัน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const total = list.reduce(
    (n, c) => n + (c.docs ?? []).reduce((m, f) => m + (f.src?.length ?? 0), 0) + (c.sign?.src.length ?? 0) + (c.stamp?.src.length ?? 0),
    0,
  );
  if (total > ALL_IMG_BYTES) return `รูปเอกสารแนบ ลายเซ็น และตราประทับของผู้ออกเอกสารทุกรายรวมกัน ${fileSize(total)} เกิน ${fileSize(ALL_IMG_BYTES)} ที่เครื่องนี้เก็บได้ — ลบรูปที่ไม่จำเป็นออกก่อนบันทึก`;
  const codes = new Set<string>();
  for (const c of list) {
    if (!/^[A-Z0-9]{1,6}$/.test(c.code)) return `รหัสผู้ออกเอกสาร "${c.code || "(ว่าง)"}" ต้องเป็นอังกฤษตัวใหญ่หรือตัวเลข 1–6 ตัว`;
    if (codes.has(c.code)) return `รหัส ${c.code} ซ้ำกัน`;
    codes.add(c.code);
    if (!c.label.trim()) return `${c.code}: ระบุชื่อในรายการ ‘ออกในนาม’`;
    if (!c.name.trim()) return `${c.code}: ระบุชื่อบนเอกสาร`;
    if (c.taxId.trim() && !/^\d{13}$/.test(c.taxId.trim())) return `${c.code}: เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก`;
    if (c.email.trim() && !/^\S+@\S+\.\S+$/.test(c.email.trim())) return `${c.code}: อีเมลไม่ถูกรูปแบบ`;
    if (!c.bankAccountNo.trim()) return `${c.code}: ระบุเลขที่บัญชีสำหรับรับชำระเงิน`;
    if (!/^[A-Za-z0-9-]{1,10}$/.test(c.prefix)) return `${c.code}: ตัวนำหน้าเลขใบเสนอราคาต้องเป็นอังกฤษหรือตัวเลข 1–10 ตัว`;
  }
  return "";
}

/** ประเภทเอกสารแนบตามต้นแบบ HR-18 */
const ATT_CATS = [
  { k: "company_cert", label: "หนังสือรับรองบริษัท" },
  { k: "commerce", label: "ใบทะเบียนพาณิชย์" },
  { k: "vat20", label: "ใบทะเบียนภาษีมูลค่าเพิ่ม (ภ.พ.20)" },
  { k: "license", label: "ใบประกอบการ / ใบอนุญาตประกอบกิจการ" },
  { k: "bankbook", label: "หน้าสมุดบัญชีธนาคาร" },
  { k: "idcard", label: "สำเนาบัตรประชาชน" },
  { k: "other", label: "อื่น ๆ" },
];
const ATT_MAX = 10;

/*
 * รับเฉพาะรูป JPG PNG WEBP (ผู้ใช้สั่ง 15 ต.ค. 2569) — รูปต้องเก็บจริงเพื่อพิมพ์ต่อท้ายใบเสนอราคา
 * ย่อในเบราว์เซอร์ก่อนเก็บ: ด้านยาวไม่เกิน 1600px · บันทึกเป็น JPEG คุณภาพ 0.8
 * หลังย่อแล้วยังเกิน 1.5 MB ไม่รับ · รวมทุกผู้ออกเอกสารไม่เกิน 3.5 MB (localStorage ทั้งระบบได้ราว 5 MB)
 */
const IMG_TYPES = ["image/jpeg", "image/png", "image/webp"];
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
const IMG_MAX_SIDE = 1600;
const IMG_QUALITY = 0.8;
const IMG_MAX_BYTES = 1.5 * 1024 * 1024;
const ALL_IMG_BYTES = 3.5 * 1024 * 1024;

/* คอลัมน์ตารางเอกสารแนบ — รูปย่อ | ชื่อ | แนบ | ปุ่ม */
const ATT_COLS = "grid-cols-[52px_minmax(0,1fr)_58px_auto]";

/** แนบไปกับใบเสนอราคาตอนนี้ไหม — มีรูป เปิดแนบไว้ และยังไม่หมดอายุ */
function attachedNow(f: { attach?: boolean; expires?: string; src?: string }) {
  return Boolean(f.attach && f.src) && !(f.expires && f.expires < todayIso());
}

/** ขนาดจริงของ data URL (base64) โดยประมาณ */
function dataBytes(src: string) {
  const i = src.indexOf(",");
  return Math.floor(((src.length - i - 1) * 3) / 4);
}

/*
 * ลายเซ็นและตราประทับ (ผู้ใช้สั่ง 16 ต.ค. 2569) — ด้านยาวไม่เกิน 800px · หลังย่อเกิน 400 KB ไม่รับ
 * PNG/WEBP เก็บเป็น PNG พื้นโปร่งใส ไม่เติมขาว · JPG ไม่มีพื้นโปร่งใสอยู่แล้ว เก็บเป็น JPEG ให้ไฟล์เล็ก
 */
const SIG_MAX_SIDE = 800;
const SIG_MAX_BYTES = 400 * 1024;

/**
 * อ่านไฟล์รูปเป็น data URL แล้วย่อ/บีบอัดผ่าน canvas — ค่าตั้งต้น (เอกสารแนบ) พื้นโปร่งใสของ PNG เติมขาว
 * keepAlpha = รูปที่ไม่ใช่ JPG เก็บเป็น PNG คงพื้นโปร่งใส (ลายเซ็น/ตราประทับ)
 */
function readImage(
  file: File,
  opt: { maxSide?: number; keepAlpha?: boolean } = {},
): Promise<{ src: string; w: number; h: number }> {
  const maxSide = opt.maxSide ?? IMG_MAX_SIDE;
  const alpha = Boolean(opt.keepAlpha) && !/jpe?g/i.test(file.type || file.name.split(".").pop() || "");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("decode"));
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * k));
        const h = Math.max(1, Math.round(img.naturalHeight * k));
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d");
        if (!ctx) return reject(new Error("canvas"));
        if (!alpha) {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ src: alpha ? cv.toDataURL("image/png") : cv.toDataURL("image/jpeg", IMG_QUALITY), w, h });
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

let attSeq = 0;

function fileSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

export function AdminCompanyPage() {
  const d = useSectionDraft("issuers", "ข้อมูลบริษัท", describe);
  const crm = useCrm();
  const list = d.draft;
  const [selCode, setSelCode] = useState(list[0]?.code ?? "");
  /* กล่องแก้รายละเอียดไฟล์แนบ · ยืนยันลบ · ข้อความผิดพลาดตอนเลือกรูป (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const [attEdit, setAttEdit] = useState("");
  const [attDel, setAttDel] = useState("");
  const [attErr, setAttErr] = useState<string[]>([]);
  const [attBusy, setAttBusy] = useState(false);
  const pickRef = useRef<HTMLInputElement>(null);
  const idx = Math.max(0, list.findIndex((x) => x.code === selCode));
  const c = list[idx];
  const isNew = !d.saved.some((x) => x.code === c.code);
  const used = crm.quotations.filter((q) => q.issuer === c.code).length;

  const update = (patch: Partial<Issuer>) => d.setDraft(list.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const set = (k: TextKey) => (e: { target: { value: string } }) => update({ [k]: e.target.value });

  function add() {
    let n = list.length;
    let code = `B${n}`;
    while (list.some((x) => x.code === code)) code = `B${++n}`;
    const base = list[0];
    d.setDraft([
      ...list,
      {
        code,
        label: "",
        name: "",
        taxId: "",
        address: "",
        phone: base?.phone ?? "",
        email: "",
        callCenter: base?.callCenter ?? "",
        bankName: "",
        bankAccountName: "",
        bankAccountNo: "",
        vat: true,
        prefix: code,
      },
    ]);
    setSelCode(code);
  }

  function remove() {
    const next = list.filter((_, i) => i !== idx);
    d.setDraft(next);
    setSelCode(next[0]?.code ?? "");
  }

  const canRemove = list.length > 1 && used === 0;
  const docs = c.docs ?? [];

  /* เลือกรูปเข้ามา — ตรวจชนิด ย่อ แล้วต่อท้ายรายการ (แนบอัตโนมัติ) */
  async function addImages(files: File[]) {
    const errs: string[] = [];
    const added: IssuerDoc[] = [];
    setAttBusy(true);
    for (const file of files) {
      if (docs.length + added.length >= ATT_MAX) {
        errs.push(`แนบได้ไม่เกิน ${ATT_MAX} รูป — ข้าม ${file.name}`);
        continue;
      }
      if (!IMG_TYPES.includes(file.type) && !IMG_EXT.test(file.name)) {
        errs.push(`รับเฉพาะไฟล์รูปภาพ (JPG PNG WEBP) — ${file.name} ไม่ใช่รูป`);
        continue;
      }
      try {
        const img = await readImage(file);
        const bytes = dataBytes(img.src);
        if (bytes > IMG_MAX_BYTES) {
          errs.push(`${file.name} ย่อแล้วยังใหญ่ ${fileSize(bytes)} เกิน ${fileSize(IMG_MAX_BYTES)} — ลดความละเอียดหรือครอปรูปก่อนแนบ`);
          continue;
        }
        const title = file.name.replace(/\.[^.]+$/, "");
        added.push({
          id: `img${++attSeq}-${Date.now()}`,
          name: file.name,
          size: bytes,
          title,
          cat: /บัญชี|bank|book/i.test(file.name) ? "bankbook" : ATT_CATS[0].k,
          attach: true,
          addedAt: todayIso(),
          src: img.src,
          w: img.w,
          h: img.h,
        });
      } catch {
        errs.push(`เปิดรูป ${file.name} ไม่ได้ — ไฟล์อาจเสียหรือไม่ใช่รูปภาพ`);
      }
    }
    setAttBusy(false);
    setAttErr(errs);
    if (added.length) update({ docs: [...docs, ...added] });
  }

  /* เลื่อนลำดับรูป — ลำดับนี้คือลำดับแผ่นท้ายใบเสนอราคา */
  const move = (id: string, by: -1 | 1) => {
    const i = docs.findIndex((f) => f.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= docs.length) return;
    const next = [...docs];
    [next[i], next[j]] = [next[j], next[i]];
    update({ docs: next });
  };

  return (
    <div className="space-y-4">
      <AdminHead
        title="ข้อมูลผู้ออกเอกสาร"
        desc="ผู้ออกเอกสาร — หัวกระดาษ บัญชีรับเงิน และการจด VAT ของแต่ละรายที่ใบเสนอราคาเลือก ‘ออกในนาม’ ได้"
      />

      {/* ── รายการผู้ออกเอกสาร: ดรอปดาวน์บรรทัดเดียว เพิ่มกี่รายก็ไม่ยาวเป็นหลายบรรทัด (ผู้ใช้สั่ง 15 ต.ค. 2569) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="issuer-pick" className="text-[13px] font-semibold text-muted-foreground">
          ผู้ออกเอกสาร
        </label>
        <select
          id="issuer-pick"
          value={c.code}
          onChange={(e) => setSelCode(e.target.value)}
          className="field-control h-10 min-w-0 flex-1 cursor-pointer sm:max-w-[420px]"
        >
          {list.map((x) => (
            <option key={x.code} value={x.code}>
              {x.code} · {x.name || "(ยังไม่ตั้งชื่อ)"}
            </option>
          ))}
        </select>
        <button type="button" className="btn solid btn-solid h-10" onClick={add}>
          <PlusIcon className="size-4" strokeWidth={2.4} />
          เพิ่มผู้ออกเอกสาร
        </button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card
            title={`ผู้ออกเอกสาร ${c.code}`}
            note={used ? `ออกใบเสนอราคาไปแล้ว ${used} ใบ` : isNew ? "รายใหม่ — ยังไม่ได้บันทึก" : "ยังไม่เคยออกใบเสนอราคา"}
            aside={
              <button
                type="button"
                className="btn glass-thin text-destructive disabled:opacity-40"
                disabled={!canRemove}
                title={!canRemove ? (used ? "มีใบเสนอราคาที่ออกในนามนี้แล้ว" : "ต้องเหลืออย่างน้อยหนึ่งราย") : undefined}
                onClick={remove}
              >
                <TrashIcon className="size-4" strokeWidth={1.9} />
                ลบผู้ออกเอกสารนี้
              </button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
              <Input2 label="รหัส" hint={isNew ? "อังกฤษตัวใหญ่/ตัวเลข" : undefined}>
                <input
                  value={c.code}
                  disabled={!isNew}
                  onChange={(e) => {
                    const code = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
                    update({ code });
                    setSelCode(code);
                  }}
                  className={`${inputCls} num disabled:cursor-not-allowed disabled:opacity-60`}
                />
              </Input2>
              <Input2 label={LABEL.label}>
                <input value={c.label} onChange={set("label")} placeholder="เช่น บริษัทในเครือ 2 (B2)" className={inputCls} />
              </Input2>
              <Input2 label={LABEL.name} className="sm:col-span-2">
                <input value={c.name} onChange={set("name")} className={inputCls} />
              </Input2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Input2 label={LABEL.taxId}>
                <input value={c.taxId} onChange={set("taxId")} inputMode="numeric" maxLength={13} className={`${inputCls} num`} />
              </Input2>
              <Input2 label={LABEL.phone}>
                <input value={c.phone} onChange={set("phone")} className={inputCls} />
              </Input2>
              <Input2 label={LABEL.email}>
                <input value={c.email} onChange={set("email")} type="email" className={inputCls} />
              </Input2>
              <Input2 label={LABEL.callCenter}>
                <input value={c.callCenter ?? ""} onChange={set("callCenter")} className={inputCls} />
              </Input2>
              <Input2 label="ภาษีมูลค่าเพิ่ม">
                <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[13.5px]">
                  <input
                    type="checkbox"
                    checked={c.vat}
                    onChange={(e) => update({ vat: e.target.checked })}
                    className="size-4 accent-[var(--primary)]"
                  />
                  จดทะเบียนภาษีมูลค่าเพิ่ม
                </label>
              </Input2>
              <Input2 label={LABEL.address} className="sm:col-span-2">
                <textarea value={c.address} onChange={set("address")} rows={3} className="field-control w-full py-2 text-[14px] leading-relaxed" />
              </Input2>
            </div>
          </Card>

          <Card title="ช่องทางชำระเงินและเลขเอกสาร">
            <div className="grid gap-4 sm:grid-cols-3">
              <Input2 label={LABEL.bankName}>
                <input value={c.bankName} onChange={set("bankName")} className={inputCls} />
              </Input2>
              <Input2 label={LABEL.bankAccountName}>
                <input value={c.bankAccountName} onChange={set("bankAccountName")} className={inputCls} />
              </Input2>
              <Input2 label={LABEL.bankAccountNo}>
                <input value={c.bankAccountNo} onChange={set("bankAccountNo")} className={`${inputCls} num`} />
              </Input2>
              <Input2 label={LABEL.prefix} hint={`ตัวอย่าง ${c.prefix || "—"}-${bkkNow().getFullYear() + 543}-0001`}>
                <input
                  value={c.prefix}
                  onChange={(e) => update({ prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 10) })}
                  className={`${inputCls} num`}
                />
              </Input2>
            </div>
          </Card>

          {/*
            เอกสารแนบใบเสนอราคา (ต้นแบบ HR-18) — รูปที่พิมพ์ต่อท้ายใบเสนอราคาของผู้ออกรายนี้ แผ่นละรูป มีลายน้ำ
            รับเฉพาะรูป JPG PNG WEBP เช่น หนังสือรับรองบริษัท หน้าสมุดบัญชี (ผู้ใช้สั่ง 15 ต.ค. 2569)
            แนบอัตโนมัติได้ · ตั้งวันหมดอายุได้ · หมดอายุแล้วระบบหยุดแนบให้เอง · ลำดับในตาราง = ลำดับแผ่น
          */}
          <Card
            title="เอกสารแนบใบเสนอราคา"
            note={`${docs.length} / ${ATT_MAX} รูป · JPG PNG WEBP`}
            aside={
              <button
                type="button"
                className="btn solid btn-solid"
                disabled={docs.length >= ATT_MAX || attBusy}
                title={docs.length >= ATT_MAX ? `แนบได้ไม่เกิน ${ATT_MAX} รูป` : undefined}
                onClick={() => pickRef.current?.click()}
              >
                <PlusIcon className="size-4" strokeWidth={2.4} />
                {attBusy ? "กำลังย่อรูป…" : "เพิ่มไฟล์"}
              </button>
            }
          >
            <input
              ref={pickRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                if (files.length) void addImages(files);
              }}
            />
            <p className="mb-3 rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
              แนบท้ายใบเสนอราคา{" "}
              <b className="font-semibold text-foreground">
                {docs.filter(attachedNow).length ? `${docs.filter(attachedNow).length} รูป` : "ไม่มีรูป"}
              </b>
              {docs.filter(attachedNow).length > 0 && ` · ${docs.filter(attachedNow).map((f) => f.title || f.name).join(" · ")}`}
              <span className="mt-0.5 block text-[11.5px]">
                พิมพ์ต่อจากหน้าใบเสนอราคา แผ่นละรูป มีลายน้ำชื่อบริษัท “ใช้สำหรับใบเสนอราคาเท่านั้น” · รูปถูกย่อให้ด้านยาวไม่เกิน {IMG_MAX_SIDE}px
              </span>
            </p>

            {attErr.length > 0 && (
              <div role="alert" className="mb-3 rounded-[11px] border border-destructive/30 bg-[var(--destructive-soft)] px-3 py-2.5 text-[12.5px] leading-relaxed text-destructive">
                {attErr.map((m) => (
                  <p key={m}>{m}</p>
                ))}
              </div>
            )}

            {docs.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">ยังไม่มีเอกสารแนบ</p>
            ) : (
              /* ตาราง: รูปย่อ | ชื่อ | แนบ | เลื่อน/ดินสอ/ถังขยะ · ไม่แนบ = จางทั้งแถว */
              <div>
                <div className={`grid ${ATT_COLS} ${thCls}`}>
                  <span>รูป</span>
                  <span>ชื่อเอกสาร</span>
                  <span className="text-center">แนบ</span>
                  <span />
                </div>
                {docs.map((f, n) => {
                  const dead = Boolean(f.expires && f.expires < todayIso());
                  /* ไฟล์เดิมจากก่อนเปลี่ยนเป็นรูปอย่างเดียว — เก็บแค่ชื่อ ไม่มีรูปให้พิมพ์ */
                  const legacy = !f.src;
                  return (
                    <div key={f.id} className={`grid ${ATT_COLS} ${trCls} ${attachedNow(f) ? "" : "opacity-50"}`}>
                      <span className="flex items-center">
                        {f.src ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={f.src}
                            alt={f.title || f.name}
                            className="size-11 rounded-[8px] border border-border bg-white object-cover"
                          />
                        ) : (
                          <span className="grid size-11 place-items-center rounded-[8px] border border-dashed border-border text-[10px] text-muted-foreground">
                            ไม่มีรูป
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <b className="block truncate text-[13.5px] font-semibold">{f.title || f.name}</b>
                        {legacy ? (
                          <small className="block text-[11.5px] font-semibold text-[var(--warning)]">
                            ไฟล์เดิม (ไม่ใช่รูป) — ไม่แสดงบนเอกสาร
                          </small>
                        ) : (
                          <small className="block truncate text-[11.5px] text-muted-foreground">
                            {[ATT_CATS.find((x) => x.k === f.cat)?.label, f.w && f.h && `${f.w}×${f.h}px`, fileSize(f.size)].filter(Boolean).join(" · ")}
                          </small>
                        )}
                        <small className="block text-[11.5px] text-muted-foreground">
                          {[f.addedAt && `เพิ่มเมื่อ ${thaiDate(f.addedAt)}`, f.expires && `หมดอายุ ${thaiDate(f.expires)}`].filter(Boolean).join(" · ")}
                          {dead && <b className="ml-1 font-semibold text-destructive">· หมดอายุแล้ว</b>}
                        </small>
                      </span>
                      <span className="flex justify-center">
                        <Switch
                          on={Boolean(f.attach) && !dead && !legacy}
                          disabled={dead || legacy}
                          title={legacy ? "ไฟล์เดิมไม่มีรูป ระบบแนบไม่ได้" : dead ? "เอกสารหมดอายุแล้ว ระบบไม่แนบให้" : undefined}
                          onToggle={() => update({ docs: docs.map((x) => (x.id === f.id ? { ...x, attach: !x.attach } : x)) })}
                          label={`แนบ ${f.title || f.name} ไปกับใบเสนอราคา`}
                        />
                      </span>
                      <span className="flex flex-wrap justify-end gap-1.5">
                        <IconBtn label={`เลื่อน ${f.title || f.name} ขึ้น`} title="เลื่อนขึ้น" disabled={n === 0} onClick={() => move(f.id, -1)}>
                          <ChevronUpIcon className="size-3.5" strokeWidth={2.2} />
                        </IconBtn>
                        <IconBtn label={`เลื่อน ${f.title || f.name} ลง`} title="เลื่อนลง" disabled={n === docs.length - 1} onClick={() => move(f.id, 1)}>
                          <ChevronDownIcon className="size-3.5" strokeWidth={2.2} />
                        </IconBtn>
                        {!legacy && (
                          <IconBtn label={`แก้ไข ${f.title || f.name}`} title="แก้ไข" onClick={() => setAttEdit(f.id)}>
                            <PencilIcon className="size-3.5" strokeWidth={1.9} />
                          </IconBtn>
                        )}
                        <IconBtn label={`ลบ ${f.title || f.name}`} title="ลบ" danger onClick={() => setAttDel(f.id)}>
                          <TrashIcon className="size-3.5" strokeWidth={1.9} />
                        </IconBtn>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <SignCard key={c.code} issuer={c} update={update} />
        </div>

        {/* ตัวอย่างหัวกระดาษ — วาดจากร่าง จะได้เห็นก่อนบันทึก */}
        <Card title="ตัวอย่างบนเอกสาร">
          <div className="rounded-[10px] border border-border bg-white px-4 py-3.5 text-[#25292f]">
            <p className="text-[13px] font-bold">{c.name || "—"}</p>
            <p className="text-[11.5px] leading-[1.75] text-[#5a6069]">
              เลขประจำตัวผู้เสียภาษี : {c.taxId || "—"}
              {c.address.split("\n").filter(Boolean).map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
              {c.phone && <span className="block">โทร. {c.phone}</span>}
              {c.email && <span className="block">Email : {c.email}</span>}
              {c.callCenter && <span className="block">Call Center : {c.callCenter}</span>}
            </p>
            <hr className="my-2.5 border-[#e3e6ea]" />
            <p className="text-[11.5px] font-semibold text-[#4a5058]">ช่องทางชำระเงิน</p>
            <p className="text-[11.5px] leading-[1.75] text-[#5a6069]">
              ชื่อบัญชี: {c.bankAccountName}
              <span className="block">{c.bankName}</span>
              <span className="block">เลขที่บัญชี {c.bankAccountNo}</span>
            </p>
            <p className="mt-2.5 text-[11px] text-[#8a9099]">{c.vat ? "คิดภาษีมูลค่าเพิ่ม" : "ไม่คิดภาษีมูลค่าเพิ่ม"}</p>
          </div>
        </Card>
      </div>

      <ConfirmDialog
        open={Boolean(attDel)}
        title="ลบรูปเอกสารแนบ"
        description={`ลบ “${docs.find((f) => f.id === attDel)?.title || docs.find((f) => f.id === attDel)?.name || ""}” ออกจากเอกสารแนบของผู้ออกรายนี้ — มีผลหลังกดบันทึก`}
        confirmLabel="ลบรูป"
        tone="destructive"
        onCancel={() => setAttDel("")}
        onConfirm={() => {
          update({ docs: docs.filter((x) => x.id !== attDel) });
          setAttDel("");
        }}
      />

      {attEdit && c.docs?.some((f) => f.id === attEdit) && (
        <AttSheet
          file={c.docs.find((f) => f.id === attEdit)!}
          onClose={() => setAttEdit("")}
          onSave={(next) => {
            update({ docs: (c.docs ?? []).map((x) => (x.id === next.id ? next : x)) });
            setAttEdit("");
          }}
        />
      )}

      <SaveBar
        dirty={d.dirty}
        isDefault={d.isDefault}
        invalid={problemOf(list)}
        onSave={d.save}
        onCancel={() => {
          d.cancel();
          setSelCode(d.saved[0]?.code ?? "");
        }}
        onDefault={() => {
          d.toDefault();
          setSelCode("MAZ");
        }}
      />
    </div>
  );
}

/** กล่องแก้รายละเอียดเอกสารแนบ — ชื่อที่ลูกค้าเห็น ประเภท และวันหมดอายุ (ต้นแบบ HR-18) */
function AttSheet({
  file,
  onClose,
  onSave,
}: {
  file: IssuerDoc;
  onClose: () => void;
  onSave: (next: IssuerDoc) => void;
}) {
  const [title, setTitle] = useState(file.title ?? file.name);
  const [cat, setCat] = useState(file.cat ?? ATT_CATS[0].k);
  const [expires, setExpires] = useState(file.expires ?? "");
  const bad = !title.trim() ? "กรอกชื่อเอกสารที่ลูกค้าจะเห็น" : "";

  return (
    <Sheet
      title="แก้ไขเอกสารแนบ"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => onSave({ ...file, title: title.trim(), cat, expires })}
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-3">
        <p className="rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
          ไฟล์ <b className="font-semibold text-foreground">{file.name}</b> · {fileSize(file.size)}
        </p>
        <Input2 label="ประเภทเอกสาร">
          <select value={cat} onChange={(e) => setCat(e.target.value)} className={inputCls}>
            {ATT_CATS.map((x) => (
              <option key={x.k} value={x.k}>
                {x.label}
              </option>
            ))}
          </select>
        </Input2>
        <Input2 label="ชื่อเอกสารที่ลูกค้าจะเห็น" error={bad || undefined}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
        </Input2>
        <Input2 label="วันหมดอายุของเอกสาร (ถ้ามี)">
          <DateField
            value={expires}
            onChange={setExpires}
            label="วันหมดอายุของเอกสาร"
            placeholder="ไม่มีวันหมดอายุ"
            className="h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Input2>
        {cat === "idcard" && (
          <p className="rounded-[11px] border border-[var(--warning)]/30 bg-[var(--warning-soft)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--warning)]">
            สำเนาบัตรประชาชนมีข้อมูลส่วนบุคคล ลูกค้าทุกรายที่ได้รับใบเสนอราคาจะเห็นไฟล์นี้ — ปิดข้อมูลที่ไม่จำเป็นและเขียนกำกับว่าใช้เพื่อการใดก่อนแนบ
          </p>
        )}
      </div>
    </Sheet>
  );
}

/*
 * ลายเซ็นและตราประทับของผู้ออกเอกสาร (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * ผู้มีอำนาจลงนามหนึ่งคนต่อผู้ออกเอกสาร — รูปลายเซ็น + ชื่อ + ตำแหน่ง · ตราประทับบริษัท (ถ้ามี)
 * แสดงบนใบเสนอราคา (ช่องผู้เสนอราคา) และหนังสือรับรอง 50 ทวิ (ช่องผู้จ่ายเงิน) อัตโนมัติ
 * แก้แล้วยังไม่มีผลจนกดบันทึกที่แถบด้านล่าง — ผ่านประวัติการตั้งค่าเหมือนช่องอื่น
 */
function SignCard({ issuer: c, update }: { issuer: Issuer; update: (patch: Partial<Issuer>) => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState<SigKey | "">("");
  const [del, setDel] = useState<SigKey | "">("");
  const signRef = useRef<HTMLInputElement>(null);
  const stampRef = useRef<HTMLInputElement>(null);

  async function pick(k: SigKey, file: File) {
    setErr("");
    if (!IMG_TYPES.includes(file.type) && !IMG_EXT.test(file.name)) {
      setErr(`รับเฉพาะไฟล์รูปภาพ (PNG JPG WEBP) — ${file.name} ไม่ใช่รูป`);
      return;
    }
    setBusy(k);
    try {
      const img = await readImage(file, { maxSide: SIG_MAX_SIDE, keepAlpha: true });
      const size = dataBytes(img.src);
      if (size > SIG_MAX_BYTES) {
        setErr(`${file.name} ย่อแล้วยังใหญ่ ${fileSize(size)} เกิน ${fileSize(SIG_MAX_BYTES)} — ครอปให้เหลือเฉพาะ${k === "sign" ? "ลายเซ็น" : "ตรา"}แล้วลองใหม่`);
        return;
      }
      const next: IssuerImage = { src: img.src, w: img.w, h: img.h, name: file.name, size };
      update({ [k]: next });
    } catch {
      setErr(`เปิดรูป ${file.name} ไม่ได้ — ไฟล์อาจเสียหรือไม่ใช่รูปภาพ`);
    } finally {
      setBusy("");
    }
  }

  const slot = (k: SigKey, ref: React.RefObject<HTMLInputElement | null>, hint: string) => {
    const img = c[k];
    return (
      <div className="rounded-[11px] border border-border bg-card p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <b className="text-[13px] font-semibold">
            {SIG_LABEL[k]}
            {k === "stamp" && <span className="ml-1 font-normal text-muted-foreground">(ถ้ามี)</span>}
          </b>
        </div>
        <div className="grid h-[120px] place-items-center rounded-[9px] border border-dashed border-border bg-white">
          {img ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={img.src} alt={SIG_LABEL[k]} className="max-h-[108px] max-w-[92%] object-contain" />
          ) : (
            <span className="text-[12px] text-[#5a6069]">ยังไม่มีรูป</span>
          )}
        </div>
        <p className="mt-1.5 truncate text-[11.5px] text-muted-foreground">
          {img ? `${img.name} · ${img.w}×${img.h}px · ${fileSize(img.size)}` : hint}
        </p>
        <input
          ref={ref}
          type="file"
          accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void pick(k, f);
          }}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className="btn glass-thin" disabled={Boolean(busy)} onClick={() => ref.current?.click()}>
            {busy === k ? "กำลังย่อรูป…" : img ? "เปลี่ยนรูป" : "เลือกรูป"}
          </button>
          {img && (
            <button type="button" className="btn glass-thin text-destructive" onClick={() => setDel(k)}>
              <TrashIcon className="size-4" strokeWidth={1.9} />
              ลบรูป
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card title="ลายเซ็นและตราประทับ" note="ผู้มีอำนาจลงนามหนึ่งคน · PNG JPG WEBP">
      <p className="mb-3 rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
        แสดงบนใบเสนอราคา (ช่องผู้เสนอราคา) และหนังสือรับรองการหักภาษี ณ ที่จ่าย 50 ทวิ (ช่องผู้จ่ายเงิน) ที่ออกในนามผู้ออกรายนี้โดยอัตโนมัติ
        <span className="mt-0.5 block text-[11.5px]">
          ใช้ PNG พื้นโปร่งใสจะสวยที่สุด · ย่อให้ด้านยาวไม่เกิน {SIG_MAX_SIDE}px · หลังย่อไม่เกิน {fileSize(SIG_MAX_BYTES)} · ไม่มีรูป = เอกสารไม่มีลายเซ็น
        </span>
      </p>
      {err && (
        <p role="alert" className="mb-3 rounded-[11px] border border-destructive/30 bg-[var(--destructive-soft)] px-3 py-2.5 text-[12.5px] text-destructive">
          {err}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {slot("sign", signRef, "เซ็นบนกระดาษขาวแล้วถ่าย/สแกน ครอปเฉพาะลายเซ็น")}
        {slot("stamp", stampRef, "ไม่ใส่ก็ได้ — เอกสารจะไม่มีตรา")}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Input2 label={LABEL.signName}>
          <input value={c.signName ?? ""} onChange={(e) => update({ signName: e.target.value })} placeholder="เช่น นายสมชาย ใจดี" className={inputCls} />
        </Input2>
        <Input2 label={LABEL.signTitle}>
          <input value={c.signTitle ?? ""} onChange={(e) => update({ signTitle: e.target.value })} placeholder="เช่น กรรมการผู้จัดการ" className={inputCls} />
        </Input2>
      </div>

      {/* ตัวอย่างช่องลงนามบนเอกสาร — วาดจากร่าง */}
      <p className="mt-4 mb-1.5 text-[12px] font-semibold text-muted-foreground">ตัวอย่างช่องผู้เสนอราคาบนใบเสนอราคา</p>
      <div className="rounded-[10px] border border-border bg-white px-4 py-3.5 text-[#25292f]">
        <div className="mx-auto max-w-[240px] text-center">
          <b className="block text-xs font-semibold">ผู้เสนอราคา</b>
          <SignPreview issuer={c} />
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(del)}
        title={del ? `ลบ${SIG_LABEL[del]}` : ""}
        description={`เอกสารที่เปิดดูหรือพิมพ์หลังบันทึกจะไม่มี${del === "stamp" ? "ตราประทับ" : "ลายเซ็น"}ของ ${c.code} — มีผลหลังกดบันทึก`}
        confirmLabel="ลบรูป"
        tone="destructive"
        onCancel={() => setDel("")}
        onConfirm={() => {
          if (del) update({ [del]: undefined });
          setDel("");
        }}
      />
    </Card>
  );
}

/** ตัวอย่างลายเซ็นในหน้าตั้งค่า — หน้าตาเดียวกับช่องผู้เสนอราคาใน quotation-paper.tsx */
function SignPreview({ issuer: c }: { issuer: Issuer }) {
  return (
    <>
      <div className="relative h-[60px]">
        {c.stamp && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={c.stamp.src} alt="" className="absolute right-0 bottom-[-18px] h-[72px] w-[72px] object-contain opacity-90 mix-blend-multiply" />
        )}
        {c.sign && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={c.sign.src} alt="" className="absolute bottom-0 left-1/2 h-[56px] max-w-[85%] -translate-x-1/2 object-contain mix-blend-multiply" />
        )}
      </div>
      <span className="block h-px bg-[#8a9099]" />
      {c.signName?.trim() && <p className="mt-1 text-[11.5px]">({c.signName.trim()})</p>}
      {c.signTitle?.trim() && <p className="text-[11px] text-[#5a6069]">{c.signTitle.trim()}</p>}
    </>
  );
}
