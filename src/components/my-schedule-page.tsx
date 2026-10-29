"use client";

/*
 * ตารางงานของทีมงาน — ใช้ปฏิทินชุดเดียวกับทุกบทบาท (schedule-board.tsx)
 *
 * เจ้าของสั่ง 24 ก.ย. 2569 ว่าหน้าตารางงานต้องหน้าตาเหมือนกันทุกอัน
 * ต่างกันแค่ว่าในปฏิทินมีอะไร และหน้านี้เพิ่มนัดไม่ได้ (ไม่ส่ง onAdd)
 *
 * สามชนิด
 *   งานที่ได้รับ (น้ำเงิน)   — งานย่อยที่ PM มอบหมาย ตามวันกำหนดส่ง กดแล้วเปิดใบงานนั้น
 *   วันลาของฉัน (ส้ม)      — ใบลาของตัวเอง กดแล้วเปิดใบนั้นในหน้าการลา
 *   นัดหมายที่ถูกเชิญ (ม่วง) — นัดที่ PM หรือ GM ใส่ชื่อเราไว้ กดแล้วดูรายละเอียด
 *
 * **หน้านี้สร้างอะไรไม่ได้เลย** สร้างนัดหมายได้เฉพาะ PM กับ GM (เจ้าของสั่ง 24 ก.ย. 2569)
 * ถ้าทีมงานอยากนัดใคร ต้องขอให้ PM หรือ GM เป็นคนตั้งนัดให้
 *
 * sales = ตารางงานของฝ่ายขาย (/sales-schedule · ผู้ใช้สั่ง 5 ต.ค. 2569) — ใช้หน้านี้ชุดเดียวกัน
 *   แทน "งานที่ได้รับ" ด้วยวันที่ต้องการข้อเสนอของคำขอก่อนการขาย กับวันหมดอายุของใบเสนอราคาที่รอคำตอบ
 */

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { bkkNow, thaiDate, toIsoDate } from "@/lib/format";
import { quotationValidUntil, PRESALES_OPEN } from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { useHr } from "@/lib/hr-store";
import { displayName } from "@/lib/emp-name";
import { useLeaveRecords } from "@/lib/leave-store";
import { fmtLeaveHours, leaveHoursOf } from "@/lib/leave-data";
import { invitedEvents, type PmEvent } from "@/lib/pm-schedule-data";
import { useSchedule } from "@/lib/pm-schedule-store";
import { usePm } from "@/lib/pm-store";
import { useProfile } from "@/lib/profile-data";
import { AppointmentSheet } from "./appointment-sheet";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  LeaveIcon,
  MenuIcon,
  PresalesIcon,
  QuotationIcon,
  TasksIcon,
  UsersIcon,
} from "./icons";
import {
  boardOn,
  ScheduleBoard,
  tintPaint,
  useBoardNav,
  type BoardEvent,
  type BoardKind,
  type BoardNav,
} from "./schedule-board";
import "@/styles/mobile/my-schedule.css";

const KINDS: BoardKind[] = [
  { key: "task", label: "งานที่ได้รับ", color: "#1F6FD0" },
  { key: "leave", label: "วันลาของฉัน", color: "#B4630B" },
  { key: "meet", label: "นัดหมายที่ถูกเชิญ", color: "#6A2CA0" },
];

const SALES_KINDS: BoardKind[] = [
  { key: "ps", label: "คำขอก่อนการขาย", color: "#1F6FD0" },
  { key: "quote", label: "ใบเสนอราคาหมดอายุ", color: "#0E7C66" },
  { key: "leave", label: "วันลาของฉัน", color: "#B4630B" },
  { key: "meet", label: "นัดหมายที่ถูกเชิญ", color: "#6A2CA0" },
];
const ALL_KINDS = [...KINDS, ...SALES_KINDS];

const COLOR = Object.fromEntries(ALL_KINDS.map((k) => [k.key, k.color])) as Record<string, string>;

/*
 * สถานะงานที่ขึ้นในบรรทัดรอง และแท็บของหน้า "งานที่ได้รับ" ที่ต้องเปิดตอนกดลิงก์
 * ไม่ส่ง stage ไปด้วย หน้านั้นจะเปิดแท็บ "งานที่ได้รับ" เป็นค่าตั้งต้น
 * แล้วงานที่ส่งไปแล้วหรือถูกตีกลับจะหาไม่เจอ ทั้งที่ลิงก์ชี้มาที่ใบนั้นโดยตรง
 */
const TASK_STATE: Record<string, { label: string; stage: string }> = {
  done: { label: "ส่งแล้ว", stage: "done" },
  sent: { label: "รอตรวจ", stage: "sent" },
  revise: { label: "ต้องแก้ไข", stage: "revise" },
};
const TASK_TODO = { label: "ยังไม่ส่ง", stage: "recv" };

export function MySchedulePage({ sales = false }: { sales?: boolean }) {
  const sc = useSchedule();
  const crm = useCrm();
  const me = useProfile();
  const pm = usePm();
  const leave = useLeaveRecords();
  const nav = useBoardNav();
  /* นัดที่เปิดดูรายละเอียดอยู่ — ดูอย่างเดียว */
  const [open, setOpen] = useState<PmEvent | null>(null);

  const events = useMemo(() => {
    /* ข้อมูลของแถบ — มีเฉพาะนัดหมายที่กดแล้วเปิดกล่องรายละเอียดได้ นอกนั้นเป็นลิงก์ */
    const out: BoardEvent<PmEvent | null>[] = [];
    const paint = (kind: string) => ({ dot: COLOR[kind], paint: tintPaint(COLOR[kind]) });

    if (sales) {
      const nameOf = new Map(crm.customers.map((c) => [c.code, c.name]));
      for (const r of crm.presales) {
        if (!PRESALES_OPEN.includes(r.status) || !r.due) continue;
        out.push({
          id: `ps-${r.id}`,
          kind: "ps",
          start: r.due,
          end: r.due,
          title: `ต้องการข้อเสนอ · ${nameOf.get(r.customerCode) ?? "—"}`,
          bar: r.problem,
          sub: r.status,
          href: `/presales?find=${encodeURIComponent(r.no)}`,
          ...paint("ps"),
          data: null,
        });
      }
      /* ใบที่ยังรอคำตอบ — ส่งแล้ว ยังไม่เกิดดีล ไม่ถูกปฏิเสธ ไม่ถูกออกใบใหม่แทน */
      const dealt = new Set(crm.deals.map((d) => d.quotationNo));
      for (const q of crm.quotations) {
        if (!q.no || !q.sentAt || q.replacedBy || q.rejectedAt || dealt.has(q.no)) continue;
        const until = quotationValidUntil(q);
        out.push({
          id: `qt-${q.id}`,
          kind: "quote",
          start: until,
          end: until,
          title: `ใบเสนอราคาหมดอายุ · ${q.no}`,
          bar: `หมดอายุ ${q.no}`,
          sub: nameOf.get(q.customerCode) ?? "—",
          href: `/quotations/${encodeURIComponent(q.no)}`,
          ...paint("quote"),
          data: null,
        });
      }
    }
    if (!sales)
    for (const p of pm.projects)
      p.tasks.forEach((t, ti) => {
        if (!t.whos.includes(me.employeeId) || !t.due) return;
        const state = TASK_STATE[t.status] ?? TASK_TODO;
        out.push({
          id: `task-${p.pj}-${ti}`,
          kind: "task",
          start: t.due,
          end: t.due,
          title: `กำหนดส่ง · ${t.name}`,
          bar: t.name,
          sub: `${p.name || p.cus} · ${state.label}`,
          /* กดแล้วไปที่ใบงานนั้นในหน้า "งานที่ได้รับ" ซึ่งเป็นหน้าของทีมงานเอง */
          href: `/my-tasks?stage=${state.stage}&find=${encodeURIComponent(t.name)}`,
          ...paint("task"),
          data: null,
        });
      });
    for (const l of leave) {
      if (l.status === "ไม่อนุมัติ" || l.status === "ยกเลิก") continue;
      out.push({
        id: `leave-${l.id}`,
        kind: "leave",
        start: l.date,
        end: l.toDate || l.date,
        title: `${l.type} · ${fmtLeaveHours(leaveHoursOf(l))}`, /* จำนวนลาเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
        sub: l.status === "อนุมัติแล้ว" ? "อนุมัติแล้ว" : "รออนุมัติ",
        href: `/leave?find=${encodeURIComponent(l.id)}`,
        ...paint("leave"),
        data: null,
      });
    }
    for (const e of invitedEvents(sc.events, me.employeeId))
      out.push({
        id: `ev-${e.id}`,
        kind: "meet",
        start: e.date,
        end: e.dateEnd && e.dateEnd > e.date ? e.dateEnd : e.date,
        title: e.title,
        time: e.from || undefined,
        timeEnd: e.to || undefined,
        sub: e.place || undefined,
        /* นัดที่ถูกยกเลิกยังอยู่ในรายการแบบขีดฆ่า ไม่หายเงียบ (เจ้าของสั่ง 24 ก.ย. 2569) */
        cancelled: Boolean(e.cancel),
        cancelWhy: e.cancel?.why,
        ...paint("meet"),
        data: e,
      });
    return out;
  }, [sales, crm, pm.projects, me.employeeId, leave, sc.events]);

  return (
    <div className="space-y-4">
      {/* มือถือ (< md) ใช้ปฏิทินแบบแอปตามต้นแบบ my-schedule.html (.ms) · จอกว้างคงกระดานเดิม */}
      <MyMobileCalendar nav={nav} events={events} onOpen={(e) => e.data && setOpen(e.data)} />

      <div className="max-md:hidden">
        {/* ชื่อหน้ามุมซ้ายบน — แถบบนจอคอมเป็นเส้นทางแล้ว (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
        <h1 className="page-h1 mb-4">ตารางงาน</h1>
        <ScheduleBoard
          nav={nav}
          events={events}
          kinds={sales ? SALES_KINDS : KINDS}
          onOpen={(e) => e.data && setOpen(e.data)}
          /* หน้าตาเดียวกับตารางงาน PM — ไม่มีกล่องประเภท ดูอย่างเดียว ไม่ส่ง onAdd (ผู้ใช้สั่ง 9 ต.ค. 2569) */
          noKinds
        />
      </div>

      {open && (
        <AppointmentSheet event={open} note={sc.notes[open.id] ?? open.todo.join("\n")} onClose={() => setOpen(null)} className="m-ms-dlg" />
      )}
    </div>
  );
}

// ─── ปฏิทินแบบแอปบนมือถือ (ต้นแบบ my-schedule.html .ms) ─────────────

const M_DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const M_DW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const M_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** เส้นเวลาของมุมมองสัปดาห์ 08:00–19:00 · หนึ่งชั่วโมงสูง 64px */
const M_H0 = 8;
const M_H1 = 19;
const M_ROW = 64;
const M_CIRCLE =
  "grid size-9 flex-none place-items-center rounded-full border border-[#EFE3E5] bg-white text-[#2A1F22] shadow-[0_3px_8px_-4px_rgba(90,20,35,.25)]";
const KIND_LABEL = Object.fromEntries(ALL_KINDS.map((k) => [k.key, k.label])) as Record<string, string>;
const KIND_ICON: Record<string, typeof CalendarIcon> = {
  task: TasksIcon,
  leave: LeaveIcon,
  meet: UsersIcon,
  ps: PresalesIcon,
  quote: QuotationIcon,
};

type MyEvent = BoardEvent<PmEvent | null>;

const dateOf = (s: string) => new Date(`${s}T00:00:00`);
function addDays(d: Date, n: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + n);
  return x;
}
const minOf = (t?: string) => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
};
const tint = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`;
/** อักษรย่อชื่อ + นามสกุล (ต้นแบบ) — ข้ามคำนำหน้าและสระหน้า ไม่งั้นได้สระลอย ๆ */
function initials(name: string) {
  const one = (w: string) => (/^[เแโใไ]/.test(w) ? w.slice(0, 2) : w.slice(0, 1));
  const [a = "", b = ""] = name.replace(/^(นาย|นางสาว|นาง)\s*/, "").trim().split(/\s+/);
  return one(a) + one(b);
}

/*
 * มือถือ (< md) — สถานะเดียวกับกระดานจอกว้าง (useBoardNav) ดูอย่างเดียว
 * กดรายการที่มีลิงก์ (ใบงาน · ใบลา) = ไปหน้านั้นเหมือนจอกว้าง
 * กดนัดหมาย = กล่องรายละเอียดเดิม (Sheet เป็นแผ่นล่างบนจอแคบอยู่แล้ว)
 * ปัดซ้าย-ขวา = เลื่อนเดือน / สัปดาห์
 */
function MyMobileCalendar({
  nav,
  events,
  onOpen,
}: {
  nav: BoardNav;
  events: MyEvent[];
  onOpen: (e: MyEvent) => void;
}) {
  const router = useRouter();
  const emp = useHr().emp;
  const { view, cursor, sel, todayKey } = nav;
  const [menu, setMenu] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const selD = dateOf(sel);
  const dayRows = boardOn(events, sel);
  const live = events.filter((e) => !e.cancelled);

  /* เดือน: เลื่อนทีละเดือน วันที่เลือกไปอยู่วันที่ 1 ของเดือนใหม่ (ตามต้นแบบ) · สัปดาห์: ทีละ 7 วันตาม useBoardNav */
  function step(n: number) {
    if (view === "week") return nav.step(n);
    nav.pickDay(toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1)));
  }

  function open(e: MyEvent) {
    if (e.inert) return;
    if (e.href) router.push(e.href);
    else onOpen(e);
  }

  const timeText = (e: MyEvent) => (e.time ? `${e.time}${e.timeEnd ? ` – ${e.timeEnd}` : ""} น.` : "ทั้งวัน");

  /* ปุ่มวัน — ใช้ทั้งตารางเดือนและแถวสัปดาห์ · จุดสีตามประเภทไม่เกิน 3 จุด */
  const dayBtn = (d: Date, week: boolean) => {
    const k = toIsoDate(d);
    const on = k === sel;
    const all = boardOn(live, k);
    return (
      <button
        key={k}
        type="button"
        aria-pressed={on}
        aria-label={`${thaiDate(k)}${all.length ? ` มี ${all.length} รายการ` : ""}`}
        onClick={() => nav.pickDay(k)}
        className={`flex flex-col items-center justify-start gap-[3px] ${week ? "h-[62px]" : "h-[46px]"}`}
      >
        {week && <small className="text-[11.5px] text-[#9A8E91]">{M_DW[d.getDay()]}</small>}
        <b
          className={`grid size-[34px] place-items-center rounded-full text-[14px] font-semibold ${
            on
              ? "bg-[#C8102E] text-white shadow-[0_6px_12px_-6px_rgba(200,16,46,.8)]"
              : k === todayKey
                ? "text-[#C8102E]"
                : "text-[#2A1F22]"
          }`}
        >
          {d.getDate()}
        </b>
        <span className="flex h-[5px] gap-[3px]" aria-hidden="true">
          {all.slice(0, 3).map((e) => (
            <i key={e.id} className="size-[5px] rounded-full" style={{ background: e.dot }} />
          ))}
        </span>
      </button>
    );
  };

  /* ── มุมมองเดือน — ช่องก่อนวันที่ 1 เว้นว่าง ไม่แสดงวันของเดือนอื่น (ต้นแบบ) ── */
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const nDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  /* ── มุมมองสัปดาห์ ── */
  const weekStart = addDays(selD, -selD.getDay());
  const hours = Array.from({ length: M_H1 - M_H0 + 1 }, (_, i) => M_H0 + i);
  const now = bkkNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  return (
    <section
      aria-label="ตารางงาน"
      className="m-ms flex flex-col gap-3.5 text-[#2A1F22] md:hidden"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - s.x;
        const dy = t.clientY - s.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      {/* หัว — "ตารางงาน" · วันที่เลือก · ก่อนหน้า / ถัดไป · เมนูมุมมอง */}
      <header className="flex items-start justify-between gap-2.5">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-[#8A7E81]">ตารางงาน</p>
          <h1 className="mt-0.5 text-[20px] font-bold">
            {selD.getDate()} {M_MON[selD.getMonth()]} {selD.getFullYear() + 543}
            <span className="ml-1.5 text-[15px] font-medium text-[#8A7E81]">วัน{M_DW_FULL[selD.getDay()]}</span>
          </h1>
        </div>
        <div className="flex gap-1.5">
          <button type="button" className={M_CIRCLE} aria-label="ก่อนหน้า" onClick={() => step(-1)}>
            <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
          </button>
          <button type="button" className={M_CIRCLE} aria-label="ถัดไป" onClick={() => step(1)}>
            <ChevronRightIcon className="size-4" strokeWidth={2.4} />
          </button>
          <span className="relative">
            <button
              type="button"
              className={M_CIRCLE}
              aria-label="เลือกมุมมองปฏิทิน"
              aria-haspopup="true"
              aria-expanded={menu}
              onClick={() => setMenu((v) => !v)}
            >
              <MenuIcon className="size-[18px]" strokeWidth={2.4} />
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-20" aria-hidden="true" onClick={() => setMenu(false)} />
                <span
                  role="menu"
                  className="absolute top-11 right-0 z-30 flex min-w-[150px] flex-col rounded-[16px] border border-[#EFE3E5] bg-white p-1.5 shadow-[0_16px_30px_-14px_rgba(90,20,35,.35)]"
                >
                  {(
                    [
                      ["month", "รายเดือน"],
                      ["week", "รายสัปดาห์"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      role="menuitemradio"
                      aria-checked={view === k}
                      className={`flex h-[42px] w-full items-center rounded-[10px] px-3 text-left text-[14px] font-semibold whitespace-nowrap ${
                        view === k ? "bg-[#FDECEE] text-[#C8102E]" : "text-[#2A1F22]"
                      }`}
                      onClick={() => {
                        nav.setView(k);
                        /* ปฏิทินกลับไปที่เดือนของวันที่เลือก (ต้นแบบ cur = sel) */
                        nav.pickDay(sel);
                        setMenu(false);
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </>
            )}
          </span>
        </div>
      </header>

      {view === "month" ? (
        <div className="flex flex-col">
          <div className="grid grid-cols-7 text-center" aria-hidden="true">
            {M_DW.map((d) => (
              <span key={d} className="py-1 text-[12px] text-[#9A8E91]">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center">
            {Array.from({ length: first.getDay() }, (_, i) => (
              <span key={`b${i}`} className="invisible h-[46px]" />
            ))}
            {Array.from({ length: nDays }, (_, i) =>
              dayBtn(new Date(cursor.getFullYear(), cursor.getMonth(), i + 1), false),
            )}
          </div>

          <div className="mt-1 flex items-center justify-between">
            <h2 className="text-[17px] font-bold">
              {sel === todayKey ? "นัดหมายวันนี้" : `นัดหมาย ${selD.getDate()} ${M_MON[selD.getMonth()]}`}
            </h2>
            <span className="text-[12.5px] text-[#8A7E81]">{dayRows.length ? `${dayRows.length} รายการ` : ""}</span>
          </div>
          <ul className="border-t border-[#F2EAEC]">
            {dayRows.length === 0 ? (
              <li>
                <p className="py-7 text-center text-[13.5px] text-[#9A8E91]">ไม่มีนัดหมาย</p>
              </li>
            ) : (
              dayRows.map((e) => {
                const Icon = KIND_ICON[e.kind] ?? CalendarIcon;
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      onClick={() => open(e)}
                      className="flex w-full items-start gap-3 border-b border-[#F2EAEC] px-0.5 py-3.5 text-left"
                    >
                      <span
                        className="grid size-[34px] flex-none place-items-center rounded-full"
                        style={{ color: e.dot, background: tint(e.dot, 10) }}
                        aria-hidden="true"
                      >
                        <Icon className="size-[17px]" strokeWidth={2} />
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <small className="text-[11.5px] text-[#9A8E91]">
                          {KIND_LABEL[e.kind]}
                          {e.cancelled ? " · ยกเลิกแล้ว" : ""}
                        </small>
                        <b
                          className={`text-[14.5px] leading-[1.35] font-bold ${
                            e.cancelled ? "text-[#9A8E91] line-through" : ""
                          }`}
                        >
                          {e.title}
                        </b>
                        <span className="text-[12.5px] text-[#6E6164]">
                          {timeText(e)}
                          {e.sub ? ` · ${e.sub}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      ) : (
        <div>
          <div className="grid grid-cols-7 text-center">
            {Array.from({ length: 7 }, (_, i) => dayBtn(addDays(weekStart, i), true))}
          </div>

          {/* เส้นเวลา 08:00–19:00 ของวันที่เลือก · รายการทั้งวัน (ใบลา กำหนดส่ง) กินทั้งแถบเหมือนต้นแบบ */}
          <div className="relative mt-[18px]">
            {hours.map((h) => (
              <div key={h} className="grid h-16 grid-cols-[44px_1fr]">
                <span className="num -translate-y-1.5 text-[11.5px] leading-none text-[#9A8E91]">
                  {String(h).padStart(2, "0")}:00
                </span>
                <i className="border-t border-[#F2EAEC]" />
              </div>
            ))}

            {dayRows
              .filter((e) => !e.cancelled)
              .map((e) => {
                const end = (M_H1 + 1) * 60;
                const a = Math.max(minOf(e.time) ?? M_H0 * 60, M_H0 * 60);
                const z = Math.min(e.time ? (minOf(e.timeEnd) ?? a + 60) : end, end);
                const top = ((a - M_H0 * 60) / 60) * M_ROW;
                const ht = Math.max(46, ((z - a) / 60) * M_ROW - 4);
                const who = (e.data?.who ?? []).slice(0, 3).map((id) => {
                  const x = emp.find((y) => y.id === id);
                  return x ? displayName(x) : id;
                });
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => open(e)}
                    className="absolute right-0 left-[52px] flex flex-col gap-0.5 overflow-hidden rounded-[14px] px-3 py-2 text-left text-[#2A1F22] shadow-[0_6px_14px_-10px_rgba(40,20,25,.4)]"
                    style={{ top, height: ht, background: tint(e.dot, 12) }}
                  >
                    <b className="text-[13.5px] leading-[1.3] font-bold">{e.title}</b>
                    <small className="text-[11.5px] text-[#6E6164]">{KIND_LABEL[e.kind]}</small>
                    {ht > 70 && (
                      <span className="mt-auto flex items-center justify-between gap-2 text-[11.5px] text-[#6E6164]">
                        <span className="num flex items-center gap-1">
                          <ClockIcon className="size-3" strokeWidth={2} />
                          {timeText(e)}
                        </span>
                        {who.length > 0 && (
                          <span className="flex pl-1.5">
                            {who.map((n, i) => (
                              <i
                                key={i}
                                title={n}
                                className="-ml-1.5 grid size-[22px] place-items-center rounded-full border-2 border-white bg-white text-[9.5px] font-bold text-[#2A1F22] not-italic"
                              >
                                {initials(n)}
                              </i>
                            ))}
                          </span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}

            {sel === todayKey && nowMin >= M_H0 * 60 && nowMin <= M_H1 * 60 && (
              <span
                className="absolute right-0 left-[44px] border-t-[1.5px] border-dashed border-[#C8102E]"
                style={{ top: ((nowMin - M_H0 * 60) / 60) * M_ROW }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
