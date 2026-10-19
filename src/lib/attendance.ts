import { BANGKOK_TZ, bkkOf, toIsoDate } from "./format";
import type { Role } from "./role";
import type { PunchGeo } from "./work-area";
import {
  expectedInMinutes,
  expectedOutMinutes,
  companySchedule,
  minutesOfDay,
  type DaySchedule,
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
  const have = Array.isArray(list) ? list.filter(isPunchRecord) : [];
  /* ตัวอย่างการตอกบัตรรอบปัจจุบัน — เติมเฉพาะรหัสที่ยังไม่มี ของที่ผู้ใช้ตอกเองไม่ถูกแตะ */
  const ids = new Set(have.map((r) => r.id));
  const add = samplePunches(role).filter((r) => !ids.has(r.id));
  return add.length ? [...add, ...have].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()) : have;
}

/*
 * ตัวอย่างการตอกบัตร 28 ก.ย. – 7 ต.ค. 2569 (วันทำงาน) ของทุกบทบาทที่ลงเวลา (เจ้าของสั่ง 8 ต.ค. 2569)
 * หน้าบันทึกเวลาของฉันและสรุปเวลาทำงานรอบปัจจุบันจะได้มีข้อมูลให้ดูตอนสาธิต
 * ไม่ใส่วันนี้ ปุ่มตอกบัตรของวันนี้จึงยังเป็นของผู้ใช้ · ข้ามวันที่มีใบลาตัวอย่างที่อนุมัติแล้ว
 * CEO ไม่ลงเวลา จึงไม่มีตัวอย่าง
 */
const SAMPLE_DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07"];
const SAMPLE_SKIP: Partial<Record<Role, string[]>> = {
  sales: ["2026-10-02"],
  staff: ["2026-09-29"],
  intern: ["2026-09-28"],
};
/* ลำดับบทบาทเลื่อนนาทีให้แต่ละคนไม่ตรงกันเป๊ะ — วันที่สามของบางคนมาสายเล็กน้อย */
const SAMPLE_ROLES: Role[] = ["sales", "ps", "pm", "acc", "hr", "staff", "gm", "intern", "maid"];

function samplePunches(role: Role): PunchRecord[] {
  const n = SAMPLE_ROLES.indexOf(role);
  if (n < 0) return [];
  const pad = (v: number) => String(v).padStart(2, "0");
  /* บัญชีกับบุคคลเป็นคนเดียวกัน — เวลาเดียวกันทั้งสองบทบาท */
  const k = role === "hr" ? SAMPLE_ROLES.indexOf("acc") : n;
  return SAMPLE_DAYS.filter((d) => !(SAMPLE_SKIP[role] ?? []).includes(d)).flatMap((d, i) => {
    const late = (i + k) % 7 === 3;
    /* แม่บ้านเข้า 08:00 เลิก 17:00 — ตัวอย่างเลื่อนเร็วขึ้นหนึ่งชั่วโมง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    const shift = role === "maid" ? -60 : 0;
    const inMin = shift + (late ? 9 * 60 + 5 + ((k * 3) % 12) : 8 * 60 + 35 + ((i * 7 + k * 5) % 22));
    const outMin = shift + 18 * 60 + 2 + ((i * 11 + k * 3) % 40);
    const at = (m: number) => `${d}T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00+07:00`;
    return [
      { id: `sample-${role}-${d}-in`, type: "in" as const, at: at(inMin), note: "" },
      { id: `sample-${role}-${d}-out`, type: "out" as const, at: at(outMin), note: "" },
    ];
  });
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
  sch: DaySchedule = companySchedule(),
) {
  /* กะ 09:00–18:00 เป็นหน้าปัดไทย จึงย้ายทั้งคู่ไปคิดบนหน้าปัดไทยก่อน
     ผลลัพธ์เป็นผลต่างของเวลา ส่วนที่เลื่อนไปจึงหักล้างกันเอง */
  const fromWall = bkkOf(from);
  const untilWall = bkkOf(new Date(until)).getTime();
  // กะของวันนั้นขยับตามใบลา — ลาครึ่งเช้าแล้วมาถึง 12:50 ก็เริ่มนับ 13:00
  const midnight = new Date(fromWall);
  midnight.setHours(0, 0, 0, 0);
  const at = (min: number) => midnight.getTime() + min * 60_000;

  const dayStart = at(expectedInMinutes(leave, sch));
  const dayEnd = at(expectedOutMinutes(leave, sch));
  const lunchStart = at(minutesOfDay(sch.lunchStart));
  const lunchEnd = at(minutesOfDay(sch.lunchEnd));

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
  sch: DaySchedule = companySchedule(),
) {
  let total = 0;
  let openedAt: Date | null = null;
  for (const r of dayRecords) {
    const at = new Date(r.at);
    if (r.type === "in") {
      openedAt = at;
    } else if (openedAt !== null) {
      total += countableMs(openedAt, at.getTime(), leave, sch);
      openedAt = null;
    }
  }
  if (openedAt !== null) total += countableMs(openedAt, now, leave, sch);
  return total;
}

/**
 * ชั่วโมงที่อยู่จริงของวัน (ไม่ตัดตามกะ) — ใช้แสดงผล ไม่ใช้คิดเงิน
 * now = ชั่วขณะจริงเป็น epoch ms · ข้างในย้ายไปคิดบนหน้าปัดไทย เพราะพักเที่ยงเป็นเวลาไทย
 */
export function actualMsOfDay(dayRecords: PunchRecord[], now: number, sch: DaySchedule = companySchedule()) {
  let total = 0;
  let openedAt: number | null = null;
  /* a, b, day เป็นเวลาไทยแล้วทั้งหมด — setHours จึงได้เที่ยงคืนของไทย */
  const lunch = (a: number, b: number, day: Date) => {
    const m = new Date(day);
    m.setHours(0, 0, 0, 0);
    const ls = m.getTime() + minutesOfDay(sch.lunchStart) * 60_000;
    const le = m.getTime() + minutesOfDay(sch.lunchEnd) * 60_000;
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
