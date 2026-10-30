"use client";

/*
 * กระดาษสลิปเงินเดือน A4 — แบบเดียวกับตัวอย่างที่เจ้าของส่งมา (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * ใช้ร่วมกันระหว่างหน้าสลิปของฝ่ายบุคคล (hr-payslip-page) กับสลิปของฉัน (my-payslip-page)
 * สองแบบในกระดาษใบเดียว: พนักงานรายเดือน (ประจำเดือน/ปี) · ทดลองงานจ่ายรายวัน (วันที่ออกสลิป)
 *
 * ตัวเลขทุกช่องมาจากผลการคำนวณเงินเดือน (PaySlipCalc / ยอดที่บันทึกตอนปิดรอบ) ไม่คิดเงินใหม่
 *   - รายการเงินได้/รายการหักที่กรอกเองลงบรรทัดตามคีย์ 1:1 (pay.items) ไม่เดาจากชื่อแล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569)
 *   - ภาษีหัก ณ ที่จ่าย 3% อ่านค่าที่บันทึกไว้ (pay.wht) — รอบเก่าที่ไม่มีค่านี้เว้นว่าง ไม่คิดย้อน
 * ที่คิดเพิ่มในไฟล์นี้มีแค่ "แยก" ยอดให้ลงบรรทัดตามแบบ:
 *   - ค่าล่วงเวลาแยก 1.5 / 2 / 3 เท่า จากชั่วโมงในรอบเวลา — แยกแล้วต้องรวมได้เท่ายอดโอทีที่บันทึกไว้
 *     ไม่เท่า (เวลาถูกแก้หลังปิดรอบ) ลงยอดเดียวที่ "ค่าล่วงเวลาอื่นๆ" ไม่พิมพ์ชั่วโมง
 *   - นาทีมาสายกับอัตราต่อนาที — คูณกันแล้วต้องได้ยอดหักที่บันทึกไว้ ไม่งั้นไม่พิมพ์นาที/อัตรา
 */

import { useEffect, useRef } from "react";
import { baht, thaiDateLong, thaiMonth, todayIso } from "@/lib/format";
import { issuerOf } from "@/lib/crm-data";
import {
  baseSalaryIn,
  calcOfLine,
  dailyRateIn,
  dailyRoundRange,
  isWeekRange,
  rangeLabel,
  hourly,
  hrPos,
  hrCycle,
  hrOtRate,
  inPeriod,
  inRange,
  isDaily,
  guaranteeHeld,
  isDailyRoundKey,
  lateDeduction,
  lateMin,
  otKindAt,
  payOf,
  PAY_CUT_ITEMS,
  PAY_INCOME_ITEMS,
  recInRange,
  workedDaysIn,
  type ComSource,
  type Cycle,
  type CycleLine,
  type Employee,
  type PaySlipCalc,
  type TimeRec,
} from "@/lib/hr-data";

import type { useHr } from "@/lib/hr-store";

type Hr = ReturnType<typeof useHr>;
type Time = Record<string, TimeRec>;

function r2(v: number) {
  return Math.round(v * 100) / 100;
}

/** ตัวเลขไม่มีทศนิยมถ้าเป็นจำนวนเต็ม — "910" · "2.5" */
function num(v: number) {
  return v.toLocaleString("th-TH", { maximumFractionDigits: 2 });
}

/** ช่วงวันของรอบ — รอบเดือน "yyyy-mm" หรือรอบจ่ายรายวัน "จาก~ถึง" */
export function slipRange(key: string): Cycle {
  return isDailyRoundKey(key) ? dailyRoundRange(key) : hrCycle(key);
}

/** วันสิ้นรอบ — ใช้จัดลำดับและนับยอดสะสมปีปฏิทิน */
export function slipPayDate(key: string) {
  return slipRange(key).to;
}

export type SlipInput = {
  emp: Employee;
  /** คีย์รอบ — "yyyy-mm" หรือ "จาก~ถึง" */
  key: string;
  /** สลิปทดลองงานจ่ายรายวัน */
  day: boolean;
  pay: PaySlipCalc;
  days: number;
  rate: number;
  time: Time;
};

export type SlipCell = { label: string; qty: string; amt: number };

/**
 * ค่าล่วงเวลาแยกตามเท่า — 1.5 วันทำงาน · 2 วันหยุด · 3 วันแรงงาน
 * แยกไม่ลง (ยอดไม่เท่ายอดที่บันทึกไว้) = split false ยอดทั้งก้อนอยู่ที่ ot3
 * ใช้ร่วมกับตารางสรุปเงินเดือน (ผู้ใช้สั่ง 16 ต.ค. 2569)
 */
export function otSplit(emp: Employee, c: Cycle, time: Time, otTotal: number) {
  const rec = recInRange(time, emp.id, c);
  const full = baseSalaryIn(emp, c);
  const otRate = hrOtRate(c.to);
  const hrs = { after_work: 0, holiday: 0, public: 0 };
  for (const o of rec.ot) hrs[otKindAt(o)] += o.h;
  const raw = {
    after_work: hourly(full) * otRate.after_work * hrs.after_work,
    holiday: hourly(full) * otRate.holiday * hrs.holiday,
    public: hourly(full) * otRate.public * hrs.public,
  };
  const split = Math.abs(raw.after_work + raw.holiday + raw.public - otTotal) < 0.05;
  let ot15 = 0;
  let ot2 = 0;
  let ot3 = otTotal;
  if (split) {
    /* ปัดทีละก้อน แล้วให้ก้อนสุดท้ายที่มีชั่วโมงรับเศษสตางค์ ยอดรวมจะเท่ายอดที่บันทึกไว้พอดี */
    ot15 = r2(raw.after_work);
    ot2 = r2(raw.holiday);
    ot3 = r2(otTotal - ot15 - ot2);
    if (!hrs.public) {
      if (hrs.holiday) ot2 = r2(ot2 + ot3);
      else ot15 = r2(ot15 + ot3);
      ot3 = 0;
    }
  }
  return { split, hrs, ot15, ot2, ot3 };
}

/**
 * แถวรายได้และรายการหักของสลิปหนึ่งใบ — ครบทุกบรรทัดตามแบบเสมอ (ศูนย์ = ช่องจำนวนเงินว่าง)
 * บวกลบได้เสมอ: รวมเงินได้ − รวมรายการหัก + ค่าใช้จ่ายคืน = เงินรับสุทธิ
 */
export function slipModel(x: SlipInput) {
  const { emp, key, day, pay, days, rate, time } = x;
  const c = slipRange(key);
  const it = pay.items;
  const ot = otSplit(emp, c, time, pay.ot);
  const hq = (h: number) => (ot.split && h ? `${num(h)} H` : "");

  /* มาสาย — นาที × อัตราต่อนาที ต้องได้ยอดที่บันทึกไว้ ถึงจะพิมพ์นาทีกับอัตรา */
  const lm = lateMin(recInRange(time, emp.id, c));
  const lc = lateDeduction(emp, c, lm);
  const lateOk = lm > 0 && pay.late > 0 && Math.abs(lc.amount - pay.late) < 0.01;

  /* รายการที่กรอกเองลงบรรทัดตามคีย์ 1:1 · ค่า commission = ค่าคอมจากยอดขาย (คิดอัตโนมัติ) + ที่กรอกเพิ่ม */
  const income: SlipCell[] = [
    day
      ? { label: `ค่าจ้าง (วันละ ${num(rate)} บาท)`, qty: `${num(days)} วัน`, amt: pay.base }
      : { label: "เงินเดือน", qty: "", amt: pay.base },
    { label: "ค่าล่วงเวลา 1.5 เท่า", qty: hq(ot.hrs.after_work), amt: ot.ot15 },
    { label: "ค่าล่วงเวลา 2.0 เท่า", qty: hq(ot.hrs.holiday), amt: ot.ot2 },
    { label: "ค่าล่วงเวลาอื่นๆ", qty: hq(ot.hrs.public), amt: ot.ot3 },
    ...PAY_INCOME_ITEMS.map(({ k, label }) => ({
      label,
      qty: "",
      amt: k === "commission" ? r2(pay.com + (it[k] ?? 0)) : (it[k] ?? 0),
    })),
  ];
  const earn = r2(income.reduce((a, y) => a + y.amt, 0));

  const lateLabel = day
    ? "หัก มาสาย"
    : `หัก ค่าจ้าง (มาสาย)${lateOk ? ` (${lc.perMin.toFixed(2)} บาท/นาที)` : ""}`;
  const cuts: SlipCell[] = [
    { label: lateLabel, qty: lateOk ? `${num(lm)} นาที` : "", amt: pay.late },
    ...PAY_CUT_ITEMS.map(({ k, label }) => ({ label, qty: "", amt: it[k] ?? 0 })),
    /* ทดลองงานไม่หักประกันสังคม — บรรทัดยังอยู่ ช่องว่าง */
    { label: "หัก สมทบประกันสังคม", qty: "", amt: day ? 0 : pay.ss },
    /* ภาษีที่บันทึกไว้ตอนคำนวณ/ปิดรอบ · รายเดือนและรอบเก่าที่ไม่มีค่านี้ = ว่าง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    { label: "หัก ภาษีหัก ณ ที่จ่าย 3%", qty: "", amt: pay.wht },
  ];
  const cutTotal = r2(cuts.reduce((a, y) => a + y.amt, 0));
  const reimb = pay.reimb ?? 0;
  return {
    cycle: c,
    income,
    cuts,
    earn,
    cut: cutTotal,
    wht: pay.wht,
    ss: day ? 0 : pay.ss,
    guaranteeBack: it.guaranteeBack ?? 0,
    reimb,
    /* ยอดสุทธิที่คำนวณ/บันทึกไว้ — บรรทัดข้างบนบวกลบแล้วได้เท่านี้ */
    net: pay.net,
  };
}

export type SlipModel = ReturnType<typeof slipModel>;

/* ─── สลิปที่เผยแพร่แล้วของคนหนึ่ง (ย้ายมาจาก my-payslip-page) ─── */

export type PublishedSlip = { key: string; line: CycleLine; day: boolean; at: string };

/**
 * บรรทัดของคนหนึ่งในรอบเดือนหนึ่ง — ใช้ยอดที่บันทึกไว้ตอนปิดรอบก่อน
 * ไม่มี snapshot (รอบที่ปิดไว้ก่อนระบบเก็บยอด) จึงคิดสดด้วยสูตรเดียวกับฝ่ายบุคคล
 */
export function monthLineOf(hr: Hr, me: Employee, month: string, time: Time, src: ComSource): CycleLine | null {
  const run = hr.payruns.find((p) => p.month === month);
  const saved = run?.sum?.lines.find((x) => x.id === me.id);
  /* snapshot รุ่นเก่าไม่ได้เก็บค่าคอม/ค่าตอบแทนพิเศษ/เบี้ยเลี้ยง — เติมเฉพาะช่องที่ขาด ตัวเลขที่บันทึกไว้แล้วไม่แตะ */
  if (saved && saved.gross !== undefined) return saved;
  if (saved) {
    const c = payOf(me, month, time, hr.extras, src);
    return {
      ...saved,
      com: saved.com ?? c.com,
      inc: saved.inc ?? c.inc,
      allow: saved.allow ?? c.allow,
    };
  }
  if (!run || !run.closed) return null;
  const c = payOf(me, month, time, hr.extras, src);
  return {
    id: me.id,
    name: me.name,
    pos: me.pos,
    base: c.base,
    ot: c.ot,
    com: c.com,
    inc: c.inc,
    allow: c.allow,
    more: c.more,
    gross: c.gross,
    items: c.items,
    adj: c.adj,
    ss: c.ss,
    late: c.late,
    wht: c.wht,
    reimb: c.reimb,
    net: c.net,
    days: 0,
    rate: 0,
  };
}

/**
 * สลิปที่เผยแพร่แล้วทั้งหมดของคนหนึ่ง เรียงใหม่ไปเก่า
 * ทดลองงาน = รอบจ่ายรายวัน · ผ่านทดลองงานกลางรอบมีทั้งสองแบบ (ผู้ใช้สั่ง 13 ต.ค. 2569)
 */
export function publishedSlips(hr: Hr, me: Employee, time: Time, src: ComSource): PublishedSlip[] {
  const rows: PublishedSlip[] = [];
  if (me.type === "intern") return rows;
  if (me.type === "probat" || me.probPass) {
    for (const r of hr.dailyRounds) {
      if (!r.published || !inRange(me, r) || !isDaily(me, r)) continue;
      const line = r.sum?.lines.find((x) => x.id === me.id);
      if (!line) continue;
      rows.push({ key: r.id, line, day: true, at: r.publishedAt });
    }
  }
  if (me.type !== "probat") {
    for (const sp of hr.slips.filter((x) => !isDaily(me, hrCycle(x.month)))) {
      if (!sp.published || !inPeriod(me, sp.month)) continue;
      const line = monthLineOf(hr, me, sp.month, time, src);
      if (!line) continue;
      rows.push({ key: sp.month, line, day: false, at: sp.publishedAt });
    }
  }
  rows.sort((a, b) => slipRange(b.key).to.localeCompare(slipRange(a.key).to));
  return rows;
}

/** ข้อมูลเข้า slipModel จากบรรทัดที่บันทึกไว้ */
export function inputOfLine(emp: Employee, s: PublishedSlip, time: Time): SlipInput {
  const c = slipRange(s.key);
  return {
    emp,
    key: s.key,
    day: s.day,
    pay: calcOfLine(s.line),
    days: s.day && !s.line.days ? workedDaysIn(emp, c, time) : s.line.days,
    rate: s.day && !s.line.rate ? dailyRateIn(emp, c) : s.line.rate,
    time,
  };
}

export type SlipYtd = { gross: number; tax: number; ss: number; guarantee: number };

/**
 * ยอดสะสมปีปฏิทินของวันจ่าย — สลิปที่เผยแพร่แล้วก่อนใบนี้ในปีเดียวกัน + ใบนี้
 * ใบนี้อาจยังไม่เผยแพร่ (ฝ่ายบุคคลเปิดตรวจก่อนส่ง) จึงบวกจากตัวเลขของใบนี้เองเสมอ
 * เงินสะสมประกันผลงาน = ยอดสะสมต่อเนื่องข้ามปี ไม่ใช่ยอดของปีนี้ (ผู้ใช้สั่ง 30 ต.ค. 2569)
 * เงินประกันที่คืนเป็นเงินของพนักงานเอง ไม่นับเป็นรายได้สะสม
 */
export function slipYtd(hr: Hr, emp: Employee, time: Time, src: ComSource, key: string, cur: SlipModel): SlipYtd {
  const at = slipPayDate(key);
  const year = at.slice(0, 4);
  const guaranteeMonth = isDailyRoundKey(key) ? dailyRoundRange(key).to.slice(0, 7) : key;
  const sum: SlipYtd = {
    gross: r2(cur.earn - cur.guaranteeBack),
    tax: cur.wht,
    ss: cur.ss,
    guarantee: guaranteeHeld(emp, guaranteeMonth, hr.extras),
  };
  for (const s of publishedSlips(hr, emp, time, src)) {
    const d = slipPayDate(s.key);
    if (s.key === key || d.slice(0, 4) !== year || d > at) continue;
    const m = slipModel(inputOfLine(emp, s, time));
    sum.gross += m.earn - m.guaranteeBack;
    sum.tax += m.wht;
    sum.ss += m.ss;
  }
  return { gross: r2(sum.gross), tax: r2(sum.tax), ss: r2(sum.ss), guarantee: r2(sum.guarantee) };
}

/**
 * วันที่บนสลิปทดลองงาน = วันที่ฝ่ายบุคคลเผยแพร่สลิปของรอบนั้น
 * ยังไม่เผยแพร่ = วันที่จะออก คือวันนี้ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 */
export function slipIssueDate(publishedAt: string | undefined) {
  return publishedAt || todayIso();
}

/* ─── พิมพ์ / บันทึก PDF ─── */

/** พิมพ์เฉพาะกระดาษสลิปที่เปิดอยู่ในกล่อง (ดู .print-slip ใน globals.css) */
export function printSlip() {
  document.body.classList.add("print-slip");
  window.print();
  window.setTimeout(() => document.body.classList.remove("print-slip"), 400);
}

/** เปิดกล่องแล้วสั่งพิมพ์ทันที (ปุ่มดาวน์โหลดบนการ์ดมือถือ — แบบเดียวกับ ?pdf=1 ของเอกสารอื่น) */
export function useAutoPrint(on: boolean) {
  const done = useRef(false);
  useEffect(() => {
    if (!on || done.current) return;
    done.current = true;
    const t = window.setTimeout(printSlip, 400);
    return () => window.clearTimeout(t);
  }, [on]);
}

/* ─── กระดาษ ─── */

const HEAD_BG = "bg-[#a9c4f5]";
const BD = "border border-[#3a4048]";

function amt(v: number) {
  return v ? baht(v) : "";
}

export function PayslipPaper({
  emp,
  input,
  model: m,
  ytd,
}: {
  emp: Employee;
  /** at = วันที่เผยแพร่สลิปของรอบรายวัน — ว่าง = ยังไม่เผยแพร่ ใช้วันนี้ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  input: Pick<SlipInput, "key" | "day"> & { at?: string };
  model: SlipModel;
  ytd: SlipYtd;
}) {
  /* หัวกระดาษจากผู้ออกเอกสารตั้งต้น MAZ (/admin/company) — ไม่มีช่องโลโก้ในการตั้งค่า จึงใช้ตรา MAZ ของระบบ */
  const co = issuerOf("MAZ");
  const maz = co.code === "MAZ";
  const address = co.address.split("\n").filter(Boolean).join(" ");
  const [monthName, beYear] = thaiMonth(input.key.slice(0, 7)).split(" ");
  const rows = Math.max(m.income.length, m.cuts.length);
  const weekly = input.day && isDailyRoundKey(input.key) && isWeekRange(dailyRoundRange(input.key));

  return (
    <article className="ps-paper mx-auto w-[794px] max-w-none bg-white px-[44px] py-[40px] text-[12.5px] leading-[1.55] text-[#1f2328] shadow-sm">
      <header className="flex items-start justify-between gap-6">
        <div className="pt-1">
          {maz ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/maz-logo.png" alt={co.name} className="h-[44px] w-auto" />
          ) : (
            <p className="text-[20px] leading-tight font-extrabold">{co.name}</p>
          )}
        </div>
        <div className="max-w-[60%] text-right font-bold">
          {/* ทดลองงานจ่ายรายสัปดาห์ — หัวสลิปบอกว่าเป็นค่าจ้างรายสัปดาห์ (ผู้ใช้สั่ง 19 ต.ค. 2569) · รอบรายวันเก่าใช้หัวเดิม */}
          <h2 className="text-[15px]">
            {weekly ? "สลิปค่าจ้างรายสัปดาห์" : "ใบจ่ายเงินเดือน/ค่าจ้าง/เงินประจำตำแหน่ง"}
          </h2>
          <p>โปรดตรวจสอบและเก็บเป็นหลักฐานในการติดต่อการเงินและบัญชี</p>
          <p>{co.name} (สำนักงานใหญ่)</p>
          {address && <p>{address}</p>}
          <p className="num">เลขผู้เสียภาษี : {co.taxId || "—"}</p>
        </div>
      </header>

      <div className="mt-3 h-[2px] bg-[#d71920]" />

      <div className="mt-3 flex items-start justify-between gap-6 font-semibold">
        <dl className="grid grid-cols-[90px_auto] gap-x-3">
          <dt>ชื่อพนักงาน</dt>
          <dd>{emp.name}</dd>
          <dt>ตำแหน่ง</dt>
          <dd>{hrPos(emp.pos).label}</dd>
        </dl>
        {input.day ? (
          <dl className="grid grid-cols-[80px_auto] gap-x-3">
            {/* ช่วงสัปดาห์ของรอบจ่าย + วันที่ออกสลิป (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
            <dt>{weekly ? "สัปดาห์" : "ช่วงวันที่"}</dt>
            <dd className="num">{rangeLabel(dailyRoundRange(input.key))}</dd>
            <dt>วันที่จ่าย</dt>
            <dd className="num">{thaiDateLong(slipIssueDate(input.at))}</dd>
          </dl>
        ) : (
          <dl className="grid grid-cols-[80px_auto] gap-x-3">
            <dt>ประจำเดือน</dt>
            <dd>{monthName}</dd>
            <dt>ปี</dt>
            <dd className="num">{beYear}</dd>
          </dl>
        )}
      </div>

      <table className={`mt-3 w-full border-collapse ${BD}`} style={{ printColorAdjust: "exact", WebkitPrintColorAdjust: "exact" }}>
        <colgroup>
          <col />
          <col style={{ width: 62 }} />
          <col style={{ width: 92 }} />
          <col />
          <col style={{ width: 62 }} />
          <col style={{ width: 86 }} />
          <col style={{ width: 96 }} />
        </colgroup>
        <thead>
          <tr className={HEAD_BG}>
            {["รายได้", "จำนวน", "จำนวนเงิน", "รายการหัก", "จำนวน", "จำนวนเงิน", "เงินรับสุทธิ"].map((h, i) => (
              <th key={i} className={`${BD} px-1.5 py-1 text-center font-bold`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }, (_, i) => {
            const a = m.income[i];
            const b = m.cuts[i];
            return (
              <tr key={i}>
                <td className="border-x border-[#3a4048] px-1.5 py-[2px]">{a?.label}</td>
                <td className="num border-x border-[#3a4048] px-1.5 py-[2px] text-center whitespace-nowrap">{a?.qty}</td>
                <td className="num border-x border-[#3a4048] px-1.5 py-[2px] text-right">{a ? amt(a.amt) : ""}</td>
                <td className="border-x border-[#3a4048] px-1.5 py-[2px]">{b?.label}</td>
                <td className="num border-x border-[#3a4048] px-1.5 py-[2px] text-center whitespace-nowrap">{b?.qty}</td>
                <td className="num border-x border-[#3a4048] px-1.5 py-[2px] text-right">{b ? amt(b.amt) : ""}</td>
                <td className="num border-x border-[#3a4048] px-1.5 py-[2px] text-right font-bold">
                  {i === 0 ? baht(m.net) : ""}
                </td>
              </tr>
            );
          })}
          <tr className={`${HEAD_BG} font-bold`}>
            <td className={`${BD} px-1.5 py-1`} colSpan={2}>
              รวมเงินได้
            </td>
            <td className={`num ${BD} px-1.5 py-1 text-right`}>{baht(m.earn)}</td>
            <td className={`${BD} px-1.5 py-1`} colSpan={2}>
              รวมรายการหัก
            </td>
            <td className={`num ${BD} px-1.5 py-1 text-right`}>{baht(m.cut)}</td>
            <td className={`num ${BD} px-1.5 py-1 text-right`}>{baht(m.net)}</td>
          </tr>
        </tbody>
      </table>

      {m.reimb > 0 && (
        /* ใบเบิกที่อนุมัติแล้ว จ่ายคืนพร้อมเงินเดือน — ไม่ใช่รายได้ แต่อยู่ในเงินรับสุทธิ ต้องบอกให้บวกลบตามได้ */
        <p className="mt-1.5 text-[11.5px]">
          เงินรับสุทธิรวมค่าใช้จ่ายคืน (ใบเบิกที่อนุมัติแล้ว) <span className="num">{baht(m.reimb)}</span> บาท
        </p>
      )}

      <div className="mt-5 flex items-stretch justify-between gap-6">
        <table className={`border-collapse ${BD} text-center`}>
          <thead>
            <tr>
              {["รายได้สะสมต่อปี", "ภาษีสะสมต่อปี", "เงินสะสมประกันผลงาน", "เงินประกันสังคมต่อปี"].map((h) => (
                <th key={h} className={`${BD} px-2 py-1 font-bold`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={`num ${BD} px-2 py-1.5`}>{amt(ytd.gross)}</td>
              <td className={`num ${BD} px-2 py-1.5`}>{amt(ytd.tax)}</td>
              {/* ยอดสะสมต่อเนื่องข้ามปี (ผู้ใช้สั่ง 30 ต.ค. 2569) */}
              <td className={`num ${BD} px-2 py-1.5`}>{amt(ytd.guarantee)}</td>
              <td className={`num ${BD} px-2 py-1.5`}>{amt(ytd.ss)}</td>
            </tr>
          </tbody>
        </table>
        <div className={`${BD} flex w-[210px] flex-col px-3 py-1.5 font-bold`}>
          ลงชื่อพนักงาน
          <span className="min-h-[34px] flex-1" />
        </div>
      </div>
    </article>
  );
}
