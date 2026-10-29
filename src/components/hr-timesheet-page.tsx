"use client";

/*
 * สรุปเวลาทำงานรายเดือน — ด่านก่อนคำนวณเงินเดือน (ตามต้นแบบ hr-timesheet.html)
 *
 * หน้านี้มีหน้าที่เดียวคือทำให้ตัวเลขเวลาของทุกคน "นิ่ง" ก่อนเอาไปคิดเงิน
 * ปิดรอบแล้วตัวเลขถูกล็อก และปิดแล้วปิดเลย (ตามต้นแบบ)
 * เพราะถ้าแก้ได้ตลอด เงินเดือนที่คำนวณไปแล้วจะไม่ตรงกับข้อมูลที่ใช้คำนวณ
 *
 * พนักงานทดลองงานจ่ายค่าจ้างรายวัน ฐานการจ่ายคนละแบบ จึงแยกเป็นอีกแท็บ ไม่ต่อท้ายตารางเดิม
 *   — ตอนนี้แยกเป็นเมนูย่อย "พนักงาน" | "ทดลองงาน" (?g=) หน้านี้แสดงกลุ่มเดียว (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * และปิดรอบแยกกลุ่มกัน กลุ่มที่ตรวจเสร็จก่อนไม่ต้องรออีกกลุ่ม (ตามต้นแบบ hr-payroll.html)
 * ของกลุ่มนี้นับเฉพาะวันที่ผ่านมาแล้ว — นับวันในอนาคตด้วยจะกลายเป็นจ่ายค่าจ้างวันที่ยังไม่ได้มาทำงาน
 *
 * รายการที่เครื่องบันทึกเวลาให้มาไม่ครบต้องมีคำอธิบายทุกใบก่อนปิดรอบ
 * ระบบไม่เดาให้ เพราะการเดาผิดหนึ่งวันคือเงินของคนคนหนึ่ง
 */

import { displayName, nameOf } from "@/lib/emp-name";
import { scheduleFor, type DaySchedule } from "@/lib/work-schedule";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { thaiDate, thaiMonth, todayIso } from "@/lib/format";
import {
  HR_ISSUE_LABEL,
  HR_OT_LABEL,
  daysOfIn,
  empOf,
  hrCycle,
  defaultHrMonth,
  defaultDailyRange,
  dailyRoundId,
  overlapRound,
  rangeLabel,
  probRoundLabel,
  hrPos,
  inRange,
  isDaily,
  lateMin,
  leaveDays,
  openIssues,
  otKindAt,
  otHours,
  recInRange,
  workedDaysIn,
  type Cycle,
  type Employee,
  type DayFix,
  type TimeRec,
  type ClashOk,
  type PayGroup,
  GROUP_LABEL,
} from "@/lib/hr-data";
import {
  closeDailyTime,
  closePeriod,
  confirmClash,
  saveDayFixes,
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
  usePayGroup,
  useUrlMonth,
  MonthStepper,
} from "./hr-steps";
import {
  usePendingRequests,
  useHrTime,
  useMissingApproved,
  usePunchTimes,
  type MissingReq,
  type PunchDay,
} from "@/lib/hr-link";
import { MissingBox } from "./hr-payroll-page";
import { targetWorkMs } from "@/lib/work-schedule";
import { fmtLeave } from "@/lib/leave-data";
import { TESTING_ALLOW_CLOSE, addMin, clashDays, clashKey, leaveClash, leaveText } from "@/lib/hr-clash";
import { PencilIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { ConfirmDialog } from "./confirm-dialog";
import { Field, Select } from "./ui";
import { Time24Input } from "./time24-input"; // ช่องเวลา 24 ชม. แทน input[type=time] (ผู้ใช้สั่ง 13 ต.ค. 2569)

type Sum = { lateMin: number; lateN: number; lv: number; ot: number };
/* clash = วันที่ลาแล้วแต่มีเช็คอิน — นับเป็นรายการต้องตรวจด้วย (ผู้ใช้สั่ง 15 ต.ค. 2569) */
type Line = { e: Employee; r: TimeRec; days: number; clash: number };

/* ตรวจลาแล้วแต่มีเช็คอินย้ายไปไว้ที่ @/lib/hr-clash ใช้ร่วมกับหน้าคำนวณเงินเดือน (ผู้ใช้สั่ง 15 ต.ค. 2569) */

/*
 * ชั่วโมงทำงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) — วันทำงาน × ชั่วโมงต่อวันตามเวลางานที่ตั้งไว้ (หักพักแล้ว) − นาทีที่มาสาย
 * ไม่รวมโอที (แยกคอลัมน์อยู่แล้ว) · ระบบยังไม่มีเวลากดออกจริงของทุกวัน จึงคิดจากตารางเวลางาน
 */
/* ชั่วโมงต่อวันตามเวลาทำงานของคนนั้น — แม่บ้าน 08:00–17:00 (ผู้ใช้สั่ง 16 ต.ค. 2569) */
const workHours = (days: number, r: TimeRec, sch: DaySchedule) =>
  Math.max(0, days * (targetWorkMs(sch) / 3_600_000) - lateMin(r) / 60);

function sumOf(list: Line[]): Sum {
  return list.reduce(
    (a, { r }) => ({
      lateMin: a.lateMin + lateMin(r),
      lateN: a.lateN + r.late.length,
      lv: a.lv + leaveDays(r),
      ot: a.ot + otHours(r),
    }),
    { lateMin: 0, lateN: 0, lv: 0, ot: 0 },
  );
}

export function HrTimesheetPage() {
  const hr = useHr();
  const today = todayIso();
  /* มาจากขั้นอื่นพร้อม ?m= ก็แสดงรอบนั้นเลย ไม่ต้องเลือกใหม่ (ต้นแบบ urlMonth) */
  const urlMonth = useUrlMonth(hr.periods.map((p) => p.month));
  /* ไม่มี ?m= แสดงรอบล่าสุดที่จบแล้ว ไม่ใช่รอบปัจจุบันที่ยังเดินอยู่ (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  const [month, setMonth] = useState(urlMonth || defaultHrMonth(hr.periods.map((p) => p.month), today));
  /*
   * กลุ่มทดลองงานจ่ายรายวัน — รอบคือช่วงวันที่เลือกเอง ไม่ใช่รอบเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569)
   * มาจากขั้นอื่นพร้อม ?r= ใช้ช่วงนั้น · ไม่มีก็รอบรายวันที่ยังไม่จบล่าสุด หรือวันนี้วันเดียว
   * คิดค่าตั้งต้นใหม่ทุกครั้งจนกว่าจะเลือกเอง (useState จำค่าตอน hydrate ซึ่งยังเป็นข้อมูลตั้งต้น)
   */
  const urlRange = useUrlRange();
  const [pickedRange, setPickedRange] = useState<Cycle | null>(null);
  const dayRange = pickedRange ?? urlRange ?? defaultDailyRange(hr.dailyRounds, today);
  /* เวลาทำงานอ่านผ่านสะพาน — ใบลาใบโอทีของคนที่ผูกบทบาทไว้มาจากใบจริงในระบบ */
  const time = useHrTime();
  const punchTimes = usePunchTimes();
  /* edit = เปิดจากปุ่มแก้ไข — กล่องจะเปิดช่องแก้รายการแรกให้เลย ไม่ต้องหาเอง */
  /* มาจากรายการที่ต้องตรวจของหน้าคำนวณเงินเดือน (?emp=) เปิดกล่องรายวันของคนนั้นเลย (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const urlEmp = useSearchParams().get("emp") ?? "";
  const [viewing, setViewing] = useState<{ id: string; edit: boolean } | null>(() =>
    urlEmp && hr.emp.some((e) => e.id === urlEmp) ? { id: urlEmp, edit: false } : null,
  );
  const [closing, setClosing] = useState(false);
  /* มือถือ: เลือกกลุ่มจากสี่เหลี่ยมก่อน (ต้นแบบ m-pay-tiles) · แผ่นปฏิทินเลือกรอบ · การ์ดที่กางไว้ */
  const g = usePayGroup();
  /* กลุ่มมาจากเมนูย่อย (?g=) — สลับกลุ่มแล้วหน้าเดิมไม่ถูกสร้างใหม่ จึงปิดกล่องรายคนที่ค้างไว้เอง */
  const tab = g.group;
  const [seenTab, setSeenTab] = useState(tab);
  if (seenTab !== tab) {
    setSeenTab(tab);
    setViewing(null);
  }
  const [cal, setCal] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const period = hr.periods.find((p) => p.month === month)!;
  /* ปิดรอบทีละกลุ่ม ปุ่มและสถานะจึงอ่านจากแท็บที่เปิดอยู่ */
  const group: PayGroup = tab === "month" ? "month" : "day";
  const isDay = group === "day";
  /* ช่วงวันของรอบที่ดูอยู่ — รายเดือนคือรอบเดือน (26–25) · ทดลองงานคือช่วงที่เลือก */
  const cycle: Cycle = isDay ? dayRange : hrCycle(month);
  const roundId = dailyRoundId(dayRange);
  const round = isDay ? hr.dailyRounds.find((r) => r.id === roundId) : undefined;
  /* ช่วงที่ทับรอบรายวันที่ปิดไปแล้ว ปิดซ้ำไม่ได้ — วันเดียวกันจะถูกจ่ายสองครั้ง */
  const clash = isDay ? overlapRound(hr.dailyRounds, dayRange) : undefined;
  const locked = isDay ? Boolean(round) : period.closed;
  const roundTitle = isDay ? `รอบจ่าย ${probRoundLabel(dayRange)}` : `รอบ ${thaiMonth(month)}`;
  /* ใบที่ยังไม่ตัดสินและตกอยู่ในรอบนี้ ปิดรอบไปทั้งที่มีใบค้าง = ตัวเลขจะเปลี่ยนทีหลัง */
  const pending = usePendingRequests(cycle);

  /* คนที่มีรายการต้องตรวจขึ้นก่อน เพราะนั่นคือสิ่งเดียวที่กั้นไม่ให้ปิดรอบ */
  const people = hr.emp
    .filter((e) => inRange(e, cycle))
    .map((e) => {
      const r = recInRange(time, e.id, cycle);
      const days = isDaily(e, cycle)
        ? workedDaysIn(e, cycle, time, today)
        : daysOfIn(e, cycle).length - leaveDays(r);
      /* วันที่ HR ยืนยันแล้วไม่นับ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
      const clash = clashDays(e.id, r, hr.time[e.id]?.fix ?? [], punchTimes[e.id], today, hr.clashOk, scheduleFor(e)).length;
      return { e, r, days, clash };
    })
    .sort((a, b) => openIssues(b.r).length + b.clash - (openIssues(a.r).length + a.clash));

  const monthly = people.filter((x) => !isDaily(x.e, cycle));
  const daily = people.filter((x) => isDaily(x.e, cycle));


  const current = viewing ? hr.emp.find((e) => e.id === viewing.id) : undefined;
  const list = tab === "month" ? monthly : daily;
  /* รายการค้างตรวจและใบรออนุมัติ นับเฉพาะคนในกลุ่มที่กำลังดูอยู่ */
  const groupOpen = issuesOf(list);
  const groupPending = list.reduce(
    (n, x) => n + (pending[x.e.id] ? pending[x.e.id].leave + pending[x.e.id].ot : 0),
    0,
  );
  /*
   * ใบลาและใบโอทีที่อนุมัติแล้วแต่ไม่โผล่ในรอบ — เฉพาะคนในกลุ่มที่กำลังดูอยู่
   * รอบเวลาทำงานคือจุดตัดของสองชนิดนี้ ปิดไปทั้งที่ยังไม่เข้า = ชั่วโมงและวันลาหายถาวร
   * จึงกั้นไม่ให้ปิด ไม่ใช่แค่เตือน (ผู้ใช้กำหนด 23 ก.ย. 2569) ส่วนใบเบิกไปกั้นที่รอบเงินเดือน
   */
  const inList = new Set(list.map((x) => x.e.id));
  const missing = useMissingApproved(cycle).filter(
    (x) => x.kind !== "expense" && inList.has(x.emp),
  );
  /*
   * ปิดรอบได้เมื่อถึงวันตัดรอบแล้วเท่านั้น (ผู้ใช้กำหนด 23 ก.ย. 2569) ทั้งกลุ่มรายเดือนและรายวัน
   * วันตัดรอบคือวันสุดท้ายของช่วง อ่านจากค่าที่ผู้ดูแลระบบตั้งไว้ ไม่ใช่เลข 25 ที่เขียนตาย
   * ปิดก่อนถึงวันนั้น = ปิดรอบที่ยังมีวันทำงานเหลืออยู่ ตัวเลขจะเพิ่มหลังปิดแน่นอน
   */
  const cutReady = today >= cycle.to;
  /*
   * วันลาที่มีเช็คอินและ HR ยังไม่ยืนยัน (ผู้ใช้สั่ง 15 ต.ค. 2569)
   * กติกาจริงคือห้ามปิดรอบ — ช่วงทดสอบ (TESTING_ALLOW_CLOSE = true) แค่เตือนแล้วปิดได้
   */
  const groupClash = list.reduce((n, x) => n + x.clash, 0);
  const clashBlock = !TESTING_ALLOW_CLOSE && groupClash > 0;
  const closeWhy = clash
    ? `ช่วงนี้ทับรอบจ่าย ${rangeLabel(clash)} ที่ปิดไปแล้ว — เลือกช่วงที่ไม่ซ้อนกัน`
    : clashBlock
      ? `ยังมีวันที่ลาแล้วแต่มีเช็คอินที่ยังไม่ยืนยัน ${groupClash} วัน — แก้เวลาหรือกด "ยืนยันแล้ว" ก่อนปิดรอบ`
    : !cutReady
      ? `ปิดรอบได้เมื่อถึงวันตัดรอบแล้ว (${thaiDate(cycle.to)})`
      : groupOpen > 0
        ? `ยังมีรายการที่ต้องตรวจ ${groupOpen} รายการ`
        : missing.length > 0
          ? `มีใบที่อนุมัติแล้วยังไม่เข้ารอบนี้ ${missing.length} ใบ — ปิดรอบตอนนี้เวลาก้อนนี้จะหาย`
          : isDay && list.length === 0
            ? "ไม่มีพนักงานทดลองงานในช่วงนี้"
            : undefined;
  const closedAt = (isDay ? round?.closedAt : period.closedAt) ?? "";
  const closedById = (isDay ? round?.closedBy : period.closedBy) ?? "";
  const closedBy = closedById ? nameOf(closedById) : "";

  function pickRange(c: Cycle) {
    setPickedRange(c);
    setViewing(null);
  }

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`}>
      <PayHead
        title={isDay ? probRoundLabel(dayRange) : thaiMonth(month)}
        onBack={g.picked ? g.home : undefined}
        onCal={isDay ? undefined : () => setCal(true)}
      />
      <PayTiles onOpen={g.open} />

      {/* ขั้นตอนย้ายไปเป็นแท็บที่หัวแผงตาราง ตัวกรองอยู่ขวาบนของหน้า (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
      <div className="bar">
        {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
        <h1 className="page-h1">สรุปเวลาทำงาน</h1>
        <div className="tools ml-auto">
          {isDay ? (
            <DayRangePicker value={dayRange} max={today} onChange={pickRange} rounds={hr.dailyRounds} />
          ) : (
            <MonthStepper
              months={hr.periods.map((p) => p.month)}
              value={month}
              onChange={(m) => {
                setMonth(m);
                setViewing(null);
              }}
            />
          )}
        </div>
      </div>

      {/* มือถือ: .bar ซ่อนทั้งแถบ — ขั้นตอนเป็นชิป และช่วงวันของทดลองงานอยู่ใต้ชิป */}
      <HrSteps month={month} range={isDay ? dayRange : null} group={tab} className="md:hidden" />
      {isDay && (
        <div className="hp-only-m">
          <DayRangePicker value={dayRange} max={today} onChange={pickRange} rounds={hr.dailyRounds} />
        </div>
      )}

      <section className="panel glass flex flex-col">
        <div className="strip">
          <HrStepTabs month={month} range={isDay ? dayRange : null} group={tab} />
          {locked ? (
            /* ปิดแล้วปิดเลย ป้ายแทนที่ปุ่ม */
            <span className="tag t-ok my-2 ml-auto">
              <i />
              ปิดรอบแล้ว {thaiDate(closedAt)}
            </span>
          ) : (
            <>
            {/* บอกเหตุผลที่ยังปิดไม่ได้บนจอเลย ไม่ซ่อนไว้ตอนชี้เมาส์ (ผู้ใช้แจ้ง 12 ต.ค. 2569) */}
            {closeWhy && (
              <span className="my-2 ml-auto text-[12.5px] font-semibold text-[var(--warning)]">{closeWhy}</span>
            )}
            <button
              type="button"
              className={`btn solid btn-solid my-2 disabled:opacity-45 ${closeWhy ? "ml-3" : "ml-auto"}`}
              style={{ height: 38 }}
              /* ปิดรอบไม่ได้ถ้ายังไม่ถึงวันตัดรอบ หรือยังมีรายการค้างตรวจ
                 กันตรงนี้ ไม่ใช่ไปเตือนตอนกดยืนยัน */
              /* ช่วงทดสอบกับลูกค้า: ปิดรอบได้แม้มีข้อเตือน ยกเว้นช่วงทับรอบที่ปิดแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569)
                 วันลาที่มีเช็คอินที่ยังไม่ยืนยัน กันปิดเมื่อ TESTING_ALLOW_CLOSE = false (ผู้ใช้สั่ง 15 ต.ค. 2569)
                 TODO: ⚠️ เปลี่ยน TESTING_ALLOW_CLOSE เป็น false ก่อนขึ้นระบบจริง (@/lib/hr-clash) */
              disabled={Boolean(clash) || clashBlock}
              title={closeWhy}
              onClick={() => setClosing(true)}
            >
              ปิดรอบ
            </button>
            </>
          )}
        </div>

        {/* ใบที่อนุมัติแล้วแต่ไม่ปรากฏในรอบ — เคยเงียบมาแล้ว ต้องเห็นบนหน้าจอ ไม่ใช่รอให้พนักงานทัก */}
        {missing.length > 0 && <MissingBox rows={missing} emp={hr.emp} />}

        {/* ไม่จองร่องแถบเลื่อน ตารางเต็มกล่อง ไม่มีแถบขาวด้านขวา (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
        <div className="min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[1100px]">
            <thead>
              <tr>
                <th>พนักงาน</th>
                {tab === "month" ? (
                  <Th w={110} unit="วัน">วันทำงาน</Th>
                ) : (
                  <Th w={118} unit="วัน">วันที่มาทำงาน</Th>
                )}
                <Th w={116} unit="ชม.">ชั่วโมงทำงาน</Th>
                <Th w={104} unit="นาที">มาสาย</Th>
                <Th w={96} unit="วัน/ชม.">ลา</Th>
                <Th w={124} unit="ชม.">โอทีวันธรรมดา</Th>
                <Th w={116} unit="ชม.">โอทีวันหยุด</Th>
                <th className="c" style={{ width: 110 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-muted-foreground">
                    {tab === "month" ? "ไม่มีพนักงานในรอบนี้" : "ไม่มีพนักงานทดลองงานในรอบนี้"}
                  </td>
                </tr>
              ) : (
                list.map((x) => (
                  <TimeRow
                    key={x.e.id}
                    line={x}
                    waitDays={pending[x.e.id]?.leaveDays ?? 0}
                    locked={locked}
                    dayLabel={tab === "month" ? "วันทำงาน (วัน)" : "วันที่มาทำงาน (วัน)"}
                    onOpen={() => setViewing({ id: x.e.id, edit: false })}
                    onEdit={() => setViewing({ id: x.e.id, edit: true })}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* มือถือ: การ์ดพับคนละใบ ชื่อ + ป้ายต้องตรวจ แตะเพื่อกางตัวเลขเวลา แล้วกด "ดูรายละเอียดรายวัน" (ต้นแบบ ts-collapse) */}
        <PayList
          empty={
            list.length === 0
              ? tab === "month"
                ? "ไม่มีพนักงานในรอบนี้"
                : "ไม่มีพนักงานทดลองงานในรอบนี้"
              : undefined
          }
        >
          {list.map((x) => (
            <TimeCard
              key={x.e.id}
              line={x}
              waitDays={pending[x.e.id]?.leaveDays ?? 0}
              locked={locked}
              dayLabel={tab === "month" ? "วันทำงาน (วัน)" : "วันที่มาทำงาน (วัน)"}
              expanded={Boolean(expanded[x.e.id])}
              onToggle={() => setExpanded((v) => ({ ...v, [x.e.id]: !v[x.e.id] }))}
              onOpen={() => setViewing({ id: x.e.id, edit: false })}
              onEdit={() => setViewing({ id: x.e.id, edit: true })}
            />
          ))}
        </PayList>

        {/* มือถือ: ปุ่มปิดรอบอยู่ท้ายรายการ ไล่ดูข้อมูลก่อนแล้วค่อยปิด (ต้นแบบ m-pay-bottom)
            บนมือถือไม่มีการชี้ค้าง เหตุผลที่ปิดรอบไม่ได้จึงต้องอยู่บนหน้าจอ ไม่ใช่ซ่อนใน title */}
        {!locked && (
          <div className="hp-bottom">
            {closeWhy && <p className="hp-why">{closeWhy}</p>}
            <button
              type="button"
              className="btn solid btn-solid disabled:opacity-45"
              /* ช่วงทดสอบกับลูกค้า: ปิดรอบได้แม้มีข้อเตือน ยกเว้นช่วงทับรอบที่ปิดแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569)
                 วันลาที่มีเช็คอินที่ยังไม่ยืนยัน กันปิดเมื่อ TESTING_ALLOW_CLOSE = false (ผู้ใช้สั่ง 15 ต.ค. 2569)
                 TODO: ⚠️ เปลี่ยน TESTING_ALLOW_CLOSE เป็น false ก่อนขึ้นระบบจริง (@/lib/hr-clash) */
              disabled={Boolean(clash) || clashBlock}
              onClick={() => setClosing(true)}
            >
              ปิดรอบ
            </button>
          </div>
        )}

        {/* แถบท้ายมีเฉพาะแท็บรายวัน ตามต้นแบบ */}
        {tab === "month" ? null : (
          <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
            <span className="flex flex-wrap items-center gap-2">
              {/* นับเฉพาะวันในช่วงของรอบจ่ายนี้ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
              ช่วง {probRoundLabel(dayRange)}
              {today < dayRange.to && ` · นับถึง ${thaiDate(today)}`}
              <CycleTag
                locked={locked}
                open={groupOpen}
                at={closedAt}
                by={closedBy}
              />
            </span>
            {/* เอาสรุปวันมาทำงาน/โอทีท้ายตารางออก (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          </div>
        )}
      </section>

      {current && viewing && (
        <DayDetail
          key={current.id}
          emp={current}
          label={isDay ? probRoundLabel(dayRange) : thaiMonth(month)}
          locked={locked}
          rec={recInRange(time, current.id, cycle)}
          fixes={hr.time[current.id]?.fix ?? []}
          punch={punchTimes[current.id]}
          ok={hr.clashOk}
          whoName={(id) => displayName(empOf(hr.emp, id)) || "ฝ่ายบุคคล"}
          days={daysOfIn(current, cycle).filter((d) => d <= today)}
          onClose={() => setViewing(null)}
        />
      )}

      {cal && (
        <PayCalendar
          months={hr.periods.map((p) => p.month)}
          selected={month}
          mode="cycle"
          today={today}
          onPick={(m) => {
            setMonth(m);
            setViewing(null);
          }}
          onClose={() => setCal(false)}
        />
      )}

      {closing && !locked && (
        <CloseDialog
          title={roundTitle}
          range={cycle}
          group={group}
          onConfirm={() => (isDay ? closeDailyTime(dayRange, today) : closePeriod(month, today, group))}
          blocked={Boolean(clash) || clashBlock}
          why={closeWhy}
          people={list.length}
          sum={sumOf(list)}
          pending={groupPending}
          missing={missing}
          emp={hr.emp}
          today={today}
          onClose={() => setClosing(false)}
        />
      )}
    </div>
  );
}

/** หัวคอลัมน์ตัวเลข — หน่วยอยู่บรรทัดล่าง จะได้ไม่ดันคอลัมน์ให้กว้าง */
function Th({ w, unit, children }: { w: number; unit: string; children: React.ReactNode }) {
  return (
    <th className="c" style={{ width: w }}>
      {children}
      <span className="mt-0.5 block text-[10.5px] font-medium text-muted-foreground">({unit})</span>
    </th>
  );
}

function TimeRow({
  line: { e, r, days, clash },
  waitDays,
  locked,
  dayLabel,
  onOpen,
  onEdit,
}: {
  line: Line;
  /** วันลาที่ยื่นไว้แต่ยังไม่อนุมัติ — ยังไม่เข้าช่อง "ลา" ของรอบ */
  waitDays: number;
  locked: boolean;
  dayLabel: string;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const open = openIssues(r).length + clash;
  const fixed = r.issues.length - openIssues(r).length;
  return (
    /* กดที่ไหนก็ได้ในแถวเพื่อดูรายละเอียดรายวัน ไม่ต้องเล็งปุ่มเล็ก ๆ */
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          onOpen();
        }
      }}
      aria-label={`ดูรายละเอียดรายวันของ ${displayName(e)}`}
      className={`cursor-pointer ${open ? "bg-[#FFF7F7]" : ""}`}
    >
      <td data-label="พนักงาน">
        <b className="block truncate text-[13.5px] font-semibold">{displayName(e)}</b>
        <em className="block truncate text-[11.5px] not-italic text-muted-foreground">
          {hrPos(e.pos).label}
        </em>
      </td>
      <td data-label={dayLabel} className="c num">
        {/* วันทำงานหักชั่วโมงลาแล้วอาจมีเศษ — แสดงเป็นวัน/ชม. (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
        {Number.isInteger(days) ? days : fmtLeave(days)}
      </td>
      <Num label="ชั่วโมงทำงาน (ชม.)" v={workHours(days, r, scheduleFor(e))} fixed2 />
      <Num label="มาสาย (นาที)" v={lateMin(r)} />
      {/* ลา = ที่อนุมัติแล้วเท่านั้น · ไม่โชว์ใบที่รออนุมัติ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
      <td data-label="ลา" className={`c num whitespace-nowrap ${leaveDays(r) ? "" : "text-muted-foreground"}`}>
        {/* ลาแสดงเป็นชั่วโมง "1 วัน 4 ชม." (ผู้ใช้สั่ง 19 ต.ค. 2569) */}
        {leaveDays(r) ? fmtLeave(leaveDays(r)) : 0}
      </td>
      <Num label="โอทีวันธรรมดา (ชม.)" v={otHours(r, "after_work")} fixed2 />
      {/* วันหยุดราชการรวมอยู่ในช่องวันหยุด — ต้นแบบแยกแค่วันธรรมดากับวันหยุด (เรตยังคิดแยกในเงินเดือน) */}
      <Num label="โอทีวันหยุด (ชม.)" v={otHours(r, "holiday") + otHours(r, "public")} fixed2 />
      <td data-label="จัดการ" className="c">
        {/* แก้เวลาเข้า-ออกงานได้ทุกคนทั้งรอบ จนกว่าจะปิดรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
        {locked ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onEdit();
            }}
            aria-label={`แก้ไขเวลาของ ${displayName(e)}`}
            title="แก้ไข"
            className="iconbtn glass-thin mx-auto"
            style={{ width: 32, height: 32 }}
          >
            <PencilIcon className="size-4" strokeWidth={1.9} />
          </button>
        )}
      </td>
    </tr>
  );
}

/** การ์ดของหนึ่งคนบนมือถือ — ข้อมูลชุดเดียวกับแถวในตาราง */
function TimeCard({
  line: { e, r, days, clash },
  waitDays,
  locked,
  dayLabel,
  expanded,
  onToggle,
  onOpen,
  onEdit,
}: {
  line: Line;
  waitDays: number;
  locked: boolean;
  dayLabel: string;
  expanded: boolean;
  onToggle: () => void;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const open = openIssues(r).length + clash;
  const fixed = r.issues.length - openIssues(r).length;
  const late = lateMin(r);
  const lv = leaveDays(r);
  const otW = otHours(r, "after_work");
  const otH = otHours(r, "holiday") + otHours(r, "public");
  return (
    <PayCard
      title={displayName(e)}
      sub={hrPos(e.pos).label}
      collapsed={!expanded}
      onOpen={onToggle}
      openLabel={`${expanded ? "ซ่อน" : "ดู"}ตัวเลขเวลาของ ${displayName(e)}`}
      corner={
        <>
          {/* ปุ่มแก้ขึ้นเฉพาะคนที่มีรายการต้องตรวจ และรอบยังไม่ปิด เหมือนคอลัมน์จัดการบนจอกว้าง */}
          {!locked && (
            <PayIconBtn label={`แก้ไขเวลาของ ${displayName(e)}`} title="แก้ไข" onClick={onEdit}>
              <PencilIcon strokeWidth={1.9} />
            </PayIconBtn>
          )}
        </>
      }
      rows={[
        { label: dayLabel, value: Number.isInteger(days) ? days : fmtLeave(days) },
        { label: "ชั่วโมงทำงาน (ชม.)", value: workHours(days, r, scheduleFor(e)).toFixed(2) },
        { label: "มาสาย (นาที)", value: late, muted: !late },
        /* ลาที่อนุมัติแล้ว · ใบที่ยังรออนุมัติบอกไว้ข้างล่าง ยังไม่นับเป็นวันลา */
        {
          label: "ลา",
          value: (
            <>
              {lv ? fmtLeave(lv) : 0}
            </>
          ),
          muted: !lv,
        },
        { label: "โอทีวันธรรมดา (ชม.)", value: otW.toFixed(2), muted: !otW },
        { label: "โอทีวันหยุด (ชม.)", value: otH.toFixed(2), muted: !otH },
      ]}
    >
      <button
        type="button"
        className="hp-daybtn"
        onClick={(ev) => {
          ev.stopPropagation();
          onOpen();
        }}
      >
        ดูรายละเอียดรายวัน
      </button>
    </PayCard>
  );
}

/** ศูนย์ให้จางลง เพื่อให้ตาจับเฉพาะช่องที่มีตัวเลขจริง */
function Num({ label, v, fixed2 }: { label: string; v: number; fixed2?: boolean }) {
  return (
    <td data-label={label} className={`c num ${v ? "" : "text-muted-foreground"}`}>
      {fixed2 ? v.toFixed(2) : v}
    </td>
  );
}

// ─── รายละเอียดรายวันของคนเดียว ───────────────────────────────────

function DayDetail({
  emp,
  label,
  locked,
  rec,
  fixes,
  punch,
  ok,
  whoName,
  days,
  onClose,
}: {
  emp: Employee;
  /** ชื่อรอบที่ดูอยู่ — รอบเดือนหรือช่วงวันของรอบจ่ายรายวัน */
  label: string;
  locked: boolean;
  rec: TimeRec;
  /** เวลาที่ฝ่ายบุคคลแก้ไว้แล้ว */
  fixes: DayFix[];
  /** เวลาตอกบัตรจริงรายวัน (เฉพาะคนที่มีบัญชีผูกไว้) */
  punch?: Record<string, PunchDay>;
  /** วันลาที่มีเช็คอินที่ HR ยืนยันแล้ว (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  ok: Record<string, ClashOk>;
  /** ชื่อผู้ยืนยัน — ไม่แสดงรหัสพนักงาน */
  whoName: (id: string) => string;
  /** วันทำงานของคนนี้ในรอบ ถึงวันนี้ */
  days: string[];
  onClose: () => void;
}) {
  /*
   * รายการยาวทุกวันทำงานของรอบ แก้ได้แค่เวลาเข้า-ออกงาน (ผู้ใช้สั่ง 6 ต.ค. 2569)
   * ค่าตั้งต้นของแต่ละวัน: ที่แก้ไว้แล้ว → ตอกบัตรจริง → ไม่มีลงเวลา = ว่าง · ไม่ลงออก = ว่างช่องออก · มาสาย = เวลาเข้าจริง
   * · วันลา (ผู้ใช้สั่ง 15 ต.ค. 2569): ลาทั้งวัน = ว่าง · ลาเช้า = เข้าหลังพัก · ลาบ่าย = ออกตอนเริ่มพัก · ปกติ = เวลาทำงานบริษัท
   * · เวลาทำงานของคนนั้นตามตำแหน่ง — แม่บ้าน 08:00–17:00 (ผู้ใช้สั่ง 16 ต.ค. 2569)
   */
  const sch = scheduleFor(emp);
  const start = sch.start;
  const end = sch.end;
  const leaveOf = (d: string) => rec.leave.find((x) => x.d === d);
  const initial = (d: string) => {
    const f = fixes.find((x) => x.d === d);
    if (f) return { in: f.in, out: f.out };
    const p = punch?.[d];
    if (p) return { in: p.in, out: p.out };
    const issue = rec.issues.find((x) => x.d === d);
    if (issue?.in || issue?.out) return { in: issue.in ?? start, out: issue.out ?? "" };
    if (issue?.kind === "norecord") return { in: "", out: "" };
    const late = rec.late.find((x) => x.d === d);
    const lv = leaveOf(d);
    /* ลาทั้งวันและไม่มีร่องรอยการตอกบัตร — ไม่เติมเวลาสมมติให้ */
    if (lv?.span === "full" && !late && !issue) return { in: "", out: "" };
    /* เวลาจริงไม่ตรงเป๊ะทุกวัน — เข้าก่อนเวลา 1–15 นาที ออกหลังเวลา 0–40 นาที คงที่ตามคนและวัน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
    let h = 0;
    for (const ch of emp.id + d) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let tin = late ? addMin(start, late.min) : addMin(start, -(1 + (h % 15)));
    let tout = issue?.kind === "nopair" ? "" : addMin(end, (h >>> 5) % 41);
    /* ลาครึ่งวันที่ไม่มีการตอกจริง — เวลาสมมติต้องไม่ทับช่วงลา ไม่งั้นจะฟ้องผิด */
    if (!late && !issue && lv?.span === "half") {
      if (lv.half === "am") tin = sch.lunchEnd;
      if (lv.half === "pm") tout = sch.lunchStart;
    }
    return { in: tin, out: tout };
  };
  const [rows, setRows] = useState(() => Object.fromEntries(days.map((d) => [d, initial(d)])));
  /* วันลาทั้งวันที่มีเวลาตอกค้างอยู่ตอนเปิดกล่อง — เปิดช่องให้แก้ (ล้างเวลาออก) แทนข้อความ "ลาทั้งวัน" */
  const [fullWithPunch] = useState(
    () => new Set(days.filter((d) => leaveOf(d)?.span === "full" && (initial(d).in || initial(d).out))),
  );
  const changed = days.filter((d) => {
    const a = initial(d);
    const b = rows[d];
    return a.in !== b.in || a.out !== b.out;
  });
  const bad = days.find((d) => rows[d].in && rows[d].out && rows[d].in >= rows[d].out);
  /* ยืนยันแล้ว = HR ตรวจแล้วว่าวันนี้ถูกต้อง ไม่ฟ้องแดง ไม่นับเป็นรายการที่ต้องตรวจ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const okOf = (d: string) => ok[clashKey(emp.id, d)];
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState("");
  /* วันที่รอกดยืนยันในกล่องสุดท้าย — ยืนยันแล้วแก้ไม่ได้ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const [sure, setSure] = useState<string | null>(null);
  const clashN = days.filter((d) => leaveClash(leaveOf(d), rows[d], sch) && !okOf(d)).length;
  const cls = "field-control num h-9 w-[120px] rounded-[10px] px-3 text-[13px] disabled:opacity-60";

  return (
    <Sheet
      title={`${emp.name} ${label}`}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            {locked ? "ปิด" : "ยกเลิก"}
          </button>
          {!locked && (
            <button
              type="button"
              className="btn solid btn-solid disabled:opacity-45"
              disabled={changed.length === 0 || Boolean(bad)}
              title={bad ? `${thaiDate(bad)} เวลาออกต้องหลังเวลาเข้า` : undefined}
              onClick={() => {
                saveDayFixes(emp.id, changed.map((d) => ({ d, ...rows[d] })));
                onClose();
              }}
            >
              บันทึก
            </button>
          )}
        </>
      }
    >
      {/* บอกไว้บนสุดว่ามีวันลาที่ยังมีเช็คอิน — แก้เวลาให้ไม่ทับช่วงลา หรือให้ผู้อนุมัติยกเลิกใบลา (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
      {clashN > 0 && (
        <p className="mb-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-destructive">
          มีวันที่ลาแล้วแต่มีเช็คอิน {clashN} วัน — ตรวจสอบ แล้วแก้เวลาไม่ให้ทับช่วงลา (ลาทั้งวันให้ล้างเวลาออก)
          หรือถ้าตรวจแล้วถูกต้อง (เช่น มาทำงานจริง) กด &quot;ยืนยันแล้ว&quot; ที่วันนั้น
        </p>
      )}
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[12px] text-muted-foreground">
            <th className="pb-2 font-semibold">วันที่</th>
            <th className="pb-2 font-semibold">เวลาเข้างาน</th>
            <th className="pb-2 font-semibold">เวลาออกงาน</th>
          </tr>
        </thead>
        <tbody>
          {days.map((d) => {
            const lv = leaveOf(d);
            const r = rows[d];
            const off = d === bad;
            /* ลาแล้วแต่มีเช็คอินทับช่วงลา — ดูจากค่าที่อยู่ในช่องตอนนี้ แก้แล้วแดงหายทันที */
            const hit = leaveClash(lv, r, sch);
            const done = hit ? okOf(d) : undefined;
            const clash = hit && !done;
            /* วันที่ยังต้องตรวจ — แถวพื้นแดงอ่อน วันที่ตัวแดง และช่องที่ว่างขอบแดง จะได้รู้ว่าต้องแก้วันไหน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
            const todo = rec.issues.some((x) => x.d === d && !x.note);
            const redBox = { borderColor: "var(--destructive)", background: "var(--destructive-soft)" };
            /* วันลาที่อนุมัติแล้ว — แถวพื้นฟ้าอ่อนตามสีสถานะลา (ผู้ใช้สั่ง 15 ต.ค. 2569) */
            const bg = todo || clash ? "var(--destructive-soft)" : lv ? "var(--info-soft)" : undefined;
            const fullOnly = lv?.span === "full" && !fullWithPunch.has(d);
            /* ลาทั้งวัน ช่องว่างไม่ใช่ข้อผิดพลาด · ลาครึ่งวันยังต้องมีเวลาของอีกครึ่ง */
            const needTime = lv?.span !== "full";
            return (
              <tr key={d} className="border-t border-border" style={bg ? { background: bg } : undefined}>
                <td className={`num py-2 pr-3 pl-2 font-semibold ${todo || clash ? "text-destructive" : ""}`}>
                  <span className="whitespace-nowrap">{thaiDate(d)}</span>
                  {todo && <span className="ml-2 text-[11.5px] font-semibold">ต้องตรวจ</span>}
                  {lv && (
                    <span className="tag t-leave ml-2 align-middle text-[11.5px]">
                      <i />
                      {leaveText(lv, sch)}
                    </span>
                  )}
                  {clash && (
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] font-semibold text-destructive">
                      ลาแล้วแต่มีเช็คอิน — ตรวจสอบ
                      {asking !== d && (
                        <button
                          type="button"
                          className="rounded-[8px] border border-[var(--success)] bg-[var(--card)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--success)]"
                          onClick={() => {
                            setAsking(d);
                            setNote("");
                          }}
                        >
                          ยืนยันแล้ว
                        </button>
                      )}
                    </span>
                  )}
                  {/* ยืนยันพร้อมหมายเหตุ (ไม่บังคับ) — บันทึกทันที ไม่ต้องกดบันทึกท้ายกล่อง (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
                  {clash && asking === d && (
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={note}
                        onChange={(ev) => setNote(ev.target.value)}
                        placeholder="หมายเหตุ เช่น มาทำงานจริง ยกเลิกใบลาภายหลัง"
                        aria-label={`หมายเหตุการยืนยัน ${thaiDate(d)}`}
                        className="field-control h-8 min-w-[220px] flex-1 rounded-[9px] px-2.5 text-[12.5px] font-normal text-foreground"
                      />
                      {/* ยืนยันแล้วถือเป็นที่สิ้นสุด ไม่มีการยกเลิก (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
                      <span className="basis-full text-[12px] font-semibold text-destructive">ยืนยันแล้วจะยกเลิกไม่ได้</span>
                      <button
                        type="button"
                        className="btn solid btn-solid h-8 px-3 text-[12.5px]"
                        onClick={() => setSure(d)}
                      >
                        ยืนยัน
                      </button>
                      <button type="button" className="btn glass-thin h-8 px-3 text-[12.5px]" onClick={() => setAsking(null)}>
                        ยกเลิก
                      </button>
                    </span>
                  )}
                  {done && (
                    <span className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] font-normal text-muted-foreground">
                      <span className="tag t-ok align-middle text-[11.5px] font-semibold">
                        <i />
                        Human Resources ยืนยันแล้ว
                      </span>
                      <span>
                        โดย {whoName(done.by)} · {thaiDate(done.at.slice(0, 10))} {done.at.slice(11)} น.
                        {done.note && ` · ${done.note}`}
                      </span>
                    </span>
                  )}
                </td>
                {fullOnly ? (
                  <td colSpan={2} className="py-2 font-semibold text-[var(--info)]">
                    ลาทั้งวัน
                  </td>
                ) : (
                  <>
                    <td className="py-2 pr-3">
                      <Time24Input
                        wrapperClassName="w-[120px]"
                        value={r.in}
                        disabled={locked}
                        onChange={(e) => setRows((v) => ({ ...v, [d]: { ...v[d], in: e.target.value } }))}
                        aria-label={`เวลาเข้างาน ${thaiDate(d)}`}
                        className={cls}
                        style={(!r.in && needTime) || (clash && r.in) ? redBox : undefined}
                      />
                    </td>
                    <td className="py-2">
                      <Time24Input
                        wrapperClassName="w-[120px]"
                        value={r.out}
                        disabled={locked}
                        onChange={(e) => setRows((v) => ({ ...v, [d]: { ...v[d], out: e.target.value } }))}
                        aria-label={`เวลาออกงาน ${thaiDate(d)}`}
                        className={cls}
                        style={(!r.out && needTime) || off || (clash && r.out) ? redBox : undefined}
                      />
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <ConfirmDialog
        open={sure !== null}
        title="ยืนยันวันลาที่มีเช็คอิน"
        description={
          sure ? (
            <>
              {emp.name} · {thaiDate(sure)}
              {leaveOf(sure) ? ` · ${leaveText(leaveOf(sure)!, sch)}` : ""}
              {note.trim() ? ` · หมายเหตุ: ${note.trim()}` : ""}
            </>
          ) : undefined
        }
        detail={
          <span className="font-semibold text-destructive">
            ยืนยันแล้วจะยกเลิกหรือแก้ไขไม่ได้อีก ข้อมูลนี้จะส่งต่อถึง Chief Executive Officer
          </span>
        }
        confirmLabel="ยืนยัน"
        tone="destructive"
        onConfirm={() => {
          if (sure) confirmClash(emp.id, sure, note);
          setSure(null);
          setAsking(null);
        }}
        onCancel={() => setSure(null)}
      />
    </Sheet>
  );
}


/* ปิดรอบต้องเคลียร์ทั้งสองแท็บ บอกบนแท็บเลยว่าค้างอยู่ฝั่งไหน ไม่งั้นต้องสลับไปหาเอง */
function issuesOf(list: Line[]) {
  /* ลาแล้วแต่มีเช็คอินนับรวมเป็นรายการต้องตรวจ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  return list.reduce((n, x) => n + openIssues(x.r).length + x.clash, 0);
}

// ─── ปิดรอบ ──────────────────────────────────────────────────────

function CloseDialog({
  title,
  range: c,
  group,
  onConfirm,
  blocked,
  why,
  people,
  sum,
  pending,
  missing,
  emp,
  onClose,
}: {
  /** "รอบ กันยายน 2569" หรือ "รอบจ่าย 6 – 8 ต.ค. 2569" */
  title: string;
  range: Cycle;
  group: PayGroup;
  /** ปิดรอบเดือน หรือสร้างรอบจ่ายรายวันของช่วงนี้ (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  onConfirm: () => void;
  blocked: boolean;
  why?: string;
  people: number;
  sum: Sum;
  pending: number;
  missing: MissingReq[];
  emp: Employee[];
  today: string;
  onClose: () => void;
}) {
  function confirm() {
    /* กันไว้อีกชั้น เผื่อสถานะเปลี่ยนระหว่างเปิดกล่อง */
    if (blocked) return;
    onConfirm();
    onClose();
  }

  return (
    <Sheet
      title="ปิดรอบเวลาทำงาน"
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
            title={why}
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
      {why && (
        <p className="mt-3 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] leading-relaxed text-destructive">
          ยังปิดรอบไม่ได้ · {why}
        </p>
      )}
      {/* ขาดใบไหนต้องเห็นตรงนี้ด้วย ไม่ใช่เห็นแค่จำนวนแล้วเดาเอาเอง */}
      {missing.length > 0 && (
        <div className="-mx-3">
          <MissingBox rows={missing} emp={emp} />
        </div>
      )}

        <>
          <dl className="hp-kv mt-3 grid gap-2 text-[13.5px] sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-x-4">
            <dt className="text-[12.5px] font-semibold text-muted-foreground">พนักงานในรอบ</dt>
            <dd className="num font-semibold">{people} คน</dd>
            <dt className="text-[12.5px] font-semibold text-muted-foreground">มาสาย</dt>
            <dd className="num font-semibold">
              {sum.lateMin} นาที ({sum.lateN} ครั้ง)
            </dd>
            <dt className="text-[12.5px] font-semibold text-muted-foreground">ลา</dt>
            <dd className="num font-semibold">{fmtLeave(sum.lv)}</dd>
            <dt className="text-[12.5px] font-semibold text-muted-foreground">ชั่วโมงล่วงเวลา</dt>
            <dd className="num font-semibold">{sum.ot.toFixed(2)} ชม.</dd>
          </dl>
          {pending > 0 && (
            /* ไม่ห้ามปิด เพราะใบที่ค้างอาจเป็นของรอบถัดไปที่ยื่นล่วงหน้า
               แต่ต้องเห็นก่อนกด ไม่ใช่ไปรู้ตอนมีคนทักว่าตัวเลขไม่ตรง */
            <p className="hp-warn mt-3 rounded-[11px] border border-[rgba(180,99,11,.25)] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--warning)]">
              รอบนี้ยังมีใบลาหรือใบโอทีที่ผู้อนุมัติยังไม่ตัดสิน {pending} ใบ
              ถ้าอนุมัติหลังปิดรอบ ตัวเลขจะไม่ตรงกับที่ปิดไป
            </p>
          )}
          <p className="hp-warn mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            ปิดรอบแล้วแก้ไขข้อมูลของกลุ่มนี้ไม่ได้อีก และข้อมูลจะถูกส่งไปยังการคำนวณเงินเดือน ตรวจให้ครบก่อนกดปิด
          </p>
        </>
      </div>
    </Sheet>
  );
}

/** ป้ายบอกสถานะรอบของกลุ่มที่กำลังดู — ปิดแล้ว ค้างตรวจ หรือยังไม่ปิด */
function CycleTag({
  locked,
  open,
  at,
  by,
}: {
  locked: boolean;
  open: number;
  at: string;
  by: string;
}) {
  if (locked) {
    return (
      <span className="tag t-ok">
        <i />
        ปิดรอบแล้ว {thaiDate(at)}
        {by && ` โดย ${by}`}
      </span>
    );
  }
  return open > 0 ? (
    <span className="tag t-late">
      <i />
      ยังมีรายการต้องตรวจ {open}
    </span>
  ) : (
    /* ยังไม่ปิดและไม่มีรายการค้างตรวจ — ข้อความตาม mockup (rangetag free) */
    <span className="tag t-miss">
      <i />
      รอบยังไม่จบ
    </span>
  );
}
