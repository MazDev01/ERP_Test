"use client";

/*
 * ลาแล้วแต่มีเช็คอิน (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * ใช้ร่วมกันระหว่างหน้าสรุปเวลาทำงาน (/hr/timesheet) และหน้าคำนวณเงินเดือน (/hr/payroll)
 * วันที่ HR กด "ยืนยันแล้ว" ไม่ฟ้องแดงและไม่นับเป็นรายการที่ต้องตรวจ
 */

import { useMemo } from "react";
import { companySchedule, minutesOfDay, scheduleFor, type DaySchedule } from "./work-schedule";
import { HR_LEAVE_LABEL, leaveRowHours, recInRange, type ClashOk, type Cycle, type DayFix, type LeaveRow, type TimeRec } from "./hr-data";
import { useHrTime, usePunchTimes, type PunchDay } from "./hr-link";
import { useHr } from "./hr-store";
import { todayIso } from "./format";
import { fmtLeaveHours } from "./leave-data";

/*
 * ด่านปิดรอบเวลาทำงานเมื่อยังมีวันลาที่มีเช็คอินที่ HR ยังไม่ยืนยัน (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * กติกาจริง: ห้ามปิดรอบจนกว่าจะยืนยันครบ — แต่ช่วงทดสอบกับลูกค้ายังต้องปิดรอบได้
 *   true  = เตือนแล้วปิดได้ (ช่วงทดสอบ)
 *   false = ปุ่มปิดรอบกดไม่ได้ พร้อมบอกเหตุผล (หน้าคำนวณเงินเดือนก็กันปิดรอบด้วย)
 * TODO: ⚠️ เปลี่ยนเป็น false ก่อนขึ้นระบบจริง (production)
 */
/* ปิดช่วงทดสอบแล้ว — ต้องแก้ให้ครบก่อนจึงปิดรอบได้ (ผู้ใช้สั่ง 30 ต.ค. 2569) */
export const TESTING_ALLOW_CLOSE = false;

export const clashKey = (emp: string, d: string) => `${emp}|${d}`;

export type DayTimes = { in: string; out: string };

/** "08:30" + 15 นาที → "08:45" */
export function addMin(hm: string, min: number) {
  const [h, m] = hm.split(":").map(Number);
  const t = h * 60 + m + min;
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

/**
 * เวลาเข้า-ออกที่ "มีอยู่จริง" ของวันหนึ่ง — ไม่ใช่เวลาสมมติที่กล่องรายวันเติมให้
 * ลำดับ: ที่ฝ่ายบุคคลแก้ไว้ → ตอกบัตรจริง → ใบที่ลงเวลาไม่ครบ → มาสาย (แปลว่าตอกเข้าแล้ว)
 * ไม่มีอะไรเลย = null
 */
export function evidenceOf(
  d: string,
  rec: TimeRec,
  fixes: DayFix[],
  punch?: Record<string, PunchDay>,
  sch: DaySchedule = companySchedule(),
): DayTimes | null {
  const f = fixes.find((x) => x.d === d);
  if (f) return { in: f.in, out: f.out };
  const p = punch?.[d];
  if (p) return p;
  const late = rec.late.find((x) => x.d === d);
  const issue = rec.issues.find((x) => x.d === d);
  if (issue?.in || issue?.out) return { in: issue.in ?? "", out: issue.out ?? "" };
  if (issue?.kind === "nopair" || late) {
    /* เวลาเข้างานของคนนั้น — แม่บ้าน 08:00 (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    return { in: addMin(sch.start, late?.min ?? 0), out: "" };
  }
  return null;
}

/**
 * เวลาเข้า-ออกทับช่วงที่ลาไหม
 * ลาทั้งวัน = ตอกอะไรก็ตาม · ลาเช้า = ตอกก่อนเริ่มพักกลางวัน · ลาบ่าย = ตอกหลังเลิกพักกลางวัน
 * ลาครึ่งวันที่ไม่รู้ว่าช่วงไหน (แถวที่ผู้ใช้สร้างเองแบบเก่า) ตรวจไม่ได้ จึงไม่ฟ้อง
 */
export function leaveClash(lv: LeaveRow | undefined, t: DayTimes | null, sch: DaySchedule = companySchedule()) {
  if (!lv || !t) return false;
  const mins = [t.in, t.out].filter(Boolean).map(minutesOfDay);
  if (!mins.length) return false;
  if (lv.span === "full") return true;
  if (lv.half === "am") return mins.some((m) => m < minutesOfDay(sch.lunchStart));
  if (lv.half === "pm") return mins.some((m) => m > minutesOfDay(sch.lunchEnd));
  return false;
}

/**
 * วันลาที่อนุมัติแล้วแต่ยังมีเวลาตอกทับช่วงลา และ HR ยังไม่ยืนยัน — นับเป็นรายการที่ต้องตรวจ
 * ok ไม่ส่งมา = นับทุกวันที่ทับ
 */
export function clashDays(
  emp: string,
  rec: TimeRec,
  fixes: DayFix[],
  punch: Record<string, PunchDay> | undefined,
  upTo: string,
  ok: Record<string, ClashOk> = {},
  sch: DaySchedule = companySchedule(),
) {
  return rec.leave
    .filter((lv) => lv.d <= upTo && !ok[clashKey(emp, lv.d)] && leaveClash(lv, evidenceOf(lv.d, rec, fixes, punch, sch), sch))
    .map((lv) => lv.d);
}

/** "ลาพักร้อน" (เต็มวัน) · "ลากิจช่วงเช้า 3 ชม." · "ลากิจ 2 ชม." — ไม่เต็มวันบอกชั่วโมงจริง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function leaveText(lv: LeaveRow, sch?: DaySchedule) {
  if (lv.span === "full") return HR_LEAVE_LABEL[lv.type];
  const part = lv.half === "am" ? "ช่วงเช้า" : lv.half === "pm" ? "ช่วงบ่าย" : "";
  return `${HR_LEAVE_LABEL[lv.type]}${part} ${fmtLeaveHours(leaveRowHours(lv, sch))}`;
}

export type ClashItem = { emp: string; d: string; lv: LeaveRow };

/** วันลาที่มีเช็คอินและยังไม่ยืนยัน ของคนในรายการ ในช่วงที่ดูอยู่ (นับถึงวันนี้) */
export function useOpenClashes(ids: string[], range: Cycle): ClashItem[] {
  const hr = useHr();
  const time = useHrTime();
  const punch = usePunchTimes();
  const today = todayIso();
  const key = ids.join(",");
  return useMemo(() => {
    const out: ClashItem[] = [];
    for (const id of key ? key.split(",") : []) {
      const rec = recInRange(time, id, range);
      const sch = scheduleFor(hr.emp.find((e) => e.id === id));
      for (const d of clashDays(id, rec, hr.time[id]?.fix ?? [], punch[id], today, hr.clashOk, sch)) {
        const lv = rec.leave.find((x) => x.d === d);
        if (lv) out.push({ emp: id, d, lv });
      }
    }
    return out.sort((a, b) => a.d.localeCompare(b.d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range.from, range.to, time, punch, hr.time, hr.emp, hr.clashOk, today]);
}
