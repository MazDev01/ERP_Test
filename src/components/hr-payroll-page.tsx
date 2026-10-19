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
 * ก่อนปิดรอบเงินเดือนต้องส่งยอดให้ CEO อนุมัติ (แยกกลุ่ม) — ปิดได้เมื่อ CEO อนุมัติแล้วเท่านั้น แล้วจึงออกสลิป/เผยแพร่ (ผู้ใช้สั่ง 19 ต.ค. 2569)
 *
 * ปิดแล้วแก้ไม่ได้ทุกช่อง (HR-BR-03) ถ้าคำนวณผิดให้บันทึกเป็นรายการปรับปรุงในรอบถัดไป
 * ปิดแล้วปิดเลย (ผู้ใช้สั่ง 6 ต.ค. 2569)
 *
 * มาสายและขาดงานยังไม่หักเงินในหน้านี้ เพราะยังไม่มีข้อสรุปเรื่องเกณฑ์การหัก
 * ปล่อยให้เห็นตัวเลขเวลาที่หน้าสรุปเวลาทำงานไปก่อน ดีกว่าหักตามที่เดาเอง
 */

import { displayName } from "@/lib/emp-name";
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
  reimbItems,
  baseSalaryIn,
  ceilingOf,
  cycleMonthOf,
  defaultHrMonth,
  earnOf,
  hourly,
  hrCycle,
  hrPos,
  isDaily,
  probPayNote,
  payLines,
  linesOfGroup,
  sumOfGroup,
  prorateIn,
  recInRange,
  dailyPayLines,
  dailyRoundId,
  dailySumOf,
  defaultDailyRange,
  isDailyRoundKey,
  rangeLabel,
  probRoundLabel,
  PAY_CUT_ITEMS,
  PAY_INCOME_ITEMS,
  type Cycle,
  type Employee,
  type PaySlipCalc,
  type CycleSum,
  type PayGroup,
  type PayApproval,
  type ComSource,
  type PayLine,
  GROUP_LABEL,
  payApproval,
  payDrifted,
  payNamesOf,
  paySnapOf,
  PROB_DAY_DIVISOR,
  LEAVE_CUT_KEY,
  HR_LEAVE_LABEL,
} from "@/lib/hr-data";
import { fmtLeave, fmtLeaveHours } from "@/lib/leave-data";
import { sendPayrollToCeo, useHr } from "@/lib/hr-store";
import { closeDailyPayFlow, closePayrunFlow } from "@/lib/flow";
import {
  DayRangePicker,
  HrStepTabs,
  HrSteps,
  useUrlRange,
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
  MonthStepper,
} from "./hr-steps";
import { useComSource, useHrTime, useMissingApproved, usePayrollAutoResubmit, usePayrollSumFn, type MissingReq } from "@/lib/hr-link";
import { TESTING_ALLOW_CLOSE, leaveText, useOpenClashes, type ClashItem } from "@/lib/hr-clash";
import type { Role } from "@/lib/role";
import { EyeIcon, PencilIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { ThaiDatePicker } from "./thai-date-picker";
import { EditExtra } from "./hr-extra-edit";
import { PayrollSummarySheet } from "./payroll-summary-sheet";

type Tab = "month" | "daily";
/* บรรทัดเงินเดือนคิดที่ hr-data ที่เดียว หน้าสลิปและประวัติรอบอ่านตัวเดียวกัน ห้ามคิดเองที่นี่ */
type Line = PayLine;

/* เหตุผลเดียวกันทุกปุ่มที่กดไม่ลงเพราะรอบปิดแล้ว (HR-BR-03) */
const LOCK_WHY =
  "รอบเงินเดือนปิดแล้ว แก้ตัวเลขไม่ได้ · ถ้าคำนวณผิด ให้บันทึกเป็นรายการปรับปรุงในรอบถัดไปพร้อมเหตุผล";

export function HrPayrollPage() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const today = todayIso();
  const months = hr.periods.map((p) => p.month);

  /* มาจากขั้นก่อนหน้าพร้อม ?m= ตั้งช่วงให้ตรงกับรอบนั้นเลย (ต้นแบบ urlMonth) */
  const urlMonth = useUrlMonth(months);
  /* ไม่มี ?m= แสดงรอบล่าสุดที่จบแล้ว ไม่ใช่รอบปัจจุบันที่ยังเดินอยู่ (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  const [range, setRange] = useState<Cycle>(() => hrCycle(urlMonth || defaultHrMonth(months, today)));
  const [viewing, setViewing] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  /* แก้ค่าตอบแทนที่ไม่มีสูตร ทำได้เฉพาะตอนรอบยังเปิด — ย้ายมาจากหน้าสลิปซึ่งเป็นขั้นหลังปิดรอบ */
  const [editing, setEditing] = useState<string | null>(null);
  /* ตารางสรุปเงินเดือน A4 แนวนอน ของรอบเดือน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const [summary, setSummary] = useState(false);
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

  /*
   * กลุ่มทดลองงานจ่ายรายวัน — รอบคือช่วงวันที่เลือก ไม่ใช่รอบเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569)
   * ค่าตั้งต้นคือรอบรายวันที่ปิดรอบเวลาแล้วแต่ยังไม่ปิดเงินเดือน ล่าสุด
   */
  const group: PayGroup = tab === "month" ? "month" : "day";
  const isDay = group === "day";
  const urlRange = useUrlRange();
  const [pickedRange, setPickedRange] = useState<Cycle | null>(null);
  const dayRange =
    pickedRange ?? urlRange ?? defaultDailyRange(hr.dailyRounds, today, (r) => !r.payClosedAt);
  const round = isDay ? hr.dailyRounds.find((r) => r.id === dailyRoundId(dayRange)) : undefined;
  /* ช่วงที่ใช้คำนวณ — รายเดือนคือรอบเดือนที่เลือก · ทดลองงานคือช่วงวันที่เลือก */
  const calcRange: Cycle = isDay ? dayRange : range;

  /* ตรงกับรอบเดือนไหนพอดีหรือเปล่า — ตัวนี้เป็นตัวตัดสินว่าปิดรอบได้ไหม (รายเดือนเท่านั้น) */
  const month = isDay ? undefined : cycleMonthOf(range, months);
  const timePeriod = month ? hr.periods.find((p) => p.month === month) : undefined;
  const payrun = month ? hr.payruns.find((p) => p.month === month) : undefined;
  /* คีย์ของรอบ — รายวันใช้รหัสรอบ "จาก~ถึง" */
  const runKey = isDay ? round?.id : month;
  /* ปิดรอบแยกกลุ่ม ปุ่มและด่านกันข้ามขั้นจึงอ่านจากแท็บที่เปิดอยู่ */
  const timeClosed = isDay ? Boolean(round) : Boolean(timePeriod?.closed);
  const payClosed = isDay ? Boolean(round?.payClosedAt) : Boolean(payrun?.closed);
  /* กันข้ามขั้น — รอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด ห้ามคิดเงิน · ทดลองงานต้องปิดรอบเวลาของช่วงนี้ก่อน */
  const blocked = isDay ? !round : Boolean(month) && !timeClosed;

  /*
   * รอบที่ปิดแล้วอ่านยอดที่บันทึกไว้ ไม่คำนวณใหม่ (HR-BR-03)
   * ไม่งั้นหน้านี้กับหน้าสลิปและประวัติรอบจะไม่ตรงกัน ทันทีที่มีอะไรขยับหลังปิดรอบ
   */
  const rows: Line[] = isDay
    ? dailyPayLines(hr.emp, calcRange, time, hr.extras, today, src, round)
    : payLines(hr.emp, range, time, hr.extras, today, src, payrun, month);
  /* ผ่านทดลองงานกลางรอบ — บอกใต้ชื่อในรอบที่ยังจ่ายแบบทดลองงานและรอบแรกที่เริ่มเงินเดือน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const passNote = (e: Employee) =>
    e.probPass && (isDaily(e, calcRange) || calcRange.from === e.probPass.payFrom) ? probPayNote(e) : null;
  const monthly = linesOfGroup(rows, "month", calcRange);
  const daily = linesOfGroup(rows, "day", calcRange);

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

  const groupLines = group === "month" ? monthly : daily;
  const groupSum = isDay ? dailySumOf(groupLines, calcRange, hr.extras) : sumOfGroup(groupLines, group, range, hr.extras);
  /*
   * CEO อนุมัติยอดก่อนปิดรอบเงินเดือน — กลับมาใช้ (ผู้ใช้สั่ง 19 ต.ค. 2569 · ยกเลิกคำสั่ง 13 ต.ค.)
   * แก้ยอดหลังส่ง (รอ/อนุมัติแล้ว/ไม่อนุมัติ) ระบบส่งให้ CEO อนุมัติใหม่เอง ไม่ต้องกดส่งซ้ำ (ผู้ใช้สั่ง 19 ต.ค. 2569)
   */
  usePayrollAutoResubmit();
  const sumOf = usePayrollSumFn();
  const ap: PayApproval = runKey ? payApproval(hr.payApprove, runKey, group) : { status: "draft" };
  /* ช่วงสั้น ๆ ก่อนตัวเฝ้าส่งใหม่ — อนุมัติแล้วแต่ยอดขยับ ห้ามปิดรอบ */
  const drifted = !payClosed && ap.status === "approved" && Boolean(runKey) && payDrifted(ap, groupSum);
  const approved = ap.status === "approved" && !drifted;

  /*
   * ใบที่อนุมัติแล้วแต่ไม่อยู่ในผลคำนวณของรอบนี้ — ปิดรอบไม่ได้เด็ดขาด (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * เตือนเฉย ๆ ไม่พอ เพราะปิดไปแล้วปิดเลย แก้ยอดของรอบนั้นไม่ได้อีก
   * นับเฉพาะคนในกลุ่มที่กำลังดูอยู่ เพราะปิดรอบทีละกลุ่ม
   */
  const inGroup = new Set(groupLines.map((x) => x.e.id));
  const missing = useMissingApproved(calcRange).filter((x) => inGroup.has(x.emp));
  const missWhy =
    missing.length > 0
      ? `มีใบที่อนุมัติแล้วยังไม่เข้ารอบนี้ ${missing.length} ใบ — ปิดรอบตอนนี้เงินก้อนนี้จะหาย`
      : undefined;
  /*
   * วันลาที่มีเช็คอินและ HR ยังไม่ยืนยัน นับเป็นรายการที่ต้องตรวจเหมือนหน้าสรุปเวลาทำงาน (ผู้ใช้สั่ง 15 ต.ค. 2569)
   * ช่วงทดสอบ (TESTING_ALLOW_CLOSE = true) แค่เตือน · false = กันปิดรอบเงินเดือนด้วย
   */
  const clashes = useOpenClashes(groupLines.map((x) => x.e.id), calcRange);
  const clashWhy =
    !TESTING_ALLOW_CLOSE && clashes.length > 0
      ? `ยังมีรายการที่ต้องตรวจ ${clashes.length} รายการ — ลาแล้วแต่มีเช็คอินที่ยังไม่ยืนยัน`
      : undefined;
  /* ลิงก์ไปกล่องรายวันของคนนั้นที่หน้าสรุปเวลาทำงาน */
  const dayHref = (id: string) =>
    `${payHref("/hr/timesheet", tab, month, isDay ? dayRange : null)}&emp=${encodeURIComponent(id)}`;

  /* เหตุผลที่ยังปิดรอบเงินเดือนไม่ได้ — ใช้ทั้งตอนปิดปุ่มและตอนบอกเหตุผลบนมือถือ */
  const payCloseWhy = !runKey
    ? isDay
      ? "ต้องปิดรอบเวลาทำงานของช่วงนี้ก่อน"
      : "ปิดรอบได้เฉพาะช่วงที่ตรงกับรอบพอดี"
    : !timeClosed
      ? "ต้องปิดรอบเวลาทำงานของกลุ่มนี้ก่อน"
      : /* ใบที่ยังไม่เข้ารอบมาก่อนเรื่องการอนุมัติ — ตัวเลขยังไม่นิ่ง อนุมัติไปก็เป็นโมฆะอยู่ดี */
        (missWhy ??
          clashWhy ??
          (!approved
            ? ap.status === "waiting"
              ? (ap.ver ?? 0) > 0
                ? "แก้ไขแล้ว รอ CEO อนุมัติยอดใหม่ก่อนจึงปิดรอบได้"
                : "รอ CEO อนุมัติยอดก่อนจึงปิดรอบได้"
              : "ต้องส่งให้ CEO อนุมัติยอดก่อนจึงปิดรอบได้"
            : ""));
  /* ส่ง/ส่งใหม่ได้เมื่อรอบเวลาปิดแล้ว ยังไม่ปิดเงินเดือน และยังไม่มีใบค้างเข้ารอบ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const canSend =
    Boolean(runKey) && timeClosed && !payClosed && !missWhy && !clashWhy &&
    (ap.status === "draft" || ap.status === "rejected");

  function sendToCeo() {
    if (!runKey || !canSend) return;
    /* ยอดชุดเดียวกับที่ตัวเฝ้าเทียบ (usePayrollSumFn) — ส่งแล้วจะไม่ถูกนับว่าแก้ทันที */
    const snap = sumOf(runKey, group);
    sendPayrollToCeo(
      runKey,
      group,
      { people: snap.n, net: snap.net, ss: snap.ss, lines: paySnapOf(snap), names: payNamesOf(snap) },
      bkkStamp(),
    );
  }

  const current = viewing ? rows.find((x) => x.e.id === viewing) : undefined;
  const editingEmp = editing ? hr.emp.find((e) => e.id === editing) : undefined;

  function pickDayRange(c: Cycle) {
    setPickedRange(c);
    setViewing(null);
  }

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`} onClick={() => setPick(null)}>
      <PayHead
        title={isDay ? probRoundLabel(dayRange) : month ? thaiMonth(month) : "กำหนดช่วงเอง"}
        onBack={g.picked ? g.home : undefined}
        onCal={isDay ? undefined : () => setCal(true)}
      />
      <PayTiles onOpen={g.open} />

      {/* ขั้นตอนย้ายไปเป็นแท็บที่หัวแผงตาราง ตัวกรองอยู่ขวาบนของหน้า (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
      <div className="bar">
        {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
        <h1 className="page-h1">คำนวณเงินเดือน</h1>
        <div className="tools ml-auto">
          {isDay ? (
            <DayRangePicker value={dayRange} max={today} onChange={pickDayRange} rounds={hr.dailyRounds} />
          ) : (
            <>
              {/* ไม่มีช่องวันที่และรอบสำเร็จรูป — เลือกเป็นเดือนอย่างเดียว (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
              <MonthStepper
                months={months}
                value={month ?? months[months.length - 1]}
                onChange={(m) => {
                  setRange(hrCycle(m));
                  setViewing(null);
                }}
              />
              {/* ตารางสรุปเงินเดือนของรอบเดือนนี้ — พิมพ์/บันทึก PDF (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
              {month && (
                <button type="button" className="btn glass-thin" style={{ height: 38 }} onClick={() => setSummary(true)}>
                  ตารางสรุปเงินเดือน
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <HrSteps month={month ?? undefined} range={isDay ? dayRange : null} group={tab} className="md:hidden" />
      {isDay && (
        <div className="hp-only-m">
          <DayRangePicker value={dayRange} max={today} onChange={pickDayRange} rounds={hr.dailyRounds} />
        </div>
      )}

      <section className="panel glass flex flex-col">
        <div className="strip">
          <HrStepTabs month={month ?? undefined} range={isDay ? dayRange : null} group={tab} />
          {payClosed ? (
            /* ปิดแล้วปิดเลย ป้ายแทนที่ปุ่ม · ป้าย CEO อยู่คู่กันให้เห็นว่าใครอนุมัติเมื่อไร (ผู้ใช้สั่ง 19 ต.ค. 2569) */
            <div className="my-2 ml-auto flex flex-wrap items-center gap-2 max-md:ml-0 max-md:w-full max-md:justify-center">
              <CeoTag ap={ap} drifted={false} />
              <span className="tag t-ok">
                <i />
                ปิดรอบแล้ว{" "}
                {thaiDate((isDay ? round?.payClosedAt : payrun?.closedAt) ?? "")}
              </span>
              <Link
                href={payHref("/hr/payslip", tab, month, isDay ? dayRange : null)}
                className="btn solid btn-solid"
                style={{ height: 38 }}
              >
                ออกสลิปและเผยแพร่
              </Link>
            </div>
          ) : (
            /* มือถือ: ปุ่มย้ายไปท้ายรายการ (.hp-bottom) · ส่งให้ CEO อนุมัติก่อนปิดรอบ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
            <div className="my-2 ml-auto flex flex-wrap items-center gap-2 max-md:my-0 max-md:ml-0 max-md:w-full max-md:justify-center max-md:hidden">
              {canSend && (
                <button type="button" className="btn glass-thin" style={{ height: 38 }} onClick={sendToCeo}>
                  {ap.status === "draft" && !ap.reason ? "ส่งให้ CEO อนุมัติ" : "ส่งใหม่"}
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
        {/* ลาแล้วแต่มีเช็คอินที่ HR ยังไม่ยืนยัน — กดไปเปิดกล่องรายวันของคนนั้น (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
        {!payClosed && clashes.length > 0 && <ClashBox rows={clashes} emp={hr.emp} href={dayHref} />}

        {/* ไม่มีข้อความอธิบายการทำงานของระบบตอนปิดรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
        {/* ไม่มีกล่องประวัติรอบ และไม่จองร่องแถบเลื่อน ตารางเต็มกล่อง (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
        <div className="min-h-0 flex-1 overflow-auto max-md:hidden">
          {tab === "month" ? (
            <table className="data-table cards-sm">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>พนักงาน</th>
                  <Th w={120} unit="บาท">เงินเดือน</Th>
                  <Th w={104}>ค่าล่วงเวลา</Th>
                  <Th w={110}>Commission</Th>
                  <Th w={100}>Incentive</Th>
                  <Th w={96}>ค่าตำแหน่ง</Th>
                  <Th w={112}>ประกันสังคม</Th>
                  {/* บวกลบตามได้ครบด้วยตาเปล่า — รายได้ − ประกันสังคม − หักมาสาย + ค่าใช้จ่ายคืน = สุทธิ
                      (ผู้ใช้กำหนด 23 ก.ย. 2569) สองช่องนี้เคยมีในการคำนวณแต่ไม่เคยขึ้นในตาราง */}
                  <Th w={104}>หักมาสาย</Th>
                  {/* ไม่มีคอลัมน์ ปรับปรุง · ค่าใช้จ่ายคืน · จัดการ (ผู้ใช้สั่ง 6 ต.ค. 2569)
                      ยอดสองช่องนี้ยังรวมในสุทธิ ดูได้ในหน้าต่างรายละเอียด · ปุ่มแก้ไขย้ายไปอยู่ในหน้าต่างนั้น */}
                  <Th w={120}>สุทธิ</Th>
                </tr>
              </thead>
              <tbody>
                {blocked ? (
                  <BlockedRow cols={9} month={month} range={isDay ? dayRange : null} group={tab} />
                ) : monthly.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-muted-foreground">
                      ไม่มีพนักงานรายเดือนในช่วงที่เลือก
                    </td>
                  </tr>
                ) : (
                  <>
                    {monthly.map(({ e, c }) => (
                      <PayRow
                        key={e.id}
                        emp={e}
                        note={passNote(e)}
                        onOpen={() => setViewing(e.id)}
                      >
                        <td data-label="เงินเดือน (บาท)" className="c num">{baht(c.base)}</td>
                        <Money label="ค่าล่วงเวลา" v={c.ot} />
                        <Money label="Commission" v={c.com} />
                        <Money label="Incentive" v={c.inc} />
                        <Money label="ค่าตำแหน่ง" v={c.allow} />
                        <td data-label="ประกันสังคม" className="c num text-destructive">-{baht(c.ss)}</td>
                        <Minus label="หักมาสาย" v={c.late} />
                        <td data-label="สุทธิ" className="c num font-bold">{baht(c.net)}</td>
                      </PayRow>
                    ))}
                    <tr>
                      {/* บอกฐานที่นับไว้ในแถวรวมเอง — จำนวนคนนับเฉพาะกลุ่มจ่ายรายเดือน
                          และยอดท้ายแถวคือเงินที่จ่ายจริงหลังหัก ไม่ใช่ยอดรายได้รวม
                          ไม่งั้นเทียบกับหน้าอื่นแล้วดูเหมือนตัวเลขขัดกันเอง */}
                      <td className="tsum">
                        รวมทั้งสิ้น {monthly.length} คน
                      </td>
                      <td className="c tsum num">{baht(total.base)}</td>
                      <td className="c tsum num">{baht(total.ot)}</td>
                      <td className="c tsum num">{baht(total.com)}</td>
                      <td className="c tsum num">{baht(total.inc)}</td>
                      <td className="c tsum num">{baht(total.allow)}</td>
                      <td className="c tsum num text-destructive">-{baht(total.ss)}</td>
                      <td className="c tsum num text-destructive">
                        {total.late ? `-${baht(total.late)}` : "—"}
                      </td>
                      <td className="c tsum num">{baht(total.net)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          ) : (
            <table className="data-table cards-sm">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>พนักงาน</th>
                  <Th w={120} unit="บาท">อัตรารายวัน</Th>
                  <Th w={120} unit="วัน">วันที่มาทำงาน</Th>
                  <Th w={126} unit="บาท">ค่าจ้าง</Th>
                  <Th w={118} unit="บาท">ค่าล่วงเวลา</Th>
                  {/* ทดลองงานได้ Incentive ค่าตำแหน่ง ปรับปรุง และไม่หักประกันสังคม (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                  <Th w={104} unit="บาท">Incentive</Th>
                  <Th w={104} unit="บาท">ค่าตำแหน่ง</Th>
                  <Th w={112} unit="บาท">หักมาสาย</Th>
                  {/* ภาษีหัก ณ ที่จ่าย 3% คิดในการคำนวณเงินเดือน บันทึกพร้อมรอบ (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
                  <Th w={120} unit="บาท">ภาษีหัก ณ ที่จ่าย 3%</Th>
                  <Th w={126} unit="บาท">สุทธิ</Th>
                </tr>
              </thead>
              <tbody>
                {blocked ? (
                  <BlockedRow cols={10} month={month} range={isDay ? dayRange : null} group={tab} />
                ) : daily.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-12 text-center text-muted-foreground">
                      ไม่มีพนักงานทดลองงานในสัปดาห์นี้
                    </td>
                  </tr>
                ) : (
                  daily.map(({ e, c, days, rate }) => (
                    <PayRow key={e.id} emp={e} note={passNote(e)} onOpen={() => setViewing(e.id)}>
                      <td data-label="อัตรารายวัน (บาท)" className="c num">
                        {baht(rate)}
                      </td>
                      <td data-label="วันที่มาทำงาน (วัน)" className="c num">
                        {days}
                      </td>
                      <td data-label="ค่าจ้าง (บาท)" className="c num">{baht(c.base)}</td>
                      <Money label="ค่าล่วงเวลา (บาท)" v={c.ot} />
                      <Money label="Incentive (บาท)" v={c.inc} />
                      <Money label="ค่าตำแหน่ง (บาท)" v={c.allow} />
                      <Minus label="หักมาสาย (บาท)" v={c.late} />
                      <Minus label="ภาษีหัก ณ ที่จ่าย 3% (บาท)" v={c.wht} />
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
                  href={payHref("/hr/timesheet", tab, month, isDay ? dayRange : null)}
                  className="mt-2 block font-semibold text-primary underline"
                >
                  ไปปิดรอบที่หน้าสรุปเวลาทำงาน
                </Link>
              </>
            ) : groupLines.length === 0 ? (
              tab === "month" ? "ไม่มีพนักงานรายเดือนในช่วงที่เลือก" : "ไม่มีพนักงานทดลองงานในสัปดาห์นี้"
            ) : undefined
          }
        >
          {groupLines.map(({ e, c, days, rate }) => (
            <PayCard
              key={e.id}
              title={displayName(e)}
              sub={[hrPos(e.pos).label, passNote(e)].filter(Boolean).join(" · ")}
              onOpen={() => setViewing(e.id)}
              openLabel={`ดูที่มาของตัวเลขของ ${displayName(e)}`}
              corner={
                /* มีรอบแล้ว: ปุ่มดินสอแก้ค่าตอบแทน (รอบปิดแล้วกดไม่ลงพร้อมเหตุผล) · ยังไม่มีรอบ: ปุ่มตาดูที่มาของตัวเลข */
                runKey ? (
                  <PayIconBtn
                    label={`แก้ค่าตอบแทนของ ${displayName(e)}`}
                    title={payClosed ? LOCK_WHY : "แก้ค่าตอบแทนที่ไม่มีสูตร"}
                    disabled={payClosed}
                    onClick={() => setEditing(e.id)}
                  >
                    <PencilIcon strokeWidth={1.9} />
                  </PayIconBtn>
                ) : (
                  <PayIconBtn label={`ดูที่มาของตัวเลขของ ${displayName(e)}`} onClick={() => setViewing(e.id)}>
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
                      moneyRow("Incentive", c.inc),
                      moneyRow("ค่าตำแหน่ง", c.allow),
                    ]),
                /* รายการตามแบบสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569) — รายได้อื่นที่กรอกเอง · รายการหักที่กรอกเอง */
                moneyRow("รายได้อื่น", c.more),
                moneyRow("รายการหัก", c.adj),
                ...(tab === "month"
                  ? [{ label: "ประกันสังคม", value: `-${baht(c.ss)}`, tone: "text-destructive" }]
                  : [
                      c.wht
                        ? { label: "ภาษีหัก ณ ที่จ่าย 3%", value: `-${baht(c.wht)}`, tone: "text-destructive" }
                        : { label: "ภาษีหัก ณ ที่จ่าย 3%", value: "—", muted: true },
                    ]),
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

        {/* มือถือ: ปุ่มปิดรอบ อยู่ท้ายรายการ ให้ไล่ดูข้อมูลก่อน (ต้นแบบ m-pay-bottom)
            บนมือถือไม่มีการชี้ค้าง เหตุผลที่ปิดรอบไม่ได้จึงต้องอยู่บนหน้าจอ ไม่ใช่ซ่อนใน title */}
        {/* รอบปิดแล้วไม่มีปุ่มท้ายรายการ (ผู้ใช้สั่ง 6 ต.ค. 2569) · ไม่มีปุ่มส่งให้ CEO แล้ว (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
        {!payClosed && (
          <div className="hp-bottom">
            {payCloseWhy && <p className="hp-why">ยังปิดรอบเงินเดือนไม่ได้ — {payCloseWhy}</p>}
            {/* ส่งให้ CEO อนุมัติ + ป้ายสถานะ บนมือถือ (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
            <CeoTag ap={ap} drifted={drifted} />
            {canSend && (
              <button type="button" className="btn glass-thin" onClick={sendToCeo}>
                {ap.status === "draft" && !ap.reason ? "ส่งให้ CEO อนุมัติ" : "ส่งใหม่"}
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
          </div>
        )}

        {/* แถบท้ายมีเฉพาะแท็บรายวัน — รายเดือนมีแถวรวมท้ายตารางแล้ว (ต้นแบบ) */}
        {blocked || tab === "month" ? null : (
          <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
            <span>
              {probRoundLabel(calcRange)}
              {/* รอบที่จบแล้วนับครบทั้งรอบ ไม่ต้องบอกว่านับถึงวันนี้ */}
              {daily.length > 0 && today < calcRange.to && ` · นับวันที่มาทำงานถึง ${thaiDate(today)}`}
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
          range={calcRange}
          pay={current.c}
          snapped={current.snapped}
          days={current.days}
          rate={current.rate}
          hr={hr}
          time={time}
          src={src}
          onClose={() => setViewing(null)}
          onEdit={runKey ? () => setEditing(current.e.id) : undefined}
          editWhy={payClosed ? LOCK_WHY : undefined}
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

      {editingEmp && runKey && !payClosed && (
        <EditExtra
          emp={editingEmp}
          runKey={runKey}
          hr={hr}
          time={time}
          onClose={() => setEditing(null)}
        />
      )}

      {summary && month && <PayrollSummarySheet month={month} onClose={() => setSummary(false)} />}

      {closing && runKey && !payClosed && (
        <CloseDialog
          runKey={runKey}
          title={isDay ? `รอบจ่าย ${probRoundLabel(calcRange)}` : `รอบ ${thaiMonth(runKey)}`}
          range={calcRange}
          group={group}
          blocked={!timeClosed || missing.length > 0 || Boolean(clashWhy) || !approved}
          lines={groupLines}
          missing={missing}
          clashes={clashes}
          dayHref={dayHref}
          emp={hr.emp}
          /* ใบเบิกที่จ่ายคืนในรอบนี้ของคนในกลุ่ม — บันทึกว่าจ่ายแล้วพร้อมกับการปิดรอบ */
          reimbursed={groupLines.flatMap(({ e }) =>
            reimbItems(e, calcRange, src).flatMap((x) => (x.role && x.claim && !x.paidIn ? [{ role: x.role, month: x.claim }] : [])),
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
          · {MISSING_KIND[x.kind]} · {displayName(empOf(emp, x.emp)) || "—"} ·{" "}
          {x.unit === "บาท" ? baht(x.amount) : x.amount} {x.unit} · {thaiDate(x.date)}
        </span>
      ))}
      <span className="mt-1 block">
        ตรวจที่ใบต้นทางก่อนปิดรอบ ไม่งั้นยอดเหล่านี้จะไม่ได้จ่ายในรอบนี้
      </span>
    </div>
  );
}

/**
 * รายการที่ต้องตรวจ: วันที่ลาแล้วแต่มีเช็คอินและ HR ยังไม่ยืนยัน (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * บอกว่าใคร วันไหน ลาอะไร พร้อมลิงก์ไปเปิดกล่องรายวันที่หน้าสรุปเวลาทำงาน
 */
export function ClashBox({ rows, emp, href }: { rows: ClashItem[]; emp: Employee[]; href: (id: string) => string }) {
  return (
    <div className="mx-3 mt-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-destructive">
      <b>ยังมีรายการที่ต้องตรวจ {rows.length} รายการ</b>
      {rows.map((x) => (
        <span key={`${x.emp}-${x.d}`} className="mt-1 block">
          · {displayName(empOf(emp, x.emp)) || "—"} · {thaiDate(x.d)} · {leaveText(x.lv)} — ลาแล้วแต่มีเช็คอิน — ตรวจสอบ ·{" "}
          <Link href={href(x.emp)} className="font-semibold underline">
            เปิดดูรายวัน
          </Link>
        </span>
      ))}
      <span className="mt-1 block">
        แก้เวลาไม่ให้ทับช่วงลา หรือกด &quot;ยืนยันแล้ว&quot; ที่วันนั้นในหน้าสรุปเวลาทำงาน
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
  note,
  onOpen,
  onEdit,
  editWhy,
  children,
}: {
  emp: Employee;
  /** ผ่านทดลองงานกลางรอบ — "จ่ายแบบทดลองงานถึงรอบ … · เริ่มเงินเดือนรอบ …" (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  note?: string | null;
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
        <b className="block truncate text-[13.5px] font-semibold">{displayName(emp)}</b>
        <em className="block truncate text-[11.5px] not-italic text-muted-foreground">
          {hrPos(emp.pos).label}
        </em>
        {note && <em className="block text-[11.5px] not-italic text-muted-foreground">{note}</em>}
      </td>
      {children}
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
  time,
  src,
  onClose,
  onEdit,
  editWhy,
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
  /** แก้ค่าตอบแทนที่ไม่มีสูตร — ย้ายมาจากคอลัมน์จัดการ (ผู้ใช้สั่ง 6 ต.ค. 2569) · ไม่ส่ง = ไม่มีปุ่ม */
  onEdit?: () => void;
  editWhy?: string;
}) {
  const c = pay;
  const full = baseSalaryIn(emp, range);
  const pr = prorateIn(emp, range);
  const r = recInRange(time, emp.id, range);
  const daily = isDaily(emp, range);
  /* ทดลองงานอ่านค่าตอบแทนตามรอบรายช่วง รายเดือนตามรอบเดือน — ชุดเดียวกับที่ payIn ใช้ */
  /* รายการตามแบบสลิป — รอบที่ปิดแล้วอ่านจากยอดที่บันทึกไว้ (pay.items) ไม่ใช่ข้อมูลปัจจุบัน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  /* หักลาเกินสิทธิ์ที่ระบบคิดให้แยกแสดงอีกกล่อง — ส่วนที่กรอกเองเหลือเท่าที่ HR กรอก (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const x = { ...c.items };
  for (const o of c.leaveOver ?? []) {
    const k = LEAVE_CUT_KEY[o.kind];
    x[k] = Math.round(((x[k] ?? 0) - o.amt) * 100) / 100 || undefined;
  }
  const incRows = PAY_INCOME_ITEMS.filter(({ k }) => x[k]);
  const cutRows = PAY_CUT_ITEMS.filter(({ k }) => x[k]);
  const cap = ceilingOf(range.to);
  const comRate = hrCommission()[emp.pos];
  const rbl = reimbItems(emp, range, src);

  return (
    <Sheet
      title={`${emp.name} ${thaiDate(range.from)} – ${thaiDate(range.to)}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          {onEdit && (
            <button
              type="button"
              className="btn solid btn-solid"
              disabled={Boolean(editWhy)}
              title={editWhy}
              onClick={() => {
                if (editWhy) return;
                onClose();
                onEdit();
              }}
            >
              แก้ไข
            </button>
          )}
        </>
      }
    >
      {/* มือถือ: แสดงแค่ตัวเลข ไม่แสดงคำอธิบายสูตร และหัวข้อที่ไม่มีรายการ (ต้นแบบ pay-detail) */}
      <div className="hp-dlg">
      <Sect title="ฐานการคำนวณ">
        <Kv>
          {daily ? (
            <>
              {/* จ่ายรายสัปดาห์ อัตรารายวัน = เงินเดือน ÷ 22 · วันทำงานหักชั่วโมงลา (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
              <Row k="รูปแบบการจ่าย" v="รายสัปดาห์ (พนักงานทดลองงาน)" />
              <Row k="อัตราค่าจ้างรายวัน" v={`${baht(rate)} บาท (เงินเดือน ÷ ${PROB_DAY_DIVISOR})`} num />
              <Row k="วันที่มาทำงานจริง" v={fmtLeave(days)} />
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
          <div className="overflow-x-auto max-md:hidden">
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

      {/* รายการเงินได้/รายการหักที่กรอกเองตามแบบสลิป แทน Incentive/ค่าตำแหน่ง/รายการปรับปรุง (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
      <Sect title="รายได้ที่กรอกเอง" mEmpty={incRows.length === 0}>
        {incRows.length === 0 ? (
          <Note>ไม่มีรายการ</Note>
        ) : (
          <Kv>
            {incRows.map(({ k, label }) => (
              <Row key={k} k={label} v={`${baht(x[k] ?? 0)} บาท`} num />
            ))}
          </Kv>
        )}
      </Sect>

      <Sect title="รายการหักที่กรอกเอง" mEmpty={cutRows.length === 0}>
        {cutRows.length === 0 ? (
          <Note>ไม่มีรายการ</Note>
        ) : (
          <Kv>
            {cutRows.map(({ k, label }) => (
              <Row key={k} k={label} v={`-${baht(x[k] ?? 0)} บาท`} num />
            ))}
          </Kv>
        )}
      </Sect>

      {/* ลาเกินสิทธิ์ของรายเดือน — ระบบหักให้ (เงินเดือน ÷ 30) × ชั่วโมงที่เกิน ÷ 8 รวมอยู่ในบรรทัดหักลาของสลิปแล้ว (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
      {c.leaveOver && c.leaveOver.length > 0 && (
        <Sect title="ลาเกินสิทธิ์ (หักอัตโนมัติ)">
          <Kv>
            {c.leaveOver.map((o) => (
              <Row key={o.kind} k={`${HR_LEAVE_LABEL[o.kind]} เกิน ${fmtLeaveHours(o.hours)}`} v={`-${baht(o.amt)} บาท`} num />
            ))}
          </Kv>
        </Sect>
      )}

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
          </>
        )}
      </Sect>

      <Sect title="รายการหัก">
        <Kv>
          {/* ทดลองงานไม่หักประกันสังคม (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
          {!daily && (
            <>
              <Row k="ฐานคิดประกันสังคม" v={`${baht(Math.min(c.base, cap.ceiling))} บาท`} num />
              <Row k="เพดานปีนี้" v={`${baht(cap.ceiling)} บาท · หักสูงสุด ${baht(cap.max)} บาท`} num />
              <Row k={`ประกันสังคม ${settings().rates.socialSecurity}%`} v={`${baht(c.ss)} บาท`} num />
            </>
          )}
          {(c.lateMin > 0 || daily) && (
            <Row k={`หักมาสาย ${c.lateMin} นาที`} v={c.late ? `${baht(c.late)} บาท` : "—"} num />
          )}
          {/* 3% ของ (รวมเงินได้ − รายการหักก่อนภาษี) ปัด 2 ตำแหน่ง (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
          {daily && <Row k="ภาษีหัก ณ ที่จ่าย 3%" v={c.wht ? `${baht(c.wht)} บาท` : "—"} num />}
        </Kv>
      </Sect>

      <Sect title="สรุป">
        {/* บรรทัดชุดเดียวกับสลิปเป๊ะ ๆ — รายการหักสามบรรทัดขึ้นครบเสมอแม้เป็นศูนย์
            รายการปรับปรุงอยู่ฝั่งรายการหัก รวมรายได้จึงไม่รวมปรับปรุง เหมือนกับที่สลิปพิมพ์ */}
        <Kv className="sum">
          <Row k="รวมรายได้" v={`${baht(earnOf(c.gross, c.adj))} บาท`} num />
          {!daily && <Row k="หักประกันสังคม" v={`-${baht(c.ss)} บาท`} num />}
          <Row k="หักมาสาย" v={c.late ? `-${baht(c.late)} บาท` : "—"} num />
          <Row
            k="รายการหักที่กรอกเอง"
            v={c.adj ? `${c.adj < 0 ? "-" : "+"}${baht(Math.abs(c.adj))} บาท` : "—"}
            num
          />
          {daily && <Row k="ภาษีหัก ณ ที่จ่าย 3%" v={c.wht ? `-${baht(c.wht)} บาท` : "—"} num />}
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
  runKey,
  title,
  range: c,
  group,
  blocked,
  lines,
  missing,
  clashes,
  dayHref,
  emp,
  reimbursed,
  sum,
  today,
  onClose,
}: {
  /** รอบเดือน "yyyy-mm" หรือรหัสรอบจ่ายรายวัน "จาก~ถึง" (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  runKey: string;
  title: string;
  range: Cycle;
  group: PayGroup;
  blocked: boolean;
  lines: Line[];
  missing: MissingReq[];
  /** ลาแล้วแต่มีเช็คอินที่ยังไม่ยืนยัน (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  clashes: ClashItem[];
  dayHref: (id: string) => string;
  emp: Employee[];
  reimbursed: { role: Role; month: string }[];
  sum: CycleSum;
  today: string;
  onClose: () => void;
}) {
  const people = lines.length;
  const net = sum.net;
  const ss = sum.ss;

  function confirm() {
    /* กันอีกชั้น รอบเวลาทำงานต้องปิดและไม่มีใบค้างเข้ารอบ (ไม่มีด่าน CEO แล้ว ผู้ใช้สั่ง 13 ต.ค. 2569) */
    if (blocked) return;
    /* เก็บยอดที่ปิดไว้ในตัวรอบ หน้าประวัติรอบอ่านตัวเลขชุดนี้ ไม่คำนวณใหม่ */
    if (isDailyRoundKey(runKey)) closeDailyPayFlow(runKey, today, sum, reimbursed);
    else closePayrunFlow(runKey, today, group, sum, reimbursed);
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
        {title} · {thaiDate(c.from)} – {thaiDate(c.to)} · กลุ่ม {GROUP_LABEL[group]}
      </p>
      {/* มือถือ: สรุปรอบเป็นกล่องชมพู (ต้นแบบ p.rule) */}
      <p className="hp-rule hp-only-m">
        <b>{title}</b>
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
      {clashes.length > 0 && (
        <div className="-mx-3">
          <ClashBox rows={clashes} emp={emp} href={dayHref} />
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
            ปิดรอบแล้วแก้ไขไม่ได้อีก และออกสลิปและเผยแพร่ได้ทันที ตรวจให้ครบก่อนกดปิด
          </p>
        </>
      </div>
    </Sheet>
  );
}

/**
 * แถวแทนตารางตอนรอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด (ต้นแบบ hr-payroll.html)
 * คงหัวตารางไว้ บอกว่าติดตรงไหน แล้วพาไปแก้ที่ต้นเหตุ
 */
function BlockedRow({
  cols,
  month,
  range,
  group,
}: {
  cols: number;
  month?: string;
  range?: Cycle | null;
  group: Tab;
}) {
  return (
    <tr>
      <td colSpan={cols} className="py-12 text-center text-[13.5px] text-muted-foreground">
        รอบเวลาทำงานของกลุ่มนี้ยังไม่ปิด จึงยังคำนวณไม่ได้
        <Link href={payHref("/hr/timesheet", group, month, range)} className="mt-1 block font-semibold text-primary underline">
          ไปปิดรอบที่หน้าสรุปเวลาทำงาน
        </Link>
      </td>
    </tr>
  );
}


/** กติกาหักมาสายที่ผู้ดูแลระบบเลือกไว้ (/admin/schedule) เป็นข้อความสั้น */
function lateRuleText() {
  const r = settings().rates;
  return r.lateMode === "fixed"
    ? `มาสายหักนาทีละ ${baht(r.latePerMinute)} บาท`
    : "มาสายหักตามนาทีจากฐานเงินเดือน";
}

/** ป้ายสถานะการอนุมัติของ CEO ข้างปุ่มปิดรอบ (กลับมาใช้ ผู้ใช้สั่ง 19 ต.ค. 2569) */
function CeoTag({ ap, drifted }: { ap: PayApproval; drifted: boolean }) {
  if (drifted) {
    return (
      <span className="tag t-late">
        <i />
        ยอดเปลี่ยนหลัง CEO อนุมัติ กำลังส่งใหม่
      </span>
    );
  }
  if (ap.status === "waiting") {
    return (
      <span className="tag t-early">
        <i />
        {(ap.ver ?? 0) > 0 ? `แก้ไขแล้ว รออนุมัติใหม่ (ส่งใหม่ครั้งที่ ${ap.ver})` : "รอ CEO อนุมัติ"}
      </span>
    );
  }
  if (ap.status === "approved") {
    return (
      <span className="tag t-ok">
        <i />
        CEO อนุมัติแล้ว {ap.at ? thaiStamp(ap.at) : ""}
      </span>
    );
  }
  if (ap.status === "rejected") {
    return (
      <span className="tag t-late">
        <i />
        CEO ไม่อนุมัติ: {ap.reason}
      </span>
    );
  }
  /* กลับเป็นร่างทั้งที่เคยส่งไปแล้ว — บอกเหตุผลไว้ HR จะได้รู้ว่าทำไมต้องส่งใหม่ */
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
