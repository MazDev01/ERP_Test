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
} from "@/lib/pm-data";
import { colorOf, eventKind, eventsOn, isPsEvent, isSalesEvent } from "@/lib/pm-schedule-data";
import { useSchedule } from "@/lib/pm-schedule-store";
import { memberName, usePm } from "@/lib/pm-store";
import { ClockIcon, InboxIcon, ProjectIcon, TasksIcon } from "./icons";

/** งานย่อยหนึ่งใบพร้อมโปรเจคต้นทางและจำนวนวันที่เหลือ — ใช้ซ้ำหลายบล็อก จึงคิดครั้งเดียว */
type TaskRow = { p: Project; t: ProjectTask; left: number };

/** กี่วันข้างหน้าถึงนับว่า "ใกล้ครบกำหนด" — ตรงกับข้อความบนการ์ด */
const SOON_DAYS = 7;
/** งานเข้าใหม่แสดงกี่รายการในการ์ด มากกว่านี้บอกว่าเหลืออีกกี่รายการ */
const INBOX_CAP = 4;
/** โปรเจคในการ์ดความคืบหน้า — เกินนี้ขึ้นลิงก์ "ดูโปรเจค อีก N รายการ" ตามต้นแบบ */
const PROJ_CAP = 4;
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
      <div className="bar">
        <div>
          <h1>แดชบอร์ด</h1>
          <p>ภาพรวมงานที่ต้องดูแล</p>
        </div>
      </div>

      {/* มือถือ: การ์ดใบที่ห้าเหลือเดี่ยวอยู่แถวสุดท้าย ให้กินเต็มแถวแทนการเว้นช่องว่าง */}
      <div className="grid grid-cols-2 gap-3.5 max-sm:gap-2.5 max-sm:[&>*:last-child]:col-span-2 xl:grid-cols-5">
        <Kpi label="งานเข้ารอรับ" value={waiting} sub={waiting ? "รอ PM รับเข้าโปรเจค" : "รับครบแล้ว"} tone="info" icon={<InboxIcon className="size-[15px]" strokeWidth={1.9} />} />
        <Kpi
          label="งานย่อยรอตรวจ"
          tone="job"
          icon={<TasksIcon className="size-[15px]" strokeWidth={1.9} />}
          value={review}
          sub={
            review
              ? reviewLate
                ? `ทีมส่งมาแล้ว รอผลตรวจ · เลยกำหนดแล้ว ${reviewLate} งาน`
                : "ทีมส่งมาแล้ว รอผลตรวจ"
              : "ไม่มีงานรอตรวจ"
          }
          warn={reviewLate > 0}
        />
        <Kpi
          label="โปรเจคที่กำลังทำ"
          tone="won"
          icon={<ProjectIcon className="size-[15px]" strokeWidth={1.9} />}
          value={running}
          sub={
            doneWithOpen
              ? `จากทั้งหมด ${totalProjects} โปรเจค · ส่งมอบแล้วแต่มีงานค้าง ${doneWithOpen} โปรเจค`
              : `จากทั้งหมด ${totalProjects} โปรเจค`
          }
          warn={doneWithOpen > 0}
        />
        <Kpi label="งานย่อยใกล้ครบกำหนด" value={soon} sub={`ภายใน ${SOON_DAYS} วัน`} tone="warn" icon={<ClockIcon className="size-[15px]" strokeWidth={1.9} />} />
        <Kpi
          label="งานย่อยล่าช้า"
          tone="late"
          icon={<ClockIcon className="size-[15px]" strokeWidth={1.9} />}
          value={overdue}
          sub={overdue ? "เลยกำหนดส่ง และยังอยู่ที่ทีม" : "ไม่มีงานย่อยเลยกำหนดที่ทีม"}
          warn={overdue > 0}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title="ความคืบหน้าโปรเจค">
          <ProjectProgress projects={projects} today={today} />
        </Card>

        <NewJobs inbox={pm.inbox} />
      </div>

      <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <DueTable open={open} />
        <MiniCalendar events={sc.events.filter((e) => !isPsEvent(e) && !isSalesEvent(e))} today={today} />
      </div>
    </div>
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
      <p className="num text-[34px] leading-none font-extrabold">{rows.length}</p>
      <p className="mt-1 text-[12.5px] text-muted-foreground">รายการรอรับ</p>
      <ul className="mt-3.5 space-y-1.5 text-[13px]">
        {rows.length === 0 ? (
          <li className="text-muted-foreground">ไม่มีงานรอรับ</li>
        ) : (
          <>
            {rows.slice(0, INBOX_CAP).map((j) => (
              <li key={j.pj} className="truncate">
                {j.scope}
              </li>
            ))}
            {extra > 0 && <li className="text-muted-foreground">และอีก {extra} รายการ</li>}
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
  const [picked, setPicked] = useState(today);

  const [y, m] = cursor.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = first.getDay();
  const last = new Date(y, m, 0).getDate();
  const rows = eventsOn(events, picked);

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
          const on = iso === picked;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => setPicked(iso)}
              aria-pressed={on}
              aria-label={`${i + 1} ${n ? `มีนัด ${n} รายการ` : "ไม่มีนัด"}`}
              className={`num flex aspect-square flex-col items-center justify-center gap-[3px] rounded-[9px] text-[12.5px] ${
                on
                  ? "bg-primary font-semibold text-white"
                  : iso === today
                    ? "font-bold text-primary ring-1 ring-primary ring-inset"
                    : "hover:bg-muted"
              }`}
            >
              {i + 1}
              <i
                className={`block size-[5px] rounded-full ${
                  n ? (on ? "bg-white/90" : "bg-primary") : "bg-transparent"
                }`}
              />
            </button>
          );
        })}
      </div>

      <p className="mt-3 border-t border-border pt-2.5 text-[12.5px] font-semibold text-muted-foreground">
        {/* ตามต้นแบบ: แสดงวันที่อย่างเดียว ไม่ต่อท้ายจำนวนรายการ */}
        {thaiDate(picked)}
      </p>
      <ul className="mt-1">
        {rows.length === 0 ? (
          <li className="py-2 text-[12.5px] text-muted-foreground">ไม่มีนัดหมายในวันนี้</li>
        ) : (
          <>
            {rows.slice(0, CAL_CAP).map((e) => {
              const col = e.col ? colorOf(e.col).fg : eventKind(e.kind).dot;
              /* ตามต้นแบบ: ชื่อนัด · เวลาเริ่ม – จบ · สถานที่ (มีเมื่อกรอกไว้เท่านั้น) */
              return (
                <li key={e.id} className="flex gap-2.5 border-t border-border py-2 first:border-t-0">
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[12.5px] font-semibold">{e.title}</b>
                    <em className="num block text-[11px] text-muted-foreground not-italic">
                      {e.from} – {e.to}
                    </em>
                    {e.place && (
                      <em className="block truncate text-[11px] text-muted-foreground not-italic">{e.place}</em>
                    )}
                  </span>
                  <i className="mt-1 size-2 flex-none rounded-full" style={{ background: col }} />
                </li>
              );
            })}
            {rows.length > CAL_CAP && (
              <li className="border-t border-border pt-2.5">
                <Link href="/pm/schedule" className="lnk text-[12.5px]">
                  ดูตารางงาน อีก {rows.length - CAL_CAP} รายการ
                </Link>
              </li>
            )}
          </>
        )}
      </ul>
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
  const all = [...projects].filter((p) => p.status === "running").sort((a, b) => a.due.localeCompare(b.due));
  const rows = all.slice(0, PROJ_CAP);
  const extra = all.length - rows.length;
  if (rows.length === 0) {
    return <p className="py-9 text-center text-[13px] text-muted-foreground">ยังไม่มีโปรเจคที่กำลังดำเนินการ</p>;
  }
  return (
    <div className="flex flex-col gap-[11px]">
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
              <em className="block truncate text-[11.5px] text-muted-foreground not-italic">
                {p.cus}
                {/* จอแคบซ่อนคอลัมน์กำหนดส่ง ย้ายมาต่อท้ายชื่อลูกค้าแทน ชื่องานจะได้ไม่ถูกบีบ */}
                <span className="num sm:hidden"> · ส่ง {thaiDate(p.due)}</span>
              </em>
              <span className="mt-2 block h-1.5 w-full max-w-[220px] overflow-hidden rounded-md bg-muted">
                <i className="block h-full rounded-md bg-primary" style={{ width: `${pr.pct}%` }} />
              </span>
            </span>
            <span className="hidden w-[120px] flex-none sm:block">
              <em className="block text-[10.5px] text-muted-foreground not-italic">กำหนดส่ง</em>
              <span className="num text-[12.5px]">{thaiDate(p.due)}</span>
            </span>
            <span className="min-w-[76px] flex-none text-right">
              <b className="num block text-[16px] font-extrabold">{pr.pct}%</b>
              <em className={`block text-[11px] font-semibold not-italic ${st.cls}`}>{st.text}</em>
            </span>
          </Link>
        );
      })}
      {extra > 0 && (
        <Link href="/pm/projects" className="lnk self-start text-[12.5px]">
          ดูโปรเจค อีก {extra} รายการ
        </Link>
      )}
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
      <div className="relative min-h-0 flex-1 overflow-hidden max-sm:hidden">
        {/* ตารางกว้างเท่ากรอบเสมอ ข้อความยาวตัดด้วย … ไม่ให้ล้นขอบหรือต้องเลื่อนข้าง */}
        <table className="data-table cards-sm w-full table-fixed">
          <thead>
            <tr>
              {/* วันที่กับป้ายเหลือกี่วันกว้างคงที่ (ตัดไม่ได้) คอลัมน์ข้อความแบ่งที่เหลือ */}
              <th style={{ width: "34%" }}>งาน</th>
              <th>โปรเจค</th>
              <th>ผู้รับผิดชอบ</th>
              <th style={{ width: 118 }}>กำหนดส่ง</th>
              <th className="c" style={{ width: 116 }}>
                สถานะ
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-9 text-center text-muted-foreground">
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
                    <td data-label="กำหนดส่ง" className="num muted whitespace-nowrap">
                      {thaiDate(t.due)}
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
                <td colSpan={5} className="text-[12.5px] text-muted-foreground">
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
