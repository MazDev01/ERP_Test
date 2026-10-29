"use client";

/*
 * ประสิทธิภาพพนักงาน — หน้ารายคนแบบเต็มหน้า /gm/performance/<รหัส> (ผู้ใช้สั่ง 26 ต.ค. 2569)
 * เข้าจากปุ่ม "ดูรายละเอียดเพิ่มเติม" ในส่วนที่กางของหน้ารายชื่อ · ช่วงเวลาอยู่ใน ?r= ซิงก์กับตัวเลือกช่วง
 *
 * จัดวางตามต้นแบบของเจ้าของ gm-performance-person.html (ผู้ใช้สั่ง 26 ต.ค. 2569) — กริด 12 คอลัมน์ ระยะ 24px การ์ดขาวไม่ซ้อนการ์ด
 *   หัว (c12) · การ์ดสรุป 5 ใบ (c12) · การส่งงานรายเดือน (c8) + งานล่าช้า (c4) · งานที่ได้รับมอบหมาย (c12)
 *   การเข้างาน + ปฏิทินรายวัน (c8) + การลา (c4) · KPI (c6) + เปลี่ยนแปลงจากช่วงก่อนหน้า (c6) · ความประพฤติ (c12)
 *   คนที่ไม่มีงานโปรเจคเลย ซ่อน 3 การ์ดของงาน และการ์ดสรุปเปลี่ยนเป็นเรื่องเวลาทำงาน
 * ตัวเลขทุกตัวมาจาก emp-performance.ts ข้อมูลจริงของระบบ — ไม่ใช้ข้อมูลสมมติของต้นแบบ (พนักงาน วันหยุด กะ 09–18 KPI)
 * กฎเจ้าของ: บนจอมีแค่ชื่อรายการ + ตัวเลข + สถานะ ห้ามโชว์สูตร นิยาม เกณฑ์ หรือหมายเหตุของระบบ
 * ความประพฤติ: ระบบยังไม่มีที่บันทึก จึงขึ้นสถานะว่าง ห้ามสร้างข้อมูลขึ้นเอง
 * ไม่โชว์รหัสพนักงาน — ใช้ชื่อ/ชื่อเล่น
 */

import "@/styles/gm-dashboard.css";
import "@/styles/gm-performance.css";
import Link from "next/link";
import { useMemo, type CSSProperties, type ReactNode } from "react";
import { ChevronLeftIcon } from "@/components/icons";
import { EmpPhoto, PERIOD_TEXT, RangeSeg, useRangeParam } from "@/components/gm-performance-page";
import { useCrumb } from "@/lib/crumb";
import { displayName } from "@/lib/emp-name";
import {
  approvedLeaveRows,
  KPI_IS_MOCK,
  LEAVE_STATE_LABEL,
  lastMonths,
  leaveLines,
  leaveQuota,
  leaveRequests,
  netLateDays,
  perfOf,
  perfPeople,
  prevSpanOf,
  rangeKeyOf,
  roleLeaveOf,
  spanOf,
  taskAllRows,
  taskExtra,
  taskSum,
  usePerfSources,
  useEmpPhotos,
  VERDICT_LABEL,
  type AttDay,
  type AttDayKind,
  type LeaveState,
  type Span,
  type TaskRow,
} from "@/lib/emp-performance";
import { fmtLeaveHours } from "@/lib/leave-data";
import { parseIsoDate, thaiDate, todayIso, TH_MONTHS_SHORT } from "@/lib/format";
import { HR_EMPTYPE, hrDept, hrPos } from "@/lib/hr-data";
import { TASK_STATUS, type TaskStatus } from "@/lib/pm-data";
import { rangeOf } from "@/lib/sales-report";

const num = (n: number) => Number(n).toLocaleString("th-TH");
const WEEKDAY = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const dayText = (iso: string) => `${WEEKDAY[parseIsoDate(iso).getDay()]} ${thaiDate(iso)}`;
const inSpan = (iso: string | null | undefined, s: Span) => Boolean(iso && iso.slice(0, 10) >= s.from && iso.slice(0, 10) <= s.to);
/** จำนวนการลาเป็นข้อความ — ไม่มี = "0 วัน" */
const leaveAmt = (h: number) => (h > 0 ? fmtLeaveHours(h) : "0 วัน");

/** ช่วงวันที่สั้น ๆ — ปีเดียวกันพิมพ์ปีครั้งเดียว */
function spanText(s: Span) {
  if (s.from === s.to) return thaiDate(s.from);
  const a = parseIsoDate(s.from);
  if (s.from.slice(0, 4) === s.to.slice(0, 4)) return `${a.getDate()} ${TH_MONTHS_SHORT[a.getMonth()]} – ${thaiDate(s.to)}`;
  return `${thaiDate(s.from)} – ${thaiDate(s.to)}`;
}

/** อายุงานจากวันเริ่มงานถึงวันนี้ */
function tenure(start: string, today: string) {
  if (!start || start > today) return "—";
  const a = parseIsoDate(start);
  const b = parseIsoDate(today);
  let mo = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
  if (b.getDate() < a.getDate()) mo--;
  const y = Math.floor(Math.max(0, mo) / 12);
  const m = Math.max(0, mo) % 12;
  if (y && m) return `${y} ปี ${m} เดือน`;
  if (y) return `${y} ปี`;
  return `${m} เดือน`;
}

type ChipTone = "ok" | "warn" | "bad" | "leave" | "off" | "cnt";
const Chip = ({ tone, children }: { tone: ChipTone; children: ReactNode }) => <span className={`gpd-chip gpd-${tone}`}>{children}</span>;

function Card({ cls, title, sub, extra, children }: { cls: string; title: string; sub?: ReactNode; extra?: ReactNode; children: ReactNode }) {
  return (
    <section className={`gpd-card ${cls}`}>
      <div className="gpd-ch">
        <div>
          <h2 className="gpd-t">{title}</h2>
          {sub && <div className="gpd-s">{sub}</div>}
        </div>
        {extra}
      </div>
      {children}
    </section>
  );
}

/** รายการความสูงคงที่ เลื่อนภายใน — มีมากกว่าที่เห็นจึงจางขอบล่าง */
function Scroll({ rows, cap, rowH, children }: { rows: number; cap: number; rowH: number; children: ReactNode }) {
  return (
    <div className={`gpd-scroll${rows > cap ? " gpd-fade" : ""}`}>
      <div className="gpd-scroll-in" style={{ maxHeight: cap * rowH }}>
        {children}
      </div>
    </div>
  );
}

function SumCard({ label, value, unit, cap }: { label: string; value: ReactNode; unit?: string; cap: ReactNode }) {
  return (
    <div className="gpd-scard">
      <div className="gpd-scard-l">{label}</div>
      <div className="gpd-scard-v">
        {value}
        {unit && <span className="gpd-scard-u">{unit}</span>}
      </div>
      <div className="gpd-scard-c">{cap}</div>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: ReactNode; unit: string }) {
  return (
    <div>
      <div className="gpd-stat-l">{label}</div>
      <div className="gpd-stat-v">
        {value}
        <small>{unit}</small>
      </div>
    </div>
  );
}

const STATUS_TONE: Record<TaskStatus, ChipTone> = { todo: "off", doing: "off", sent: "warn", revise: "bad", wait: "leave", done: "ok" };
const LEAVE_TONE: Record<LeaveState, ChipTone> = { approved: "leave", pending: "warn", rejected: "off" };

/* ================= กราฟแท่งซ้อนรายเดือน ================= */
type MonthBar = { key: string; label: string; on: number; late: number };

function TrendChart({ months }: { months: MonthBar[] }) {
  const W = 600;
  const H = 220;
  const x0 = 16;
  const x1 = 584;
  const y0 = 26;
  const y1 = 186;
  const bw = 44;
  const step = (x1 - x0) / Math.max(1, months.length);
  const max = Math.max(1, ...months.map((m) => m.on + m.late));
  return (
    <svg className="gpd-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={months.map((m) => `${m.label} ตรงเวลา ${m.on} ช้า ${m.late}`).join(" · ")}>
      <line x1={x0} y1={y1} x2={x1} y2={y1} className="gpd-axis" />
      {months.map((m, i) => {
        const cx = x0 + step * (i + 0.5);
        const hOn = ((y1 - y0) * m.on) / max;
        const hLate = ((y1 - y0) * m.late) / max;
        return (
          <g key={m.key}>
            {hOn > 0 && (
              <rect x={cx - bw / 2} y={y1 - hOn} width={bw} height={hOn} rx={4} className="gpd-bar-ok">
                <title>{`${m.label} ตรงเวลา ${m.on} งาน`}</title>
              </rect>
            )}
            {hLate > 0 && (
              <rect x={cx - bw / 2} y={y1 - hOn - hLate} width={bw} height={hLate} rx={4} className="gpd-bar-late">
                <title>{`${m.label} ช้า ${m.late} งาน`}</title>
              </rect>
            )}
            <text x={cx} y={y1 - hOn - hLate - 8} textAnchor="middle" className="gpd-bar-v">
              {m.on + m.late}
            </text>
            <text x={cx} y={y1 + 22} textAnchor="middle" className="gpd-bar-x">
              {m.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================= ปฏิทินการเข้างานรายวัน (คอลัมน์ = สัปดาห์ · แถว = จ.–ศ.) ================= */
const HEAT_CLS: Record<AttDayKind, string> = {
  ok: "ok",
  late: "late",
  early: "early",
  lateEarly: "le",
  leave: "lv",
  none: "no",
  holiday: "hol",
};

function dayTip(x: AttDay) {
  const d = dayText(x.d);
  if (x.kind === "leave") return `${d} ${x.label ?? "ลา"}`;
  if (x.kind === "holiday") return `${d} ${x.label || "วันหยุด"}`;
  if (x.kind === "none") return `${d} ไม่มีบันทึกเวลา`;
  return `${d} เข้า ${x.in ?? "—"} ออก ${x.out ?? "—"}`;
}

function Heat({ days, from, to }: { days: AttDay[]; from: string; to: string }) {
  const map = new Map(days.map((x) => [x.d, x]));
  const start = parseIsoDate(from);
  /* ถอยไปวันจันทร์ของสัปดาห์แรก */
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const weeks: { key: string; month: string; cells: { iso: string; cls: string; tip?: string }[] }[] = [];
  let lastM = -1;
  for (const d = new Date(start); ; d.setDate(d.getDate() + 7)) {
    const mon = new Date(d);
    const monIso = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    if (monIso > to) break;
    const cells: { iso: string; cls: string; tip?: string }[] = [];
    let firstIn = -1;
    for (let i = 0; i < 5; i++) {
      const c = new Date(mon);
      c.setDate(c.getDate() + i);
      const iso = `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}-${String(c.getDate()).padStart(2, "0")}`;
      if (iso < from || iso > to) {
        cells.push({ iso, cls: "out" });
        continue;
      }
      if (firstIn < 0) firstIn = c.getMonth();
      const x = map.get(iso);
      cells.push(x ? { iso, cls: HEAT_CLS[x.kind], tip: dayTip(x) } : { iso, cls: "", tip: dayText(iso) });
    }
    const m = firstIn < 0 ? mon.getMonth() : firstIn;
    weeks.push({ key: monIso, month: m !== lastM ? TH_MONTHS_SHORT[m] : "", cells });
    lastM = m;
  }
  const size = weeks.length <= 8 ? 22 : weeks.length <= 16 ? 16 : 12;
  return (
    <div className="gpd-heat" style={{ "--hc": `${size}px`, "--hg": "3px" } as CSSProperties}>
      <div className="gpd-hdays" aria-hidden="true">
        <span>จ</span>
        <span>อ</span>
        <span>พ</span>
        <span>พฤ</span>
        <span>ศ</span>
      </div>
      <div className="gpd-hweeks">
        {weeks.map((w) => (
          <div key={w.key} className="gpd-hw">
            <span className="gpd-hm">{w.month}</span>
            {w.cells.map((c) => (
              <span key={c.iso} className={`gpd-hc ${c.cls}`} title={c.tip} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const HEAT_LEGEND: [string, string][] = [
  ["ok", "ตรงเวลา"],
  ["late", "มาสาย"],
  ["early", "ออกก่อนเวลา"],
  ["le", "มาสายและออกก่อน"],
  ["lv", "ลา"],
  ["no", "ไม่มีบันทึกเวลา"],
  ["hol", "วันหยุด"],
];

/* ================= เปรียบเทียบกับช่วงก่อนหน้า ================= */
type Cmp = { name: string; a: number | null; b: number | null; unit: string; higherBetter: boolean; dec?: boolean };

function cmpText(v: number | null, c: Cmp) {
  if (v == null) return "—";
  const s = c.dec ? v.toFixed(1) : num(v);
  return c.unit === "%" ? `${s}%` : `${s} ${c.unit}`;
}

export function GmPerformanceDetail({ id, initialRange }: { id: string; initialRange?: string }) {
  const today = todayIso();
  const src = usePerfSources();
  const photos = useEmpPhotos();
  const [range, setRange] = useRangeParam(rangeKeyOf(initialRange));
  const span = useMemo(() => spanOf(range, today), [range, today]);
  const prev = useMemo(() => prevSpanOf(range, today), [range, today]);
  const note = useMemo(() => rangeOf(range, parseIsoDate(today)).note, [range, today]);
  /* เปิดได้เฉพาะคนที่อยู่ในรายชื่อ (ทำงานอยู่ ไม่ใช่ผู้บริหาร) */
  const e = useMemo(() => perfPeople(src.hr.emp).find((x) => x.id === id), [src.hr.emp, id]);
  /* หน้ารายชื่อรับเฉพาะ ?r= (ยังไม่มีช่องจำคนที่เลือก) */
  const backHref = `/gm/performance${range === "m" ? "" : `?r=${range}`}`;
  useCrumb(e ? displayName(e) : "ไม่พบพนักงาน");

  const p = useMemo(() => (e ? perfOf(src, e, span, today) : null), [src, e, span, today]);
  const pp = useMemo(() => (e ? perfOf(src, e, prev, today) : null), [src, e, prev, today]);
  const all = useMemo(() => (e ? taskAllRows(src.homes, e.id, today) : []), [src.homes, e, today]);
  const ext = useMemo(() => taskExtra(all, span), [all, span]);
  const extPrev = useMemo(() => taskExtra(all, prev), [all, prev]);
  const approved = useMemo(() => (e ? approvedLeaveRows(src, e.id) : []), [src, e]);
  const leave = useMemo(
    () => (e ? leaveLines(e, approved, roleLeaveOf(src.leave, e.id), src.reqs, src.hr.internLeave ?? [], span) : []),
    [src, e, approved, span],
  );
  const quota = useMemo(() => (e ? leaveQuota(e, approved, today) : null), [e, approved, today]);
  const requests = useMemo(
    () => (e ? leaveRequests(e, approved, roleLeaveOf(src.leave, e.id), src.reqs, src.hr.internLeave ?? [], span) : []),
    [src, e, approved, span],
  );
  const months: MonthBar[] = useMemo(
    () =>
      e
        ? lastMonths(today, 6).map((m) => {
            const s = taskSum(src.homes, e.id, m, today);
            const d = parseIsoDate(m.from);
            return { key: m.from, label: TH_MONTHS_SHORT[d.getMonth()], on: s.onTime, late: s.late };
          })
        : [],
    [src.homes, e, today],
  );

  if (!e || !p || !pp || !quota) {
    return (
      <div className="gmd-page gpf-page">
        <Link className="gpf-back" href={backHref}>
          <ChevronLeftIcon /> รายชื่อพนักงาน
        </Link>
        <p className="gpf-empty">ไม่พบพนักงานคนนี้ในรายชื่อ</p>
      </div>
    );
  }

  const pos = hrPos(e.pos);
  const pt = PERIOD_TEXT[range];
  const { task, att, kpi } = p;
  const hasTasks = all.length > 0;
  const leaveHours = leave.filter((l) => l.state === "approved").reduce((s, l) => s + l.hours, 0);
  const leaveDays = Math.round((leaveHours / 8) * 100) / 100;

  /* งานล่าช้า — ค้างเลยกำหนดตอนนี้ + ส่งช้าในช่วงนี้ เรียงช้ามากไปน้อย */
  const lateList = [
    ...all.filter((r) => r.status !== "done" && !r.first && r.verdict === "late").map((r) => ({ r, over: true, d: netLateDays(r) })),
    ...task.rows.filter((r) => r.first && r.verdict === "late").map((r) => ({ r, over: false, d: netLateDays(r) })),
  ].sort((x, y) => y.d - x.d);
  const waitTotal = task.rows.reduce((s, r) => s + r.waitDays, 0);

  /* ตารางงาน — งานที่ครบกำหนด/ส่ง/ปิดในช่วงนี้ + งานที่ยังไม่ปิดทุกใบ */
  const taskRows = all
    .filter((r) => inSpan(r.due, span) || r.status !== "done" || inSpan(r.first, span) || inSpan(r.doneAt, span))
    .sort((a, b) => b.due.localeCompare(a.due) || a.name.localeCompare(b.name));
  const result = (r: TaskRow): ReactNode => {
    if (r.verdict === "ontime") return "ตรงเวลา";
    if (r.verdict === "waited") return VERDICT_LABEL.waited;
    if (r.verdict === "late") return <span className="gpd-red">{r.first ? "ช้า" : "เลยกำหนด"} {num(netLateDays(r))} วัน</span>;
    return "—";
  };

  /* มาสาย/ออกก่อนเวลา รายวัน ใหม่ไปเก่า */
  const attEvents = att.days.filter((x) => x.kind === "late" || x.kind === "early" || x.kind === "lateEarly").sort((a, b) => b.d.localeCompare(a.d));
  const heatTo = span.to > today ? today : span.to;

  const cmp: Cmp[] = [
    ...(hasTasks
      ? [
          { name: "ส่งงานตรงเวลา", a: pp.task.pct, b: task.pct, unit: "%", higherBetter: true },
          { name: "รอบแก้เฉลี่ย", a: extPrev.avgRounds, b: ext.avgRounds, unit: "รอบ", higherBetter: false, dec: true },
        ]
      : []),
    { name: "เข้างานตรงเวลา", a: pp.att.pct, b: att.pct, unit: "%", higherBetter: true },
    { name: "มาสาย", a: pp.att.worked ? pp.att.late.length : null, b: att.worked ? att.late.length : null, unit: "ครั้ง", higherBetter: false },
    { name: "ออกก่อนเวลา", a: pp.att.worked ? pp.att.early.length : null, b: att.worked ? att.early.length : null, unit: "ครั้ง", higherBetter: false },
  ];

  const kpiMax = Math.max(kpi.actual, kpi.target) * 1.25 || 1;
  const kpiOk = kpi.actual >= kpi.target;

  return (
    <div className="gmd-page gpf-page">
      <Link className="gpf-back" href={backHref}>
        <ChevronLeftIcon /> รายชื่อพนักงาน
      </Link>

      <div className="gpd-grid">
        {/* ================= หัว ================= */}
        <section className="gpd-card gpd-c12 gpd-head">
          <EmpPhoto e={e} url={photos[e.id]} size="lg" />
          <div className="gpd-who">
            <h1 className="gpd-nick">{displayName(e)}</h1>
            {e.nick?.trim() && <div className="gpd-name">{e.name}</div>}
            <dl className="gpd-dl">
              <div>
                <dt>ตำแหน่ง</dt>
                <dd>{pos.label}</dd>
              </div>
              <div>
                <dt>แผนก</dt>
                <dd>{hrDept(pos.dept).label}</dd>
              </div>
              <div>
                <dt>ประเภทการจ้าง</dt>
                <dd>{HR_EMPTYPE[e.type].label}</dd>
              </div>
              <div>
                <dt>เริ่มงาน</dt>
                <dd>{thaiDate(e.startedAt)}</dd>
              </div>
              <div>
                <dt>อายุงาน</dt>
                <dd>{tenure(e.startedAt, today)}</dd>
              </div>
            </dl>
          </div>
          <div className="gpd-per">
            <RangeSeg value={range} onChange={setRange} />
            <div className="gpd-range">{note}</div>
          </div>
        </section>

        {/* ================= การ์ดสรุป 5 ใบ ================= */}
        <div className="gpd-c12 gpd-cards">
          {hasTasks ? (
            <>
              <SumCard
                label="ส่งงานตรงเวลา"
                value={task.pct ?? "—"}
                unit={task.pct != null ? "%" : undefined}
                cap={task.denom ? `${num(task.onTime)} จาก ${num(task.denom)} งาน` : `ไม่มีงานที่ครบกำหนด${pt}`}
              />
              <SumCard label="งานเสร็จ" value={num(ext.done)} unit="งาน" cap={pt} />
              <SumCard label="รอบแก้เฉลี่ย" value={ext.avgRounds == null ? "—" : ext.avgRounds.toFixed(1)} unit={ext.avgRounds == null ? undefined : "รอบ"} cap={pt} />
              <SumCard label="ค้างอยู่ตอนนี้" value={num(ext.openNow)} unit="งาน" cap={`เลยกำหนด ${num(ext.overNow)} งาน`} />
            </>
          ) : (
            <>
              <SumCard label="มาสาย" value={att.hasSource ? num(att.late.length) : "—"} unit={att.hasSource ? "ครั้ง" : undefined} cap={att.hasSource ? `รวม ${num(att.lateMin)} นาที` : "ยังไม่มีข้อมูลการเข้างาน"} />
              <SumCard label="ออกก่อนเวลา" value={att.hasSource ? num(att.early.length) : "—"} unit={att.hasSource ? "ครั้ง" : undefined} cap={pt} />
              <SumCard label="วันลา" value={num(leaveDays)} unit="วัน" cap="อนุมัติแล้ว" />
              <SumCard label="ไม่มีบันทึกเวลา" value={att.hasSource ? num(att.noRecord.length) : "—"} unit={att.hasSource ? "วัน" : undefined} cap={pt} />
            </>
          )}
          <SumCard
            label="เข้างานตรงเวลา"
            value={att.pct ?? "—"}
            unit={att.pct != null ? "%" : undefined}
            cap={att.worked ? `${num(att.onTime)} จาก ${num(att.worked)} วัน` : att.hasSource ? `ไม่มีวันที่ลงเวลา${pt}` : "ยังไม่มีข้อมูลการเข้างาน"}
          />
        </div>

        {hasTasks && (
          <>
            {/* ================= การส่งงานรายเดือน ================= */}
            <Card
              cls="gpd-c8"
              title="การส่งงานรายเดือน"
              sub={months.length ? `${TH_MONTHS_SHORT[parseIsoDate(months[0].key).getMonth()]} ${parseIsoDate(months[0].key).getFullYear() + 543} – ${TH_MONTHS_SHORT[parseIsoDate(months[months.length - 1].key).getMonth()]} ${parseIsoDate(months[months.length - 1].key).getFullYear() + 543}` : undefined}
              extra={
                <div className="gpd-legend">
                  <span>
                    <i className="gpd-lg-ok" />
                    ตรงเวลา
                  </span>
                  <span>
                    <i className="gpd-lg-late" />
                    ช้า
                  </span>
                </div>
              }
            >
              <TrendChart months={months} />
            </Card>

            {/* ================= งานล่าช้า ================= */}
            <Card cls="gpd-c4" title="งานล่าช้า" extra={<Chip tone="cnt">{num(lateList.length)} งาน</Chip>}>
              {lateList.length === 0 ? (
                <div className="gpd-none">ไม่มีงานล่าช้า{pt}</div>
              ) : (
                <Scroll rows={lateList.length} cap={4} rowH={62}>
                  {lateList.map(({ r, over, d }) => (
                    <div key={r.key} className="gpd-lrow">
                      <div>
                        <div className="gpd-lt">{r.name}</div>
                        <div className="gpd-ls">{r.project}</div>
                      </div>
                      <div className="gpd-lr">{over ? <Chip tone="bad">เลยกำหนด {num(d)} วัน</Chip> : <Chip tone="warn">ส่งช้า {num(d)} วัน</Chip>}</div>
                    </div>
                  ))}
                </Scroll>
              )}
              <div className="gpd-foot">
                <span className="gpd-foot-l">วันที่รอลูกค้าหรือรอข้อมูล</span>
                <span className="gpd-foot-v">{num(waitTotal)} วัน</span>
              </div>
            </Card>

            {/* ================= งานที่ได้รับมอบหมาย ================= */}
            <Card cls="gpd-c12" title="งานที่ได้รับมอบหมาย" extra={<Chip tone="cnt">{num(taskRows.length)} งาน</Chip>}>
              {taskRows.length === 0 ? (
                <div className="gpd-none">ไม่มีงาน{pt}</div>
              ) : (
                <Scroll rows={taskRows.length} cap={8} rowH={50}>
                  <table className="gpd-tbl">
                    <thead>
                      <tr>
                        <th>งาน</th>
                        <th>โปรเจค</th>
                        <th>กำหนดส่ง</th>
                        <th>ส่งครั้งแรก</th>
                        <th>ผลการส่ง</th>
                        <th className="num">รอบแก้</th>
                        <th>สถานะ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskRows.map((r) => (
                        <tr key={r.key}>
                          <td data-l="งาน">{r.name}</td>
                          <td data-l="โปรเจค">{r.project}</td>
                          <td data-l="กำหนดส่ง">
                            {thaiDate(r.due)}
                            {r.waitDays > 0 && <div className="gpd-ls">รอลูกค้าหรือรอข้อมูล {num(r.waitDays)} วัน</div>}
                          </td>
                          <td data-l="ส่งครั้งแรก">{r.first ? thaiDate(r.first.slice(0, 10)) : "—"}</td>
                          <td data-l="ผลการส่ง">{result(r)}</td>
                          <td data-l="รอบแก้" className="num">
                            {r.first ? num(Math.max(0, r.rounds - 1)) : "—"}
                          </td>
                          <td data-l="สถานะ">
                            <Chip tone={STATUS_TONE[r.status]}>{TASK_STATUS[r.status].label}</Chip>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroll>
              )}
            </Card>
          </>
        )}

        {/* ================= การเข้างาน ================= */}
        <Card cls="gpd-c8" title="การเข้างาน">
          {!att.hasSource ? (
            <div className="gpd-none">ยังไม่มีข้อมูลการเข้างาน</div>
          ) : (
            <>
              <div className="gpd-stats">
                <Stat label="เข้างานตรงเวลา" value={num(att.onTime)} unit={`จาก ${num(att.worked)} วัน`} />
                <Stat label="มาสาย" value={num(att.late.length)} unit="ครั้ง" />
                <Stat label="สายรวม" value={num(att.lateMin)} unit="นาที" />
                <Stat label="ออกก่อนเวลา" value={num(att.early.length)} unit="ครั้ง" />
                <Stat label="ลา" value={num(leaveDays)} unit="วัน" />
              </div>
              {span.from <= heatTo && <Heat days={att.days} from={span.from} to={heatTo} />}
              <div className="gpd-legend gpd-legend-heat">
                {HEAT_LEGEND.map(([c, t]) => (
                  <span key={c}>
                    <i className={`gpd-hc ${c}`} />
                    {t}
                  </span>
                ))}
              </div>
              <div className="gpd-sub">มาสายและออกก่อนเวลา</div>
              {attEvents.length === 0 ? (
                <div className="gpd-none">ไม่มี{pt}</div>
              ) : (
                <Scroll rows={attEvents.length} cap={6} rowH={44}>
                  <table className="gpd-tbl">
                    <thead>
                      <tr>
                        <th>วันที่</th>
                        <th className="num">เข้างาน</th>
                        <th className="num">ออกงาน</th>
                        <th>รายการ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attEvents.map((x) => (
                        <tr key={x.d}>
                          <td data-l="วันที่">{dayText(x.d)}</td>
                          <td data-l="เข้างาน" className="num">
                            {x.in ?? "—"}
                          </td>
                          <td data-l="ออกงาน" className="num">
                            {x.out ?? "—"}
                          </td>
                          <td data-l="รายการ">
                            <span className="gpd-tags">
                              {x.lateMin != null && <Chip tone="warn">มาสาย {num(x.lateMin)} นาที</Chip>}
                              {x.earlyMin != null && <Chip tone="bad">ออกก่อน {num(x.earlyMin)} นาที</Chip>}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Scroll>
              )}
            </>
          )}
        </Card>

        {/* ================= การลา ================= */}
        <Card cls="gpd-c4" title="การลา" sub={`สิทธิ์ลา ${spanText({ from: quota.from, to: quota.to })}`}>
          {quota.items.map((q) => {
            const used = q.usedHours / 8;
            const over = q.ent > 0 ? Math.max(0, used - q.ent) : 0;
            const base = Math.max(q.ent, used) || 1;
            return (
              <div key={q.kind} className="gpd-q">
                <div className="gpd-q-h">
                  <span>{q.label}</span>
                  <span className={`gpd-q-v${over > 0 ? " over" : ""}`}>
                    ใช้ไป {leaveAmt(q.usedHours)}
                    {q.ent > 0 && ` จาก ${num(q.ent)} วัน`}
                  </span>
                </div>
                {q.ent > 0 && (
                  <div className="gpd-trk" role="img" aria-label={`${q.label} ใช้ไป ${leaveAmt(q.usedHours)} จาก ${num(q.ent)} วัน`}>
                    <span className="f" style={{ width: `${(Math.min(used, q.ent) / base) * 100}%` }} />
                    <span className="x" style={{ width: `${(over / base) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          <hr className="gpd-hr" />
          <div className="gpd-sub">คำขอลา</div>
          {requests.length === 0 ? (
            <div className="gpd-none">ไม่มีคำขอลา{pt}</div>
          ) : (
            <Scroll rows={requests.length} cap={4} rowH={62}>
              {requests.map((r) => (
                <div key={r.key} className="gpd-lrow">
                  <div>
                    <div className="gpd-lt">{r.type}</div>
                    <div className="gpd-ls">{spanText({ from: r.from, to: r.to })}</div>
                  </div>
                  <div className="gpd-lr">
                    <Chip tone={LEAVE_TONE[r.state]}>{LEAVE_STATE_LABEL[r.state]}</Chip>
                    <div className="gpd-ls">{leaveAmt(r.hours)}</div>
                  </div>
                </div>
              ))}
            </Scroll>
          )}
        </Card>

        {/* ================= KPI ================= */}
        <Card cls="gpd-c6" title="KPI" sub={pos.label} extra={KPI_IS_MOCK ? <span className="gpf-mock">ข้อมูลตัวอย่าง</span> : undefined}>
          {kpi.target > 0 ? (
            <div className="gpd-k">
              <div className="gpd-k-h">
                <span className="gpd-k-n">{kpi.metric}</span>
                {kpiOk ? <Chip tone="ok">ถึงเป้า</Chip> : <Chip tone="warn">ต่ำกว่าเป้า</Chip>}
              </div>
              <div className="gpd-k-v">
                ทำได้ {num(kpi.actual)} {kpi.unit} เป้า {num(kpi.target)} {kpi.unit}
              </div>
              <span className="gpd-ktrk" role="img" aria-label={`ทำได้ ${num(kpi.actual)} เป้า ${num(kpi.target)} ${kpi.unit}`}>
                <span className="f" style={{ width: `${Math.min(100, (kpi.actual / kpiMax) * 100)}%` }} />
                <span className="t" style={{ left: `${Math.min(100, (kpi.target / kpiMax) * 100)}%` }} />
              </span>
            </div>
          ) : (
            <div className="gpd-none">ยังไม่มีเป้า{pt}</div>
          )}
        </Card>

        {/* ================= เปลี่ยนแปลงจากช่วงก่อนหน้า ================= */}
        <Card cls="gpd-c6" title="เปลี่ยนแปลงจากช่วงก่อนหน้า" sub={`ช่วงก่อนหน้า ${spanText(prev)}`}>
          <table className="gpd-tbl">
            <thead>
              <tr>
                <th>รายการ</th>
                <th className="num">ช่วงก่อนหน้า</th>
                <th className="num">ช่วงนี้</th>
                <th aria-label="ผล" />
              </tr>
            </thead>
            <tbody>
              {cmp.map((c) => (
                <tr key={c.name}>
                  <td data-l="รายการ">{c.name}</td>
                  <td data-l="ช่วงก่อนหน้า" className="num">
                    {cmpText(c.a, c)}
                  </td>
                  <td data-l="ช่วงนี้" className="num">
                    {cmpText(c.b, c)}
                  </td>
                  <td data-l="ผล">
                    {c.a == null || c.b == null ? null : c.a === c.b ? (
                      <Chip tone="off">เท่าเดิม</Chip>
                    ) : c.b > c.a === c.higherBetter ? (
                      <Chip tone="ok">ดีขึ้น</Chip>
                    ) : (
                      <Chip tone="bad">แย่ลง</Chip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {/* ================= ความประพฤติ ================= */}
        <section className="gpd-card gpd-c12 gpd-slim">
          <h2 className="gpd-t">ความประพฤติ</h2>
          <span className="gpd-slim-v">ยังไม่มีบันทึกความประพฤติ</span>
        </section>
      </div>
    </div>
  );
}
