"use client";

/*
 * ตารางงานของ PM — ใช้ปฏิทินชุดเดียวกับทุกบทบาท (schedule-board.tsx)
 *
 * เจ้าของสั่ง 24 ก.ย. 2569 ว่าหน้าตารางงานต้องหน้าตาเหมือนกันทุกอัน
 * (โครงชุดเดียวกันเคยแยกเป็นปฏิทินเต็มกับปฏิทินสรุป — ยกเลิกแล้ว)
 * ต่างกันแค่ว่าในปฏิทินมีอะไร และใครเพิ่มนัดได้ — PM กับ GM เท่านั้น
 *
 * ซ้ายเป็นของที่ใช้คุมมุมมอง (ตัวกรองประเภท และรายการนัดของวันที่เลือก)
 * ขวาเป็นปฏิทินเดือนหรือสัปดาห์ ที่ตอบว่าเดือนนี้ยุ่งช่วงไหนและวันไหนชนกัน
 *
 * กดช่องวัน = เลือกวันนั้น (รายการทางซ้ายเปลี่ยนตาม) และเปิดฟอร์มเพิ่มนัดของวันนั้นทันที
 * ปุ่ม "เพิ่มนัดหมาย" บนแถบหัวเรื่องเพิ่มนัดของวันที่เลือกอยู่
 * กดที่แถบนัด = เปิดแก้ใบนั้น · นัดที่ผ่านไปแล้วจางลง จะได้เห็นว่าอะไรยังรออยู่
 * GM ที่เปิดหน้านี้เป็นโหมดดูอย่างเดียว (pm-readonly.tsx) — ปฏิทินนัดของ GM คือ /gm/calendar
 *
 * ยกเลิกนัดไม่ได้ลบใบทิ้ง แต่เก็บไว้เป็นประวัติ (ยูสเคส PM-06 BR-03)
 * ใบที่ยกเลิกแล้วหายจากปฏิทิน แต่ยังอยู่ในรายการของวันนั้นแบบขีดฆ่า
 *
 * วันหยุดราชการแสดงเป็นแถบทึบที่กดไม่ได้ อ่านจาก holidays.ts ชุดเดียวกับที่ใบลาใช้นับวัน
 * ตารางงานกับการนับวันลาจึงไม่มีทางเห็นวันหยุดไม่ตรงกัน
 *
 * ทุกลิงก์ในหน้านี้อยู่ในหน้าของ PM เท่านั้น ไม่พาข้ามไปหน้าของบทบาทอื่น
 *
 * sales = ตารางงานของฝ่ายขาย (/sales-schedule · ผู้ใช้สั่ง 5 ต.ค. 2569) — หน้าตาและการใช้งานเดียวกับ PM
 * ต่างกันแค่ ผู้เข้าร่วมเลือกจากผู้สนใจแทนทีม · ไม่มีช่องโปรเจค · เห็นเฉพาะนัดที่ฝ่ายขายตั้ง
 */

import { useRef, useState } from "react";
import { projName } from "@/lib/pm-data";
import { bkkNow, thaiDate, toIsoDate } from "@/lib/format";
import { usePm, useTeam } from "@/lib/pm-store";
import { USERS } from "@/lib/mock-data";
import { useCrm } from "@/lib/crm-store";
import { CustomerCombo } from "./customer-combo";
import {
  KIND_COLOR,
  PM_COLORS,
  eventKind,
  eventKinds,
  chipTime,
  colorOf,
  dayDiff,
  endOf,
  eventPaint,
  isPsEvent,
  isSalesEvent,
  type EventKind,
  type PmEvent,
} from "@/lib/pm-schedule-data";
import {
  addEvent,
  cancelEvent,
  editEvent,
  useSchedule,
  type EventDraft,
} from "@/lib/pm-schedule-store";
import { AppointmentSheet } from "./appointment-sheet";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, MenuIcon, PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { ReadOnlyNote, usePmReadOnly } from "./pm-readonly";
import { ScheduleBoard, boardOn, useBoardNav, type BoardEvent, type BoardKind, type BoardNav } from "./schedule-board";
import { ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select } from "./ui";

/* ประเภทนัดอ่านจากข้อมูลหลักทุกครั้ง — ฝ่ายบุคคลเพิ่ม/แก้ชื่อได้ที่ /admin/options */
const kindList = () => eventKinds();

/** ตัวคั่นบรรทัด — แยกเป็นค่าคงที่ เพราะสตริงขึ้นบรรทัดใหม่ใน JSX อ่านยาก */
const NEWLINE = String.fromCharCode(10);

/** ป้ายประเภทนัดของ PM — สีเดียวกับจุดในปฏิทินสรุปของหน้าอื่น */
const pmBoardKinds = (): BoardKind[] => kindList().map((k) => ({ key: k.key, label: k.label, color: k.dot }));

/** แปลงนัดของ PM เป็นรายการบนปฏิทิน — สีที่เลือกเองมาก่อนสีของประเภท */
function pmBoardEvent(e: PmEvent): BoardEvent<PmEvent> {
  const paint = eventPaint(e);
  return {
    id: e.id,
    kind: e.kind,
    start: e.date,
    end: endOf(e),
    title: e.title,
    time: e.from,
    timeEnd: e.to,
    chip: (day) => chipTime(e, day),
    sub: e.place || undefined,
    dot: e.col ? colorOf(e.col).fg : eventKind(e.kind).dot,
    paint: { cls: paint.cls, style: paint.style },
    tip: `${e.title} · ${thaiDate(e.date)}${endOf(e) > e.date ? ` – ${thaiDate(endOf(e))}` : ""} · ${e.from} – ${e.to}`,
    /* ใบที่ยกเลิกแล้วไม่ขึ้นเป็นแถบในปฏิทิน แต่ยังอยู่ในรายการของวันแบบขีดฆ่า */
    cancelled: Boolean(e.cancel),
    data: e,
  };
}

export function PmSchedulePage({ sales = false }: { sales?: boolean }) {
  const sc = useSchedule();
  const nav = useBoardNav();
  /* GM เปิดหน้าของ PM ได้แบบดูอย่างเดียว — สร้างหรือแก้นัดของ PM ไม่ได้ */
  const ro = usePmReadOnly() && !sales;
  const canEdit = !ro;

  /* ว่างอยู่ = ปิด · มี date = เพิ่มใบใหม่ของวันนั้น · มี event = แก้ใบเดิม */
  const [editing, setEditing] = useState<{ date: string; event?: PmEvent } | null>(null);
  /* ใบที่ยกเลิกแล้วและคนที่แก้ไม่ได้ เปิดได้แค่ดู จึงเก็บคนละตัวกับกล่องแก้ไข */
  const [viewing, setViewing] = useState<PmEvent | null>(null);

  /** กดที่นัดหนึ่งใบ — ใบที่ยังใช้งานอยู่เปิดแก้ไข ใบที่ยกเลิกแล้วเปิดดูประวัติ */
  function openEvent(e: PmEvent) {
    if (canEdit && !e.cancel) setEditing({ date: e.date, event: e });
    else setViewing(e);
  }

  /*
   * นัดที่ทีมก่อนการขายตั้งเองไม่ขึ้นที่นี่ (เจ้าของตัดสิน 25 ก.ย. 2569)
   * งานช่วงก่อนการขายยังไม่มีดีลและยังไม่ใช่ความรับผิดชอบของ PM
   */
  const events = sc.events
    .filter((e) => (sales ? isSalesEvent(e) : !isPsEvent(e) && !isSalesEvent(e)))
    .map(pmBoardEvent);

  return (
    <div className="space-y-4">
      {/* มือถือ (< md) ใช้ปฏิทินแบบแอป (PmMobileCalendar) แทนหัวเรื่องและกระดานของจอกว้าง
          ซ่อนที่กล่องนอก เพราะ .bar ประกาศ display ไว้ใน globals.css นอก @layer */}
      {/* ฝ่ายขายไม่มีหัวเรื่องในหน้า — ชื่อหน้าอยู่แถบบนแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
      {!sales && (
      <div className="max-md:hidden">
      {/* ไม่มีหัวข้อหน้า — แถบบนบอกชื่อหน้าและวันที่อยู่แล้ว ปุ่มเลื่อนขึ้นชิดขวา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <h1 className="sr-only">ตารางงาน</h1>
      {/* ไม่มีปุ่มเพิ่มนัดหมาย — ดับเบิลคลิกช่องวันในปฏิทินเพื่อเพิ่ม (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      </div>
      )}

      <ReadOnlyNote />

      <PmMobileCalendar
        sales={sales}
        nav={nav}
        events={events}
        canEdit={canEdit}
        onOpen={openEvent}
        onAdd={(day) => setEditing({ date: day })}
      />

      <div className="max-md:hidden">
      <ScheduleBoard
        nav={nav}
        events={events}
        kinds={pmBoardKinds()}
        onOpen={(e) => openEvent(e.data)}
        onAdd={canEdit ? (day) => setEditing({ date: day }) : undefined}
        noKinds
      />
      </div>

      {viewing && (
        <AppointmentSheet
          event={viewing}
          note={sc.notes[viewing.id] ?? viewing.todo.join(NEWLINE)}
          onClose={() => setViewing(null)}
        />
      )}

      {editing && (
        <EventForm
          sales={sales}
          day={editing.date}
          event={editing.event}
          note={editing.event ? (sc.notes[editing.event.id] ?? editing.event.todo.join(NEWLINE)) : ""}
          onClose={() => setEditing(null)}
          onSaved={(date) => {
            /* พาปฏิทินไปที่วันของนัดที่เพิ่งบันทึก จะได้เห็นทันทีว่ามันลงไปแล้ว */
            nav.jumpTo(date);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

// ─── ปฏิทินแบบแอปบนมือถือ (ต้นแบบ pm-schedule.html .ms) ─────────────

const M_DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const M_DW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const M_MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** เส้นเวลาของมุมมองสัปดาห์ 08:00–19:00 · หนึ่งชั่วโมงสูง 64px */
const M_H0 = 8;
const M_H1 = 19;
const M_ROW = 64;
const M_RED = "#C8102E";
const M_CIRCLE =
  "grid size-9 flex-none place-items-center rounded-full border border-[#EFE3E5] bg-white text-[#2A1F22] shadow-[0_3px_8px_-4px_rgba(90,20,35,.25)]";

const iso = (d: Date) => toIsoDate(d);
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
/** อักษรย่อของชื่อ — ข้ามสระหน้า (เ แ โ ใ ไ) ไม่งั้นได้สระลอย ๆ ตัวเดียว */
function initialOf(name: string) {
  const n = name.replace(/^(นาย|นางสาว|นาง)\s*/, "").trim();
  return /^[เแโใไ]/.test(n) ? n.slice(0, 2) : n.slice(0, 1);
}

/*
 * มือถือ (< md) — ปฏิทินแบบแอปตามต้นแบบ ใช้สถานะเดียวกับกระดานจอกว้าง (useBoardNav)
 * ชื่อหน้าและปุ่มย้อนกลับอยู่ในแถบบนของเปลือกแอปแล้ว หัวของส่วนนี้จึงมีแค่วันที่ที่เลือกกับปุ่มเลื่อน
 * กดนัด = เปิดฟอร์มแก้ (หรือดูอย่างเดียว) ชุดเดียวกับจอกว้าง · ปุ่ม + ลอย = เพิ่มนัดของวันที่เลือก
 */
function PmMobileCalendar({
  sales = false,
  nav,
  events,
  canEdit,
  onOpen,
  onAdd,
}: {
  sales?: boolean;
  nav: BoardNav;
  events: BoardEvent<PmEvent>[];
  canEdit: boolean;
  onOpen: (e: PmEvent) => void;
  onAdd: (day: string) => void;
}) {
  const team = useTeam();
  const customers = useCrm().customers;
  /* นัดของฝ่ายขาย ผู้เข้าร่วมคือผู้สนใจ */
  const people = sales ? customers.map((c) => ({ id: c.code, name: c.name })) : team;
  const { view, cursor, sel, todayKey } = nav;
  const [menu, setMenu] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const selD = dateOf(sel);
  const dayRows = boardOn(events, sel);
  const live = events.filter((e) => !e.cancelled);

  /* เดือน: เลื่อนทีละเดือนและพาวันที่เลือกไปด้วย (วันเดียวกันของเดือนใหม่) หัวจะได้ไม่ค้างวันเก่า
     สัปดาห์: เลื่อนทีละ 7 วันตาม useBoardNav */
  function step(n: number) {
    if (view === "week") return nav.step(n);
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + n;
    const last = new Date(y, m + 1, 0).getDate();
    nav.pickDay(iso(new Date(y, m, Math.min(selD.getDate(), last))));
  }

  /* ไม่มีประเภทนัดแล้ว — บรรทัดเล็กเหนือหัวข้อบอกสถานที่แทน (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const kindLabel = (e: BoardEvent<PmEvent>) => e.data.place || "";
  const timeText = (e: BoardEvent<PmEvent>) => (e.time ? `${e.time}${e.timeEnd ? ` – ${e.timeEnd}` : ""} น.` : "ทั้งวัน");

  /* ── มุมมองเดือน ── */
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = addDays(first, -first.getDay());
  const nDays = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((first.getDay() + nDays) / 7) * 7 }, (_, i) => addDays(gridStart, i));

  /* ── มุมมองสัปดาห์ ── */
  const weekStart = addDays(selD, -selD.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: M_H1 - M_H0 + 1 }, (_, i) => M_H0 + i);
  const now = bkkNow();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const dayBtn = (on: boolean, today: boolean) =>
    `grid size-[34px] place-items-center rounded-full text-[14px] font-semibold ${
      on ? "bg-white text-[#C8102E]" : "text-white"
    } ${today && !on ? "shadow-[inset_0_0_0_1.5px_#fff]" : ""}`;

  return (
    <section
      className="relative md:hidden"
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
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
      }}
    >
      {/* หัว — วันที่เลือก · ก่อนหน้า / ถัดไป · เมนูมุมมอง */}
      <div className="mb-3.5 flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[20px] leading-tight font-bold text-[#2A1F22]">
            {selD.getDate()} {M_MON[selD.getMonth()]} {selD.getFullYear() + 543}{" "}
            <span className="text-[15px] font-medium text-[#8A7E81]">วัน{M_DW_FULL[selD.getDay()]}</span>
          </p>
        </div>
        <button type="button" className={M_CIRCLE} aria-label="ก่อนหน้า" onClick={() => step(-1)}>
          <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
        </button>
        <button type="button" className={M_CIRCLE} aria-label="ถัดไป" onClick={() => step(1)}>
          <ChevronRightIcon className="size-4" strokeWidth={2.4} />
        </button>
        <div className="relative">
          <button
            type="button"
            className={M_CIRCLE}
            aria-label="เลือกมุมมอง"
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={() => setMenu((v) => !v)}
          >
            <MenuIcon className="size-4" strokeWidth={2.2} />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setMenu(false)} />
              <div
                role="menu"
                className="absolute top-[calc(100%+8px)] right-0 z-50 min-w-[150px] rounded-[16px] bg-white p-1.5 shadow-[0_1px_2px_rgba(120,20,35,.05),0_12px_28px_-12px_rgba(120,20,35,.35)]"
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
                    className={`flex h-[42px] w-full items-center rounded-[12px] px-3 text-left text-[14px] font-semibold ${
                      view === k ? "bg-[#FDECEE] text-[#C8102E]" : "text-[#2A1F22]"
                    }`}
                    onClick={() => {
                      nav.setView(k);
                      setMenu(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {view === "month" ? (
        <>
          <div className="rounded-[22px] bg-[#C8102E] px-2 pt-3 pb-2.5 shadow-[0_14px_26px_-18px_rgba(200,16,46,.9)]">
            <div className="grid grid-cols-7 pb-1.5">
              {M_DW.map((d) => (
                <span key={d} className="text-center text-[12px] font-semibold text-white/75">
                  {d}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {cells.map((d) => {
                const k = iso(d);
                const inMonth = d.getMonth() === cursor.getMonth();
                const n = inMonth ? Math.min(3, boardOn(live, k).length) : 0;
                return (
                  <button
                    key={k}
                    type="button"
                    aria-label={`เลือกวันที่ ${thaiDate(k)}`}
                    aria-pressed={k === sel}
                    onClick={() => nav.pickDay(k)}
                    className={`flex h-[46px] flex-col items-center justify-start ${inMonth ? "" : "opacity-35"}`}
                  >
                    <span className={dayBtn(k === sel, k === todayKey)}>{d.getDate()}</span>
                    <span className="mt-[1px] flex h-[5px] gap-[3px]" aria-hidden="true">
                      {Array.from({ length: n }, (_, i) => (
                        <i key={i} className={`size-[5px] rounded-full ${k === sel ? "bg-white" : "bg-white/90"}`} />
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-bold text-[#2A1F22]">
              {sel === todayKey ? "นัดหมายวันนี้" : `นัดหมาย ${selD.getDate()} ${M_MON[selD.getMonth()]}`}
            </h2>
            <span className="text-[12.5px] text-[#8A7E81]">{dayRows.length} รายการ</span>
          </div>
          {dayRows.length === 0 ? (
            <p className="py-6 text-center text-[13.5px] text-[#8A7E81]">ไม่มีนัดหมาย</p>
          ) : (
            <ul className="mt-1">
              {dayRows.map((e) => (
                <li key={e.id} className="border-b border-[#F2EAEC]">
                  <button
                    type="button"
                    onClick={() => onOpen(e.data)}
                    className="flex w-full items-center gap-3 px-0.5 py-3.5 text-left"
                  >
                    <span
                      className="grid size-[34px] flex-none place-items-center rounded-full"
                      style={{ background: `color-mix(in srgb, ${e.dot} 10%, transparent)`, color: e.dot }}
                      aria-hidden="true"
                    >
                      <CalendarIcon className="size-4" strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[11.5px] text-[#9A8E91]">
                        {kindLabel(e)}
                        {e.cancelled ? " · ยกเลิกแล้ว" : ""}
                      </span>
                      <b
                        className={`block truncate text-[14.5px] font-bold ${
                          e.cancelled ? "text-[#9A8E91] line-through" : "text-[#2A1F22]"
                        }`}
                      >
                        {e.title}
                      </b>
                      <span className="num block text-[12.5px] text-[#6E6164]">{timeText(e)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-7 rounded-[22px] bg-[#C8102E] px-1.5 py-1.5 shadow-[0_14px_26px_-18px_rgba(200,16,46,.9)]">
            {weekDays.map((d) => {
              const k = iso(d);
              const on = k === sel;
              return (
                <button
                  key={k}
                  type="button"
                  aria-label={`เลือกวันที่ ${thaiDate(k)}`}
                  aria-pressed={on}
                  onClick={() => nav.pickDay(k)}
                  className={`flex h-[62px] flex-col items-center justify-center gap-0.5 rounded-[16px] ${
                    on ? "bg-white" : ""
                  } ${k === todayKey && !on ? "shadow-[inset_0_0_0_1.5px_#fff]" : ""}`}
                >
                  <span className={`text-[11.5px] font-semibold ${on ? "text-[#C8102E]/75" : "text-white/75"}`}>
                    {M_DW[d.getDay()]}
                  </span>
                  <span className={`text-[16px] font-bold ${on ? "text-[#C8102E]" : "text-white"}`}>{d.getDate()}</span>
                </button>
              );
            })}
          </div>

          {dayRows.every((e) => e.cancelled) && (
            <p className="mt-3 text-center text-[13.5px] text-[#8A7E81]">ไม่มีนัดหมาย</p>
          )}

          {/* เส้นเวลา 08:00–19:00 ของวันที่เลือก */}
          <div className="relative mt-5" style={{ height: (M_H1 - M_H0) * M_ROW + 24 }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute right-0 left-0 flex" style={{ top: i * M_ROW }}>
                <span className="num w-[44px] flex-none -translate-y-1/2 text-[11.5px] text-[#9A8E91]">
                  {String(h).padStart(2, "0")}:00
                </span>
                <span className="mt-0 flex-1 border-t border-[#F2EAEC]" />
              </div>
            ))}

            {sel === todayKey && nowMin >= M_H0 * 60 && nowMin <= M_H1 * 60 && (
              <div
                className="absolute right-0 left-[52px] z-10 border-t-[1.5px] border-dashed border-[#C8102E]"
                style={{ top: ((nowMin - M_H0 * 60) / 60) * M_ROW }}
                aria-label="ตอนนี้"
              />
            )}

            {dayRows
              .filter((e) => !e.cancelled)
              .map((e) => {
                const s = minOf(e.time) ?? M_H0 * 60;
                const f = minOf(e.timeEnd) ?? s + 60;
                const top = Math.max(0, ((s - M_H0 * 60) / 60) * M_ROW);
                const h = Math.max(46, ((Math.max(f, s + 30) - s) / 60) * M_ROW);
                const tall = h >= 96;
                const who = e.data.who
                  .map((id) => people.find((m) => m.id === id))
                  .filter((m): m is NonNullable<typeof m> => Boolean(m));
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => onOpen(e.data)}
                    className="absolute right-0 left-[52px] flex flex-col overflow-hidden rounded-[14px] px-3 py-2 text-left"
                    style={{
                      top,
                      height: h,
                      background: `color-mix(in srgb, ${e.dot} 12%, transparent)`,
                    }}
                  >
                    <span className="block text-[11.5px]" style={{ color: e.dot }}>
                      {kindLabel(e)}
                    </span>
                    <b className="block truncate text-[13.5px] font-bold text-[#2A1F22]">{e.title}</b>
                    {tall && (
                      <span className="mt-auto flex items-center justify-between gap-2">
                        <span className="num flex items-center gap-1 text-[12px] text-[#6E6164]">
                          <ClockIcon className="size-3.5" strokeWidth={2.2} />
                          {timeText(e)}
                        </span>
                        <span className="flex -space-x-1.5">
                          {who.slice(0, 3).map((m) => (
                            <span
                              key={m.id}
                              title={m.name}
                              className="grid size-[22px] place-items-center rounded-full border-2 border-white text-[10px] font-bold text-white"
                              style={{ background: e.dot }}
                            >
                              {initialOf(m.name)}
                            </span>
                          ))}
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </>
      )}

      {/* ปุ่ม + ลอย — เพิ่มนัดของวันที่เลือก (เฉพาะคนที่แก้ได้) */}
      {canEdit && (
        <button
          type="button"
          aria-label={`เพิ่มนัดหมายวันที่ ${thaiDate(sel)}`}
          onClick={() => onAdd(sel)}
          className="fixed right-[18px] bottom-[calc(100px+env(safe-area-inset-bottom))] z-30 grid size-[58px] place-items-center rounded-full text-white shadow-[0_14px_26px_-12px_rgba(200,16,46,.9)]"
          style={{ background: M_RED }}
        >
          <PlusIcon className="size-6" strokeWidth={2.4} />
        </button>
      )}
    </section>
  );
}

/*
 * เหตุผลตอนยกเลิกเป็นของบังคับ (เจ้าของสั่ง 24 ก.ย. 2569)
 * คนที่กันเวลาไว้แล้วได้รับแจ้งว่า "ยกเลิก" เฉย ๆ ก็ต้องเดินมาถามอยู่ดี
 */
const CANCEL_WARN = "กรอกเหตุผลที่ยกเลิกก่อน";

/*
 * บอกให้ตรงช่องที่ยังไม่ผ่าน (เจ้าของสั่ง 25 ก.ย. 2569)
 * เดิมขึ้นข้อความรวมสามบรรทัดเหมือนกันทุกกรณี คนกรอกต้องไล่หาเองว่าผิดช่องไหน
 */
function saveWarn(f: EventDraft, multi: boolean) {
  const bad: string[] = [];
  if (!f.title.trim()) bad.push("หัวข้อ");
  if (!f.date) bad.push("วันที่");
  if (!f.from) bad.push("เวลาเริ่ม");
  if (!f.to) bad.push("เวลาสิ้นสุด");
  if (bad.length) return `ยังไม่ได้กรอก${bad.join(" · ")}`;
  if (f.dateEnd < f.date) return "วันสิ้นสุดต้องไม่ก่อนวันเริ่ม";
  if (!multi && f.to <= f.from) return "นัดวันเดียว เวลาเริ่มต้องไม่หลังเวลาสิ้นสุด";
  return "";
}

// ─── ฟอร์มเพิ่ม / แก้ / ยกเลิกนัดหมาย ─────────────────────────────

function EventForm({
  sales = false,
  day,
  event,
  note,
  onClose,
  onSaved,
}: {
  sales?: boolean;
  day: string;
  event?: PmEvent;
  note: string;
  onClose: () => void;
  onSaved: (date: string) => void;
}) {
  const projects = usePm().projects;
  /* ผู้เข้าร่วมเลือกจากทีมที่ซิงก์จากทะเบียนฝ่ายบุคคล — คนที่พ้นสภาพแล้วไม่ขึ้นให้เลือก */
  const team = useTeam().filter((m) => !m.left);
  /* ฝ่ายขาย — ผู้เข้าร่วมเลือกจากผู้สนใจ (ไม่รวมรายที่ปฏิเสธแล้ว) */
  const leads = useCrm().customers.filter((c) => c.status !== "ปฏิเสธ");
  const people = sales ? leads.map((c) => ({ id: c.code, name: c.name })) : team;
  const actor = sales ? USERS.sales.name : USERS.pm.name;
  const [form, setForm] = useState<EventDraft>(() => ({
    title: event?.title ?? "",
    kind: event?.kind ?? "client",
    date: event?.date ?? day,
    dateEnd: event ? endOf(event) : day,
    from: event?.from ?? "10:00",
    to: event?.to ?? "11:00",
    place: event && event.place !== "ยังไม่ระบุสถานที่" ? event.place : "",
    pj: event?.pj ?? "",
    who: event?.who ?? [],
    note,
    /* ใบเดิมที่ยังไม่เคยเลือกสี เปิดมาให้ตรงกับสีที่เห็นในปฏิทินอยู่แล้ว ไม่ใช่เด้งเป็นแดง */
    col: event?.col ?? (event ? KIND_COLOR[event.kind] : "red"),
  }));
  const [err, setErr] = useState("");
  /* เปิดตัวเลือกวันได้ทีละอัน — เปิดอันหนึ่งแล้วอีกอันต้องปิด ไม่งั้นปฏิทินสองอันซ้อนกัน */
  const [pick, setPick] = useState<"s" | "e" | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  /* เหตุผลที่ยกเลิก — ไม่บังคับ แต่เก็บไว้ในประวัติของใบนั้น */
  const [why, setWhy] = useState("");

  function set<K extends keyof EventDraft>(k: K, v: EventDraft[K]) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      /* ขยับวันเริ่มแล้ววันจบต้องตามไปด้วย ไม่งั้นช่วงจะกลับด้านโดยที่คนกรอกไม่ทันสังเกต */
      if (k === "date" && next.dateEnd < next.date) next.dateEnd = next.date;
      return next;
    });
    setErr("");
  }

  function toggleWho(id: string) {
    setForm((f) => ({
      ...f,
      who: f.who.includes(id) ? f.who.filter((x) => x !== id) : [...f.who, id],
    }));
  }

  const multi = form.dateEnd > form.date;
  /* บอกให้เห็นทันทีว่านัดนี้กินกี่วัน (ต้นแบบ spanNote) */
  const hint =
    form.date && multi
      ? `นัดต่อเนื่อง ${dayDiff(form.date, form.dateEnd) + 1} วัน ${thaiDate(form.date)} – ${thaiDate(form.dateEnd)}`
      : "นัดวันเดียว";

  function save() {
    const warn = saveWarn(form, multi);
    if (warn) return setErr(warn);

    /* ผู้สร้างตามหน้าที่เปิด — ตารางงานของ PM หรือของฝ่ายขาย */
    const draft: EventDraft = { ...form, title: form.title.trim(), place: form.place.trim(), by: sales ? "sales" : "pm" };
    if (event) editEvent(event.id, draft, actor);
    else addEvent(draft);
    onSaved(draft.date);
  }

  const sub = "font-normal text-muted-foreground";

  return (
    <Sheet
      title={event ? "แก้นัดหมาย" : "เพิ่มนัดหมาย"}
      onClose={onClose}
      footer={
        <>
          {/* ยกเลิกแล้วเก็บใบไว้เป็นประวัติ ไม่ลบหาย (ยูสเคส PM-06 BR-03)
              ผู้เข้าร่วมกันเวลาไว้แล้ว จึงต้องย้อนดูได้ว่าใครยกเลิกและเพราะอะไร */}
          {event && (
            <button
              type="button"
              className="btn glass-thin mr-auto border-destructive text-destructive"
              onClick={() => {
                if (!confirmDel) {
                  setConfirmDel(true);
                  return;
                }
                /* เหตุผลเป็นของบังคับ — ข้อความแจ้งเตือนที่ผู้เข้าร่วมได้รับคือเหตุผลบรรทัดนี้ */
                if (!why.trim()) return setErr(CANCEL_WARN);
                cancelEvent(event.id, actor, why);
                onClose();
              }}
            >
              {confirmDel ? "กดอีกครั้งเพื่อยกเลิกนัด" : "ยกเลิกนัดหมาย"}
            </button>
          )}
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            บันทึก
          </button>
        </>
      }
    >
      {confirmDel && (
        <p
          role="alert"
          className="mb-3.5 rounded-[11px] bg-[var(--destructive-soft)] px-3 py-2.5 text-xs leading-[1.6] font-semibold text-destructive"
        >
          ยกเลิกนัดนี้แล้วใบจะยังอยู่ในประวัติของวันนั้น ไม่หายไป · ผู้เข้าร่วมทุกคนจะได้รับแจ้งพร้อมเหตุผล
          <Input
            className="mt-2 bg-white"
            value={why}
            aria-label="เหตุผลที่ยกเลิก"
            onChange={(e) => {
              setWhy(e.target.value);
              setErr("");
            }}
            placeholder="เหตุผลที่ยกเลิก (ต้องกรอก)"
          />
          {err === CANCEL_WARN && <span className="mt-1.5 block">{CANCEL_WARN}</span>}
        </p>
      )}

      {/* กด Enter ที่ช่องไหนก็ได้เพื่อบันทึก ยกเว้นช่องบันทึกที่ Enter คือขึ้นบรรทัดใหม่ · กดที่ว่างปิดตัวเลือกวัน */}
      <div
        className="space-y-3.5"
        onClick={() => setPick(null)}
        onKeyDown={(e) => {
          const t = e.target as HTMLElement;
          if (e.key === "Enter" && t.tagName !== "TEXTAREA" && t.tagName !== "BUTTON") {
            e.preventDefault();
            save();
          }
        }}
      >
        <Field label="หัวข้อ">
          <Input
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="เช่น นัดลูกค้าตรวจงานรอบแรก"
          />
        </Field>

        {/* ไม่มีช่องประเภท — สีของนัดแยกนัดแทน (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
        <div>
          <p className="mb-2 block text-[0.8rem] font-medium">
            สีของนัด
          </p>
          <span className="flex flex-wrap gap-[9px] pt-1 pl-1">
            {PM_COLORS.map((c) => (
              <button
                key={c.c}
                type="button"
                className="cpick"
                aria-pressed={form.col === c.c}
                aria-label={`สี${c.name}`}
                title={c.name}
                style={{ background: c.bg, color: c.fg }}
                onClick={() => set("col", c.c)}
              />
            ))}
          </span>
        </div>

        <div>
          <p className="mb-2 block text-[0.8rem] font-medium">
            วันและเวลา
          </p>
          <div className="grid grid-cols-[52px_minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-x-2.5 gap-y-[9px]">
            <span className="text-xs font-bold text-muted-foreground">เริ่ม</span>
            <ThaiDatePicker
              value={form.date}
              open={pick === "s"}
              label="วันที่เริ่ม"
              onToggle={() => setPick((p) => (p === "s" ? null : "s"))}
              onPick={(iso) => {
                set("date", iso);
                setPick(null);
              }}
            />
            <Input
              type="time"
              step={900}
              value={form.from}
              aria-label="เวลาเริ่ม"
              onChange={(e) => set("from", e.target.value)}
            />

            <span className="text-xs font-bold text-muted-foreground">สิ้นสุด</span>
            <ThaiDatePicker
              value={form.dateEnd}
              min={form.date}
              open={pick === "e"}
              label="วันที่สิ้นสุด"
              onToggle={() => setPick((p) => (p === "e" ? null : "e"))}
              onPick={(iso) => {
                set("dateEnd", iso);
                setPick(null);
              }}
            />
            <Input
              type="time"
              step={900}
              value={form.to}
              aria-label="เวลาสิ้นสุด"
              onChange={(e) => set("to", e.target.value)}
            />
          </div>
          <p className="mt-2 text-[11.5px] font-semibold text-muted-foreground">{hint}</p>
          {/* คำเตือนเรื่องเหตุผลที่ยกเลิกขึ้นในกล่องยืนยันด้านบนแล้ว ไม่ต้องขึ้นซ้ำใต้ช่องวันเวลา */}
          {err && err !== CANCEL_WARN && (
            <p role="alert" className="mt-2 rounded-[11px] bg-[var(--destructive-soft)] px-3 py-2.5 text-xs leading-[1.55] font-semibold text-destructive">
              {err.split("\n").map((x) => (
                <span key={x} className="block">
                  {x}
                </span>
              ))}
            </p>
          )}
        </div>

        <Field label="สถานที่หรือลิงก์">
          <Input
            value={form.place}
            onChange={(e) => set("place", e.target.value)}
            placeholder="เช่น ห้องประชุมชั้น 3 หรือ ออนไลน์"
          />
        </Field>

        {!sales && (
        <Field label="โปรเจคที่เกี่ยวข้อง">
          <Select value={form.pj} onChange={(e) => set("pj", e.target.value)}>
            <option value="">ไม่ผูกกับโปรเจค</option>
            {projects.map((p) => (
              <option key={p.pj} value={p.pj}>
                {projName(p)}
              </option>
            ))}
          </Select>
        </Field>
        )}

        <Field label={sales ? "ผู้สนใจที่เข้าร่วม" : "ผู้เข้าร่วม"}>
          {/* ผู้สนใจมีหลายราย — ค้นหาแล้วกดเพิ่ม ไม่ไล่ปุ่มทุกรายแบบทีม */}
          {sales && (
            <div className="mb-2">
              <CustomerCombo
                key={form.who.join(",")}
                customers={leads.filter((c) => !form.who.includes(c.code))}
                nameOnly
                value={null}
                onChange={(c) => c && toggleWho(c.code)}
              />
            </div>
          )}
          <span className="flex flex-wrap gap-[7px]">
            {(sales ? people.filter((m) => form.who.includes(m.id)) : people).map((m) => {
              const on = form.who.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggleWho(m.id)}
                  aria-pressed={on}
                  className={`h-[30px] rounded-[20px] border px-3 text-xs font-semibold ${
                    on
                      ? "border-primary bg-[var(--accent)] text-primary"
                      : "border-border bg-card text-muted-foreground hover:border-primary hover:text-primary"
                  }`}
                >
                  {m.name}
                </button>
              );
            })}
          </span>
        </Field>

        <Field label="บันทึก">
          <textarea
            value={form.note}
            spellCheck={false}
            onChange={(e) => set("note", e.target.value)}
            placeholder="ไม่บังคับ"
            className="block min-h-[82px] w-full resize-y rounded-[10px] border border-border bg-muted/40 px-3 py-2.5 text-[13px] leading-[1.65] outline-none focus:border-primary focus:bg-card"
          />
        </Field>
      </div>
    </Sheet>
  );
}
