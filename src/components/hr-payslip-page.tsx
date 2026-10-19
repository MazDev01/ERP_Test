"use client";

/*
 * สลิปเงินเดือน — สร้างจากรอบที่ปิดการคำนวณแล้วเท่านั้น
 *
 * เผยแพร่ทีเดียวทั้งรอบ ไม่ใช่ส่งทีละคน เพราะสลิปคือผลของการคำนวณรอบเดียวกัน
 * ถ้าปล่อยให้ทยอยเผยแพร่ จะมีช่วงที่บางคนเห็นตัวเลขเก่าบางคนเห็นตัวเลขใหม่
 *
 * แยกสองกลุ่มเหมือนรอบเวลาและรอบเงินเดือน — รายเดือนกับทดลองงานจ่ายรายวันคิดคนละฐาน
 * สร้างและเผยแพร่ของใครของมัน กลุ่มที่ปิดรอบก่อนไม่ต้องรออีกกลุ่ม
 *
 * เผยแพร่แล้วแก้ไม่ได้ ต้องยกเลิกการเผยแพร่ก่อนพร้อมเหตุผล
 * เพราะตัวเลขที่พนักงานเห็นไปแล้วเปลี่ยนเงียบ ๆ ไม่ได้
 *
 * ตัวเลขทุกช่องในหน้านี้อ่านจากยอดที่บันทึกไว้ตอนปิดรอบ (CycleSum.lines) ไม่ได้คำนวณใหม่
 * ถ้าคำนวณใหม่ สลิปที่เผยแพร่ไปแล้วจะเปลี่ยนตามเงินเดือนที่ขึ้นภายหลัง (HR-BR-03)
 * และการแก้ค่าตอบแทนย้ายไปอยู่หน้าคำนวณเงินเดือนตอนรอบยังเปิด — ที่นี่เหลือปุ่มที่กดไม่ลงพร้อมเหตุผล
 */

import Link from "next/link";
import { useRef, useState } from "react";
import { baht, thaiDate, thaiMonth, todayIso } from "@/lib/format";
import {
  HR_EMPTYPE,
  calcOfLine,
  earnOf,
  hrCycle,
  hrPos,
  inRange,
  dailyRateIn,
  dailyRoundId,
  defaultDailyRange,
  rangeLabel,
  probRoundLabel,
  isDaily,
  payIn,
  workedDaysIn,
  type Cycle,
  lineIn,
  type Employee,
  type PaySlipCalc,
  type PayGroup,
  type Slip,
  GROUP_LABEL,
} from "@/lib/hr-data";
import {
  countDailyDownload,
  countDailyView,
  countDownload,
  countView,
  makeDailySlips,
  makeSlips,
  publishDailySlips,
  unpublishDailySlips,
  publishSlips,
  unpublishSlips,
  useHr,
} from "@/lib/hr-store";
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
import { useComSource, useHrTime } from "@/lib/hr-link";
import {
  BanIcon,
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PencilIcon,
  PrintIcon,
} from "./icons";
import { Sheet } from "./lead-dialogs";
import { Field, Input } from "./ui";
import { PayslipPaper, printSlip, slipModel, slipYtd } from "./payslip-paper";

type SlipState = "none" | "made" | "pub";

/* เหตุผลเดียวกันทุกปุ่มที่กดไม่ลงในหน้านี้ — ผู้ใช้ต้องอ่านแล้วรู้ว่าต้องไปทำอะไรต่อ */
const LOCK_WHY =
  "รอบเงินเดือนปิดแล้ว แก้ตัวเลขไม่ได้ · ถ้าคำนวณผิด ให้บันทึกเป็นรายการปรับปรุงในรอบถัดไป";

const STATE: Record<SlipState, { label: string; cls: string }> = {
  /* ไม่มีปุ่มสร้างสลิปแยกแล้ว — ยังไม่ส่ง = รอส่งสลิป (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  none: { label: "รอส่งสลิป", cls: "t-early" },
  made: { label: "รอส่งสลิป", cls: "t-early" },
  pub: { label: "ส่งสลิปแล้ว", cls: "t-ok" },
};

export function HrPayslipPage() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const today = todayIso();
  const months = hr.periods.map((p) => p.month);

  /* เปิดมาที่รอบล่าสุดที่ปิดเงินเดือนแล้ว (ต้นแบบเปิดที่รอบที่มีสลิป) ยังไม่มีรอบที่ปิดค่อยใช้รอบล่าสุด */
  /* มาจากขั้นก่อนหน้าพร้อม ?m= แสดงรอบนั้นเลย (ต้นแบบ urlMonth) */
  const urlMonth = useUrlMonth(months);
  /* คิดใหม่ทุกครั้งที่ยังไม่ได้เลือกเอง — useState จำค่าตอน hydrate ซึ่งสโตร์ยังเป็นค่าตั้งต้น
     รอบที่เพิ่งปิดไปจึงไม่ถูกเลือก แล้วหน้านี้เปิดค้างที่รอบเก่าที่เผยแพร่ไปแล้ว */
  const [picked, setMonth] = useState("");
  const month =
    picked ||
    urlMonth ||
    ([...hr.payruns]
      .filter((p) => p.closed)
      .sort((a, b) => b.month.localeCompare(a.month))[0]?.month ??
      months[months.length - 1]);
  const monthIdx = months.indexOf(month);
  const [viewing, setViewing] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  /* มือถือ: เลือกกลุ่มจากสี่เหลี่ยมก่อน (ต้นแบบ m-pay-tiles) · แผ่นปฏิทินเลือกเดือนแทนแถบเลื่อนเดือน */
  const g = usePayGroup();
  /* กลุ่มมาจากเมนูย่อย (?g=) ไม่มีแท็บในหน้าแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
     สลับกลุ่มแล้วหน้าเดิมไม่ถูกสร้างใหม่ จึงปิดกล่องสลิปที่ค้างไว้เอง */
  const tab: PayGroup = g.group === "daily" ? "day" : "month";
  const [seenTab, setSeenTab] = useState(tab);
  if (seenTab !== tab) {
    setSeenTab(tab);
    setViewing(null);
  }
  const [cal, setCal] = useState(false);

  const payrun = hr.payruns.find((p) => p.month === month);
  const slip = hr.slips.find((s) => s.month === month);
  /* สถานะของกลุ่มที่เปิดอยู่ — อีกกลุ่มเดินของมันเอง */
  const day = tab === "day";

  /*
   * กลุ่มทดลองงาน — สลิปออกทีละรอบจ่ายรายวัน (ช่วงวันที่) ไม่ใช่รอบเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569)
   * ค่าตั้งต้น: รอบที่ปิดเงินเดือนแล้วแต่ยังไม่ส่งสลิป ล่าสุด → รอบที่ส่งแล้วล่าสุด → ต่อจากรอบล่าสุดถึงวันนี้
   */
  const urlRange = useUrlRange();
  const [pickedRange, setPickedRange] = useState<Cycle | null>(null);
  const lastPaid = [...hr.dailyRounds].filter((r) => r.payClosedAt).sort((a, b) => b.to.localeCompare(a.to))[0];
  const dayRange =
    pickedRange ??
    urlRange ??
    (hr.dailyRounds.some((r) => r.payClosedAt && !r.published)
      ? defaultDailyRange(hr.dailyRounds, today, (r) => Boolean(r.payClosedAt) && !r.published)
      : lastPaid
        ? { from: lastPaid.from, to: lastPaid.to }
        : defaultDailyRange(hr.dailyRounds, today));
  const round = day ? hr.dailyRounds.find((r) => r.id === dailyRoundId(dayRange)) : undefined;

  const payClosed = day ? Boolean(round?.payClosedAt) : Boolean(payrun?.closed);
  const madeAt = day ? round?.slipsMadeAt : slip?.madeAt;
  const published = day ? Boolean(round?.published) : Boolean(slip?.published);

  const state: SlipState = !madeAt ? "none" : published ? "pub" : "made";
  const locked = state === "pub";
  /* ส่งสลิป = สร้าง (ถ้ายังไม่เคย) แล้วเปิดกล่องยืนยันการส่ง · ส่งแล้วกดอีกครั้ง = ยกเลิกการส่ง */
  function sendSlips() {
    if (state === "none") {
      if (day) {
        if (round) makeDailySlips(round.id, today);
      } else makeSlips(month, today, tab);
    }
    setPublishing(true);
  }

  const cycle: Cycle = day ? dayRange : hrCycle(month);
  const roundLabel = day ? probRoundLabel(dayRange) : thaiMonth(month);
  const people = hr.emp.filter((e) => inRange(e, cycle) && (day ? isDaily(e, cycle) : !isDaily(e, cycle)));
  /* ส่ง today เข้าไปเสมอ — ค่าจ้างรายวันนับถึงวันนี้เหมือนหน้าคำนวณเงินเดือน
     ถ้าไม่ส่ง ยอดค่าจ้างจะคิดทั้งรอบแต่คอลัมน์ "วันที่มาทำงาน" นับถึงวันนี้ สองช่องในแถวเดียวกันจะไม่ตรงกัน */
  /*
   * ยอดที่บันทึกไว้ตอนปิดรอบมาก่อนเสมอ — สลิปต้องแสดงตัวเลข ณ วันปิดรอบ ไม่ใช่คิดใหม่ทุกครั้งที่เปิดหน้า
   * รอบเก่าที่ปิดไว้ก่อนระบบเก็บยอด (ไม่มี snapshot) จึงค่อยคิดสดด้วยสูตรเดียวกับหน้าคำนวณเงินเดือน
   */
  const rows = people.map((e) => {
    const saved = day
      ? (round?.payClosedAt ? round.sum?.lines.find((x) => x.id === e.id) : undefined) ?? null
      : lineIn(payrun, tab, e.id);
    return {
      e,
      c: saved ? calcOfLine(saved) : payIn(e, cycle, time, hr.extras, today, src),
      days: saved ? saved.days : workedDaysIn(e, cycle, time, today),
      rate: saved ? saved.rate : dailyRateIn(e, cycle),
      snapped: Boolean(saved),
    };
  });

  const current = viewing ? rows.find((x) => x.e.id === viewing) : undefined;

  /* เปลี่ยนรอบแล้วปิดกล่องที่ค้างอยู่ — กล่องเป็นของรอบเดิม */
  function switchMonth(m: string | undefined) {
    if (!m) return;
    setMonth(m);
    setViewing(null);
  }

  function openSlip(id: string) {
    setViewing(id);
    /* นับเฉพาะรอบที่เผยแพร่แล้ว ก่อนหน้านั้นคนที่เปิดคือ HR เองที่มาตรวจงาน */
    if (day) {
      if (round) countDailyView(round.id, id);
    } else countView(month, id);
  }

  function pickDayRange(c: Cycle) {
    setPickedRange(c);
    setViewing(null);
  }

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`}>
      <PayHead
        title={roundLabel}
        onBack={g.picked ? g.home : undefined}
        onCal={day ? undefined : () => setCal(true)}
        calLabel="เลือกเดือน"
      />
      <PayTiles onOpen={g.open} />

      {/* ขั้นตอนย้ายไปเป็นแท็บที่หัวแผงตาราง ตัวกรองอยู่ขวาบนของหน้า (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
      <div className="bar">
        {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
        <h1 className="page-h1">สลิปเงินเดือน</h1>
        <div className="tools ml-auto">
          {day ? (
            <DayRangePicker value={dayRange} max={today} onChange={pickDayRange} rounds={hr.dailyRounds} />
          ) : (
            /* เลื่อนรอบทีละเดือนตามต้นแบบ — ไปได้เฉพาะรอบที่มีในระบบ */
            <MonthStepper months={months} value={month} onChange={switchMonth} />
          )}
        </div>
      </div>

      <HrSteps month={month} range={day ? dayRange : null} group={g.group} className="md:hidden" />
      {day && (
        <div className="hp-only-m">
          <DayRangePicker value={dayRange} max={today} onChange={pickDayRange} rounds={hr.dailyRounds} />
        </div>
      )}

      <section className="panel glass flex flex-col">
        <div className="strip">
          <HrStepTabs month={month} range={day ? dayRange : null} group={g.group} />
          {/* มือถือใช้แถวปุ่มเต็มความกว้างข้างล่างแทน (.hp-slipact) */}
          <span className="my-2 ml-auto flex gap-2 max-md:hidden">
            <button
              type="button"
              className="btn solid btn-solid h-9 disabled:opacity-45"
              disabled={!payClosed}
              onClick={sendSlips}
            >
              {locked ? "ยกเลิกการส่งสลิป" : "ส่งสลิป"}
            </button>
          </span>
        </div>

        {/* มือถือ: สร้าง/เผยแพร่เป็นแถวปุ่มเต็มความกว้าง (ต้นแบบ slipact)
            ปุ่มสร้างกดไม่ได้เพราะสร้างไปแล้ว ต้องบอกบนหน้าจอ (ต้นแบบ ps-hint) */}
        <div className="hp-only-m">
          <div className="hp-slipact">
            <button
              type="button"
              className="btn solid btn-solid"
              disabled={!payClosed}
              onClick={sendSlips}
            >
              {locked ? "ยกเลิกการส่งสลิป" : "ส่งสลิป"}
            </button>
          </div>
        </div>

        {/* ไม่มีข้อความอธิบายการทำงานของระบบตอนปิดรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}

        {/* ไม่จองร่องแถบเลื่อน ตารางเต็มกล่อง ไม่มีแถบขาวด้านขวา (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
        <div className="min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm">
            <thead>
              <tr>
                <th style={{ width: 160 }}>พนักงาน</th>
                {day ? (
                  <>
                    <th className="r" style={{ width: 120 }}>
                      อัตรารายวัน
                      <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                    </th>
                    <th className="c" style={{ width: 120 }}>
                      วันที่มาทำงาน
                      <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(วัน)</span>
                    </th>
                  </>
                ) : null /* ไม่มีคอลัมน์ประเภท — อยู่ในเมนูพนักงานอยู่แล้ว (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                <th className="r" style={{ width: 120 }}>
                  รวมรายได้
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                {/* รายการหักแยกสามช่อง ไม่รวมเป็นช่องเดียว (ผู้ใช้กำหนด 24 ก.ย. 2569)
                    สลิปคือเอกสารที่พนักงานใช้ตรวจว่าถูกหักอะไรไปบ้าง ยอดรวมช่องเดียวต้องไปถามฝ่ายบุคคลทุกครั้ง
                    ค่าใช้จ่ายคืนไม่ใช่รายการหัก จึงอยู่ช่องฝั่งบวกของตัวเอง
                    บวกลบตามได้ด้วยตาเปล่า — รวมรายได้ − ประกันสังคม − หักมาสาย ± ปรับปรุง + ค่าใช้จ่ายคืน = สุทธิ */}
                {!day && (
                  <th className="r" style={{ width: 120 }}>
                    ประกันสังคม
                    <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                  </th>
                )}
                <th className="r" style={{ width: 110 }}>
                  หักมาสาย
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                {/* ไม่มีคอลัมน์ ปรับปรุงอื่น · ค่าใช้จ่ายคืน (ผู้ใช้สั่ง 6 ต.ค. 2569) — ยังรวมในยอดสุทธิและอยู่บนสลิป */}
                <th className="r" style={{ width: 150 }}>
                  ยอดสุทธิ
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                <th style={{ width: 140 }}>สถานะสลิป</th>
              </tr>
            </thead>
            <tbody>
              {!payClosed ? (
                /* กันข้ามขั้น — สลิปที่สร้างจากตัวเลขที่ยังขยับได้คือสลิปที่ต้องออกใหม่แน่นอน
                     คงหัวตารางไว้ตามต้นแบบ บอกว่าติดตรงไหนแล้วพาไปแก้ที่ต้นเหตุ */
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-[13.5px] text-muted-foreground"
                  >
                    รอบเงินเดือนของกลุ่มนี้ยังไม่ปิด จึงยังสร้างสลิปไม่ได้
                    <Link
                      href={payHref("/hr/payroll", g.group, month, day ? dayRange : null)}
                      className="mt-1 block font-semibold text-primary underline"
                    >
                      ไปปิดรอบที่หน้าคำนวณเงินเดือน
                    </Link>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {day
                      ? "ไม่มีพนักงานทดลองงานในรอบนี้"
                      : "ไม่มีพนักงานรายเดือนในรอบนี้"}
                  </td>
                </tr>
              ) : (
                rows.map(({ e, c: pay, days, rate }) => (
                  /* กดที่แถวเพื่อดูสลิป (ต้นแบบ) — ปุ่มดินสอแก้ค่าตอบแทนอยู่ท้ายแถว */
                  <tr
                    key={e.id}
                    tabIndex={0}
                    style={{ cursor: "pointer" }}
                    onClick={() => openSlip(e.id)}
                    onKeyDown={(ev) => {
                      if (ev.key === "Enter" || ev.key === " ") {
                        ev.preventDefault();
                        openSlip(e.id);
                      }
                    }}
                    aria-label={`ดูสลิปของ ${e.name}`}
                  >
                    <td data-label="พนักงาน">
                      <Who emp={e} />
                    </td>
                    {day ? (
                      <>
                        <td data-label="อัตรารายวัน" className="r num">
                          {baht(rate)}
                        </td>
                        <td data-label="วันที่มาทำงาน" className="c num">
                          {days}
                        </td>
                      </>
                    ) : null}
                    <td
                      data-label="รวมรายได้"
                      className="r num"
                    >
                      {baht(earnOf(pay.gross, pay.adj))}
                    </td>
                    {!day && <Cut label="ประกันสังคม" v={pay.ss} />}
                    <Cut label="หักมาสาย" v={pay.late} />
                    <td data-label="ยอดสุทธิ" className="r num font-semibold">
                      {baht(pay.net)}
                    </td>
                    <td data-label="สถานะสลิป">
                      <span className={`tag ${STATE[state].cls}`}>
                        <i />
                        {STATE[state].label}
                      </span>
                    </td>
                    {/* ไม่มีคอลัมน์จัดการ — ปุ่มแก้ในหน้านี้กดไม่ได้อยู่แล้วเพราะรอบปิด (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* มือถือ: การ์ดคนละใบ ตัวเลขเป็นแถวชื่อซ้ายค่าขวา ยอดสุทธิพื้นชมพู สถานะสลิปท้ายการ์ด (ต้นแบบ pay-rows)
            แตะการ์ดเพื่อดูสลิป */}
        <PayList
          empty={
            !payClosed ? (
              <>
                รอบเงินเดือนของกลุ่มนี้ยังไม่ปิด จึงยังสร้างสลิปไม่ได้
                <Link
                  href={payHref("/hr/payroll", g.group, month, day ? dayRange : null)}
                  className="mt-2 block font-semibold text-primary underline"
                >
                  ไปปิดรอบที่หน้าคำนวณเงินเดือน
                </Link>
              </>
            ) : rows.length === 0 ? (
              day ? "ไม่มีพนักงานทดลองงานในรอบนี้" : "ไม่มีพนักงานรายเดือนในรอบนี้"
            ) : undefined
          }
        >
          {rows.map(({ e, c: pay, days, rate }) => (
            <PayCard
              key={e.id}
              title={e.name}
              sub={day ? hrPos(e.pos).label : `${hrPos(e.pos).label} · ${HR_EMPTYPE[e.type].label}`}
              onOpen={() => openSlip(e.id)}
              openLabel={`ดูสลิปของ ${e.name}`}
              corner={
                /* เผยแพร่แล้วปุ่มแก้หายไป เหมือนคอลัมน์จัดการบนจอกว้าง · ก่อนเผยแพร่กดไม่ลงพร้อมเหตุผล */
                !day && !locked ? (
                  <PayIconBtn label={`แก้ค่าตอบแทนของ ${e.name}`} title={LOCK_WHY} disabled>
                    <PencilIcon strokeWidth={1.9} />
                  </PayIconBtn>
                ) : undefined
              }
              rows={[
                ...(day
                  ? [
                      { label: "อัตรารายวัน (บาท)", value: baht(rate) },
                      { label: "วันที่มาทำงาน (วัน)", value: days },
                    ]
                  : []),
                { label: "รวมรายได้ (บาท)", value: baht(earnOf(pay.gross, pay.adj)) },
                /* มือถือก็ต้องเห็นรายการหักครบสามช่อง ไม่ใช่ยอดรวมช่องเดียว
                   บวกลบตามได้ครบ: รายได้ − ประกันสังคม − หักมาสาย ± ปรับปรุง + ค่าใช้จ่ายคืน = สุทธิ */
                ...(day ? [] : [cutRow("ประกันสังคม", pay.ss)]),
                cutRow("หักมาสาย", pay.late),
                cutRow("รายการหักอื่น", -pay.adj),
                ...(day ? [cutRow("ภาษีหัก ณ ที่จ่าย 3%", pay.wht)] : []),
                pay.reimb
                  ? { label: "ค่าใช้จ่ายคืน", value: `+${baht(pay.reimb)}` }
                  : { label: "ค่าใช้จ่ายคืน", value: "—", muted: true },
              ]}
              net={{ label: "ยอดสุทธิ (บาท)", value: baht(pay.net) }}
              status={{
                label: "สถานะสลิป",
                value: (
                  <span className={`tag ${STATE[state].cls}`}>
                    <i />
                    {STATE[state].label}
                  </span>
                ),
              }}
            />
          ))}
        </PayList>
      </section>

      {current && (
        <SlipView
          emp={current.e}
          label={roundLabel}
          slipKey={day ? dailyRoundId(dayRange) : month}
          day={day}
          pay={current.c}
          /* วันที่บนสลิปทดลองงาน = วันที่เผยแพร่ของรอบ ยังไม่เผยแพร่ = วันนี้ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
          pubAt={day ? round?.publishedAt : undefined}
          days={current.days}
          rate={current.rate}
          stats={
            day
              ? round && { views: round.views[current.e.id] ?? 0, downloads: round.downloads[current.e.id] ?? 0 }
              : slip && { views: slip.views[current.e.id] ?? 0, downloads: slip.downloads[current.e.id] ?? 0 }
          }
          onDownloaded={() =>
            day ? round && countDailyDownload(round.id, current.e.id) : countDownload(month, current.e.id)
          }
          published={locked}
          onClose={() => setViewing(null)}
        />
      )}

      {cal && (
        <PayCalendar
          months={months}
          selected={month}
          mode="month"
          today={today}
          onPick={switchMonth}
          onClose={() => setCal(false)}
        />
      )}

      {publishing && (
        <PublishDialog
          label={roundLabel}
          range={cycle}
          group={tab}
          undo={locked}
          count={rows.length}
          madeAt={madeAt ?? ""}
          pubAt={(day ? round?.publishedAt : slip?.publishedAt) ?? ""}
          onConfirm={(undo, why) => {
            if (day) {
              if (!round) return;
              if (undo) unpublishDailySlips(round.id, today, why);
              else publishDailySlips(round.id, today);
            } else if (undo) unpublishSlips(month, today, why, tab);
            else publishSlips(month, today, tab);
          }}
          onClose={() => setPublishing(false)}
        />
      )}
    </div>
  );
}

function Who({ emp }: { emp: Employee }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="min-w-0">
        <b className="block truncate text-[13.5px] font-semibold">{emp.name}</b>
        <em className="block truncate text-[11.5px] not-italic text-muted-foreground">
          {hrPos(emp.pos).label}
        </em>
      </span>
    </span>
  );
}

/**
 * ช่องรายการหักหนึ่งช่อง — ส่งยอดที่ "ถูกหักไป" เข้ามา (ปรับปรุงจึงเป็น -adj)
 * ติดลบคือคืนกลับเข้ายอด ขึ้นเครื่องหมายบวกแบบเดียวกับค่าใช้จ่ายคืน ไม่ใช่สีแดง
 */
function Cut({ label, v }: { label: string; v: number }) {
  return (
    <td
      data-label={label}
      className={`r ${v ? `num ${v > 0 ? "text-destructive" : ""}` : "text-muted-foreground"}`}
    >
      {v ? (v > 0 ? `-${baht(v)}` : `+${baht(-v)}`) : "—"}
    </td>
  );
}

/** ช่องเดียวกันบนการ์ดมือถือ — ศูนย์เป็นขีดจาง จะได้ไม่มีตัวเลขไหนหายไปจากสายตา */
function cutRow(label: string, v: number): PayCardRow {
  if (!v) return { label, value: "—", muted: true };
  return v > 0
    ? { label, value: `-${baht(v)}`, tone: "text-destructive" }
    : { label, value: `+${baht(-v)}` };
}

// ─── ตัวสลิป ──────────────────────────────────────────────────────

/*
 * กระดาษสลิปตามแบบที่เจ้าของส่งมา (ผู้ใช้สั่ง 16 ต.ค. 2569) — ใช้ PayslipPaper ตัวเดียวกับสลิปของฉัน
 * ดาวน์โหลดเป็น PDF (สั่งพิมพ์เฉพาะกระดาษ) แทน CSV เดิม ซึ่งมีรหัสพนักงานติดไปด้วย
 */
function SlipView({
  emp,
  label,
  slipKey,
  day,
  pay,
  pubAt,
  days,
  rate,
  stats,
  onDownloaded,
  published,
  onClose,
}: {
  emp: Employee;
  /** ชื่อรอบ — รอบเดือน "กันยายน 2569" หรือรอบจ่ายรายวัน "6 – 8 ต.ค. 2569" (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  label: string;
  /** คีย์รอบ — "yyyy-mm" หรือ "จาก~ถึง" ของรอบจ่ายรายวัน */
  slipKey: string;
  day: boolean;
  /** ยอดของคนนี้ — มาจาก snapshot ตอนปิดรอบถ้ามี ไม่ได้คำนวณใหม่ในนี้ */
  pay: PaySlipCalc;
  pubAt?: string;
  days: number;
  rate: number;
  /** ครั้งที่เปิดดู/ดาวน์โหลดของคนนี้ — ไม่มี = ยังไม่มีบันทึกของรอบนี้ */
  stats: { views: number; downloads: number } | undefined;
  onDownloaded: () => void;
  published: boolean;
  onClose: () => void;
}) {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const model = slipModel({ emp, key: slipKey, day, pay, days, rate, time });
  const ytd = slipYtd(hr, emp, time, src, slipKey, model);

  function download() {
    printSlip();
    onDownloaded();
  }

  return (
    <Sheet
      title={`สลิปเงินเดือน · ${emp.name} · ${label}`}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-muted-foreground">
            {published && stats
              ? `เปิดดู ${stats.views} ครั้ง · ดาวน์โหลด ${stats.downloads} ครั้ง`
              : "ยังไม่เผยแพร่"}
          </span>
          <button
            type="button"
            className="btn glass-thin disabled:opacity-45"
            disabled={!published}
            title={published ? undefined : "เผยแพร่ก่อนจึงจะพิมพ์ได้"}
            onClick={printSlip}
          >
            <PrintIcon className="size-[15px]" strokeWidth={1.9} />
            พิมพ์
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={!published}
            title={published ? undefined : "เผยแพร่ก่อนจึงจะดาวน์โหลดได้"}
            onClick={download}
          >
            <DownloadIcon className="size-3.5" strokeWidth={2} />
            ดาวน์โหลด PDF
          </button>
        </>
      }
    >
      {/* hp-dlg = มือถือเปิดเป็นแผ่นเลื่อนขึ้นแบบเดียวกับกล่องอื่นของรอบเงินเดือน · กระดาษ A4 เลื่อนข้างได้บนจอแคบ */}
      <div className="hp-dlg">
        <div className="overflow-x-auto">
          <PayslipPaper emp={emp} input={{ key: slipKey, day, at: pubAt }} model={model} ytd={ytd} />
        </div>
      </div>
    </Sheet>
  );
}

// ─── เผยแพร่และยกเลิกการเผยแพร่ ───────────────────────────────────

function PublishDialog({
  label,
  range: c,
  group,
  undo,
  count,
  madeAt,
  pubAt,
  onConfirm,
  onClose,
}: {
  /** ชื่อรอบ — รอบเดือนหรือช่วงวันของรอบจ่ายรายวัน (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  label: string;
  range: Cycle;
  group: PayGroup;
  undo: boolean;
  count: number;
  madeAt: string;
  /** เผยแพร่ไปแล้วเมื่อไร — กล่องยกเลิกต้องบอก ไม่งั้นคนกดไม่รู้ว่ากำลังถอนของเมื่อไร */
  pubAt: string;
  /** ส่ง / ยกเลิกการส่งพร้อมเหตุผล — หน้าที่เรียกเลือกว่าเป็นรอบเดือนหรือรอบรายวัน */
  onConfirm: (undo: boolean, why: string) => void;
  onClose: () => void;
}) {
  const [why, setWhy] = useState("");
  /** ยกเลิกการเผยแพร่โดยไม่ระบุเหตุผล — ขึ้นคำเตือนตาม mockup */
  const [warn, setWarn] = useState(false);
  const whyBox = useRef<HTMLDivElement>(null);
  const ready = !undo || why.trim() !== "";

  return (
    <Sheet
      title={undo ? "ยกเลิกการส่งสลิปเงินเดือน" : "ส่งสลิปเงินเดือน"}
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
              if (!ready) {
                setWarn(true);
                whyBox.current?.querySelector("input")?.focus();
                return;
              }
              onConfirm(undo, why.trim());
              onClose();
            }}
          >
            ยืนยัน
          </button>
        </>
      }
    >
      <div className="hp-dlg">
      {/* มือถือ: รอบ ช่วงวันที่ และกลุ่ม รวมเป็นกล่องชมพูบนสุด (ต้นแบบ p.rule) */}
      <p className="hp-rule hp-only-m">
        <b>รอบ {label}</b>
        <span>
          {thaiDate(c.from)} – {thaiDate(c.to)}
        </span>
        <span className="g">กลุ่ม {GROUP_LABEL[group]}</span>
      </p>
      {/* ป้าย-ค่าเรียงกัน อ่านทีเดียวจบว่ากำลังทำอะไรกับรอบไหนของกลุ่มไหน */}
      <dl className="hp-kv grid gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)]">
        <Pair k="รอบการจ่าย" v={label} mHide />
        <Pair k="ช่วงวันที่" v={`${thaiDate(c.from)} – ${thaiDate(c.to)}`} mHide />
        <Pair k="กลุ่มพนักงาน" v={GROUP_LABEL[group]} mHide />
        {undo ? (
          <Pair k="เผยแพร่เมื่อ" v={pubAt ? thaiDate(pubAt) : "—"} />
        ) : (
          <>
            <Pair k="จำนวนสลิป" v={`${count} ใบ`} />
            <Pair k="สร้างเมื่อ" v={madeAt ? thaiDate(madeAt) : "—"} />
          </>
        )}
      </dl>

      {undo ? (
        <>
          {/* ผลที่ตามมาต้องอ่านก่อนกด ไม่ใช่รู้ตอนพนักงานโทรมาถามว่าสลิปหายไปไหน */}
          <p className="mt-4 flex items-start gap-2.5 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-destructive">
            <BanIcon className="mt-0.5 size-4 flex-none" strokeWidth={2} />
            <span>
              ยกเลิกการเผยแพร่แล้วพนักงานจะเรียกดูไม่ได้
              ต้องแก้ที่การคำนวณเงินเดือนแล้วสร้างและเผยแพร่ใหม่
            </span>
          </p>
          <div className="mt-4" ref={whyBox}>
            <Field label="เหตุผลที่ยกเลิกการเผยแพร่" required>
              <Input
                value={why}
                onChange={(e) => {
                  setWhy(e.target.value);
                  if (e.target.value) setWarn(false);
                }}
                placeholder="เช่น ค่าตำแหน่งของสองคนบันทึกสลับกัน"
              />
            </Field>
            {warn && (
              <p className="mt-2.5 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
                ยกเลิกการเผยแพร่ต้องระบุเหตุผล
              </p>
            )}
          </div>
        </>
      ) : null}
      </div>
    </Sheet>
  );
}

/** mHide = มือถือไม่แสดง (ย้ายไปอยู่ในกล่องสรุปรอบด้านบนแล้ว) */
function Pair({ k, v, mHide }: { k: string; v: string; mHide?: boolean }) {
  const hide = mHide ? "max-md:hidden" : "";
  return (
    <>
      <dt className={`text-[12.5px] font-semibold text-muted-foreground ${hide}`}>{k}</dt>
      <dd className={`num font-semibold ${hide}`}>{v}</dd>
    </>
  );
}
