"use client";

/*
 * ประสิทธิภาพพนักงาน — ตัวเลขของหน้า /gm/performance และหน้ารายคน (ผู้ใช้สั่ง 26 ต.ค. 2569)
 *
 * วัด 3 เรื่องแยกกัน ไม่มีคะแนนรวม และไม่เทียบข้ามตำแหน่ง (เจ้าของตัดสินไว้ก่อนแล้ว)
 *   ก. ประสิทธิภาพงาน — งานที่ครบกำหนดในช่วง (pm-store) ส่งรอบแรกทันกำหนดไหม
 *      ช้าเพราะรอ (รองานก่อนหน้าตามแผน หรือกดรอข้อมูลเอง) ไม่ใช่ความผิดของคนทำ → แยกนับ ไม่อยู่ในตัวหาร
 *   ข. การเข้างาน — เวลาตอกบัตรจริง (attendance-store ผ่าน usePunchTimes) เทียบเวลาทำงานของคนนั้น (scheduleFor)
 *      ไม่นับวันลาที่อนุมัติแล้ว วันหยุดบริษัท เสาร์–อาทิตย์ · ตัวหาร = วันที่มาทำงาน ไม่ใช่ "จำนวนวันที่ตอกบัตร" เป็นคะแนน
 *   ค. KPI — ระบบยังไม่มีข้อมูล KPI จริง จึงเป็นข้อมูลตัวอย่าง (ต้องติดป้าย "ข้อมูลตัวอย่าง" ทุกที่ที่แสดง)
 *
 * ทุกฟังก์ชันในไฟล์นี้คำนวณล้วน ๆ จากข้อมูลที่ส่งเข้ามา — ฮุกรวบข้อมูลอยู่ท้ายไฟล์ (usePerfSources)
 */

import { useMemo, useSyncExternalStore } from "react";
import { useEmpRequests, type EmpRequest } from "./emp-requests";
import { daysBetween, parseIsoDate, toIsoDate, todayIso } from "./format";
import { holidays } from "./holidays";
import {
  accountRoles,
  HR_LEAVE_LABEL,
  isWorkIso,
  leaveDatesOf,
  leaveRowHours,
  ROLE_EMPLOYEE,
  type Employee,
  type InternLeave,
  type LeaveKind,
  type LeaveRow,
  type TimeRec,
} from "./hr-data";
import { usePunchTimes, useHrTime, type PunchDay } from "./hr-link";
import { useHr } from "./hr-store";
import { entitlementDays, leavePeriodOf, leaveYearOf, periodRange, type LeaveRecord } from "./leave-data";
import { useAllLeave } from "./leave-store";
import { type Project, type ProjectTask, type TaskStatus } from "./pm-data";
import { taskHomes, usePm } from "./pm-store";
import { getProfilePhoto, subscribeProfilePhoto } from "./profile-store";
import { type Role } from "./role";
import { rangeOf, type RangeKey } from "./sales-report";
import { settings } from "./system-settings";
import { isLoose, LOOSE_NAME } from "./task-ask";
import { WORK_SCHEDULE, expectedInMinutes, expectedOutMinutes, leaveWindowOf, minutesOfDay, scheduleFor } from "./work-schedule";

export type Span = { from: string; to: string };

/** ช่วงเวลาจาก ?r= — ไม่รู้จัก = เดือนนี้ */
export function rangeKeyOf(v: string | null | undefined): RangeKey {
  return v === "q" || v === "y" ? v : "m";
}

export function spanOf(key: RangeKey, today = todayIso()): Span {
  const r = rangeOf(key, parseIsoDate(today));
  return { from: r.from, to: r.to };
}

/* ================= เกณฑ์สี (ผู้ใช้สั่ง 26 ต.ค. 2569) ================= */
export type Band = "good" | "watch" | "low" | "none";
export const BAND_LABEL: Record<Band, string> = {
  good: "เป็นไปตามเป้า",
  watch: "ควรติดตาม",
  low: "ต่ำกว่าเกณฑ์",
  none: "ยังไม่มีข้อมูลในช่วงนี้",
};
export function bandOf(pct: number | null): Band {
  if (pct == null) return "none";
  if (pct >= 90) return "good";
  if (pct >= 75) return "watch";
  return "low";
}
/** ร้อยละปัดเต็ม — ตัวหาร 0 = ไม่มีข้อมูล */
export function pctOf(x: number, y: number): number | null {
  return y > 0 ? Math.round((x / y) * 100) : null;
}

/* ================= ใครอยู่ในรายชื่อ ================= */
/** พนักงานที่ยังทำงานอยู่ ไม่รวมผู้บริหาร (CEO) และคนที่พ้นสภาพ */
export function perfPeople(emp: Employee[]): Employee[] {
  return emp.filter((e) => e.status === "active" && e.pos !== "ceo" && !accountRoles(e.account).includes("ceo"));
}

/* ================= ก. ประสิทธิภาพงาน ================= */
export type TaskVerdict = "ontime" | "late" | "waited" | "open";
export const VERDICT_LABEL: Record<TaskVerdict, string> = {
  ontime: "ส่งตรงเวลา",
  late: "ล่าช้า",
  waited: "ช้าเพราะรอ",
  open: "กำลังทำ",
};

export type TaskRow = {
  key: string;
  pj: string;
  project: string;
  name: string;
  due: string;
  /** วันเวลาที่ส่งรอบแรก — null = ยังไม่เคยส่ง */
  first: string | null;
  verdict: TaskVerdict;
  /** ช้ากี่วัน (ส่งรอบแรก หรือวันนี้ ลบวันครบกำหนด) */
  lateDays: number;
  /** วันที่ต้องรอ (รองานก่อนหน้า + กดรอข้อมูลเอง ไม่นับวันซ้ำ) */
  waitDays: number;
  /** จำนวนรอบที่ส่ง = subs.length · รอบแก้ = รอบที่ส่ง − 1 */
  rounds: number;
  /** สถานะงานตอนนี้ และเวลาที่ปิดงาน — หน้ารายคนใช้นับงานเสร็จ/งานค้าง (ผู้ใช้สั่ง 26 ต.ค. 2569) */
  status: TaskStatus;
  doneAt: string | null;
};

export type TaskSum = {
  rows: TaskRow[];
  assigned: number;
  onTime: number;
  late: number;
  waited: number;
  open: number;
  /** ตัวหาร = ส่งตรงเวลา + ล่าช้า (ไม่รวมช้าเพราะรอ และงานที่ยังไม่ครบกำหนด) */
  denom: number;
  pct: number | null;
};

const day = (stamp: string) => stamp.slice(0, 10);
const dayNo = (iso: string) => Math.round(parseIsoDate(iso).getTime() / 86_400_000);

/** ส่งรอบแรกเมื่อไร — subs[0] · งานไม่ต้องตรวจที่ปิดแล้วใช้เวลาปิด · งานที่ปิดโดยไม่มีรอบส่งใช้เวลาปิด */
export function firstSubmit(t: ProjectTask): string | null {
  if (t.subs?.length) return t.subs[0].at;
  if (t.doneAt) return t.doneAt;
  return null;
}

/** งานก่อนหน้าผ่านเมื่อไร — ประวัติสถานะครั้งแรกที่ไป "รอลูกค้าตรวจ/เสร็จ" › doneAt › รอบส่งล่าสุด · ยังไม่ผ่าน = null */
function passedAt(t: ProjectTask): string | null {
  const step = t.history?.find((h) => h.to === "wait" || h.to === "done");
  if (step) return day(step.at);
  if (t.doneAt) return day(t.doneAt);
  if (t.status === "wait" || t.status === "done") {
    const last = t.subs?.[t.subs.length - 1];
    return last ? day(last.at) : null;
  }
  return null;
}

/** ช่วงวันที่ต้องรอ [เริ่ม, จบ) เป็นเลขวัน — ตัดให้จบไม่เกินวันที่ส่ง/วันนี้ */
function waitIntervals(t: ProjectTask, tasks: ProjectTask[], until: string): [number, number][] {
  const out: [number, number][] = [];
  const end = dayNo(until);
  /* รอข้อมูลที่คนทำกดเอง (waits[] · ใบที่ยังรออยู่ไม่มี to) */
  for (const w of t.waits ?? []) {
    const a = dayNo(day(w.from));
    const b = Math.min(end, w.to ? dayNo(day(w.to)) : end);
    if (b > a) out.push([a, b]);
  }
  /* รองานก่อนหน้าตามแผน (after) — รอจากวันเริ่มตามแผนจนงานก่อนหน้าผ่านครบ */
  if (t.start && t.after?.length) {
    const pre = t.after.map((n) => tasks.find((x) => x.name === n)).filter((x): x is ProjectTask => Boolean(x));
    if (pre.length) {
      const dates = pre.map((x) => passedAt(x));
      const sorted = (dates as string[]).sort();
      const last = dates.some((d) => d == null) ? until : sorted[sorted.length - 1];
      const a = dayNo(t.start);
      const b = Math.min(end, dayNo(last));
      if (b > a) out.push([a, b]);
    }
  }
  return out;
}

/** รวมช่วงที่ซ้อนกัน แล้วนับวัน — วันเดียวกันรอสองเรื่องนับครั้งเดียว */
function unionDays(list: [number, number][]) {
  const s = [...list].sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const iv of s) {
    if (!cur || iv[0] > cur[1]) {
      if (cur) total += cur[1] - cur[0];
      cur = [iv[0], iv[1]];
    } else cur[1] = Math.max(cur[1], iv[1]);
  }
  if (cur) total += cur[1] - cur[0];
  return total;
}

/**
 * งานของคนนี้ที่ครบกำหนดในช่วง
 *   ส่งตรงเวลา = ส่งรอบแรก (subs[0].at) ไม่เกินวันครบกำหนด · งานไม่ต้องตรวจ/ปิดโดยไม่มีรอบส่ง ใช้เวลาปิด (doneAt)
 *   ล่าช้า     = ส่งรอบแรกหลังวันครบกำหนด หรือเลยกำหนดแล้วยังไม่ส่ง
 *   ช้าเพราะรอ = ล่าช้า แต่วันที่ต้องรอ (รองานก่อนหน้า + กดรอข้อมูล) ≥ วันที่ช้า → ไม่อยู่ในตัวหาร
 *   กำลังทำ    = ยังไม่ส่งและยังไม่ถึงกำหนด → ไม่อยู่ในตัวหาร
 */
export function taskSum(homes: Project[], id: string, span: Span, today: string): TaskSum {
  const rows: TaskRow[] = [];
  for (const p of homes) {
    if (p.status === "cancelled") continue;
    for (const t of p.tasks) {
      if (!t.due || t.due < span.from || t.due > span.to) continue;
      if (!t.whos.includes(id)) continue;
      const first = firstSubmit(t);
      const firstDay = first ? day(first) : null;
      let verdict: TaskVerdict;
      let lateDays = 0;
      /* วันที่รอคิดทุกงาน (หน้ารายคนโชว์ใต้วันกำหนดส่ง) — ผลตัดสินยังใช้เฉพาะงานที่เลยกำหนด (ผู้ใช้สั่ง 26 ต.ค. 2569) */
      const until = firstDay ?? today;
      const waitDays = unionDays(waitIntervals(t, p.tasks, until));
      if (firstDay && firstDay <= t.due) verdict = "ontime";
      else if (!firstDay && t.due >= today) verdict = "open";
      else {
        lateDays = Math.max(0, daysBetween(t.due, until));
        verdict = waitDays >= lateDays && waitDays > 0 ? "waited" : "late";
      }
      rows.push({
        key: `${p.pj}|${t.name}`,
        pj: p.pj,
        project: isLoose(p.pj) ? LOOSE_NAME : p.name || p.cus,
        name: t.name,
        due: t.due,
        first,
        verdict,
        lateDays,
        waitDays,
        rounds: t.subs?.length ?? 0,
        status: t.status,
        doneAt: t.doneAt ?? null,
      });
    }
  }
  rows.sort((a, b) => a.due.localeCompare(b.due) || a.name.localeCompare(b.name));
  const n = (v: TaskVerdict) => rows.filter((r) => r.verdict === v).length;
  const onTime = n("ontime");
  const late = n("late");
  return { rows, assigned: rows.length, onTime, late, waited: n("waited"), open: n("open"), denom: onTime + late, pct: pctOf(onTime, onTime + late) };
}

/** วันที่ช้าจริงหลังหักวันที่ต้องรอ — งานที่ไม่ล่าช้า = 0 (ผู้ใช้สั่ง 26 ต.ค. 2569) */
export function netLateDays(r: TaskRow) {
  return r.verdict === "late" ? Math.max(0, r.lateDays - r.waitDays) : 0;
}

/** งานทุกใบของคนนี้ที่มีวันกำหนดส่ง ไม่จำกัดช่วง — ใช้ดูงานค้างตอนนี้ */
export function taskAllRows(homes: Project[], id: string, today: string): TaskRow[] {
  return taskSum(homes, id, { from: "0000-01-01", to: "9999-12-31" }, today).rows;
}

export type TaskExtra = {
  /** งานที่ปิด (ผ่านตรวจ) ในช่วง */
  done: number;
  /** รอบแก้เฉลี่ยของงานที่ปิดในช่วง — ไม่มีงานปิด = null */
  avgRounds: number | null;
  /** งานที่ยังไม่ปิดตอนนี้ (ไม่ขึ้นกับช่วง) */
  openNow: number;
  /** งานค้างที่เลยกำหนดแล้วยังไม่ส่ง */
  overNow: number;
};

/** ตัวเลขงานเสร็จ/งานค้างของหน้ารายคน (ผู้ใช้สั่ง 26 ต.ค. 2569) */
export function taskExtra(all: TaskRow[], span: Span): TaskExtra {
  const done = all.filter((r) => r.status === "done" && r.doneAt && day(r.doneAt) >= span.from && day(r.doneAt) <= span.to);
  const fix = done.reduce((s, r) => s + Math.max(0, r.rounds - 1), 0);
  const open = all.filter((r) => r.status !== "done");
  return {
    done: done.length,
    avgRounds: done.length ? Math.round((fix / done.length) * 10) / 10 : null,
    openNow: open.length,
    overNow: open.filter((r) => !r.first && r.verdict === "late").length,
  };
}

/** n เดือนล่าสุดจนถึงเดือนปัจจุบัน (กราฟการส่งงานรายเดือน) */
export function lastMonths(today: string, n: number): Span[] {
  const t = parseIsoDate(today);
  return Array.from({ length: n }, (_, i) => {
    const a = new Date(t.getFullYear(), t.getMonth() - (n - 1 - i), 1);
    return { from: toIsoDate(a), to: toIsoDate(new Date(a.getFullYear(), a.getMonth() + 1, 0)) };
  });
}

/**
 * ช่วงก่อนหน้าที่ยาวเท่ากัน — เลื่อนถอยหลัง 1 / 3 / 12 เดือน แล้วตัดปลายให้ยาวเท่าส่วนที่ผ่านมาแล้วของช่วงนี้
 * เช่น 1–26 ต.ค. เทียบ 1–26 ก.ย. (ผู้ใช้สั่ง 26 ต.ค. 2569)
 */
export function prevSpanOf(key: RangeKey, today: string): Span {
  const cur = spanOf(key, today);
  const months = key === "m" ? 1 : key === "q" ? 3 : 12;
  const shift = (iso: string) => {
    const d = parseIsoDate(iso);
    const t = new Date(d.getFullYear(), d.getMonth() - months, 1);
    t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate()));
    return toIsoDate(t);
  };
  const before = parseIsoDate(cur.from);
  before.setDate(before.getDate() - 1);
  const cap = toIsoDate(before);
  const end = shift(cur.to > today ? today : cur.to);
  return { from: shift(cur.from), to: end > cap ? cap : end };
}

/* ================= ข. การเข้างาน ================= */
/** สถานะรายวันของปฏิทินการเข้างาน (ผู้ใช้สั่ง 26 ต.ค. 2569) */
export type AttDayKind = "ok" | "late" | "early" | "lateEarly" | "leave" | "none" | "holiday";
export type AttDay = {
  d: string;
  kind: AttDayKind;
  in?: string;
  out?: string;
  lateMin?: number;
  earlyMin?: number;
  /** ชื่อประเภทลา หรือชื่อวันหยุด */
  label?: string;
};

export type AttHit = { d: string; time: string; min: number };
export type AttSum = {
  /** มีข้อมูลตอกบัตรของคนนี้ในระบบไหม — ไม่มีบัญชีเข้าระบบ = ตอกบัตรไม่ได้ */
  hasSource: boolean;
  /** วันที่มาทำงาน (มีเวลาเข้า) = ตัวหาร */
  worked: number;
  onTime: number;
  late: AttHit[];
  early: AttHit[];
  /** วันทำงานที่ไม่มีเวลาเข้าและไม่มีใบลาที่อนุมัติ (ไม่อยู่ในตัวหาร แจ้งไว้ให้รู้) */
  noRecord: string[];
  /** มีเวลาเข้าแต่ไม่มีเวลาออก (วันก่อนวันนี้) */
  noOut: string[];
  /** วันลาที่อนุมัติแล้วเต็มวันที่ตัดออก */
  leaveDays: number;
  /** วันหยุดบริษัทในช่วง (จ.–ศ.) ที่ตัดออก */
  holidayDays: number;
  pct: number | null;
  /** นาทีที่สายรวม */
  lateMin: number;
  /** รายวัน (จ.–ศ. ตั้งแต่วันเริ่มงานถึงวันนี้) — ปฏิทินในหน้ารายคน */
  days: AttDay[];
};

function halfOf(r: LeaveRow): "morning" | "afternoon" | undefined {
  return r.half === "am" ? "morning" : r.half === "pm" ? "afternoon" : undefined;
}

/**
 * การเข้างานจากเวลาตอกบัตรจริง (เวลาที่ฝ่ายบุคคลแก้ให้ใน fix มาก่อน)
 *   ตรงเวลา = เวลาเข้า − เวลาที่ต้องเข้า (หักลาครึ่งเช้าแล้ว) ≤ เวลาผ่อนผัน
 *   ออกก่อนเวลา = เวลาออก < เวลาที่ต้องเลิก (หักลาครึ่งบ่ายแล้ว) · วันนี้ที่ยังไม่ตอกออกไม่นับ
 *   ตัวหาร = วันทำงาน (จ.–ศ. ไม่ใช่วันหยุดบริษัท) ที่มีเวลาเข้า ไม่รวมวันลาเต็มวันที่อนุมัติแล้ว
 */
export function attSum(
  e: Employee,
  punches: Record<string, PunchDay> | undefined,
  rec: TimeRec | undefined,
  extraLeave: LeaveRow[],
  span: Span,
  today: string,
): AttSum {
  const sch = scheduleFor(e);
  const fix = new Map((rec?.fix ?? []).map((f) => [f.d, f]));
  const leaves = [...(rec?.leave ?? []), ...extraLeave];
  const out: AttSum = { hasSource: Boolean(punches && Object.keys(punches).length) || fix.size > 0, worked: 0, onTime: 0, late: [], early: [], noRecord: [], noOut: [], leaveDays: 0, holidayDays: 0, pct: null, lateMin: 0, days: [] };
  const hol = holidays();
  const from = span.from < e.startedAt ? e.startedAt : span.from;
  let to = span.to > today ? today : span.to;
  if (e.leftAt && e.leftAt < to) to = e.leftAt;
  if (from > to) return out;
  for (let d = parseIsoDate(from); toIsoDate(d) <= to; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    if (!isWorkIso(iso)) {
      const w = d.getDay();
      if (w !== 0 && w !== 6 && hol[iso]) {
        out.holidayDays++;
        out.days.push({ d: iso, kind: "holiday", label: hol[iso] });
      }
      continue;
    }
    const lv = leaves.filter((x) => x.d === iso);
    /* ลาไม่เต็มวันที่ไม่รู้ว่าช่วงเช้าหรือบ่าย (ลารายชั่วโมงเก่า) ไม่รู้เวลาที่ต้องเข้า/เลิก — ตัดออกเหมือนวันลา ไม่ตัดสินว่าสาย/ออกก่อน */
    const full = lv.some((x) => x.span === "full" || !halfOf(x));
    if (full) {
      out.leaveDays++;
      out.days.push({ d: iso, kind: "leave", label: HR_LEAVE_LABEL[lv[0].type] });
      continue;
    }
    const f = fix.get(iso);
    const p = f ? { in: f.in, out: f.out } : punches?.[iso];
    if (!p?.in) {
      if (iso < today) {
        out.noRecord.push(iso);
        out.days.push({ d: iso, kind: "none" });
      }
      continue;
    }
    out.worked++;
    const half = lv[0];
    const win = half ? leaveWindowOf({ days: 0.5, half: halfOf(half) }, sch) : null;
    const lateMin = minutesOfDay(p.in) - expectedInMinutes(win, sch);
    const isLate = lateMin > WORK_SCHEDULE.lateGraceMinutes;
    if (isLate) {
      out.late.push({ d: iso, time: p.in, min: lateMin });
      out.lateMin += lateMin;
    } else out.onTime++;
    let earlyMin = 0;
    if (p.out) {
      earlyMin = expectedOutMinutes(win, sch) - minutesOfDay(p.out);
      if (earlyMin > 0) out.early.push({ d: iso, time: p.out, min: earlyMin });
    } else if (iso < today) out.noOut.push(iso);
    const isEarly = earlyMin > 0;
    out.days.push({
      d: iso,
      kind: isLate && isEarly ? "lateEarly" : isLate ? "late" : isEarly ? "early" : "ok",
      in: p.in,
      out: p.out || undefined,
      lateMin: isLate ? lateMin : undefined,
      earlyMin: isEarly ? earlyMin : undefined,
    });
  }
  out.pct = pctOf(out.onTime, out.worked);
  return out;
}

/* ================= การลา ================= */
export type LeaveState = "approved" | "pending" | "rejected";
export const LEAVE_STATE_LABEL: Record<LeaveState, string> = { approved: "อนุมัติ", pending: "รออนุมัติ", rejected: "ไม่อนุมัติ" };
export type LeaveLine = { type: string; state: LeaveState; days: number; hours: number; count: number };

/* ประเภทในใบลา → 3 กลุ่มของฝ่ายบุคคล (ชุดเดียวกับ LEAVE_GROUP ใน hr-link) */
const LEAVE_GROUP: Record<string, LeaveKind> = { ลาพักร้อน: "vacation", ลาป่วย: "sick", ลากิจ: "personal", ลาคลอด: "personal", ลาไม่รับค่าจ้าง: "personal" };
const groupLabel = (type: string) => HR_LEAVE_LABEL[LEAVE_GROUP[type] ?? "personal"];

/** วันลาของนักศึกษาฝึกงานที่ฝ่ายบุคคลอนุมัติ (hr.internLeave) — เติมเฉพาะวันที่ยังไม่มีในเวลาทำงาน */
export function internLeaveRows(list: InternLeave[], id: string, have: LeaveRow[]): LeaveRow[] {
  const days = new Set(have.map((x) => x.d));
  return list
    .filter((x) => x.emp === id && x.status === "approved")
    .flatMap((x) => leaveDatesOf(x.from, x.to).map((d) => ({ d, type: x.lt, span: "full" as const, no: x.id })))
    .filter((x) => !days.has(x.d));
}

/**
 * การลาในช่วง แยกประเภท × ผลอนุมัติ
 *   อนุมัติ    = วันลาในเวลาทำงานของฝ่ายบุคคล (useHrTime รวมใบจริงของบทบาท + คำขอรายรหัสที่อนุมัติแล้ว) + ลาฝึกงานที่อนุมัติ
 *   รอ/ไม่อนุมัติ = ใบลาของบทบาท (leave-store) + คำขอรายรหัส (emp-requests) + ลาฝึกงาน ที่วันเริ่มลาอยู่ในช่วง
 */
export function leaveLines(
  e: Employee,
  approvedRows: LeaveRow[],
  roleLeave: LeaveRecord[],
  reqs: EmpRequest[],
  intern: InternLeave[],
  span: Span,
): LeaveLine[] {
  const sch = scheduleFor(e);
  const map = new Map<string, LeaveLine>();
  const add = (type: string, state: LeaveState, days: number, hours: number, count: number) => {
    const k = `${type}|${state}`;
    const cur = map.get(k) ?? { type, state, days: 0, hours: 0, count: 0 };
    cur.days += days;
    cur.hours += hours;
    cur.count += count;
    map.set(k, cur);
  };
  const seenNo = new Set<string>();
  for (const r of approvedRows) {
    if (r.d < span.from || r.d > span.to || !isWorkIso(r.d)) continue;
    const h = leaveRowHours(r, sch);
    const first = !r.no || !seenNo.has(r.no);
    if (r.no) seenNo.add(r.no);
    add(HR_LEAVE_LABEL[r.type], "approved", h / 8, h, first ? 1 : 0);
  }
  const inSpan = (d?: string) => Boolean(d && d >= span.from && d <= span.to);
  const seen = new Set<string>();
  for (const r of roleLeave) {
    if (seen.has(r.id) || !inSpan(r.date)) continue;
    seen.add(r.id);
    const state: LeaveState | null = r.status === "รอการอนุมัติ" ? "pending" : r.status === "ไม่อนุมัติ" ? "rejected" : null;
    if (state) add(groupLabel(r.type), state, r.days, r.hours ?? r.days * 8, 1);
  }
  for (const r of reqs) {
    if (r.kind !== "leave" || r.emp !== e.id || r.status === "approved" || seen.has(r.id) || !inSpan(r.from)) continue;
    seen.add(r.id);
    add(groupLabel(r.leaveType ?? ""), r.status === "pending" ? "pending" : "rejected", r.days ?? 0, (r.days ?? 0) * 8, 1);
  }
  for (const r of intern) {
    if (r.emp !== e.id || r.status === "approved" || seen.has(r.id) || !inSpan(r.from)) continue;
    seen.add(r.id);
    add(HR_LEAVE_LABEL[r.lt], r.status === "pending" ? "pending" : "rejected", r.days, r.days * 8, 1);
  }
  const order: LeaveState[] = ["approved", "pending", "rejected"];
  return [...map.values()].sort((a, b) => a.type.localeCompare(b.type) || order.indexOf(a.state) - order.indexOf(b.state));
}

/** สิทธิ์ลารายประเภทของรอบปีปัจจุบัน — ent = 0 คือไม่ได้ตั้งสิทธิ์ไว้ (ผู้ใช้สั่ง 26 ต.ค. 2569) */
export type LeaveQuota = { kind: LeaveKind; label: string; usedHours: number; ent: number };

/**
 * สิทธิ์ลาที่ใช้ไปในรอบปีที่วันนี้อยู่ — สิทธิ์จากหน้าตั้งค่าของผู้ดูแลระบบ (entitlementDays) + พักร้อนยกมา
 * สูตรเดียวกับ leaveOverIn ของฝ่ายบุคคล · ใช้ไป = วันลาที่อนุมัติแล้ว (แถวลาในเวลาทำงาน)
 */
export function leaveQuota(e: Employee, approvedRows: LeaveRow[], today: string): { from: string; to: string; items: LeaveQuota[] } {
  const sch = scheduleFor(e);
  const y = leaveYearOf(today);
  const period = leavePeriodOf(y);
  const [from, to] = periodRange(period);
  const rows = approvedRows.filter((x) => isWorkIso(x.d));
  const sumH = (kind: LeaveKind, a: string, b: string) =>
    rows.filter((x) => x.type === kind && x.d >= a && x.d <= b).reduce((s, x) => s + leaveRowHours(x, sch), 0);
  const max = settings().rates.vacationCarryMax;
  const items = (["personal", "vacation", "sick"] as LeaveKind[]).map((kind) => {
    const label = HR_LEAVE_LABEL[kind];
    let ent = entitlementDays(label, period);
    if (kind === "vacation" && max > 0) {
      const prev = leavePeriodOf(y - 1);
      const [pf, pt] = periodRange(prev);
      const base = entitlementDays(label, prev);
      if (base) ent += Math.min(max, Math.max(0, base - sumH(kind, pf, pt) / 8));
    }
    return { kind, label, usedHours: sumH(kind, from, to), ent };
  });
  return { from, to, items };
}

/** ใบลาหนึ่งใบในรายการคำขอลา */
export type LeaveReq = { key: string; type: string; from: string; to: string; hours: number; state: LeaveState };

/**
 * คำขอลารายใบ — ใบที่วันเริ่มลาอยู่ในช่วง + ใบที่ยังรออนุมัติทุกใบ (ผู้ใช้สั่ง 26 ต.ค. 2569)
 * แหล่งเดียวกับ leaveLines · ใบที่ยกเลิกไม่แสดง
 * วันลาที่อนุมัติแล้วที่ไม่มีใบ (ข้อมูลตั้งต้นของฝ่ายบุคคล) รวมวันทำงานที่ติดกันเป็นหนึ่งรายการ
 */
export function leaveRequests(
  e: Employee,
  approvedRows: LeaveRow[],
  roleLeave: LeaveRecord[],
  reqs: EmpRequest[],
  intern: InternLeave[],
  span: Span,
): LeaveReq[] {
  const sch = scheduleFor(e);
  const out: LeaveReq[] = [];
  const seen = new Set<string>();
  const push = (id: string, type: string, from: string, to: string | undefined, hours: number, state: LeaveState | null) => {
    if (!state || seen.has(id)) return;
    seen.add(id);
    out.push({ key: id, type, from, to: to && to > from ? to : from, hours, state });
  };
  const st = (s: string): LeaveState | null => (s === "approved" || s === "pending" || s === "rejected" ? s : null);
  for (const r of roleLeave) {
    const state: LeaveState | null =
      r.status === "อนุมัติแล้ว" ? "approved" : r.status === "รอการอนุมัติ" ? "pending" : r.status === "ไม่อนุมัติ" ? "rejected" : null;
    push(r.id, groupLabel(r.type), r.date, r.toDate, r.hours ?? r.days * 8, state);
  }
  for (const r of reqs) {
    if (r.kind !== "leave" || r.emp !== e.id || !r.from) continue;
    push(r.id, groupLabel(r.leaveType ?? ""), r.from, r.toDate, (r.days ?? 0) * 8, st(r.status));
  }
  for (const r of intern) {
    if (r.emp !== e.id) continue;
    push(r.id, HR_LEAVE_LABEL[r.lt], r.from, r.to, r.days * 8, st(r.status));
  }
  /* วันลาที่อนุมัติแล้วซึ่งไม่ได้มาจากใบข้างบน — มีเลขที่ใบ รวมตามเลขที่ · ไม่มี รวมวันทำงานติดกันประเภทเดียวกัน */
  const rest = approvedRows.filter((x) => isWorkIso(x.d) && !(x.no && seen.has(x.no))).sort((a, b) => a.d.localeCompare(b.d));
  const groups = new Map<string, LeaveRow[]>();
  let run: LeaveRow[] = [];
  const flush = () => {
    if (run.length) groups.set(`d|${run[0].d}|${run[0].type}`, run);
    run = [];
  };
  const nextWork = (iso: string) => {
    const d = parseIsoDate(iso);
    for (let i = 0; i < 14; i++) {
      d.setDate(d.getDate() + 1);
      const s = toIsoDate(d);
      if (isWorkIso(s)) return s;
    }
    return "";
  };
  for (const x of rest) {
    if (x.no) {
      groups.set(x.no, [...(groups.get(x.no) ?? []), x]);
      continue;
    }
    const prev = run[run.length - 1];
    const joined = prev && prev.type === x.type && prev.span === "full" && x.span === "full" && nextWork(prev.d) === x.d;
    if (!joined) flush();
    run.push(x);
  }
  flush();
  for (const [k, list] of groups) {
    push(k, HR_LEAVE_LABEL[list[0].type], list[0].d, list[list.length - 1].d, list.reduce((s, x) => s + leaveRowHours(x, sch), 0), "approved");
  }
  return out
    .filter((x) => x.state === "pending" || (x.from >= span.from && x.from <= span.to))
    .sort((a, b) => b.from.localeCompare(a.from));
}

/* ================= ค. KPI (ข้อมูลตัวอย่าง) ================= */
/*
 * ⚠️ ระบบยังไม่มีข้อมูล KPI จริงและยังไม่มีสูตรที่เจ้าของยืนยัน — ทั้งตัวชี้วัด เป้า และผลงานด้านล่างเป็นค่าสมมติ
 * เป้าต่อเดือนตามตำแหน่ง × จำนวนเดือนในช่วงที่ผ่านมาแล้ว · ผลงาน = เป้า × สัดส่วนสุ่มคงที่ต่อคน (62–111%)
 * ต้องแทนด้วยข้อมูลจริงเมื่อมีระบบบันทึก KPI
 */
export const KPI_IS_MOCK = true;
const KPI_BY_POS: Record<string, { metric: string; unit: string; perMonth: number }> = {
  graphic: { metric: "ชิ้นงานออกแบบที่ส่งผ่าน", unit: "ชิ้น", perMonth: 30 },
  content: { metric: "คอนเทนต์ที่เผยแพร่", unit: "ชิ้น", perMonth: 24 },
  media: { metric: "แคมเปญที่ดูแล", unit: "แคมเปญ", perMonth: 8 },
  pm: { metric: "โปรเจคที่ส่งมอบตามแผน", unit: "โปรเจค", perMonth: 3 },
  gm: { metric: "โปรเจคที่ปิดได้", unit: "โปรเจค", perMonth: 4 },
  bd: { metric: "นัดลูกค้าใหม่", unit: "นัด", perMonth: 12 },
  sales: { metric: "ดีลที่ปิดได้", unit: "ดีล", perMonth: 4 },
  website: { metric: "หน้าเว็บที่ส่งมอบ", unit: "หน้า", perMonth: 10 },
  sa: { metric: "เอกสารวิเคราะห์ระบบที่ส่ง", unit: "ฉบับ", perMonth: 4 },
  dev: { metric: "งานพัฒนาที่ปิดได้", unit: "งาน", perMonth: 12 },
  account_hr: { metric: "เอกสารบัญชีที่ปิดตามกำหนด", unit: "ฉบับ", perMonth: 60 },
  maid: { metric: "รอบทำความสะอาดตามตาราง", unit: "รอบ", perMonth: 40 },
};
const KPI_DEFAULT = { metric: "งานที่ปิดได้", unit: "งาน", perMonth: 10 };

export type KpiSum = { metric: string; unit: string; target: number; actual: number; pct: number | null; months: number; mock: true };

/** เดือนในช่วงที่ผ่านมาแล้ว (เดือนปัจจุบันนับเป็นหนึ่ง) */
function monthsElapsed(span: Span, today: string) {
  const end = span.to > today ? today : span.to;
  if (end < span.from) return 0;
  const a = parseIsoDate(span.from);
  const b = parseIsoDate(end);
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1;
}

function seed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) % 50;
}

export function kpiSum(e: Employee, span: Span, today: string): KpiSum {
  const k = KPI_BY_POS[e.pos] ?? KPI_DEFAULT;
  const months = monthsElapsed(span, today);
  const target = k.perMonth * months;
  const actual = Math.round(target * (0.62 + seed(`${e.id}|${span.from}`) / 100));
  return { metric: k.metric, unit: k.unit, target, actual, pct: pctOf(actual, target), months, mock: true };
}

/* ================= รูปพนักงาน ================= */
/*
 * ทะเบียนพนักงานยังไม่มีช่องรูป — ใช้รูปโปรไฟล์ที่เจ้าตัวตั้งจากบัญชีเข้าระบบ (profile-store เก็บตามบทบาท)
 * ผูกบทบาทกับรหัสพนักงานด้วย ROLE_EMPLOYEE · ไม่มีรูป = กล่องสี่เหลี่ยมตัวอักษรแรก
 */
const PHOTO_ROLES = Object.keys(ROLE_EMPLOYEE) as Role[];
let lastPhotos: (string | null)[] = [];
const NO_PHOTOS: (string | null)[] = [];
function photoSnap() {
  const now = PHOTO_ROLES.map((r) => getProfilePhoto(r));
  if (now.length === lastPhotos.length && now.every((v, i) => v === lastPhotos[i])) return lastPhotos;
  lastPhotos = now;
  return lastPhotos;
}
export function useEmpPhotos(): Record<string, string> {
  const list = useSyncExternalStore(subscribeProfilePhoto, photoSnap, () => NO_PHOTOS);
  return useMemo(() => {
    const out: Record<string, string> = {};
    PHOTO_ROLES.forEach((r, i) => {
      const id = ROLE_EMPLOYEE[r];
      const url = list[i];
      if (id && url && !out[id]) out[id] = url;
    });
    return out;
  }, [list]);
}

/* ================= ฮุกรวบข้อมูล ================= */
export type PerfSources = ReturnType<typeof usePerfSources>;

/** แหล่งข้อมูลทุกชุดที่หน้าประสิทธิภาพใช้ — อ่านจากสโตร์เดียวกับหน้าอื่น ตัวเลขจึงขยับตามทันที */
export function usePerfSources() {
  const hr = useHr();
  const time = useHrTime();
  const punch = usePunchTimes();
  const pm = usePm();
  const leave = useAllLeave();
  const reqs = useEmpRequests();
  const homes = useMemo(() => taskHomes(pm), [pm]);
  return useMemo(() => ({ hr, time, punch, homes, leave, reqs }), [hr, time, punch, homes, leave, reqs]);
}

/** ใบลาของทุกบทบาทที่ผูกกับคนนี้ */
export function roleLeaveOf(all: Record<Role, LeaveRecord[]>, id: string): LeaveRecord[] {
  return (Object.entries(ROLE_EMPLOYEE) as [Role, string][]).filter(([, x]) => x === id).flatMap(([r]) => all[r] ?? []);
}

export type PerfOf = { task: TaskSum; att: AttSum; kpi: KpiSum };

/** สามตัววัดของคนหนึ่งในช่วงหนึ่ง — ชุดเดียวกันทั้งแถบในหน้ารายชื่อและหัวหน้ารายคน */
export function perfOf(src: PerfSources, e: Employee, span: Span, today: string): PerfOf {
  const rec = src.time[e.id];
  const extra = internLeaveRows(src.hr.internLeave ?? [], e.id, rec?.leave ?? []);
  return {
    task: taskSum(src.homes, e.id, span, today),
    att: attSum(e, src.punch[e.id], rec, extra, span, today),
    kpi: kpiSum(e, span, today),
  };
}

/** ช่วยอ่าน: วันลาที่อนุมัติแล้วของคนนี้ (ใช้ในหน้ารายคน) */
export function approvedLeaveRows(src: PerfSources, id: string): LeaveRow[] {
  const rec = src.time[id];
  return [...(rec?.leave ?? []), ...internLeaveRows(src.hr.internLeave ?? [], id, rec?.leave ?? [])];
}

