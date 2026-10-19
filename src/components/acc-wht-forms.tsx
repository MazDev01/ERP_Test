"use client";

/*
 * แบบฟอร์มกรมสรรพากรของภาษีที่ MAZ หักผู้ให้บริการภายนอก (ผู้ใช้สั่ง 9 ต.ค. 2569)
 *   หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ   /acc/wht/cert   (?id= เปิดรายการเดิม · &edit=1 แก้ไข)
 *   ออกใหม่ตามประเภทผู้ถูกหักภาษี ?type=juristic (นิติบุคคล · ภ.ง.ด.53) | individual (บุคคลธรรมดา · ภ.ง.ด.3)
 *   บริษัทไม่ใช้ใบแนบ ภ.ง.ด.3 / ภ.ง.ด.53 — ถอดหน้า /acc/wht/pnd ออกแล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569)
 *   TODO: เจ้าของจะส่งภาพแบบฟอร์มของบริษัทแยกตามประเภท (นิติบุคคล / บุคคลธรรมดา) มาภายหลัง — ตอนนี้ใช้แบบ 50 ทวิ เดิมไปก่อน
 *
 * ผู้มีหน้าที่หักภาษี = บริษัทเราเสมอ อ่านจากข้อมูลบริษัทในตั้งค่าระบบ แก้บนแบบไม่ได้
 * ผู้ถูกหักภาษี = ผู้ให้บริการภายนอก ไม่ใช่ลูกค้า — ตัวช่วยเลือกชื่อดึงจากรายการหัก ณ ที่จ่ายเดิมเท่านั้น
 * กรอก/ออกเลขได้เฉพาะฝ่ายบัญชี บทบาทอื่นเปิดดูและพิมพ์ได้อย่างเดียว
 */

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  WHT_COND,
  WHT_PAYEE,
  kindOfPayee,
  payeeOfKind,
  whtAmount,
  whtFormRow,
  whtType,
  whtTypes,
  type WhtCond,
  type WhtFormRow,
  type WhtKind,
  type WhtPayee,
  type WhtRow,
} from "@/lib/acc-data";
import { issueWht, newWhtId, useAcc } from "@/lib/acc-store";
import { baht, bahtText, commaInput, todayIso } from "@/lib/format";
import { useHydrated } from "@/lib/pwa";
import { useRole } from "@/lib/role";
import { useLiveSettings } from "@/lib/system-settings";
import { BackLink } from "./acc-doc";
import { useAddOption } from "./add-option";
import { DownloadIcon, EditIcon, PrintIcon } from "./icons";
import { DateField } from "./thai-date-picker";
import { Select } from "./ui";

// ─── ส่วนร่วม ─────────────────────────────────────────────────────

/** "2026-10-05" → "05/10/2569" แบบที่กรอกบนแบบฟอร์มกรมสรรพากร */
function dmy(iso: string) {
  if (!iso) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}`;
}

/** ตัวเลขบนแบบ — ศูนย์เว้นว่างไว้ ไม่พิมพ์ 0.00 ลงช่องที่ไม่ได้ใช้ */
function amt(n: number) {
  return n ? baht(n) : "";
}

function num(s: string) {
  return Number(s.replace(/,/g, "")) || 0;
}

/** ช่องตัวเลขทีละหลักแบบราชการ — เลขผู้เสียภาษี 13 หลักแบ่ง 1-4-5-2-1 */
function Digits({ value, groups = [1, 4, 5, 2, 1] }: { value: string; groups?: number[] }) {
  const d = value.replace(/\D/g, "");
  const starts = groups.map((_, gi) => groups.slice(0, gi).reduce((x, y) => x + y, 0));
  return (
    <span className="digits num">
      {groups.map((g, gi) => (
        <span key={gi} className="inline-flex">
          {gi > 0 && <b />}
          {Array.from({ length: g }, (_, i) => (
            <i key={i}>{d[starts[gi] + i] ?? ""}</i>
          ))}
        </span>
      ))}
    </span>
  );
}

function Ck({ on, onClick, label }: { on: boolean; onClick?: () => void; label: React.ReactNode }) {
  return (
    <span className="mr-3 inline-flex items-center whitespace-nowrap">
      {onClick ? (
        <button type="button" className="ck" aria-pressed={on} onClick={onClick}>
          {on ? "✓" : ""}
        </button>
      ) : (
        <span className="ck">{on ? "✓" : ""}</span>
      )}
      {label}
    </span>
  );
}

/** เลขสาขาของบริษัทเรา — ชื่อในตั้งค่าระบุสำนักงานใหญ่ = 00000 */
function branchOf(name: string) {
  return /สำนักงานใหญ่/.test(name) ? "00000" : "";
}

/**
 * กรอบกระดาษ — ย่อทั้งแผ่นให้พอดีความกว้างจอ (เหมือน PaperFit ของ acc-doc แต่รองรับแนวนอน)
 * ตอนสั่งพิมพ์ปิดการย่อ · โหมดกรอก (scroll) ไม่ย่อ เลื่อนซ้ายขวาแทน ช่องกรอกจะได้ไม่เล็กจนแตะไม่ได้
 */
function FitSheet({ width, scroll, children }: { width: number; scroll?: boolean; children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el || scroll) return;
    let printing = false;
    const fit = () => {
      const z = Math.min(1, el.clientWidth / width);
      setZoom(!printing && z < 1 ? z : 0);
    };
    const before = () => {
      printing = true;
      fit();
    };
    const after = () => {
      printing = false;
      fit();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      ro.disconnect();
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, [width, scroll]);

  return (
    <div ref={box} className={`w-full ${scroll ? "overflow-x-auto print-block" : ""}`}>
      <div
        className="flex flex-col items-center gap-5"
        style={zoom ? { zoom, width } : scroll ? { minWidth: width } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function PrintButtons() {
  return (
    <>
      <button type="button" className="btn glass-thin" onClick={() => window.print()}>
        <PrintIcon className="size-[15px]" strokeWidth={1.9} />
        พิมพ์
      </button>
      <button type="button" className="btn solid btn-solid btn-block-mobile shrink-0" onClick={() => window.print()}>
        <DownloadIcon className="size-[15px]" strokeWidth={2} />
        ดาวน์โหลด PDF
      </button>
    </>
  );
}

/**
 * รายการของแบบ ภ.ง.ด. หนึ่งเดือน เรียงตามวันที่จ่าย — ลำดับนี้คือ "ลำดับที่ ... ในแบบ" บนหนังสือรับรอง
 * (บริษัทไม่ใช้ใบแนบแล้ว แต่ช่องนี้ยังอยู่บนแบบ 50 ทวิ ของกรมสรรพากร)
 */
function pndList(wht: WhtRow[], kind: WhtKind, ym: string) {
  return wht
    .filter((r) => r.kind === kind && r.date.slice(0, 7) === ym)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.no || "~").localeCompare(b.no || "~") || a.id.localeCompare(b.id));
}

function useCompany() {
  const s = useLiveSettings();
  const c = s.company;
  /*
   * ลายเซ็น/ตราประทับของผู้จ่ายเงิน = ผู้ออกเอกสารที่เป็นบริษัทบนหนังสือรับรอง (ผู้ใช้สั่ง 16 ต.ค. 2569)
   * ตั้งต้น MAZ · ไม่มี MAZ ใช้รายที่เลขผู้เสียภาษีตรงกับข้อมูลบริษัท · ไม่มีอีกใช้รายแรก
   */
  const iss =
    s.issuers.find((i) => i.code === "MAZ") ?? s.issuers.find((i) => i.taxId && i.taxId === c.taxId) ?? s.issuers[0];
  return {
    name: c.name,
    taxId: c.taxId,
    address: c.address.replace(/\s*\n\s*/g, " "),
    sign: iss?.sign?.src ?? "",
    stamp: iss?.stamp?.src ?? "",
    signName: iss?.sign ? (iss.signName?.trim() ?? "") : "",
    signTitle: iss?.sign ? (iss.signTitle?.trim() ?? "") : "",
  };
}

// ─── หนังสือรับรอง 50 ทวิ ─────────────────────────────────────────

type Form = {
  id: string;
  name: string;
  tax: string;
  addr: string;
  kind: WhtKind;
  type: string;
  date: string;
  base: string;
  rate: string;
  cond: WhtCond;
  condNote: string;
  gpf: string;
  sso: string;
  pvd: string;
  no: string;
  issued: string;
};

/** preset = ประเภทผู้ถูกหักภาษีที่เลือกจากปุ่ม "+ ยื่นภาษี" ใช้กับใบใหม่เท่านั้น (ผู้ใช้สั่ง 16 ต.ค. 2569) */
function formOf(r: WhtRow | undefined, preset?: WhtPayee): Form {
  const type = r?.type ?? "service";
  const money = (n: number | undefined) => (n ? commaInput(String(n)) : "");
  return {
    id: r?.id ?? "",
    name: r?.name ?? "",
    tax: r?.tax ?? "",
    addr: r?.addr ?? "",
    kind: r?.kind ?? kindOfPayee(preset ?? "juristic"),
    type,
    date: r?.date ?? todayIso(),
    base: money(r?.base),
    rate: String(r?.rate ?? whtType(type).rate),
    cond: r?.cond ?? 1,
    condNote: r?.condNote ?? "",
    gpf: money(r?.gpf),
    sso: money(r?.sso),
    pvd: money(r?.pvd),
    no: r?.no ?? "",
    issued: r?.issued ?? "",
  };
}

const INCOME: { key?: WhtFormRow; text: string; pad?: number }[] = [
  { key: "1", text: "1. เงินเดือน ค่าจ้าง เบี้ยเลี้ยง โบนัส ฯลฯ ตามมาตรา 40 (1)" },
  { key: "2", text: "2. ค่าธรรมเนียม ค่านายหน้า ฯลฯ ตามมาตรา 40 (2)" },
  { key: "3", text: "3. ค่าแห่งลิขสิทธิ์ ฯลฯ ตามมาตรา 40 (3)" },
  { key: "4a", text: "4. (ก) ดอกเบี้ย ฯลฯ ตามมาตรา 40 (4) (ก)" },
  { key: "4b", text: "(ข) เงินปันผล เงินส่วนแบ่งกำไร ฯลฯ ตามมาตรา 40 (4) (ข)", pad: 1 },
  {
    text: "(1) กรณีผู้ได้รับเงินปันผลได้รับเครดิตภาษี โดยจ่ายจากกำไรสุทธิของกิจการที่ต้องเสียภาษีเงินได้นิติบุคคลในอัตราดังนี้",
    pad: 2,
  },
  { text: "(1.1) อัตราร้อยละ 30 ของกำไรสุทธิ", pad: 3 },
  { text: "(1.2) อัตราร้อยละ 25 ของกำไรสุทธิ", pad: 3 },
  { text: "(1.3) อัตราร้อยละ 20 ของกำไรสุทธิ", pad: 3 },
  { text: "(1.4) อัตราอื่น ๆ (ระบุ) ............ ของกำไรสุทธิ", pad: 3 },
  { text: "(2) กรณีผู้ได้รับเงินปันผลไม่ได้รับเครดิตภาษี เนื่องจากจ่ายจาก", pad: 2 },
  { text: "(2.1) กำไรสุทธิของกิจการที่ได้รับยกเว้นภาษีเงินได้นิติบุคคล", pad: 3 },
  {
    text: "(2.2) เงินปันผลหรือเงินส่วนแบ่งของกำไรที่ได้รับยกเว้นไม่ต้องนำมารวมคำนวณเป็นรายได้เพื่อเสียภาษีเงินได้นิติบุคคล",
    pad: 3,
  },
  { text: "(2.3) กำไรสุทธิส่วนที่ได้หักผลขาดทุนสุทธิยกมาไม่เกิน 5 ปี ก่อนรอบระยะเวลาบัญชีปีปัจจุบัน", pad: 3 },
  { text: "(2.4) กำไรที่รับรู้ทางบัญชีโดยวิธีส่วนได้เสีย (equity method)", pad: 3 },
  { text: "(2.5) อื่น ๆ (ระบุ) ............", pad: 3 },
  {
    key: "5",
    text: "5. การจ่ายเงินได้ที่ต้องหักภาษี ณ ที่จ่าย ตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส เช่น รางวัล ส่วนลดหรือประโยชน์ใด ๆ เนื่องจากการส่งเสริมการขาย รางวัลในการประกวด การแข่งขัน การชิงโชค ค่าแสดงของนักแสดงสาธารณะ ค่าจ้างทำของ ค่าโฆษณา ค่าเช่า ค่าขนส่ง ค่าบริการ ค่าเบี้ยประกันวินาศภัย ฯลฯ",
  },
  { key: "6", text: "6. อื่น ๆ (ระบุ)" },
];

const PND_BOXES: { label: string; kind?: WhtKind }[] = [
  { label: "(1) ภ.ง.ด.1ก" },
  { label: "(2) ภ.ง.ด.1ก พิเศษ" },
  { label: "(3) ภ.ง.ด.2" },
  { label: "(4) ภ.ง.ด.3", kind: "3" },
  { label: "(5) ภ.ง.ด.2ก" },
  { label: "(6) ภ.ง.ด.3ก" },
  { label: "(7) ภ.ง.ด.53", kind: "53" },
];

type Bad = { name: boolean; tax: boolean; base: boolean };

function CertPaper({
  f,
  copy,
  seq,
  set,
  bad,
  vendors = [],
}: {
  f: Form;
  copy: 1 | 2;
  seq: number;
  /** มี = โหมดกรอก ช่องของผู้ถูกหักภาษีและจำนวนเงินกลายเป็นช่องกรอกบนแบบ */
  set?: (patch: Partial<Form>) => void;
  bad?: Bad;
  vendors?: WhtRow[];
}) {
  const co = useCompany();
  const base = num(f.base);
  const rate = num(f.rate);
  const tax = whtAmount({ base, rate });
  const row = whtFormRow(f.type);
  const label = whtType(f.type).label;
  const [b1, b2] = [copy === 1, copy === 2];
  const year = f.no.match(/-(\d{4})-/)?.[1] ?? "";

  const text = (k: "name" | "addr", style: React.CSSProperties, ph = "") =>
    set ? (
      <input
        value={f[k]}
        list={k === "name" ? "wht-vendors" : undefined}
        placeholder={ph}
        className={bad?.[k as "name"] ? "bad" : ""}
        style={style}
        onChange={(e) => {
          const v = e.target.value;
          /* เลือกชื่อผู้ให้บริการที่เคยหักไว้ — เติมเลขผู้เสียภาษี ที่อยู่ และประเภทผู้ถูกหักตามรายการล่าสุด */
          const hit = k === "name" ? vendors.find((x) => x.name === v) : undefined;
          set(hit ? { name: v, tax: hit.tax, addr: hit.addr ?? f.addr, kind: hit.kind } : { [k]: v });
        }}
      />
    ) : (
      <span className="dot" style={style}>
        {f[k]}
      </span>
    );

  const money = (k: "base" | "gpf" | "sso" | "pvd", w: number) =>
    set ? (
      <input
        value={f[k]}
        inputMode="decimal"
        placeholder="0.00"
        className={k === "base" && bad?.base ? "bad num" : "num"}
        style={{ width: w, textAlign: "right" }}
        onChange={(e) => set({ [k]: commaInput(e.target.value) })}
      />
    ) : (
      <span className="dot num" style={{ minWidth: w, textAlign: "right" }}>
        {amt(num(f[k]))}
      </span>
    );

  return (
    <article className="paper rd-form">
      <div className="flex items-start justify-between gap-4" style={{ fontSize: 10.5 }}>
        <div>
          <p className={b1 ? "font-bold" : ""}>ฉบับที่ 1 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย ใช้แนบพร้อมกับแบบแสดงรายการภาษี)</p>
          <p className={b2 ? "font-bold" : ""}>ฉบับที่ 2 (สำหรับผู้ถูกหักภาษี ณ ที่จ่าย เก็บไว้เป็นหลักฐาน)</p>
        </div>
        <span className="bx px-2 py-0.5 font-bold whitespace-nowrap">ฉบับที่ {copy}</span>
      </div>

      <div className="bx mt-2">
        <div className="relative px-3 pt-2 pb-1.5 text-center">
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h2>
          <p style={{ fontSize: 12.5, fontWeight: 600 }}>ตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร</p>
          <div className="absolute top-2 right-3 text-left" style={{ fontSize: 11 }}>
            <p>
              เล่มที่ <span className="dot num" style={{ minWidth: 70 }}>{year}</span>
            </p>
            <p>
              เลขที่ <span className="dot num" style={{ minWidth: 120 }}>{f.no}</span>
            </p>
          </div>
        </div>

        {/* ผู้มีหน้าที่หักภาษี = บริษัทเรา แก้บนแบบไม่ได้ */}
        <div className="bt px-3 py-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <b>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย :-</b>
            <span className="inline-flex items-center gap-2">
              เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* <Digits value={co.taxId} />
            </span>
          </div>
          <p className="mt-1 flex gap-2">
            <span className="whitespace-nowrap">ชื่อ</span>
            <span className="dot flex-1">{co.name}</span>
          </p>
          <p style={{ fontSize: 9.5 }}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</p>
          <p className="flex gap-2">
            <span className="whitespace-nowrap">ที่อยู่</span>
            <span className="dot flex-1">{co.address}</span>
          </p>
          <p style={{ fontSize: 9.5 }}>
            (ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)
          </p>
        </div>

        {/* ผู้ถูกหักภาษี = ผู้ให้บริการภายนอก */}
        <div className="bt px-3 py-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <b>ผู้ถูกหักภาษี ณ ที่จ่าย :-</b>
            <span className="inline-flex items-center gap-2">
              {/* บุคคลธรรมดาใช้เลขประจำตัวประชาชน นิติบุคคลใช้เลขทะเบียนนิติบุคคล (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
              {f.kind === "3" ? "เลขประจำตัวประชาชน (13 หลัก)*" : "เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)*"}
              {set ? (
                <input
                  value={f.tax}
                  inputMode="numeric"
                  maxLength={13}
                  placeholder={f.kind === "3" ? "เลขบัตรประชาชน 13 หลัก" : "เลขนิติบุคคล 13 หลัก"}
                  className={`num ${bad?.tax ? "bad" : ""}`}
                  style={{ width: 150, letterSpacing: "0.12em" }}
                  onChange={(e) => set({ tax: e.target.value.replace(/\D/g, "").slice(0, 13) })}
                />
              ) : (
                <Digits value={f.tax} />
              )}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-2">
            <span className="whitespace-nowrap">ชื่อ</span>
            {text("name", { flex: 1 }, "ชื่อผู้ให้บริการ")}
          </p>
          <p style={{ fontSize: 9.5 }}>(ให้ระบุว่าเป็น บุคคล นิติบุคคล บริษัท สมาคม หรือคณะบุคคล)</p>
          <p className="flex items-center gap-2">
            <span className="whitespace-nowrap">ที่อยู่</span>
            {text("addr", { flex: 1 }, "ที่อยู่ผู้ให้บริการ")}
          </p>
          <p style={{ fontSize: 9.5 }}>
            (ให้ระบุ ชื่ออาคาร/หมู่บ้าน ห้องเลขที่ ชั้นที่ เลขที่ ตรอก/ซอย หมู่ที่ ถนน ตำบล/แขวง อำเภอ/เขต จังหวัด)
          </p>
        </div>

        <div className="bt px-3 py-1.5">
          <div className="flex flex-wrap items-center gap-y-1">
            <span className="mr-3 inline-flex items-center gap-1.5 whitespace-nowrap">
              ลำดับที่ <span className="bx num inline-block text-center" style={{ minWidth: 34 }}>{seq || ""}</span> ในแบบ
            </span>
            {PND_BOXES.map((p) => (
              <Ck
                key={p.label}
                label={p.label}
                on={p.kind === f.kind}
                onClick={set && p.kind ? () => set({ kind: p.kind }) : undefined}
              />
            ))}
          </div>
          <p style={{ fontSize: 9.5 }}>
            (ให้สามารถอ้างอิงหรือสอบยันกันได้ระหว่างลำดับที่ตามหนังสือรับรองฯ กับแบบยื่นรายการภาษีหักที่จ่าย)
          </p>
        </div>

        <table className="inc" style={{ borderLeft: "none", borderRight: "none" }}>
          <thead>
            <tr>
              <th style={{ borderLeft: "none" }}>ประเภทเงินได้พึงประเมินที่จ่าย</th>
              <th style={{ width: 92 }}>วัน เดือน หรือปีภาษี ที่จ่าย</th>
              <th style={{ width: 112 }}>จำนวนเงินที่จ่าย</th>
              <th style={{ width: 104, borderRight: "none" }}>
                ภาษีที่หัก
                <br />
                และนำส่งไว้
              </th>
            </tr>
          </thead>
          <tbody style={{ fontSize: 10.5 }}>
            {INCOME.map((x) => {
              const on = x.key === row;
              return (
                <tr key={x.text}>
                  <td style={{ borderLeft: "none", paddingLeft: 6 + (x.pad ?? 0) * 14, paddingTop: 1, paddingBottom: 1 }}>
                    {x.text}
                    {on && (x.key === "5" || x.key === "6") && (
                      <span className="dot ml-1 font-semibold">
                        {label} {rate ? `(ร้อยละ ${rate})` : ""}
                      </span>
                    )}
                  </td>
                  <td className="c num" style={{ paddingTop: 1, paddingBottom: 1 }}>
                    {on ? dmy(f.date) : ""}
                  </td>
                  <td className="r num" style={{ paddingTop: 1, paddingBottom: 1 }}>
                    {on ? set ? money("base", 98) : amt(base) : ""}
                  </td>
                  <td className="r num" style={{ borderRight: "none", paddingTop: 1, paddingBottom: 1 }}>
                    {on ? amt(tax) : ""}
                  </td>
                </tr>
              );
            })}
            <tr className="tot">
              <td className="r font-semibold" style={{ borderLeft: "none" }} colSpan={2}>
                รวมเงินที่จ่ายและภาษีที่หักนำส่ง
              </td>
              <td className="r num font-semibold">{amt(base)}</td>
              <td className="r num font-semibold" style={{ borderRight: "none" }}>
                {amt(tax)}
              </td>
            </tr>
            <tr className="tot">
              <td style={{ borderLeft: "none", borderRight: "none" }} colSpan={4}>
                <span className="font-semibold">รวมเงินภาษีที่หักนำส่ง (ตัวอักษร)</span>
                <span className="dot ml-2 font-semibold" style={{ minWidth: 380 }}>
                  {tax ? `(${bahtText(tax)})` : ""}
                </span>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="px-3 py-1.5" style={{ fontSize: 10.5 }}>
          <span className="mr-1">เงินที่จ่ายเข้า</span>
          <span className="mr-3 inline-flex items-center gap-1 whitespace-nowrap">
            กบข./กสจ./กองทุนสงเคราะห์ครูโรงเรียนเอกชน {money("gpf", 78)} บาท
          </span>
          <span className="mr-3 inline-flex items-center gap-1 whitespace-nowrap">
            กองทุนประกันสังคม {money("sso", 78)} บาท
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap">
            กองทุนสำรองเลี้ยงชีพ {money("pvd", 78)} บาท
          </span>
        </div>

        <div className="bt flex flex-wrap items-center gap-y-1 px-3 py-1.5">
          <b className="mr-3">ผู้จ่ายเงิน</b>
          {([1, 2, 3, 4] as const).map((c) => (
            <Ck
              key={c}
              on={f.cond === c}
              onClick={set ? () => set({ cond: c }) : undefined}
              label={`(${c}) ${WHT_COND[c]}${c === 4 ? " (ระบุ)" : ""}`}
            />
          ))}
          {f.cond === 4 &&
            (set ? (
              <input value={f.condNote} style={{ width: 140 }} onChange={(e) => set({ condNote: e.target.value })} />
            ) : (
              <span className="dot" style={{ minWidth: 120 }}>
                {f.condNote}
              </span>
            ))}
        </div>

        <div className="bt grid" style={{ gridTemplateColumns: "1fr 1.35fr" }}>
          <div className="br px-3 py-2" style={{ fontSize: 10.5 }}>
            <b>คำเตือน</b>
            <p className="mt-1">
              ผู้มีหน้าที่ออกหนังสือรับรองการหักภาษี ณ ที่จ่าย ฝ่าฝืนไม่ปฏิบัติตามมาตรา 50 ทวิ แห่งประมวลรัษฎากร
              ต้องรับโทษทางอาญาตามมาตรา 35 แห่งประมวลรัษฎากร
            </p>
          </div>
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="flex-1 text-center">
              <p style={{ fontSize: 10.5 }}>ขอรับรองว่าข้อความและตัวเลขดังกล่าวข้างต้นถูกต้องตรงกับความจริงทุกประการ</p>
              <p className="mt-6">
                ลงชื่อ{" "}
                {/* รูปลายเซ็นวางเหนือเส้นประ ไม่ดันความสูงของแบบ — ใช้ <img> ให้พิมพ์ติด (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
                <span className="dot" style={{ minWidth: 170, position: "relative" }}>
                  {co.sign && (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={co.sign}
                      alt="ลายเซ็นผู้จ่ายเงิน"
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: 2,
                        transform: "translateX(-50%)",
                        height: 40,
                        maxWidth: 190,
                        objectFit: "contain",
                        mixBlendMode: "multiply",
                      }}
                    />
                  )}
                </span>{" "}
                ผู้จ่ายเงิน
              </p>
              {/* แบบ 50 ทวิ ไม่มีช่องชื่อ/ตำแหน่ง — เขียนในวงเล็บใต้ลายเซ็นตามที่นิยม เฉพาะเมื่อมีลายเซ็น (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
              {(co.signName || co.signTitle) && (
                <p style={{ fontSize: 10 }}>
                  {co.signName && `(${co.signName})`}
                  {co.signName && co.signTitle && " "}
                  {co.signTitle}
                </p>
              )}
              <p className="mt-2">
                <span className="dot num" style={{ minWidth: 150 }}>
                  {dmy(f.issued || (f.no ? f.date : ""))}
                </span>
              </p>
              <p style={{ fontSize: 10 }}>(วัน เดือน ปี ที่ออกหนังสือรับรองฯ)</p>
            </div>
            <div className="stamp">
              {co.stamp ? (
                /* ตราประทับบริษัทจากตั้งค่า วางในวงกลมช่องประทับตรา (ผู้ใช้สั่ง 16 ต.ค. 2569) */
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={co.stamp}
                  alt="ตราประทับนิติบุคคล"
                  style={{ width: 70, height: 70, objectFit: "contain", mixBlendMode: "multiply" }}
                />
              ) : (
                <>
                  ประทับตรา
                  <br />
                  นิติบุคคล
                  <br />
                  (ถ้ามี)
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <p className="mt-1.5" style={{ fontSize: 9.5 }}>
        หมายเหตุ เลขประจำตัวผู้เสียภาษีอากร (13 หลัก)* หมายถึง 1. กรณีบุคคลธรรมดาไทย ให้ใช้เลขประจำตัวประชาชนของกรมการปกครอง
        2. กรณีนิติบุคคล ให้ใช้เลขทะเบียนนิติบุคคลของกรมพัฒนาธุรกิจการค้า 3. กรณีอื่น ๆ นอกเหนือจาก 1. และ 2.
        ให้ใช้เลขประจำตัวผู้เสียภาษีอากร (13 หลัก) ของกรมสรรพากร
      </p>

      {set && (
        <datalist id="wht-vendors">
          {vendors.map((v) => (
            <option key={v.tax + v.name} value={v.name} />
          ))}
        </datalist>
      )}
    </article>
  );
}

export function AccWhtCertPage() {
  const acc = useAcc();
  const router = useRouter();
  const params = useSearchParams();
  const readOnly = useRole() !== "acc";
  const id = params.get("id") ?? "";
  const row = id ? acc.wht.find((r) => r.id === id) : undefined;
  /* ใบใหม่เปิดจากตัวเลือกประเภทบนหน้ายื่นภาษี ?type=juristic|individual — ไม่ระบุถือเป็นนิติบุคคล (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const preset: WhtPayee = params.get("type") === "individual" ? "individual" : "juristic";
  const editing = !readOnly && (!id || (row ? !row.no || params.get("edit") === "1" : false));
  /* รายการและบทบาทอยู่ใน localStorage — รอเบราว์เซอร์อ่านก่อน ช่องกรอกจะได้ไม่ตั้งต้นจากข้อมูลตั้งต้นของเซิร์ฟเวอร์ */
  const hydrated = useHydrated();

  if (!hydrated) return null;
  if (id && !row) {
    return <Missing text="ไม่พบรายการนี้" />;
  }
  if (!id && readOnly) {
    return <Missing text="ออกหนังสือรับรองได้เฉพาะฝ่ายบัญชี" />;
  }
  /* key ตามรายการ — เปิดรายการอื่นแล้วช่องกรอกตั้งต้นใหม่ */
  return editing ? (
    <CertEditor key={id || `new-${preset}`} row={row} preset={preset} onDone={(rid) => router.replace(`/acc/wht/cert?id=${encodeURIComponent(rid)}`)} />
  ) : (
    <CertView row={row!} readOnly={readOnly} />
  );
}

function Missing({ text }: { text: string }) {
  return (
    <div className="bar">
      <div className="flex min-w-0 items-start gap-3">
        <BackLink href="/acc/wht" label="กลับไปหน้าหัก ณ ที่จ่าย" />
        <div className="min-w-0">
          <h1>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
          <p>{text}</p>
        </div>
      </div>
    </div>
  );
}

function seqOf(wht: WhtRow[], r: Pick<WhtRow, "id" | "kind" | "date" | "no">) {
  const list = pndList([...wht.filter((w) => w.id !== r.id), r as WhtRow], r.kind, r.date.slice(0, 7));
  return list.findIndex((w) => w.id === r.id) + 1;
}

function CertView({ row, readOnly }: { row: WhtRow; readOnly: boolean }) {
  const acc = useAcc();
  const f = formOf(row);
  const seq = seqOf(acc.wht, row);
  return (
    <div className="space-y-4">
      <div className="bar no-print">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <BackLink href={`/acc/wht?month=${row.date.slice(0, 7)}`} label="กลับไปหน้าหัก ณ ที่จ่าย" />
          <div className="min-w-0">
            <h1 className="num">{row.no || "หนังสือรับรอง 50 ทวิ"}</h1>
            <p>{row.name}</p>
            <p className="text-[12.5px]">หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) · {WHT_PAYEE[row.payeeType]}</p>
          </div>
          {row.no ? (
            <span className="tag t-ok mt-1">
              <i />
              ออกแล้ว
            </span>
          ) : (
            <span className="tag t-late mt-1">
              <i />
              ยังไม่ได้ออก
            </span>
          )}
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          {!readOnly && (
            <Link href={`/acc/wht/cert?id=${encodeURIComponent(row.id)}&edit=1`} className="btn glass-thin">
              <EditIcon className="size-[15px]" strokeWidth={1.9} />
              แก้ไข
            </Link>
          )}
          <PrintButtons />
        </div>
      </div>
      <FitSheet width={794}>
        <CertPaper f={f} copy={1} seq={seq} />
        <CertPaper f={f} copy={2} seq={seq} />
      </FitSheet>
    </div>
  );
}

function CertEditor({
  row,
  preset,
  onDone,
}: {
  row: WhtRow | undefined;
  preset: WhtPayee;
  onDone: (id: string) => void;
}) {
  const acc = useAcc();
  const [f, setF] = useState<Form>(() => formOf(row, preset));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }));
  const addType = useAddOption({ catalog: "whtTypes" }, (v) => set({ type: v, rate: String(whtType(v).rate) }));

  /* ผู้ให้บริการที่เคยหักไว้ — รายการล่าสุดของแต่ละเลขผู้เสียภาษี ไม่ดึงจากลูกค้าในระบบขาย */
  const vendors = [...acc.wht]
    .sort((a, b) => b.date.localeCompare(a.date))
    .filter((r, i, all) => r.tax && all.findIndex((x) => x.tax === r.tax) === i);

  const base = num(f.base);
  const rate = num(f.rate);
  const bad: Bad = { name: tried && !f.name.trim(), tax: tried && f.tax.length !== 13, base: tried && base <= 0 };
  const invalid = !f.name.trim() || f.tax.length !== 13 || base <= 0;
  const id = f.id || "";
  const seq = seqOf(acc.wht, { id: id || "__draft", kind: f.kind, date: f.date, no: f.no });
  const back = row ? `/acc/wht/cert?id=${encodeURIComponent(row.id)}` : `/acc/wht?month=${f.date.slice(0, 7)}`;

  const save = () => {
    setTried(true);
    if (invalid) return;
    const rid = f.id || newWhtId();
    const money = (s: string) => Math.round(num(s) * 100) / 100 || undefined;
    issueWht({
      id: rid,
      date: f.date,
      name: f.name.trim(),
      tax: f.tax,
      kind: f.kind,
      payeeType: payeeOfKind(f.kind),
      type: f.type,
      base: Math.round(base * 100) / 100,
      rate,
      no: f.no,
      addr: f.addr.trim() || undefined,
      cond: f.cond,
      condNote: f.cond === 4 ? f.condNote.trim() || undefined : undefined,
      issued: f.issued || undefined,
      gpf: money(f.gpf),
      sso: money(f.sso),
      pvd: money(f.pvd),
    });
    onDone(rid);
  };

  return (
    <div className="space-y-4">
      <div className="bar no-print">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <BackLink href={back} label={row ? "กลับไปหน้าเอกสาร" : "กลับไปหน้าหัก ณ ที่จ่าย"} />
          <div className="min-w-0">
            <h1 className="num">{f.no || `ออกหนังสือรับรอง 50 ทวิ · ${WHT_PAYEE[payeeOfKind(f.kind)]}`}</h1>
            <p>หนังสือรับรองการหักภาษี ณ ที่จ่าย ตามมาตรา 50 ทวิ</p>
          </div>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <Link href={back} className="btn glass-thin">
            ยกเลิก
          </Link>
          <button type="button" className="btn solid btn-solid btn-block-mobile shrink-0" onClick={save}>
            {f.no ? "บันทึก" : "บันทึกและออกเลขที่"}
          </button>
        </div>
      </div>

      <section className="glass no-print flex flex-wrap items-end gap-3 rounded-[15px] px-4 py-3">
        {/* ประเภทผู้ถูกหักภาษีเลือกแล้วตอนกด "+ ยื่นภาษี" — สลับในหน้านี้ไม่ได้ (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
        <label className="grid gap-1 text-[12.5px] font-medium" style={{ minWidth: 220 }}>
          ประเภทเงินได้
          <Select
            value={f.type}
            onChange={(e) => {
              if (addType.pick(e.target.value)) return;
              set({ type: e.target.value, rate: String(whtType(e.target.value).rate) });
            }}
            className="h-[38px]"
          >
            {whtTypes().map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} ({t.rate}%)
              </option>
            ))}
            {addType.option}
          </Select>
        </label>
        {addType.dialog}
        {/* อัตราภาษีมาจากประเภทเงินได้ ไม่มีช่องให้แก้เอง (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
        <div className="grid gap-1 text-[12.5px] font-medium" style={{ width: 170 }}>
          วันที่จ่ายเงิน
          <DateField value={f.date} onChange={(iso) => set({ date: iso })} label="วันที่จ่ายเงิน" className="h-[38px] rounded-[10px] text-[13.5px]" />
        </div>
        <div className="ml-auto text-right text-[12.5px]">
          <span className="block text-muted-foreground">ภาษีที่หักและนำส่ง</span>
          <b className="num text-[16px] font-bold">{baht(whtAmount({ base, rate }))} บาท</b>
        </div>
        {tried && invalid && (
          <p className="w-full text-[12.5px] font-semibold text-destructive">
            {[
              !f.name.trim() && "ชื่อผู้ให้บริการ",
              f.tax.length !== 13 && (f.kind === "3" ? "เลขประจำตัวประชาชน 13 หลัก" : "เลขประจำตัวผู้เสียภาษี 13 หลัก"),
              base <= 0 && "จำนวนเงินที่จ่าย",
            ]
              .filter(Boolean)
              .join(" · ")}{" "}
            ยังไม่ครบ
          </p>
        )}
      </section>

      <FitSheet width={794} scroll>
        <CertPaper f={f} copy={1} seq={seq} set={set} bad={bad} vendors={vendors} />
      </FitSheet>
    </div>
  );
}
