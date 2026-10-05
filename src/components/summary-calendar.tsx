"use client";

/*
 * ★ เลิกใช้แล้ว (24 ก.ย. 2569) — ไม่มีหน้าไหนเรียกไฟล์นี้
 * เจ้าของสั่งให้หน้าตารางงานหน้าตาเหมือนกันทุกอัน ทุกหน้าจึงกลับไปใช้ schedule-board.tsx
 * เก็บไฟล์ไว้เฉย ๆ เผื่อย้อนกลับ ถ้าจะแก้ปฏิทิน ให้แก้ที่ schedule-board.tsx
 *
 * ปฏิทินสรุป — "แบบ B" ในโครงหน้าชุด 24 ก.ย. 2569 (new-24sep/schedule-structure.md)
 *
 * ใช้กับคนที่ **ไม่ได้สร้างนัดเอง** — SA/BD (/presales-schedule) · GM (/gm/calendar) · ทีมงาน (/my-schedule)
 * คนกลุ่มนี้ถามว่า "วันไหนมีอะไรของฉัน/ของทีมบ้าง" ไม่ได้จัดตารางให้คนอื่น
 * จึงไม่ต้องมีแถบพาดข้ามวันแบบปฏิทินของ PM (schedule-board.tsx) — ช่องวันเตี้ย
 * ในช่องมีแค่เลขวันกับจุดสีบอกชนิด รายละเอียดอ่านจากรายการของวันข้าง ๆ
 *
 * (กติกาเดิมที่ว่าทุกหน้าตารางงานใช้กระดานของ PM เหมือนกัน ถูกยกเลิกด้วยโครงชุดนี้)
 *
 * ทุกอย่างที่มีวันที่ของคนนั้นมารวมในปฏิทินเดียว และกดแล้วต้องไปถึงของจริงได้
 * วันที่เลือกที่ว่างต้องบอกรายการถัดไปพร้อมปุ่มกระโดด ห้ามขึ้นแค่ "ไม่มีรายการ"
 */

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { bkkNow, parseIsoDate, TH_MONTHS_SHORT, thaiDate, toIsoDate, todayIso } from "@/lib/format";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
const DW_FULL = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const MON_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

/** จุดในช่องวันแสดงได้กี่จุดก่อนยุบเป็น "+N" — ช่องกว้างราว 46px บนมือถือ */
const MAX_DOTS = 4;

/** คีย์จุดของรายการที่ยกเลิกแล้ว — ไม่ตรงกับชนิดไหนใน kinds จึงตกไปใช้สีเทาตั้งต้น */
const CANCEL_DOT = "__cancelled";

/** หนึ่งรายการในปฏิทินสรุป — หน้าที่เรียกแปลงข้อมูลของตัวเองมาเป็นรูปนี้ */
export type SummaryItem = {
  id: string;
  /** ชนิด ตรงกับ key ใน kinds — กำหนดสีจุดและคำอธิบายสี */
  kind: string;
  /** ช่วงวัน (yyyy-mm-dd) รายการวันเดียวให้ end = start */
  start: string;
  end: string;
  title: string;
  /** บรรทัดรองในรายการของวัน */
  sub?: string;
  /** เวลาเริ่ม–สิ้นสุด ถ้ามี */
  time?: string;
  /** กดแล้วไปหน้าของจริง (ใบคำขอ งาน โปรเจค ใบลา) */
  href?: string;
  /** กดแล้วเปิดกล่องรายละเอียดในหน้านี้ — ใช้กับนัดหมาย */
  onOpen?: () => void;
  /*
   * ยกเลิกแล้ว — ยังอยู่ในรายการแต่ขีดฆ่า (เจ้าของสั่ง 24 ก.ย. 2569)
   * ถ้าลบหายไปเฉย ๆ คนที่กันเวลาไว้แล้วจะไม่รู้ว่าเป็นเพราะถูกยกเลิกหรือจำผิดเอง
   */
  cancelled?: boolean;
  /** เหตุผลที่ยกเลิก — ต่อท้ายบรรทัดรอง ให้อ่านจบได้ในรายการโดยไม่ต้องเปิดกล่อง */
  cancelWhy?: string;
};

export type SummaryKind = { key: string; label: string; color: string };

const shortDate = (day: string) => {
  const d = parseIsoDate(day);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`;
};

/** "วันพุธที่ 23 กันยายน 2569" — หัวข้อรายการของวันตามโครงหน้า */
function longThaiDate(day: string) {
  const d = parseIsoDate(day);
  return `วัน${DW_FULL[d.getDay()]}ที่ ${d.getDate()} ${MON_FULL[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function shift(d: Date, days: number) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

export function SummaryCalendar({
  items,
  kinds,
  /** ปุ่มบนแถบหัวปฏิทิน — มีเฉพาะ GM ที่สร้างนัดหมายได้ */
  tools,
  /** บรรทัดใต้รายการของวัน เช่น คำอธิบายว่าหน้านี้ดูอย่างเดียว */
  foot,
}: {
  items: SummaryItem[];
  kinds: SummaryKind[];
  tools?: ReactNode;
  foot?: ReactNode;
}) {
  const today = todayIso();
  const [cursor, setCursor] = useState(() => bkkNow());
  const [sel, setSel] = useState(today);

  const colorOf = useMemo(
    () => Object.fromEntries(kinds.map((k) => [k.key, k])) as Record<string, SummaryKind>,
    [kinds],
  );

  /* รายการของแต่ละวัน — คิดครั้งเดียวต่อชุดข้อมูล ไม่ต้องไล่ทั้งชุดซ้ำทุกช่องวัน
     รายการข้ามวันต้องโผล่ทุกวันที่มันกิน ไม่ใช่เฉพาะวันแรก */
  const byDay = useMemo(() => {
    const map = new Map<string, SummaryItem[]>();
    for (const it of items) {
      if (!it.start) continue;
      for (let d = it.start; d <= it.end; d = toIsoDate(shift(parseIsoDate(d), 1))) {
        const list = map.get(d);
        if (list) list.push(it);
        else map.set(d, [it]);
      }
    }
    for (const list of map.values()) list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
    return map;
  }, [items]);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = shift(first, -first.getDay());
  const weeks = Math.ceil(
    (first.getDay() + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7,
  );

  function moveMonth(n: number) {
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  }

  /* กระโดดไปวันไหนก็พาปฏิทินไปเดือนนั้นด้วย ไม่งั้นวันที่เลือกอยู่นอกจอ */
  function jump(day: string) {
    setSel(day);
    const d = parseIsoDate(day);
    if (d.getMonth() !== cursor.getMonth() || d.getFullYear() !== cursor.getFullYear())
      setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  const dayRows = byDay.get(sel) ?? [];
  /* วันที่เลือกว่าง ต้องบอกว่าไปดูวันไหนต่อ ห้ามขึ้นแค่ "ไม่มีรายการ"
     ปกติชี้ไปข้างหน้า ถ้าข้างหน้าไม่มีอะไรแล้วก็ชี้ย้อนไปรายการล่าสุดแทน */
  const ahead = items
    .filter((it) => it.start > sel)
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  const behind = items
    .filter((it) => it.end < sel)
    .sort((a, b) => b.end.localeCompare(a.end))[0];
  const near = ahead ?? behind;
  const nearDay = ahead ? ahead.start : behind?.end;

  return (
    /* ปฏิทิน 1.35 ส่วน / รายการของวัน 1 ส่วน — จอ ≤1000px เหลือคอลัมน์เดียว (โครง 24 ก.ย. 2569) */
    <div className="grid items-start gap-4 min-[1000px]:grid-cols-[1.35fr_minmax(0,1fr)]">
      <section className="glass min-w-0 rounded-[16px] p-[18px_20px] max-sm:p-[14px_12px]">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5">
            <button type="button" className="iconbtn glass-thin" aria-label="เดือนก่อนหน้า" onClick={() => moveMonth(-1)}>
              <ChevronLeftIcon className="size-3.5" strokeWidth={2.4} />
            </button>
            <b className="min-w-[150px] text-center text-base font-bold max-sm:min-w-[118px] max-sm:text-[14px]" aria-live="polite">
              {MON_FULL[cursor.getMonth()]} {cursor.getFullYear() + 543}
            </b>
            <button type="button" className="iconbtn glass-thin" aria-label="เดือนถัดไป" onClick={() => moveMonth(1)}>
              <ChevronRightIcon className="size-3.5" strokeWidth={2.4} />
            </button>
            <button type="button" className="btn glass-thin" style={{ height: 34 }} onClick={() => jump(today)}>
              วันนี้
            </button>
          </div>
          {tools}
        </div>

        <div className="grid grid-cols-7">
          {DW.map((d) => (
            <span key={d} className="pb-1.5 text-center text-[11px] font-bold text-muted-foreground">
              {d}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-[3px]">
          {Array.from({ length: weeks * 7 }, (_, i) => {
            const d = shift(gridStart, i);
            const day = toIsoDate(d);
            const other = d.getMonth() !== cursor.getMonth();
            const rows = other ? [] : (byDay.get(day) ?? []);
            /* จุดหนึ่งจุดต่อหนึ่งชนิด — วันที่มีสามงานชนิดเดียวกันไม่ควรมีสามจุดเหมือนกัน
               รายการที่ยกเลิกแล้วรวมเป็นจุดเทาจุดเดียว ไม่ปนกับของที่ยังต้องไปจริง */
            const dots = [...new Set(rows.map((r) => (r.cancelled ? CANCEL_DOT : r.kind)))];
            const on = day === sel;
            return (
              <button
                key={day}
                type="button"
                aria-pressed={on}
                aria-label={`${longThaiDate(day)}${rows.length ? ` มี ${rows.length} รายการ` : " ไม่มีรายการ"}`}
                onClick={() => jump(day)}
                className={`flex h-[46px] flex-col items-center justify-start gap-[3px] rounded-[9px] border pt-[5px] sm:h-[58px] sm:pt-[7px] ${
                  on
                    ? "border-primary bg-[var(--accent)]"
                    : "border-transparent hover:border-border hover:bg-muted"
                }`}
              >
                <span
                  className={`num text-[12.5px] leading-none font-semibold ${
                    day === today ? "text-primary" : other ? "text-muted-foreground opacity-45" : ""
                  }`}
                >
                  {d.getDate()}
                </span>
                <span className="flex flex-wrap items-center justify-center gap-[3px] px-1">
                  {dots.slice(0, MAX_DOTS).map((k) => (
                    <i
                      key={k}
                      aria-hidden="true"
                      className="size-[5px] rounded-full"
                      style={{ background: colorOf[k]?.color ?? "var(--muted-foreground)", opacity: k === CANCEL_DOT ? 0.55 : 1 }}
                    />
                  ))}
                  {dots.length > MAX_DOTS && (
                    <em className="num text-[9px] leading-none font-bold text-muted-foreground not-italic">
                      +{dots.length - MAX_DOTS}
                    </em>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {/* คำอธิบายสีครบทุกชนิด — ไม่มีตัวกรอง เพราะหน้านี้ดูภาพรวมของวัน ไม่ได้ไล่จัดตาราง */}
        <div className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-border pt-2.5">
          {kinds.map((k) => (
            <span key={k.key} className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <i className="size-2 flex-none rounded-full" style={{ background: k.color }} aria-hidden="true" />
              {k.label}
            </span>
          ))}
        </div>
      </section>

      <section className="glass min-w-0 rounded-[16px] p-[16px_18px]" aria-live="polite">
        <h2 className="mb-2.5 text-[13.5px] font-bold">{longThaiDate(sel)}</h2>
        {dayRows.length === 0 ? (
          <p className="py-1.5 text-[12.5px] leading-[1.7] text-muted-foreground">
            ไม่มีรายการในวันนี้
            {near && nearDay ? (
              <>
                {ahead ? " · ถัดไป " : " · ล่าสุด "}
                <button
                  type="button"
                  onClick={() => jump(nearDay)}
                  className="text-left font-semibold text-primary hover:underline"
                >
                  {shortDate(nearDay)} {near.title}
                </button>
              </>
            ) : (
              " และไม่มีรายการอื่นในปฏิทินนี้"
            )}
          </p>
        ) : (
          <ul className="flex flex-col">
            {dayRows.map((it) => {
              const k = colorOf[it.kind];
              const multi = it.end > it.start;
              const inner = (
                <>
                  <i
                    className="mt-[5px] size-2 flex-none rounded-full"
                    style={{
                      background: it.cancelled ? "var(--muted-foreground)" : (k?.color ?? "var(--muted-foreground)"),
                      opacity: it.cancelled ? 0.55 : 1,
                    }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    {/* ขีดฆ่าเฉพาะหัวข้อ บรรทัดรองยังต้องอ่านออก เพราะเหตุผลที่ยกเลิกอยู่ตรงนั้น */}
                    <b
                      className={`block text-[12.5px] leading-[1.5] font-semibold ${
                        it.cancelled ? "text-muted-foreground line-through" : ""
                      }`}
                    >
                      {it.time && <span className="num">{it.time} </span>}
                      {it.title}
                    </b>
                    <em className="mt-0.5 block text-[11px] leading-[1.6] text-muted-foreground not-italic">
                      {it.cancelled ? "ยกเลิกแล้ว" : k?.label}
                      {it.sub ? ` · ${it.sub}` : ""}
                      {multi && ` · ${thaiDate(it.start)} – ${thaiDate(it.end)}`}
                      {it.cancelled && it.cancelWhy ? ` · ${it.cancelWhy}` : ""}
                    </em>
                  </span>
                </>
              );
              const cls = "flex w-full items-start gap-[9px] py-[9px] text-left";
              return (
                <li key={it.id} className="border-t border-border first:border-t-0">
                  {it.href ? (
                    <Link href={it.href} className={`${cls} hover:text-primary`}>
                      {inner}
                    </Link>
                  ) : it.onOpen ? (
                    <button type="button" onClick={it.onOpen} className={`${cls} hover:text-primary`}>
                      {inner}
                    </button>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {foot && <p className="mt-2.5 border-t border-border pt-2.5 text-[11.5px] leading-[1.7] text-muted-foreground">{foot}</p>}
      </section>
    </div>
  );
}
