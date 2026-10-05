"use client";

/*
 * คำนวณเงินเดือน — คิดจากรอบเวลาทำงานที่ปิดแล้วเท่านั้น (ตามต้นแบบ hr-payroll.html)
 *
 * ช่วงวันกำหนดเองได้เพื่อดูตัวเลขย้อนหลัง แต่ "ปิดรอบ" ทำได้เฉพาะช่วงที่
 * ตรงกับรอบเดือนพอดี เพราะรอบที่ปิดต้องอ้างถึงเดือนได้ ไม่งั้นสลิปกับ
 * การนำส่งประกันสังคมจะไม่รู้ว่าเป็นของเดือนไหน
 *
 * พนักงานทดลองงานจ่ายค่าจ้างรายวันตามวันที่มาทำงานจริง คนละฐานกับเงินเดือน จึงแยกตารางและคอลัมน์
 *
 * ก่อนปิดรอบต้องส่งยอดให้ CEO อนุมัติ (แยกกลุ่ม) — ปิดได้เมื่อ CEO อนุมัติแล้วเท่านั้น
 *
 * ปิดแล้วแก้ไม่ได้ทุกช่อง (HR-BR-03) ถ้าคำนวณผิดให้บันทึกเป็นรายการปรับปรุงในรอบถัดไป
 * จำเป็นต้องแก้จริงต้อง "เปิดรอบกลับ" เท่านั้น — ระบุเหตุผล ยกเลิกการอนุมัติของ CEO
 * และเพิกถอนสลิปที่เผยแพร่ไปแล้ว ไม่ใช่แก้เงียบ ๆ (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * มาสายและขาดงานยังไม่หักเงินในหน้านี้ เพราะยังไม่มีข้อสรุปเรื่องเกณฑ์การหัก
 * ปล่อยให้เห็นตัวเลขเวลาที่หน้าสรุปเวลาทำงานไปก่อน ดีกว่าหักตามที่เดาเอง
 */

import { settings } from "@/lib/system-settings";
import Link from "next/link";
import { useState } from "react";
import { baht, bkkStamp, thaiDate, thaiMonth, thaiStamp, todayIso } from "@/lib/format";
import {
  COMMISSION_SOURCE,
  hrCommission,
  HR_OT_DIVISOR,
  HR_OT_LABEL,
  hrOtRate,
  otKindAt,
  commissionBase,
  empOf,
  payApproval,
  reimbItems,
  baseSalaryIn,
  ceilingOf,
  cycleMonthOf,
  earnOf,
  extraOf,
  hourly,
  hrCycle,
  hrPos,
  isDaily,
  monthKeyOf,
  payLines,
  linesOfGroup,
  sumOfGroup,
  prorateIn,
  recInRange,
  type Cycle,
  type Employee,
  type PaySlipCalc,
  type CycleSum,
  type PayGroup,
  type ComSource,
  type PayLine,
  GROUP_LABEL,
} from "@/lib/hr-data";
import { reopenPayrunWithReason, sendPayrollToCeo, useHr } from "@/lib/hr-store";
import { closePayrunFlow } from "@/lib/flow";
import {
  HrSteps,
  PayCalendar,
  PayCard,
  PayHead,
  PayIconBtn,
  PayList,
  PayTiles,
  payHref,
  usePayGroup,
  useUrlMonth,
  type PayCardRow,
} from "./hr-steps";
import { useComSource, useHrTime, useMissingApproved, usePayrollVoidWatch, type MissingReq } from "@/lib/hr-link";
import type { Role } from "@/lib/role";
import { EyeIcon, PencilIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select } from "./ui";
import { EditExtra } from "./hr-extra-edit";

type Tab = "month" | "daily";
/* บรรทัดเงินเดือนคิดที่ hr-data ที่เดียว หน้าอนุมัติของ CEO อ่านตัวเดียวกัน ห้ามคิดเองที่นี่ */
type Line = PayLine;

/* เหตุผลเดียวกันทุกปุ่มที่กดไม่ลงเพราะรอบปิดแล้ว (HR-BR-03) */
const LOCK_WHY =
  "รอบเงินเดือนปิดแล้ว แก้ตัวเลขไม่ได้ · ถ้าคำนวณผิด ให้บันทึกเป็นรายการปรับปรุงในรอบถัดไปพร้อมเหตุผล หรือเปิดรอบกลับ";

export function HrPayrollPage() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const today = todayIso();
  const months = hr.periods.map((p) => p.month);

  /* มาจากขั้นก่อนหน้าพร้อม ?m= ตั้งช่วงให้ตรงกับรอบนั้นเลย (ต้นแบบ urlMonth) */
  const urlMonth = useUrlMonth(months);
  const [range, setRange] = useState<Cycle>(() => hrCycle(urlMonth || months[months.length - 1]));
  const [viewing, setViewing] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  /* เปิดรอบกลับ — ต้องพิมพ์เหตุผล และกล่องบอกผลที่ตามมาให้ครบก่อนกดยืนยัน */
  const [reopening, setReopening] = useState(false);
  /* แก้ค่าตอบแทนที่ไม่มีสูตร ทำได้เฉพาะตอนรอบยังเปิด — ย้ายมาจากหน้าสลิปซึ่งเป็นขั้นหลังปิดรอบ */
  const [editing, setEditing] = useState<string | null>(null);
  /* ตัวเลือกวันเปิดได้ทีละช่อง กดที่อื่นในหน้า = ปิด */
  const [pick, setPick] = useState<"from" | "to" | null>(null);
  /* มือถือ: เลือกกลุ่มจากสี่เหลี่ยมก่อน (ต้นแบบ m-pay-tiles) · แผ่นปฏิทินเลือกรอบแทนช่องวันที่ */
  const g = usePayGroup();
  /* กลุ่มมาจากเมนูย่อย (?g=) ไม่มีแท็บในหน้าแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
     สลับกลุ่มแล้วหน้าเดิมไม่ถูกสร้างใหม่ จึงปิดกล่องรายคนที่ค้างไว้เอง */
  const tab: Tab = g.group;
  const [seenTab, setSeenTab] = useState(tab);
  if (seenTab !== tab) {
    setSeenTab(tab);
    setViewing(null);
  }
  const [cal, setCal] = useState(false);

  /* ตรงกับรอบเดือนไหนพอดีหรือเปล่า — ตัวนี้เป็นตัวตัดสินว่าปิดรอบได้ไหม */
  const month = cycleMonthOf(range, months);
  const timePeriod = month ? hr.periods.find((p) => p.month === month) : undefined;
  const payrun = month ? hr.payruns.find((p) => p.month === month) : undefined;
  /* ปิดรอบแยกกลุ่ม ปุ่มและด่านกันข้ามขั้นจึงอ่านจากแท็บที่เปิดอยู่ */
  const group: PayGroup = tab === "month" ? "month" : "day";
  const timeClosed = Boolean(group === "month" ? timePeriod?.closed : timePeriod?.dayClosed);
  const payClosed = Boolean(group === "month" ? payrun?.closed : payrun?.dayClosed);
  /* กันข้ามขั้น — ช่วงที่ตรงกับรอบแต่รอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด ห้ามคิดเงิน */
  const blocked = Boolean(month) && !timeClosed;

  /*
   * รอบที่ปิดแล้วอ่านยอดที่บันทึกไว้ ไม่คำนวณใหม่ (HR-BR-03)
   * ไม่งั้นหน้านี้กับหน้าสลิปและประวัติรอบจะไม่ตรงกัน ทันทีที่มีอะไรขยับหลังปิดรอบ
   */
  const rows: Line[] = payLines(hr.emp, range, time, hr.extras, today, src, payrun, month);
  const monthly = linesOfGroup(rows, "month");
  const daily = linesOfGroup(rows, "day");

  const total = monthly.reduce(
    (a, { c }) => ({
      base: a.base + c.base,
      ot: a.ot + c.ot,
      com: a.com + c.com,
      inc: a.inc + c.inc,
      allow: a.allow + c.allow,
      adj: a.adj + c.adj,
      ss: a.ss + c.ss,
      late: a.late + c.late,
      reimb: a.reimb + c.reimb,
      net: a.net + c.net,
    }),
    { base: 0, ot: 0, com: 0, inc: 0, allow: 0, adj: 0, ss: 0, late: 0, reimb: 0, net: 0 },
  );
  const dayTotal = daily.reduce(
    (a, { days, c }) => ({ days: a.days + days, net: a.net + c.net }),
    { days: 0, net: 0 },
  );

  /* CEO อนุมัติยอดของกลุ่มนี้หรือยัง — ยอดที่อนุมัติต้องเท่ากับยอดตอนนี้ ถ้าตัวเลขขยับหลังอนุมัติต้องส่งใหม่
     ตัวเลขขยับเมื่อไร ตัวเฝ้าจะยกเลิกการอนุมัติให้เอง ป้ายสถานะจะบอกเหตุผลไว้ */
  usePayrollVoidWatch();
  const groupLines = group === "month" ? monthly : daily;
  const groupSum = sumOfGroup(groupLines, group, range, hr.extras);
  const ap = month ? payApproval(hr.payApprove, month, group) : { status: "draft" as const };
  const drifted =
    ap.status === "approved" && ap.net !== undefined && Math.abs(ap.net - groupSum.net) > 0.005;
  const approved = ap.status === "approved" && !drifted;
  const canSend =
    Boolean(month) && timeClosed && !payClosed &&
    (ap.status === "draft" || ap.status === "rejected" || drifted);

  /*
   * ใบที่อนุมัติแล้วแต่ไม่อยู่ในผลคำนวณของรอบนี้ — ปิดรอบไม่ได้เด็ดขาด (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * เตือนเฉย ๆ ไม่พอ เพราะปิดไปแล้วเปิดกลับต้องยกเลิกการอนุมัติของ CEO และเพิกถอนสลิป
   * นับเฉพาะคนในกลุ่มที่กำลังดูอยู่ เพราะปิดรอบทีละกลุ่ม
   */
  const inGroup = new Set(groupLines.map((x) => x.e.id));
  const missing = useMissingApproved(range).filter((x) => inGroup.has(x.emp));
  const missWhy =
    missing.length > 0
      ? `มีใบที่อนุมัติแล้วยังไม่เข้ารอบนี้ ${missing.length} ใบ — ปิดรอบตอนนี้เงินก้อนนี้จะหาย`
      : undefined;

  /* เหตุผลที่ยังปิดรอบเงินเดือนไม่ได้ — ใช้ทั้งตอนปิดปุ่มและตอนบอกเหตุผลบนมือถือ */
  const payCloseWhy = !month
    ? "ปิดรอบได้เฉพาะช่วงที่ตรงกับรอบพอดี"
    : !timeClosed
      ? "ต้องปิดรอบเวลาทำงานของกลุ่มนี้ก่อน"
      : /* ใบที่ยังไม่เข้ารอบมาก่อนเรื่องการอนุมัติ — ตัวเลขยังไม่นิ่ง อนุมัติไปก็เป็นโมฆะอยู่ดี */
        missWhy
        ? missWhy
        : !approved
          ? "ต้องให้ CEO อนุมัติยอดก่อนจึงปิดรอบได้"
          : "";

  function sendToCeo() {
    if (!month || !canSend) return;
    sendPayrollToCeo(
      month,
      group,
      { people: groupSum.n, net: groupSum.net, ss: groupSum.ss },
      bkkStamp(),
    );
  }

  const current = viewing ? rows.find((x) => x.e.id === viewing) : undefined;
  const editingEmp = editing ? hr.emp.find((e) => e.id === editing) : undefined;
  /* สลิปของกลุ่มนี้เผยแพร่ไปแล้วหรือยัง — กล่องเปิดรอบกลับต้องบอกว่าจะถูกเพิกถอนด้วย */
  const slip = month ? hr.slips.find((x) => x.month === month) : undefined;
  const slipPublished = Boolean(group === "month" ? slip?.published : slip?.dayPublished);
  /* ประวัติการเปิดรอบกลับของกลุ่มนี้ — ต้องเห็นบนหน้าจอ ไม่ใช่ซ่อนอยู่ในข้อมูล */
  const reopened = (group === "month" ? payrun?.reopened : payrun?.dayReopened) ?? [];

  function pickRange(from: string, to: string) {
    /* สลับให้ถูกลำดับเอง ผู้ใช้ไม่ควรต้องมาระวังว่ากรอกกลับด้าน */
    setRange(from > to ? { from: to, to: from } : { from, to });
    setViewing(null);
  }

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`} onClick={() => setPick(null)}>
      <PayHead
        title={month ? thaiMonth(month) : "กำหนดช่วงเอง"}
        onBack={g.picked ? g.home : undefined}
        onCal={() => setCal(true)}
      />
      <PayTiles onOpen={g.open} />

      <div className="bar">
        <div>
          <h1>คำนวณเงินเดือน</h1>
        </div>
        <div className="tools w-full flex-wrap items-end sm:w-auto">
          <Field label="ตั้งแต่วันที่" className="w-full sm:w-[158px]">
            <ThaiDatePicker
              value={range.from}
              open={pick === "from"}
              label="ตั้งแต่วันที่"
              onToggle={() => setPick((v) => (v === "from" ? null : "from"))}
              onPick={(iso) => {
                setPick(null);
                if (iso) pickRange(iso, range.to);
              }}
            />
          </Field>
          <Field label="ถึงวันที่" className="w-full sm:w-[158px]">
            <ThaiDatePicker
              value={range.to}
              open={pick === "to"}
              label="ถึงวันที่"
              onToggle={() => setPick((v) => (v === "to" ? null : "to"))}
              onPick={(iso) => {
                setPick(null);
                if (iso) pickRange(range.from, iso);
              }}
            />
          </Field>
          {/* มือถือ: รอบสำเร็จรูปขึ้นก่อน เลือกทีเดียวได้ทั้งช่วง ไม่ต้องจิ้มปฏิทินสองครั้ง */}
          <Field label="เลือกรอบสำเร็จรูป" className="max-sm:order-first max-sm:w-full">
            <Select
              value={month ?? ""}
              onChange={(e) => {
                if (!e.target.value) return;
                setRange(hrCycle(e.target.value));
                setViewing(null);
              }}
              aria-label="เลือกรอบสำเร็จรูป"
              className="w-auto min-w-[170px] max-sm:w-full"
            >
              <option value="">กำหนดเอง</option>
              {[...months].reverse().map((m) => (
                <option key={m} value={m}>
                  {thaiMonth(m)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <HrSteps month={month ?? undefined} group={tab} />

      <section className="panel glass flex flex-col">
        <div className="strip">
          {/* แท็บสลับกลุ่มเอาออก — เลือกกลุ่มจากเมนูย่อยแทน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          {payClosed ? (
            /* ปิดแล้วปิดเลย ป้ายแทนที่ปุ่ม ไม่มีทางเปิดกลับ
               ป้าย CEO ยังอยู่คู่กัน (ต้นแบบ hr-payroll.html · ceoTag ไม่ถูกซ่อนตอนปิดรอบ)
               เพราะต้องเห็นได้ว่ารอบที่ปิดไปนั้นใครอนุมัติยอดและอนุมัติเมื่อไร */
            <div className="my-2 ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:w-full max-md:justify-center">
              <CeoTag ap={ap} drifted={false} />
              <span className="tag t-ok">
                <i />
                ปิดรอบแล้ว{" "}
                {thaiDate((group === "month" ? payrun?.closedAt : payrun?.dayClosedAt) ?? "")}
              </span>
              {/* ทางเดียวที่จะกลับไปแก้ตัวเลขของรอบที่ปิดแล้ว — ต้องผ่านกล่องที่บอกผลที่ตามมาครบ */}
              <button
                type="button"
                className="btn glass-thin"
                style={{ height: 38 }}
                title="เปิดรอบกลับ ต้องระบุเหตุผล ยกเลิกการอนุมัติของ CEO และเพิกถอนสลิปที่เผยแพร่ไปแล้ว"
                onClick={() => setReopening(true)}
              >
                เปิดรอบกลับ
              </button>
            </div>
          ) : (
            /* มือถือ: เหลือแค่ป้ายสถานะ CEO กลางแถว ปุ่มย้ายไปท้ายรายการ (.hp-bottom) */
            <div className="my-2 ml-auto flex flex-wrap items-center gap-2 max-md:my-0 max-md:ml-0 max-md:w-full max-md:justify-center">
              {canSend && (
                <button type="button" className="btn glass-thin" style={{ height: 38 }} onClick={sendToCeo}>
                  ส่งให้ CEO อนุมัติ
                </button>
              )}
              <CeoTag ap={ap} drifted={drifted} />
              <button
                type="button"
                className="btn solid btn-solid disabled:opacity-45"
                style={{ height: 38 }}
                disabled={Boolean(payCloseWhy)}
                title={payCloseWhy || undefined}
                onClick={() => setClosing(true)}
              >
                ปิดรอบเงินเดือน
              </button>
            </div>
          )}
        </div>

        {/* ใบที่อนุมัติแล้วแต่ไม่เข้ารอบ — ต้องเห็นว่าเป็นใบไหน ของใคร เท่าไร ไม่ใช่รู้แค่ว่ามี */}
        {!payClosed && missing.length > 0 && <MissingBox rows={missing} emp={hr.emp} />}

        {/* ปิดแล้วต้องอ่านออกทันทีว่าทุกช่องแก้ไม่ได้ และถ้าจำเป็นจริงต้องทำอย่างไร */}
        {payClosed && (
          <p className="mx-3 mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            รอบนี้ปิดแล้ว ตัวเลขทุกช่องแก้ไม่ได้ · ถ้าคำนวณผิด ให้บันทึกเป็นรายการปรับปรุงในรอบถัดไปพร้อมเหตุผล
            ถ้าจำเป็นต้องแก้จริงต้องเปิดรอบกลับ ซึ่งจะยกเลิกการอนุมัติของ CEO และเพิกถอนสลิปที่เผยแพร่ไปแล้ว
          </p>
        )}
        {reopened.length > 0 && (
          <div className="mx-3 mt-3 rounded-[11px] border border-[rgba(180,99,11,.25)] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--warning)]">
            รอบนี้เคยเปิดกลับ {reopened.length} ครั้ง
            {reopened.map((r) => (
              <span key={`${r.at}-${r.why}`} className="mt-1 block">
                · {thaiDate(r.at)} โดย {empOf(hr.emp, r.by)?.name ?? r.by} — {r.why}
              </span>
            ))}
          </div>
        )}

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
          {tab === "month" ? (
            <table className="data-table cards-sm min-w-[1280px]">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <Th w={120} unit="บาท">เงินเดือน</Th>
                  <Th w={104}>ค่าล่วงเวลา</Th>
                  <Th w={110}>Commission</Th>
                  <Th w={100}>Incentive</Th>
                  <Th w={96}>ค่าตำแหน่ง</Th>
                  <Th w={104}>ปรับปรุง</Th>
                  <Th w={112}>ประกันสังคม</Th>
                  {/* บวกลบตามได้ครบด้วยตาเปล่า — รายได้ − ประกันสังคม − หักมาสาย + ค่าใช้จ่ายคืน = สุทธิ
                      (ผู้ใช้กำหนด 23 ก.ย. 2569) สองช่องนี้เคยมีในการคำนวณแต่ไม่เคยขึ้นในตาราง */}
                  <Th w={104}>หักมาสาย</Th>
                  <Th w={112}>ค่าใช้จ่ายคืน</Th>
                  <Th w={120}>สุทธิ</Th>
                  <Th w={96}>จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {blocked ? (
                  <BlockedRow cols={12} month={month} group={tab} />
                ) : monthly.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-muted-foreground">
                      ไม่มีพนักงานรายเดือนในช่วงที่เลือก
                    </td>
                  </tr>
                ) : (
                  <>
                    {monthly.map(({ e, c }) => (
                      <PayRow
                        key={e.id}
                        emp={e}
                        onOpen={() => setViewing(e.id)}
                        onEdit={month ? () => setEditing(e.id) : undefined}
                        editWhy={payClosed ? LOCK_WHY : undefined}
                      >
                        <td data-label="เงินเดือน (บาท)" className="c num">{baht(c.base)}</td>
                        <Money label="ค่าล่วงเวลา" v={c.ot} />
                        <Money label="Commission" v={c.com} />
                        <Money label="Incentive" v={c.inc} />
                        <Money label="ค่าตำแหน่ง" v={c.allow} />
                        <Money label="ปรับปรุง" v={c.adj} />
                        <td data-label="ประกันสังคม" className="c num text-destructive">-{baht(c.ss)}</td>
                        <Minus label="หักมาสาย" v={c.late} />
                        <Plus label="ค่าใช้จ่ายคืน" v={c.reimb} />
                        <td data-label="สุทธิ" className="c num font-bold">{baht(c.net)}</td>
                      </PayRow>
                    ))}
                    <tr>
                      {/* บอกฐานที่นับไว้ในแถวรวมเอง — จำนวนคนนับเฉพาะกลุ่มจ่ายรายเดือน
                          และยอดท้ายแถวคือเงินที่จ่ายจริงหลังหัก ไม่ใช่ยอดรายได้รวม
                          ไม่งั้นเทียบกับหน้าอื่นแล้วดูเหมือนตัวเลขขัดกันเอง */}
                      <td className="tsum">
                        รวมทั้งสิ้น {monthly.length} คน
                        <span className="why">เฉพาะกลุ่มจ่ายรายเดือน · ยอดสุทธิคือเงินที่จ่ายจริงหลังหัก</span>
                      </td>
                      <td className="c tsum num">{baht(total.base)}</td>
                      <td className="c tsum num">{baht(total.ot)}</td>
                      <td className="c tsum num">{baht(total.com)}</td>
                      <td className="c tsum num">{baht(total.inc)}</td>
                      <td className="c tsum num">{baht(total.allow)}</td>
                      <td className="c tsum num">{baht(total.adj)}</td>
                      <td className="c tsum num text-destructive">-{baht(total.ss)}</td>
                      <td className="c tsum num text-destructive">
                        {total.late ? `-${baht(total.late)}` : "—"}
                      </td>
                      <td className="c tsum num">{total.reimb ? `+${baht(total.reimb)}` : "—"}</td>
                      <td className="c tsum num">{baht(total.net)}</td>
                      <td className="tsum" />
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          ) : (
            <table className="data-table cards-sm min-w-[1200px]">
              <thead>
                <tr>
                  <th>พนักงาน</th>
                  <Th w={120} unit="บาท">อัตรารายวัน</Th>
                  <Th w={120} unit="วัน">วันที่มาทำงาน</Th>
                  <Th w={126} unit="บาท">ค่าจ้าง</Th>
                  <Th w={118} unit="บาท">ค่าล่วงเวลา</Th>
                  <Th w={112} unit="บาท">ปรับปรุง</Th>
                  <Th w={120} unit="บาท">ประกันสังคม</Th>
                  <Th w={112} unit="บาท">หักมาสาย</Th>
                  <Th w={120} unit="บาท">ค่าใช้จ่ายคืน</Th>
                  <Th w={126} unit="บาท">สุทธิ</Th>
                  <Th w={96}>จัดการ</Th>
                </tr>
              </thead>
              <tbody>
                {blocked ? (
                  <BlockedRow cols={11} month={month} group={tab} />
                ) : daily.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-12 text-center text-muted-foreground">
                      ไม่มีพนักงานจ่ายรายวันในช่วงนี้
                    </td>
                  </tr>
                ) : (
                  daily.map(({ e, c, days, rate }) => (
                    <PayRow key={e.id} emp={e} onOpen={() => setViewing(e.id)}>
                      <td data-label="อัตรารายวัน (บาท)" className="c num">
                        {baht(rate)}
                      </td>
                      <td data-label="วันที่มาทำงาน (วัน)" className="c num">
                        {days}
                      </td>
                      <td data-label="ค่าจ้าง (บาท)" className="c num">{baht(c.base)}</td>
                      <Money label="ค่าล่วงเวลา (บาท)" v={c.ot} />
                      <Money label="ปรับปรุง (บาท)" v={c.adj} />
                      <td data-label="ประกันสังคม (บาท)" className="c num text-destructive">-{baht(c.ss)}</td>
                      <Minus label="หักมาสาย (บาท)" v={c.late} />
                      <Plus label="ค่าใช้จ่ายคืน (บาท)" v={c.reimb} />
                      <td data-label="สุทธิ (บาท)" className="c num font-bold">{baht(c.net)}</td>
                    </PayRow>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* มือถือ: การ์ดคนละใบ ชื่อบนสุด ตัวเลขเป็นแถวชื่อซ้ายค่าขวา ยอดสุทธิเป็นแถวพื้นชมพู (ต้นแบบ pay-rows)
            แตะการ์ดเพื่อดูที่มาของตัวเลข · ยอดรวมท้ายตารางไม่แสดงบนมือถือ (ต้นแบบซ่อน .foot) */}
        <PayList
          empty={
            blocked ? (
              <>
                รอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด จึงยังคำนวณไม่ได้
                <Link
                  href={payHref("/hr/timesheet", tab, month)}
                  className="mt-2 block font-semibold text-primary underline"
                >
                  ไปปิดรอบที่หน้าสรุปเวลาทำงาน
                </Link>
              </>
            ) : groupLines.length === 0 ? (
              tab === "month" ? "ไม่มีพนักงานรายเดือนในช่วงที่เลือก" : "ไม่มีพนักงานจ่ายรายวันในช่วงนี้"
            ) : undefined
          }
        >
          {groupLines.map(({ e, c, days, rate }) => (
            <PayCard
              key={e.id}
              title={e.name}
              sub={hrPos(e.pos).label}
              onOpen={() => setViewing(e.id)}
              openLabel={`ดูที่มาของตัวเลขของ ${e.name}`}
              corner={
                /* รายเดือน: ปุ่มดินสอแก้ค่าตอบแทน (รอบปิดแล้วกดไม่ลงพร้อมเหตุผล) · รายวัน: ปุ่มตาดูที่มาของตัวเลข */
                tab === "month" && month ? (
                  <PayIconBtn
                    label={`แก้ค่าตอบแทนของ ${e.name}`}
                    title={payClosed ? LOCK_WHY : "แก้ค่าตอบแทนที่ไม่มีสูตร"}
                    disabled={payClosed}
                    onClick={() => setEditing(e.id)}
                  >
                    <PencilIcon strokeWidth={1.9} />
                  </PayIconBtn>
                ) : (
                  <PayIconBtn label={`ดูที่มาของตัวเลขของ ${e.name}`} onClick={() => setViewing(e.id)}>
                    <EyeIcon strokeWidth={1.9} />
                  </PayIconBtn>
                )
              }
              rows={[
                ...(tab === "month"
                  ? [
                      { label: "เงินเดือน (บาท)", value: baht(c.base) },
                      moneyRow("ค่าล่วงเวลา", c.ot),
                      moneyRow("Commission", c.com),
                      moneyRow("Incentive", c.inc),
                      moneyRow("ค่าตำแหน่ง", c.allow),
                    ]
                  : [
                      { label: "อัตรารายวัน (บาท)", value: baht(rate) },
                      { label: "วันที่มาทำงาน (วัน)", value: days },
                      { label: "ค่าจ้าง (บาท)", value: baht(c.base) },
                      moneyRow("ค่าล่วงเวลา", c.ot),
                    ]),
                moneyRow("ปรับปรุง", c.adj),
                { label: "ประกันสังคม", value: `-${baht(c.ss)}`, tone: "text-destructive" },
                /* บวกลบตามได้ครบบนมือถือ — รายได้ − ประกันสังคม − หักมาสาย + ค่าใช้จ่ายคืน = สุทธิ */
                c.late
                  ? { label: "หักมาสาย", value: `-${baht(c.late)}`, tone: "text-destructive" }
                  : { label: "หักมาสาย", value: "—", muted: true },
                c.reimb
                  ? { label: "ค่าใช้จ่ายคืน", value: `+${baht(c.reimb)}` }
                  : { label: "ค่าใช้จ่ายคืน", value: "—", muted: true },
              ]}
              net={{ label: "สุทธิ (บาท)", value: baht(c.net) }}
            />
          ))}
        </PayList>

        {/* มือถือ: ปุ่มส่งให้ CEO / ปิดรอบ / เปิดรอบกลับ อยู่ท้ายรายการ ให้ไล่ดูข้อมูลก่อน (ต้นแบบ m-pay-bottom)
            บนมือถือไม่มีการชี้ค้าง เหตุผลที่ปิดรอบไม่ได้จึงต้องอยู่บนหน้าจอ ไม่ใช่ซ่อนใน title */}
        <div className="hp-bottom">
          {payClosed ? (
            <button
              type="button"
              className="btn glass-thin"
              title="เปิดรอบกลับ ต้องระบุเหตุผล ยกเลิกการอนุมัติของ CEO และเพิกถอนสลิปที่เผยแพร่ไปแล้ว"
              onClick={() => setReopening(true)}
            >
              เปิดรอบกลับ
            </button>
          ) : (
            <>
              {payCloseWhy && <p className="hp-why">ยังปิดรอบเงินเดือนไม่ได้ — {payCloseWhy}</p>}
              {canSend && (
                <button type="button" className="btn glass-thin" onClick={sendToCeo}>
                  ส่งให้ CEO อนุมัติ
                </button>
              )}
              <button
                type="button"
                className="btn solid btn-solid disabled:opacity-45"
                disabled={Boolean(payCloseWhy)}
                onClick={() => setClosing(true)}
              >
                ปิดรอบเงินเดือน
              </button>
            </>
          )}
        </div>

        {/* แถบท้ายมีเฉพาะแท็บรายวัน — รายเดือนมีแถวรวมท้ายตารางแล้ว (ต้นแบบ) */}
        {blocked || tab === "month" ? null : (
          <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
            <span>
              {thaiDate(range.from)} – {thaiDate(range.to)}
              {/* รอบที่จบแล้วนับครบทั้งรอบ ไม่ต้องบอกว่านับถึงวันนี้ */}
              {daily.length > 0 && today < range.to && ` · นับวันที่มาทำงานถึง ${thaiDate(today)}`}
            </span>
            {daily.length > 0 && (
              <span className="sum sm:ml-auto">
                วันที่มาทำงานรวม<b>{dayTotal.days}</b> วัน · จ่ายสุทธิ<b>{baht(dayTotal.net)}</b> บาท
              </span>
            )}
          </div>
        )}
      </section>

      {current && (
        <PayDetail
          emp={current.e}
          range={range}
          pay={current.c}
          snapped={current.snapped}
          days={current.days}
          rate={current.rate}
          hr={hr}
          time={time}
          src={src}
          onClose={() => setViewing(null)}
        />
      )}

      {cal && (
        <PayCalendar
          months={months}
          selected={month}
          mode="cycle"
          today={today}
          onPick={(m) => {
            setRange(hrCycle(m));
            setViewing(null);
          }}
          onClose={() => setCal(false)}
        />
      )}

      {editingEmp && month && !payClosed && (
        <EditExtra
          emp={editingEmp}
          month={month}
          hr={hr}
          time={time}
          onClose={() => setEditing(null)}
        />
      )}

      {reopening && month && payClosed && (
        <ReopenDialog
          month={month}
          group={group}
          published={slipPublished}
          approved={ap.status === "approved"}
          today={today}
          onClose={() => setReopening(false)}
        />
      )}

      {closing && month && !payClosed && (
        <CloseDialog
          month={month}
          group={group}
          blocked={!timeClosed || !approved || missing.length > 0}
          lines={groupLines}
          missing={missing}
          emp={hr.emp}
          /* ใบเบิกที่จ่ายคืนในรอบนี้ของคนในกลุ่ม — บันทึกว่าจ่ายแล้วพร้อมกับการปิดรอบ */
          reimbursed={groupLines.flatMap(({ e }) =>
            reimbItems(e, range, src).flatMap((x) => (x.role && x.claim && !x.paidIn ? [{ role: x.role, month: x.claim }] : [])),
          )}
          /* ยอดที่บันทึกตอนปิด คิดจากคนในกลุ่มนี้เท่านั้น */
          sum={groupSum}
          today={today}
          onClose={() => setClosing(false)}
        />
      )}
    </div>
  );
}

/**
 * รายการใบที่อนุมัติแล้วแต่ไม่เข้ารอบ — ใช้ร่วมกันกับหน้าสรุปเวลาทำงาน
 *
 * ต้องบอกให้ครบว่าใบไหน ของใคร เท่าไร ไม่งั้นคนอ่านไม่รู้จะไปตามที่ไหน
 * จำนวนใบอย่างเดียวบอกได้แค่ว่ามีปัญหา แต่แก้ไม่ได้
 */
export function MissingBox({ rows, emp }: { rows: MissingReq[]; emp: Employee[] }) {
  return (
    <div className="mx-3 mt-3 rounded-[11px] border border-[rgba(180,99,11,.25)] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--warning)]">
      <b>มีใบที่อนุมัติแล้วแต่ไม่อยู่ในรอบนี้ {rows.length} ใบ — ปิดรอบไม่ได้จนกว่าจะครบ</b>
      {rows.map((x) => (
        <span key={`${x.kind}-${x.no}`} className="mt-1 block">
          · {MISSING_KIND[x.kind]} {x.no} · {empOf(emp, x.emp)?.name ?? x.emp} ·{" "}
          {x.unit === "บาท" ? baht(x.amount) : x.amount} {x.unit} · {thaiDate(x.date)}
        </span>
      ))}
      <span className="mt-1 block">
        ตรวจที่ใบต้นทางก่อนปิดรอบ ไม่งั้นยอดเหล่านี้จะไม่ได้จ่ายในรอบนี้
      </span>
    </div>
  );
}

const MISSING_KIND: Record<MissingReq["kind"], string> = {
  leave: "ใบลา",
  ot: "ใบขอโอที",
  expense: "ใบเบิก",
};

/** หัวคอลัมน์ตัวเลข — หน่วยอยู่บรรทัดล่าง จะได้ไม่ดันคอลัมน์ให้กว้าง */
function Th({ w, unit, children }: { w: number; unit?: string; children: React.ReactNode }) {
  return (
    <th className="c" style={{ width: w }}>
      {children}
      {unit && (
        <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">({unit})</span>
      )}
    </th>
  );
}

/** แถวพนักงาน — กดที่ไหนก็ได้ในแถวเพื่อดูที่มาของตัวเลข ปุ่มตาทำหน้าที่เดียวกัน */
function PayRow({
  emp,
  onOpen,
  onEdit,
  editWhy,
  children,
}: {
  emp: Employee;
  onOpen: () => void;
  /** แก้ค่าตอบแทนที่ไม่มีสูตร — ไม่ส่งมา = แถวนี้ไม่มีอะไรให้แก้ (กลุ่มจ่ายรายวัน) */
  onEdit?: () => void;
  /** แก้ไม่ได้เพราะอะไร — มีค่าเมื่อปุ่มต้องขึ้นแต่กดไม่ลง (รอบปิดแล้ว) */
  editWhy?: string;
  children: React.ReactNode;
}) {
  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer"
    >
      <td data-label="พนักงาน">
        <b className="block truncate text-[13.5px] font-semibold">{emp.name}</b>
        <em className="block truncate text-[11.5px] not-italic text-muted-foreground">
          {hrPos(emp.pos).label}
        </em>
      </td>
      {children}
      <td data-label="จัดการ" className="c">
        <span className="flex justify-center gap-1.5">
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onOpen();
            }}
            aria-label={`ดูที่มาของตัวเลขของ ${emp.name}`}
            title="ดูที่มาของตัวเลข"
            className="iconbtn glass-thin"
            style={{ width: 32, height: 32 }}
          >
            <EyeIcon className="size-4" strokeWidth={1.9} />
          </button>
          {/* รอบปิดแล้วปุ่มยังอยู่แต่กดไม่ลง พร้อมเหตุผล — ซ่อนไปเลยจะกลายเป็นไม่รู้ว่าทำไมแก้ไม่ได้ */}
          {onEdit && (
            <button
              type="button"
              disabled={Boolean(editWhy)}
              onClick={(ev) => {
                ev.stopPropagation();
                if (!editWhy) onEdit();
              }}
              aria-label={`แก้ค่าตอบแทนของ ${emp.name}`}
              title={editWhy ?? "แก้ค่าตอบแทนที่ไม่มีสูตร"}
              className={`iconbtn glass-thin ${editWhy ? "cursor-not-allowed opacity-45" : ""}`}
              style={{ width: 32, height: 32 }}
            >
              <PencilIcon className="size-4" strokeWidth={1.9} />
            </button>
          )}
        </span>
      </td>
    </tr>
  );
}

/** แถวตัวเลขเงินในการ์ดมือถือ — ศูนย์เป็นขีดจาง ติดลบเป็นสีแดง แบบเดียวกับ Money */
function moneyRow(label: string, v: number): PayCardRow {
  return v
    ? { label, value: baht(v), tone: v < 0 ? "text-destructive" : undefined }
    : { label, value: "—", muted: true };
}

/** ช่องที่ลบออกจากยอด — มีเครื่องหมายลบติดมาเสมอ จะได้บวกลบตามในหัวได้ */
function Minus({ label, v }: { label: string; v: number }) {
  return (
    <td data-label={label} className={`c ${v ? "num text-destructive" : "text-muted-foreground"}`}>
      {v ? `-${baht(v)}` : "—"}
    </td>
  );
}

/** ช่องที่บวกเข้ายอด (ค่าใช้จ่ายคืน ไม่ใช่รายได้ ไม่คิดประกันสังคม) */
function Plus({ label, v }: { label: string; v: number }) {
  return (
    <td data-label={label} className={`c ${v ? "num" : "text-muted-foreground"}`}>
      {v ? `+${baht(v)}` : "—"}
    </td>
  );
}

/** ศูนย์แสดงเป็นขีด เพราะ 0.00 เต็มตารางแล้วอ่านยากกว่าเดิม */
function Money({ label, v }: { label: string; v: number }) {
  if (!v) {
    return (
      <td data-label={label} className="c text-muted-foreground">
        —
      </td>
    );
  }
  return (
    <td data-label={label} className={`c num ${v < 0 ? "text-destructive" : ""}`}>
      {baht(v)}
    </td>
  );
}

// ─── ที่มาของตัวเลขรายคน ──────────────────────────────────────────

function PayDetail({
  emp,
  range,
  pay,
  snapped,
  days,
  rate,
  hr,
  time,
  src,
  onClose,
}: {
  emp: Employee;
  range: Cycle;
  /** ยอดของคนนี้ — รอบที่ปิดแล้วคือยอดที่บันทึกไว้ ไม่ได้คิดใหม่ */
  pay: PaySlipCalc;
  snapped: boolean;
  /** วันที่มาทำงานและอัตราต่อวัน — มาจากแถวเดียวกับที่ตารางแสดง ตัวเลขสองที่จะได้ตรงกัน */
  days: number;
  rate: number;
  hr: ReturnType<typeof useHr>;
  time: ReturnType<typeof useHrTime>;
  src: ComSource;
  onClose: () => void;
}) {
  const c = pay;
  const full = baseSalaryIn(emp, range);
  const pr = prorateIn(emp, range);
  const r = recInRange(time, emp.id, range);
  const key = monthKeyOf(range);
  const x = extraOf(hr.extras, emp.id, key);
  const cap = ceilingOf(range.to);
  const comRate = hrCommission()[emp.pos];
  const daily = isDaily(emp);
  const rbl = reimbItems(emp, range, src);

  return (
    <Sheet
      title={`${emp.name} ${thaiDate(range.from)} – ${thaiDate(range.to)}`}
      wide
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin" onClick={onClose}>
          ปิด
        </button>
      }
    >
      {/* มือถือ: แสดงแค่ตัวเลข ไม่แสดงคำอธิบายสูตร และหัวข้อที่ไม่มีรายการ (ต้นแบบ pay-detail) */}
      <div className="hp-dlg">
      <Sect title="ฐานการคำนวณ">
        <Kv>
          {daily ? (
            <>
              <Row k="รูปแบบการจ่าย" v="รายวัน (พนักงานทดลองงาน)" />
              <Row k="อัตราค่าจ้างรายวัน" v={`${baht(rate)} บาท`} num />
              <Row k="วันที่มาทำงานจริง" v={`${days} วัน`} />
              <Row k="ค่าจ้างรอบนี้" v={`${baht(c.base)} บาท`} num />
            </>
          ) : (
            <>
              <Row k="เงินเดือนตามสัญญา" v={`${baht(full)} บาท`} num />
              {pr.days < pr.total && (
                <>
                  <Row k="อยู่ในรอบนี้" v={`${pr.days} จาก ${pr.total} วัน`} />
                  <Row k="เงินเดือนที่จ่ายรอบนี้" v={`${baht(c.base)} บาท`} num />
                </>
              )}
            </>
          )}
          {/* มือถือ: กลุ่มรายเดือนไม่แสดงค่าจ้างรายชั่วโมง (ยังใช้คิดค่าล่วงเวลาเหมือนเดิม แค่ไม่แสดง) */}
          <Row k="ค่าจ้างรายชั่วโมง" v={`${baht(hourly(full))} บาท`} num mHide={!daily} />
        </Kv>
        <Note>
          ค่าจ้างรายชั่วโมงคิดจาก เงินเดือนเต็มเดือน ÷ {HR_OT_DIVISOR.days} วัน ÷ {HR_OT_DIVISOR.hours}{" "}
          ชั่วโมง
          {daily
            ? " · พนักงานทดลองงานจ่ายค่าจ้างรายวันตามวันที่มาทำงานจริง"
            : pr.days < pr.total
              ? " · จ่ายตามสัดส่วนวันที่อยู่จริง"
              : ""}
        </Note>
      </Sect>

      <Sect title="ค่าล่วงเวลา" mEmpty={r.ot.length === 0}>
        {r.ot.length === 0 ? (
          <Note>ไม่มีชั่วโมงล่วงเวลาที่อนุมัติในรอบนี้</Note>
        ) : (
          <>
          {/* มือถือ: โอทีเป็นรายการ วันที่ + เป็นเงิน / ประเภท + ชั่วโมง ไม่ต้องเลื่อนตารางข้าง */}
          <div className="hp-otlist hp-only-m">
            {r.ot.map((o) => (
              <div key={o.d}>
                <b className="num">{thaiDate(o.d)}</b>
                <b className="a num">{baht(hourly(full) * hrOtRate()[otKindAt(o)] * o.h)}</b>
                <span>
                  {HR_OT_LABEL[otKindAt(o)]} · <span className="num">{o.h.toFixed(2)}</span> ชม.
                </span>
              </div>
            ))}
          </div>
          <div className="scroll-stable overflow-x-auto max-md:hidden">
            <table className="data-table min-w-[460px] text-[12.5px]">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>วันที่</th>
                  <th style={{ width: 96 }}>ประเภท</th>
                  <th className="r" style={{ width: 78 }}>ชั่วโมง</th>
                  <th className="r" style={{ width: 74 }}>อัตรา</th>
                  <th className="r">เป็นเงิน</th>
                </tr>
              </thead>
              <tbody>
                {r.ot.map((o) => (
                  <tr key={o.d}>
                    <td className="num muted">{thaiDate(o.d)}</td>
                    {/* ประเภทและอัตราดูจากวันที่ ไม่ใช่ประเภทที่ยื่นมา — ต้นแบบใช้ otKindOf ตอนคิดเงิน
                        ป้ายและอัตราจึงต้องมาจากตัวเดียวกัน ไม่งั้นตัวเลขในแถวจะคูณไม่ลงตัว */}
                    <td>{HR_OT_LABEL[otKindAt(o)]}</td>
                    <td className="r num">{o.h.toFixed(2)}</td>
                    <td className="r num">{hrOtRate()[otKindAt(o)]} เท่า</td>
                    <td className="r num">{baht(hourly(full) * hrOtRate()[otKindAt(o)] * o.h)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={4} className="tsum">
                    รวม
                  </td>
                  <td className="r tsum num">{baht(c.ot)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          </>
        )}
      </Sect>

      <Sect title="ค่าคอมมิชชั่น" mEmpty={!comRate}>
        {comRate ? (
          <Kv>
            <Row k="ยอดที่ใช้คิด" v={`${baht(commissionBase(emp, range, src))} บาท`} num />
            <Row k="ที่มาของยอด" v={COMMISSION_SOURCE[emp.pos] ?? "—"} />
            <Row k="อัตราตามตำแหน่ง" v={`${comRate * 100}% (${hrPos(emp.pos).label})`} />
            <Row k="เป็นเงิน" v={`${baht(c.com)} บาท`} num />
          </Kv>
        ) : (
          <Note>ตำแหน่งนี้ไม่ได้รับค่าคอมมิชชั่น</Note>
        )}
      </Sect>

      <Sect title="ค่าตอบแทนที่ CEO พิจารณา">
        <Kv>
          <Row k="Incentive" v={`${baht(x.incentive)} บาท`} num />
          <Row k="ค่าตำแหน่ง" v={`${baht(x.allowance)} บาท`} num />
        </Kv>
        <Note>BR-03 สองรายการนี้ไม่มีสูตร ขึ้นกับการพิจารณาของ CEO ฝ่ายบุคคลเป็นผู้บันทึก</Note>
      </Sect>

      <Sect title="รายการปรับปรุงด้วยมือ" mEmpty={x.adjust.length === 0}>
        {x.adjust.length === 0 ? (
          <Note>ไม่มีรายการปรับปรุง</Note>
        ) : (
          <ul className="text-[12.5px]">
            {x.adjust.map((a) => (
              <li
                key={`${a.why}-${a.amt}`}
                className="flex justify-between gap-3 border-t border-border py-1.5"
              >
                <span>{a.why}</span>
                <b className={`num whitespace-nowrap ${a.amt < 0 ? "text-destructive" : ""}`}>
                  {a.amt > 0 ? "+" : ""}
                  {baht(a.amt)}
                </b>
              </li>
            ))}
          </ul>
        )}
      </Sect>

      {/* ค่าใช้จ่ายคืน ไม่ใช่รายได้ ไม่คิดประกันสังคม บวกเข้ายอดโอนอย่างเดียว (ต้นแบบ) */}
      <Sect title="ค่าใช้จ่ายคืน" mEmpty={rbl.length === 0}>
        {rbl.length === 0 ? (
          <Note>ไม่มีใบเบิกที่อนุมัติในรอบนี้</Note>
        ) : (
          <>
            <ul className="text-[12.5px]">
              {rbl.map((b, i) => (
                <li
                  key={`${b.no ?? b.date}-${i}`}
                  className="flex justify-between gap-3 border-t border-border py-1.5"
                >
                  <span>
                    {b.no ?? "—"} · {b.label ?? "ค่าใช้จ่าย"}
                  </span>
                  <b className="num whitespace-nowrap">+{baht(b.total)}</b>
                </li>
              ))}
            </ul>
            <Note>ใบเบิกที่อนุมัติในรอบนี้ ไม่นับเป็นรายได้ และไม่นำไปคิดประกันสังคม</Note>
          </>
        )}
      </Sect>

      <Sect title="รายการหัก">
        <Kv>
          <Row k="ฐานคิดประกันสังคม" v={`${baht(Math.min(c.base, cap.ceiling))} บาท`} num />
          <Row k="เพดานปีนี้" v={`${baht(cap.ceiling)} บาท · หักสูงสุด ${baht(cap.max)} บาท`} num />
          <Row k={`ประกันสังคม ${settings().rates.socialSecurity}%`} v={`${baht(c.ss)} บาท`} num />
          {c.lateMin > 0 && <Row k={`หักมาสาย ${c.lateMin} นาที`} v={`${baht(c.late)} บาท`} num />}
        </Kv>
        <Note>
          บริษัทสมทบเท่ากับที่ลูกจ้างถูกหัก · {lateRuleText()} · ขาดงานโดยไม่มีใบลายังไม่หักเงิน รอทีมยืนยันเกณฑ์
        </Note>
      </Sect>

      <Sect title="สรุป">
        {snapped && (
          <Note>
            รอบนี้ปิดแล้ว ตัวเลขที่แสดงคือยอดที่บันทึกไว้ ณ วันปิดรอบ ไม่ได้คำนวณใหม่
          </Note>
        )}
        {/* บรรทัดชุดเดียวกับสลิปเป๊ะ ๆ — รายการหักสามบรรทัดขึ้นครบเสมอแม้เป็นศูนย์
            รายการปรับปรุงอยู่ฝั่งรายการหัก รวมรายได้จึงไม่รวมปรับปรุง เหมือนกับที่สลิปพิมพ์ */}
        <Kv className="sum">
          <Row k="รวมรายได้" v={`${baht(earnOf(c.gross, c.adj))} บาท`} num />
          <Row k="หักประกันสังคม" v={`-${baht(c.ss)} บาท`} num />
          <Row k="หักมาสาย" v={c.late ? `-${baht(c.late)} บาท` : "—"} num />
          <Row
            k="รายการปรับปรุงอื่น"
            v={c.adj ? `${c.adj < 0 ? "-" : "+"}${baht(Math.abs(c.adj))} บาท` : "—"}
            num
          />
          {/* ใบเบิกที่อนุมัติในรอบนี้ — นอกรายได้ ไม่คิดประกันสังคม */}
          <Row k="ค่าใช้จ่ายคืน" v={c.reimb ? `+${baht(c.reimb)} บาท` : "—"} num />
          <Row k="ยอดสุทธิที่ต้องจ่าย" v={`${baht(c.net)} บาท`} num strong />
        </Kv>
      </Sect>
      </div>
    </Sheet>
  );
}

/** หัวข้อในกล่องที่มาของตัวเลข — mEmpty = ไม่มีรายการ (มีแต่คำอธิบาย) มือถือไม่ต้องแสดงทั้งหัวข้อ */
function Sect({ title, mEmpty, children }: { title: string; mEmpty?: boolean; children: React.ReactNode }) {
  return (
    <section
      className={`hp-sect mt-5 border-t border-border pt-4 first:mt-0 first:border-t-0 first:pt-0 ${mEmpty ? "max-md:hidden" : ""}`}
    >
      <h3 className="mb-2.5 text-[12.5px] font-bold text-primary">{title}</h3>
      {children}
    </section>
  );
}

function Kv({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return (
    <dl className={`hp-kv grid gap-2 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-4 ${className}`}>
      {children}
    </dl>
  );
}

function Row({
  k,
  v,
  num,
  strong,
  mHide,
}: {
  k: string;
  v: string;
  num?: boolean;
  strong?: boolean;
  /** ไม่แสดงบนมือถือ */
  mHide?: boolean;
}) {
  const hide = mHide ? "max-md:hidden" : "";
  return (
    <>
      <dt className={`text-[12.5px] font-semibold text-muted-foreground ${hide}`}>{k}</dt>
      <dd
        className={`leading-relaxed ${num ? "num font-semibold" : ""} ${
          strong ? "font-extrabold" : ""
        } ${hide}`}
      >
        {v}
      </dd>
    </>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  /* มือถือไม่แสดงคำอธิบายสูตร/กฎ (ต้นแบบ pay-detail ซ่อน p.note) */
  return <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground max-md:hidden">{children}</p>;
}

// ─── ปิดรอบเงินเดือน ──────────────────────────────────────────────

function CloseDialog({
  month,
  group,
  blocked,
  lines,
  missing,
  emp,
  reimbursed,
  sum,
  today,
  onClose,
}: {
  month: string;
  group: PayGroup;
  blocked: boolean;
  lines: Line[];
  missing: MissingReq[];
  emp: Employee[];
  reimbursed: { role: Role; month: string }[];
  sum: CycleSum;
  today: string;
  onClose: () => void;
}) {
  const people = lines.length;
  const net = sum.net;
  const ss = sum.ss;
  const c = hrCycle(month);

  function confirm() {
    /* กันอีกชั้น รอบเวลาทำงานต้องปิดและ CEO ต้องอนุมัติยอดแล้ว */
    if (blocked) return;
    /* เก็บยอดที่ปิดไว้ในตัวรอบ หน้าประวัติรอบอ่านตัวเลขชุดนี้ ไม่คำนวณใหม่ */
    closePayrunFlow(month, today, group, sum, reimbursed);
    onClose();
  }

  return (
    <Sheet
      title="ปิดรอบเงินเดือน"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={blocked}
            onClick={confirm}
          >
            ยืนยัน
          </button>
        </>
      }
    >
      <div className="hp-dlg">
      <p className="text-[12.5px] text-muted-foreground max-md:hidden">
        รอบ {thaiMonth(month)} · {thaiDate(c.from)} – {thaiDate(c.to)} · กลุ่ม {GROUP_LABEL[group]}
      </p>
      {/* มือถือ: สรุปรอบเป็นกล่องชมพู (ต้นแบบ p.rule) */}
      <p className="hp-rule hp-only-m">
        <b>รอบ {thaiMonth(month)}</b>
        <span>
          {thaiDate(c.from)} – {thaiDate(c.to)}
        </span>
        <span className="g">กลุ่ม {GROUP_LABEL[group]}</span>
      </p>

      {/* ขาดใบไหนต้องเห็นตรงนี้ด้วย คนกดยืนยันกับคนอ่านหน้าจออาจไม่ใช่คนเดียวกัน */}
      {missing.length > 0 && (
        <div className="-mx-3">
          <MissingBox rows={missing} emp={emp} />
        </div>
      )}

        <>
          <dl className="hp-kv mt-3 grid gap-2 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-4">
            <dt className="text-[12.5px] font-semibold text-muted-foreground">พนักงานในรอบ</dt>
            <dd className="num font-semibold">{people} คน</dd>
            <dt className="text-[12.5px] font-semibold text-muted-foreground">ยอดจ่ายสุทธิ</dt>
            <dd className="num font-semibold">{baht(net)} บาท</dd>
            <dt className="text-[12.5px] font-semibold text-muted-foreground">นำส่งประกันสังคม</dt>
            <dd className="num font-semibold">{baht(ss * 2)} บาท</dd>
          </dl>
          <p className="hp-warn mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            ปิดรอบแล้วแก้ไขไม่ได้อีก และข้อมูลจะถูกส่งไปออกสลิปเงินเดือน ตรวจให้ครบก่อนกดปิด
          </p>
        </>
      </div>
    </Sheet>
  );
}

// ─── เปิดรอบกลับ ──────────────────────────────────────────────────

/**
 * เปิดรอบเงินเดือนที่ปิดไปแล้วกลับมาแก้ (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * เจตนาคือให้ทำได้ยาก ไม่ใช่ทำไม่ได้ — ต้องพิมพ์เหตุผลเอง กดยืนยันไม่ลงจนกว่าจะมีเหตุผล
 * และกล่องต้องบอกผลที่ตามมาให้ครบก่อน ทั้งการอนุมัติของ CEO ที่จะถูกยกเลิก
 * และสลิปที่เผยแพร่ไปแล้วที่จะถูกเพิกถอน เพื่อไม่ให้ใครกดผ่านโดยไม่รู้ตัว
 */
function ReopenDialog({
  month,
  group,
  published,
  approved,
  today,
  onClose,
}: {
  month: string;
  group: PayGroup;
  published: boolean;
  approved: boolean;
  today: string;
  onClose: () => void;
}) {
  const [why, setWhy] = useState("");
  const [warn, setWarn] = useState(false);
  const c = hrCycle(month);

  return (
    <Sheet
      title={`เปิดรอบกลับ · ${GROUP_LABEL[group]}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => {
              if (!why.trim()) return setWarn(true);
              reopenPayrunWithReason(month, today, why.trim(), group);
              onClose();
            }}
          >
            ยืนยันเปิดรอบกลับ
          </button>
        </>
      }
    >
      <div className="hp-dlg">
      <p className="text-[12.5px] text-muted-foreground max-md:hidden">
        รอบ {thaiMonth(month)} · {thaiDate(c.from)} – {thaiDate(c.to)}
      </p>
      {/* มือถือ: สรุปรอบเป็นกล่องชมพู (ต้นแบบ p.rule) */}
      <p className="hp-rule hp-only-m">
        <b>รอบ {thaiMonth(month)}</b>
        <span>
          {thaiDate(c.from)} – {thaiDate(c.to)}
        </span>
        <span className="g">กลุ่ม {GROUP_LABEL[group]}</span>
      </p>

      <div className="mt-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-destructive">
        เปิดรอบกลับแล้วจะเกิดสิ่งเหล่านี้ทันที
        <span className="mt-1.5 block">· รอบกลับมาแก้ไขได้ และต้องปิดรอบใหม่อีกครั้ง</span>
        <span className="mt-1 block">
          · {approved ? "การอนุมัติของ CEO ถูกยกเลิก ต้องส่งยอดให้อนุมัติใหม่" : "ยอดต้องส่งให้ CEO อนุมัติใหม่ก่อนปิดรอบ"}
        </span>
        <span className="mt-1 block">
          · {published ? "สลิปที่เผยแพร่ไปแล้วถูกเพิกถอน พนักงานจะเรียกดูไม่ได้" : "สลิปของรอบนี้ต้องสร้างและเผยแพร่ใหม่"}
        </span>
        <span className="mt-1 block">· เหตุผล ผู้ทำ และเวลา ถูกบันทึกไว้ให้ตรวจย้อนได้</span>
      </div>

      <div className="mt-4">
        <Field label="เหตุผลที่ต้องเปิดรอบกลับ" required>
          <Input
            value={why}
            onChange={(e) => {
              setWhy(e.target.value);
              if (e.target.value) setWarn(false);
            }}
            placeholder="เช่น ค่าตำแหน่งของสองคนบันทึกสลับกัน"
            aria-label="เหตุผลที่ต้องเปิดรอบกลับ"
          />
        </Field>
        {warn && (
          <p className="mt-2.5 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
            เปิดรอบกลับต้องระบุเหตุผล
          </p>
        )}
      </div>
      </div>
    </Sheet>
  );
}

/**
 * แถวแทนตารางตอนรอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด (ต้นแบบ hr-payroll.html)
 * คงหัวตารางไว้ บอกว่าติดตรงไหน แล้วพาไปแก้ที่ต้นเหตุ
 */
function BlockedRow({ cols, month, group }: { cols: number; month?: string; group: Tab }) {
  return (
    <tr>
      <td colSpan={cols} className="py-12 text-center text-[13.5px] text-muted-foreground">
        รอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด จึงยังคำนวณไม่ได้
        <Link href={payHref("/hr/timesheet", group, month)} className="mt-1 block font-semibold text-primary underline">
          ไปปิดรอบที่หน้าสรุปเวลาทำงาน
        </Link>
      </td>
    </tr>
  );
}

/** ป้ายสถานะการอนุมัติของ CEO ข้างปุ่มปิดรอบ */
function CeoTag({ ap, drifted }: { ap: ReturnType<typeof payApproval>; drifted: boolean }) {
  if (drifted) {
    return (
      <span className="tag t-late">
        <i />
        ยอดเปลี่ยนหลัง CEO อนุมัติ ต้องส่งใหม่
      </span>
    );
  }
  if (ap.status === "waiting") {
    return (
      <span className="tag t-early">
        <i />
        รอ CEO อนุมัติ
      </span>
    );
  }
  if (ap.status === "approved") {
    return (
      <span className="tag t-ok">
        <i />
        CEO อนุมัติแล้ว {thaiStamp(ap.at ?? "")}
      </span>
    );
  }
  if (ap.status === "rejected") {
    return (
      <span className="tag t-late">
        <i />
        CEO ตีกลับ: {ap.reason}
      </span>
    );
  }
  /* กลับมาเป็นร่างทั้งที่เคยส่งไปแล้ว — ต้องบอกเหตุผลไว้ ไม่งั้นฝ่ายบุคคลไม่รู้ว่าทำไมต้องส่งใหม่ */
  if (ap.status === "draft" && ap.reason) {
    return (
      <span className="tag t-late">
        <i />
        {ap.reason}
      </span>
    );
  }
  return null;
}

/** กติกาหักมาสายที่ผู้ดูแลระบบเลือกไว้ (/admin/schedule) เป็นข้อความสั้น */
function lateRuleText() {
  const r = settings().rates;
  return r.lateMode === "fixed"
    ? `มาสายหักนาทีละ ${baht(r.latePerMinute)} บาท`
    : "มาสายหักตามนาทีจากฐานเงินเดือน";
}
