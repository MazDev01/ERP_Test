"use client";

/*
 * ปฏิทินของหน้า "ตารางงาน" ทุกบทบาท — PM · GM · SA/BD · ทีมงาน ใช้กระดานนี้ร่วมกัน
 *
 * โครงชุด 24 ก.ย. 2569 เคยแยกเป็นสองแบบ (ปฏิทินเต็มของ PM กับปฏิทินสรุปของคนอื่น)
 * เจ้าของสั่งกลับมาเป็นแบบเดียวกันทุกหน้า — คนเดียวกันสวมหลายบทบาทและสลับหน้าไปมา
 * ปฏิทินที่หน้าตาไม่เหมือนกันทำให้ต้องเรียนรู้ใหม่ทุกครั้งที่เปลี่ยนหน้า
 * ต่างกันแค่ "มีอะไรอยู่ในปฏิทิน" และ "เพิ่มนัดได้ไหม" (ไม่ส่ง onAdd = ดูอย่างเดียว)
 *
 * ซ้าย 290px: ประเภทนัดพร้อมตัวกรอง · รายการของวันที่เลือก
 * ขวา: ปฏิทินเดือนหรือสัปดาห์ นัดวาดเป็นแถบพาดช่องวัน นัดข้ามวันเป็นแถบเดียวต่อเนื่อง
 * จอ ≤1100px เหลือคอลัมน์เดียว (ปฏิทินขึ้นก่อน แล้วตามด้วยประเภทและรายการของวัน)
 *
 * ตัวปฏิทินไม่รู้จักข้อมูลของหน้าไหน — หน้าที่เรียกแปลงข้อมูลของตัวเองเป็น BoardEvent
 * แล้วส่งตัวจัดการกด (เปิดรายการ / เพิ่มรายการของวันนั้น) เข้ามาเอง
 * สถานะวันที่เลือกและเดือนที่ดูอยู่ใน useBoardNav ให้หน้าที่เรียกถือไว้
 * เพราะหน้าที่เรียกต้องสั่งย้ายวันเอง เช่น บันทึกนัดแล้วพาไปวันของนัดนั้น
 */

import Link from "next/link";
import { useState, type CSSProperties } from "react";
import { bkkNow, thaiDate, toIsoDate, todayIso } from "@/lib/format";
import { holidays, holidaysBetween } from "@/lib/holidays";
import { dayDiff } from "@/lib/pm-schedule-data";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

type View = "month" | "week";

const VIEWS: { key: View; label: string }[] = [
  { key: "month", label: "เดือน" },
  { key: "week", label: "สัปดาห์" },
];

/** แถบในหนึ่งสัปดาห์ซ้อนกันได้กี่ชั้นก่อนยุบเป็น "อีก N นัด" — มุมมองสัปดาห์มีที่มากกว่า */
const MAX_LANES = { month: 3, week: 12 };


const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const MON = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
const MON_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

function shift(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

/** วันอาทิตย์ของสัปดาห์นั้น — ปฏิทินไทยขึ้นต้นสัปดาห์ด้วยอาทิตย์ */
function sundayOf(d: Date) {
  return shift(d, -d.getDay());
}

/** หนึ่งรายการบนปฏิทิน — หน้าที่เรียกแปลงข้อมูลของตัวเองมาเป็นรูปนี้ */
export type BoardEvent<T = unknown> = {
  id: string;
  /** ประเภท ตรงกับ key ใน kinds — ใช้นับจำนวนและกรองด้วยป้ายประเภท */
  kind: string;
  /** วันเริ่ม-วันจบ (yyyy-mm-dd) รายการวันเดียวให้ end = start */
  start: string;
  end: string;
  /** ชื่อเต็ม ใช้ในรายการของวัน */
  title: string;
  /** ชื่อสั้นบนแถบในปฏิทิน ไม่ส่งมา = ใช้ title */
  bar?: string;
  /** เวลาเริ่ม HH:mm — ใช้เรียงลำดับและขึ้นหน้าชื่อ ไม่มี = ทั้งวัน */
  time?: string;
  /** เวลาสิ้นสุด HH:mm — ขึ้นในรายการของวันคู่กับ time */
  timeEnd?: string;
  /** ข้อความเวลาบนแถบของวันนั้น (รายการข้ามวันบอกว่าเป็นวันที่เท่าไร) ไม่ส่งมา = time */
  chip?: (day: string) => string;
  /** บรรทัดรองในรายการของวัน */
  sub?: string;
  /** สีจุดในรายการของวัน */
  dot: string;
  /** สีแถบ — คลาสสำเร็จรูป (k-client ฯลฯ) หรือสีที่กำหนดเอง */
  paint: { cls?: string; style?: CSSProperties };
  /** ข้อความตอนชี้ที่แถบ */
  tip?: string;
  /** มีลิงก์ = กดแล้วเปิดหน้านั้น (เช่น ?find=) */
  href?: string;
  /** จางลงเมื่อผ่านไปแล้วหรือไม่ ไม่ส่งมา = จางเมื่อวันจบผ่านไปแล้ว (กำหนดส่งที่ยังค้างไม่ควรจาง) */
  fade?: boolean;
  /** กดไม่ได้ — แสดงเฉย ๆ */
  inert?: boolean;
  /*
   * ยกเลิกแล้ว — ไม่วาดเป็นแถบในปฏิทินอีก แต่ยังอยู่ในรายการของวันแบบขีดฆ่า
   * เพราะยกเลิกนัดต้องเก็บประวัติ ไม่ใช่หายไปเฉย ๆ (ยูสเคส PM-06 BR-03)
   */
  cancelled?: boolean;
  /** เหตุผลที่ยกเลิก — ต่อท้ายบรรทัดรอง ให้อ่านจบได้โดยไม่ต้องเปิดใบ */
  cancelWhy?: string;
  data: T;
};

export type BoardKind = { key: string; label: string; color: string };

/**
 * สีแถบจากสีของประเภท — ใช้กับหน้าที่รายการมาจากที่อื่น (ใบลา ใบงาน กำหนดส่ง)
 * รายการพวกนี้ไม่มีสีที่ผู้ใช้เลือกเองแบบนัดของ PM จึงย้อมพื้นจาง ๆ จากสีจุดเดียวกัน
 * ตัวอักษรใช้สีเต็มของประเภท อ่านออกทั้งธีมสว่างและธีมมืด
 */
export function tintPaint(color: string): BoardEvent["paint"] {
  return { style: { background: `color-mix(in srgb, ${color} 15%, transparent)`, color } };
}

/**
 * สถานะของปฏิทิน — มุมมอง เดือนที่ดู และวันที่เลือก
 * แยกเป็นฮุกให้หน้าที่เรียกถือไว้ จะสั่งย้ายวันเองได้ (เช่น หลังบันทึกนัด)
 */
export function useBoardNav() {
  const todayKey = todayIso();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(() => bkkNow());
  /* วันที่เลือกอยู่ — รายการทางซ้ายและปุ่มเพิ่มนัดอ้างวันนี้ */
  const [sel, setSel] = useState(todayKey);

  /* มุมมองสัปดาห์เลื่อนทีละสัปดาห์ ไม่ใช่ทีละเดือน — และพาวันที่เลือกไปด้วย ไม่งั้นรายการซ้ายค้างอยู่สัปดาห์เก่า */
  function step(n: number) {
    if (view === "week") {
      const next = shift(new Date(`${sel}T00:00:00`), n * 7);
      setSel(toIsoDate(next));
      setCursor(next);
      return;
    }
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  }

  function goToday() {
    setSel(todayKey);
    setCursor(bkkNow());
  }

  /* เลือกวัน — ถ้าเป็นวันของเดือนอื่น พาปฏิทินไปเดือนนั้นด้วย ไม่งั้นวันที่เลือกหลุดไปอยู่นอกจอ */
  function pickDay(day: string) {
    setSel(day);
    const d = new Date(`${day}T00:00:00`);
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear()) {
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    }
  }

  /* ไปที่วันนั้นทั้งวันที่เลือกและปฏิทิน — ใช้หลังบันทึกนัด จะได้เห็นทันทีว่ามันลงไปแล้ว */
  function jumpTo(day: string) {
    setSel(day);
    setCursor(new Date(`${day}T00:00:00`));
  }

  return { todayKey, view, setView, cursor, sel, step, goToday, pickDay, jumpTo };
}

export type BoardNav = ReturnType<typeof useBoardNav>;

/** รายการที่คร่อมวันนั้น เรียงตามเวลาเริ่ม — รายการข้ามวันต้องโผล่ทุกวันที่มันกิน */
export function boardOn<T>(all: BoardEvent<T>[], day: string) {
  return all
    .filter((e) => day >= e.start && day <= e.end)
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
}

export function ScheduleBoard<T>({
  nav,
  events,
  kinds,
  hint,
  onOpen,
  onAdd,
  noToday = false,
}: {
  nav: BoardNav;
  /** นัดทั้งหมดของหน้านี้ (ยังไม่กรองประเภท) — จำนวนบนป้ายประเภทนับจากชุดนี้ */
  events: BoardEvent<T>[];
  kinds: BoardKind[];
  /** คำแนะนำใต้หัวข้อประเภท */
  /** ไม่แสดงแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569) — เก็บไว้ให้หน้าที่ส่งมายังคอมไพล์ผ่าน */
  hint?: string;
  /** กดที่รายการ (ที่ไม่มี href และไม่ใช่ inert) */
  onOpen?: (e: BoardEvent<T>) => void;
  /** ไม่ส่งมา = เพิ่มนัดไม่ได้ ช่องวันกดได้แค่เลือกวัน */
  onAdd?: (day: string) => void;
  /** ไม่มีปุ่ม "วันนี้" — ตารางงานฝ่ายขาย (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  noToday?: boolean;
}) {
  const { view, cursor, sel, todayKey } = nav;
  /* ประเภทที่ถูกปิดไว้ด้วยตัวกรอง — เก็บเฉพาะที่ปิด จะได้ไม่ต้องตั้งค่าตั้งต้นครบทุกประเภท */
  const [off, setOff] = useState<Record<string, boolean>>({});

  const rows = events.filter((e) => !off[e.kind]);
  const dayRows = boardOn(rows, sel);
  /*
   * กดวันในปฏิทินบนมือถือ = เปิดป็อปอัพรายการนัดของวันนั้น (เจ้าของสั่ง 25 ก.ย. 2569)
   * จอแคบไม่มีที่วางรายการไว้ข้าง ๆ เหมือนจอกว้าง เคยเอาไว้ใต้ปฏิทินแล้วกดไปก็ไม่เห็นว่าอะไรเปลี่ยน
   * จอกว้างไม่เปิดป็อปอัพ เพราะรายการอยู่คอลัมน์ซ้ายให้เห็นอยู่แล้ว
   */
  const [daySheet, setDaySheet] = useState(false);
  const phone = () => window.matchMedia("(max-width: 1099.98px)").matches;
  /* นัดที่ยกเลิกแล้วไม่ลงปฏิทิน แต่ยังอยู่ในรายการของวันที่เลือก */
  const liveRows = rows.filter((e) => !e.cancelled);
  const dotOf = Object.fromEntries(kinds.map((k) => [k.key, k])) as Record<string, BoardKind>;

  /* วันหยุดของเดือนที่กำลังดู — แสดงเหนือปฏิทินเสมอ นัดลูกค้าต้องรู้ก่อนว่าวันไหนเขาไม่อยู่ */
  const monthHols = holidaysBetween(
    toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth(), 1)),
    toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)),
  );

  const weekStart = sundayOf(new Date(`${sel}T00:00:00`));
  const maxLanes = view === "week" ? MAX_LANES.week : MAX_LANES.month;
  const label =
    view === "month"
      ? `${MON_FULL[cursor.getMonth()]} ${cursor.getFullYear() + 543}`
      : `${thaiDate(toIsoDate(weekStart))} – ${thaiDate(toIsoDate(shift(weekStart, 6)))}`;

  const weeks =
    view === "month"
      ? (() => {
          const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
          const start = shift(first, -first.getDay());
          /* วาดเท่าจำนวนสัปดาห์ที่มีวันของเดือนนี้ ไม่เกินหน้าเดือน (ผู้ใช้สั่ง 22 ก.ย. 2569)
             ช่องของเดือนข้างเคียงในแถวแรกและแถวสุดท้ายยังเห็นเลขวันจาง ๆ แต่ไม่มีรายการ */
          const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
          const n = Math.ceil((first.getDay() + last.getDate()) / 7);
          return Array.from({ length: n }, (_, i) => shift(start, i * 7));
        })()
      : [weekStart];

  /* มุมมองเดือนตัดรายการให้อยู่ในเดือนนี้เท่านั้น — นัดของเดือนข้างเคียงไม่โผล่ในช่องจาง ๆ
     นัดหลายวันที่คร่อมเดือนเหลือเฉพาะช่วงที่อยู่ในเดือนนี้ */
  const mFirst = toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
  const mLast = toIsoDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));
  const monthRows = liveRows
    .filter((e) => e.end >= mFirst && e.start <= mLast)
    .map((e) => ({ ...e, start: e.start < mFirst ? mFirst : e.start, end: e.end > mLast ? mLast : e.end }));

  /* จัดชั้นของทุกสัปดาห์ก่อนวาด — ใช้ตอนวาดแถบ ไม่ได้ใช้คิดความสูงแล้ว */
  const packs = weeks.map((ws) => packRow(view === "month" ? monthRows : liveRows, ws, maxLanes));
  /*
   * ช่องวันสูงเท่ากันทุกแถวและ **ทุกเดือน** (ผู้ใช้สั่ง 24 ก.ย. 2569)
   * ถ้าคิดจากเดือนที่กำลังดู เดือนที่ว่างจะเตี้ยกว่าเดือนที่แน่น พอกดเปลี่ยนเดือน
   * ปฏิทินทั้งหน้าจะกระโดด — จึงตรึงไว้ที่จำนวนชั้นสูงสุดของมุมมองเดือนเสมอ
   */
  /* +1 ชั้นเผื่อบรรทัด "อีก N นัด" ของวันที่แน่นเกินสามชั้น ไม่งั้นแถวนั้นจะยืดสูงกว่าเพื่อน */
  const rowLanes = MAX_LANES.month + 1;

  /* รายการนัดของวันที่เลือก — ใช้ทั้งในการ์ด (จอกว้าง) และในป็อปอัพ (มือถือ) */
  const dayList = (
    <>
    {dayRows.length === 0 ? (
      <p className="py-1.5 text-[12.5px] text-muted-foreground">ไม่มีนัดหมายในวันนี้</p>
    ) : (
      <ul className="flex flex-col">
        {dayRows.map((e) => {
          const multi = e.end > e.start;
          const inner = (
            <>
              <i
                className="mt-[5px] size-2 flex-none rounded-full"
                style={{ background: e.dot, opacity: e.cancelled ? 0.5 : 1 }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <b
                  className={`block text-[12.5px] leading-[1.5] font-semibold ${
                    e.cancelled ? "text-muted-foreground line-through" : ""
                  }`}
                >
                  {!multi && e.time && (
                    <span className="num">
                      {e.time}
                      {e.timeEnd ? ` – ${e.timeEnd}` : ""}{" "}
                    </span>
                  )}
                  {e.title}
                </b>
                <em className="mt-0.5 block text-[11px] text-muted-foreground not-italic">
                  {e.cancelled ? `ยกเลิกแล้ว${e.cancelWhy ? ` (${e.cancelWhy})` : ""} · ` : ""}
                  {dotOf[e.kind]?.label}
                  {e.sub ? ` · ${e.sub}` : ""}
                  {multi && ` · ${thaiDate(e.start)} – ${thaiDate(e.end)} (${dayDiff(e.start, e.end) + 1} วัน)`}
                </em>
              </span>
            </>
          );
          const cls = "flex w-full items-start gap-[9px] py-[9px] text-left";
          return (
            <li key={e.id} className="border-t border-border first:border-t-0">
              {e.href ? (
                <Link href={e.href} className={`${cls} hover:text-primary`}>
                  {inner}
                </Link>
              ) : e.inert || !onOpen ? (
                <div className={cls}>{inner}</div>
              ) : (
                <button type="button" onClick={() => onOpen(e)} className={cls}>
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    )}
    </>
  );

  return (
    /* โครงสองคอลัมน์ 290px / ปฏิทิน — จอ ≤1100px เหลือคอลัมน์เดียว ปฏิทินขึ้นก่อน (โครง 24 ก.ย. 2569) */
    <div className="grid items-start gap-4 min-[1100px]:grid-cols-[290px_minmax(0,1fr)]">
      <aside className="order-2 flex min-w-0 flex-col gap-3.5 min-[1100px]:order-none">
        {/* จอแคบ: กดวันแล้วต้องเห็นรายการของวันนั้นทันที ป้ายอธิบายประเภทจึงลงไปอยู่ล่างสุด
            (เจ้าของแจ้ง 25 ก.ย. 2569 ว่ากดในปฏิทินแล้วไม่เห็นรายละเอียด) */}
        <section className="glass order-2 rounded-[16px] p-[16px_18px] min-[1100px]:order-none">
          <h2 className="mb-2.5 text-[13.5px] font-bold">ประเภทนัดหมาย</h2>
          {/* คำอธิบายการทำงานของระบบไม่โชว์ให้ผู้ใช้เห็นทุกหน้าตารางงาน (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          <div className="flex flex-wrap gap-[7px]">
            {kinds.map((k) => {
              const n = events.filter((e) => e.kind === k.key && !e.cancelled).length;
              const hidden = Boolean(off[k.key]);
              return (
                <button
                  key={k.key}
                  type="button"
                  aria-pressed={!hidden}
                  onClick={() => setOff((v) => ({ ...v, [k.key]: !v[k.key] }))}
                  className={`inline-flex items-center gap-1.5 rounded-[20px] border border-border bg-card px-[11px] py-[5px] text-[11.5px] font-semibold text-muted-foreground hover:border-primary ${
                    hidden ? "opacity-45" : ""
                  }`}
                >
                  <i className="size-2 flex-none rounded-full" style={{ background: k.color }} aria-hidden="true" />
                  {k.label}
                  <b className="num font-bold">{n}</b>
                </button>
              );
            })}
          </div>
        </section>

        {/* จอแคบใช้ป็อปอัพแทน การ์ดนี้จึงขึ้นเฉพาะจอกว้างที่มีคอลัมน์ซ้าย */}
        <section
          className="glass order-1 hidden rounded-[16px] p-[16px_18px] min-[1100px]:order-none min-[1100px]:block"
          aria-live="polite"
        >
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <h2 className="text-[13.5px] font-bold">
              {sel === todayKey ? "นัดหมายวันนี้ " : "นัดหมายวันที่ "}
              {thaiDate(sel)}
            </h2>
            {/* ช่องวันบนมือถือเล็กเกินกว่าจะกดแม่น จึงมีปุ่มเพิ่มนัดของวันที่เลือกไว้ตรงนี้ด้วย */}
            {onAdd && (
              <span className="flex-none sm:hidden">
                <button
                  type="button"
                  className="btn solid btn-solid h-9 px-3.5 text-[12.5px]"
                  onClick={() => onAdd(sel)}
                >
                  + เพิ่มนัดหมาย
                </button>
              </span>
            )}
          </div>
          {dayList}
        </section>
      </aside>

      {/* ป็อปอัพรายการนัดของวันที่เลือก — เฉพาะจอแคบ */}
      {daySheet && (
        <Sheet
          title={`${sel === todayKey ? "นัดหมายวันนี้ " : "นัดหมายวันที่ "}${thaiDate(sel)}`}
          onClose={() => setDaySheet(false)}
          narrow
          footer={
            <>
              {onAdd && (
                <button
                  type="button"
                  className="btn solid btn-solid mr-auto"
                  onClick={() => {
                    setDaySheet(false);
                    onAdd(sel);
                  }}
                >
                  + เพิ่มนัดหมาย
                </button>
              )}
              <button type="button" className="btn glass-thin" onClick={() => setDaySheet(false)}>
                ปิด
              </button>
            </>
          }
        >
          {dayList}
        </Sheet>
      )}

      <section className="glass order-1 min-w-0 rounded-[16px] p-[18px_20px] max-sm:p-[14px_12px] min-[1100px]:order-none">
        {/* ชื่อเดือนอยู่กลางปฏิทิน ปุ่มวันนี้ชิดซ้าย มุมมองชิดขวา (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3.5 sm:grid sm:grid-cols-[1fr_auto_1fr]">
          {/* สูง 34px เท่า .seg และ .iconbtn ในแถวเดียวกัน (.btn ปกติ 36px จะสูงกว่าเพื่อน) */}
          <span className="justify-self-start">
            {!noToday && (
              <button type="button" className="btn glass-thin" style={{ height: 34 }} onClick={nav.goToday}>
                วันนี้
              </button>
            )}
          </span>
          <div className="flex items-center gap-2.5">
            <button type="button" className="iconbtn glass-thin" aria-label="ก่อนหน้า" onClick={() => nav.step(-1)}>
              <ChevronLeftIcon className="size-3.5" strokeWidth={2.4} />
            </button>
            <b className="min-w-[190px] text-center text-base font-bold max-sm:min-w-[120px] max-sm:text-[14px]" aria-live="polite">
              {label}
            </b>
            <button type="button" className="iconbtn glass-thin" aria-label="ถัดไป" onClick={() => nav.step(1)}>
              <ChevronRightIcon className="size-3.5" strokeWidth={2.4} />
            </button>
          </div>
          <div className="seg justify-self-end" role="tablist" aria-label="มุมมองปฏิทิน">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="tab"
                aria-selected={view === v.key}
                className={view === v.key ? "on" : ""}
                onClick={() => nav.setView(v.key)}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="holstrip">
          <b>วันหยุดเดือนนี้</b>
          {monthHols.length === 0 ? (
            <span className="none">ไม่มีวันหยุดบริษัท</span>
          ) : (
            monthHols.map(([iso, name]) => {
              const d = new Date(`${iso}T00:00:00`);
              return (
                <span key={iso}>
                  <i>
                    {d.getDate()} {MON[d.getMonth()]}
                  </i>
                  {name}
                </span>
              );
            })
          )}
        </div>

        {/* จอแคบให้ปฏิทินหดพอดีจอ ไม่ต้องเลื่อนข้าง — ของเดิมบังคับ 640px
            ทำให้บนมือถือเห็นแค่ 4 วันจาก 7 วัน มองไม่เห็นทั้งเดือน */}
        <div className="overflow-x-auto">
          <div className="sm:min-w-[640px]">
            <div className="grid grid-cols-7">
              {DW.map((d) => (
                <span key={d} className="pb-2 text-center text-[11px] font-bold text-muted-foreground">
                  {d}
                </span>
              ))}
            </div>
            <div className="overflow-hidden rounded-[12px] border-t border-l border-border">
              {weeks.map((ws, i) => (
                <WeekRow
                  key={toIsoDate(ws)}
                  start={ws}
                  month={view === "month" ? cursor.getMonth() : null}
                  today={todayKey}
                  sel={sel}
                  pack={packs[i]}
                  lanes={rowLanes}
                  tall={view === "week"}
                  onPickDay={(day) => {
                    nav.pickDay(day);
                    if (phone()) setDaySheet(true);
                  }}
                  onAdd={
                    onAdd
                      ? (day) => {
                          nav.pickDay(day);
                          /* จอแคบเปิดป็อปอัพของวันนั้นก่อน แล้วค่อยกดปุ่มเพิ่มในป็อปอัพ
                             ช่องวันเล็กเกินกว่าจะกดแล้วเด้งฟอร์มเพิ่มนัดทันทีโดยไม่ได้ตั้งใจ */
                          if (phone()) setDaySheet(true);
                          else onAdd(day);
                        }
                      : undefined
                  }
                  onOpen={onOpen}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ─── หนึ่งสัปดาห์ในปฏิทิน ──────────────────────────────────────────

/** สิ่งที่วางลงแถบของสัปดาห์ — วันหยุด หรือ รายการ */
type Slot<T> = { key: string; start: string; end: string; hol?: string; ev?: BoardEvent<T> };

/**
 * จัดแถบของหนึ่งสัปดาห์ลงชั้น
 *
 * ใบที่กินหลายวันต้องจองชั้นของตัวเองตลอดช่วง ใบอื่นที่คาบเกี่ยวจึงต้องลงชั้นถัดไป
 * ถ้าไม่จองชั้นแบบนี้ แถบจะทับกันจนอ่านไม่ออกว่าอันไหนเป็นอันไหน
 * ลำดับที่ส่งเข้ามาคือลำดับที่ได้ชั้นก่อน — ผู้เรียกจึงเรียงวันหยุดขึ้นก่อนเสมอ
 */
function packWeek<T>(slots: Slot<T>[], weekStart: string, max: number) {
  const lanes: [number, number][][] = [];
  const placed = slots.map((s) => {
    const c1 = Math.max(0, dayDiff(weekStart, s.start));
    const c2 = Math.min(6, dayDiff(weekStart, s.end));
    let lane = 0;
    for (;;) {
      lanes[lane] ??= [];
      if (!lanes[lane].some(([a, b]) => !(c2 < a || c1 > b))) {
        lanes[lane].push([c1, c2]);
        break;
      }
      lane++;
    }
    return { s, c1, c2, lane };
  });

  const hidden = new Map<number, number>();
  const visible = placed.filter((p) => {
    if (p.lane < max) return true;
    for (let c = p.c1; c <= p.c2; c++) hidden.set(c, (hidden.get(c) ?? 0) + 1);
    return false;
  });

  return { visible, hidden };
}

/**
 * จัดแถบของหนึ่งสัปดาห์ลงชั้น และบอกว่าใช้กี่ชั้น
 * แยกออกมาเพราะตัวปฏิทินต้องรู้จำนวนชั้นของทุกสัปดาห์ก่อนวาด — ทุกแถวจะได้สูงเท่ากัน
 */
function packRow<T>(rows: BoardEvent<T>[], start: Date, max: number) {
  const wsIso = toIsoDate(start);
  const weIso = toIsoDate(shift(start, 6));
  /* วันหยุดขึ้นชั้นบนก่อนเสมอ แล้วตามด้วยรายการ — เรียงใบยาวขึ้นก่อน เพราะย้ายชั้นทีหลังยากกว่า */
  const hols: Slot<T>[] = holidaysBetween(wsIso, weIso).map(([d, name]) => ({
    key: `H${d}`,
    start: d,
    end: d,
    hol: name,
  }));
  const evs: Slot<T>[] = rows
    .filter((e) => e.end >= wsIso && e.start <= weIso)
    .sort((a, b) => {
      if (a.start !== b.start) return a.start.localeCompare(b.start);
      const d = dayDiff(b.start, b.end) - dayDiff(a.start, a.end);
      return d !== 0 ? d : (a.time ?? "").localeCompare(b.time ?? "");
    })
    .map((e) => ({ key: e.id, start: e.start, end: e.end, ev: e }));
  const { visible, hidden } = packWeek([...hols, ...evs], wsIso, max);
  const used = Math.max(hidden.size ? max + 1 : 0, ...visible.map((x) => x.lane + 1), 0);
  return { visible, hidden, used };
}

type WeekPack<T> = ReturnType<typeof packRow<T>>;

function WeekRow<T>({
  start,
  month,
  today,
  sel,
  pack,
  lanes,
  tall,
  onPickDay,
  onAdd,
  onOpen,
}: {
  start: Date;
  /** เดือนที่กำลังดูในมุมมองเดือน — null คือมุมมองสัปดาห์ ทุกวันอยู่ในกรอบเท่ากันหมด */
  month: number | null;
  today: string;
  sel: string;
  /** แถบของสัปดาห์นี้ที่จัดชั้นไว้แล้ว */
  pack: WeekPack<T>;
  /** จำนวนชั้นที่ทุกแถวใช้เท่ากัน — ช่องวันของทั้งเดือนจะได้สูงเท่ากันหมด */
  lanes: number;
  tall: boolean;
  onPickDay: (day: string) => void;
  /** ไม่ส่งมา = เพิ่มนัดไม่ได้ ช่องวันจึงกดได้แค่เลือกวัน */
  onAdd?: (day: string) => void;
  onOpen?: (e: BoardEvent<T>) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => shift(start, i));
  const { visible, hidden } = pack;
  const wsIso = toIsoDate(start);
  const weIso = toIsoDate(shift(start, 6));
  const max = tall ? MAX_LANES.week : MAX_LANES.month;

  /* ทุกแถวสูงเท่ากันตามสัปดาห์ที่แน่นที่สุดของเดือน (ผู้ใช้สั่ง 24 ก.ย. 2569)
     เดิมคิดความสูงตามจำนวนนัดของสัปดาห์นั้นเอง ช่องวันจึงไม่เท่ากันทั้งหน้า
     (มุมมองสัปดาห์คงความสูงไว้มาก เพราะทั้งหน้ามีแถวเดียว) */
  return (
    <div
      /* มุมมองสัปดาห์สูงกว่าปกติเพื่อให้ซ้อนนัดได้หลายชั้น — ความสูงอยู่ใน CSS
         ไม่ใช่ inline style เพราะจอมือถือต้องเตี้ยกว่านี้มาก (เจ้าของแจ้ง 25 ก.ย. 2569) */
      className={`wk ${tall ? "wk-week" : ""}`}
      /* ส่งจำนวนชั้นให้ CSS คิดความสูงเอง (globals.css .wk) จอมือถือชั้นเตี้ยกว่าจอใหญ่ */
      style={{ ["--lanes" as string]: lanes } as CSSProperties}
    >
      {/* ชั้นล่างสุด: พื้นหลังของแต่ละวัน กดครั้งเดียว = เลือกวัน (และเปิดฟอร์มเพิ่มของวันนั้น ถ้าเพิ่มได้) */}
      <span className="lines">
        {days.map((d) => {
          const day = toIsoDate(d);
          return (
            <button
              key={day}
              type="button"
              onClick={() => (onAdd ? onAdd(day) : onPickDay(day))}
              className={[month !== null && d.getMonth() !== month ? "off" : "", day === sel ? "on" : ""]
                .filter(Boolean)
                .join(" ")}
              aria-label={onAdd ? `เพิ่มนัดหมายวันที่ ${thaiDate(day)}` : `เลือกวันที่ ${thaiDate(day)}`}
              title={onAdd ? `กดเพื่อเพิ่มนัดหมายวันที่ ${thaiDate(day)}` : `กดเพื่อดูนัดหมายของวันที่ ${thaiDate(day)}`}
            />
          );
        })}
      </span>

      {days.map((d, i) => {
        const day = toIsoDate(d);
        const cls = [
          "dn",
          month !== null && d.getMonth() !== month ? "off" : "",
          d.getDay() === 0 ? "sun" : "",
          holidays()[day] ? "hol" : "",
          day === today ? "today" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={day}
            type="button"
            /* ตัวเลขวันที่ทำงานเหมือนพื้นหลังของช่อง จะได้ไม่งงว่ากดตรงไหนได้ตรงไหนไม่ได้ */
            onClick={() => (onAdd ? onAdd(day) : onPickDay(day))}
            aria-label={onAdd ? `เพิ่มนัดหมายวันที่ ${thaiDate(day)}` : `ดูนัดหมายวันที่ ${thaiDate(day)}`}
            className={cls}
            /* ไม่ใส่กรอบรอบตัวเลขซ้ำ — ช่องที่เลือกมีกรอบอยู่แล้วที่พื้นหลังช่อง (.lines button.on)
               ใส่ทั้งสองที่จะเห็นเป็นกรอบซ้อนกันสองสามชั้น (ผู้ใช้ทักท้วง 24 ก.ย. 2569) */
            style={{ gridColumn: i + 1, zIndex: 2, pointerEvents: "auto" }}
          >
            {d.getDate()}
          </button>
        );
      })}

      {visible.map(({ s, c1, c2, lane }) => {
        const pos = { gridColumn: `${c1 + 1} / span ${c2 - c1 + 1}`, gridRow: lane + 2 };

        if (s.hol) {
          return (
            <div key={s.key} className="evhol" style={pos} title={s.hol}>
              {s.hol}
            </div>
          );
        }

        const e = s.ev!;
        const multi = e.end > e.start;
        const contL = multi && e.start < wsIso;
        const contR = multi && e.end > weIso;
        const chip = e.chip ? e.chip(toIsoDate(shift(start, c1))) : e.time;
        const tip =
          e.tip ??
          `${e.title} · ${thaiDate(e.start)}${multi ? ` – ${thaiDate(e.end)}` : ""}${e.time ? ` · ${e.time}${e.timeEnd ? ` – ${e.timeEnd}` : ""}` : ""}`;
        const style = { ...pos, ...e.paint.style, ...((e.fade ?? e.end < today) ? { opacity: 0.55 } : {}) };
        const cls = `evbar ${e.paint.cls ?? ""} ${contL ? "contL" : ""} ${contR ? "contR" : ""}`;
        const inner = (
          <>
            {chip && <em>{chip}</em>}
            <b>{e.bar ?? e.title}</b>
          </>
        );
        /* แถบที่มีลิงก์เปิดหน้านั้น · แถบที่กดไม่ได้ ให้กดแล้วเลือกวันแทน จะได้เห็นรายละเอียดทางซ้าย */
        if (e.href) {
          return (
            <Link key={s.key} href={e.href} title={tip} style={style} className={cls}>
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => (e.inert || !onOpen ? onPickDay(toIsoDate(shift(start, c1))) : onOpen(e))}
            title={tip}
            style={style}
            className={cls}
          >
            {inner}
          </button>
        );
      })}

      {[...hidden.entries()].map(([c, n]) => (
        <button
          key={`m${c}`}
          type="button"
          className="evmore"
          style={{ gridColumn: c + 1, gridRow: max + 2 }}
          title="ดูนัดหมายทั้งหมดของวันนี้"
          onClick={() => onPickDay(toIsoDate(shift(start, c)))}
        >
          อีก {n} นัด
        </button>
      ))}
    </div>
  );
}
