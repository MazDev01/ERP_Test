import { BANGKOK_TZ, bkkOf, toIsoDate } from "./format";
import type { Role } from "./role";
import type { PunchGeo } from "./work-area";
import {
  expectedInMinutes,
  expectedOutMinutes,
  minutesOfDay,
  WORK_SCHEDULE,
  type LeaveWindow,
} from "./work-schedule";

export type PunchType = "in" | "out";

export type PunchRecord = {
  id: string;
  type: PunchType;
  /** เวลาที่ตอกบัตร (ISO string) */
  at: string;
  note: string;
  /** ผลตรวจพื้นที่ตอนเข้างาน — ไม่มีคือบันทึกก่อนมีระบบพื้นที่ หรือเป็นการออกงาน */
  geo?: PunchGeo;
};

/*
 * เก็บแยกตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน — สลับบทบาทแล้วต้องเห็นการตอกบัตร
 * ของคนนั้น ไม่ใช่ของคนก่อนหน้า (หลักการเดียวกับ role-store.ts)
 * รูปแบบที่เก็บคือ { sales: [...], pm: [...], acc: [...] }
 */
const STORAGE_KEY = "maz-hrm.attendance.v2";

type ByRole = Partial<Record<Role, PunchRecord[]>>;

function readAll(): ByRole {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    return parsed as ByRole;
  } catch {
    return {};
  }
}

export function loadRecords(role: Role): PunchRecord[] {
  const list = readAll()[role];
  return Array.isArray(list) ? list.filter(isPunchRecord) : [];
}

export function saveRecords(role: Role, records: PunchRecord[]) {
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...readAll(), [role]: records }),
    );
  } catch {
    // โหมดส่วนตัว/โควตาเต็ม — ไม่ให้ทั้งหน้าพัง
  }
}

function isPunchRecord(value: unknown): value is PunchRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.id === "string" &&
    (r.type === "in" || r.type === "out") &&
    typeof r.at === "string" &&
    typeof r.note === "string"
  );
}

export function newId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** วันของชั่วขณะหนึ่งตามปฏิทินไทย — ตอกบัตรสี่ทุ่มต้องลงวันนั้น ไม่ใช่วันของเครื่อง */
export function dayKey(instant: Date) {
  return toIsoDate(bkkOf(instant));
}

export function recordsOfDay(records: PunchRecord[], day: string) {
  return records
    .filter((r) => dayKey(new Date(r.at)) === day)
    .sort((a, b) => a.at.localeCompare(b.at));
}

/** สถานะปัจจุบัน: กำลังทำงานอยู่ไหม + เวลาที่เข้างานล่าสุด */
export function currentStatus(records: PunchRecord[]) {
  const last = [...records].sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  const isWorking = last?.type === "in";
  return { isWorking, lastPunch: last ?? null };
}

/**
 * นับเวลาทำงานของช่วงหนึ่ง โดยยึดกติกาของบริษัท
 * - เข้าก่อน 09:00 → เริ่มนับ 09:00 (เวลาที่ตอกจริงยังถูกบันทึกไว้)
 * - อยู่เลย 18:00 → นับถึงแค่ 18:00 (ส่วนที่เกินเป็นเรื่องของ OT)
 * - คร่อมพักเที่ยง 12:00–13:00 → หักออก
 * ดังนั้น 09:00–18:00 = 8 ชั่วโมงพอดี
 */
export function countableMs(
  /** ชั่วขณะจริงที่ตอกเข้า (ไม่ใช่เวลาไทยที่แปลงมาแล้ว) */
  from: Date,
  /** ชั่วขณะจริงที่นับถึง เป็น epoch ms */
  until: number,
  leave: LeaveWindow = null,
) {
  /* กะ 09:00–18:00 เป็นหน้าปัดไทย จึงย้ายทั้งคู่ไปคิดบนหน้าปัดไทยก่อน
     ผลลัพธ์เป็นผลต่างของเวลา ส่วนที่เลื่อนไปจึงหักล้างกันเอง */
  const fromWall = bkkOf(from);
  const untilWall = bkkOf(new Date(until)).getTime();
  // กะของวันนั้นขยับตามใบลา — ลาครึ่งเช้าแล้วมาถึง 12:50 ก็เริ่มนับ 13:00
  const midnight = new Date(fromWall);
  midnight.setHours(0, 0, 0, 0);
  const at = (min: number) => midnight.getTime() + min * 60_000;

  const dayStart = at(expectedInMinutes(leave));
  const dayEnd = at(expectedOutMinutes(leave));
  const lunchStart = at(minutesOfDay(WORK_SCHEDULE.lunchStart));
  const lunchEnd = at(minutesOfDay(WORK_SCHEDULE.lunchEnd));

  const begin = Math.max(fromWall.getTime(), dayStart);
  const finish = Math.min(untilWall, dayEnd);
  if (finish <= begin) return 0;

  const lunch = Math.max(
    0,
    Math.min(finish, lunchEnd) - Math.max(begin, lunchStart),
  );
  return finish - begin - lunch;
}

export function workedMsOfDay(
  dayRecords: PunchRecord[],
  now: number,
  leave: LeaveWindow = null,
) {
  let total = 0;
  let openedAt: Date | null = null;
  for (const r of dayRecords) {
    const at = new Date(r.at);
    if (r.type === "in") {
      openedAt = at;
    } else if (openedAt !== null) {
      total += countableMs(openedAt, at.getTime(), leave);
      openedAt = null;
    }
  }
  if (openedAt !== null) total += countableMs(openedAt, now, leave);
  return total;
}

/**
 * ชั่วโมงที่อยู่จริงของวัน (ไม่ตัดตามกะ) — ใช้แสดงผล ไม่ใช้คิดเงิน
 * now = ชั่วขณะจริงเป็น epoch ms · ข้างในย้ายไปคิดบนหน้าปัดไทย เพราะพักเที่ยงเป็นเวลาไทย
 */
export function actualMsOfDay(dayRecords: PunchRecord[], now: number) {
  let total = 0;
  let openedAt: number | null = null;
  /* a, b, day เป็นเวลาไทยแล้วทั้งหมด — setHours จึงได้เที่ยงคืนของไทย */
  const lunch = (a: number, b: number, day: Date) => {
    const m = new Date(day);
    m.setHours(0, 0, 0, 0);
    const ls = m.getTime() + minutesOfDay(WORK_SCHEDULE.lunchStart) * 60_000;
    const le = m.getTime() + minutesOfDay(WORK_SCHEDULE.lunchEnd) * 60_000;
    return Math.max(0, Math.min(b, le) - Math.max(a, ls));
  };
  const add = (a: number, b: number) => {
    if (b > a) total += b - a - lunch(a, b, new Date(a));
  };
  for (const r of dayRecords) {
    const at = bkkOf(new Date(r.at)).getTime();
    if (r.type === "in") openedAt = at;
    else if (openedAt !== null) {
      add(openedAt, at);
      openedAt = null;
    }
  }
  if (openedAt !== null) add(openedAt, bkkOf(new Date(now)).getTime());
  return total;
}

export function formatDuration(ms: number) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h} ชม. ${`${m}`.padStart(2, "0")} นาที`;
}

/** นับสดเป็น ชม:นาที:วินาที สำหรับตัวจับเวลาที่เดินอยู่ */
export function formatDurationClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map((n) => `${n}`.padStart(2, "0")).join(":");
}

/** เวลาเดินวินาที — รับชั่วขณะจริง (ห้ามส่ง bkkNow() มา จะแปลงซ้ำ) */
export function formatTime(instant: Date) {
  return instant.toLocaleTimeString("th-TH", {
    timeZone: BANGKOK_TZ,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

/** เวลา HH:mm — รับชั่วขณะจริง (ห้ามส่ง bkkNow() มา จะแปลงซ้ำ) */
export function formatClock(instant: Date) {
  return instant.toLocaleTimeString("th-TH", {
    timeZone: BANGKOK_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** วันที่ไทยแบบเต็ม — รับชั่วขณะจริง (ห้ามส่ง bkkNow() มา จะแปลงซ้ำ) */
export function formatThaiDate(instant: Date) {
  return instant.toLocaleDateString("th-TH", {
    timeZone: BANGKOK_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** หนึ่งช่วงงาน = ตอกเข้า 1 ครั้ง + ตอกออก (ถ้ามี) */
export type Session = {
  id: string;
  in: PunchRecord;
  out: PunchRecord | null;
};

/** จับคู่ตอกเข้า–ตอกออกตามลำดับเวลา; ตอกเข้าซ้อนกันถือว่าช่วงก่อนหน้ายังไม่ปิด */
export function toSessions(dayRecords: PunchRecord[]): Session[] {
  const sessions: Session[] = [];
  for (const record of dayRecords) {
    const open = sessions.at(-1);
    if (record.type === "in") {
      sessions.push({ id: record.id, in: record, out: null });
    } else if (open && open.out === null) {
      open.out = record;
    }
  }
  return sessions;
}

/** ระยะเวลาของช่วงงานเป็นมิลลิวินาที; ช่วงที่ยังไม่ปิดนับถึง now */
export function sessionMs(session: Session, now: number, leave: LeaveWindow = null) {
  const end = session.out ? new Date(session.out.at).getTime() : now;
  if (!end) return 0;
  return countableMs(new Date(session.in.at), end, leave);
}

/* ─── ช่วงสัปดาห์ (เริ่มวันจันทร์ตามปฏิทินการทำงานไทย) ─────────────
 * ทุกตัวในหมวดนี้รับและคืน Date ที่เป็น "หน้าปัดไทย" แล้ว (มาจาก bkkNow()/bkkOf())
 * ไม่ใช่ชั่วขณะจริง — ห้ามเอาไป toISOString หรือส่งเข้า bkkOf() ซ้ำ
 */
export function startOfWeek(wall: Date) {
  const date = new Date(wall);
  date.setHours(0, 0, 0, 0);
  // getDay(): 0 = อาทิตย์ จึงต้องถอยไป 6 วันแทนที่จะถอย -1
  const shift = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - shift);
  return date;
}

export function addDays(wall: Date, days: number) {
  const date = new Date(wall);
  date.setDate(date.getDate() + days);
  return date;
}

/** 7 วันของสัปดาห์ที่คร่อมวันที่ที่ให้มา */
export function weekDays(anchor: Date) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/* ไม่ต้องใส่ timeZone เพราะ d เป็นหน้าปัดไทยอยู่แล้ว ใส่ไปจะเลื่อนซ้ำ */
export function formatShortDate(wall: Date) {
  return wall.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}

export function formatWeekday(wall: Date) {
  return wall.toLocaleDateString("th-TH", { weekday: "short" });
}

/** ช่วงสัปดาห์แบบอ่านง่าย เช่น "31 ส.ค. – 6 ก.ย. 2569" */
export function formatWeekRange(anchor: Date) {
  const days = weekDays(anchor);
  const first = days[0];
  const last = days[6];
  const year = last.toLocaleDateString("th-TH", { year: "numeric" });
  return `${formatShortDate(first)} – ${formatShortDate(last)} ${year}`;
}

/** วันเดียวกันตามปฏิทินไทยหรือไม่ — รับชั่วขณะจริงทั้งคู่ */
export function isSameDay(a: Date, b: Date) {
  return dayKey(a) === dayKey(b);
}
