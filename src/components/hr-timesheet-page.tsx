"use client";

/*
 * สรุปเวลาทำงานรายเดือน — ด่านก่อนคำนวณเงินเดือน (ตามต้นแบบ hr-timesheet.html)
 *
 * หน้านี้มีหน้าที่เดียวคือทำให้ตัวเลขเวลาของทุกคน "นิ่ง" ก่อนเอาไปคิดเงิน
 * ปิดรอบแล้วตัวเลขถูกล็อก และปิดแล้วปิดเลย ไม่มีการเปิดกลับ (ตามต้นแบบ)
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

import { useState } from "react";
import { thaiDate, thaiMonth, todayIso } from "@/lib/format";
import {
  HR_ISSUE_LABEL,
  HR_LEAVE_LABEL,
  HR_OT_LABEL,
  daysOf,
  empOf,
  hrCycle,
  hrPos,
  inPeriod,
  isDaily,
  lateMin,
  leaveDays,
  openIssues,
  otKindAt,
  otHours,
  recIn,
  workedDaysIn,
  type Employee,
  type TimeRec,
  type PayGroup,
  GROUP_LABEL,
} from "@/lib/hr-data";
import {
  closePeriod,
  noteIssue,
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
  usePayGroup,
  useUrlMonth,
} from "./hr-steps";
import { usePendingInMonth, useHrTime, useMissingApproved, type MissingReq } from "@/lib/hr-link";
import { MissingBox } from "./hr-payroll-page";
import { targetWorkMs } from "@/lib/work-schedule";
import { PencilIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { Field, Select } from "./ui";

type Sum = { lateMin: number; lateN: number; lv: number; ot: number };
type Line = { e: Employee; r: TimeRec; days: number };

/*
 * ชั่วโมงทำงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) — วันทำงาน × ชั่วโมงต่อวันตามเวลางานที่ตั้งไว้ (หักพักแล้ว) − นาทีที่มาสาย
 * ไม่รวมโอที (แยกคอลัมน์อยู่แล้ว) · ระบบยังไม่มีเวลากดออกจริงของทุกวัน จึงคิดจากตารางเวลางาน
 */
const workHours = (days: number, r: TimeRec) => Math.max(0, days * (targetWorkMs() / 3_600_000) - lateMin(r) / 60);

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
  /* มาจากขั้นอื่นพร้อม ?m= ก็เปิดรอบนั้นเลย ไม่ต้องเลือกใหม่ (ต้นแบบ urlMonth) */
  const urlMonth = useUrlMonth(hr.periods.map((p) => p.month));
  const [month, setMonth] = useState(urlMonth || hr.periods[hr.periods.length - 1].month);
  /* เวลาทำงานอ่านผ่านสะพาน — ใบลาใบโอทีของคนที่ผูกบทบาทไว้มาจากใบจริงในระบบ */
  const time = useHrTime();
  /* ใบที่ยังไม่ตัดสินและตกอยู่ในรอบนี้ ปิดรอบไปทั้งที่มีใบค้าง = ตัวเลขจะเปลี่ยนทีหลัง */
  const pending = usePendingInMonth(month);
  /* edit = เปิดจากปุ่มแก้ไข — กล่องจะเปิดช่องแก้รายการแรกให้เลย ไม่ต้องหาเอง */
  const [viewing, setViewing] = useState<{ id: string; edit: boolean } | null>(null);
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
  const locked = group === "month" ? period.closed : period.dayClosed;
  const cycle = hrCycle(month);

  /* คนที่มีรายการต้องตรวจขึ้นก่อน เพราะนั่นคือสิ่งเดียวที่กั้นไม่ให้ปิดรอบ */
  const people = hr.emp
    .filter((e) => inPeriod(e, month))
    .map((e) => {
      const r = recIn(time, e.id, month);
      const days = isDaily(e)
        ? workedDaysIn(e, cycle, time, today)
        : daysOf(e, month).length - leaveDays(r);
      return { e, r, days };
    })
    .sort((a, b) => openIssues(b.r).length - openIssues(a.r).length);

  const monthly = people.filter((x) => !isDaily(x.e));
  const daily = people.filter((x) => isDaily(x.e));

  const dailyDays = daily.reduce((n, x) => n + x.days, 0);
  const dailyOt = daily.reduce((n, x) => n + otHours(x.r), 0);

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
  const closeWhy = !cutReady
    ? `ปิดรอบได้เมื่อถึงวันตัดรอบแล้ว (${thaiDate(cycle.to)})`
    : groupOpen > 0
      ? `ยังมีรายการที่ต้องตรวจ ${groupOpen} รายการ`
      : missing.length > 0
        ? `มีใบที่อนุมัติแล้วยังไม่เข้ารอบนี้ ${missing.length} ใบ — ปิดรอบตอนนี้เวลาก้อนนี้จะหาย`
        : undefined;
  const closedAt = group === "month" ? period.closedAt : period.dayClosedAt;
  const closedById = group === "month" ? period.closedBy : period.dayClosedBy;
  const reopenedTimes = (group === "month" ? period.reopened : period.dayReopened).length;
  const closedBy = closedById ? (empOf(hr.emp, closedById)?.name ?? closedById) : "";

  return (
    <div className={`hp-page space-y-4 ${g.picked ? "" : "hp-pick"}`}>
      <PayHead
        title={thaiMonth(month)}
        onBack={g.picked ? g.home : undefined}
        onCal={() => setCal(true)}
      />
      <PayTiles onOpen={g.open} />

      <div className="bar">
        <div>
          <h1>สรุปเวลาทำงาน</h1>
        </div>
        <div className="tools w-full flex-wrap items-end sm:w-auto">
          <Field label="รอบเดือน">
            <Select
              value={month}
              onChange={(e) => {
                setMonth(e.target.value);
                setViewing(null);
              }}
              aria-label="เลือกรอบเดือน"
              className="w-auto min-w-[170px] font-semibold"
            >
              {[...hr.periods].reverse().map((p) => (
                <option key={p.month} value={p.month}>
                  {thaiMonth(p.month)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>

      <HrSteps month={month} group={tab} />

      <section className="panel glass flex flex-col">
        <div className="strip">
          {/* แท็บสลับกลุ่มเอาออก — เลือกกลุ่มจากเมนูย่อยแทน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          {locked ? (
            /* ปิดแล้วปิดเลย ป้ายแทนที่ปุ่ม ไม่มีทางเปิดกลับ */
            <span className="tag t-ok my-2 ml-auto">
              <i />
              ปิดรอบแล้ว {thaiDate(closedAt)}
            </span>
          ) : (
            <button
              type="button"
              className="btn solid btn-solid my-2 ml-auto disabled:opacity-45"
              style={{ height: 38 }}
              /* ปิดรอบไม่ได้ถ้ายังไม่ถึงวันตัดรอบ หรือยังมีรายการค้างตรวจ
                 กันตรงนี้ ไม่ใช่ไปเตือนตอนกดยืนยัน */
              disabled={Boolean(closeWhy)}
              title={closeWhy}
              onClick={() => setClosing(true)}
            >
              ปิดรอบ
            </button>
          )}
        </div>

        {/* ใบที่อนุมัติแล้วแต่ไม่ปรากฏในรอบ — เคยเงียบมาแล้ว ต้องเห็นบนหน้าจอ ไม่ใช่รอให้พนักงานทัก */}
        {missing.length > 0 && <MissingBox rows={missing} emp={hr.emp} />}

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
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
                <Th w={96} unit="วัน">ลา</Th>
                <Th w={124} unit="ชม.">โอทีวันธรรมดา</Th>
                <Th w={116} unit="ชม.">โอทีวันหยุด</Th>
                <th style={{ width: 150 }}>ต้องตรวจ</th>
                <th className="c" style={{ width: 110 }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-muted-foreground">
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
            {closeWhy && <p className="hp-why">ยังปิดรอบไม่ได้ — {closeWhy}</p>}
            <button
              type="button"
              className="btn solid btn-solid disabled:opacity-45"
              disabled={Boolean(closeWhy)}
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
              คิดค่าจ้างตามวันที่มาทำงานจริง นับถึง {thaiDate(today)}
              <CycleTag
                locked={locked}
                open={groupOpen}
                at={closedAt}
                by={closedBy}
                reopened={reopenedTimes}
              />
            </span>
            {daily.length > 0 && (
              /* สองบรรทัดตาม mockup (dayFoot) */
              <span className="sum flex flex-col sm:ml-auto">
                <span>
                  วันที่มาทำงานรวม<b>{dailyDays}</b> วัน
                </span>
                <span>
                  โอที<b>{dailyOt.toFixed(2)}</b> ชม.
                </span>
              </span>
            )}
          </div>
        )}
      </section>

      {current && viewing && (
        <DayDetail
          key={current.id}
          emp={current}
          month={month}
          locked={locked}
          rec={recIn(time, current.id, month)}
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
          month={month}
          group={group}
          blocked={Boolean(closeWhy)}
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
  line: { e, r, days },
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
  const open = openIssues(r).length;
  const fixed = r.issues.length - open;
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
      aria-label={`ดูรายละเอียดรายวันของ ${e.name}`}
      className={`cursor-pointer ${open ? "bg-[#FFF7F7]" : ""}`}
    >
      <td data-label="พนักงาน">
        <b className="block truncate text-[13.5px] font-semibold">{e.name}</b>
        <em className="block truncate text-[11.5px] not-italic text-muted-foreground">
          {hrPos(e.pos).label}
        </em>
      </td>
      <td data-label={dayLabel} className="c num">
        {days}
      </td>
      <Num label="ชั่วโมงทำงาน (ชม.)" v={workHours(days, r)} fixed2 />
      <Num label="มาสาย (นาที)" v={lateMin(r)} />
      {/* ลา = ที่อนุมัติแล้วเท่านั้น · ไม่โชว์ใบที่รออนุมัติ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
      <td data-label="ลา (วัน)" className={`c num ${leaveDays(r) ? "" : "text-muted-foreground"}`}>
        {leaveDays(r)}
      </td>
      <Num label="โอทีวันธรรมดา (ชม.)" v={otHours(r, "after_work")} fixed2 />
      {/* วันหยุดราชการรวมอยู่ในช่องวันหยุด — ต้นแบบแยกแค่วันธรรมดากับวันหยุด (เรตยังคิดแยกในเงินเดือน) */}
      <Num label="โอทีวันหยุด (ชม.)" v={otHours(r, "holiday") + otHours(r, "public")} fixed2 />
      <td data-label="ต้องตรวจ">
        {open > 0 ? (
          <span className="tag t-late">
            <i />
            ต้องตรวจ {open}
          </span>
        ) : fixed > 0 ? (
          <span className="tag t-early">
            <i />
            บันทึกเหตุผลแล้ว
          </span>
        ) : (
          <span className="tag t-ok">
            <i />
            ครบถ้วน
          </span>
        )}
      </td>
      <td data-label="จัดการ" className="c">
        {/* แถวที่ครบถ้วนไม่มีอะไรต้องแก้ ปุ่มแก้ไขจึงขึ้นเฉพาะแถวที่มีรายการต้องตรวจ */}
        {locked || r.issues.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <button
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onEdit();
            }}
            aria-label={`แก้ไขเวลาของ ${e.name}`}
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
  line: { e, r, days },
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
  const open = openIssues(r).length;
  const fixed = r.issues.length - open;
  const late = lateMin(r);
  const lv = leaveDays(r);
  const otW = otHours(r, "after_work");
  const otH = otHours(r, "holiday") + otHours(r, "public");
  return (
    <PayCard
      title={e.name}
      sub={hrPos(e.pos).label}
      collapsed={!expanded}
      onOpen={onToggle}
      openLabel={`${expanded ? "ซ่อน" : "ดู"}ตัวเลขเวลาของ ${e.name}`}
      corner={
        <>
          {open > 0 ? (
            <span className="tag t-late">
              <i />
              ต้องตรวจ {open}
            </span>
          ) : fixed > 0 ? (
            <span className="tag t-early">
              <i />
              บันทึกเหตุผลแล้ว
            </span>
          ) : (
            <span className="tag t-ok">
              <i />
              ครบถ้วน
            </span>
          )}
          {/* ปุ่มแก้ขึ้นเฉพาะคนที่มีรายการต้องตรวจ และรอบยังไม่ปิด เหมือนคอลัมน์จัดการบนจอกว้าง */}
          {!locked && r.issues.length > 0 && (
            <PayIconBtn label={`แก้ไขเวลาของ ${e.name}`} title="แก้ไข" onClick={onEdit}>
              <PencilIcon strokeWidth={1.9} />
            </PayIconBtn>
          )}
        </>
      }
      rows={[
        { label: dayLabel, value: days },
        { label: "ชั่วโมงทำงาน (ชม.)", value: workHours(days, r).toFixed(2) },
        { label: "มาสาย (นาที)", value: late, muted: !late },
        /* ลาที่อนุมัติแล้ว · ใบที่ยังรออนุมัติบอกไว้ข้างล่าง ยังไม่นับเป็นวันลา */
        {
          label: "ลา (วัน)",
          value: (
            <>
              {lv}
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
  month,
  locked,
  rec,
  onClose,
}: {
  emp: Employee;
  month: string;
  locked: boolean;
  rec: TimeRec;
  onClose: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});

  /* รวมทุกอย่างเข้าเป็น "วันที่" เดียวกัน เพราะวันหนึ่งอาจมาสายและมีโอทีพร้อมกัน */
  const byDay = new Map<string, React.ReactNode[]>();
  const push = (d: string, node: React.ReactNode) => {
    byDay.set(d, [...(byDay.get(d) ?? []), node]);
  };

  for (const x of rec.late) {
    push(
      x.d,
      <span key={`late-${x.d}`} className="flex flex-wrap items-center gap-2">
        <span className="tag t-late">
          <i />
          มาสาย {x.min} นาที
        </span>
        {x.was != null && (
          <em className="num basis-full text-[11.5px] not-italic text-muted-foreground">
            แก้จาก {x.was} นาที
          </em>
        )}
      </span>,
    );
  }

  for (const x of rec.leave) {
    push(
      x.d,
      <span key={`lv-${x.d}`} className="tag t-info">
        <i />
        {HR_LEAVE_LABEL[x.type]}
        {x.span === "half" ? " ครึ่งวัน" : ""}
      </span>,
    );
  }

  for (const x of rec.ot) {
    push(
      x.d,
      <span key={`ot-${x.d}`} className="flex flex-wrap items-center gap-2">
        <span className="tag t-early">
          <i />
          โอที {x.h.toFixed(2)} ชม. {HR_OT_LABEL[otKindAt(x)]}
        </span>
        {x.was != null && (
          <em className="num basis-full text-[11.5px] not-italic text-muted-foreground">
            แก้จาก {x.was.toFixed(2)} ชม.
          </em>
        )}
      </span>,
    );
  }

  const days = [...byDay.keys()].sort();

  return (
    <Sheet
      title={`${emp.name} ${thaiMonth(month)}`}
      wide
      onClose={onClose}
      footer={
        <button type="button" className="btn glass-thin" onClick={onClose}>
          ปิด
        </button>
      }
    >
      {/* มือถือ: รายการที่ต้องตรวจขึ้นก่อน แต่ละวันเป็นการ์ด ช่องเหตุผลกับปุ่มบันทึกเต็มความกว้าง (ต้นแบบ ts-detail) */}
      <div className="hp-dlg">
      <section className="hp-sect">
        <h3 className="mb-2.5 text-[12.5px] font-bold text-primary">วันที่มีรายการ</h3>
        {days.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">ไม่มีวันที่ผิดจากปกติ</p>
        ) : (
          days.map((d) => (
            <div key={d} className="hp-dayrow border-t border-border py-3 first:border-t-0 first:pt-1">
              <p className="num text-[12px] font-semibold text-muted-foreground">{thaiDate(d)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2.5">{byDay.get(d)}</div>
            </div>
          ))
        )}
        {/* มาสายและโอทีแสดงอย่างเดียว ถ้าผิดต้องแก้ที่ต้นทาง (บันทึกเวลา / ใบขอโอที) */}
        {locked && <p className="mt-2.5 text-[12.5px] text-muted-foreground">รอบนี้ปิดแล้ว</p>}
      </section>

      <section className={`hp-sect ${rec.issues.length > 0 ? "fix" : ""} mt-5 border-t border-border pt-4`}>
        <h3 className="mb-2.5 text-[12.5px] font-bold text-primary">รายการที่ต้องตรวจ</h3>
        {rec.issues.length === 0 ? (
          <p className="text-[12.5px] text-muted-foreground">ไม่มีรายการที่ต้องตรวจ</p>
        ) : (
          rec.issues.map((x) => (
            <div key={x.d} className="hp-dayrow border-t border-border py-3 first:border-t-0 first:pt-1">
              <p className="num text-[12px] font-semibold text-muted-foreground">{thaiDate(x.d)}</p>
              <span className={`tag mt-2 ${x.note ? "t-early" : "t-late"}`}>
                <i />
                {HR_ISSUE_LABEL[x.kind]}
              </span>
              {x.note ? (
                <p className="mt-2 text-[12.5px] text-muted-foreground">เหตุผลที่บันทึกไว้ · {x.note}</p>
              ) : locked ? (
                <p className="mt-2 text-[12.5px] text-muted-foreground">รอบนี้ปิดแล้ว</p>
              ) : (
                <div className="hp-fixbox mt-2.5 flex items-center gap-2">
                  <input
                    value={notes[x.d] ?? ""}
                    onChange={(e) => setNotes((v) => ({ ...v, [x.d]: e.target.value }))}
                    placeholder="ระบุเหตุผลหรือผลการตรวจสอบ"
                    aria-label={`เหตุผลของวันที่ ${thaiDate(x.d)}`}
                    style={{ height: 36 }}
                    className="field-control min-w-0 flex-1 rounded-[10px] px-3 text-[13px]"
                  />
                  <button
                    type="button"
                    className="btn solid btn-solid flex-none disabled:opacity-45"
                    disabled={!(notes[x.d] ?? "").trim()}
                    onClick={() => noteIssue(emp.id, x.d, (notes[x.d] ?? "").trim())}
                  >
                    บันทึก
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>
      </div>
    </Sheet>
  );
}

/* ปิดรอบต้องเคลียร์ทั้งสองแท็บ บอกบนแท็บเลยว่าค้างอยู่ฝั่งไหน ไม่งั้นต้องสลับไปหาเอง */
function issuesOf(list: { r: Parameters<typeof openIssues>[0] }[]) {
  return list.reduce((n, x) => n + openIssues(x.r).length, 0);
}

// ─── ปิดรอบ ──────────────────────────────────────────────────────

function CloseDialog({
  month,
  group,
  blocked,
  why,
  people,
  sum,
  pending,
  missing,
  emp,
  today,
  onClose,
}: {
  month: string;
  group: PayGroup;
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
  const c = hrCycle(month);

  function confirm() {
    /* กันไว้อีกชั้น เผื่อสถานะเปลี่ยนระหว่างเปิดกล่อง */
    if (blocked) return;
    closePeriod(month, today, group);
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
            <dd className="num font-semibold">{sum.lv} วัน</dd>
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
  reopened,
}: {
  locked: boolean;
  open: number;
  at: string;
  by: string;
  reopened: number;
}) {
  if (locked) {
    return (
      <span className="tag t-ok">
        <i />
        ปิดรอบแล้ว {thaiDate(at)}
        {by && ` โดย ${by}`}
        {reopened > 0 && ` · เคยเปิดรอบใหม่ ${reopened} ครั้ง`}
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
      รอบยังไม่จบ ตัวเลขจะเพิ่มทุกวันทำงาน
    </span>
  );
}
