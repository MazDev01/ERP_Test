import { bkkNow, bkkOf, fromBkk } from "./format";
import { settings } from "./system-settings";
/*
 * เวลาทำงานของบริษัท — ผู้ดูแลระบบตั้งได้ที่ /admin/schedule (เก็บใน system-settings.ts)
 *
 * เป็น getter ทุกช่อง อ่านค่าล่าสุดทุกครั้งที่ใช้ ห้ามเอาไปคำนวณเก็บเป็นค่าคงที่ระดับไฟล์
 * ไม่งั้นพอผู้ดูแลแก้เวลา หน้าที่โหลดไว้แล้วจะยังคิดด้วยเวลาเก่า
 *
 * เวลาของ "คนหนึ่งคน" ให้ใช้ scheduleFor(ตำแหน่ง) — บางตำแหน่งมีเวลาเฉพาะ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 */
export const WORK_SCHEDULE = {
  /** เวลาเข้างาน */
  get start() { return settings().schedule.start; },
  /** เวลาเลิกงาน */
  get end() { return settings().schedule.end; },
  /** ไม่มีผ่อนผันสาย — ผู้ใช้สั่งเอาช่องตั้งค่าออก (18 ก.ย. 2569) เลยเวลาเข้างานนาทีเดียวก็นับว่าสาย
   *  ตรึงเป็น 0 ไว้ ค่าที่เคยตั้งค้างในเครื่องจะได้ไม่ซ่อนการมาสายโดยไม่มีใครเห็น */
  get lateGraceMinutes() { return 0; },
  /** เริ่มพักกลางวัน */
  get lunchStart() { return settings().schedule.lunchStart; },
  /** เลิกพักกลางวัน */
  get lunchEnd() { return settings().schedule.lunchEnd; },
  /** เวลาพักกลางวันที่หักออกจากชั่วโมงทำงาน (นาที) — คิดจากช่วงพัก ไม่ได้ตั้งแยก */
  get breakMinutes() {
    return Math.max(0, minutesOfDay(this.lunchEnd) - minutesOfDay(this.lunchStart));
  },
  /** เวลาเริ่มนับโอทีของวันทำงาน */
  get otStart() { return settings().schedule.otStart; },
  /** ถ้ายังไม่ตอกออกหลังเลิกงานเกินกี่ชั่วโมง ให้เตือนว่าอาจลืม */
};

/*
 * ─── เวลาทำงานรายคน (ผู้ใช้สั่ง 16 ต.ค. 2569) ───
 * บางตำแหน่งมีเวลาของตัวเอง (ตอนนี้แม่บ้าน 08:00–17:00) ตั้งที่หน้าเวลาทำงานและจุดลงเวลา
 * ฟังก์ชันด้านล่างรับ sch เป็นค่าสุดท้าย — ไม่ส่ง = เวลาของบริษัท
 */
export type DaySchedule = { start: string; end: string; lunchStart: string; lunchEnd: string; otStart: string };

/** เวลาทำงานของบริษัท (อ่านค่าล่าสุดทุกครั้ง) */
export function companySchedule(): DaySchedule {
  const c = settings().schedule;
  return { start: c.start, end: c.end, lunchStart: c.lunchStart, lunchEnd: c.lunchEnd, otStart: c.otStart };
}

/**
 * เวลาทำงานของคนหนึ่ง — ตำแหน่งที่ตั้งเวลาเฉพาะไว้ใช้ชุดนั้น ไม่มีก็ใช้ของบริษัท (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * รับรหัสตำแหน่ง หรือข้อมูลพนักงานที่มี pos
 * เริ่มโอทีวันธรรมดาของตำแหน่งที่มีเวลาเฉพาะ = เวลาเลิกงานของตำแหน่ง + ช่วงพักเย็นยาวเท่าของบริษัท
 * (บริษัทเลิก 18:00 เริ่มโอที 19:00 → แม่บ้านเลิก 17:00 เริ่มโอที 18:00)
 */
export function scheduleFor(who?: string | { pos?: string } | null): DaySchedule {
  const company = companySchedule();
  const pos = typeof who === "string" ? who : who?.pos;
  if (!pos) return company;
  const hit = (settings().positionSchedules ?? []).find((p) => p.pos === pos);
  if (!hit) return company;
  const gap = Math.max(0, minutesOfDay(company.otStart) - minutesOfDay(company.end));
  return {
    start: hit.start,
    end: hit.end,
    lunchStart: hit.lunchStart,
    lunchEnd: hit.lunchEnd,
    otStart: formatMinutesOfDay(Math.min(24 * 60 - 1, minutesOfDay(hit.end) + gap)),
  };
}

/** นาทีพักกลางวันของชุดเวลานี้ */
export function breakOf(sch: DaySchedule = companySchedule()) {
  return Math.max(0, minutesOfDay(sch.lunchEnd) - minutesOfDay(sch.lunchStart));
}

/** ชั่วโมงที่ต้องทำงานจริงต่อวัน (เป็นมิลลิวินาที) */
export function targetWorkMs(sch: DaySchedule = companySchedule()) {
  return (minutesOfDay(sch.end) - minutesOfDay(sch.start) - breakOf(sch)) * 60_000;
}

export function minutesOfDay(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * แปลง "HH:MM" เป็นชั่วขณะจริงของวันเดียวกับ `sameDayAs` โดยนับวันและเวลาแบบไทย
 *
 * กะทำงานเป็นเวลาไทย ถ้าอ่านตามเขตเวลาของเครื่อง คนที่ตั้งเครื่องเป็นเขตอื่น
 * จะถูกนับว่าสายหรือไม่สายผิดไปทั้งวัน
 *
 * sameDayAs = ชั่วขณะจริง · ค่าที่คืนก็เป็นชั่วขณะจริง เทียบกับ Date อื่นได้ตรง ๆ
 */
export function scheduleTimeOn(sameDayAs: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const wall = bkkOf(sameDayAs);
  wall.setHours(h, m, 0, 0);
  return fromBkk(wall);
}

/** สายกี่นาที (0 = ไม่สาย) โดยหักเวลาผ่อนผันแล้ว */
export function lateMinutes(punchIn: Date, sch: DaySchedule = companySchedule()) {
  const start = scheduleTimeOn(punchIn, sch.start);
  const diff = Math.floor((punchIn.getTime() - start.getTime()) / 60_000);
  return diff > WORK_SCHEDULE.lateGraceMinutes ? diff : 0;
}

/** ออกก่อนเวลากี่นาที (0 = ไม่ได้ออกก่อน) */
export function earlyLeaveMinutes(punchOut: Date, sch: DaySchedule = companySchedule()) {
  const end = scheduleTimeOn(punchOut, sch.end);
  const diff = Math.floor((end.getTime() - punchOut.getTime()) / 60_000);
  return diff > 0 ? diff : 0;
}

/* ไม่มีการเตือนลืมตอกบัตรออกแล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569) */

export function formatMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h} ชม. ${m} นาที` : `${m} นาที`;
}

// ─── เวลาที่ "ต้อง" เข้า-ออก เมื่อมีใบลาครึ่งวัน ─────────────────────
/** ช่วงเวลาที่ลาไป (นาทีของวัน) */
export type LeaveWindow = { from: number; to: number } | null;

/** ครึ่งวันเช้า = เข้างาน–เริ่มพัก · ครึ่งวันบ่าย = เลิกพัก–เลิกงาน — พักกลางวันไม่ใช่เวลาลา */
const lunchFrom = (sch: DaySchedule) => minutesOfDay(sch.lunchStart);
const lunchTo = (sch: DaySchedule) => minutesOfDay(sch.lunchEnd);

/** ลาจบคาบพักกลางวัน → กลับเข้างานหลังพัก ไม่ใช่ตอนลาหมดพอดี */
function backAfterLunch(minute: number, sch: DaySchedule) {
  return minute >= lunchFrom(sch) && minute < lunchTo(sch) ? lunchTo(sch) : minute;
}

/** ลาเริ่มคาบพักกลางวัน → ออกได้ตั้งแต่ก่อนพัก เพราะช่วงพักไม่ใช่เวลาทำงานอยู่แล้ว */
function leaveBeforeLunch(minute: number, sch: DaySchedule) {
  return minute > lunchFrom(sch) && minute <= lunchTo(sch) ? lunchFrom(sch) : minute;
}

/** แปลงใบลาของวันนั้นเป็นช่วงเวลาที่ไม่ต้องอยู่ทำงาน */
export function leaveWindowOf(
  leave:
    | {
        days: number;
        half?: "morning" | "afternoon";
        startMin?: number;
        endMin?: number;
      }
    | undefined,
  sch: DaySchedule = companySchedule(),
): LeaveWindow {
  if (!leave) return null;
  const start = minutesOfDay(sch.start);
  const end = minutesOfDay(sch.end);
  // เวลาที่ระบุเองมาก่อนเสมอ
  if (leave.startMin != null && leave.endMin != null) {
    return { from: leave.startMin, to: leave.endMin };
  }
  if (leave.half === "morning") return { from: start, to: lunchFrom(sch) };
  if (leave.half === "afternoon") return { from: lunchTo(sch), to: end };
  return { from: start, to: end };
}

/** ลาคลุมทั้งกะ = ไม่ต้องมาทำงานวันนั้น */
export function isFullDayLeave(leave: LeaveWindow, sch: DaySchedule = companySchedule()) {
  return Boolean(
    leave &&
      leave.from <= minutesOfDay(sch.start) &&
      leave.to >= minutesOfDay(sch.end),
  );
}

/**
 * ลาคาบเวลาเข้างาน → เริ่มงานตอนลาหมด
 * ลาทั้งวันให้กะยุบเป็นศูนย์ ไม่งั้นจะได้กะกลับหัวแบบ 18:00–09:00
 */
export function expectedInMinutes(leave: LeaveWindow, sch: DaySchedule = companySchedule()) {
  const start = minutesOfDay(sch.start);
  if (isFullDayLeave(leave, sch)) return start;
  return leave && leave.from <= start && leave.to > start
    ? backAfterLunch(leave.to, sch)
    : start;
}

/** ลาคาบเวลาเลิกงาน → เลิกได้ตอนลาเริ่ม */
export function expectedOutMinutes(leave: LeaveWindow, sch: DaySchedule = companySchedule()) {
  const start = minutesOfDay(sch.start);
  const end = minutesOfDay(sch.end);
  if (isFullDayLeave(leave, sch)) return start;
  return leave && leave.to >= end && leave.from < end
    ? leaveBeforeLunch(leave.from, sch)
    : end;
}

/** หักพักกลางวันเฉพาะกะที่คร่อมเวลาพัก */
export function breakMinutesFor(inMin: number, outMin: number, sch: DaySchedule = companySchedule()) {
  return inMin < lunchTo(sch) && outMin > lunchFrom(sch) ? breakOf(sch) : 0;
}

/** ต้องทำงานกี่นาทีในวันนั้น (หลังหักวันลาและพักกลางวัน) */
export function requiredMinutes(leave: LeaveWindow, sch: DaySchedule = companySchedule()) {
  const a = expectedInMinutes(leave, sch);
  const b = expectedOutMinutes(leave, sch);
  return Math.max(0, b - a - breakMinutesFor(a, b, sch));
}

/** นาทีที่เท่าไรของวัน นับตามหน้าปัดไทย — รับ "ชั่วขณะจริง" เท่านั้น */
export function minutesOfTime(instant: Date) {
  const wall = bkkOf(instant);
  return wall.getHours() * 60 + wall.getMinutes();
}

/**
 * นาทีของวันตอนนี้ตามหน้าปัดไทย
 * มีไว้เพราะ minutesOfTime(bkkNow()) แปลงเขตเวลาซ้ำ — เครื่องนอกไทยจะเพี้ยนไป 7 ชั่วโมง
 */
export function minutesNow() {
  const wall = bkkNow();
  return wall.getHours() * 60 + wall.getMinutes();
}

export function formatMinutesOfDay(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * กะของวันนั้นหลังหักวันลา (เป็นนาทีของวัน)
 * ลาคาบเวลาเข้า → เริ่มช้าลง · ลาคาบเวลาเลิก → เลิกเร็วขึ้น
 */
export function shiftOf(leave: LeaveWindow, sch: DaySchedule = companySchedule()) {
  return { in: expectedInMinutes(leave, sch), out: expectedOutMinutes(leave, sch) };
}

/**
 * ชั่วโมงที่คิดเงินของวัน (นาที) — ตรงกับกติกาในหน้าตอกบัตร
 * มาก่อนกะ → เริ่มนับที่เวลากะ · อยู่เกินกะ → หยุดนับที่เวลาเลิก · หักพักเที่ยงเฉพาะส่วนที่คร่อมจริง
 * กะเต็ม 09:00–18:00 จึงได้ไม่เกิน 8 ชม. เสมอ — เวลาที่เกินไม่นับเข้าเงินเดือน (เป็นเรื่องของใบขอโอที)
 */
export function workedMinutesOf(
  inMin: number | null,
  outMin: number | null,
  leave: LeaveWindow,
  sch: DaySchedule = companySchedule(),
) {
  if (inMin == null || outMin == null) return 0;
  const s = shiftOf(leave, sch);
  const start = Math.max(inMin, s.in);
  const end = Math.min(outMin, s.out);
  if (end <= start) return 0;
  const lunch = Math.max(0, Math.min(end, lunchTo(sch)) - Math.max(start, lunchFrom(sch)));
  return end - start - lunch;
}

/**
 * ชั่วโมงที่อยู่จริง (นาที) — ตั้งแต่ตอกเข้าถึงตอกออก หักพักเที่ยงเฉพาะส่วนที่คร่อม
 * ใช้แสดงผลเท่านั้น · เงินเดือนคิดจาก workedMinutesOf ที่ตัดให้อยู่ในกะ
 */
export function actualMinutesOf(inMin: number | null, outMin: number | null, sch: DaySchedule = companySchedule()) {
  if (inMin == null || outMin == null || outMin <= inMin) return 0;
  const lunch = Math.max(0, Math.min(outMin, lunchTo(sch)) - Math.max(inMin, lunchFrom(sch)));
  return outMin - inMin - lunch;
}

/** ชั่วโมงเป็นข้อความสั้น เช่น "7.5 ชม." */
export function hoursText(minutes: number) {
  return `${(minutes / 60).toFixed(1)} ชม.`;
}
