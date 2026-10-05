"use client";

/*
 * แดชบอร์ดของผู้จัดการทั่วไป (ตามต้นแบบ gm-dashboard.html 22 ก.ย. 2569)
 *
 *   1. การ์ดสรุปสี่ใบ — รออนุมัติ · ลาวันนี้ · โปรเจคเลยกำหนด · OT เดือนนี้
 *   2. ลาในสัปดาห์นี้ (อาทิตย์–เสาร์) คู่กับคำขอรออนุมัติ (รอนานสุดก่อน)
 *   3. โปรเจคที่กำลังดำเนินการ — ดูอย่างเดียว PM เป็นผู้วางแผน
 *
 * ทุกตัวเลขคิดสดจากสโตร์ (gm-data.ts) ไม่มีค่าตายตัว
 * ลิงก์อยู่ในเมนูของ GM เท่านั้น — แถวโปรเจคพาไปหน้าโปรเจค ซึ่งอยู่ในเมนู GM อยู่แล้ว (เปิดแบบดูอย่างเดียว)
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { addDays, daysBetween, parseIsoDate, TH_MONTHS_SHORT, toIsoDate, todayIso } from "@/lib/format";
import { useApprovedOtHours, useGmPending, useTeamLeave, type TeamLeave } from "@/lib/gm-data";
import { USERS } from "@/lib/mock-data";
import { projectHref, projectProgress, type Project } from "@/lib/pm-data";
import { endOf, type PmEvent } from "@/lib/pm-schedule-data";
import { useSchedule } from "@/lib/pm-schedule-store";
import { usePm } from "@/lib/pm-store";

/** รอตั้งแต่กี่วันขึ้นไปถึงเป็นตัวแดง — ตรงกับหน้ารายการรออนุมัติ */
const WAIT_HOT = 3;
/** ส่งมอบภายในกี่วันถึงเตือนสีส้ม */
const SOON_DAYS = 7;
/*
 * การ์ด "ลาในสัปดาห์นี้" กับ "รออนุมัติ" แสดงไม่เกิน 5 แถว เกินนั้นขึ้นลิงก์ "ดูเพิ่มเติม (อีก N รายการ)"
 * และสูงคงที่เท่ากับ 5 แถว + หัว + ช่องท้าย ไม่ยืดหดตามข้อมูล (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * ความสูงคงที่ใช้ตั้งแต่ md ขึ้นไป — มือถือบรรทัดรองตัดขึ้นบรรทัดใหม่ได้ ความสูงแถวจึงไม่คงที่
 * ถ้าล็อกไว้ข้อความจะล้นกล่อง จึงปล่อยให้สูงตามเนื้อหา (แต่ยังไม่เกิน 5 แถว)
 */
const LIST_CAP = 5;
/** ความสูงหนึ่งแถว (px) — ชื่อ 13.5px + รายละเอียด 12px ที่ line-height 1.6 + py-2.5 + เส้นคั่น ≈ 62 */
const ROW_H = 64;
/** ช่องท้ายสำหรับลิงก์ "ดูเพิ่มเติม" — กันที่ไว้เสมอแม้ไม่มีลิงก์ ให้สองการ์ดสูงเท่ากัน */
const FOOT_H = 36;

/** "2026-09-21" → "21 ก.ย." */
function short(iso: string) {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`;
}
const range = (from: string, to: string) => (to && to !== from ? `${short(from)} – ${short(to)}` : short(from));

export function GmDashboardPage() {
  const today = todayIso();
  const pm = usePm();
  const leaves = useTeamLeave();
  const pending = useGmPending();
  const otHours = useApprovedOtHours(today.slice(0, 7));
  const sc = useSchedule();

  /* สัปดาห์นี้ อาทิตย์ถึงเสาร์ ตามต้นแบบ */
  const [w0, w1] = useMemo(() => {
    const start = addDays(today, -parseIsoDate(today).getDay());
    return [start, addDays(start, 6)];
  }, [today]);
  const week = leaves.filter((l) => l.from <= w1 && l.to >= w0);
  const todayLv = leaves.filter((l) => l.from <= today && l.to >= today);
  /* คนเดียวลาหลายใบในวันเดียวกันนับครั้งเดียว */
  const todayNames = [...new Set(todayLv.map((l) => l.name.split(" ")[0]))];

  const running = pm.projects.filter((p) => p.status === "running");
  const late = running.filter((p) => p.due && p.due < today);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>แดชบอร์ด</h1>
          <p>{USERS.gm.name} · ผู้จัดการทั่วไป</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5 xl:grid-cols-4">
        <Kpi label="รออนุมัติ" value={pending.length} sub="การลา OT และใบเบิก" />
        <Kpi label="ลาวันนี้" value={todayNames.length} sub={todayNames.length ? todayNames.join(" · ") : "มาทำงานครบ"} />
        <Kpi label="โปรเจคเลยกำหนด" value={late.length} sub={`จาก ${running.length} โปรเจคที่กำลังทำ`} bad={late.length > 0} />
        <Kpi label="OT เดือนนี้" value={otHours} sub="ชั่วโมงที่อนุมัติแล้วทั้งบริษัท" />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        {/* คอลัมน์ซ้าย: ลาในสัปดาห์นี้ + ปฏิทินเดือนย่อ (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
        <div className="min-w-0 space-y-4">
          <Card title="ลาในสัปดาห์นี้" more={{ href: "/gm/calendar", label: "ดูตารางงาน" }}>
            <CappedList count={week.length} href="/gm/calendar" empty="ไม่มีใครลาในสัปดาห์นี้">
              {week.slice(0, LIST_CAP).map((l) => (
                <Row key={l.key} href="/gm/calendar" title={l.name} sub={`${l.type} ${range(l.from, l.to)}`}
                  right={<LeaveState l={l} />} />
              ))}
            </CappedList>
          </Card>

          <GmMiniCalendar today={today} leaves={leaves} projects={running} events={sc.events} />
        </div>

        <Card title="รออนุมัติ" more={{ href: "/approvals", label: "ไปอนุมัติ" }}>
          <CappedList count={pending.length} href="/approvals" empty="ไม่มีคำขอรออนุมัติ">
            {pending.slice(0, LIST_CAP).map((r) => {
              const w = daysBetween(r.at.slice(0, 10), today);
              const what = r.kind === "leave" && r.from ? `${r.what} ${range(r.from, r.to ?? r.from)}` : r.what;
              return (
                <Row key={r.key} href="/approvals" title={r.name} sub={what}
                  right={
                    <em
                      className={`text-[12.5px] font-semibold not-italic ${w >= WAIT_HOT ? "text-destructive" : "text-muted-foreground"}`}
                      title={w >= WAIT_HOT ? `รอนานเกิน ${WAIT_HOT} วัน` : undefined}
                    >
                      {w <= 0 ? "วันนี้" : w === 1 ? "เมื่อวาน" : `${w} วันก่อน`}
                    </em>
                  } />
              );
            })}
          </CappedList>
        </Card>
      </div>

      <Card title="โปรเจคที่กำลังดำเนินการ" note="ดูอย่างเดียว PM เป็นผู้วางแผน">
        {running.length === 0 ? (
          <None>ไม่มีโปรเจคที่กำลังดำเนินการ</None>
        ) : (
          <ul>
            {running.map((p) => {
              const pr = projectProgress(p);
              /* โปรเจคที่ยังไม่มีแผน ไม่มีวันส่งมอบให้นับ — บอกไปตรง ๆ ไม่ใช่โชว์ NaN */
              const d = p.due ? daysBetween(today, p.due) : null;
              return (
                <Row key={p.pj} href={projectHref(p.pj)} title={p.name || p.cus}
                  sub={`${p.cus} · PM ${p.pm} · เสร็จ ${pr.pct}% (${pr.done}/${pr.all} งาน)`}
                  right={
                    <em className={`num text-[12.5px] font-semibold not-italic ${d === null ? "text-muted-foreground" : d < 0 ? "text-destructive" : d <= SOON_DAYS ? "text-[#B4630B]" : "text-muted-foreground"}`}>
                      {d === null ? "ยังไม่มีกำหนดส่งมอบ" : d < 0 ? `เลยกำหนด ${-d} วัน` : `ส่งมอบอีก ${d} วัน`}
                    </em>
                  } />
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function LeaveState({ l }: { l: TeamLeave }) {
  return (
    <em className={`text-[12.5px] font-semibold not-italic ${l.pending ? "text-[#B4630B]" : "text-muted-foreground"}`}>
      {l.pending ? "รออนุมัติ" : "อนุมัติแล้ว"}
    </em>
  );
}

/**
 * รายการที่ตัดไว้ 5 แถวในกล่องสูงคงที่ (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * children = แถวที่ตัดแล้ว · count = จำนวนทั้งหมด ใช้คิดว่าเหลืออีกกี่รายการ
 */
function CappedList({ count, href, empty, children }: { count: number; href: string; empty: string; children: React.ReactNode }) {
  const extra = count - LIST_CAP;
  return (
    <div
      className="flex flex-col md:h-[var(--cap-h)]"
      style={{ "--cap-h": `${LIST_CAP * ROW_H + FOOT_H}px`, "--row-h": `${ROW_H}px` } as React.CSSProperties}
    >
      {count === 0 ? (
        <p className="grid flex-1 place-items-center py-6 text-center text-[13px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="md:[&>li>*]:h-[var(--row-h)]">{children}</ul>
      )}
      {extra > 0 && (
        <Link
          href={href}
          className="lnk mt-auto flex h-9 flex-none items-center justify-center border-t border-border text-[12.5px] font-semibold"
        >
          ดูเพิ่มเติม (อีก {extra} รายการ)
        </Link>
      )}
    </div>
  );
}

const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
/** สีจุดตรงกับป้ายประเภทในหน้า /gm/calendar */
const DOT = { due: "#D0021B", leave: "#14875A", wait: "#B4630B", meet: "#6A2CA0" } as const;
type DotKind = keyof typeof DOT;
const LEGEND: [DotKind, string][] = [
  ["leave", "ลาอนุมัติแล้ว"],
  ["wait", "ลารออนุมัติ"],
  ["due", "ส่งมอบโปรเจค"],
  ["meet", "นัดหมาย"],
];

/**
 * ปฏิทินเดือนย่อใต้ "ลาในสัปดาห์นี้" (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * หน้าตาเดียวกับ MiniCalendar ของแดชบอร์ด PM แต่ตัวนั้นเป็นฟังก์ชันภายในไฟล์ ผูกกับนัดหมายของ PM
 * และมีรายการนัดของวันที่เลือกต่อท้าย จึงเขียนแบบย่อไว้ที่นี่แทนการแก้ไฟล์ของ PM
 * ข้อมูลชุดเดียวกับ /gm/calendar — วันลา (อนุมัติแล้ว/รออนุมัติ) กำหนดส่งมอบโปรเจคที่กำลังทำ และนัดหมายที่ยังไม่ยกเลิก
 * กดวันแล้วไป /gm/calendar (หน้านั้นยังไม่รับพารามิเตอร์วันที่ จึงเปิดที่วันนี้)
 */
function GmMiniCalendar({
  today,
  leaves,
  projects,
  events,
}: {
  today: string;
  leaves: TeamLeave[];
  projects: Project[];
  events: PmEvent[];
}) {
  const [cursor, setCursor] = useState(() => today.slice(0, 7));
  const [y, m] = cursor.split("-").map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const last = new Date(y, m, 0).getDate();
  const move = (step: number) => setCursor(toIsoDate(new Date(y, m - 1 + step, 1)).slice(0, 7));

  /* ประเภทที่มีในแต่ละวันของเดือนที่แสดง */
  const kindsOn = useMemo(() => {
    const map = new Map<string, Set<DotKind>>();
    const mark = (from: string, to: string, k: DotKind) => {
      for (let d = 1; d <= last; d++) {
        const iso = toIsoDate(new Date(y, m - 1, d));
        if (iso < from || iso > to) continue;
        if (!map.has(iso)) map.set(iso, new Set());
        map.get(iso)!.add(k);
      }
    };
    for (const l of leaves) mark(l.from, l.to > l.from ? l.to : l.from, l.pending ? "wait" : "leave");
    for (const p of projects) if (p.due) mark(p.due, p.due, "due");
    for (const e of events) if (!e.cancel) mark(e.date, endOf(e), "meet");
    return map;
  }, [leaves, projects, events, y, m, last]);

  return (
    <Card title="ปฏิทิน" more={{ href: "/gm/calendar", label: "ดูตารางงาน" }}>
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="iconbtn glass-thin size-7 rounded-lg max-sm:size-10" aria-label="เดือนก่อนหน้า" onClick={() => move(-1)}>
          ‹
        </button>
        <b className="text-[13px] font-bold">
          {TH_MONTHS_SHORT[m - 1]} {y + 543}
        </b>
        <button type="button" className="iconbtn glass-thin size-7 rounded-lg max-sm:size-10" aria-label="เดือนถัดไป" onClick={() => move(1)}>
          ›
        </button>
      </div>

      <div className="mt-2 grid grid-cols-7 gap-0.5">
        {DW.map((d) => (
          <span key={d} className="py-1 text-center text-[10.5px] font-semibold text-muted-foreground">
            {d}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: last }, (_, i) => {
          const iso = toIsoDate(new Date(y, m - 1, i + 1));
          const ks = [...(kindsOn.get(iso) ?? [])];
          return (
            <Link
              key={iso}
              href="/gm/calendar"
              aria-label={`${i + 1} ${ks.length ? LEGEND.filter(([k]) => ks.includes(k)).map(([, t]) => t).join(" ") : "ไม่มีรายการ"}`}
              className={`num flex h-9 flex-col items-center justify-center gap-[3px] rounded-[9px] text-[12.5px] max-sm:h-10 ${
                iso === today ? "font-bold text-primary ring-1 ring-primary ring-inset" : "hover:bg-muted"
              }`}
            >
              {i + 1}
              <span className="flex h-[5px] gap-[2px]">
                {ks.map((k) => (
                  <i key={k} className="block size-[5px] rounded-full" style={{ background: DOT[k] }} />
                ))}
              </span>
            </Link>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-2.5 text-[11.5px] text-muted-foreground">
        {LEGEND.map(([k, t]) => (
          <span key={k} className="inline-flex items-center gap-1.5">
            <i className="block size-[6px] rounded-full" style={{ background: DOT[k] }} />
            {t}
          </span>
        ))}
      </div>
    </Card>
  );
}

// ─── โครงร่างที่ใช้ซ้ำ ────────────────────────────────────────────

function Kpi({ label, value, sub, bad }: { label: string; value: number; sub: string; bad?: boolean }) {
  return (
    <div className="glass min-w-0 rounded-[18px] px-[18px] py-4 max-sm:px-3.5 max-sm:py-3">
      <em className="block text-xs font-semibold text-muted-foreground not-italic">{label}</em>
      <b className={`num mt-[3px] block text-[26px] leading-[1.15] font-extrabold tracking-[-.02em] ${bad ? "text-destructive" : ""}`}>
        {value}
      </b>
      <span className="mt-1 block truncate text-[11.5px] leading-normal text-muted-foreground" title={sub}>
        {sub}
      </span>
    </div>
  );
}

function Card({
  title,
  more,
  note,
  children,
}: {
  title: string;
  more?: { href: string; label: string };
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="glass min-w-0 rounded-[18px] px-5 py-[18px] max-sm:px-4">
      <div className="mb-2 flex items-center justify-between gap-3 max-sm:flex-wrap max-sm:gap-y-1">
        <h2 className="text-[14.5px] font-bold">{title}</h2>
        {more && (
          <Link href={more.href} className="lnk text-[12.5px] font-semibold max-sm:-my-2 max-sm:py-2">
            {more.label}
          </Link>
        )}
        {note && <span className="text-[12.5px] text-muted-foreground">{note}</span>}
      </div>
      {children}
    </section>
  );
}

/** แถวรายการ — ชื่อ + รายละเอียดทางซ้าย สถานะทางขวา · ไม่มี href = ดูอย่างเดียว */
function Row({ href, title, sub, right }: { href?: string; title: string; sub: string; right: React.ReactNode }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <b className="block truncate text-[13.5px] font-semibold group-hover:text-primary">{title}</b>
        <span className="block truncate text-[12px] text-muted-foreground max-sm:whitespace-normal">{sub}</span>
      </span>
      <span className="flex-none text-right">{right}</span>
    </>
  );
  const cls = "group flex items-center gap-3 border-t border-border py-2.5";
  return (
    <li>
      {href ? (
        <Link href={href} className={cls}>
          {body}
        </Link>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

function None({ children }: { children: React.ReactNode }) {
  return <p className="py-3.5 text-[13px] text-muted-foreground">{children}</p>;
}
