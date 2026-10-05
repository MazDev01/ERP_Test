/*
 * ข้อมูลการลา (จำลอง) — โครงเดียวกับระบบเดิม
 * เมื่อต่อ API แล้วให้แทนที่ค่าคงที่เหล่านี้ด้วยข้อมูลจริง
 */

/* ประเภทตั้งต้นของระบบ — ลบไม่ได้ เพราะใบลาเก่าและการสรุปของฝ่ายบุคคลอ้างชื่อพวกนี้อยู่
   ผู้ดูแลระบบเพิ่มประเภทใหม่ได้ที่ /admin/leave (เก็บใน settings().leave) อ่านผ่าน leaveTypes() */
export const LEAVE_TYPES = [
  "ลาพักร้อน",
  "ลาป่วย",
  "ลากิจ",
  "ลาคลอด",
  "ลาไม่รับค่าจ้าง",
] as const;

import type { Role } from "./role";
import { settings } from "./system-settings";
import { todayIso } from "./format";

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
  ลาคลอด: "ตามกฎหมายแรงงาน",
  ลาไม่รับค่าจ้าง: "หักเงินเดือนตามวันที่ลา",
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
  return records.map((r) =>
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
  { id: "LV-2569-0033", date: "2026-08-03", toDate: "2026-08-03", employee: "ชนัญชิดา ใจดี", type: "ลาป่วย", days: 0.5, status: "อนุมัติแล้ว", comment: "พบแพทย์ตามนัด" },
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

/* บัญชีกับบุคคลเป็นคนเดียวกัน (E12) — ใบลาอยู่ที่ HR_LEAVE ชุดเดียว ไม่ซ้ำสองที่ */
const ACC_LEAVE: LeaveRecord[] = [];

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
  { id: "LV-2569-0037", date: "2026-08-21", toDate: "2026-08-21", employee: "กมลชนก พูนสุข", type: "ลากิจ", days: 0.5, half: "afternoon", status: "อนุมัติแล้ว", comment: "พาผู้ปกครองไปโรงพยาบาล" },
];

/* ใบลาแยกตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน (ดู role-store.ts) */
export const LEAVE_RECORDS: Record<Role, LeaveRecord[]> = {
  sales: SALES_LEAVE,
  ps: [],
  pm: PM_LEAVE,
  acc: ACC_LEAVE,
  hr: HR_LEAVE,
  staff: STAFF_LEAVE,
  gm: GM_LEAVE,
  ceo: [],
  /* นักศึกษาฝึกงานยื่นใบลาได้ (ขึ้นฝ่ายบุคคล) ยังไม่มีใบตั้งต้น */
  intern: [],
  maid: [],
};


/* หมายเหตุ: การนับวันลาที่ใช้ไปแล้วอยู่ที่ leave-store.ts เพราะต้องคิดจากใบลา
   ของบทบาทที่ล็อกอินอยู่ ไม่ใช่จากชุดข้อมูลตั้งต้นชุดใดชุดหนึ่ง */

export function entitlementDays(type: LeaveType, period: string) {
  return entitlements().filter((e) => e.type === type && e.period === period).reduce(
    (sum, e) => sum + e.days,
    0,
  );
}

