/*
 * คำขอทำล่วงเวลา (โอที)
 * TODO: ย้ายไปตาราง overtime_request เมื่อต่อ backend
 */

import { toIsoDate } from "./format";
import { isHoliday } from "./holidays";
import { settings } from "./system-settings";
import type { Role } from "./role";
import { minutesOfDay, WORK_SCHEDULE } from "./work-schedule";

/**
 * ช่วงพักที่ไม่นับเป็นโอที — พักกลางวันและพักเย็น
 * ถ้าช่วงที่ขอคาบเกี่ยว ระบบหักออกให้เอง ไม่ต้องแยกใบ
 */
export function otBreaks(): { from: number; to: number; label: string }[] {
  return [
  {
    from: minutesOfDay(WORK_SCHEDULE.lunchStart),
    to: minutesOfDay(WORK_SCHEDULE.lunchEnd),
    label: "พักกลางวัน",
  },
  {
    from: minutesOfDay(WORK_SCHEDULE.end),
    to: minutesOfDay(WORK_SCHEDULE.otStart),
    label: "พักเย็น",
  },
  ];
}

/** นาทีที่ตกอยู่ในช่วงพัก ของช่วงเวลาที่ขอ */
export function breakMinutesIn(startMin: number, endMin: number) {
  return otBreaks().reduce(
    (sum, b) =>
      sum + Math.max(0, Math.min(endMin, b.to) - Math.max(startMin, b.from)),
    0,
  );
}

/** ชั่วโมงโอทีสุทธิ หักช่วงพักออกแล้ว */
export function otHours(startMin: number, endMin: number) {
  if (endMin <= startMin) return 0;
  const net = endMin - startMin - breakMinutesIn(startMin, endMin);
  return Math.max(0, Math.round((net / 60) * 100) / 100);
}

export type OtStatus = "รออนุมัติ" | "อนุมัติแล้ว" | "ไม่อนุมัติ" | "ยกเลิก";

/** ประเภทโอทีคิดจากวันที่ ไม่ให้พนักงานเลือกเอง จะได้ไม่ขัดกับปฏิทิน */
export type OtKind = "weekday" | "holiday" | "public";

/* เรตอ่านจากการตั้งค่าทุกครั้ง (ผู้ดูแลระบบแก้ได้ที่ /admin/rates) */
export const OT_KIND: Record<OtKind, { label: string; rate: number }> = {
  weekday: { label: "วันธรรมดา", get rate() { return settings().rates.otAfterWork; } },
  holiday: { label: "วันหยุด", get rate() { return settings().rates.otHoliday; } },
  public: { label: "วันหยุดบริษัท", get rate() { return settings().rates.otPublic; } },
};

/** วันหยุด (เสาร์-อาทิตย์หรือวันหยุดราชการ) ทำโอทีได้ทั้งวัน */
export function isOffDayKind(k: OtKind) {
  return k !== "weekday";
}

export type OtRecord = {
  id: string;
  /** วันที่ทำล่วงเวลา (yyyy-mm-dd) */
  date: string;
  /** ช่วงเวลาเป็นนาทีของวัน — 24:00 = 1440 */
  startMin: number;
  endMin: number;
  hours: number;
  /** ชั่วโมงที่หัวหน้าอนุมัติจริง (null = ยังไม่ตัดสิน หรือเท่าที่ขอ) */
  approvedHours: number | null;
  reason: string;
  status: OtStatus;
  /** คำอธิบายจากผู้อนุมัติ */
  comment: string;
  submittedAt: string;
  /** "yyyy-mm-dd hh:mm" เวลาที่ผู้อนุมัติตัดสิน */
  decidedAt?: string;
};

/**
 * วันที่อยู่ในรายการวันหยุดบริษัท มาก่อนเสาร์-อาทิตย์ ถ้าตรงกันใช้ประเภทวันหยุดบริษัท
 * อัตราของทั้งสามประเภทผู้ดูแลระบบตั้งเองที่ /admin/rates ไม่ได้กำหนดตายในโปรแกรม
 */
export function otKindOf(iso: string): OtKind {
  if (isHoliday(iso)) return "public";
  const w = new Date(`${iso}T00:00:00`).getDay();
  return w === 0 || w === 6 ? "holiday" : "weekday";
}

/*
 * โอทีวันหยุดต้องยื่นล่วงหน้า (เจ้าของแจ้ง 25 ก.ย. 2569 — เสาร์-อาทิตย์ต้องขอตั้งแต่วันศุกร์)
 * คืนวันสุดท้ายที่ยื่นได้ = ถอยจากวันโอทีไปตามจำนวน "วันทำงาน" ที่ผู้ดูแลตั้งไว้
 * ข้ามเสาร์-อาทิตย์และวันหยุดบริษัทให้เอง เพราะวันพวกนั้นไม่มีใครอยู่ให้อนุมัติ
 * คืน "" เมื่อไม่ต้องยื่นล่วงหน้า (วันทำงาน หรือผู้ดูแลตั้งเป็น 0)
 */
export function otAheadDeadline(iso: string): string {
  const need = settings().rates.otAheadDays;
  if (!iso || need <= 0 || !isOffDayKind(otKindOf(iso))) return "";
  const d = new Date(`${iso}T00:00:00`);
  let left = need;
  /* ถอยทีละวันจนครบจำนวนวันทำงานที่ต้องการ — กันวนไม่รู้จบด้วยเพดาน 60 วัน */
  for (let i = 0; i < 60 && left > 0; i++) {
    d.setDate(d.getDate() - 1);
    if (!isOffDayKind(otKindOf(toIsoDate(d)))) left -= 1;
  }
  return toIsoDate(d);
}

/** ชั่วโมงที่จะได้เงินจริง — นับเฉพาะใบที่อนุมัติแล้ว */
export function paidHours(r: OtRecord) {
  if (r.status !== "อนุมัติแล้ว") return 0;
  return r.approvedHours ?? r.hours;
}

const SALES_OT: OtRecord[] = [
  {
    id: "OT-2569-0001",
    date: "2026-09-02",
    startMin: 19 * 60,
    endMin: 22 * 60,
    hours: 3,
    approvedHours: 3,
    reason: "ปิดงบสิ้นเดือนกับฝ่ายบัญชี",
    status: "อนุมัติแล้ว",
    comment: "",
    submittedAt: "2026-09-01 16:40",
  },
  {
    id: "OT-2569-0002",
    date: "2026-09-05",
    startMin: 9 * 60,
    endMin: 17 * 60,
    hours: 7,
    approvedHours: 7,
    reason: "ติดตั้งระบบหน้างานลูกค้า จับวันเสาร์ตามที่ลูกค้าสะดวก",
    status: "อนุมัติแล้ว",
    comment: "",
    submittedAt: "2026-09-02 10:12",
  },
  {
    id: "OT-2569-0003",
    date: "2026-09-04",
    startMin: 19 * 60,
    endMin: 21 * 60 + 30,
    hours: 2.5,
    approvedHours: 2,
    reason: "แก้บั๊กด่วนก่อนส่งมอบงาน",
    status: "อนุมัติแล้ว",
    comment: "ปรับตามเวลาเข้าออกจริง",
    submittedAt: "2026-09-04 15:05",
  },
  {
    id: "OT-2569-0004",
    date: "2026-09-07",
    startMin: 19 * 60,
    endMin: 23 * 60,
    hours: 4,
    approvedHours: null,
    reason: "เตรียมเอกสารประมูลส่งวันจันทร์นี้",
    status: "รออนุมัติ",
    comment: "",
    submittedAt: "2026-09-07 11:26",
  },
  {
    id: "OT-2569-0005",
    date: "2026-09-01",
    startMin: 19 * 60,
    endMin: 20 * 60,
    hours: 1,
    approvedHours: null,
    reason: "ตามงานค้าง",
    status: "ยกเลิก",
    comment: "",
    submittedAt: "2026-08-31 17:02",
  },
  {
    id: "OT-2569-0006",
    date: "2026-08-26",
    startMin: 19 * 60,
    endMin: 21 * 60,
    hours: 2,
    approvedHours: null,
    reason: "จัดของเข้าคลัง",
    status: "ไม่อนุมัติ",
    comment: "งานนี้ทำในเวลาได้ ไม่อนุมัติล่วงเวลา",
    submittedAt: "2026-08-25 09:31",
  },
];

const PM_OT: OtRecord[] = [
  {
    id: "OT-2569-0021", date: "2026-09-03", startMin: 19 * 60, endMin: 22 * 60 + 30, hours: 3.5,
    approvedHours: 3.5, reason: "รีวิวแผนงานกับทีมก่อนเริ่มโปรเจคสยามพลาสติก",
    status: "อนุมัติแล้ว", comment: "", submittedAt: "2026-09-02 14:20",
  },
  {
    id: "OT-2569-0022", date: "2026-09-06", startMin: 9 * 60, endMin: 15 * 60, hours: 5,
    approvedHours: 5, reason: "ตามงานส่งมอบครัวคุณจิให้ทันกำหนด",
    status: "อนุมัติแล้ว", comment: "", submittedAt: "2026-09-04 17:45",
  },
  {
    id: "OT-2569-0023", date: "2026-09-08", startMin: 19 * 60, endMin: 21 * 60, hours: 2,
    approvedHours: null, reason: "เตรียมประชุมเปิดโปรเจคกับลูกค้า",
    status: "รออนุมัติ", comment: "", submittedAt: "2026-09-07 16:02",
  },
];

const ACC_OT: OtRecord[] = [
  {
    id: "OT-2569-0031", date: "2026-08-31", startMin: 19 * 60, endMin: 22 * 60, hours: 3,
    approvedHours: 3, reason: "ปิดงบเดือนสิงหาคม",
    status: "อนุมัติแล้ว", comment: "", submittedAt: "2026-08-28 15:10",
  },
  {
    id: "OT-2569-0032", date: "2026-09-05", startMin: 19 * 60, endMin: 21 * 60 + 30, hours: 2.5,
    approvedHours: 2, reason: "กระทบยอดเงินเข้ากับใบแจ้งหนี้ก่อนออกใบเสร็จ",
    status: "อนุมัติแล้ว", comment: "ปรับตามเวลาเข้าออกจริง", submittedAt: "2026-09-04 16:30",
  },
  {
    id: "OT-2569-0033", date: "2026-09-07", startMin: 19 * 60, endMin: 22 * 60, hours: 3,
    approvedHours: null, reason: "เตรียมแบบยื่นภาษีหัก ณ ที่จ่ายส่งวันที่ 7",
    status: "รออนุมัติ", comment: "", submittedAt: "2026-09-06 18:05",
  },
];

/* ฝ่ายบุคคล — ยังไม่มีคำขอโอที ตรงกับ HR_TIME.E12 ที่ไม่มีชั่วโมงล่วงเวลาในรอบ
   อาเรย์ว่างเป็นข้อมูลจริงของคนคนนี้ ไม่ใช่ข้อมูลที่ยังไม่ได้ใส่ */
const HR_OT: OtRecord[] = [];

/*
 * ตัวอย่างคำขอโอทีรอบปัจจุบัน (ปลาย ก.ย. – ต.ค. 2569) สำหรับสาธิต (เจ้าของสั่ง 8 ต.ค. 2569)
 * เครื่องที่เก็บข้อมูลไว้แล้วได้ใบเหล่านี้เพิ่มผ่าน addMissingOt ใน ot-store (เติมเฉพาะเลขที่ที่ยังไม่มี)
 */
const OT_OCT_2569: Partial<Record<Role, OtRecord[]>> = {
  sales: [
    { id: "OT-2569-0051", date: "2026-10-07", startMin: 19 * 60, endMin: 22 * 60, hours: 3, approvedHours: null, reason: "เตรียมใบเสนอราคาและเดโมระบบให้ลูกค้ารายใหม่", status: "รออนุมัติ", comment: "", submittedAt: "2026-10-07 16:10" },
    { id: "OT-2569-0050", date: "2026-10-01", startMin: 19 * 60, endMin: 21 * 60, hours: 2, approvedHours: 2, reason: "สรุปยอดขายเดือนกันยายนส่งผู้บริหาร", status: "อนุมัติแล้ว", comment: "", submittedAt: "2026-10-01 15:30", decidedAt: "2026-10-02 09:05" },
  ],
  pm: [
    { id: "OT-2569-0053", date: "2026-10-06", startMin: 19 * 60, endMin: 21 * 60, hours: 2, approvedHours: null, reason: "ทดสอบระบบร่วมกับลูกค้าก่อนขึ้นใช้งานจริง", status: "รออนุมัติ", comment: "", submittedAt: "2026-10-06 17:05" },
    { id: "OT-2569-0052", date: "2026-10-03", startMin: 13 * 60, endMin: 17 * 60, hours: 4, approvedHours: 4, reason: "ดูแลทีมติดตั้งระบบหน้างานลูกค้าวันเสาร์", status: "อนุมัติแล้ว", comment: "", submittedAt: "2026-10-01 10:20", decidedAt: "2026-10-01 14:00" },
  ],
  acc: [
    { id: "OT-2569-0055", date: "2026-10-07", startMin: 19 * 60, endMin: 21 * 60, hours: 2, approvedHours: null, reason: "เตรียมยื่น ภ.ง.ด.3 และ ภ.ง.ด.53 ของเดือนกันยายน", status: "รออนุมัติ", comment: "", submittedAt: "2026-10-07 15:45" },
    { id: "OT-2569-0054", date: "2026-09-30", startMin: 19 * 60, endMin: 22 * 60, hours: 3, approvedHours: 2.5, reason: "ปิดงบเดือนกันยายน", status: "อนุมัติแล้ว", comment: "ปรับตามเวลาออกงานจริง", submittedAt: "2026-09-30 16:00", decidedAt: "2026-10-01 10:30" },
  ],
  staff: [
    { id: "OT-2569-0057", date: "2026-10-05", startMin: 1080, endMin: 1260, hours: 3, approvedHours: null, reason: "แก้ไขหน้าเว็บไซต์ตามที่ลูกค้าแจ้งก่อนเปิดตัว", status: "รออนุมัติ", comment: "", submittedAt: "2026-10-05 21:10" },
    { id: "OT-2569-0058", date: "2026-10-02", startMin: 1080, endMin: 1200, hours: 2, approvedHours: null, reason: "อัปโหลดรูปสินค้าขึ้นเว็บไซต์", status: "ไม่อนุมัติ", comment: "งานไม่เร่งด่วน ให้ทำในเวลางานวันจันทร์", submittedAt: "2026-10-02 17:30", decidedAt: "2026-10-02 17:55" },
    { id: "OT-2569-0056", date: "2026-09-29", startMin: 1080, endMin: 1200, hours: 2, approvedHours: 2, reason: "ย้ายเว็บไซต์ลูกค้าขึ้นโฮสต์ใหม่นอกเวลาทำการ", status: "อนุมัติแล้ว", comment: "", submittedAt: "2026-09-29 20:15", decidedAt: "2026-09-30 09:20" },
  ],
  gm: [
    { id: "OT-2569-0059", date: "2026-10-10", startMin: 9 * 60, endMin: 12 * 60, hours: 3, approvedHours: null, reason: "ประชุมสรุปแผนงานไตรมาส 4 กับหัวหน้าทีม", status: "รออนุมัติ", comment: "", submittedAt: "2026-10-07 11:30" },
  ],
};

/** เติมใบโอทีตั้งต้นที่ยังไม่มีในเครื่อง (เทียบด้วยเลขที่) — ใบเดิมของผู้ใช้ไม่ถูกแตะ */
export function addMissingOt(have: OtRecord[], seed: OtRecord[]): OtRecord[] {
  const ids = new Set(have.map((r) => r.id));
  const add = seed.filter((r) => !ids.has(r.id));
  return add.length ? [...add, ...have] : have;
}

/* คำขอโอทีแยกตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน (ดู role-store.ts) */
export const OT_RECORDS: Record<Role, OtRecord[]> = {
  sales: [...OT_OCT_2569.sales!, ...SALES_OT],
  ps: [],
  pm: [...OT_OCT_2569.pm!, ...PM_OT],
  acc: [...OT_OCT_2569.acc!, ...ACC_OT],
  hr: HR_OT,
  /* ทีมงาน (E05 Website) — ต้นแบบ ceo-approvals.html CEO_REQ OT-2569-0014 · ตำแหน่งนี้ CEO เป็นผู้อนุมัติ */
  staff: [
    ...OT_OCT_2569.staff!,
    { id: "OT-2569-0014", date: "2026-09-08", startMin: 1080, endMin: 1260, hours: 3, approvedHours: null, reason: "ปรับหน้าเว็บให้แสดงผลบนมือถือตามที่ลูกค้าขอเพิ่ม", status: "รออนุมัติ", comment: "", submittedAt: "2026-09-08 21:05" },
  ],
  gm: [...OT_OCT_2569.gm!],
  ceo: [],
  /* นักศึกษาฝึกงานไม่มีเมนูนี้ */
  intern: [],
  maid: [],
};

