/*
 * ข้อมูลการลา (จำลอง) — โครงเดียวกับระบบเดิม
 * เมื่อต่อ API แล้วให้แทนที่ค่าคงที่เหล่านี้ด้วยข้อมูลจริง
 */

/* ประเภทตั้งต้นของระบบ — ลบไม่ได้ เพราะใบลาเก่าและการสรุปของฝ่ายบุคคลอ้างชื่อพวกนี้อยู่
   ผู้ดูแลระบบเพิ่มประเภทใหม่ได้ที่ /admin/leave (เก็บใน settings().leave) อ่านผ่าน leaveTypes() */
/* ทั้งบริษัทมีสามประเภทเท่านั้น: ลากิจ 3 · ลาพักร้อน 6 · ลาป่วย 30 วันต่อปี
   เลิกลาคลอดและลาไม่รับค่าจ้าง (ผู้ใช้สั่ง 9 ต.ค. 2569) — ชื่อที่เก็บในใบลายังเป็น "ลากิจ" ชื่อที่แสดงอ่านผ่าน leaveLabel() */
export const LEAVE_TYPES = [
  "ลากิจ",
  "ลาพักร้อน",
  "ลาป่วย",
] as const;

/** ประเภทที่เลิกใช้แล้ว — ใบลาเก่าที่ยังเก็บชื่อนี้ย้ายเป็นลากิจ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export const RETIRED_LEAVE_TYPES = ["ลาคลอด", "ลาไม่รับค่าจ้าง"];

/** ชื่อประเภทที่แสดงบนหน้าจอ — ลากิจรวมลาด่วนรายชั่วโมงไว้ด้วย (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export function leaveLabel(type: string) {
  /* ใช้ชื่อ "ลากิจ" ตรง ๆ ไม่มีลาด่วนต่อท้าย (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  return type;
}

import type { Role } from "./role";
import { settings } from "./system-settings";
import { todayIso } from "./format";
import { companySchedule, minutesOfDay, type DaySchedule } from "./work-schedule";

/*
 * ─── นับการลาเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569) ───
 * 1 วัน = 8 ชั่วโมงเสมอ (เวลาเข้า–ออกหักพักเที่ยง · แม่บ้าน 08–17 ก็ 8 ชม.)
 * ใบลายังเก็บ days เป็นหน่วยภายใน (= ชั่วโมง ÷ 8) สิทธิ์และสูตรเดิมทุกตัวจึงไม่ต้องเปลี่ยน
 * แต่ทุกหน้าที่แสดงจำนวนการลาต้องพิมพ์ผ่าน fmtLeave() ตัวเดียว: "2 วัน" · "4 ชม." · "1 วัน 4 ชม."
 */
export const LEAVE_DAY_HOURS = 8;

/** ชั่วโมง → วัน (หน่วยภายในของใบลา) ไม่ปัด — 3 ชม. = 0.375 วัน */
export function leaveDaysOfHours(h: number) {
  return Math.round((Math.max(0, h) / LEAVE_DAY_HOURS) * 1e6) / 1e6;
}

/** วัน (หน่วยภายใน) → ชั่วโมง ปัดเป็นนาที */
export function leaveHoursOfDays(days: number) {
  return Math.round(days * LEAVE_DAY_HOURS * 60) / 60;
}

/** จำนวนชั่วโมงเป็นข้อความ — "4 ชม." · "1 ชม. 30 นาที" · "1 วัน 4 ชม." · "2 วัน" (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function fmtLeaveHours(hours: number) {
  const min = Math.round(Math.abs(hours) * 60);
  const sign = hours < 0 && min > 0 ? "−" : "";
  const d = Math.floor(min / (LEAVE_DAY_HOURS * 60));
  const rest = min - d * LEAVE_DAY_HOURS * 60;
  const h = Math.floor(rest / 60);
  const m = rest - h * 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} วัน`);
  if (h) parts.push(`${h} ชม.`);
  if (m) parts.push(`${m} นาที`);
  return sign + (parts.length ? parts.join(" ") : "0 ชม.");
}

/** จำนวนการลา/สิทธิ์ที่เก็บเป็นวัน (หน่วยภายใน) เป็นข้อความชั่วโมง — ตัวพิมพ์ตัวเดียวของทั้งระบบ */
export function fmtLeave(days: number) {
  return fmtLeaveHours(leaveHoursOfDays(days));
}

/** ช่วงลาครึ่งวันตามเวลาทำงานของคนนั้น — เช้า = เข้างาน→เริ่มพัก · บ่าย = เลิกพัก→เลิกงาน (นาทีของวัน) */
export function halfWindow(half: "morning" | "afternoon", sch: DaySchedule = companySchedule()) {
  return half === "morning"
    ? { start: minutesOfDay(sch.start), end: minutesOfDay(sch.lunchStart) }
    : { start: minutesOfDay(sch.lunchEnd), end: minutesOfDay(sch.end) };
}

/** ชั่วโมงจริงของลาครึ่งวัน — 09:00–12:00 = 3 ชม. ไม่ใช่ครึ่งวันตายตัว (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function halfHours(half: "morning" | "afternoon", sch: DaySchedule = companySchedule()) {
  const w = halfWindow(half, sch);
  return Math.max(0, w.end - w.start) / 60;
}

/** ชั่วโมงของใบลา — ใบใหม่เก็บ hours ไว้แล้ว · ใบเก่าเต็มวันคิด days × 8 */
export function leaveHoursOf(r: { days: number; hours?: number }) {
  return r.hours ?? leaveHoursOfDays(r.days);
}

/**
 * ใบลาครึ่งวันที่บันทึกไว้ก่อนนับเป็นชั่วโมง (days = 0.5 ตายตัว) → ชั่วโมงจริงของช่วง (ผู้ใช้สั่ง 19 ต.ค. 2569)
 * ใช้ช่วงเวลาที่ติดมากับใบ (startMin/endMin) ก่อน ไม่มีก็คิดจากเวลาทำงานของบริษัท
 * ใบที่มีชั่วโมงอยู่แล้ว (ลารายชั่วโมง/ใบใหม่) ไม่ถูกแตะ
 */
export function fixHalfLeaveHours<T extends { days: number; hours?: number; half?: "morning" | "afternoon"; startMin?: number; endMin?: number }>(r: T): T {
  if (!r.half || r.hours != null) return r;
  const sch = companySchedule();
  const w = r.startMin != null && r.endMin != null ? { start: r.startMin, end: r.endMin } : halfWindow(r.half, sch);
  /* ช่วงที่คร่อมพักเที่ยงหักพักออก */
  const lunch = Math.max(0, Math.min(w.end, minutesOfDay(sch.lunchEnd)) - Math.max(w.start, minutesOfDay(sch.lunchStart)));
  const h = Math.max(0, w.end - w.start - lunch) / 60;
  if (!(h > 0)) return r;
  return { ...r, hours: h, days: leaveDaysOfHours(h) };
}

/** ชื่อประเภทการลา — ประเภทตั้งต้น หรือประเภทที่ผู้ดูแลระบบเพิ่มเอง */
export type LeaveType = string;

export function isBuiltinLeave(type: string) {
  return (LEAVE_TYPES as readonly string[]).includes(type);
}

/** ประเภทการลาทั้งหมดตามลำดับในหน้าตั้งค่า — ประเภทตั้งต้นที่ไม่อยู่ในค่าที่บันทึกไว้ต่อท้ายให้ */
export function leaveTypes(): string[] {
  /* ประเภทที่ปิดใช้งานไม่ขึ้นให้เลือกใหม่ — ใบลาเก่ายังเก็บชื่อเดิมไว้ */
  const all = settings().leave;
  const set = all.filter((q) => !q.off).map((q) => q.type);
  return [...set, ...LEAVE_TYPES.filter((t) => !all.some((q) => q.type === t))];
}

/** คำอธิบายสั้นใต้ชื่อประเภท */
export function leaveNote(type: string) {
  return settings().leave.find((q) => q.type === type)?.note ?? BUILTIN_NOTE[type] ?? "";
}

const BUILTIN_NOTE: Record<string, string> = {
  ลาพักร้อน: "ต้องยื่นล่วงหน้า",
  ลาป่วย: "ลาเกิน 3 วันต้องมีใบรับรองแพทย์",
  ลากิจ: "ธุระส่วนตัวที่เลี่ยงไม่ได้",
};

/*
 * รอบปีการลา — ขึ้นรอบใหม่เองทุกปีตามวันที่จริง (เวลาไทย) ในวันที่ผู้ดูแลระบบตั้งไว้
 * ค่าตั้งต้น 1 ม.ค. (rates.leaveYearStart = "01-01") · ตั้งเป็น 1 เม.ย. ก็ได้ รอบจะเป็น 1 เม.ย. – 31 มี.ค.
 * (เดิมเขียนปี 2026 ตายตัว — ผู้ใช้สั่งให้ขึ้นรอบอัตโนมัติและเลือกวันเริ่มได้ 22 ก.ย. 2569)
 *
 * รอบระบุด้วยข้อความ "yyyy-mm-dd - yyyy-mm-dd" · ปีของรอบ = ปีของวันเริ่ม
 */
function startMD() {
  const v = settings().rates.leaveYearStart;
  return /^\d{2}-\d{2}$/.test(v ?? "") ? v : "01-01";
}

export function leavePeriodOf(year: number) {
  const from = `${year}-${startMD()}`;
  const end = new Date(`${year + 1}-${startMD()}T00:00:00`);
  end.setDate(end.getDate() - 1);
  const to = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}-${String(end.getDate()).padStart(2, "0")}`;
  return `${from} - ${to}`;
}

/** วันเริ่มและวันสิ้นสุดของรอบ */
export function periodRange(period: string): [string, string] {
  const [from, to] = period.split(" - ");
  return [from, to];
}

/** ปีของรอบที่วันนี้ (หรือวันที่ระบุ) อยู่ */
export function leaveYearOf(date: string) {
  const y = Number(date.slice(0, 4));
  return date.slice(5) >= startMD() ? y : y - 1;
}

/** ปีแรกที่สิทธิ์วันลามาจากหน้าตั้งค่า — ก่อนหน้านั้นเป็นประวัติใน PAST_ENTITLEMENTS */
const SETTINGS_FROM_YEAR = 2026;

/** รอบปีการลาปัจจุบัน */
export function currentPeriod() {
  return leavePeriodOf(leaveYearOf(todayIso()));
}

/** รอบปีที่เลือกดูได้ — ตั้งแต่ 2023 ถึงรอบปีหน้า */
export function leavePeriods(): string[] {
  const now = leaveYearOf(todayIso());
  return Array.from({ length: now + 1 - 2023 + 1 }, (_, i) => leavePeriodOf(2023 + i));
}

/*
 * ใบลามีสี่สถานะ
 *   ยื่นเสร็จ → รอการอนุมัติ → อนุมัติแล้ว หรือ ไม่อนุมัติ
 *   ผู้ยื่นถอนเอง → ยกเลิก
 *
 * ถอนใบลา = เปลี่ยนสถานะเป็น "ยกเลิก" พร้อมเหตุผลและผู้ยกเลิก ห้ามลบทิ้ง (ผู้ใช้ตัดสิน 23 ก.ย. 2569)
 * เหมือนกติกาเอกสารการเงิน — ใบที่อนุมัติแล้วกระทบสิทธิ์วันลาและเงินเดือน ต้องตามรอยย้อนหลังได้
 * และเลขที่ใบที่ยกเลิกแล้วต้องไม่ถูกนำกลับมาใช้ซ้ำ (ใบยังอยู่ในสโตร์ nextDocNo จึงข้ามเลขนั้นให้เอง)
 */
export const LEAVE_STATUSES = ["รอการอนุมัติ", "อนุมัติแล้ว", "ไม่อนุมัติ", "ยกเลิก"] as const;

export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** แปลงใบลาที่บันทึกไว้ก่อนให้ตรงกับชุดสถานะปัจจุบัน — ใบที่ยกเลิกแล้วเก็บไว้ ไม่ทิ้ง */
export function fixLeaveStatuses(records: LeaveRecord[]): LeaveRecord[] {
  const old = (r: LeaveRecord) => r.status as string;
  /* ประเภทที่เลิกใช้ย้ายเป็นลากิจ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  /* ครึ่งวันแบบเก่า (0.5 วัน) → ชั่วโมงจริงของช่วงเช้า/บ่าย (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const typed = records.map((r) => fixHalfLeaveHours(RETIRED_LEAVE_TYPES.includes(r.type) ? { ...r, type: "ลากิจ" } : r));
  return typed.map((r) =>
    old(r) === "ตามกำหนดการ" || old(r) === "ใช้ไปแล้ว"
      ? { ...r, status: "อนุมัติแล้ว" }
      : old(r) === "ถูกปฏิเสธ"
        ? { ...r, status: "ไม่อนุมัติ" }
        : r,
  );
}

/** สิทธิ์การลาของแต่ละประเภทในรอบปีที่ระบุ */
export type Entitlement = {
  type: LeaveType;
  period: string;
  /** ที่มาของสิทธิ์ */
  entitlementType: string;
  days: number;
};

/* รอบปีก่อน ๆ เป็นประวัติ ไม่ได้แก้จากหน้าตั้งค่า */
const PAST_ENTITLEMENTS: (Omit<Entitlement, "period"> & { year: number })[] = [
  { type: "ลาพักร้อน", year: 2025, entitlementType: "เพิ่มให้อัตโนมัติ", days: 10 },
  { type: "ลาป่วย", year: 2025, entitlementType: "เพิ่มให้อัตโนมัติ", days: 30 },
];

/** สิทธิ์การลา — ตั้งแต่ปี 2026 ถึงปีปัจจุบันมาจากหน้าตั้งค่าของผู้ดูแลระบบ (/admin/leave) */
export function entitlements(): Entitlement[] {
  const quotas = settings().leave.filter((q) => q.days > 0);
  const now = leaveYearOf(todayIso());
  const years = Array.from({ length: Math.max(0, now - SETTINGS_FROM_YEAR + 1) }, (_, i) => SETTINGS_FROM_YEAR + i);
  const current = years.flatMap((y) =>
    quotas.map((q) => ({
      type: q.type,
      period: leavePeriodOf(y),
      entitlementType: "เพิ่มให้อัตโนมัติ",
      days: q.days,
    })),
  );
  const past = PAST_ENTITLEMENTS.map(({ year, ...e }) => ({ ...e, period: leavePeriodOf(year) }));
  return [...current, ...past];
}

export type LeaveRecord = {
  id: string;
  /** วันที่เริ่มลา (yyyy-mm-dd) */
  date: string;
  toDate: string;
  employee: string;
  type: LeaveType;
  days: number;
  /** ลาครึ่งวันช่วงไหน (ไม่มีค่า = ลาเต็มวัน) */
  half?: "morning" | "afternoon";
  /** ช่วงเวลาที่ลาจริง เป็นนาทีของวัน (ใช้กับลาไม่เต็มวัน) */
  startMin?: number;
  endMin?: number;
  /*
   * ลาด่วนนับเป็นชั่วโมง (เจ้าของสั่ง 28 ก.ย. 2569) — เก็บชั่วโมงไว้ให้อ่านตรง ๆ
   * days ยังเป็นตัวหักสิทธิ์เสมอ = ชั่วโมง ÷ ชั่วโมงทำงานต่อวัน
   */
  hours?: number;
  status: LeaveStatus;
  comment: string;
  /** ชื่อไฟล์เอกสารประกอบที่แนบตอนยื่น (เช่นใบรับรองแพทย์) — ยังไม่เก็บตัวไฟล์จริง */
  files?: string[];
  /** "yyyy-mm-dd hh:mm" เวลาที่ยื่น · ใบเก่าไม่มี ใช้วันที่ลาแทน */
  submittedAt?: string;
  /** "yyyy-mm-dd hh:mm" เวลาที่ผู้อนุมัติตัดสิน */
  decidedAt?: string;
  /**
   * วันลาประเภทนี้ที่ใช้ไปก่อนใบนี้ (ต้นแบบ ceo-approvals used)
   * ⚠️ เหลือไว้อ่านใบตั้งต้นเก่าเท่านั้น — หน้าอนุมัติเลิกใช้ยอดนี้แล้ว (24 ก.ย. 2569)
   * เพราะยอดที่ติดมากับใบนับใบที่ยังรออนุมัติไว้ด้วย ตัวเลขจึงไม่ตรงกับหน้าการลาของผู้ยื่น
   * ทุกหน้าคิดจากใบลาจริงในระบบผ่าน leaveUsage() ที่เดียว
   */
  usedBefore?: number;
  /** เหตุผลที่ยกเลิก — บังคับกรอกตอนกดยกเลิก (สถานะ "ยกเลิก") */
  cancelReason?: string;
  /** ชื่อผู้ยกเลิก */
  cancelledBy?: string;
  /** "yyyy-mm-dd hh:mm" เวลาที่ยกเลิก */
  cancelledAt?: string;
};

const SALES_LEAVE: LeaveRecord[] = [
  { id: "LV-2569-0041", date: "2026-09-15", toDate: "2026-09-17", employee: "ชนัญชิดา ใจดี", type: "ลาพักร้อน", days: 3, status: "รอการอนุมัติ", comment: "พาครอบครัวไปเที่ยว" },
  { id: "LV-2569-0040", date: "2026-09-08", toDate: "2026-09-08", employee: "ชนัญชิดา ใจดี", type: "ลากิจ", days: 1, status: "อนุมัติแล้ว", comment: "ทำธุระที่อำเภอ" },
  { id: "LV-2569-0036", date: "2026-08-19", toDate: "2026-08-19", employee: "ชนัญชิดา ใจดี", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "ไข้หวัดใหญ่" },
  { id: "LV-2569-0033", date: "2026-08-03", toDate: "2026-08-03", employee: "ชนัญชิดา ใจดี", type: "ลาป่วย", days: 0.375, half: "morning", hours: 3, status: "อนุมัติแล้ว", comment: "พบแพทย์ตามนัด" },
  { id: "LV-2569-0029", date: "2026-07-22", toDate: "2026-07-23", employee: "ชนัญชิดา ใจดี", type: "ลากิจ", days: 2, status: "อนุมัติแล้ว", comment: "ธุระครอบครัว" },
  { id: "LV-2569-0025", date: "2026-06-10", toDate: "2026-06-14", employee: "ชนัญชิดา ใจดี", type: "ลาพักร้อน", days: 5, status: "ไม่อนุมัติ", comment: "ช่วงงานยุ่ง หัวหน้าขอเลื่อน" },
  { id: "LV-2569-0021", date: "2026-05-06", toDate: "2026-05-07", employee: "ชนัญชิดา ใจดี", type: "ลาพักร้อน", days: 2, status: "อนุมัติแล้ว", comment: "พักผ่อน" },
  { id: "LV-2569-0018", date: "2026-04-14", toDate: "2026-04-14", employee: "ชนัญชิดา ใจดี", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "ปวดหลัง" },
  { id: "LV-2569-0007", date: "2026-02-11", toDate: "2026-02-12", employee: "ชนัญชิดา ใจดี", type: "ลาพักร้อน", days: 2, status: "อนุมัติแล้ว", comment: "ไปต่างจังหวัด" },
];


const PM_LEAVE: LeaveRecord[] = [
  { id: "LV-2569-0042", date: "2026-09-21", toDate: "2026-09-22", employee: "ชนิกานต์ วัฒนกุล", type: "ลาพักร้อน", days: 2, status: "รอการอนุมัติ", comment: "พาลูกไปหาหมอต่างจังหวัด" },
  { id: "LV-2569-0038", date: "2026-08-26", toDate: "2026-08-26", employee: "ชนิกานต์ วัฒนกุล", type: "ลากิจ", days: 1, status: "อนุมัติแล้ว", comment: "ไปทำใบขับขี่" },
  { id: "LV-2569-0031", date: "2026-07-13", toDate: "2026-07-15", employee: "ชนิกานต์ วัฒนกุล", type: "ลาป่วย", days: 3, status: "อนุมัติแล้ว", comment: "ไข้เลือดออก" },
  { id: "LV-2569-0024", date: "2026-05-18", toDate: "2026-05-22", employee: "ชนิกานต์ วัฒนกุล", type: "ลาพักร้อน", days: 5, status: "อนุมัติแล้ว", comment: "ลาประจำปี" },
  { id: "LV-2569-0015", date: "2026-03-24", toDate: "2026-03-24", employee: "ชนิกานต์ วัฒนกุล", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "ปวดฟัน" },
];

/* บัญชีกับบุคคลเป็นคนเดียวกัน (E12) — ใบลาของบทบาทบัญชีต้องไม่ซ้ำวันกับ HR_LEAVE
   ตัวอย่างให้หน้าการลาของฉันของบัญชีไม่ว่าง ครบทุกสถานะ (ผู้ใช้สั่ง 9 ต.ค. 2569)
   เครื่องที่เก็บใบลาไว้แล้วได้ใบเหล่านี้ผ่าน addMissingLeave */
const ACC_LEAVE: LeaveRecord[] = [
  { id: "LV-2569-0072", date: "2026-10-19", toDate: "2026-10-19", employee: "อรอนงค์ พรหมมา", type: "ลาพักร้อน", days: 1, status: "รอการอนุมัติ", comment: "ไปงานแต่งงานเพื่อนที่ลำปาง", submittedAt: "2026-10-08 09:20" },
  { id: "LV-2569-0075", date: "2026-09-30", toDate: "2026-09-30", employee: "อรอนงค์ พรหมมา", type: "ลากิจ", days: 1, status: "ไม่อนุมัติ", comment: "ตรงกับวันปิดงบสิ้นเดือน ขอให้เลื่อนเป็นต้นเดือนหน้า", submittedAt: "2026-09-22 10:05", decidedAt: "2026-09-22 14:30" },
  { id: "LV-2569-0073", date: "2026-08-17", toDate: "2026-08-17", employee: "อรอนงค์ พรหมมา", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "เป็นไข้หวัด ไปหาหมอที่คลินิก", submittedAt: "2026-08-17 07:40", decidedAt: "2026-08-17 09:05" },
  { id: "LV-2569-0076", date: "2026-07-10", toDate: "2026-07-10", employee: "อรอนงค์ พรหมมา", type: "ลากิจ", days: 0.375, half: "morning", hours: 3, status: "ยกเลิก", comment: "ไปทำบัตรประชาชนใหม่ที่อำเภอ", submittedAt: "2026-07-06 16:10", cancelReason: "เปลี่ยนไปทำวันเสาร์แทน", cancelledBy: "อรอนงค์ พรหมมา", cancelledAt: "2026-07-08 08:50" },
  { id: "LV-2569-0074", date: "2026-06-22", toDate: "2026-06-23", employee: "อรอนงค์ พรหมมา", type: "ลาพักร้อน", days: 2, status: "อนุมัติแล้ว", comment: "พาครอบครัวไปเที่ยวเชียงราย", submittedAt: "2026-06-08 11:15", decidedAt: "2026-06-08 15:40" },
];

/* ฝ่ายบุคคล — ใบลาชุดนี้ต้องตรงกับ HR_TIME.E12 ใน hr-data.ts
   เพราะหน้าสรุปเวลาทำงานนับวันลาของเธอจากที่นั่น ไม่ใช่จากไฟล์นี้ */
const HR_LEAVE: LeaveRecord[] = [
  /* ต้นแบบ ceo-approvals.html CEO_REQ ของ E12 */
  { id: "LV-2569-0009", date: "2026-09-05", toDate: "2026-09-05", employee: "อรอนงค์ พรหมมา", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "เป็นไข้ ไปหาหมอมาแล้ว", submittedAt: "2026-09-05 08:15", decidedAt: "2026-09-05 09:02", usedBefore: 2 },
  { id: "LV-2569-0012", date: "2026-09-10", toDate: "2026-09-11", employee: "อรอนงค์ พรหมมา", type: "ลากิจ", days: 2, status: "รอการอนุมัติ", comment: "ย้ายบ้าน", submittedAt: "2026-09-06 11:40", usedBefore: 2 },
];

/* GM — ต้นแบบ ceo-approvals.html CEO_REQ ของ E11 */
const GM_LEAVE: LeaveRecord[] = [
  { id: "LV-2569-0004", date: "2026-09-04", toDate: "2026-09-04", employee: "ประเสริฐ มั่นคงดี", type: "ลากิจ", days: 1, status: "อนุมัติแล้ว", comment: "ติดต่อราชการที่อำเภอ", submittedAt: "2026-09-03 16:02", decidedAt: "2026-09-03 17:10", usedBefore: 0 },
  { id: "LV-2569-0011", date: "2026-09-14", toDate: "2026-09-15", employee: "ประเสริฐ มั่นคงดี", type: "ลาพักร้อน", days: 2, status: "รอการอนุมัติ", comment: "พาครอบครัวไปต่างจังหวัด", submittedAt: "2026-09-07 10:24", usedBefore: 1 },
];

/*
 * ทีมงานผูกกับพนักงาน E05 ในทะเบียนฝ่ายบุคคล (ดู ROLE_EMPLOYEE ใน hr-link.ts)
 * ใบนี้ต้องตรงกับวันลาที่ HR_TIME ของ E05 บันทึกไว้ ไม่งั้นพอผูกสองฝั่งเข้าด้วยกัน
 * ฝ่ายบุคคลจะอ่านจากใบจริงแล้วเห็นว่าเขาไม่เคยลาเลย ทั้งที่ทะเบียนเดิมมีวันลาอยู่
 */
const STAFF_LEAVE: LeaveRecord[] = [
  { id: "LV-2569-0037", date: "2026-08-21", toDate: "2026-08-21", employee: "กมลชนก พูนสุข", type: "ลากิจ", days: 0.625, half: "afternoon", hours: 5, status: "อนุมัติแล้ว", comment: "พาผู้ปกครองไปโรงพยาบาล" },
];

/*
 * ตัวอย่างใบลารอบปัจจุบัน (ปลาย ก.ย. – ต.ค. 2569) ให้หน้าการลาและคิวอนุมัติมีของให้ดูตอนสาธิต (เจ้าของสั่ง 8 ต.ค. 2569)
 * เครื่องที่เก็บใบลาไว้แล้วได้ใบเหล่านี้เพิ่มผ่าน addMissingLeave ใน leave-store (เติมเฉพาะเลขที่ที่ยังไม่มี)
 * สายอนุมัติ: ขาย/ก่อนการขาย/PM/ทีมงาน/แม่บ้าน → GM · บัญชีและบุคคล/GM → ผู้บริหาร · CEO/นักศึกษาฝึกงาน → ฝ่ายบุคคล
 */
const LEAVE_OCT_2569: Partial<Record<Role, LeaveRecord[]>> = {
  sales: [
    { id: "LV-2569-0057", date: "2026-10-16", toDate: "2026-10-16", employee: "ชนัญชิดา ใจดี", type: "ลากิจ", days: 1, status: "รอการอนุมัติ", comment: "ไปงานบวชน้องชายที่ลำพูน", submittedAt: "2026-10-07 10:12" },
    { id: "LV-2569-0056", date: "2026-10-02", toDate: "2026-10-02", employee: "ชนัญชิดา ใจดี", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "ปวดท้อง อาหารเป็นพิษ", submittedAt: "2026-10-02 07:45", decidedAt: "2026-10-02 08:30" },
  ],
  ps: [
    { id: "LV-2569-0070", date: "2026-10-14", toDate: "2026-10-14", employee: "ปิยะวัฒน์ แก้วใส", type: "ลากิจ", days: 1, status: "รอการอนุมัติ", comment: "ไปติดต่อธนาคารเรื่องสินเชื่อบ้าน", submittedAt: "2026-10-06 17:20" },
    { id: "LV-2569-0071", date: "2026-09-25", toDate: "2026-09-25", employee: "ปิยะวัฒน์ แก้วใส", type: "ลาป่วย", days: 0.375, half: "morning", hours: 3, status: "อนุมัติแล้ว", comment: "พบแพทย์ตามนัด", submittedAt: "2026-09-24 18:05", decidedAt: "2026-09-25 08:10" },
  ],
  pm: [
    { id: "LV-2569-0058", date: "2026-10-09", toDate: "2026-10-09", employee: "ชนิกานต์ วัฒนกุล", type: "ลากิจ", days: 1, status: "รอการอนุมัติ", comment: "ประชุมผู้ปกครองที่โรงเรียนลูก", submittedAt: "2026-10-06 09:05" },
  ],
  hr: [
    { id: "LV-2569-0062", date: "2026-10-15", toDate: "2026-10-16", employee: "อรอนงค์ พรหมมา", type: "ลาพักร้อน", days: 2, status: "รอการอนุมัติ", comment: "พาคุณแม่ไปตรวจสุขภาพที่กรุงเทพฯ", submittedAt: "2026-10-05 13:40" },
  ],
  staff: [
    { id: "LV-2569-0060", date: "2026-10-20", toDate: "2026-10-21", employee: "กมลชนก พูนสุข", type: "ลาพักร้อน", days: 2, status: "รอการอนุมัติ", comment: "กลับบ้านต่างจังหวัด", submittedAt: "2026-10-07 16:30" },
    { id: "LV-2569-0061", date: "2026-10-01", toDate: "2026-10-01", employee: "กมลชนก พูนสุข", type: "ลากิจ", days: 0.625, half: "afternoon", hours: 5, status: "ไม่อนุมัติ", comment: "วันนั้นมีนัดส่งงานเว็บไซต์ให้ลูกค้า ขอให้เลื่อนเป็นวันอื่น", submittedAt: "2026-09-29 11:20", decidedAt: "2026-09-29 15:05" },
    { id: "LV-2569-0059", date: "2026-09-29", toDate: "2026-09-29", employee: "กมลชนก พูนสุข", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "เป็นไข้หวัด มีใบรับรองแพทย์", files: ["ใบรับรองแพทย์.jpg"], submittedAt: "2026-09-29 07:50", decidedAt: "2026-09-29 09:15" },
  ],
  gm: [
    { id: "LV-2569-0063", date: "2026-10-14", toDate: "2026-10-14", employee: "ประเสริฐ มั่นคงดี", type: "ลากิจ", days: 1, status: "รอการอนุมัติ", comment: "ไปงานสัมมนาสมาคมผู้ประกอบการที่เชียงราย", submittedAt: "2026-10-07 08:55" },
  ],
  ceo: [
    { id: "LV-2569-0069", date: "2026-10-26", toDate: "2026-10-28", employee: "CEO", type: "ลาพักร้อน", days: 3, status: "รอการอนุมัติ", comment: "เดินทางต่างประเทศกับครอบครัว", submittedAt: "2026-10-06 19:10" },
  ],
  intern: [
    { id: "LV-2569-0065", date: "2026-10-12", toDate: "2026-10-12", employee: "ณัฐริกา ใจอารีย์", type: "ลากิจ", days: 1, status: "รอการอนุมัติ", comment: "นำเสนอความคืบหน้าการฝึกงานที่มหาวิทยาลัย", submittedAt: "2026-10-07 14:25" },
    { id: "LV-2569-0064", date: "2026-09-28", toDate: "2026-09-28", employee: "ณัฐริกา ใจอารีย์", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "ปวดหัว มีไข้", submittedAt: "2026-09-28 07:40", decidedAt: "2026-09-28 09:00" },
  ],
  maid: [
    { id: "LV-2569-0067", date: "2026-10-09", toDate: "2026-10-09", employee: "บุญเรือน สายทอง", type: "ลากิจ", days: 1, status: "รอการอนุมัติ", comment: "ไปทำบุญวันเกิดหลานที่วัด", submittedAt: "2026-10-05 16:45" },
    { id: "LV-2569-0068", date: "2026-09-24", toDate: "2026-09-24", employee: "บุญเรือน สายทอง", type: "ลาป่วย", days: 1, status: "อนุมัติแล้ว", comment: "ปวดหลัง ไปหาหมอ", submittedAt: "2026-09-24 07:30", decidedAt: "2026-09-24 08:45" },
  ],
};

/* ใบลาแยกตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน (ดู role-store.ts) */
export const LEAVE_RECORDS: Record<Role, LeaveRecord[]> = {
  sales: [...LEAVE_OCT_2569.sales!, ...SALES_LEAVE],
  ps: [...LEAVE_OCT_2569.ps!],
  pm: [...LEAVE_OCT_2569.pm!, ...PM_LEAVE],
  acc: ACC_LEAVE,
  hr: [...LEAVE_OCT_2569.hr!, ...HR_LEAVE],
  staff: [...LEAVE_OCT_2569.staff!, ...STAFF_LEAVE],
  gm: [...LEAVE_OCT_2569.gm!, ...GM_LEAVE],
  ceo: [...LEAVE_OCT_2569.ceo!],
  /* นักศึกษาฝึกงานยื่นใบลาได้ (ขึ้นฝ่ายบุคคล) */
  intern: [...LEAVE_OCT_2569.intern!],
  maid: [...LEAVE_OCT_2569.maid!],
};

/** เติมใบลาตั้งต้นที่ยังไม่มีในเครื่อง (เทียบด้วยเลขที่ใบลา) — ใบเดิมที่ผู้ใช้ยื่น/ตัดสินไว้ไม่ถูกแตะ */
export function addMissingLeave(have: LeaveRecord[], seed: LeaveRecord[]): LeaveRecord[] {
  const ids = new Set(have.map((r) => r.id));
  const add = seed.filter((r) => !ids.has(r.id));
  return add.length ? [...add, ...have] : have;
}


/* หมายเหตุ: การนับวันลาที่ใช้ไปแล้วอยู่ที่ leave-store.ts เพราะต้องคิดจากใบลา
   ของบทบาทที่ล็อกอินอยู่ ไม่ใช่จากชุดข้อมูลตั้งต้นชุดใดชุดหนึ่ง */

export function entitlementDays(type: LeaveType, period: string) {
  return entitlements().filter((e) => e.type === type && e.period === period).reduce(
    (sum, e) => sum + e.days,
    0,
  );
}

