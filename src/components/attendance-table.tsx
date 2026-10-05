"use client";
import { holidays } from "@/lib/holidays";
import { bkkNow, bkkOf, toIsoDate } from "@/lib/format";

import { useSearchParams } from "next/navigation";
import { useMemo, useState, useSyncExternalStore } from "react";
import { dayKey, recordsOfDay, type PunchRecord } from "@/lib/attendance";
import {
  getClockServerSnapshot,
  getClockSnapshot,
  getRecordsServerSnapshot,
  getRecordsSnapshot,
  subscribeClock,
  subscribeRecords,
} from "@/lib/attendance-store";
import { type LeaveRecord } from "@/lib/leave-data";
import { OT_KIND, otKindOf, type OtRecord } from "@/lib/ot-data";
import { useOtRecords } from "@/lib/ot-store";
import { leavesOnDate, useLeaveRecords } from "@/lib/leave-store";
import {
  formatMinutesOfDay,
  hoursText,
  leaveWindowOf,
  minutesOfTime,
  shiftOf,
  actualMinutesOf,
  type LeaveWindow,
} from "@/lib/work-schedule";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const PER_PAGE = 10;

const TH_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
const TH_DAYS = [
  "อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์",
];

type Status = "ok" | "late" | "early" | "leave" | "leaveWait" | "miss" | "working" | "holiday";

const STATUS: Record<Status, { label: string; cls: string }> = {
  ok: { label: "ปกติ", cls: "t-ok" },
  late: { label: "มาสาย", cls: "t-late" },
  early: { label: "ออกก่อนเวลา", cls: "t-early" },
  leave: { label: "ลา", cls: "t-leave" },
  /* ยื่นใบลาไว้แต่ยังไม่อนุมัติ — ยังไม่ใช่วันลา ต้องแยกให้เห็นว่าต่างกัน (ผู้ใช้ตัดสิน 24 ก.ย. 2569) */
  leaveWait: { label: "รออนุมัติลา", cls: "t-early" },
  miss: { label: "ขาดบันทึก", cls: "t-miss" },
  working: { label: "กำลังทำงาน", cls: "t-work" },
  holiday: { label: "วันหยุด", cls: "t-info" },
};

const TABS = [
  { key: "all", label: "ทั้งเดือน" },
  { key: "issue", label: "ต้องตรวจสอบ" },
  { key: "leave", label: "วันลา" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type DayRow = {
  key: string;
  date: Date;
  off: boolean;
  /** ชื่อวันหยุดบริษัท (ตั้งที่หน้าผู้ดูแลระบบ) — ว่างคือวันทำงานปกติ */
  holiday: string;
  isToday: boolean;
  inMin: number | null;
  outMin: number | null;
  leave: LeaveWindow;
  leaveName: string;
  /** ใบลาของวันนั้นยังรออนุมัติอยู่ — ยังไม่หักสิทธิ์และยังไม่ใช่วันลา */
  leaveWaiting: boolean;
  /** โอทีของวันนั้นจากหน้าคำขอทำล่วงเวลา — ชั่วโมงกับสถานะล่าสุด */
  ot: { hours: number; status: string; rate: number } | null;
  note: string;
};

export function AttendanceTable() {
  const records = useSyncExternalStore(
    subscribeRecords,
    getRecordsSnapshot,
    getRecordsServerSnapshot,
  );
  const tick = useSyncExternalStore(
    subscribeClock,
    getClockSnapshot,
    getClockServerSnapshot,
  );
  const leaveRecords = useLeaveRecords();
  const otRecords = useOtRecords();
  const now = useMemo(() => (tick ? new Date(tick) : null), [tick]);

  /* หน้าการลากับโอทีลิงก์มาหาเดือนของรายการที่กดด้วย ?month=YYYY-MM
     แปลงเป็นระยะห่างจากเดือนนี้ เพราะตารางเดินด้วยตัวนับเดือนอยู่แล้ว */
  const monthParam = useSearchParams().get("month");
  const [monthOffset, setMonthOffset] = useState(() => monthsFromNow(monthParam));
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);

  const viewMonth = useMemo(() => {
    const base = now ? bkkOf(now) : bkkNow();
    return new Date(base.getFullYear(), base.getMonth() + monthOffset, 1);
  }, [now, monthOffset]);

  // ผูกกับ "วันที่" ไม่ใช่ "เวลา" ไม่งั้นตารางถูกสร้างใหม่ทุกวินาทีตามนาฬิกา
  const todayKey = now ? dayKey(now) : null;
  const rows = useMemo(
    () =>
      todayKey ? buildRows(viewMonth, todayKey, records, leaveRecords, otRecords) : [],
    [viewMonth, todayKey, records, leaveRecords, otRecords],
  );

  const workdays = useMemo(() => rows.filter((r) => !r.off), [rows]);
  const scoped = useMemo(() => {
    if (tab === "issue") return workdays.filter((r) => isIssue(r));
    if (tab === "leave") return workdays.filter((r) => r.leave !== null || r.leaveWaiting);
    return workdays;
  }, [workdays, tab]);

  /* วันที่ยื่นใบลาไว้แต่ยังไม่มีใครตัดสิน — แสดงแยก ไม่รวมกับวันลาที่อนุมัติแล้ว */
  const waitingDays = useMemo(
    () => workdays.filter((r) => r.leave === null && r.leaveWaiting).length,
    [workdays],
  );

  const maxPage = Math.max(1, Math.ceil(scoped.length / PER_PAGE));
  const safePage = Math.min(page, maxPage);
  const from = (safePage - 1) * PER_PAGE;
  const list = scoped.slice(from, from + PER_PAGE);
  const totalMinutes = scoped.reduce(
    (sum, r) => sum + actualMinutesOf(r.inMin, r.outMin),
    0,
  );

  return (
    <div className="space-y-4">
      {/* ── หัวเรื่อง + เครื่องมือ ── */}
      <div className="bar">
        <div>
          <h1>บันทึกเวลาของฉัน</h1>
        </div>
        <div className="tools">
          <div className="mo glass-thin">
            <button
              type="button"
              onClick={() => {
                setMonthOffset((v) => v - 1);
                setPage(1);
              }}
              aria-label="เดือนก่อนหน้า"
            >
              <ChevronLeftIcon className="size-[15px]" strokeWidth={2.4} />
            </button>
            <span>
              {TH_MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear() + 543}
            </span>
            <button
              type="button"
              disabled={monthOffset >= 0}
              onClick={() => {
                setMonthOffset((v) => Math.min(0, v + 1));
                setPage(1);
              }}
              aria-label="เดือนถัดไป"
            >
              <ChevronRightIcon className="size-[15px]" strokeWidth={2.4} />
            </button>
          </div>

        </div>
      </div>

      {/* ── แผงตาราง ── */}
      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            {TABS.map((t) => {
              const count =
                t.key === "all"
                  ? workdays.length
                  : t.key === "issue"
                    ? workdays.filter(isIssue).length
                    : /* นับเฉพาะวันที่อนุมัติแล้ว — สิทธิ์ตัดตอนอนุมัติเท่านั้น (เจ้าของสั่ง 24 ก.ย. 2569)
                         ใบที่ยังรออนุมัติยังอยู่ในตารางของแท็บนี้ แต่บอกแยกใต้แท็บว่ารออนุมัติกี่วัน */
                      workdays.filter((r) => r.leave !== null).length;
              return (
                <button
                  key={t.key}
                  type="button"
                  className={tab === t.key ? "on" : ""}
                  onClick={() => {
                    setTab(t.key);
                    setPage(1);
                  }}
                >
                  {t.label} <b>{count}</b>
                </button>
              );
            })}
          </div>
          {/* ใบที่ยังรออนุมัติไม่ถูกนับเป็นวันลา แต่ต้องเห็นว่ามีค้างอยู่ ไม่ใช่หายไปเฉย ๆ */}
          {tab === "leave" && waitingDays > 0 && (
            <span className="py-2 text-[12px] font-semibold text-[var(--warning)]">
              รออนุมัติอีก {waitingDays} วัน (ยังไม่นับเป็นวันลา)
            </span>
          )}
          <div className="legend hidden sm:flex">
            <span><i style={{ background: "var(--success)" }} />ปกติ</span>
            <span><i style={{ background: "var(--destructive)" }} />มาสาย</span>
            <span><i style={{ background: "var(--warning)" }} />ออกก่อนเวลา</span>
            <span><i style={{ background: "var(--info)" }} />ลา</span>
            <span><i style={{ background: "var(--neutral)" }} />ขาดบันทึก</span>
            <span><i style={{ background: "var(--info)" }} />วันหยุด</span>
          </div>
        </div>

        <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto md:block">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                {/* ความกว้างเป็นสัดส่วน คอลัมน์จะกระจายเต็มตารางทุกขนาดจอ ไม่กองที่ช่องหมายเหตุ */}
                <th style={{ width: "14%" }}>วันที่</th>
                <th className="c" style={{ width: "11%" }}>เข้างาน</th>
                <th className="c" style={{ width: "11%" }}>ออกงาน</th>
                <th className="c" style={{ width: "12%" }}>กะที่ต้องทำ</th>
                <th className="c" style={{ width: "12%" }}>ชั่วโมงทำงาน</th>
                <th className="c" style={{ width: "12%" }}>โอที</th>
                <th className="c" style={{ width: "12%" }}>สถานะ</th>
                <th style={{ width: "16%" }}>หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-[50px] text-center text-muted-foreground">
                    ไม่มีรายการในหมวดนี้
                  </td>
                </tr>
              ) : (
                list.map((r) => <Row key={r.key} row={r} />)
              )}
            </tbody>
          </table>
        </div>

        <ul className="divide-y divide-border md:hidden">
          {list.length === 0 ? (
            <li className="px-5 py-12 text-center text-muted-foreground">
              ไม่มีรายการในหมวดนี้
            </li>
          ) : (
            list.map((r) => <MobileRow key={r.key} row={r} />)
          )}
        </ul>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>
            {scoped.length === 0
              ? "แสดง 0 วัน"
              : `แสดง ${from + 1}–${from + list.length} จาก ${scoped.length} วัน`}
          </span>
          <span className="sum">
            ชั่วโมงทำงานรวม<b>{(totalMinutes / 60).toFixed(1)}</b> ชม.
          </span>
          <div className="pages justify-center sm:justify-start">
            <button
              type="button"
              className="glass-thin"
              disabled={safePage === 1}
              onClick={() => setPage(safePage - 1)}
              aria-label="ก่อนหน้า"
            >
              ‹
            </button>
            {Array.from({ length: maxPage }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`glass-thin ${n === safePage ? "on" : ""}`}
                onClick={() => setPage(n)}
              >
                {n}
              </button>
            ))}
            <button
              type="button"
              className="glass-thin"
              disabled={safePage === maxPage}
              onClick={() => setPage(safePage + 1)}
              aria-label="ถัดไป"
            >
              ›
            </button>
          </div>
        </div>
      </section>

    </div>
  );
}

function Row({ row }: { row: DayRow }) {
  const s = shiftOf(row.leave);
  const status = statusOf(row);
  /* แสดงชั่วโมงที่อยู่จริง · เงินเดือนคิดเฉพาะในกะ (ไม่เกิน 8 ชม.) ที่ workedMinutesOf */
  const worked = actualMinutesOf(row.inMin, row.outMin);
  const lateM = status === "late" && row.inMin != null ? row.inMin - s.in : 0;
  const earlyM = status === "early" && row.outMin != null ? s.out - row.outMin : 0;

  return (
    <tr className={row.isToday ? "today" : undefined}>
      <td className="day">
        <b>
          {row.date.getDate()} {TH_MONTHS_SHORT[row.date.getMonth()]}{" "}
          {row.date.getFullYear() + 543}
        </b>
        <span>วัน{TH_DAYS[row.date.getDay()]}</span>
        {row.holiday && <span className="text-[var(--info)]">{row.holiday}</span>}
      </td>
      <td className="c num">
        {hhmm(row.inMin)}
        {lateM > 0 && <span className="diff late">+{lateM}</span>}
      </td>
      <td className="c num">
        {hhmm(row.outMin)}
        {earlyM > 0 && <span className="diff early">−{earlyM}</span>}
      </td>
      <td className="c num muted whitespace-nowrap">
        {row.holiday
          ? "วันหยุด"
          : s.out > s.in
            ? `${formatMinutesOfDay(s.in)}–${formatMinutesOfDay(s.out)}`
            : "ลาทั้งวัน"}
      </td>
      <td className="c num">
        {worked > 0 ? (
          <b className="font-semibold">{hoursText(worked)}</b>
        ) : (
          "—"
        )}
      </td>
      <td className="c num">
        {row.ot ? (
          <>
            <b className="font-semibold">{row.ot.hours} ชม.</b>
            <span className="sub2">
              ×{row.ot.rate} · {row.ot.status}
            </span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="c">
        <span className={`tag ${STATUS[status].cls}`}>
          <i />
          {STATUS[status].label}
        </span>
      </td>
      <td className="muted">{row.note || "—"}</td>
    </tr>
  );
}

/** แถวเดียวกันแต่จัดเป็นการ์ดสำหรับจอแคบ */
function MobileRow({ row }: { row: DayRow }) {
  const s = shiftOf(row.leave);
  const status = statusOf(row);
  const worked = actualMinutesOf(row.inMin, row.outMin);
  const lateM = status === "late" && row.inMin != null ? row.inMin - s.in : 0;
  const earlyM = status === "early" && row.outMin != null ? s.out - row.outMin : 0;
  /* กะของวันนี้ต่างจากกะมาตรฐานไหม — ต่างเมื่อวันนั้นมีใบลาครึ่งวันหรือลาทั้งวัน */
  const std = shiftOf(null);
  const offShift = s.in !== std.in || s.out !== std.out;

  return (
    <li className={`px-4 py-3 ${row.isToday ? "bg-[rgb(254_247_248/0.75)]" : ""}`}>
      {/* วันที่กับชื่อวันอยู่บรรทัดเดียว — เดือนหนึ่งมีสามสิบวัน ทุกบรรทัดที่ประหยัดได้คือหนึ่งจอที่ไม่ต้องเลื่อน */}
      <div className="flex items-center justify-between gap-3">
        <b className="num min-w-0 truncate text-[14.5px] font-semibold">
          {row.date.getDate()} {TH_MONTHS_SHORT[row.date.getMonth()]}{" "}
          {row.date.getFullYear() + 543}
          <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">
            วัน{TH_DAYS[row.date.getDay()]}
          </span>
        </b>
        <span className={`tag shrink-0 ${STATUS[status].cls}`}>
          <i />
          {STATUS[status].label}
        </span>
      </div>

      {row.holiday && <p className="mt-0.5 text-xs text-[var(--info)]">{row.holiday}</p>}

      <dl className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div>
          <dt className="text-[10.5px] text-muted-foreground">เข้างาน</dt>
          <dd className="num mt-0.5 text-[13.5px] font-semibold">
            {hhmm(row.inMin)}
            {lateM > 0 && <span className="diff late">+{lateM}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-muted-foreground">ออกงาน</dt>
          <dd className="num mt-0.5 text-[13.5px] font-semibold">
            {hhmm(row.outMin)}
            {earlyM > 0 && <span className="diff early">−{earlyM}</span>}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] text-muted-foreground">ทำงาน</dt>
          <dd className="num mt-0.5 text-[13.5px] font-semibold">
            {worked > 0 ? hoursText(worked) : "—"}
          </dd>
        </div>
      </dl>

      {row.ot && (
        <p className="mt-2 text-xs text-[var(--info)]">
          โอที {row.ot.hours} ชม. ×{row.ot.rate} · {row.ot.status}
        </p>
      )}

      {/* กะปกติไม่ต้องบอกซ้ำทุกวัน — บอกเฉพาะวันที่กะไม่ตรงค่ามาตรฐาน (ลาครึ่งวัน/ลาทั้งวัน) หรือมีหมายเหตุ */}
      {(offShift || row.note) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {offShift &&
            (s.out > s.in
              ? `กะ ${formatMinutesOfDay(s.in)}–${formatMinutesOfDay(s.out)}`
              : "ลาทั้งวัน")}
          {offShift && row.note ? " · " : ""}
          {row.note}
        </p>
      )}
    </li>
  );
}

// ─── ตรรกะ ────────────────────────────────────────────────────────
function hhmm(m: number | null) {
  return m == null ? "—" : formatMinutesOfDay(m);
}

function statusOf(r: DayRow): Status {
  const s = shiftOf(r.leave);
  const required = Math.max(0, s.out - s.in);
  // ลาทั้งวัน = ไม่ต้องทำงาน ต่อให้แวะมาตอกบัตรก็ยังนับเป็นวันลา
  if (r.leave && required === 0) return "leave";
  /* ยื่นลาไว้แต่ยังไม่อนุมัติและวันนั้นไม่ได้ตอกบัตร — ยังไม่ใช่วันลา และยังไม่ใช่ขาดบันทึก */
  if (r.leaveWaiting && r.inMin == null && r.outMin == null) return "leaveWait";
  /* วันหยุดบริษัทที่ไม่ได้มาทำงาน ไม่ใช่ขาดบันทึก — มาทำงานวันหยุดยังแสดงเวลาตามจริง */
  if (r.holiday && r.inMin == null) return "holiday";
  // วันนี้ที่ตอกเข้าแล้วแต่ยังไม่ออก ยังไม่ถือว่าขาดบันทึก
  if (r.isToday && r.inMin != null && r.outMin == null) return "working";
  if (r.inMin == null || r.outMin == null) return "miss";
  if (r.inMin > s.in) return "late";
  if (r.outMin < s.out) return "early";
  return "ok";
}

function isIssue(r: DayRow) {
  const st = statusOf(r);
  return st === "late" || st === "early" || st === "miss";
}

/** รวมบันทึกตอกบัตรกับใบลาให้เป็นแถวรายวันของเดือนนั้น */
function buildRows(
  month: Date,
  todayKey: string,
  records: PunchRecord[],
  leaves: LeaveRecord[],
  otRecords: OtRecord[],
): DayRow[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const lastDay = new Date(year, m + 1, 0).getDate();
  const today = new Date(`${todayKey}T00:00:00`);
  const isCurrentMonth =
    year === today.getFullYear() && m === today.getMonth();
  const until = isCurrentMonth ? today.getDate() : lastDay;

  /*
   * เรียงจากวันล่าสุดลงไปหาวันเก่า
   * คนเปิดหน้านี้มาดูว่า "เมื่อวานกับวันนี้เป็นยังไง" ไม่ได้มาไล่อ่านตั้งแต่ต้นเดือน
   * ถ้าเรียงจากวันที่ 1 วันล่าสุดจะไปอยู่หน้าสุดท้ายของตัวแบ่งหน้า
   */
  const out: DayRow[] = [];
  for (let d = until; d >= 1; d--) {
    const date = new Date(year, m, d);
    const key = toIsoDate(date);
    const dayRecords = recordsOfDay(records, key);
    const first = dayRecords.find((r) => r.type === "in") ?? null;
    const last = [...dayRecords].reverse().find((r) => r.type === "out") ?? null;
    /* ใบที่ยังรออนุมัติยังไม่ใช่วันลา — กะงานของวันนั้นจึงยังเป็นกะปกติ
       ใบที่อนุมัติแล้วเท่านั้นที่ตัดกะทิ้ง (ยื่นใบลา ≠ ได้ลา · ผู้ใช้ตัดสิน 24 ก.ย. 2569) */
    const onDate = leavesOnDate(leaves, key);
    const leave = onDate.find((r) => r.status === "อนุมัติแล้ว");
    const waiting = !leave ? onDate[0] : undefined;
    /* ใบโอทีของวันนั้น — ยกเลิกแล้วไม่นับ ที่เหลือรวมชั่วโมงเป็นก้อนเดียว */
    const otOfDay = otRecords.filter((o) => o.date === key && o.status !== "ยกเลิก");
    const otHoursOfDay = otOfDay.reduce(
      (sum, o) => sum + (o.approvedHours ?? o.hours),
      0,
    );

    out.push({
      key,
      date,
      off: date.getDay() === 0 || date.getDay() === 6,
      holiday: holidays()[key] ?? "",
      isToday: key === todayKey,
      inMin: first ? minutesOfTime(new Date(first.at)) : null,
      outMin: last ? minutesOfTime(new Date(last.at)) : null,
      leave: leaveWindowOf(leave),
      leaveName: leave?.type ?? waiting?.type ?? "",
      leaveWaiting: Boolean(waiting),
      ot: otOfDay.length
        ? {
            hours: Math.round(otHoursOfDay * 100) / 100,
            /* หลายใบในวันเดียว ให้ยึดสถานะที่ยังไม่จบก่อน จะได้ไม่เข้าใจว่าอนุมัติหมดแล้ว */
            status: otOfDay.find((o) => o.status === "รออนุมัติ")?.status ?? otOfDay[0].status,
            rate: OT_KIND[otKindOf(key)].rate,
          }
        : null,
      note:
        dayRecords.find((r) => r.note)?.note ??
        (leave
          ? `${leave.type}${leave.comment ? ` · ${leave.comment}` : ""}`
          : waiting
            ? `ยื่นลาไว้ ${waiting.type} เลขที่ ${waiting.id} · รออนุมัติ`
            : ""),
    });
  }
  return out;
}

/** "2026-08" → -1 เมื่อตอนนี้คือ 2026-09 · ค่าที่อ่านไม่ได้หรืออนาคตให้เป็นเดือนนี้ */
function monthsFromNow(month: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return 0;
  const [y, m] = month.split("-").map(Number);
  const now = bkkNow();
  const diff = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  return Math.min(0, diff);
}
