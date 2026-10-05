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

import { useState } from "react";
import { bkkNow, thaiDate, todayIso } from "@/lib/format";
import type { Issuer, IssuerDoc } from "@/lib/system-settings";
import { useCrm } from "@/lib/crm-store";
import { AdminHead, Card, Input2, SaveBar, Switch, inputCls, useSectionDraft } from "./admin-ui";
import { FileDrop } from "./file-drop";
import { Sheet } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";
import { PencilIcon, PlusIcon, PrintIcon, TrashIcon } from "./icons";

type TextKey = "label" | "name" | "taxId" | "address" | "phone" | "email" | "callCenter" | "bankName" | "bankAccountName" | "bankAccountNo" | "prefix";

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
};

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
  }
  for (const x of a) if (!b.some((y) => y.code === x.code)) out.push(`ลบผู้ออกเอกสาร ${x.code} ${x.name}`);
  return out;
}

function problemOf(list: Issuer[]) {
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
  { k: "idcard", label: "สำเนาบัตรประชาชน" },
  { k: "other", label: "อื่น ๆ" },
];
const ATT_MAX = 10;
const ATT_MB = 5;

/** แนบไปกับใบเสนอราคาตอนนี้ไหม — เปิดแนบไว้และยังไม่หมดอายุ */
function attachedNow(f: { attach?: boolean; expires?: string }) {
  return Boolean(f.attach) && !(f.expires && f.expires < todayIso());
}

function fileSize(n: number) {
  return n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1048576).toFixed(1)} MB`;
}

export function AdminCompanyPage() {
  const d = useSectionDraft("issuers", "ข้อมูลบริษัท", describe);
  const crm = useCrm();
  const list = d.draft;
  const [selCode, setSelCode] = useState(list[0]?.code ?? "");
  /* กล่องเพิ่มไฟล์ / กล่องแก้รายละเอียดไฟล์แนบ */
  const [attAdd, setAttAdd] = useState(false);
  const [attEdit, setAttEdit] = useState("");
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

  return (
    <div className="space-y-4">
      <AdminHead
        title="ข้อมูลผู้ออกเอกสาร"
        desc="ผู้ออกเอกสาร — หัวกระดาษ บัญชีรับเงิน และการจด VAT ของแต่ละรายที่ใบเสนอราคาเลือก ‘ออกในนาม’ ได้"
      />

      {/* ── รายการผู้ออกเอกสาร ── */}
      <div className="flex flex-wrap items-center gap-2">
        {list.map((x) => (
          <button
            key={x.code}
            type="button"
            aria-pressed={x.code === c.code}
            onClick={() => setSelCode(x.code)}
            className={`flex h-10 items-center gap-2 rounded-[12px] border px-3.5 text-[13px] font-semibold ${
              x.code === c.code ? "border-primary bg-primary text-white" : "border-border bg-card hover:border-primary"
            }`}
          >
            <span className="num">{x.code}</span>
            <span className={`max-w-[220px] truncate font-normal ${x.code === c.code ? "text-white/85" : "text-muted-foreground"}`}>
              {x.name || "(ยังไม่ตั้งชื่อ)"}
            </span>
          </button>
        ))}
        <button type="button" className="btn solid btn-solid h-10" onClick={add}>
          <PlusIcon className="size-4" strokeWidth={2.4} />
          เพิ่มผู้ออกเอกสาร
        </button>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <Card
            title={`ผู้ออกเอกสาร ${c.code}`}
            note={used ? `ออกใบเสนอราคาไปแล้ว ${used} ใบ — ลบไม่ได้ และเปลี่ยนรหัสไม่ได้` : isNew ? "รายใหม่ — ยังไม่ได้บันทึก" : "ยังไม่เคยออกใบเสนอราคา"}
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
              <Input2 label="รหัส" hint={isNew ? "อังกฤษตัวใหญ่/ตัวเลข" : "ตั้งได้ตอนเพิ่มเท่านั้น"}>
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
              <Input2 label={LABEL.label} hint="ขึ้นในดรอปดาวน์ตอนสร้างใบเสนอราคา">
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
              <Input2 label={LABEL.callCenter} hint="เว้นว่าง = ไม่พิมพ์บรรทัด Call Center บนเอกสาร">
                <input value={c.callCenter ?? ""} onChange={set("callCenter")} className={inputCls} />
              </Input2>
              <Input2 label="ภาษีมูลค่าเพิ่ม" hint="ไม่จด VAT = ใบเสนอราคาในนามนี้ไม่คิด VAT">
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
              <Input2 label={LABEL.address} hint="ขึ้นบรรทัดใหม่ได้ บนเอกสารจะแสดงตามบรรทัดที่พิมพ์" className="sm:col-span-2">
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
            เอกสารแนบใบเสนอราคา (ต้นแบบ HR-18) — ไฟล์ที่แนบไปกับใบเสนอราคาของผู้ออกรายนี้
            แนบอัตโนมัติได้ · ตั้งวันหมดอายุได้ · หมดอายุแล้วระบบหยุดแนบให้เอง
          */}
          <Card
            title="เอกสารแนบใบเสนอราคา"
            note={`${(c.docs ?? []).length} / ${ATT_MAX} ไฟล์ · PDF รูปภาพ Word หรือ Excel · ยังไม่มีที่เก็บไฟล์จริง ระบบจำแค่ชื่อไฟล์ไว้ก่อน`}
            aside={
              <button
                type="button"
                className="btn solid btn-solid"
                disabled={(c.docs ?? []).length >= ATT_MAX}
                title={(c.docs ?? []).length >= ATT_MAX ? `แนบได้ไม่เกิน ${ATT_MAX} ไฟล์` : undefined}
                onClick={() => setAttAdd(true)}
              >
                <PlusIcon className="size-4" strokeWidth={2.4} />
                เพิ่มไฟล์
              </button>
            }
          >
            <p className="mb-3 rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
              แนบกับใบเสนอราคา{" "}
              <b className="font-semibold text-foreground">
                {(c.docs ?? []).filter(attachedNow).length
                  ? `${(c.docs ?? []).filter(attachedNow).length} ไฟล์`
                  : "ไม่มีไฟล์"}
              </b>
              {(c.docs ?? []).filter(attachedNow).length > 0 &&
                ` · ${(c.docs ?? []).filter(attachedNow).map((f) => f.title || f.name).join(" · ")}`}
            </p>

            {(c.docs ?? []).length === 0 ? (
              <p className="py-6 text-center text-[13px] text-muted-foreground">
                ยังไม่มีเอกสารแนบ กดเพิ่มไฟล์ เช่น หนังสือรับรองบริษัท หรือใบประกอบการ
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-[14px] border border-border bg-card">
                {(c.docs ?? []).map((f) => {
                  const dead = Boolean(f.expires && f.expires < todayIso());
                  return (
                    <li key={f.id} className="grid grid-cols-[minmax(0,1fr)_58px_84px] items-center gap-2 px-3.5 py-2.5 sm:grid-cols-[40px_minmax(0,1fr)_110px_58px_84px]">
                      <span className="flex size-10 items-center justify-center rounded-[11px] bg-muted text-muted-foreground max-sm:hidden">
                        <PrintIcon className="size-5" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0">
                        <b className={`block truncate text-[13.5px] ${attachedNow(f) ? "font-semibold" : "font-medium text-muted-foreground"}`}>
                          {f.title || f.name}
                        </b>
                        <small className="block truncate text-[11.5px] text-muted-foreground">
                          {[ATT_CATS.find((x) => x.k === f.cat)?.label, f.name, fileSize(f.size)].filter(Boolean).join(" · ")}
                        </small>
                        <small className="block text-[11.5px] text-muted-foreground">
                          {f.addedAt ? `เพิ่มเมื่อ ${thaiDate(f.addedAt)}` : "เพิ่มไว้ก่อนมีช่องวันที่"}
                          {f.expires && (dead ? ` · หมดอายุ ${thaiDate(f.expires)}` : ` · หมดอายุ ${thaiDate(f.expires)}`)}
                        </small>
                      </span>
                      <span className="text-center max-sm:hidden">
                        {dead ? (
                          <em className="rounded-full bg-destructive/10 px-2.5 py-1 text-[12px] font-semibold text-destructive not-italic">
                            หมดอายุ
                          </em>
                        ) : f.attach ? (
                          <em className="rounded-full bg-[#E7F5EE] px-2.5 py-1 text-[12px] font-semibold text-[#14875A] not-italic">
                            แนบอัตโนมัติ
                          </em>
                        ) : (
                          <em className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-semibold text-muted-foreground not-italic">
                            ไม่แนบ
                          </em>
                        )}
                      </span>
                      <span className="flex justify-center">
                        <Switch
                          on={Boolean(f.attach) && !dead}
                          disabled={dead}
                          title={dead ? "เอกสารหมดอายุแล้ว ระบบไม่แนบให้" : undefined}
                          onToggle={() => update({ docs: (c.docs ?? []).map((x) => (x.id === f.id ? { ...x, attach: !x.attach } : x)) })}
                          label={`แนบ ${f.title || f.name} ไปกับใบเสนอราคา`}
                        />
                      </span>
                      <span className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          aria-label={`แก้ไข ${f.title || f.name}`}
                          className="btn glass-thin btn-mini"
                          onClick={() => setAttEdit(f.id)}
                        >
                          <PencilIcon className="size-4" strokeWidth={2.2} />
                        </button>
                        <button
                          type="button"
                          aria-label={`ลบ ${f.title || f.name}`}
                          className="btn glass-thin btn-mini"
                          onClick={() => update({ docs: (c.docs ?? []).filter((x) => x.id !== f.id) })}
                        >
                          <TrashIcon className="size-4" strokeWidth={2.2} />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            {attAdd && (
              <div className="mt-3">
                <FileDrop
                  files={(c.docs ?? []).map((f) => ({ id: f.id, name: f.name, size: f.size }))}
                  onChange={(picked) => {
                    /* ไฟล์ที่เพิ่งเลือกเข้ามาให้ตั้งค่าเริ่มต้นเป็นแนบอัตโนมัติ และจำวันที่เพิ่ม */
                    const had = new Map((c.docs ?? []).map((f) => [f.id, f]));
                    update({
                      docs: picked.map((f) => had.get(f.id) ?? { ...f, title: f.name.replace(/\.[^.]+$/, ""), cat: ATT_CATS[0].k, attach: true, addedAt: todayIso() }),
                    });
                    setAttAdd(false);
                  }}
                  hint={`ไฟล์ละไม่เกิน ${ATT_MB} MB · สูงสุด ${ATT_MAX} ไฟล์`}
                  accept=".pdf,image/*,.doc,.docx,.xls,.xlsx"
                  label="เลือกไฟล์แนบ"
                />
              </div>
            )}
          </Card>
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
        <Input2 label="วันหมดอายุของเอกสาร (ถ้ามี)" hint="หมดอายุแล้วระบบหยุดแนบให้เอง">
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
