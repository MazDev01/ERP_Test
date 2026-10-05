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

import { settings } from "@/lib/system-settings";
import Link from "next/link";
import { useRef, useState } from "react";
import { baht, thaiDate, thaiMonth, todayIso } from "@/lib/format";
import {
  HR_EMPTYPE,
  calcOfLine,
  ceilingOf,
  cutOf,
  earnOf,
  hrCycle,
  hrDept,
  hrPos,
  inPeriod,
  dailyRateIn,
  isDaily,
  payIn,
  prorate,
  workedDaysIn,
  extraOf,
  lineIn,
  type Adjust,
  type Employee,
  type PaySlipCalc,
  type PayGroup,
  type Slip,
  GROUP_LABEL,
} from "@/lib/hr-data";
import {
  countDownload,
  countView,
  makeSlips,
  publishSlips,
  unpublishSlips,
  useHr,
} from "@/lib/hr-store";
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
import { useComSource, useHrTime } from "@/lib/hr-link";
import {
  BanIcon,
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DownloadIcon,
  PencilIcon,
} from "./icons";
import { Sheet } from "./lead-dialogs";
import { Field, Input } from "./ui";
import { downloadCsv, toCsv } from "@/lib/report-export";

type SlipState = "none" | "made" | "pub";

/* เหตุผลเดียวกันทุกปุ่มที่กดไม่ลงในหน้านี้ — ผู้ใช้ต้องอ่านแล้วรู้ว่าต้องไปทำอะไรต่อ */
const LOCK_WHY =
  "รอบเงินเดือนปิดแล้ว แก้ตัวเลขไม่ได้ · ถ้าคำนวณผิด ให้บันทึกเป็นรายการปรับปรุงในรอบถัดไป หรือเปิดรอบกลับที่หน้าคำนวณเงินเดือน";

const STATE: Record<SlipState, { label: string; cls: string }> = {
  none: { label: "ยังไม่ได้สร้าง", cls: "t-miss" },
  made: { label: "สร้างแล้ว รอเผยแพร่", cls: "t-early" },
  pub: { label: "เผยแพร่แล้ว", cls: "t-ok" },
};

export function HrPayslipPage() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const today = todayIso();
  const months = hr.periods.map((p) => p.month);

  /* เปิดมาที่รอบล่าสุดที่ปิดเงินเดือนแล้ว (ต้นแบบเปิดที่รอบที่มีสลิป) ยังไม่มีรอบที่ปิดค่อยใช้รอบล่าสุด */
  /* มาจากขั้นก่อนหน้าพร้อม ?m= เปิดรอบนั้นเลย (ต้นแบบ urlMonth) */
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
  const payClosed = Boolean(day ? payrun?.dayClosed : payrun?.closed);
  const madeAt = day ? slip?.dayMadeAt : slip?.madeAt;
  const published = Boolean(day ? slip?.dayPublished : slip?.published);

  const state: SlipState = !madeAt ? "none" : published ? "pub" : "made";
  const locked = state === "pub";

  const inCycle = hr.emp.filter((e) => inPeriod(e, month));
  const people = inCycle.filter((e) => (day ? isDaily(e) : !isDaily(e)));
  const cycle = hrCycle(month);
  /* ส่ง today เข้าไปเสมอ — ค่าจ้างรายวันนับถึงวันนี้เหมือนหน้าคำนวณเงินเดือน
     ถ้าไม่ส่ง ยอดค่าจ้างจะคิดทั้งรอบแต่คอลัมน์ "วันที่มาทำงาน" นับถึงวันนี้ สองช่องในแถวเดียวกันจะไม่ตรงกัน */
  /*
   * ยอดที่บันทึกไว้ตอนปิดรอบมาก่อนเสมอ — สลิปต้องแสดงตัวเลข ณ วันปิดรอบ ไม่ใช่คิดใหม่ทุกครั้งที่เปิดหน้า
   * รอบเก่าที่ปิดไว้ก่อนระบบเก็บยอด (ไม่มี snapshot) จึงค่อยคิดสดด้วยสูตรเดียวกับหน้าคำนวณเงินเดือน
   */
  const rows = people.map((e) => {
    const saved = lineIn(payrun, tab, e.id);
    return {
      e,
      c: saved ? calcOfLine(saved) : payIn(e, cycle, time, hr.extras, today, src),
      /* รายการปรับปรุงพร้อมเหตุผลของรอบที่ปิดไว้ — ของเดือนนั้นอาจถูกแก้ภายหลัง จึงอ่านจาก snapshot ก่อน */
      adjust: saved?.adjust ?? extraOf(hr.extras, e.id, month).adjust,
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
    countView(month, id);
  }

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`}>
      <PayHead
        title={thaiMonth(month)}
        onBack={g.picked ? g.home : undefined}
        onCal={() => setCal(true)}
        calLabel="เลือกเดือน"
      />
      <PayTiles onOpen={g.open} />

      <div className="bar">
        <div />
        <div className="tools">
          {/* เลื่อนรอบทีละเดือนตามต้นแบบ — ไปได้เฉพาะรอบที่มีในระบบ */}
          <div className="mo glass-thin">
            <button
              type="button"
              aria-label="เดือนก่อนหน้า"
              disabled={monthIdx <= 0}
              onClick={() => switchMonth(months[monthIdx - 1])}
            >
              <ChevronLeftIcon className="size-[15px]" strokeWidth={2.4} />
            </button>
            <span>{thaiMonth(month)}</span>
            <button
              type="button"
              aria-label="เดือนถัดไป"
              disabled={monthIdx >= months.length - 1}
              onClick={() => switchMonth(months[monthIdx + 1])}
            >
              <ChevronRightIcon className="size-[15px]" strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </div>

      <HrSteps month={month} group={g.group} />

      <section className="panel glass flex flex-col">
        <div className="strip">
          {/* แท็บสลับกลุ่มเอาออก — เลือกกลุ่มจากเมนูย่อยแทน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          {/* มือถือใช้แถวปุ่มเต็มความกว้างข้างล่างแทน (.hp-slipact) */}
          <span className="my-2 ml-auto flex gap-2 max-md:hidden">
            <button
              type="button"
              className="btn glass-thin h-9 disabled:opacity-45"
              disabled={!payClosed || state !== "none"}
              onClick={() => makeSlips(month, today, tab)}
            >
              สร้างสลิป
            </button>
            <button
              type="button"
              className="btn solid btn-solid h-9 disabled:opacity-45"
              disabled={!payClosed || state === "none"}
              onClick={() => setPublishing(true)}
            >
              {locked ? "ยกเลิกการเผยแพร่" : "เผยแพร่"}
            </button>
          </span>
        </div>

        {/* มือถือ: สร้าง/เผยแพร่เป็นแถวปุ่มเต็มความกว้าง (ต้นแบบ slipact)
            ปุ่มสร้างกดไม่ได้เพราะสร้างไปแล้ว ต้องบอกบนหน้าจอ (ต้นแบบ ps-hint) */}
        <div className="hp-only-m">
          <div className="hp-slipact">
            <button
              type="button"
              className="btn glass-thin"
              disabled={!payClosed || state !== "none"}
              onClick={() => makeSlips(month, today, tab)}
            >
              สร้างสลิป
            </button>
            <button
              type="button"
              className="btn solid btn-solid"
              disabled={!payClosed || state === "none"}
              onClick={() => setPublishing(true)}
            >
              {locked ? "ยกเลิกการเผยแพร่" : "เผยแพร่"}
            </button>
          </div>
          {payClosed && state !== "none" && <p className="hp-hint-ps">สร้างสลิปของรอบนี้แล้ว</p>}
        </div>

        {/* ปิดรอบแล้วต้องอ่านออกทันทีว่าทำไมทุกช่องแก้ไม่ได้ ไม่ใช่ให้ไปเดาเอาจากปุ่มที่กดไม่ลง */}
        {payClosed && (
          <p className="mx-3 mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
            ตัวเลขในหน้านี้เป็นยอดที่บันทึกไว้ตอนปิดรอบ แก้ไม่ได้ทุกช่อง · ถ้าคำนวณผิด
            ให้บันทึกเป็นรายการปรับปรุงในรอบถัดไปพร้อมเหตุผล หรือเปิดรอบกลับที่หน้าคำนวณเงินเดือน
          </p>
        )}

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[1160px]">
            <thead>
              <tr>
                <th>พนักงาน</th>
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
                ) : (
                  <th style={{ width: 110 }}>ประเภท</th>
                )}
                <th className="r" style={{ width: 120 }}>
                  {day ? "ค่าจ้าง" : "รวมรายได้"}
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                {/* รายการหักแยกสามช่อง ไม่รวมเป็นช่องเดียว (ผู้ใช้กำหนด 24 ก.ย. 2569)
                    สลิปคือเอกสารที่พนักงานใช้ตรวจว่าถูกหักอะไรไปบ้าง ยอดรวมช่องเดียวต้องไปถามฝ่ายบุคคลทุกครั้ง
                    ค่าใช้จ่ายคืนไม่ใช่รายการหัก จึงอยู่ช่องฝั่งบวกของตัวเอง
                    บวกลบตามได้ด้วยตาเปล่า — รวมรายได้ − ประกันสังคม − หักมาสาย ± ปรับปรุง + ค่าใช้จ่ายคืน = สุทธิ */}
                <th className="r" style={{ width: 120 }}>
                  ประกันสังคม
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                <th className="r" style={{ width: 110 }}>
                  หักมาสาย
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                <th className="r" style={{ width: 126 }}>
                  ปรับปรุงอื่น
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                <th className="r" style={{ width: 120 }}>
                  ค่าใช้จ่ายคืน
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                <th className="r" style={{ width: 150 }}>
                  ยอดสุทธิ
                  <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">(บาท)</span>
                </th>
                <th style={{ width: 140 }}>สถานะสลิป</th>
                {!day && (
                  <th className="c" style={{ width: 90 }}>
                    จัดการ
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {!payClosed ? (
                /* กันข้ามขั้น — สลิปที่สร้างจากตัวเลขที่ยังขยับได้คือสลิปที่ต้องออกใหม่แน่นอน
                     คงหัวตารางไว้ตามต้นแบบ บอกว่าติดตรงไหนแล้วพาไปแก้ที่ต้นเหตุ */
                <tr>
                  <td
                    colSpan={10}
                    className="py-12 text-center text-[13.5px] text-muted-foreground"
                  >
                    รอบเงินเดือนของกลุ่มนี้ยังไม่ปิด จึงยังสร้างสลิปไม่ได้
                    <Link
                      href={payHref("/hr/payroll", g.group, month)}
                      className="mt-1 block font-semibold text-primary underline"
                    >
                      ไปปิดรอบที่หน้าคำนวณเงินเดือน
                    </Link>
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={10}
                    className="py-12 text-center text-muted-foreground"
                  >
                    {day
                      ? "ไม่มีพนักงานจ่ายรายวันในรอบนี้"
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
                    ) : (
                      <td data-label="ประเภท" className="muted">
                        {HR_EMPTYPE[e.type].label}
                      </td>
                    )}
                    <td
                      data-label={day ? "ค่าจ้าง" : "รวมรายได้"}
                      className="r num"
                    >
                      {baht(day ? pay.base : earnOf(pay.gross, pay.adj))}
                    </td>
                    <Cut label="ประกันสังคม" v={pay.ss} />
                    <Cut label="หักมาสาย" v={pay.late} />
                    {/* ปรับปรุงติดลบคือหักเพิ่ม บวกคือคืนกลับ — เครื่องหมายต้องอ่านออกจากช่องเลย */}
                    <Cut label="ปรับปรุงอื่น" v={-pay.adj} />
                    {/* ใบเบิกที่อนุมัติแล้วบวกเข้ายอดสุทธิ ไม่ใช่รายได้ และไม่คิดประกันสังคม */}
                    <td data-label="ค่าใช้จ่ายคืน" className={`r ${pay.reimb ? "num" : "text-muted-foreground"}`}>
                      {pay.reimb ? `+${baht(pay.reimb)}` : "—"}
                    </td>
                    <td data-label="ยอดสุทธิ" className="r num font-semibold">
                      {baht(pay.net)}
                    </td>
                    <td data-label="สถานะสลิป">
                      <span className={`tag ${STATE[state].cls}`}>
                        <i />
                        {STATE[state].label}
                      </span>
                    </td>
                    {/* คอลัมน์จัดการมีเฉพาะตารางรายเดือน — แถวจ่ายรายวันไม่มีค่าตอบแทนที่ไม่มีสูตรให้แก้ (โครงใหม่) */}
                    {!day && (
                      <td data-label="จัดการ" className="c">
                        <span className="flex justify-center gap-1.5">
                          {/* เผยแพร่แล้วปุ่มแก้หายไปเลย ตัวเลขที่พนักงานเห็นแล้วไม่มีทางแก้ที่หน้านี้
                              ก่อนเผยแพร่ยังเห็นปุ่มอยู่ แต่กดไม่ลงพร้อมเหตุผล เพราะรอบปิดไปแล้ว (HR-BR-03) */}
                          {!locked && (
                            <button
                              type="button"
                              disabled
                              onClick={(ev) => ev.stopPropagation()}
                              aria-label={`แก้ค่าตอบแทนของ ${e.name}`}
                              title={LOCK_WHY}
                              className="iconbtn glass-thin size-8 cursor-not-allowed opacity-45"
                            >
                              <PencilIcon className="size-4" strokeWidth={1.9} />
                            </button>
                          )}
                        </span>
                      </td>
                    )}
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
                  href={payHref("/hr/payroll", g.group, month)}
                  className="mt-2 block font-semibold text-primary underline"
                >
                  ไปปิดรอบที่หน้าคำนวณเงินเดือน
                </Link>
              </>
            ) : rows.length === 0 ? (
              day ? "ไม่มีพนักงานจ่ายรายวันในรอบนี้" : "ไม่มีพนักงานรายเดือนในรอบนี้"
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
                { label: day ? "ค่าจ้าง (บาท)" : "รวมรายได้ (บาท)", value: baht(day ? pay.base : earnOf(pay.gross, pay.adj)) },
                /* มือถือก็ต้องเห็นรายการหักครบสามช่อง ไม่ใช่ยอดรวมช่องเดียว
                   บวกลบตามได้ครบ: รายได้ − ประกันสังคม − หักมาสาย ± ปรับปรุง + ค่าใช้จ่ายคืน = สุทธิ */
                cutRow("ประกันสังคม", pay.ss),
                cutRow("หักมาสาย", pay.late),
                cutRow("ปรับปรุงอื่น", -pay.adj),
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
          month={month}
          pay={current.c}
          adjust={current.adjust}
          days={current.days}
          rate={current.rate}
          snapped={current.snapped}
          slip={slip}
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
          month={month}
          group={tab}
          undo={locked}
          count={rows.length}
          madeAt={madeAt ?? ""}
          pubAt={(day ? slip?.dayPublishedAt : slip?.publishedAt) ?? ""}
          today={today}
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

function SlipView({
  emp,
  month,
  pay,
  adjust,
  days,
  rate,
  snapped,
  slip,
  published,
  onClose,
}: {
  emp: Employee;
  month: string;
  /** ยอดของคนนี้ — มาจาก snapshot ตอนปิดรอบถ้ามี ไม่ได้คำนวณใหม่ในนี้ */
  pay: PaySlipCalc;
  adjust: Adjust[];
  days: number;
  rate: number;
  /** ตัวเลขชุดนี้มาจากยอดที่ปิดรอบไว้หรือเปล่า — snapshot ไม่ได้เก็บจำนวนนาทีที่สาย */
  snapped: boolean;
  slip: Slip | undefined;
  published: boolean;
  onClose: () => void;
}) {
  const pr = prorate(emp, month);
  const cap = ceilingOf(month);
  const p = hrPos(emp.pos);
  const c = hrCycle(month);

  /* คนจ่ายรายวันคิดจากวันที่มาทำงานจริง บอกที่มาของค่าจ้างเป็นจำนวนวันคูณอัตราต่อวัน (ต้นแบบ slipHTML) */
  const income: [string, number][] = [
    [
      isDaily(emp)
        ? `ค่าจ้าง ${days} วัน (${baht(rate)} บาทต่อวัน)`
        : `เงินเดือน${pr.days < pr.total ? ` (${pr.days}/${pr.total} วัน)` : ""}`,
      pay.base,
    ],
  ];
  if (pay.ot) income.push(["ค่าล่วงเวลา", pay.ot]);
  if (pay.com) income.push(["ค่าคอมมิชชั่น", pay.com]);
  if (pay.inc) income.push(["Incentive", pay.inc]);
  if (pay.allow) income.push(["ค่าตำแหน่ง", pay.allow]);
  /* รายการปรับปรุงย้ายไปอยู่ตารางรายการหักพร้อมเหตุผล (ผู้ใช้กำหนด 24 ก.ย. 2569)
     รวมรายได้ของสลิปจึงไม่รวมปรับปรุง เหมือนกันทุกหน้าจอ */
  const earn = earnOf(pay.gross, pay.adj);

  /*
   * ดาวน์โหลดเป็นไฟล์จริง ตัวเลขชุดเดียวกับที่แสดงบนกระดาษสลิปทุกบรรทัด
   * (เดิมปุ่มนี้แค่นับจำนวนครั้ง ไม่มีไฟล์ออกมา)
   * เป็น CSV เพราะเปิดใน Excel ได้ตรง ๆ และระบบมีตัวส่งออกนี้อยู่แล้ว
   * นับครั้งหลังโยนไฟล์เสร็จ ตัวนับจะได้หมายถึงการดาวน์โหลดที่เกิดขึ้นจริง
   */
  /*
   * รายการหักสามกลุ่มบนกระดาษสลิป — ประกันสังคม · หักมาสาย · รายการปรับปรุงอื่น
   * สามบรรทัดนี้ขึ้นเสมอแม้เป็นศูนย์ พนักงานจะได้อ่านจบในใบเดียวว่าถูกหักอะไรไปบ้าง
   * ปรับปรุงลงเป็นยอดที่ถูกหักไป (-amt) ติดลบคือรายการที่คืนกลับเข้ายอด
   */
  const deductions: [string, number][] = [
    [
      `ประกันสังคม ${settings().rates.socialSecurity}% (เพดาน ${baht(cap.ceiling)})`,
      pay.ss,
    ],
    [
      /* ยอดที่ปิดรอบไว้ไม่ได้เก็บจำนวนนาที จึงไม่พิมพ์ตัวเลขนาทีที่ไม่มีอยู่จริง */
      snapped || pay.late === 0 ? "หักมาสาย" : `หักมาสาย ${pay.lateChargedMin} นาที`,
      pay.late,
    ],
    ...(adjust.length > 0
      ? adjust.map((a): [string, number] => [`รายการปรับปรุงอื่น · ${a.why}`, -a.amt || 0])
      /* -0 ไม่ใช่ตัวเลขที่คนอ่านออก บังคับให้เป็น 0 ก่อนพิมพ์ */
      : [["รายการปรับปรุงอื่น", -pay.adj || 0] as [string, number]]),
  ];

  function download() {
    const csv = toCsv([
      ["สลิปเงินเดือน MAZ"],
      ["รอบ", thaiMonth(month), `${thaiDate(c.from)} – ${thaiDate(c.to)}`],
      ["ชื่อพนักงาน", emp.name],
      ["รหัสพนักงาน", emp.id],
      ["ตำแหน่ง", p.label],
      ["แผนก", hrDept(p.dept).label],
      [],
      ["รายได้", "จำนวนเงิน (บาท)"],
      ...income,
      ["รวมรายได้", earn],
      [],
      ["รายการหัก", "จำนวนเงิน (บาท)"],
      ...deductions,
      ["รวมรายการหัก", cutOf(pay)],
      [],
      ...(pay.reimb > 0 ? [["ค่าใช้จ่ายคืน (ใบเบิกที่อนุมัติ)", pay.reimb] as [string, number], []] : []),
      ["ยอดสุทธิที่ได้รับ", pay.net],
      [],
      ["บริษัทสมทบประกันสังคมเท่ากับที่ลูกจ้างถูกหัก", pay.ss],
      ["เอกสารนี้ออกจากระบบ ERP MAZ ไม่ต้องลงลายมือชื่อ"],
    ]);
    downloadCsv(`สลิปเงินเดือน-${month}-${emp.id}.csv`, csv);
    countDownload(month, emp.id);
  }

  return (
    <Sheet
      title={`สลิปเงินเดือน · ${emp.name}`}
      wide
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-muted-foreground">
            {published && slip
              ? `เปิดดู ${slip.views[emp.id] ?? 0} ครั้ง · ดาวน์โหลด ${
                  slip.downloads[emp.id] ?? 0
                } ครั้ง`
              : "ยังไม่เผยแพร่ พนักงานยังเห็นไม่ได้"}
          </span>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={!published}
            title={published ? undefined : "เผยแพร่ก่อนจึงจะดาวน์โหลดได้"}
            onClick={download}
          >
            <DownloadIcon className="size-3.5" strokeWidth={2} />
            ดาวน์โหลด
          </button>
        </>
      }
    >
      {/* กระดาษสลิปทึบเสมอ ไม่ให้พื้นหลังทะลุขึ้นมา เพราะเป็นเอกสารที่ต้องอ่านชัด
          hp-dlg = มือถือเปิดเป็นแผ่นเลื่อนขึ้นแบบเดียวกับกล่องอื่นของรอบเงินเดือน */}
      <div className="hp-dlg">
      <article className="rounded-[14px] border border-border bg-white px-6 py-6 shadow-sm max-sm:px-4 max-sm:py-5">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-primary pb-3.5">
          <div>
            <p className="text-[26px] leading-none font-extrabold tracking-[0.05em] text-primary">
              MAZ
            </p>
            <p className="mt-1 text-[9.5px] font-semibold tracking-[0.12em] text-muted-foreground">
              DIGITAL BUSINESS SOLUTION
            </p>
          </div>
          <div className="text-right">
            <h4 className="text-[17px] font-bold">สลิปเงินเดือน</h4>
            <p className="num mt-1 text-xs text-muted-foreground">
              รอบ {thaiMonth(month)} · {thaiDate(c.from)} – {thaiDate(c.to)}
            </p>
          </div>
        </header>

        <div className="mt-4 grid gap-2 text-[13px] sm:grid-cols-3">
          <Fact k="ชื่อพนักงาน" v={emp.name} />
          <Fact k="ตำแหน่ง" v={p.label} />
          <Fact k="แผนก" v={hrDept(p.dept).label} />
        </div>

        <SlipTable
          head="รายได้"
          rows={income}
          total={["รวมรายได้", earn]}
        />
        <SlipTable
          head="รายการหัก"
          rows={deductions}
          total={["รวมรายการหัก", cutOf(pay)]}
        />
        {pay.reimb > 0 && (
          /* ใบเบิกที่อนุมัติแล้ว จ่ายคืนพร้อมเงินเดือน — ไม่ใช่รายได้ จึงไม่อยู่ในตารางรายได้และไม่คิดประกันสังคม */
          <SlipTable
            head="ค่าใช้จ่ายคืน"
            rows={[["ใบเบิกค่าใช้จ่ายที่อนุมัติแล้ว", pay.reimb]]}
            total={["รวมค่าใช้จ่ายคืน", pay.reimb]}
          />
        )}

        <div className="mt-4 flex items-center justify-between gap-4 rounded-[11px] bg-muted px-4 py-3.5 font-bold">
          <span>ยอดสุทธิที่ได้รับ</span>
          <b className="num text-[19px] text-primary">{baht(pay.net)} บาท</b>
        </div>

        <p className="mt-4 text-[11.5px] leading-[1.7] text-muted-foreground">
          บริษัทสมทบประกันสังคมเท่ากับที่ลูกจ้างถูกหัก {baht(pay.ss)} บาท
          <br />
          เอกสารนี้ออกจากระบบ ERP MAZ ไม่ต้องลงลายมือชื่อ
        </p>
      </article>
      </div>
    </Sheet>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <p>
      <span className="text-muted-foreground">{k}</span>
      <br />
      <b className="font-semibold">{v}</b>
    </p>
  );
}

function SlipTable({
  head,
  rows,
  total,
}: {
  head: string;
  rows: [string, number][];
  total: [string, number];
}) {
  return (
    <table className="mt-4 w-full text-[13px]">
      <thead>
        <tr>
          <th className="border-b border-border py-1.5 text-left text-[11.5px] font-bold text-primary">
            {head}
          </th>
          <th className="border-b border-border py-1.5 text-right text-[11.5px] font-bold text-primary">
            จำนวนเงิน
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([label, v]) => (
          <tr key={label}>
            <td className="border-b border-border py-1.5">{label}</td>
            <td className="num border-b border-border py-1.5 text-right whitespace-nowrap">
              {baht(v)}
            </td>
          </tr>
        ))}
        <tr>
          <td className="border-t border-border py-1.5 font-bold">
            {total[0]}
          </td>
          <td className="num border-t border-border py-1.5 text-right font-bold whitespace-nowrap">
            {baht(total[1])}
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── เผยแพร่และยกเลิกการเผยแพร่ ───────────────────────────────────

function PublishDialog({
  month,
  group,
  undo,
  count,
  madeAt,
  pubAt,
  today,
  onClose,
}: {
  month: string;
  group: PayGroup;
  undo: boolean;
  count: number;
  madeAt: string;
  /** เผยแพร่ไปแล้วเมื่อไร — กล่องยกเลิกต้องบอก ไม่งั้นคนกดไม่รู้ว่ากำลังถอนของเมื่อไร */
  pubAt: string;
  today: string;
  onClose: () => void;
}) {
  const [why, setWhy] = useState("");
  /** ยกเลิกการเผยแพร่โดยไม่ระบุเหตุผล — ขึ้นคำเตือนตาม mockup */
  const [warn, setWarn] = useState(false);
  const whyBox = useRef<HTMLDivElement>(null);
  const c = hrCycle(month);
  const ready = !undo || why.trim() !== "";

  return (
    <Sheet
      title={undo ? "ยกเลิกการเผยแพร่สลิปเงินเดือน" : "เผยแพร่สลิปเงินเดือน"}
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
              if (undo) unpublishSlips(month, today, why.trim(), group);
              else publishSlips(month, today, group);
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
        <b>รอบ {thaiMonth(month)}</b>
        <span>
          {thaiDate(c.from)} – {thaiDate(c.to)}
        </span>
        <span className="g">กลุ่ม {GROUP_LABEL[group]}</span>
      </p>
      {/* ป้าย-ค่าเรียงกัน อ่านทีเดียวจบว่ากำลังทำอะไรกับรอบไหนของกลุ่มไหน */}
      <dl className="hp-kv grid gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)]">
        <Pair k="รอบการจ่าย" v={thaiMonth(month)} mHide />
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
      ) : (
        <p className="hp-warn mt-4 flex items-start gap-2.5 rounded-[11px] border border-[var(--info)]/20 bg-[var(--info-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--info)]">
          <BellIcon className="mt-0.5 size-4 flex-none" strokeWidth={2} />
          <span>
            เผยแพร่แล้วพนักงานเรียกดูสลิปของตนเองได้ทันที และระบบแจ้งเตือนทุกคน
          </span>
        </p>
      )}
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
