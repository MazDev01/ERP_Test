"use client";

/*
 * แดชบอร์ดของผู้จัดการโครงการ (ตามต้นแบบ dose-erp-maz/pm-dashboard.html)
 *
 * สี่ส่วนตามต้นแบบ
 *   1. การ์ดสรุปห้าใบ — งานเข้ารอรับ งานย่อยรอตรวจ โปรเจคที่กำลังทำ งานย่อยใกล้ครบกำหนด งานย่อยล่าช้า
 *      ทุกการ์ดที่ขึ้นต้นด้วย "งานย่อย" นับเป็นใบงานในโปรเจค ไม่ใช่จำนวนโปรเจค (หน้า /pm/projects นับโปรเจค)
 *   2. ความคืบหน้าโปรเจค คู่กับงานเข้าใหม่
 *   3. งานที่ต้องติดตาม คู่กับปฏิทินนัดหมาย
 *
 * ทุกตัวเลขคำนวณสดจากสโตร์ ไม่มีตัวเลขสรุปที่เก็บซ้ำไว้ต่างหาก
 * เพราะตัวเลขสรุปที่เก็บแยกคือจุดที่ข้อมูลจะเริ่มไม่ตรงกันเป็นที่แรก
 *
 * ทุกลิงก์ในหน้านี้อยู่ในหน้าของ PM เท่านั้น ไม่พาข้ามไปหน้าของบทบาทอื่น
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { TH_MONTHS_SHORT, daysBetween, thaiDate, toIsoDate, todayIso } from "@/lib/format";
import {
  projName,
  projectProgress,
  type Project,
  type ProjectTask,
  projectHref,
  pctColor,
} from "@/lib/pm-data";
import { colorOf, eventKind, eventsOn, isPsEvent, isSalesEvent } from "@/lib/pm-schedule-data";
import { useSchedule } from "@/lib/pm-schedule-store";
import { isHoliday } from "@/lib/holidays";
import { memberName, usePm } from "@/lib/pm-store";
import { serviceLabel } from "@/lib/pm-data";
import { ClockIcon, InboxIcon, ProjectIcon, TasksIcon } from "./icons";

/** งานย่อยหนึ่งใบพร้อมโปรเจคต้นทางและจำนวนวันที่เหลือ — ใช้ซ้ำหลายบล็อก จึงคิดครั้งเดียว */
type TaskRow = { p: Project; t: ProjectTask; left: number };

/** กี่วันข้างหน้าถึงนับว่า "ใกล้ครบกำหนด" — ตรงกับข้อความบนการ์ด */
const SOON_DAYS = 7;
/** งานเข้าใหม่แสดงกี่รายการในการ์ด มากกว่านี้บอกว่าเหลืออีกกี่รายการ */
const INBOX_CAP = 4;
/** โปรเจคในการ์ดความคืบหน้า — เกินนี้ขึ้นลิงก์ "ดูโปรเจค อีก N รายการ" ตามต้นแบบ */
const PROJ_CAP = 3;
/** ตารางงานที่ต้องติดตามแสดงกี่งาน — เกินนี้ขึ้นแถว "และอีก N งาน" ตามต้นแบบ */
const DUE_CAP = 5;
/** นัดของวันที่เลือกแสดงกี่รายการ — เกินนี้ขึ้นลิงก์ "ดูตารางงาน อีก N รายการ" ตามต้นแบบ */
const CAL_CAP = 3;

const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

export function PmDashboardPage() {
  const pm = usePm();
  const sc = useSchedule();
  const today = todayIso();

  const projects = pm.projects;

  const tasks = useMemo<TaskRow[]>(
    () => projects.flatMap((p) => p.tasks.map((t) => ({ p, t, left: daysBetween(today, t.due) }))),
    [projects, today],
  );
  /* โปรเจคที่ยกเลิกแล้วงานหยุด ไม่นับว่าใกล้กำหนดหรือเลยกำหนด (PM-BR-05)
     งานรอลูกค้าตรวจผ่านลิงก์ (wait) ทีมส่งและ PM ตรวจผ่านแล้ว ลูกบอลอยู่ที่ลูกค้า ไม่นับว่าทีมล่าช้า */
  const open = tasks.filter((x) => x.t.status !== "done" && x.t.status !== "wait" && x.p.status !== "cancelled");

  const running = projects.filter((p) => p.status === "running").length;
  /*
   * จำนวนโปรเจคทั้งหมดต้องตรงกับที่หน้า /pm/projects ขึ้น — หน้านั้นนับงานที่รับเข้าถึงขั้นวางแผน
   * แต่ยังไม่ได้แตกเฟสด้วย ถ้านับแค่ pm.projects ตัวเลขสองหน้าจะไม่ตรงกัน
   */
  const awaitingPlan = pm.inbox.filter(
    (j) => j.stage === "plan" && !projects.some((p) => p.pj === j.pj),
  ).length;
  const totalProjects = projects.length + awaitingPlan;
  const waiting = pm.inbox.filter((j) => j.stage === "new").length;
  /* งานที่ทีมส่งกลับมาแล้วรอ PM ตัดสิน — ค้างที่นี่คือทีมหยุดรอเรา จึงต้องเห็นบนแดชบอร์ด */
  const reviewRows = open.filter((x) => x.t.status === "sent");
  const review = reviewRows.length;
  /* เลยกำหนดแต่ทีมส่งมาแล้ว = ความช้าอยู่ที่การตรวจของเรา ไม่ใช่ของทีม */
  const reviewLate = reviewRows.filter((x) => x.left < 0).length;
  const soon = open.filter((x) => x.t.status !== "sent" && x.left >= 0 && x.left <= SOON_DAYS).length;
  /*
   * งานย่อยที่ล่าช้าจริง = ยังไม่เสร็จ ยังไม่ได้ส่งมาให้ตรวจ และเลยกำหนดส่งแล้ว
   * งานที่ทีมส่งมาแล้วรอเราตรวจไม่นับตรงนี้ ไม่งั้นความช้าของ PM ถูกบันทึกใส่ทีมงาน
   * (ไปนับที่การ์ด "งานรอตรวจ" แทน) · กติกาเดียวกับกระดิ่ง (notifications.ts กลุ่มงานย่อยเลยกำหนด)
   */
  const overdue = open.filter((x) => x.t.status !== "sent" && x.left < 0).length;
  /* งานค้างในโปรเจคที่ปิดว่าส่งมอบแล้ว — ยังเป็นงานของใครสักคน ต้องไม่หายไปจากสายตา */
  const doneWithOpen = projects.filter(
    (p) => p.status === "done" && p.tasks.some((t) => t.status !== "done"),
  ).length;

  return (
    <div className="space-y-4">
      {/* ไม่มีหัวข้อหน้า — แถบบนบอกชื่อหน้าและวันที่อยู่แล้ว ปุ่มเลื่อนขึ้นชิดขวา (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <h1 className="sr-only">แดชบอร์ด</h1>

      {/* มือถือ: การ์ดใบที่ห้าเหลือเดี่ยวอยู่แถวสุดท้าย ให้กินเต็มแถวแทนการเว้นช่องว่าง */}
      <div className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5 max-sm:[&>*:last-child]:col-span-2 xl:grid-cols-5">
        {/* ใต้ตัวเลขเป็นแค่ลักษณนาม หัวการ์ดบอกความหมายอยู่แล้ว (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
        <Kpi label="งานเข้ารอรับ" value={waiting} sub="งาน" tone="info" icon={<InboxIcon className="size-[15px]" strokeWidth={1.9} />} />
        <Kpi label="งานย่อยรอตรวจ" value={review} sub="งาน" tone="job" icon={<TasksIcon className="size-[15px]" strokeWidth={1.9} />} />
        <Kpi label="โปรเจคที่กำลังทำ" value={running} sub="โปรเจค" tone="won" icon={<ProjectIcon className="size-[15px]" strokeWidth={1.9} />} />
        <Kpi label="งานย่อยใกล้ครบกำหนด" value={soon} sub="งาน" tone="warn" icon={<ClockIcon className="size-[15px]" strokeWidth={1.9} />} />
        <Kpi label="งานย่อยล่าช้า" value={overdue} sub="งาน" tone="late" warn={overdue > 0} icon={<ClockIcon className="size-[15px]" strokeWidth={1.9} />} />
      </div>

      {/* ความคืบหน้า · งานเข้าใหม่ · ประเภทงานที่รับมากที่สุด — งานเข้าใหม่กับโดนัทกว้างเท่ากัน (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
        {/* ปุ่มดูเพิ่มเติมอยู่มุมขวาบนของกล่อง (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
        <Card
          title="ความคืบหน้าโปรเจค"
          right={(() => {
            const extra = projects.filter((p) => p.status === "running").length - PROJ_CAP;
            return extra > 0 ? (
              <Link href="/pm/projects" className="lnk flex-none text-[12.5px]">
                ดูเพิ่มเติม ({extra})
              </Link>
            ) : null;
          })()}
        >
          <ProjectProgress projects={projects} today={today} />
        </Card>

        <NewJobs inbox={pm.inbox} />

        <TopServices
          services={[
            ...projects.map((p) => p.service),
            ...pm.inbox.filter((j) => j.stage === "plan" && !projects.some((p) => p.pj === j.pj)).map((j) => j.service),
          ]}
        />
      </div>

      {/* ตารางสูงเท่าข้อมูล ไม่ยืดตามปฏิทินจนเหลือที่ว่าง (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DueTable open={open} />
        <MiniCalendar events={sc.events.filter((e) => !isPsEvent(e) && !isSalesEvent(e))} today={today} />
      </div>
    </div>
  );
}

/** ประเภทงานที่ PM รับมากที่สุด 5 อันดับ — นับจากโปรเจคที่รับแล้วทั้งหมด (ผู้ใช้สั่ง 8 ต.ค. 2569) */
/* โทนแดงอ่อน ไล่จากเข้ม (รับมากสุด) ไปจาง (รับน้อยสุด) (ผู้ใช้สั่ง 8 ต.ค. 2569) */
const TOP_COLORS = ["#DE4A57", "#E87580", "#F09DA5", "#F6C1C6", "#FADDE0"];
function TopServices({ services }: { services: string[] }) {
  const counts = new Map<string, number>();
  for (const k of services) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const all = top.reduce((n, [, c]) => n + c, 0) || 1;
  const R = 60;
  const C = 2 * Math.PI * R;
  let start = 0;
  const slices = top.map(([k, n], i) => {
    const len = (C * n) / all;
    const x = { k, n, len, start, color: TOP_COLORS[i] };
    start += len;
    return x;
  });
  return (
    <Card title="ประเภทงานที่รับมากที่สุด">
      {top.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">ยังไม่มีโปรเจค</p>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <span className="relative block size-[140px] flex-none">
            <svg viewBox="0 0 140 140" width="140" height="140" role="img" aria-label="ประเภทงานที่รับมากที่สุด">
              <circle cx="70" cy="70" r={R} fill="none" stroke="var(--muted)" strokeWidth="14" />
              {slices.map((x) => (
                <circle
                  key={x.k}
                  cx="70"
                  cy="70"
                  r={R}
                  fill="none"
                  stroke={x.color}
                  strokeWidth="14"
                  strokeDasharray={`${x.len.toFixed(2)} ${(C - x.len).toFixed(2)}`}
                  strokeDashoffset={(-x.start).toFixed(2)}
                  transform="rotate(-90 70 70)"
                >
                  <title>{`${serviceLabel(x.k)} ${x.n} โปรเจค`}</title>
                </circle>
              ))}
            </svg>
            <span className="absolute inset-0 flex flex-col items-center justify-center">
              <b className="num text-[22px] leading-none font-extrabold">{all}</b>
              <em className="text-[11.5px] text-muted-foreground not-italic">โปรเจค</em>
            </span>
          </span>
          <ul className="w-full space-y-2">
            {slices.map((x) => (
              <li key={x.k} className="flex items-center gap-2.5 text-[13px]">
                <i className="size-2.5 flex-none rounded-full" style={{ background: x.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate font-semibold">{serviceLabel(x.k)}</span>
                <b className="num font-bold">{x.n}</b>
                <em className="num w-10 text-right text-[12px] text-muted-foreground not-italic">
                  {Math.round((x.n * 100) / all)}%
                </em>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

/** งานเข้าใหม่ที่ยังไม่ได้รับเข้าโปรเจค — ตัวเลขใหญ่กับรายการสั้น ๆ ตามต้นแบบ */
function NewJobs({ inbox }: { inbox: ReturnType<typeof usePm>["inbox"] }) {
  const rows = [...inbox]
    .filter((j) => j.stage === "new")
    .sort((a, b) => b.sentAt.localeCompare(a.sentAt));
  const extra = Math.max(0, rows.length - INBOX_CAP);

  return (
    <Card title="งานเข้าใหม่">
      {/* แต่ละงานเป็นแถวของตัวเอง มีเลขลำดับ ชื่องาน และลูกค้า อ่านแยกกันออก (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
      <ul className="text-[13px]">
        {rows.length === 0 ? (
          <li className="text-muted-foreground">ไม่มีงานรอรับ</li>
        ) : (
          <>
            {rows.slice(0, INBOX_CAP).map((j, i) => (
              <li key={j.pj} className="flex items-start gap-2.5 border-t border-border py-2 first:border-t-0">
                <span className="num grid size-5 flex-none place-items-center rounded-full bg-muted text-[11px] font-bold text-muted-foreground">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13px] font-semibold">{j.scope}</b>
                  <em className="block truncate text-[11.5px] text-muted-foreground not-italic">{j.cus}</em>
                </span>
              </li>
            ))}
            {extra > 0 && <li className="border-t border-border pt-2 text-muted-foreground">และอีก {extra} รายการ</li>}
          </>
        )}
      </ul>
      <Link href="/pm/inbox" className="btn solid btn-solid mt-4 w-full justify-center" data-ceo-hide>
        ดูงานเข้าใหม่
      </Link>
    </Card>
  );
}

/** ปฏิทินนัดหมายย่อ — กดวันเพื่อดูนัดของวันนั้น ตามต้นแบบ */
function MiniCalendar({
  events,
  today,
}: {
  events: ReturnType<typeof useSchedule>["events"];
  today: string;
}) {
  const [cursor, setCursor] = useState(() => today.slice(0, 7));

  const [y, m] = cursor.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = first.getDay();
  const last = new Date(y, m, 0).getDate();

  const move = (step: number) => {
    const d = new Date(y, m - 1 + step, 1);
    setCursor(toIsoDate(d).slice(0, 7));
  };

  return (
    <Card title="นัดหมาย">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          className="iconbtn glass-thin size-7 rounded-lg max-sm:size-10"
          aria-label="เดือนก่อนหน้า"
          onClick={() => move(-1)}
        >
          ‹
        </button>
        <b className="text-[13px] font-bold">
          {TH_MONTHS_SHORT[m - 1]} {y + 543}
        </b>
        <button
          type="button"
          className="iconbtn glass-thin size-7 rounded-lg max-sm:size-10"
          aria-label="เดือนถัดไป"
          onClick={() => move(1)}
        >
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
          const n = eventsOn(events, iso).length;
          /* ปฏิทินเล็กบอกแค่วันกับจุดว่ามีนัด ไม่แสดงรายละเอียดนัด ซ้ำกับหน้าตารางงาน (ผู้ใช้สั่ง 8 ต.ค. 2569)
             วันหยุดบริษัทเลขสีแดง · เสาร์-อาทิตย์สีเทาอ่อน */
          const dow = new Date(y, m - 1, i + 1).getDay();
          const tone = isHoliday(iso)
            ? "text-destructive"
            : dow === 0 || dow === 6
              ? "text-muted-foreground/50"
              : "";
          return (
            <span
              key={iso}
              title={n ? `มีนัด ${n} รายการ` : undefined}
              className={`num flex aspect-square flex-col items-center justify-center gap-[3px] rounded-[9px] text-[12.5px] ${tone} ${
                iso === today ? "font-bold ring-1 ring-primary ring-inset" : ""
              }`}
            >
              {i + 1}
              <i className={`block size-[5px] rounded-full ${n ? "bg-primary" : "bg-transparent"}`} />
            </span>
          );
        })}
      </div>
    </Card>
  );
}

// ─── โครงร่างที่ใช้ซ้ำ ────────────────────────────────────────────

/*
 * สีแผ่นไอคอนของการ์ดสรุป — ชุดเดียวกับแดชบอร์ดขาย (dashboard-page.tsx)
 * ทุกแดชบอร์ดจะได้หน้าตาเดียวกัน คนที่สวมหลายบทบาทไม่ต้องเรียนรู้ใหม่
 */
const KPI_TONE = {
  won: "bg-[#ecfdf5] text-[#009767]",
  info: "bg-[#eff6ff] text-[#155dfc]",
  warn: "bg-[#fffbeb] text-[#b75000]",
  job: "bg-[#f3f0ff] text-[#7552db]",
  /* เลยกำหนดแล้ว — โทนแดง แยกจาก "ใกล้ครบกำหนด" ที่เป็นเหลือง จะได้ไม่อ่านสลับกัน */
  late: "bg-[#fef2f2] text-[#c0121f]",
};

function Kpi({
  label,
  value,
  sub,
  warn,
  tone,
  icon,
}: {
  label: string;
  value: number;
  sub: string;
  warn?: boolean;
  tone: keyof typeof KPI_TONE;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass flex h-full flex-col rounded-[18px] px-[18px] py-4 max-sm:px-3.5 max-sm:py-3">
      <span className="flex items-start justify-between gap-2.5">
        <em className="block text-xs text-muted-foreground not-italic">{label}</em>
        <i className={`grid size-[26px] shrink-0 place-items-center rounded-lg ${KPI_TONE[tone]}`}>
          {icon}
        </i>
      </span>
      <b className="num mt-[3px] block text-[26px] leading-[1.15] font-extrabold tracking-[-.02em]">{value}</b>
      <span
        className={`mt-1 block text-[11.5px] leading-normal ${
          warn ? "font-semibold text-destructive" : "text-muted-foreground"
        }`}
      >
        {sub}
      </span>
    </div>
  );
}

function Card({
  title,
  sub,
  right,
  children,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="glass min-w-0 rounded-[18px] px-5 py-[18px]">
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14.5px] font-bold">{title}</h2>
          {sub && <p className="mt-1 text-xs leading-[1.6] text-muted-foreground">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}
// ─── ความคืบหน้าแต่ละโปรเจค ────────────────────────────────────────

function ProjectProgress({ projects, today }: { projects: Project[]; today: string }) {
  /* สามโปรเจคที่รับมาล่าสุด — กล่องสูงคงที่เท่าสามแถวเสมอ ไม่หดหรือยืดตามจำนวน (ผู้ใช้สั่ง 8 ต.ค. 2569) */
  const all = [...projects].filter((p) => p.status === "running").sort((a, b) => b.start.localeCompare(a.start));
  const rows = all.slice(0, PROJ_CAP);
  const extra = all.length - rows.length;
  return (
    <div className="flex h-[300px] flex-col gap-[11px]">
      {rows.length === 0 && (
        <p className="grid flex-1 place-items-center text-[13px] text-muted-foreground">ยังไม่มีโปรเจคที่กำลังดำเนินการ</p>
      )}
      {rows.map((p) => {
        const pr = projectProgress(p);
        const left = daysBetween(today, p.due);
        const st =
          left < 0
            ? { cls: "text-destructive", text: `ล่าช้า ${Math.abs(left)} วัน` }
            : left <= SOON_DAYS
              ? { cls: "text-[var(--warning)]", text: "ใกล้ครบกำหนด" }
              : { cls: "text-[var(--success)]", text: "ตามแผน" };
        return (
          <Link
            key={p.pj}
            href={projectHref(p.pj)}
            className="flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-primary sm:gap-4 sm:px-4"
          >
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[13.5px] font-bold">{projName(p)}</b>
              <em className="block truncate text-[11.5px] text-muted-foreground not-italic">{p.cus}</em>
            </span>
            {/* ไม่มีกำหนดส่ง · แถบความคืบหน้าอยู่ติดเลขเปอร์เซ็นต์ (ผู้ใช้สั่ง 8 ต.ค. 2569) */}
            <span className="block h-1.5 w-[90px] flex-none overflow-hidden rounded-md bg-muted sm:w-[180px]">
              <i className="block h-full rounded-md" style={{ width: `${pr.pct}%`, background: pctColor(pr.pct) }} />
            </span>
            <span className="min-w-[76px] flex-none text-right">
              <b className="num block text-[16px] font-extrabold">{pr.pct}%</b>
            </span>
          </Link>
        );
      })}
    </div>
  );
}
// ─── งานที่ต้องติดตาม ─────────────────────────────────────────

/* ป้ายสถานะของงานหนึ่งแถว — งานที่ทีมส่งมาแล้วรอเราตรวจ ต้องไม่ขึ้นว่าทีมล่าช้า */
function dueTag(x: TaskRow) {
  if (x.t.status === "sent")
    return { cls: "t-early", text: x.left < 0 ? `รอเราตรวจ ${Math.abs(x.left)} วัน` : "รอเราตรวจ" };
  return x.left < 0
    ? { cls: "t-late", text: `ล่าช้า ${Math.abs(x.left)} วัน` }
    : { cls: "t-early", text: `เหลือ ${x.left} วัน` };
}

function DueTable({ open }: { open: TaskRow[] }) {
  /* ตามต้นแบบ: เฉพาะงานที่ล่าช้าหรือใกล้ครบกำหนด (ภายใน SOON_DAYS วัน) เรียงตามกำหนดส่ง
     แสดง DUE_CAP งาน ที่เหลือบอกเป็นแถว "และอีก N งาน" */
  const all = open.filter((x) => x.left <= SOON_DAYS).sort((a, b) => a.t.due.localeCompare(b.t.due));
  const rows = all.slice(0, DUE_CAP);
  const extra = all.length - rows.length;

  return (
    <section className="panel glass flex min-w-0 flex-col">
      <div className="strip">
        <h2 className="py-2.5 text-[14.5px] font-bold">งานที่ต้องติดตาม</h2>
      </div>
      {/* มือถือ: รายการสั้นแถวละงาน ชื่องานเด่น ข้อมูลรองอยู่บรรทัดล่าง สถานะชิดขวา
          แทนการ์ดที่มีป้ายกำกับห้าบรรทัดต่องาน ซึ่งยาวจนต้องเลื่อนหลายจอ */}
      <ul className="divide-y divide-border px-4 pb-2 sm:hidden">
        {rows.length === 0 ? (
          <li className="py-9 text-center text-[13px] text-muted-foreground">ไม่มีงานที่ต้องติดตาม</li>
        ) : (
          rows.map((x) => {
            const { p, t } = x;
            const tag = dueTag(x);
            const first = t.whos[0] ? memberName(t.whos[0]) : "ยังไม่มอบหมาย";
            return (
              <li key={`${p.pj}-${t.name}`} className="flex items-start gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <b className="block text-[13.5px] leading-snug font-semibold">{t.name}</b>
                  <em className="mt-0.5 block text-[11.5px] leading-snug text-muted-foreground not-italic">
                    {p.cus} · {first}
                  </em>
                </span>
                <span className="flex-none text-right">
                  <span className={`tag whitespace-nowrap ${tag.cls}`}>
                    <i />
                    {tag.text}
                  </span>
                  <em className="num mt-1 block text-[11px] text-muted-foreground not-italic">ส่ง {thaiDate(t.due)}</em>
                </span>
              </li>
            );
          })
        )}
        {extra > 0 && <li className="py-3 text-[12.5px] text-muted-foreground">และอีก {extra} งาน</li>}
      </ul>
      <div className="relative min-h-0 w-full flex-1 self-stretch overflow-hidden max-sm:hidden">
        {/* ตารางกว้างเท่ากรอบเสมอ ข้อความยาวตัดด้วย … ไม่ให้ล้นขอบหรือต้องเลื่อนข้าง */}
        <table className="data-table cards-sm w-full table-fixed">
          <thead>
            <tr>
              {/* วันที่กับป้ายเหลือกี่วันกว้างคงที่ (ตัดไม่ได้) คอลัมน์ข้อความแบ่งที่เหลือ */}
              <th style={{ width: "34%" }}>งาน</th>
              <th>โปรเจค</th>
              <th>ผู้รับผิดชอบ</th>
              <th className="c" style={{ width: 170 }}>
                สถานะ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-9 text-center text-muted-foreground">
                  ไม่มีงานที่ต้องติดตาม
                </td>
              </tr>
            ) : (
              rows.map((x) => {
                const { p, t } = x;
                const tag = dueTag(x);
                /* ตามต้นแบบ: แสดงผู้รับผิดชอบคนแรก ยังไม่มีคนขึ้นป้าย "ยังไม่มอบหมาย" */
                const first = t.whos[0] ? memberName(t.whos[0]) : "";
                const names = t.whos.map(memberName).join(" · ");
                return (
                  <tr key={`${p.pj}-${t.name}`}>
                    <td data-label="งาน" className="truncate" title={t.name}>
                      {t.name}
                    </td>
                    <td data-label="โปรเจค" className="truncate" title={p.cus}>
                      {p.cus}
                    </td>
                    <td data-label="ผู้รับผิดชอบ" className="muted truncate" title={names || undefined}>
                      {first || <span className="text-[12px] font-medium text-muted-foreground">ยังไม่มอบหมาย</span>}
                    </td>
                    <td data-label="สถานะ" className="c">
                      <span className={`tag whitespace-nowrap ${tag.cls}`}>
                        <i />
                        {tag.text}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
            {extra > 0 && (
              <tr>
                <td colSpan={4} className="text-[12.5px] text-muted-foreground">
                  และอีก {extra} งาน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
