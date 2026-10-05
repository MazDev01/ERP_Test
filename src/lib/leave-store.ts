"use client";

import {
  currentPeriod,
  leaveYearOf,
  periodRange,
  entitlements,
  fixLeaveStatuses,
  leavePeriodOf,
  LEAVE_RECORDS,
  type LeaveRecord,
  type LeaveStatus,
  type LeaveType,
} from "./leave-data";
import { currentRole, type Role } from "./role";
import { settings } from "./system-settings";
import { createRoleStore } from "./role-store";
import { bkkStamp, nextDocNo } from "./format";
import { HR_INTERN_LEAVE } from "./hr-data";
import { USERS } from "./mock-data";
import { empRequestIds } from "./emp-requests";

/*
 * ใบลาของผู้ที่ล็อกอินอยู่ — แยกเก็บตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน
 * ยื่นใบลา → เพิ่มที่นี่ → หน้าการลาของฉัน / สิทธิ์ / แจ้งเตือน เห็นพร้อมกัน
 */
const store = createRoleStore<LeaveRecord[]>(
  "maz-hrm.leave.v3",
  LEAVE_RECORDS,
  (v): v is LeaveRecord[] => Array.isArray(v),
  fixLeaveStatuses,
);

export function useLeaveRecords() {
  return store.use();
}

export function addLeaveRequest(input: {
  type: LeaveType;
  from: string;
  to: string;
  days: number;
  half?: "morning" | "afternoon";
  startMin?: number;
  endMin?: number;
  /** ลาด่วนรายชั่วโมง — days ที่ส่งมาต้องแปลงจากชั่วโมงมาแล้ว */
  hours?: number;
  reason: string;
  employee: string;
  files?: string[];
}) {
  const record: LeaveRecord = {
    /* เลขที่ใบลาตาม ERD: LV-ปี พ.ศ.-ลำดับ เดินต่อกันทั้งบริษัท รวมใบลาของนักศึกษาฝึกงาน */
    /* รวมเลขที่ของใบลาที่ยื่นผ่านคำขอของทีมงาน (emp-requests) ด้วย ไม่งั้นเลขซ้ำกับคิวของ GM */
    id: nextDocNo("LV", [
      ...store.all().flat().map((r) => r.id),
      ...HR_INTERN_LEAVE.map((r) => r.id),
      ...empRequestIds("leave"),
    ]),
    date: input.from,
    toDate: input.to,
    employee: input.employee,
    type: input.type,
    days: input.days,
    half: input.half,
    startMin: input.startMin,
    endMin: input.endMin,
    hours: input.hours,
    status: "รอการอนุมัติ",
    comment: input.reason,
    files: input.files?.length ? input.files : undefined,
    /* เวลาที่ยื่นจริง — หน้าอนุมัติใช้เป็น "ส่งเมื่อ" และนับวันที่รอ */
    submittedAt: bkkStamp(),
  };
  store.update((records) => [record, ...records]);
  return record;
}

/**
 * ถอนใบลาที่ยังรออนุมัติ — เปลี่ยนสถานะเป็น "ยกเลิก" พร้อมเหตุผลและผู้ยกเลิก ห้ามลบทิ้ง
 * (ผู้ใช้ตัดสิน 23 ก.ย. 2569 — เหมือนกติกาเอกสารการเงิน ใบยังอยู่ เลขที่จึงไม่ถูกใช้ซ้ำ)
 * วันที่ยกเลิกไม่ถูกนับเป็นวันลา เพราะสิทธิ์ถูกตัดตอนอนุมัติเท่านั้น (leaveUsage)
 * ใบที่ตัดสินแล้วถอนไม่ได้
 */
export function cancelLeaveRequest(id: string, reason: string) {
  const by = USERS[currentRole()]?.name ?? "";
  store.update((records) =>
    records.map((r) =>
      r.id === id && r.status === "รอการอนุมัติ"
        ? {
            ...r,
            status: "ยกเลิก" as const,
            cancelReason: reason.trim(),
            cancelledBy: by,
            cancelledAt: bkkStamp(),
          }
        : r,
    ),
  );
}

/** ใบลาของทุกบทบาท — หน้าอนุมัติเท่านั้น */
export function useAllLeave() {
  return store.useAll();
}

/** หัวหน้าอนุมัติใบลา */
export function approveLeave(role: Role, id: string) {
  store.updateRole(role, (records) =>
    records.map((r) =>
      r.id === id && r.status === "รอการอนุมัติ"
        ? { ...r, status: "อนุมัติแล้ว", decidedAt: bkkStamp() }
        : r,
    ),
  );
}

export function rejectLeave(role: Role, id: string, reason: string) {
  store.updateRole(role, (records) =>
    records.map((r) =>
      r.id === id && r.status === "รอการอนุมัติ"
        ? { ...r, status: "ไม่อนุมัติ", comment: reason || r.comment, decidedAt: bkkStamp() }
        : r,
    ),
  );
}

export function resetLeaveRecords() {
  store.reset();
}

// ─── ตัวคำนวณที่อ่านจากใบลาชุดปัจจุบัน ─────────────────────────────
export function daysByStatus(
  records: LeaveRecord[],
  type: LeaveType,
  period: string,
  status: LeaveStatus,
) {
  const [from, to] = periodRange(period);
  return records
    .filter((r) => r.type === type && r.date >= from && r.date <= to && r.status === status)
    .reduce((sum, r) => sum + r.days, 0);
}

function baseDays(type: LeaveType, period: string) {
  return entitlements().filter((e) => e.type === type && e.period === period).reduce(
    (sum, e) => sum + e.days,
    0,
  );
}

/**
 * ลาพักร้อนที่ยกมาจากปีก่อน — ส่วนที่ปีก่อนยังไม่ได้ใช้ ไม่เกินเพดานที่ผู้ดูแลระบบตั้ง (vacationCarryMax)
 * คิดจากสิทธิ์ปกติของปีก่อนเท่านั้น วันที่ยกมาแล้วไม่ยกต่ออีกทอด · เพดาน 0 = ไม่ยกยอด
 */
export function carriedDays(records: LeaveRecord[], type: LeaveType, period: string) {
  const max = settings().rates.vacationCarryMax;
  if (type !== "ลาพักร้อน" || !(max > 0)) return 0;
  const prev = leavePeriodOf(leaveYearOf(periodRange(period)[0]) - 1);
  const base = baseDays(type, prev);
  if (!base) return 0;
  /* ยกมาเฉพาะส่วนที่ปีก่อน "ไม่ได้ใช้จริง" — ใบที่ยังรออนุมัติข้ามปียังไม่ได้ตัดสิทธิ์ */
  const used = daysByStatus(records, type, prev, "อนุมัติแล้ว");
  return Math.min(max, Math.max(0, base - used));
}

/** สิทธิ์ของรอบปีนั้น — ส่งใบลาของคนนั้นมาด้วยเพื่อรวมลาพักร้อนที่ยกมาจากปีก่อน */
export function entitlementDays(type: LeaveType, period: string, records?: LeaveRecord[]) {
  return baseDays(type, period) + (records ? carriedDays(records, type, period) : 0);
}

/**
 * สิทธิ์วันลาของประเภทหนึ่งในรอบปีหนึ่ง — ตัวคำนวณชุดเดียวของทั้งระบบ
 *
 * กติกา (ผู้ใช้ตัดสิน 24 ก.ย. 2569): **สิทธิ์ถูกตัดตอนอนุมัติเท่านั้น**
 * ยื่นใบลาไม่เท่ากับได้ลา ใบที่ยังรออนุมัติจึงไม่หักสิทธิ์ แต่แสดงแยกไว้ (pending)
 * ให้ผู้อนุมัติกับ PM เห็นว่ายังมีอะไรค้างอยู่ ก่อนหน้านี้นับรวมทันทีตั้งแต่ยื่น
 * คนที่ถูกตีกลับจึงเสียสิทธิ์ทั้งที่มาทำงาน และตัวเลขแต่ละหน้าไม่ตรงกัน
 *
 * ลาเกินสิทธิ์: สิทธิ์คงเหลือไม่ติดลบ ส่วนที่เกิน (over) ถือเป็นลาไม่รับค่าจ้าง
 * หักจากเงินเดือน — ทุกหน้าพูดตรงกันแบบนี้ ไม่ใช่หน้าหนึ่งบอก 0 อีกหน้าบอก −1
 */
export type LeaveUsage = {
  /** สิทธิ์ทั้งรอบ รวมวันที่ยกมาจากปีก่อน */
  entitled: number;
  /** อนุมัติแล้ว = ที่หักสิทธิ์ไปจริง */
  approved: number;
  /** ยื่นแล้วแต่ยังไม่ตัดสิน — ยังไม่หักสิทธิ์ */
  pending: number;
  /** คงเหลือ = สิทธิ์ − อนุมัติแล้ว (ไม่ติดลบ) */
  remaining: number;
  /** คงเหลือถ้าใบที่รออนุมัติได้รับอนุมัติครบ (ไม่ติดลบ) */
  afterPending: number;
  /** ส่วนที่อนุมัติไปเกินสิทธิ์ — ลาไม่รับค่าจ้าง หักเงินเดือน */
  over: number;
};

export function leaveUsage(
  records: LeaveRecord[],
  type: LeaveType,
  period: string = currentPeriod(),
): LeaveUsage {
  const entitled = entitlementDays(type, period, records);
  const approved = daysByStatus(records, type, period, "อนุมัติแล้ว");
  const pending = daysByStatus(records, type, period, "รอการอนุมัติ");
  return {
    entitled,
    approved,
    pending,
    remaining: Math.max(0, entitled - approved),
    afterPending: Math.max(0, entitled - approved - pending),
    over: Math.max(0, approved - entitled),
  };
}

/**
 * ส่วนที่เกินสิทธิ์ถ้าใบขนาด days วันนี้ได้รับอนุมัติ — **สูตรเดียวของทั้งระบบ**
 *
 * จอยื่นใบลา จอผู้อนุมัติของ GM และจอของ CEO ต้องได้เลขเดียวกันเสมอ
 * (24 ก.ย. 2569 — เคยต่างกัน 2 วัน เพราะจอยื่นหักใบที่ยังรออนุมัติออกไปด้วย
 * แต่กติกาคือสิทธิ์ตัดตอนอนุมัติเท่านั้น ใบที่รออนุมัติจึงห้ามเอามาหักสิทธิ์
 * ความต่างนั้นแปลว่าหักเงินเดือนไม่เท่ากันคนละจอ จึงถือเป็นข้อผิดพลาด ไม่ใช่มุมมองที่ต่างกัน)
 *
 * ใบที่รออนุมัติยังต้องบอกผู้ยื่นอยู่ แต่บอกแยกบรรทัดว่า "รออนุมัติ x วัน" (LeaveUsage.pending)
 */
export function excessDays(
  records: LeaveRecord[],
  type: LeaveType,
  days: number,
  period: string = currentPeriod(),
) {
  return Math.max(0, days - leaveUsage(records, type, period).remaining);
}

/** วันลาคงเหลือ = สิทธิ์ − ที่อนุมัติแล้ว (ใบที่ยังรออนุมัติไม่หักสิทธิ์) */
export function remainingDays(
  records: LeaveRecord[],
  type: LeaveType,
  period: string = currentPeriod(),
) {
  return leaveUsage(records, type, period).remaining;
}

/** ใบลาที่ครอบคลุมวันที่ระบุ (yyyy-mm-dd) และไม่ได้ถูกตีกลับ */
export function leavesOnDate(records: LeaveRecord[], day: string) {
  return records.filter(
    (r) =>
      r.date <= day &&
      day <= r.toDate &&
      r.status !== "ไม่อนุมัติ" &&
      r.status !== "ยกเลิก",
  );
}

/**
 * สิทธิ์คงเหลือถ้าอนุมัติใบนี้ = คงเหลือตอนนี้ − จำนวนวันของใบนี้
 *
 * ทุกหน้าที่แสดงตัวเลขนี้ต้องเรียกตัวนี้ (หน้าอนุมัติของ GM และของ CEO)
 * คิดจากใบลาของคนนั้นทั้งรอบเสมอ ไม่เชื่อยอด usedBefore ที่ติดมากับใบตั้งต้นอีกแล้ว
 * (24 ก.ย. 2569 — ยอดนั้นนับใบที่ยังรออนุมัติไว้ด้วย CEO จึงเห็นเลขไม่ตรงกับหน้าการลาของผู้ยื่น)
 * ติดลบ = ใบนี้ทำให้ลาเกินสิทธิ์ หน้าอนุมัติแสดงเป็น "เกินสิทธิ์ x วัน"
 */
export function quotaAfterLeave(records: LeaveRecord[], v: LeaveRecord) {
  /* ติดลบเท่ากับ excessDays() ของใบเดียวกันเสมอ — สองจอจึงพูดเลขเดียวกัน */
  return remainingDays(records, v.type, currentPeriod()) - v.days;
}

/**
 * สิทธิ์คงเหลือถ้าอนุมัติใบนี้ สำหรับคำขอของพนักงานที่ยังไม่มีบัญชีเข้าระบบ (emp-requests)
 * คนกลุ่มนี้ยังไม่มีใบลาในสโตร์ ยอดที่ใช้ไปแล้วจึงติดมากับตัวคำขอ (used)
 */
export function quotaAfterUsed(type: LeaveType, used: number, days: number) {
  return Math.max(0, entitlementDays(type, currentPeriod()) - used) - days;
}

/**
 * ช่วงที่คนหนึ่งไม่อยู่ — รูปกลางของ "ใครไม่อยู่วันไหน"
 * ใบลาของบทบาทที่ล็อกอินได้ กับคำขอลาของทีมงาน (emp-requests) คนละรูปกัน แต่ความหมายเดียวกัน
 */
export type AwaySpan = {
  id: string;
  who: string;
  type: string;
  date: string;
  toDate: string;
  /** ยังไม่ตัดสิน — ผู้อนุมัติต้องแยกออกจากใบที่อนุมัติไปแล้ว */
  pending: boolean;
};

/** ช่วงที่ไม่อยู่จากใบลาของทุกบทบาท — ใบที่ไม่อนุมัติหรือยกเลิกแล้วไม่นับ */
export function awaySpans(all: Record<Role, LeaveRecord[]>): AwaySpan[] {
  const out: AwaySpan[] = [];
  const seen = new Set<string>();
  for (const list of Object.values(all))
    for (const r of list) {
      if (seen.has(r.id)) continue;
      if (r.status === "ไม่อนุมัติ" || r.status === "ยกเลิก") continue;
      seen.add(r.id);
      out.push({
        id: r.id,
        who: r.employee,
        type: r.type,
        date: r.date,
        toDate: r.toDate,
        pending: r.status === "รอการอนุมัติ",
      });
    }
  return out;
}

/**
 * คนอื่นที่ไม่อยู่ช่วงวันเดียวกับใบที่กำลังตัดสิน
 *
 * การอนุมัติลาตัดสินจากตรงนี้เป็นหลัก: อนุมัติแล้วเหลือคนทำงานไหม
 * ผู้อนุมัติที่ไม่เห็นข้อนี้ต้องไปไล่ถามกันเองนอกระบบ
 */
export function othersAway(spans: AwaySpan[], me: { id: string; who: string; date: string; toDate: string }) {
  return spans
    .filter((s) => s.id !== me.id && s.who !== me.who && s.date <= me.toDate && me.date <= s.toDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}
