"use client";

/*
 * แดชบอร์ดของผู้จัดการทั่วไป — ตามต้นแบบ gm-dashboard.html (21 ต.ค. 2569) เลย์เอาต์ 3 คอลัมน์
 *   แถวบน: การ์ดตัวเลข 4 ใบ (รออนุมัติ · มาทำงานวันนี้ · โปรเจคช้ากว่าแผน · OT)
 *   คอลัมน์ A: รออนุมัติ → ความคืบหน้าโปรเจคเทียบแผน
 *   คอลัมน์ B: การเข้างานวันนี้ → การทำงานรายคน
 *   คอลัมน์ C: ปฏิทิน → OT ที่อนุมัติแล้ว (เส้น) → ค่าน้ำมันที่อนุมัติแล้ว (แท่ง)
 * ข้อมูลน้อยก็ยึดเลย์เอาต์เดิม การ์ดไม่ยุบ ขึ้นข้อความว่างแทน
 *
 *   รออนุมัติ        — useGmPending (คิวเดียวกับหน้า /approvals ไม่รวมใบของ GM เอง)
 *   การเข้างานวันนี้  — useTodayAttendance (ตอกบัตรวันนี้ + วันลาที่อนุมัติแล้ว) ชุดเดียวกับแดชบอร์ด CEO
 *   ปฏิทิน          — นัดหมายในตารางงาน (pm-schedule-store) ที่ยังไม่ยกเลิก
 *   โปรเจคเทียบแผน    — โปรเจคที่กำลังทำ งานเสร็จ/ทั้งหมด เทียบเวลาที่ผ่านไปจากวันเริ่มถึงวันส่งมอบ
 *   การทำงานรายคน    — งานที่ยังไม่เสร็จในโปรเจคที่กำลังทำ แยกตามผู้รับงาน
 *   OT              — useApprovedOt ตามช่วงที่เลือก
 *   ค่าน้ำมัน         — useGmApprovedTravel (ค่าน้ำมันในใบเบิกที่ GM อนุมัติแล้ว) ตามช่วงที่เลือก
 *                      ไม่มีค่าคอมมิชชั่น — CEO เป็นผู้อนุมัติ ไม่ใช่ GM (ผู้ใช้สั่ง 20 ต.ค. 2569)
 *
 * ตัวเลือกช่วง เดือนนี้ · ไตรมาส · ปีนี้ แบบเดียวกับแดชบอร์ดฝ่ายขาย (rangeOf / bucketsOf ของ sales-report)
 *   มีผลกับ OT (การ์ดตัวเลข + กราฟ) และกราฟค่าน้ำมัน · เดือนนี้แบ่งรายสัปดาห์ ไตรมาส/ปีนี้แบ่งรายเดือน
 *   รออนุมัติ การเข้างาน ปฏิทิน โปรเจค ภาระงาน เป็นสถานะปัจจุบัน ไม่ขึ้นกับช่วง
 */

import "@/styles/gm-dashboard.css";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type ReactNode } from "react";
import {
  ApproveIcon,
  CalendarIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  ProjectIcon,
  TeamIcon,
  UsersIcon,
} from "@/components/icons";
import { displayName } from "@/lib/emp-name";
import { daysBetween, parseIsoDate, TH_MONTHS_SHORT, toIsoDate, todayIso } from "@/lib/format";
import { useApprovedOt, useGmApprovedTravel, useGmPending, type GmPending } from "@/lib/gm-data";
import { HR_LEAVE_LABEL, hrPos } from "@/lib/hr-data";
import { useTodayAttendance } from "@/lib/hr-link";
import { useHr } from "@/lib/hr-store";
import { projectHref, projectProgress } from "@/lib/pm-data";
import { endOf } from "@/lib/pm-schedule-data";
import { useSchedule } from "@/lib/pm-schedule-store";
import { usePm } from "@/lib/pm-store";
import { bucketsOf, RANGE_LABEL, rangeOf, type RangeKey } from "@/lib/sales-report";

/* ================= ค่าที่ปรับได้ ================= */
/** คำขอค้างเกินกี่วันถึงขึ้นสีแดง */
const STALE_DAYS = 7;
/** จำนวนแถวสูงสุดต่อการ์ด — ตามต้นแบบ */
const LIMIT = { approvals: 3, projects: 4, people: 6 };
/* ลิงก์จริงที่ GM เปิดได้ (canVisit) — การเข้างานกับตารางงานไปปฏิทินทีมของ GM (GM ไม่มีหน้าสรุปเวลาของฝ่ายบุคคล และเปิด /pm/schedule ไม่ได้)
   ⚠️ ต้นแบบมีปุ่ม "ดูรายตำแหน่ง" ไปหน้าทีมตามตำแหน่ง แต่ระบบยังไม่มีหน้านั้นสำหรับ GM — ใช้หน้ามอบหมายงานไปก่อน */
const LINKS = {
  approvals: "/approvals",
  attendance: "/gm/calendar",
  projects: "/pm/projects",
  assign: "/pm/plan",
  schedule: "/gm/calendar",
};

const TH_WEEKDAY = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];
type Tab = "all" | "leave" | "other";
const TAB_MATCH: Record<Tab, (k: GmPending["kind"]) => boolean> = {
  all: () => true,
  leave: (k) => k === "leave",
  other: (k) => k !== "leave",
};
const TABS: [Tab, string][] = [
  ["all", "ทั้งหมด"],
  ["leave", "ลา"],
  ["other", "OT และเบิก"],
];

const RANGES: RangeKey[] = ["m", "q", "y"];
/** คำบอกช่วงบนการ์ด — ช่วงที่เลือก / ช่วงก่อนหน้าไว้เทียบ */
const PERIOD: Record<RangeKey, { now: string; prev: string }> = {
  m: { now: "เดือนนี้", prev: "เดือนก่อน" },
  q: { now: "ไตรมาสนี้", prev: "ไตรมาสก่อน" },
  y: { now: "ปีนี้", prev: "ปีก่อน" },
};

/** สีเส้น OT ตามต้นแบบ */
const OT_COLOR = "#EA5A12";

const num = (n: number) => Number(n).toLocaleString("th-TH");
const hrs = (n: number) => `${num(Math.round(n * 10) / 10)} ชม.`;
const clampPct = (n: number) => Math.max(0, Math.min(100, n));
/** แกน y — เริ่มที่ 0 ปัดค่าสูงสุดขึ้นเป็นเลขกลม แบ่ง 3–4 ช่อง (ไม่มีข้อมูลก็ยังขึ้นแกน 0–4) */
function niceScale(max: number): { top: number; ticks: number[] } {
  const m = max > 0 ? max : 4;
  const rough = m / 4;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const top = Math.ceil(m / step - 1e-9) * step;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => Math.round(i * step * 100) / 100);
  return { top, ticks };
}
/** ยอดเงินแบบย่อบนแกน — ฿0 · ฿850 · ฿1.5k · ฿12k */
function bahtShort(n: number) {
  if (n >= 1e6) return `฿${Math.round((n / 1e6) * 10) / 10}M`;
  if (n >= 1e3) return `฿${Math.round((n / 1e3) * 10) / 10}k`;
  return `฿${Math.round(n)}`;
}
/** "2026-09-21" → "21 ก.ย." */
function short(iso: string) {
  const d = parseIsoDate(iso);
  return `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}`;
}
/** ป้ายแกน x แบบสั้น — รายสัปดาห์ "1–7 ต.ค." เหลือ "1–7" ตามต้นแบบ · รายเดือนคงเดิม */
const axisLabel = (label: string) => label.replace(/\s.*$/, "");
function detailOf(r: GmPending) {
  if (r.kind === "leave" && r.from) {
    const to = r.to ?? r.from;
    return `${r.what} ${to !== r.from ? `${short(r.from)} – ${short(to)}` : short(r.from)}`;
  }
  if (r.kind === "ot" && r.date) return `${r.what} ${short(r.date)}`;
  return r.what;
}

/** เส้นโค้งแบบ monotone — ไม่พุ่งเกินจุดข้อมูล (พอร์ตจาก smoothPath ของต้นแบบ) */
function smoothPath(pts: [number, number][]) {
  const n = pts.length;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0][0]} ${pts[0][1]}`;
  const dx: number[] = [];
  const sl: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0];
    sl[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  m[0] = sl[0];
  m[n - 1] = sl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = sl[i - 1] * sl[i] <= 0 ? 0 : (sl[i - 1] + sl[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (sl[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / sl[i];
    const b = m[i + 1] / sl[i];
    let t = a * a + b * b;
    if (t > 9) {
      t = 3 / Math.sqrt(t);
      m[i] = t * a * sl[i];
      m[i + 1] = t * b * sl[i];
    }
  }
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    d += `C${f(pts[i][0] + dx[i] / 3)} ${f(pts[i][1] + (m[i] * dx[i]) / 3)} ${f(pts[i + 1][0] - dx[i] / 3)} ${f(pts[i + 1][1] - (m[i + 1] * dx[i]) / 3)} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`;
  }
  return d;
}

/*
 * อนิเมชันตอนเปิดหน้า (ผู้ใช้สั่ง 21 ต.ค. 2569) — การ์ดค่อย ๆ ขึ้นทีละใบ แท่ง/เส้นกราฟค่อย ๆ วาด ตัวเลขนับขึ้น
 * เล่นครั้งเดียวตอนเข้าหน้า: คลาส gmd-intro อยู่บนหน้าแค่ช่วงแรก เปลี่ยนช่วงเวลาแล้วไม่เล่นซ้ำ
 * คนที่ตั้งเครื่องให้ลดการเคลื่อนไหวไม่เห็นอนิเมชัน (CSS prefers-reduced-motion + reducedMotion())
 */
const INTRO_MS = 2600;
const COUNT_MS = 900;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useIntro() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = window.setTimeout(() => setOn(false), INTRO_MS);
    return () => window.clearTimeout(id);
  }, []);
  return on;
}

/** ตัวเลขนับขึ้นจาก 0 ครั้งเดียวตอนเปิดหน้า — ค่าเปลี่ยนทีหลัง (เปลี่ยนช่วงเวลา) ขึ้นค่าใหม่ทันที */
function CountUp({ value }: { value: number }) {
  const [shown, setShown] = useState(value);
  const played = useRef(false);
  useEffect(() => {
    if (played.current) {
      setShown(value);
      return;
    }
    played.current = true;
    if (reducedMotion() || value === 0) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / COUNT_MS);
      const ease = 1 - Math.pow(1 - p, 3);
      setShown(p < 1 ? Math.round(value * ease * 10) / 10 : value);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  /* ระหว่างนับ ค่าที่เป็นจำนวนเต็มแสดงเป็นจำนวนเต็ม ไม่โผล่ทศนิยม */
  return <>{num(Number.isInteger(value) ? Math.round(shown) : shown)}</>;
}

/** ขนาดจริงของกล่องกราฟ — วาด SVG ตามพิกเซลจริง ตัวหนังสือไม่ยืด */
function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/* ================= ป้ายลอย (tooltip) ================= */
type TipText = { title: string; lines: string[] };
type TipBind = (title: string, ...lines: string[]) => {
  onMouseEnter: (e: RMouseEvent<Element>) => void;
  onMouseMove: (e: RMouseEvent<Element>) => void;
  onMouseLeave: () => void;
};
/* ข้อความเปลี่ยนเฉพาะตอนเข้า/ออก ส่วนตำแหน่งขยับผ่าน DOM ตรง ๆ ไม่ render ทั้งหน้าทุกครั้งที่เมาส์ขยับ */
function useTip(): [TipBind, ReactNode] {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState<TipText | null>(null);
  const move = (e: RMouseEvent<Element>) => {
    const el = ref.current;
    if (!el) return;
    let x = e.clientX + 14;
    const w = el.offsetWidth;
    if (x + w > window.innerWidth - 8) x = e.clientX - w - 14;
    el.style.left = `${x}px`;
    el.style.top = `${e.clientY + 14}px`;
  };
  const bind: TipBind = (title, ...lines) => ({
    onMouseEnter: (e) => {
      setText({ title, lines });
      move(e);
    },
    onMouseMove: move,
    onMouseLeave: () => setText(null),
  });
  const node = (
    <div ref={ref} className="gmd-tip" role="tooltip" hidden={!text}>
      {text && (
        <>
          <b>{text.title}</b>
          {text.lines.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </>
      )}
    </div>
  );
  return [bind, node];
}

/* ================= ชิ้นส่วนการ์ด ================= */
function CardHead({ icon, title, btn }: { icon: ReactNode; title: string; btn?: { label: string; href: string } }) {
  return (
    <div className="gmd-ch">
      <span className="gmd-ch-ic">{icon}</span>
      <h2 className="gmd-ch-t">{title}</h2>
      {btn && (
        <Link className="gmd-btn-o" href={btn.href}>
          {btn.label}
        </Link>
      )}
    </div>
  );
}

function Kpi({ href, tint, icon, label, value, small, sub, warn, valueClass }: {
  href: string;
  tint: "red" | "blue" | "amber" | "purple";
  icon: ReactNode;
  label: string;
  value: number;
  small?: string;
  sub: string;
  warn?: boolean;
  valueClass?: string;
}) {
  return (
    <Link className="gmd-card gmd-kpi" href={href}>
      <span className={`gmd-kpi-ic gmd-tint-${tint}`}>{icon}</span>
      <span className="gmd-kpi-body">
        <span className="gmd-kpi-lbl">{label}</span>
        <span className={`gmd-kpi-val${valueClass ? ` ${valueClass}` : ""}`}>
          <CountUp value={value} />
          {small && <small>{small}</small>}
        </span>
        <span className={`gmd-kpi-sub${warn ? " gmd-warn" : ""}`}>{sub}</span>
      </span>
      <span className="gmd-kpi-go">
        <ChevronRightIcon />
      </span>
    </Link>
  );
}

/** กราฟเส้น OT — เส้นโค้ง monotone + พื้นไล่สีจาง · ชี้แล้วขึ้นป้ายค่าเหนือจุด (ค่าเริ่มต้น = จุดล่าสุด) */
function MiniLine({ data, label }: { data: { label: string; v: number | null }[]; label: string }) {
  const [ref, { w: W, h: H }] = useBox<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const L = 10;
  const Rr = 10;
  const T = 22;
  const B = 18;
  const pw = Math.max(1, W - L - Rr);
  const ph = Math.max(1, H - T - B);
  const base = T + ph;
  const real = data.flatMap((d) => (d.v === null ? [] : [d.v]));
  const max = Math.max(0, ...real) * 1.15 || 1;
  const n = data.length;
  const step = n > 1 ? pw / (n - 1) : 0;
  const xOf = (i: number) => (n > 1 ? L + step * i : L + pw / 2);
  const pts = data.flatMap((d, i) => (d.v === null ? [] : [{ x: xOf(i), y: base - (d.v / max) * ph, i, v: d.v }]));
  const line = smoothPath(pts.map((p) => [p.x, p.y]));
  const k = active ?? pts.length - 1;
  const pt = pts[k];
  const pill = pt ? hrs(pt.v) : "";
  const tw = pill.length * 6 + 16;
  const px = pt ? Math.max(1, Math.min(W - tw - 1, pt.x - tw / 2)) : 0;
  const py = pt ? Math.max(0, pt.y - 24) : 0;
  const onMove = (e: RMouseEvent<SVGRectElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const mx = ((e.clientX - r.left) * W) / Math.max(1, r.width);
    let best = 0;
    for (let j = 1; j < pts.length; j++) if (Math.abs(pts[j].x - mx) < Math.abs(pts[best].x - mx)) best = j;
    setActive(best);
  };
  return (
    <div ref={ref} className="gmd-chart">
      {W > 0 && H > 0 && pts.length > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
          <defs>
            <linearGradient id="gmdOtFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={OT_COLOR} stopOpacity={0.22} />
              <stop offset="100%" stopColor={OT_COLOR} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path className="gmd-area" d={`${line}L${pts[pts.length - 1].x.toFixed(1)} ${base}L${pts[0].x.toFixed(1)} ${base}Z`} fill="url(#gmdOtFill)" />
          <line x1={L} x2={W - Rr} y1={base} y2={base} stroke="var(--gmd-axis)" />
          {data.map((d, i) => (
            <g key={`${d.label}-${i}`}>
              <line x1={xOf(i)} x2={xOf(i)} y1={base + 1} y2={base + 4} stroke="var(--gmd-tick)" />
              <text className="gmd-ax-x" x={xOf(i)} y={H - 2} textAnchor={n === 1 ? "middle" : i === 0 ? "start" : i === n - 1 ? "end" : "middle"}>
                {axisLabel(d.label)}
              </text>
            </g>
          ))}
          {/* pathLength=1 ให้ CSS วาดเส้นจากซ้ายไปขวาได้โดยไม่ต้องรู้ความยาวจริง */}
          <path className="gmd-line-draw" pathLength={1} d={line} fill="none" stroke={OT_COLOR} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {pt && (
            <g className="gmd-pop">
              <line x1={pt.x} x2={pt.x} y1={pt.y + 5} y2={base} stroke="var(--gmd-tick)" />
              <circle cx={pt.x} cy={pt.y} r={4} fill={OT_COLOR} stroke="#fff" strokeWidth={2} />
              <g transform={`translate(${px.toFixed(1)} ${py.toFixed(1)})`}>
                <rect rx={8} ry={8} width={tw} height={17} fill="#fff" stroke="var(--gmd-axis)" />
                <text className="gmd-pill-t" x={tw / 2} y={12} textAnchor="middle">{pill}</text>
              </g>
            </g>
          )}
          <rect x={0} y={0} width={W} height={H} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setActive(null)}>
            {pt && <title>{`${data[pt.i].label} ${pill}`}</title>}
          </rect>
        </svg>
      )}
    </div>
  );
}

/** กราฟแท่งค่าน้ำมัน — แท่งมุมบนมน + ป้ายแกน y เป็นบาท */
function MiniBars({ data, label, tip }: { data: { label: string; v: number }[]; label: string; tip: TipBind }) {
  const [ref, { w: W, h: H }] = useBox<HTMLDivElement>();
  const L = 34;
  const Rr = 4;
  const T = 4;
  const B = 14;
  const pw = Math.max(1, W - L - Rr);
  const ph = Math.max(1, H - T - B);
  const scale = niceScale(Math.max(0, ...data.map((d) => d.v)));
  const n = Math.max(1, data.length);
  const slot = pw / n;
  const bw = Math.min(30, slot * 0.55);
  return (
    <div ref={ref} className="gmd-chart">
      {W > 0 && H > 0 && (
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
          {scale.ticks.map((t) => {
            const y = T + ph - (t / scale.top) * ph;
            return (
              <g key={t}>
                <line x1={L} x2={W - Rr} y1={y} y2={y} stroke="var(--gmd-line-soft)" />
                <text className="gmd-ax" x={L - 6} y={y + 3} textAnchor="end">{bahtShort(t)}</text>
              </g>
            );
          })}
          {data.map((d, i) => (
            <text key={`l${d.label}`} className="gmd-ax" x={L + slot * i + slot / 2} y={H - 2} textAnchor="middle">
              {axisLabel(d.label)}
            </text>
          ))}
          {data.map((d, i) => {
            if (d.v <= 0) return null;
            const h = (d.v / scale.top) * ph;
            const x = L + slot * i + (slot - bw) / 2;
            const yTop = T + ph - h;
            const r = Math.min(4, h);
            return (
              <path key={`b${d.label}`} className="gmd-bar" style={{ animationDelay: `${0.75 + i * 0.08}s` }} fill="var(--gmd-blue)"
                d={`M${x} ${T + ph}V${yTop + r}Q${x} ${yTop} ${x + r} ${yTop}H${x + bw - r}Q${x + bw} ${yTop} ${x + bw} ${yTop + r}V${T + ph}Z`} />
            );
          })}
          {data.map((d, i) => (
            <rect key={`h${d.label}`} x={L + slot * i} y={T} width={slot} height={ph} fill="transparent"
              {...tip(d.label, `${num(Math.round(d.v))} บาท`)} />
          ))}
        </svg>
      )}
    </div>
  );
}

export function GmDashboardPage() {
  const today = todayIso();
  const TODAY = parseIsoDate(today);
  const pm = usePm();
  const hr = useHr();
  const sc = useSchedule();
  const pending = useGmPending();
  const att = useTodayAttendance();
  const [tip, tipNode] = useTip();
  const intro = useIntro();
  /* ================= ช่วงเวลา ================= */
  const [range, setRange] = useState<RangeKey>("m");
  const span = useMemo(() => rangeOf(range, parseIsoDate(today)), [range, today]);
  const prevSpan = useMemo(() => rangeOf(range, parseIsoDate(today), 1), [range, today]);
  const buckets = useMemo(() => bucketsOf(span), [span]);
  /* ช่วงย่อยของกราฟ + ช่วงก่อนหน้าทั้งก้อนต่อท้าย ไว้เทียบในการ์ดตัวเลข */
  const otSpans = useMemo(() => [...buckets, { from: prevSpan.from, to: prevSpan.to }], [buckets, prevSpan]);
  const otAll = useApprovedOt(otSpans);
  const travel = useGmApprovedTravel(buckets);
  const period = PERIOD[range];

  /* ================= คิวอนุมัติ ================= */
  const [tab, setTab] = useState<Tab>("all");
  const queue = useMemo(
    () =>
      pending
        .map((a) => ({ key: a.key, name: a.name, detail: detailOf(a), kind: a.kind, age: Math.max(0, daysBetween(a.at.slice(0, 10), today)) }))
        .sort((a, b) => b.age - a.age),
    [pending, today],
  );
  const staleCount = queue.filter((q) => q.age > STALE_DAYS).length;
  const apRows = queue.filter((q) => TAB_MATCH[tab](q.kind));

  /* ================= การเข้างาน ================= */
  const A = useMemo(() => {
    const c = { total: att.length, present: 0, late: 0, onLeave: 0, notIn: 0, leaveNames: [] as string[] };
    for (const a of att) {
      if (a.state === "ontime") c.present++;
      else if (a.state === "late") c.late++;
      else if (a.state === "leave") {
        c.onLeave++;
        const kind = "leave" in a && a.leave ? HR_LEAVE_LABEL[a.leave as keyof typeof HR_LEAVE_LABEL] : undefined;
        c.leaveNames.push(kind ? `${displayName(a.e)} (${kind})` : displayName(a.e));
      } else c.notIn++;
    }
    return c;
  }, [att]);
  const R = 54;
  const C = 2 * Math.PI * R;
  /* ช่องว่างระหว่างส่วนของวงโดนัท */
  const GAP = 2;
  const parts = [
    { v: A.present, c: "var(--gmd-ok)", label: "มาแล้ว" },
    { v: A.late, c: "var(--gmd-amber)", label: "มาสาย" },
    { v: A.onLeave, c: "var(--gmd-blue)", label: "ลา" },
    { v: A.notIn, c: "var(--gmd-idle)", label: "ยังไม่เข้างาน" },
  ];
  const partSum = Math.max(1, A.total, parts.reduce((s, p) => s + p.v, 0));
  const donutOffs = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + (p.v / partSum) * C, 0));

  /* ================= ปฏิทิน ================= */
  const [calCursor, setCalCursor] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  /* จำนวนนัดหมายต่อวัน (นัดหลายวันนับทุกวันที่คาบ) */
  const eventCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of sc.events) {
      if (e.cancel) continue;
      for (let d = e.date, n = 0; d <= endOf(e) && n < 366; n++) {
        map.set(d, (map.get(d) ?? 0) + 1);
        const x = parseIsoDate(d);
        d = toIsoDate(new Date(x.getFullYear(), x.getMonth(), x.getDate() + 1));
      }
    }
    return map;
  }, [sc.events]);
  const cy = calCursor.getFullYear();
  const cm = calCursor.getMonth();
  const calLead = new Date(cy, cm, 1).getDay();
  const calDays = new Date(cy, cm + 1, 0).getDate();

  /* ================= โปรเจคเทียบแผน ================= */
  const running = useMemo(() => pm.projects.filter((p) => p.status === "running"), [pm.projects]);
  const projects = useMemo(() => {
    const t = parseIsoDate(today).getTime();
    return running
      .map((p) => {
        const pr = projectProgress(p);
        const donePct = pr.all > 0 ? clampPct((pr.done / pr.all) * 100) : 0;
        /* โปรเจคที่ยังไม่มีแผน (ไม่มีวันเริ่ม/ส่งมอบ) ยังไม่มีเวลาให้เทียบ */
        let timePct = 0;
        if (p.start && p.due) {
          const s = parseIsoDate(p.start).getTime();
          const e = parseIsoDate(p.due).getTime();
          timePct = e > s ? clampPct(((t - s) / (e - s)) * 100) : 100;
        }
        return { key: p.pj, href: projectHref(p.pj), name: p.name || p.cus, client: p.cus, done: pr.done, total: pr.all, donePct, timePct, behind: donePct < timePct, gap: timePct - donePct };
      })
      .sort((a, b) => b.gap - a.gap);
  }, [running, today]);
  const behindCount = projects.filter((p) => p.behind).length;
  const projRest = projects.length - LIMIT.projects;

  /* ================= การทำงานรายคน ================= */
  const workload = useMemo(() => {
    const byId = new Map(hr.emp.map((e) => [e.id, e]));
    const map = new Map<string, { open: number; overdue: number }>();
    /* งานนอกโปรเจคที่ PM อนุมัติแล้วเป็นภาระของคนนั้นด้วย — แต่ไม่นับเป็นโปรเจค */
    for (const t of [...running.flatMap((p) => p.tasks), ...(pm.loose ?? [])]) {
      if (t.status === "done") continue;
      for (const id of t.whos) {
        const w = map.get(id) ?? { open: 0, overdue: 0 };
        w.open++;
        if (t.due && t.due < today) w.overdue++;
        map.set(id, w);
      }
    }
    return [...map.entries()]
      .flatMap(([id, w]) => {
        const e = byId.get(id);
        /* ไม่โชว์รหัสพนักงาน — หาในทะเบียนไม่เจอก็ข้าม */
        return e ? [{ id, name: displayName(e), pos: hrPos(e.pos).label, ...w }] : [];
      })
      .sort((a, b) => b.open - a.open || b.overdue - a.overdue);
  }, [running, pm.loose, hr.emp, today]);
  const loadMax = Math.max(1, ...workload.map((w) => w.open));
  const loadRest = workload.length - LIMIT.people;

  /* ================= OT ================= */
  /* ช่วงย่อยที่ยังไม่ถึงไม่มีจุด ไม่ลากเส้นเป็นศูนย์ล่วงหน้า */
  const ot = buckets.map((b, i) => ({ label: b.label, v: b.from > today ? null : (otAll[i] ?? 0) }));
  const otThis = Math.round(ot.reduce((s, d) => s + (d.v ?? 0), 0) * 100) / 100;
  const otPrev = otAll[buckets.length] ?? 0;

  /* ================= ค่าน้ำมัน ================= */
  const fuel = buckets.map((b, i) => ({ label: b.label, v: travel[i] ?? 0 }));

  return (
    <div className={`gmd-page${intro ? " gmd-intro" : ""}`}>
      {/* หัวหน้า + ตัวเลือกช่วงเวลา แบบเดียวกับแดชบอร์ดฝ่ายขาย/CEO (ผู้ใช้สั่ง 20 ต.ค. 2569) */}
      <div className="gmd-head">
        <div>
          <h1 className="gmd-h1">แดชบอร์ด</h1>
          <span className="gmd-h1-line" aria-hidden="true" />
        </div>
        <div className="tools max-sm:w-full">
          <div className="seg max-sm:w-full max-sm:[&>button]:!h-10 max-sm:[&>button]:!text-[14px]" role="group" aria-label="ช่วงเวลา">
            {RANGES.map((r) => (
              <button key={r} type="button" className={range === r ? "on" : ""} aria-pressed={range === r} onClick={() => setRange(r)}>
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ================= การ์ดตัวเลข ================= */}
      <div className="gmd-kpis">
        <Kpi href={LINKS.approvals} tint="red" icon={<ApproveIcon />} label="รออนุมัติ" value={queue.length}
          sub={staleCount > 0 ? `ค้างเกิน ${STALE_DAYS} วัน ${num(staleCount)} รายการ` : `ไม่มีรายการค้างเกิน ${STALE_DAYS} วัน`} warn={staleCount > 0} />
        <Kpi href={LINKS.attendance} tint="blue" icon={<UsersIcon />} label="มาทำงานวันนี้" value={A.present + A.late} small={`จาก ${num(A.total)}`}
          sub={`ลา ${num(A.onLeave)} คน`} />
        <Kpi href={LINKS.projects} tint="amber" icon={<ProjectIcon />} label="โปรเจคช้ากว่าแผน" value={behindCount} valueClass={behindCount > 0 ? "gmd-late" : undefined}
          sub={`จาก ${num(projects.length)} โปรเจคที่กำลังทำ`} />
        <Kpi href={LINKS.approvals} tint="purple" icon={<ClockIcon />} label={`OT ${period.now}`} value={otThis} small="ชม."
          sub={`${period.prev} ${hrs(otPrev)}`} />
      </div>

      <div className="gmd-grid">
        {/* ================= คอลัมน์ A ================= */}
        <div className="gmd-col gmd-col-a">
          <section className="gmd-card gmd-h-apv">
            <CardHead icon={<ApproveIcon />} title="รออนุมัติ" btn={{ label: "ดูทั้งหมด", href: LINKS.approvals }} />
            <div className="gmd-cb">
              <div className="gmd-tabs" role="tablist" aria-label="ประเภทคำขอ">
                {TABS.map(([key, label]) => (
                  <button key={key} type="button" className="gmd-tab" role="tab" aria-selected={key === tab} onClick={() => setTab(key)}>
                    {label} {num(queue.filter((q) => TAB_MATCH[key](q.kind)).length)}
                  </button>
                ))}
              </div>
              <ul className="gmd-apv-list">
                {apRows.length === 0 && (
                  <li>
                    <p className="gmd-empty">ไม่มีคำขอรออนุมัติ</p>
                  </li>
                )}
                {apRows.slice(0, LIMIT.approvals).map((r) => (
                  <li key={r.key}>
                    <Link className="gmd-apv-row" href={LINKS.approvals}>
                      <span className="gmd-apv-main">
                        <span className="gmd-apv-name">{r.name}</span>
                        <span className="gmd-apv-det">{r.detail}</span>
                      </span>
                      <span className={`gmd-apv-age${r.age > STALE_DAYS ? " gmd-old" : ""}`}>{r.age === 0 ? "วันนี้" : `${num(r.age)} วันก่อน`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {apRows.length > LIMIT.approvals && (
                <Link className="gmd-more" href={LINKS.approvals}>
                  ดูเพิ่มเติม (อีก {num(apRows.length - LIMIT.approvals)} รายการ)
                  <ChevronDownIcon />
                </Link>
              )}
            </div>
          </section>

          <section className="gmd-card gmd-h-prj">
            <CardHead icon={<ProjectIcon />} title="ความคืบหน้าโปรเจคเทียบแผน"
              btn={{ label: projRest > 0 ? `อีก ${num(projRest)} โปรเจค` : "ดูโปรเจค", href: LINKS.projects }} />
            <div className="gmd-cb">
              <div className="gmd-legend">
                <span><i className="gmd-sw" style={{ background: "var(--gmd-ok)" }} />งานเสร็จ ตามแผน</span>
                <span><i className="gmd-sw" style={{ background: "var(--gmd-late)" }} />งานเสร็จ ช้ากว่าแผน</span>
                <span><i className="gmd-sw-mark" />เวลาที่ผ่านไป</span>
              </div>
              <ul className="gmd-prj-list">
                {projects.length === 0 && (
                  <li>
                    <p className="gmd-empty">ไม่มีโปรเจคที่กำลังทำ</p>
                  </li>
                )}
                {projects.slice(0, LIMIT.projects).map((p) => (
                  <li key={p.key}>
                    <Link className="gmd-prj" href={p.href} {...tip(p.name, `งานเสร็จ ${Math.round(p.donePct)}%`, `เวลาผ่านไป ${Math.round(p.timePct)}%`)}>
                      <span className="gmd-prj-n">
                        <span className="gmd-prj-t">{p.name}</span>
                        <span className="gmd-prj-c">{p.client}</span>
                      </span>
                      <span className="gmd-prj-bar" role="img" aria-label={`งานเสร็จ ${Math.round(p.donePct)}% เวลาผ่านไป ${Math.round(p.timePct)}%`}>
                        <span className={`gmd-prj-fill${p.behind ? " gmd-behind" : ""}`} style={{ width: `${p.donePct}%` }} />
                        <span className="gmd-prj-mark" style={{ left: `${p.timePct}%` }} />
                      </span>
                      <span className="gmd-prj-s">
                        <span className={`gmd-prj-st${p.behind ? " gmd-late" : " gmd-ok"}`}>{p.behind ? "ช้ากว่าแผน" : "ตามแผน"}</span>
                        <span className="gmd-prj-cnt">{num(p.done)} จาก {num(p.total)} งาน</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>

        {/* ================= คอลัมน์ B ================= */}
        <div className="gmd-col">
          <section className="gmd-card gmd-h-att">
            <CardHead icon={<UsersIcon />} title="การเข้างานวันนี้" btn={{ label: "ทั้งหมด", href: LINKS.attendance }} />
            <div className="gmd-cb gmd-cb-top">
              <div className="gmd-donut-wrap">
                <svg width={128} height={128} viewBox="0 0 128 128" role="img" aria-label="สัดส่วนการเข้างานวันนี้">
                  {A.total === 0 && <circle cx={64} cy={64} r={R} fill="none" stroke="var(--gmd-track)" strokeWidth={14} />}
                  {parts.map((p, i) => {
                    if (!p.v) return null;
                    const len = Math.max(0, (p.v / partSum) * C - GAP);
                    return (
                      <circle key={p.label} cx={64} cy={64} r={R} fill="none" stroke={p.c} strokeWidth={14}
                        strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-donutOffs[i]} transform="rotate(-90 64 64)"
                        {...tip(p.label, `${num(p.v)} คน`)} />
                    );
                  })}
                </svg>
                <div className="gmd-donut-c">
                  <div className="gmd-donut-n">{num(A.present + A.late)}</div>
                  <div className="gmd-donut-s">จาก {num(A.total)} คน</div>
                </div>
              </div>
              <ul className="gmd-leg">
                {parts.map((p) => (
                  <li key={p.label}>
                    <i style={{ background: p.c }} />
                    {p.label}
                    <b>{num(p.v)}</b>
                  </li>
                ))}
              </ul>
              <Link className="gmd-att-foot" href={LINKS.attendance}>
                <span>
                  <span className="gmd-lbl">ลาวันนี้</span>
                  <span className="gmd-val">{A.leaveNames.length ? A.leaveNames.join(" และ ") : "ไม่มี"}</span>
                </span>
                <ChevronRightIcon />
              </Link>
            </div>
          </section>

          <section className="gmd-card gmd-card-sm gmd-h-wl">
            <CardHead icon={<TeamIcon />} title="การทำงานรายคน" btn={{ label: "มอบหมายงาน", href: LINKS.assign }} />
            <div className="gmd-cb">
              <div className="gmd-legend">
                <span><i className="gmd-sw" style={{ background: "var(--gmd-open)" }} />งานค้าง</span>
                <span><i className="gmd-sw" style={{ background: "var(--gmd-late)" }} />เลยกำหนด</span>
              </div>
              <ul className="gmd-wl">
                {workload.length === 0 && (
                  <li>
                    <p className="gmd-empty">ยังไม่มีงานที่มอบหมาย</p>
                  </li>
                )}
                {workload.slice(0, LIMIT.people).map((w) => (
                  <li key={w.id} {...tip(w.name, `งานค้าง ${num(w.open)} งาน`, `เลยกำหนด ${num(w.overdue)} งาน`)}>
                    <span className="gmd-wl-n">
                      <span className="gmd-wl-name">{w.name}</span>
                      <span className="gmd-wl-pos">{w.pos}</span>
                    </span>
                    <span className="gmd-wl-bar" role="img" aria-label={`งานค้าง ${w.open} เลยกำหนด ${w.overdue}`}>
                      <span className="gmd-wl-open" style={{ width: `${(w.open / loadMax) * 100}%` }} />
                      {w.overdue > 0 && (
                        <span className="gmd-wl-late" style={{ left: `${((w.open - w.overdue) / loadMax) * 100}%`, width: `${(w.overdue / loadMax) * 100}%` }} />
                      )}
                    </span>
                    <span className="gmd-wl-c">{num(w.open)} งาน</span>
                  </li>
                ))}
              </ul>
              {loadRest > 0 && (
                <Link className="gmd-wl-more" href={LINKS.assign}>
                  อีก {num(loadRest)} คน
                </Link>
              )}
            </div>
          </section>
        </div>

        {/* ================= คอลัมน์ C ================= */}
        <div className="gmd-col">
          <section className="gmd-card gmd-h-cal">
            <CardHead icon={<CalendarIcon />} title="ปฏิทิน" btn={{ label: "ตารางงาน", href: LINKS.schedule }} />
            <div className="gmd-cb gmd-cb-top">
              <div className="gmd-cal-nav">
                <button type="button" className="gmd-cal-btn" aria-label="เดือนก่อน" onClick={() => setCalCursor(new Date(cy, cm - 1, 1))}>
                  <ChevronLeftIcon />
                </button>
                <span className="gmd-cal-m">{TH_MONTHS_SHORT[cm]} {cy + 543}</span>
                <button type="button" className="gmd-cal-btn" aria-label="เดือนถัดไป" onClick={() => setCalCursor(new Date(cy, cm + 1, 1))}>
                  <ChevronRightIcon />
                </button>
              </div>
              <div className="gmd-cal">
                {TH_WEEKDAY.map((w) => (
                  <span key={w} className="gmd-cal-wd">{w}</span>
                ))}
                {Array.from({ length: calLead }, (_, i) => (
                  <span key={`b${i}`} />
                ))}
                {Array.from({ length: calDays }, (_, i) => {
                  const iso = toIsoDate(new Date(cy, cm, i + 1));
                  const n = eventCount.get(iso) ?? 0;
                  const isToday = iso === today;
                  const cls = `gmd-cal-d${isToday ? " gmd-today" : n > 0 ? " gmd-ev" : ""}`;
                  /* วันที่มีนัดกดไปตารางงานได้ (หน้าตารางงานของ GM ยังไม่รับวันที่ผ่าน URL จึงเปิดเดือนปัจจุบัน) */
                  return (
                    <span key={iso}>
                      {n > 0 ? (
                        <Link className={cls} href={LINKS.schedule} title={`นัดหมาย ${num(n)} รายการ`}>{i + 1}</Link>
                      ) : (
                        <span className={cls}>{i + 1}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="gmd-card gmd-h-ot">
            <div className="gmd-mini">
              <h2 className="gmd-mini-t">OT ที่อนุมัติแล้ว{period.now}</h2>
              <span className="gmd-lbl gmd-mt3">{period.now}</span>
              <span className="gmd-mini-v">{hrs(otThis)}</span>
              <span className="gmd-lbl">{period.prev} {hrs(otPrev)}</span>
              <MiniLine data={ot} label={`ชั่วโมง OT ที่อนุมัติแล้ว${period.now}`} />
            </div>
          </section>

          <section className="gmd-card gmd-h-fuel">
            <div className="gmd-mini">
              <h2 className="gmd-mini-t">ค่าน้ำมันที่อนุมัติแล้ว{period.now}</h2>
              <MiniBars data={fuel} label={`ค่าน้ำมันที่อนุมัติแล้ว${period.now}`} tip={tip} />
            </div>
          </section>
        </div>
      </div>
      {tipNode}
    </div>
  );
}
