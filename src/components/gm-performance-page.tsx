"use client";

/*
 * ประสิทธิภาพพนักงาน — หน้ารายชื่อ (เมนูย่อยของแดชบอร์ด GM · ผู้ใช้สั่ง 26 ต.ค. 2569)
 *
 * ท่าพักมีแค่รูปสี่เหลี่ยมจัตุรัส 1:1 (ไม่ใช่วงกลม) + ชื่อเล่นบรรทัดเดียว ไม่มีตัวเลขใด ๆ
 * กดรูป → รายละเอียดกางออก "ในรายการ" (ไม่ใช่ลิ้นชัก/หน้าต่างลอย/แผงข้าง)
 *   Grid — แทรกเป็นแถวเต็มความกว้าง ต่อท้ายรูปสุดท้ายของแถวที่มีรูปที่เลือก มีปลายแหลมชี้ขึ้นที่รูปนั้น
 *          จำนวนคอลัมน์วัดจากกริดจริง (ResizeObserver) ย่อจอแล้วแถวยังถูก
 *   List — แถวที่เลือกกางลงใต้บรรทัดหัวของตัวเอง
 *   กดซ้ำ = หุบ · กดคนอื่น = สลับ (เนื้อหาผูกกับรหัสคน ไม่ค้างของคนก่อน) · Esc = หุบ
 * ข้างในมี 3 แถบพอดี (งาน · การเข้างาน · KPI) — ไม่มีคะแนนรวม (เจ้าของตัดสินไว้: ไม่มีคะแนนรวม ไม่เทียบข้ามตำแหน่ง)
 * ตัวกรอง/สลับมุมมองเป็นแถบเครื่องมือ ไม่ใช่เมนูนำทาง — เมนูอยู่แถบข้างเท่านั้น
 */

import "@/styles/gm-dashboard.css";
import "@/styles/gm-performance.css";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDownIcon, ChevronRightIcon } from "@/components/icons";
import { SearchBox } from "@/components/sales-ui";
import { displayName, initialOf, nameHay } from "@/lib/emp-name";
import {
  BAND_LABEL,
  bandOf,
  perfOf,
  perfPeople,
  rangeKeyOf,
  spanOf,
  useEmpPhotos,
  usePerfSources,
  type PerfOf,
} from "@/lib/emp-performance";
import { todayIso } from "@/lib/format";
import { hrDept, hrPos, type Employee } from "@/lib/hr-data";
import { RANGE_LABEL, type RangeKey } from "@/lib/sales-report";

const RANGES: RangeKey[] = ["m", "q", "y"];
const VIEW_KEY = "maz-erp.gm-performance-view.v1";
type View = "grid" | "list";

const num = (n: number) => Number(n).toLocaleString("th-TH");

/* ================= ชิ้นส่วนที่หน้ารายคนใช้ร่วม ================= */

/** สีพื้นของกล่องตัวอักษร — ผูกกับรหัสคน สีไม่เปลี่ยนเมื่อกรอง */
function tintOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % 5;
}

/** รูปสี่เหลี่ยมจัตุรัส 1:1 — มีรูปโปรไฟล์ใช้รูป ไม่มีใช้ตัวอักษรแรกบนพื้นสีอ่อน (ห้ามวงกลม) */
export function EmpPhoto({ e, url, size }: { e: Employee; url?: string; size?: "sm" | "lg" }) {
  return (
    <span className={`gpf-photo${size ? ` gpf-${size}` : ""}${url ? "" : ` gpf-tint-${tintOf(e.id)}`}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- รูปเป็น data URL จาก localStorage */}
      {url ? <img src={url} alt="" /> : initialOf(e)}
    </span>
  );
}

/** ตัวเลือกช่วง เดือนนี้ · ไตรมาส · ปีนี้ — แบบเดียวกับแดชบอร์ด GM */
export function RangeSeg({ value, onChange }: { value: RangeKey; onChange: (r: RangeKey) => void }) {
  return (
    <div className="seg max-sm:w-full max-sm:[&>button]:!h-10 max-sm:[&>button]:!text-[14px]" role="group" aria-label="ช่วงเวลา">
      {RANGES.map((r) => (
        <button key={r} type="button" className={value === r ? "on" : ""} aria-pressed={value === r} onClick={() => onChange(r)}>
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

/** ช่วงเวลาซิงก์กับ ?r= ในที่อยู่หน้า — กดดูรายละเอียดแล้วกลับมายังเป็นช่วงเดิม */
export function useRangeParam(initial: RangeKey) {
  const router = useRouter();
  const pathname = usePathname();
  const [range, setRangeState] = useState<RangeKey>(initial);
  const setRange = useCallback(
    (r: RangeKey) => {
      setRangeState(r);
      router.replace(r === "m" ? pathname : `${pathname}?r=${r}`, { scroll: false });
    },
    [router, pathname],
  );
  return [range, setRange] as const;
}

function Chip({ pct }: { pct: number | null }) {
  const b = bandOf(pct);
  return (
    <span className={`gpf-chip gpf-${b}`}>
      <i aria-hidden="true" />
      {BAND_LABEL[b]}
    </span>
  );
}

function Measure({
  title,
  pct,
  main,
  extra,
  mock,
}: {
  title: string;
  pct: number | null;
  main: ReactNode;
  extra?: ReactNode;
  mock?: boolean;
}) {
  const b = bandOf(pct);
  return (
    <div className="gpf-m">
      <div className="gpf-m-h">
        <span className="gpf-m-t">{title}</span>
        <Chip pct={pct} />
        {mock && <span className="gpf-mock">ข้อมูลตัวอย่าง</span>}
      </div>
      <div className="gpf-m-main">{main}</div>
      {extra && <div className="gpf-m-extra">{extra}</div>}
      <div
        className="gpf-track"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
        aria-valuetext={pct == null ? BAND_LABEL.none : `${pct}%`}
      >
        {pct != null && <span className={`gpf-fill gpf-${b}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />}
      </div>
    </div>
  );
}

/** 3 ตัววัด — ชุดเดียวกันทั้งส่วนที่กางในหน้ารายชื่อและหัวหน้ารายคน ตัวเลขจึงตรงกัน */
export function Measures({ p, periodText }: { p: PerfOf; periodText: string }) {
  const { task, att, kpi } = p;
  return (
    <>
      <div className="gpf-measures">
        <Measure
          title="ประสิทธิภาพงาน"
          pct={task.pct}
          main={
            task.denom > 0 ? (
              <>
                ส่งตรงเวลา <b>{num(task.onTime)}</b> จาก {num(task.denom)} งาน{task.pct != null && ` (${task.pct}%)`}
              </>
            ) : (
              <>ไม่มีงานที่ครบกำหนด{periodText}ให้วัด</>
            )
          }
          extra={`ล่าช้า ${num(task.late)} งาน · ช้าเพราะรอ ${num(task.waited)} งาน · กำลังทำ ${num(task.open)} งาน`}
        />
        <Measure
          title="การเข้างาน"
          pct={att.pct}
          main={
            att.worked > 0 ? (
              <>
                เข้างานตรงเวลา <b>{num(att.onTime)}</b> จาก {num(att.worked)} วันที่มาทำงาน{att.pct != null && ` (${att.pct}%)`}
              </>
            ) : att.hasSource ? (
              <>ไม่มีวันที่ตอกบัตรเข้างาน{periodText}</>
            ) : (
              <>ยังไม่มีข้อมูลการเข้างาน</>
            )
          }
          extra={att.hasSource ? `มาสาย ${num(att.late.length)} ครั้ง · ออกก่อนเวลา ${num(att.early.length)} ครั้ง` : undefined}
        />
        <Measure
          title="KPI"
          pct={kpi.pct}
          mock={kpi.mock}
          main={
            kpi.target > 0 ? (
              <>
                {kpi.metric} <b>{num(kpi.actual)}</b> / เป้า {num(kpi.target)} {kpi.unit}{kpi.pct != null && ` (${kpi.pct}%)`}
              </>
            ) : (
              <>ยังไม่มีเป้า{periodText}</>
            )
          }
        />
      </div>
    </>
  );
}

export const PERIOD_TEXT: Record<RangeKey, string> = { m: "ในเดือนนี้", q: "ในไตรมาสนี้", y: "ในปีนี้" };

/* ================= หน้ารายชื่อ ================= */

function GridIcon2() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}
function ListIcon2() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="4" height="4" rx="1" />
      <rect x="3.5" y="15.5" width="4" height="4" rx="1" />
      <path d="M11 6.5h9.5M11 17.5h9.5" />
    </svg>
  );
}

/* มุมมองที่เลือกจำไว้ในเครื่อง — อ่าน/เขียนไม่ได้ (โหมดส่วนตัว) ใช้ Grid */
const viewListeners = new Set<() => void>();
function subscribeView(fn: () => void) {
  viewListeners.add(fn);
  return () => {
    viewListeners.delete(fn);
  };
}
function readView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}
function setView(v: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* เก็บไม่ได้ก็ไม่เป็นไร */
  }
  viewListeners.forEach((fn) => fn());
}

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** ส่วนที่กางออก — เนื้อหาเดียวกันทั้ง Grid และ List */
function Panel({ e, p, range, caret }: { e: Employee; p: PerfOf; range: RangeKey; caret?: number }) {
  const pos = hrPos(e.pos);
  return (
    <div className="gpf-panel" id="gpf-panel" role="region" aria-label={`ประสิทธิภาพของ ${displayName(e)}`}>
      {caret != null && <span className="gpf-caret" style={{ left: caret }} aria-hidden="true" />}
      <div className="gpf-panel-in">
        <div className="gpf-panel-h">
          <span className="gpf-panel-name">{displayName(e)}</span>
          <span className="gpf-panel-sub">
            {pos.label} · {hrDept(pos.dept).label} · {RANGE_LABEL[range]}
          </span>
        </div>
        <Measures p={p} periodText={PERIOD_TEXT[range]} />
        <div className="gpf-panel-foot">
          <Link className="gpf-btn" style={{ marginLeft: "auto" }} href={`/gm/performance/${encodeURIComponent(e.id)}${range === "m" ? "" : `?r=${range}`}`}>
            ดูรายละเอียดเพิ่มเติม
            <ChevronRightIcon />
          </Link>
        </div>
      </div>
    </div>
  );
}

export function GmPerformancePage({ initialRange }: { initialRange?: string }) {
  const today = todayIso();
  const src = usePerfSources();
  const photos = useEmpPhotos();
  const [range, setRange] = useRangeParam(rangeKeyOf(initialRange));
  const span = useMemo(() => spanOf(range, today), [range, today]);

  /* ================= ตัวกรอง ================= */
  const [q, setQ] = useState("");
  const [posF, setPosF] = useState("");
  const [deptF, setDeptF] = useState("");
  const view = useSyncExternalStore(subscribeView, readView, () => "grid" as View);

  const people = useMemo(() => perfPeople(src.hr.emp), [src.hr.emp]);
  const posOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of people) m.set(e.pos, hrPos(e.pos).label);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [people]);
  const deptOpts = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of people) {
      const d = hrPos(e.pos).dept;
      m.set(d, hrDept(d).label);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [people]);
  const list = useMemo(() => {
    const k = q.trim().toLowerCase();
    return people
      .filter((e) => !posF || e.pos === posF)
      .filter((e) => !deptF || hrPos(e.pos).dept === deptF)
      .filter((e) => !k || nameHay(e).toLowerCase().includes(k))
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "th"));
  }, [people, q, posF, deptF]);

  /* ================= เลือก / กาง / หุบ ================= */
  const [sel, setSel] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);
  const clearTimer = () => {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  const collapse = useCallback(() => {
    if (timer.current != null) window.clearTimeout(timer.current);
    if (reducedMotion()) {
      setSel(null);
      setClosing(false);
      return;
    }
    setClosing(true);
    timer.current = window.setTimeout(() => {
      setSel(null);
      setClosing(false);
      timer.current = null;
    }, 200);
  }, []);
  const toggle = (id: string) => {
    if (sel === id && !closing) return collapse();
    clearTimer();
    setClosing(false);
    setSel(id);
  };
  useEffect(() => () => clearTimer(), []);
  /* Esc หุบ แล้วคืนโฟกัสให้รูปที่เลือก */
  useEffect(() => {
    if (!sel) return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== "Escape") return;
      document.getElementById(`gpf-tile-${sel}`)?.focus();
      collapse();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel, collapse]);

  const selEmp = sel ? list.find((e) => e.id === sel) : undefined;
  /* คำนวณเฉพาะคนที่เลือก — ท่าพักไม่มีตัวเลข */
  const selPerf = useMemo(() => (selEmp ? perfOf(src, selEmp, span, today) : null), [src, selEmp, span, today]);

  /* ================= วัดคอลัมน์ของกริดจริง ================= */
  const gridRef = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ cols: 1, w: 0, gap: 16 });
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => {
      const cs = window.getComputedStyle(el);
      const cols = cs.gridTemplateColumns.split(" ").filter((x) => x && x !== "none").length || 1;
      const gap = parseFloat(cs.columnGap) || 0;
      const w = el.clientWidth;
      setGeo((g) => (g.cols === cols && g.w === w && g.gap === gap ? g : { cols, w, gap }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [view, list.length]);

  const selIdx = selEmp ? list.indexOf(selEmp) : -1;
  const selRow = selIdx < 0 ? -1 : Math.floor(selIdx / geo.cols);
  const rowEnd = selIdx < 0 ? -1 : Math.min(list.length - 1, selRow * geo.cols + geo.cols - 1);
  const colW = (geo.w - geo.gap * (geo.cols - 1)) / geo.cols;
  const caret = selIdx < 0 ? 0 : (selIdx % geo.cols) * (colW + geo.gap) + colW / 2;

  const expandBox = (key: string, child: ReactNode) => (
    <div key={key} className={`gpf-expand${closing ? " gpf-closing" : ""}`}>
      <div>{child}</div>
    </div>
  );

  return (
    <div className="gmd-page gpf-page">
      <div className="gmd-head">
        <div>
          <h1 className="gmd-h1">ประสิทธิภาพพนักงาน</h1>
          <span className="gmd-h1-line" aria-hidden="true" />
        </div>
      </div>

      {/* ================= แถบเครื่องมือ ================= */}
      <div className="gpf-tools">
        <SearchBox value={q} onChange={setQ} placeholder="ค้นหาชื่อหรือชื่อเล่น" />
        <label className="gpf-sel">
          <select value={posF} onChange={(ev) => setPosF(ev.target.value)} aria-label="กรองตามตำแหน่ง">
            <option value="">ทุกตำแหน่ง</option>
            {posOpts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </label>
        <label className="gpf-sel">
          <select value={deptF} onChange={(ev) => setDeptF(ev.target.value)} aria-label="กรองตามแผนก">
            <option value="">ทุกแผนก</option>
            {deptOpts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <ChevronDownIcon />
        </label>
        <RangeSeg value={range} onChange={setRange} />
        <div className="gpf-view" role="group" aria-label="มุมมอง">
          <button type="button" aria-pressed={view === "grid"} aria-label="มุมมองตาราง" title="มุมมองตาราง" onClick={() => setView("grid")}>
            <GridIcon2 />
          </button>
          <button type="button" aria-pressed={view === "list"} aria-label="มุมมองรายการ" title="มุมมองรายการ" onClick={() => setView("list")}>
            <ListIcon2 />
          </button>
        </div>
      </div>
      <p className="gpf-count">
        {num(list.length)} คน · กดรูปเพื่อดูประสิทธิภาพ{PERIOD_TEXT[range]}
      </p>

      {list.length === 0 ? (
        <p className="gpf-empty">ไม่พบพนักงานตามตัวกรองนี้</p>
      ) : view === "grid" ? (
        <div className="gpf-grid" ref={gridRef}>
          {list.map((e, i) => (
            <Fragment key={e.id}>
              <button
                type="button"
                id={`gpf-tile-${e.id}`}
                className="gpf-tile"
                aria-expanded={sel === e.id}
                aria-controls={sel === e.id ? "gpf-panel" : undefined}
                aria-label={`${displayName(e)} — ${sel === e.id ? "หุบรายละเอียด" : "ดูประสิทธิภาพ"}`}
                onClick={() => toggle(e.id)}
              >
                <EmpPhoto e={e} url={photos[e.id]} />
                <span className="gpf-nick">{displayName(e)}</span>
              </button>
              {i === rowEnd && selEmp && selPerf &&
                expandBox(
                  `row-${selRow}`,
                  <Panel key={selEmp.id} e={selEmp} p={selPerf} range={range} caret={caret} />,
                )}
            </Fragment>
          ))}
        </div>
      ) : (
        <ul className="gpf-list">
          {list.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                id={`gpf-tile-${e.id}`}
                className="gpf-row"
                aria-expanded={sel === e.id}
                aria-controls={sel === e.id ? "gpf-panel" : undefined}
                onClick={() => toggle(e.id)}
              >
                <EmpPhoto e={e} url={photos[e.id]} size="sm" />
                <span className="gpf-nick">{displayName(e)}</span>
                <ChevronDownIcon className="gpf-row-ch" />
              </button>
              {sel === e.id && selEmp && selPerf && expandBox(`li-${e.id}`, <Panel e={selEmp} p={selPerf} range={range} />)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
