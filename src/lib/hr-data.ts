/*
 * ฝ่ายบุคคล — ข้อมูลพนักงาน เวลาทำงานรายเดือน และฐานการคำนวณเงินเดือน
 *
 * ยังไม่ต่อ backend ชุดนี้จึงเป็นข้อมูลตั้งต้น ของจริงต้องมาจากตาราง
 * employee / employee_document / employment_history / attendance_record /
 * leave_request / overtime_request / timesheet_period / payroll_run / payslip
 *
 * ⚠️ รหัส E01–E10 เป็นคนกลุ่มเดียวกับ PM_TEAM ใน pm-data.ts (ชื่อตรงกัน)
 * แต่คนละแกน — ฝั่ง PM เก็บ "ทักษะที่รับงานได้" ส่วนฝั่ง HR เก็บ "ตำแหน่งตามสัญญาจ้าง"
 * คนหนึ่งมีตำแหน่งเดียวแต่รับงานได้หลายทักษะ จึงยังแยกกันอยู่จนกว่าจะมีตารางพนักงานจริง
 * (E11 ขึ้นไปเป็นคนละคนกัน เพราะสองชุดนี้เดินเลขต่อกันคนละที)
 */

import type { Role } from "./role";
import { daysBetween, thaiDate, thaiMonth, toIsoDate, todayIso } from "./format";
import { ratesOn, settings } from "./system-settings";
import { merged } from "./catalog";
import { holidays } from "./holidays";
import { otKindOf } from "./ot-data";
import { WORK_SCHEDULE, minutesOfDay, scheduleFor, targetWorkMs, type DaySchedule } from "./work-schedule";
import { LEAVE_DAY_HOURS, entitlementDays, halfHours, leavePeriodOf, leaveYearOf, periodRange } from "./leave-data";

/** สายงาน — ใช้จัดกลุ่มในรายงานและตัวกรอง */
/** รหัสแผนก — ชุดตั้งต้นด้านล่าง + ที่ผู้ดูแลระบบเพิ่ม (hrDepts()) */
export type DeptKey = string;

export const BUILTIN_HR_DEPT: { v: DeptKey; label: string }[] = [
  { v: "backoffice", label: "Back Office" },
  { v: "marketing", label: "Marketing" },
  { v: "bd", label: "Business Development" },
  { v: "website", label: "Website" },
  { v: "developer", label: "Developer" },
];

/*
 * ตำแหน่งตามสัญญาจ้าง — pos คือ "ตำแหน่งหลัก" มีคนละหนึ่งตำแหน่ง
 * ควบตำแหน่งอื่นเพิ่มได้ที่ posMore (เจ้าของสั่ง 28 ก.ย. 2569 "ให้ได้หลายตำแหน่ง")
 * เงินเดือน ค่าคอม และสายอนุมัติรายตำแหน่งยังคิดจากตำแหน่งหลักเสมอ — ตำแหน่งควบใช้บอกว่ารับงานอะไรอีกบ้าง
 */
/** รหัสตำแหน่ง — ชุดตั้งต้นด้านล่าง + ที่ผู้ดูแลระบบเพิ่ม (hrPositions()) */
export type PosKey = string;

/* ชื่อตำแหน่งใช้ชื่อเต็มทุกที่ในระบบ ไม่ใช้ตัวย่อ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
export const BUILTIN_HR_POSITION: { v: PosKey; label: string; dept: DeptKey }[] = [
  { v: "account_hr", label: "บัญชีและบุคคล", dept: "backoffice" },
  { v: "maid", label: "แม่บ้าน", dept: "backoffice" },
  { v: "graphic", label: "Graphic", dept: "marketing" },
  { v: "pm", label: "Project Manager", dept: "marketing" },
  { v: "content", label: "Content", dept: "marketing" },
  { v: "gm", label: "General Manager", dept: "marketing" },
  { v: "media", label: "Media planner", dept: "marketing" },
  { v: "bd", label: "Business Development", dept: "bd" },
  /* ERD ระบุ 12 ตำแหน่ง รวม sales — ยังไม่ยืนยันว่าอยู่แผนกไหน (ERD ข้อ 8) จึงวางไว้ใต้ BD ไปก่อน */
  { v: "sales", label: "Sales", dept: "bd" },
  { v: "website", label: "Website", dept: "website" },
  { v: "sa", label: "System Analysis", dept: "developer" },
  { v: "dev", label: "Developer", dept: "developer" },
];

/** ตัวย่อตำแหน่ง → ชื่อเต็ม — ใช้แปลงข้อความเก่าที่เก็บเป็นตัวย่อ เช่น "ปิยะวัฒน์ (SA)" (ผู้ใช้สั่ง 29 ต.ค. 2569) */
export const POS_FULL_NAME: Record<string, string> = {
  SA: "System Analysis",
  PM: "Project Manager",
  GM: "General Manager",
  BD: "Business Development",
  Dev: "Developer",
  HR: "Human Resources",
  CEO: "Chief Executive Officer",
};

/** ชื่อเต็มของตำแหน่ง — ไม่ใช่ตัวย่อที่รู้จักคืนข้อความเดิม */
export function posFullName(label: string) {
  return POS_FULL_NAME[label] ?? label;
}

/** "ชื่อ (SA)" → "ชื่อ (System Analysis)" · "PM" ล้วน → "Project Manager" — แปลงเฉพาะตัวย่อทั้งข้อความหรือในวงเล็บท้ายข้อความ */
export function withFullPos(text: string) {
  const whole = POS_FULL_NAME[text.trim()];
  if (whole) return whole;
  return text.replace(/\(([^()]+)\)\s*$/, (all, abbr: string) => {
    const full = POS_FULL_NAME[abbr.trim()];
    return full ? `(${full})` : all;
  });
}

/* ชื่อตั้งต้นเดิมของตำแหน่ง (ตัวย่อ) — ค่าที่ผู้ดูแลบันทึกไว้ก่อน 29 ต.ค. 2569 ยังเป็นตัวย่อ
   แปลงเป็นชื่อเต็มเฉพาะที่ยังเป็นชื่อเดิม ชื่อที่ผู้ดูแลตั้งใหม่เองไม่แตะ */
const OLD_BUILTIN_POS_LABEL: Record<PosKey, string> = { pm: "PM", gm: "GM", bd: "BD", sa: "SA", dev: "Dev" };

export function migratePosLabels<T extends { v: PosKey; label: string }>(saved: T[] | undefined): T[] | undefined {
  return saved?.map((p) => (OLD_BUILTIN_POS_LABEL[p.v] === p.label ? { ...p, label: posFullName(p.label) } : p));
}

/** ทุกตำแหน่งของคนนี้ — ตำแหน่งหลักมาก่อน แล้วตามด้วยตำแหน่งที่ควบ */
export function posOf(e: { pos: PosKey; posMore?: PosKey[] }): PosKey[] {
  return [e.pos, ...(e.posMore ?? []).filter((p) => p && p !== e.pos)];
}

/** คนนี้ทำตำแหน่งนี้อยู่ไหม (นับตำแหน่งควบด้วย) */
export function holdsPos(e: { pos: PosKey; posMore?: PosKey[] }, v: PosKey) {
  return posOf(e).includes(v);
}

export function hrPos(v: PosKey) {
  return hrPositions().find((p) => p.v === v) ?? { v, label: v, dept: "backoffice" as DeptKey };
}

/** แผนก ตำแหน่ง และเอกสารประจำตัวทั้งหมด — ผู้ดูแลระบบเพิ่ม/แก้ได้ที่ /admin/options */
export function hrDepts() {
  return merged(settings().catalog.depts, BUILTIN_HR_DEPT, (d) => d.v);
}
export function hrPositions() {
  return merged(migratePosLabels(settings().catalog.positions), BUILTIN_HR_POSITION, (p) => p.v);
}

/** ตำแหน่งที่ยังเปิดใช้ — ใช้ในดรอปดาวน์ตอนเลือกตำแหน่งใหม่ (ของเดิมที่ปิดไปแล้วยังอ่านชื่อได้ด้วย hrPos) */
export function hrActivePositions(keep?: PosKey) {
  return hrPositions().filter((p) => !("off" in p && p.off) || p.v === keep);
}
export function hrDocs() {
  return merged(settings().catalog.docs, BUILTIN_HR_DOCS, (d) => d.v);
}

export function hrDept(v: DeptKey) {
  return hrDepts().find((d) => d.v === v) ?? { v, label: v };
}

/*
 * กฎการทดลองงาน
 *
 * พนักงานใหม่ทุกคนได้สถานะ "ทดลองงาน" ก่อนเสมอ HR เป็นคนเปลี่ยนเป็นประจำเมื่อผ่านเกณฑ์
 * ระบบไม่เปลี่ยนให้เอง เพราะการผ่านทดลองงานเป็นการตัดสินใจของคน ไม่ใช่ผลของปฏิทิน
 *
 * ระยะทดลองงาน 3 เดือน — HR ตอบในเอกสารสัมภาษณ์ ผู้ใช้ยืนยัน 22 ก.ย. 2569 (ใช้ทุกหน้า ไม่ใช้ 119 วันของต้นแบบแดชบอร์ด)
 * แก้ได้ที่เดียวในตั้งค่าอัตรา (settings().rates.probationMonths = probation_months ใน ERD)
 * TODO: ⚠️ ต้องแจ้งเตือนล่วงหน้าก่อนครบกำหนดหรือไม่ กี่วัน
 * ฝึกงานไม่ใช่การทดลองงาน จึงไม่มีวันครบกำหนด
 */
export const probationMonths = () => settings().rates.probationMonths;

/** วันสุดท้ายของช่วงทดลองงาน — นับจากวันเริ่มงานไปตามจำนวนเดือนที่ตั้งไว้ แล้วถอยหนึ่งวัน */
export function probEnd(startedAt: string) {
  const [y, m, d] = startedAt.split("-").map(Number);
  const end = new Date(y, m - 1 + probationMonths(), d);
  end.setDate(end.getDate() - 1);
  return end;
}

export type EmpType = "full" | "probat" | "intern";

export const HR_EMPTYPE: Record<EmpType, { label: string }> = {
  full: { label: "พนักงานประจำ" },
  probat: { label: "ทดลองงาน" },
  intern: { label: "ฝึกงาน" },
};

export type EmpStatus = "active" | "left";

export const HR_STATUS: Record<EmpStatus, { label: string; cls: string }> = {
  active: { label: "ปฏิบัติงานอยู่", cls: "t-ok" },
  left: { label: "พ้นสภาพ", cls: "t-miss" },
};

/** เอกสารประจำตัว — req:false คือมีก็ได้ ไม่มีก็ไม่ถือว่าขาด */
/** รหัสเอกสารประจำตัว — ชุดตั้งต้นด้านล่าง + ที่ผู้ดูแลระบบเพิ่ม (hrDocs()) */
export type DocKey = string;

export const BUILTIN_HR_DOCS: { v: DocKey; label: string; req: boolean }[] = [
  {v:"idcard",  label:"สำเนาบัตรประชาชน",       req:true},
  {v:"house",   label:"สำเนาทะเบียนบ้าน",        req:true},
  {v:"degree",  label:"สำเนาวุฒิบัตร",           req:true},
  {v:"photo",   label:"รูปถ่าย 1 นิ้ว",           req:true},
  {v:"resume",  label:"เรซูเม่",                  req:true},
  {v:"license", label:"สำเนาใบขับขี่",            req:false},
  {v:"cert",    label:"ใบรับรองผ่านงาน/อบรม",    req:false},
  {v:"work",    label:"ผลงาน",                   req:false}
];

export type SalaryStep = { at: string; pos: PosKey; salary: number; note: string };

/*
 * บัญชีผู้ใช้ของพนักงาน (ตามต้นแบบ dose-erp-maz/hr-accounts.html)
 * บริษัทไม่มีอีเมลพนักงาน จึงใช้ชื่อผู้ใช้ที่ฝ่ายบุคคลกำหนด
 * mustChange = ต้องตั้งรหัสใหม่ตอนเข้าระบบครั้งแรก (รหัสที่ให้ไปเป็นรหัสชั่วคราว)
 *
 * roles = บทบาทที่บัญชีนี้เข้าใช้ได้ คนหนึ่งควบได้สูงสุด HR_MAX_ROLES บทบาท
 * (เช่น คนที่ทำทั้งบัญชีและบุคคล) — บัญชีเก่าที่ยังไม่มีช่องนี้อ่านผ่าน accountRoles()
 */
export type EmpAccount = {
  user: string;
  roles?: Role[];
  /**
   * รุ่นของชุดบทบาทตั้งต้น (ACCOUNT_ROLE_SEED) ที่ใส่ให้บัญชีนี้ไปแล้ว — กันไม่ให้ใส่ซ้ำ
   * ขึ้นรุ่นเมื่อชุดตั้งต้นเปลี่ยน เครื่องที่เก็บของเดิมไว้จะได้บทบาทที่เพิ่มใหม่ด้วย
   */
  seeded?: number;
  status: "active" | "suspended";
  mustChange: boolean;
  createdAt: string;
};

/** บทบาทที่ล็อกอินได้ → รหัสในทะเบียนพนักงาน */
/**
 * ใบเบิกที่อนุมัติแล้วของพนักงานตามต้นแบบ hr-payroll.html (HR_REIMB) — จ่ายคืนพร้อมเงินเดือน
 * คนเหล่านี้ยังไม่มีบัญชีเข้าระบบ ใบเบิกจึงไม่ได้อยู่ในหน้าเบิกค่าใช้จ่าย · ของคนที่มีบัญชีอ่านจากใบเบิกจริง (hr-link)
 */
export const HR_REIMB: { no: string; emp: string; label: string; amount: number; decidedAt: string }[] = [
  { no: "EX-2569-0003", emp: "E01", label: "ค่าน้ำมัน มิถุนายน 2569", amount: 180, decidedAt: "2026-07-08" },
  { no: "EX-2569-0005", emp: "E05", label: "ค่าน้ำมัน กรกฎาคม 2569", amount: 95, decidedAt: "2026-08-12" },
  { no: "EX-2569-0004", emp: "E06", label: "ค่าน้ำมัน กรกฎาคม 2569", amount: 140, decidedAt: "2026-08-27" },
];

/*
 * การเข้างานตัวอย่างของวันนี้ (ต้นแบบ ceo-dashboard.html CEO_CHECKIN / CEO_LEAVE_TODAY)
 * ใช้เฉพาะคนที่ยังไม่มีการตอกบัตรจริงในวันนั้น — คนที่ตอกบัตรแล้วใช้เวลาจริงเสมอ
 * TODO: ⚠️ ข้อมูลสมมติ ของจริงมาจากเครื่องตอกบัตรของทุกคนเมื่อเปิดบัญชีครบ
 */
export const DEMO_CHECKIN: Record<string, string> = {
  E01: "08:47", E02: "08:55", E03: "09:12", E04: "08:31", E06: "08:58", E07: "09:26", E08: "08:50",
  E10: "08:40", E11: "08:20", E12: "08:35", E13: "08:59", E14: "08:44", E15: "07:55", E17: "08:52",
};
export const DEMO_LEAVE_TODAY: Record<string, LeaveKind> = { E09: "vacation" };

export const ROLE_EMPLOYEE: Partial<Record<Role, string>> = {
  /* ทะเบียนตามต้นแบบ: ขาย = E18 · PM = E10 · บัญชีกับบุคคลเป็นคนเดียวกัน (E12 ตำแหน่งบัญชีและบุคคล) */
  sales: "E18",
  /* ทีมก่อนการขาย = ปิยะวัฒน์ (SA) ตามต้นแบบ presales-work.html */
  ps: "E01",
  pm: "E10",
  acc: "E12",
  hr: "E12",
  /* ทีมงานอยู่ในทะเบียนมาตั้งแต่ต้นอยู่แล้ว (Website) ไม่ต้องเพิ่มคนสมมติ */
  staff: "E05",
  /* GM อยู่ในทะเบียนอยู่แล้ว (ประเสริฐ) */
  gm: "E11",
  /* นักศึกษาฝึกงาน (ผู้ใช้สั่ง 2 ต.ค. 2569) — ณัฐริกา ฝึกงานตำแหน่ง Graphic */
  intern: "E14",
  /* แม่บ้าน (ผู้ใช้สั่ง 2 ต.ค. 2569) — บุญเรือน หัวหน้าสายคืออรอนงค์ (E12) */
  maid: "E15",
};

/**
 * คนที่ล็อกอินเข้าระบบได้อยู่แล้ว (ROLE_EMPLOYEE) ต้องมีบัญชีในทะเบียน
 * ไม่งั้นหน้าเลือกบทบาทของผู้ดูแลระบบจะว่าง ทั้งที่มีคนใช้ระบบอยู่
 * บัญชีที่มีแล้วแต่ยังไม่มีบทบาท (สร้างก่อนมีช่องนี้) เติมบทบาทที่ผูกไว้ให้ · ของที่ตั้งไว้แล้วไม่ทับ
 */
export function withLoginAccounts(emp: Employee[]): Employee[] {
  const roleOf = new Map(Object.entries(ROLE_EMPLOYEE).map(([r, id]) => [id, r as Role]));
  const taken = emp.flatMap((e) => (e.account ? [e.account.user] : []));
  return emp.map((e) => {
    const role = roleOf.get(e.id);
    /* พนักงาน 1 คนมีบัญชี 1 บัญชี (ต้นแบบ AC-01 · ผู้ใช้สั่ง 6 ต.ค. 2569) — คนเดิมที่ยังไม่มีบัญชีได้บัญชีตั้งต้น
       ยังไม่มีบทบาท ฝ่ายบุคคลเลือกเมนูที่ใช้ได้เองที่หน้าจัดการบัญชีผู้ใช้ */
    if (!role) {
      if (e.account) return e;
      const user = suggestUser(e.name, taken);
      taken.push(user);
      return {
        ...e,
        account: {
          user,
          roles: [],
          status: e.status === "left" ? "suspended" : "active",
          mustChange: false,
          createdAt: e.startedAt,
        },
      };
    }
    const roles = ACCOUNT_ROLE_SEED[e.id] ?? [role];
    if (e.account) {
      if (!e.account.roles?.length)
        return { ...e, account: { ...e.account, roles, seeded: ROLE_SEED_VERSION } };
      /* ชุดตั้งต้นใส่ให้รุ่นละครั้ง — ผู้ดูแลระบบเอาบทบาทออกแล้วต้องไม่เด้งกลับมาทุกครั้งที่โหลด */
      if (roles.length > 1 && (e.account.seeded ?? 0) < ROLE_SEED_VERSION)
        return { ...e, account: { ...e.account, roles, seeded: ROLE_SEED_VERSION } };
      return e;
    }
    const user = suggestUser(e.name, taken);
    taken.push(user);
    return {
      ...e,
      account: { user, roles, seeded: ROLE_SEED_VERSION, status: "active", mustChange: false, createdAt: e.startedAt },
    };
  });
}

/**
 * บทบาทตั้งต้นของคนที่ควบหลายตำแหน่ง — อรอนงค์ ตำแหน่ง "บัญชีและบุคคล" ในทะเบียน
 * จึงถือทั้งฝ่ายบุคคลและบัญชี · ล็อกอินแล้วแถบซ้ายจะมีเมนูของทุกบทบาทที่ถืออยู่
 *
 * ⚠️ 25 ก.ย. 2569 เอา "ผู้ดูแลระบบ" ออกจากบัญชีนี้ (เจ้าของสั่งให้แยกออกไปเป็นบัญชีของตัวเอง)
 * ผู้ดูแลระบบยังเพิ่มให้บัญชีไหนก็ได้ที่ /admin/settings?s=positions&t=accounts แต่ไม่ได้ติดมากับใครตั้งแต่ต้นอีกแล้ว
 */
const ACCOUNT_ROLE_SEED: Record<string, Role[]> = {};

/** ขึ้นรุ่นเมื่อ ACCOUNT_ROLE_SEED เปลี่ยน — 3 = เอาผู้ดูแลระบบออกจากฝ่ายบุคคล (25 ก.ย. 2569) */
const ROLE_SEED_VERSION = 3;

/** ควบได้มากสุดกี่บทบาทต่อบัญชี — 2 ตามคนที่ควบบัญชีและบุคคล */
export const HR_MAX_ROLES = 2;

export function accountRoles(a?: EmpAccount): Role[] {
  return a?.roles ?? [];
}

export const HR_ACC_STATUS: Record<EmpAccount["status"], { label: string; cls: string }> = {
  active: { label: "ใช้งานอยู่", cls: "t-act" },
  suspended: { label: "ถูกระงับ", cls: "t-out" },
};

export type Employee = {
  id: string;
  name: string;
  nick: string;
  sex: string;
  birth: string;
  pos: PosKey;
  /** ตำแหน่งที่ควบเพิ่มจากตำแหน่งหลัก — ไม่มีคือทำตำแหน่งเดียว */
  posMore?: PosKey[];
  type: EmpType;
  status: EmpStatus;
  startedAt: string;
  /** มีเฉพาะคนที่พ้นสภาพแล้ว */
  leftAt?: string;
  leftWhy?: string;
  /** รหัสผู้บังคับบัญชา — ว่างคือไม่มี (ระดับบนสุด) */
  boss: string;
  edu: string;
  exp: string[];
  phone: string;
  email: string;
  address: string;
  sos: { name: string; rel: string; phone: string };
  docs: DocKey[];
  /* เรียงเก่า→ใหม่ ตัวสุดท้ายคือตำแหน่งและเงินเดือนปัจจุบัน */
  history: SalaryStep[];
  /** บัญชีเข้าระบบของคนนี้ — ไม่มีคีย์นี้คือยังไม่ได้สร้างบัญชี */
  account?: EmpAccount;
  /**
   * ผ่านทดลองงานกลางรอบ (ผู้ใช้สั่ง 13 ต.ค. 2569) — at = วันที่มีผล (ประเภทเป็นพนักงานประจำทันที)
   * payFrom = วันแรกของรอบเงินเดือนถัดไป จ่ายแบบทดลองงาน (รายวัน) ถึงวันก่อนหน้านี้ แล้วค่อยจ่ายรายเดือน
   */
  probPass?: { at: string; payFrom: string };
  /** ใครแก้ข้อมูลล่าสุด — พนักงานแก้ข้อมูลตัวเองไม่ได้ ต้องแจ้ง HR (เอกสารสัมภาษณ์) ระบบจึงเก็บผู้แก้ไว้ตรวจย้อน */
  edited?: { by: string; at: string };
  /**
   * บัญชีรับเงินเดือน — ใช้ในตารางสรุปเงินเดือนที่ CEO ใช้โอน (ผู้ใช้สั่ง 16 ต.ค. 2569)
   * ข้อมูลเก่าไม่มี สโตร์เติมเป็นค่าว่าง · ว่าง = แสดง "—"
   */
  bankName?: string;
  bankNo?: string;
  /** หัก กยศ. ต่อเดือน — HR กรอกตามที่ กยศ. แจ้ง ระบบเติมให้ทุกรอบ (ผู้ใช้สั่ง 30 ต.ค. 2569) */
  studentLoan?: number;
  /** เงินประกันผลงานที่หักไว้ก่อนเริ่มใช้ระบบ — HR กรอกครั้งเดียว (ผู้ใช้สั่ง 30 ต.ค. 2569) */
  guaranteeOpening?: number;
};

/** "ธนาคาร · เลขบัญชี" — ไม่มีทั้งคู่ = "—" (ผู้ใช้สั่ง 16 ต.ค. 2569) */
export function bankText(e: Pick<Employee, "bankName" | "bankNo">) {
  const t = [e.bankName?.trim(), e.bankNo?.trim()].filter(Boolean).join(" ");
  return t || "—";
}

/**
 * ชื่อผู้ใช้ที่ระบบเสนอจากชื่อจริง — ชื่อ + จุด + อักษรแรกของนามสกุล ซ้ำแล้วเติมเลข
 * เก็บสระและวรรณยุกต์ไว้ ตัดเฉพาะอักขระที่ใช้เป็นชื่อผู้ใช้ไม่ได้
 */
export function suggestUser(name: string, taken: string[]) {
  const parts = name.trim().split(/\s+/);
  const clean = (x: string) => (x ?? "").replace(/[^\u0E00-\u0E7Fa-zA-Z0-9]/g, "");
  const first = clean(parts[0]) || "user";
  const last = clean(parts[1] ?? "");
  const base = last ? `${first}.${last.charAt(0)}` : first;
  if (!taken.includes(base)) return base;
  /* ชนกับของเดิมก็ไล่เลขขึ้นจนกว่าจะว่าง */
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${base}${Date.now() % 1000}`;
}

export const HR_EMP: Employee[] = [
  {id:"E01", name:"ปิยะวัฒน์ แก้วใส", nick:"ปุ๊ก", sex:"ชาย", birth:"1994-03-18",
   pos:"sa", type:"full", status:"active", startedAt:"2022-06-01", boss:"E11",
   edu:"วท.บ. วิทยาการคอมพิวเตอร์ มหาวิทยาลัยเชียงใหม่",
   exp:["นักวิเคราะห์ระบบ บริษัทซอฟต์แวร์เฮาส์ 2 ปี"],
   phone:"081-330-4471", email:"piyawat.k@example.com",
   address:"99/12 ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300",
   sos:{name:"สมพร แก้วใส", rel:"มารดา", phone:"089-441-0012"},
   docs:["idcard","house","degree","photo","resume","license"],
   history:[{at:"2022-06-01", pos:"sa", salary:24000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2022-09-01", pos:"sa", salary:26000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"sa", salary:32000, note:"ปรับประจำปี"}]},

  {id:"E02", name:"ณิชา วงศ์อารีย์", nick:"ใบเตย", sex:"หญิง", birth:"1997-11-02",
   pos:"graphic", type:"full", status:"active", startedAt:"2023-02-16", boss:"E11",
   edu:"ศป.บ. ออกแบบนิเทศศิลป์ มหาวิทยาลัยศิลปากร",
   exp:["กราฟิกดีไซเนอร์ เอเจนซี่โฆษณา 1 ปี"],
   phone:"086-224-7781", email:"nicha.w@example.com",
   address:"45 ซอยนิมมานเหมินท์ 11 ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
   sos:{name:"ประภา วงศ์อารีย์", rel:"มารดา", phone:"081-556-2290"},
   docs:["idcard","house","degree","photo","resume","work"],
   history:[{at:"2023-02-16", pos:"graphic", salary:20000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2023-05-16", pos:"graphic", salary:22000, note:"ผ่านทดลองงาน"}]},

  {id:"E03", name:"ธนกฤต ศรีบุญเรือง", nick:"กฤต", sex:"ชาย", birth:"1998-07-25",
   pos:"website", type:"full", status:"active", startedAt:"2023-08-01", boss:"E11",
   edu:"วท.บ. เทคโนโลยีสารสนเทศ มหาวิทยาลัยแม่โจ้",
   exp:[],
   phone:"089-117-3320", email:"thanakrit.s@example.com",
   address:"12/5 ต.หนองหอย อ.เมือง จ.เชียงใหม่ 50000",
   sos:{name:"วิไล ศรีบุญเรือง", rel:"มารดา", phone:"084-229-1187"},
   docs:["idcard","house","degree","photo","resume"],
   history:[{at:"2023-08-01", pos:"website", salary:18000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2023-11-01", pos:"website", salary:20000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"website", salary:23000, note:"ปรับประจำปี"}]},

  {id:"E04", name:"อรรถพล ใจกล้า", nick:"พล", sex:"ชาย", birth:"1993-01-09",
   pos:"dev", type:"full", status:"active", startedAt:"2021-11-15", boss:"E11",
   edu:"วศ.บ. วิศวกรรมคอมพิวเตอร์ มหาวิทยาลัยเชียงใหม่",
   exp:["โปรแกรมเมอร์ บริษัทระบบคลังสินค้า 3 ปี"],
   phone:"082-449-6612", email:"atthaphon.j@example.com",
   address:"188 ต.ท่าศาลา อ.เมือง จ.เชียงใหม่ 50000",
   sos:{name:"ศิริพร ใจกล้า", rel:"ภรรยา", phone:"088-330-7745"},
   docs:["idcard","house","degree","photo","resume","license","cert"],
   history:[{at:"2021-11-15", pos:"dev", salary:26000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2022-02-15", pos:"dev", salary:28000, note:"ผ่านทดลองงาน"},
            {at:"2024-01-01", pos:"dev", salary:33000, note:"ปรับประจำปี"},
            {at:"2025-01-01", pos:"dev", salary:36000, note:"ปรับประจำปี"}]},

  {id:"E05", name:"กมลชนก พูนสุข", nick:"มายด์", sex:"หญิง", birth:"1999-05-14",
   pos:"website", type:"full", status:"active", startedAt:"2024-03-01", boss:"E11",
   edu:"วท.บ. เทคโนโลยีสารสนเทศ มหาวิทยาลัยพะเยา",
   exp:[],
   phone:"087-556-2214", email:"kamonchanok.p@example.com",
   address:"77/3 ต.สันผีเสื้อ อ.เมือง จ.เชียงใหม่ 50300",
   sos:{name:"อนันต์ พูนสุข", rel:"บิดา", phone:"081-990-3312"},
   docs:["idcard","house","degree","photo","resume"],
   history:[{at:"2024-03-01", pos:"website", salary:19000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2024-06-01", pos:"website", salary:21000, note:"ผ่านทดลองงาน"}]},

  {id:"E06", name:"ศุภณัฐ ทองแท้", nick:"บอส", sex:"ชาย", birth:"1996-09-30",
   pos:"dev", type:"full", status:"active", startedAt:"2022-01-10", boss:"E11",
   edu:"วท.บ. วิทยาการคอมพิวเตอร์ มหาวิทยาลัยแม่โจ้",
   exp:["โปรแกรมเมอร์ ฟรีแลนซ์ 2 ปี"],
   phone:"085-119-8834", email:"supanat.t@example.com",
   address:"30 หมู่ 6 ต.สันทรายน้อย อ.สันทราย จ.เชียงใหม่ 50210",
   sos:{name:"จันทร์เพ็ญ ทองแท้", rel:"มารดา", phone:"086-773-2201"},
   docs:["idcard","house","degree","photo","resume","license"],
   history:[{at:"2022-01-10", pos:"dev", salary:23000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2022-04-10", pos:"dev", salary:25000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"dev", salary:31000, note:"ปรับประจำปี"}]},

  {id:"E07", name:"พิมพ์ชนก ดีงาม", nick:"ฟ้า", sex:"หญิง", birth:"2000-02-11",
   pos:"content", type:"full", status:"active", startedAt:"2024-07-01", boss:"E11",
   edu:"นศ.บ. นิเทศศาสตร์ มหาวิทยาลัยเชียงใหม่",
   exp:[],
   phone:"090-334-1129", email:"pimchanok.d@example.com",
   address:"5/9 ต.ป่าแดด อ.เมือง จ.เชียงใหม่ 50100",
   sos:{name:"สมชาย ดีงาม", rel:"บิดา", phone:"081-224-9987"},
   docs:["idcard","house","degree","photo","resume","work"],
   history:[{at:"2024-07-01", pos:"content", salary:18000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2024-10-01", pos:"content", salary:20000, note:"ผ่านทดลองงาน"}]},

  {id:"E08", name:"วรากร สุขเสมอ", nick:"กร", sex:"ชาย", birth:"1995-12-05",
   pos:"sa", type:"full", status:"active", startedAt:"2023-05-02", boss:"E11",
   edu:"วท.บ. เทคโนโลยีสารสนเทศ มหาวิทยาลัยราชภัฏเชียงใหม่",
   exp:["ผู้ทดสอบระบบ บริษัทซอฟต์แวร์ 2 ปี"],
   phone:"083-667-4410", email:"warakorn.s@example.com",
   address:"220 ต.แม่เหียะ อ.เมือง จ.เชียงใหม่ 50100",
   sos:{name:"นงลักษณ์ สุขเสมอ", rel:"มารดา", phone:"089-114-5523"},
   docs:["idcard","house","degree","photo","resume"],
   history:[{at:"2023-05-02", pos:"sa", salary:22000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2023-08-02", pos:"sa", salary:24000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"sa", salary:27000, note:"ปรับประจำปี"}]},

  {id:"E09", name:"ธีรวัฒน์ ศรีสมบูรณ์", nick:"วัฒน์", sex:"ชาย", birth:"1994-08-22",
   pos:"media", type:"full", status:"active", startedAt:"2023-01-16", boss:"E11",
   edu:"บธ.บ. การตลาด มหาวิทยาลัยเชียงใหม่",
   exp:["Media planner เอเจนซี่ดิจิทัล 3 ปี"],
   phone:"084-229-7756", email:"teerawat.s@example.com",
   address:"61 ต.ฟ้าฮ่าม อ.เมือง จ.เชียงใหม่ 50000",
   sos:{name:"พรทิพย์ ศรีสมบูรณ์", rel:"ภรรยา", phone:"081-447-2230"},
   docs:["idcard","house","degree","photo","resume","license","cert"],
   history:[{at:"2023-01-16", pos:"media", salary:25000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2023-04-16", pos:"media", salary:27000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"media", salary:30000, note:"ปรับประจำปี"}]},

  {id:"E10", name:"ชนิกานต์ วัฒนกุล", nick:"แนน", sex:"หญิง", birth:"1992-04-07",
   pos:"pm", type:"full", status:"active", startedAt:"2021-03-01", boss:"E11",
   edu:"บธ.บ. บริหารธุรกิจ มหาวิทยาลัยธรรมศาสตร์",
   exp:["Account Executive เอเจนซี่โฆษณา 4 ปี"],
   phone:"081-556-9902", email:"chanikan.w@example.com",
   address:"150/8 ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
   sos:{name:"ธนากร วัฒนกุล", rel:"สามี", phone:"086-119-4478"},
   docs:["idcard","house","degree","photo","resume","license"],
   history:[{at:"2021-03-01", pos:"pm", salary:28000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2021-06-01", pos:"pm", salary:30000, note:"ผ่านทดลองงาน"},
            {at:"2024-01-01", pos:"pm", salary:34000, note:"ปรับประจำปี"},
            {at:"2025-01-01", pos:"pm", salary:38000, note:"ปรับประจำปี"}]},

  {id:"E11", name:"ประเสริฐ มั่นคงดี", nick:"เสริฐ", sex:"ชาย", birth:"1985-10-19",
   pos:"gm", type:"full", status:"active", startedAt:"2019-05-01", boss:"",
   edu:"บธ.ม. บริหารธุรกิจ มหาวิทยาลัยเชียงใหม่",
   exp:["ผู้จัดการฝ่ายการตลาด บริษัทค้าปลีก 6 ปี"],
   phone:"081-889-2211", email:"prasert.m@example.com",
   address:"9/1 ต.ช้างคลาน อ.เมือง จ.เชียงใหม่ 50100",
   sos:{name:"มาลี มั่นคงดี", rel:"ภรรยา", phone:"089-556-1123"},
   docs:["idcard","house","degree","photo","resume","license","cert"],
   history:[{at:"2019-05-01", pos:"gm", salary:45000, note:"เริ่มงาน"},
            {at:"2024-01-01", pos:"gm", salary:52000, note:"ปรับประจำปี"}]},

  {id:"E12", name:"อรอนงค์ พรหมมา", nick:"อร", sex:"หญิง", birth:"1990-06-28",
   pos:"account_hr", type:"full", status:"active", startedAt:"2020-09-01", boss:"E11",
   edu:"บช.บ. การบัญชี มหาวิทยาลัยพายัพ",
   exp:["เจ้าหน้าที่บัญชี สำนักงานบัญชี 3 ปี"],
   phone:"088-224-3390", email:"ornanong.p@example.com",
   address:"33 ต.วัดเกต อ.เมือง จ.เชียงใหม่ 50000",
   sos:{name:"บุญส่ง พรหมมา", rel:"บิดา", phone:"081-330-2214"},
   docs:["idcard","house","degree","photo","resume","cert"],
   history:[{at:"2020-09-01", pos:"account_hr", salary:22000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2020-12-01", pos:"account_hr", salary:24000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"account_hr", salary:29000, note:"ปรับประจำปี"}]},

  /* พนักงานขายคนเดียวของบริษัท (ต้นแบบ dose-erp-maz/hr-employees.html) — ผู้ใช้บทบาทฝ่ายขาย */
  {id:"E18", name:"ชนัญชิดา ใจดี", nick:"ชญ", sex:"หญิง", birth:"1995-06-12",
   pos:"sales", type:"full", status:"active", startedAt:"2023-02-01", boss:"E11",
   edu:"บธ.บ. การตลาด มหาวิทยาลัยพายัพ",
   exp:["พนักงานขาย บริษัทโฆษณา 3 ปี"],
   phone:"089-556-1120", email:"chananchida.j@example.com",
   address:"55/9 ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300",
   sos:{name:"สมพร ใจดี", rel:"มารดา", phone:"089-556-1121"},
   docs:["idcard","house","degree","photo","resume"],
   history:[{at:"2023-02-01", pos:"sales", salary:18000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2023-05-01", pos:"sales", salary:20000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"sales", salary:22000, note:"ปรับประจำปี"}]},

  {id:"E13", name:"ธนดล เกียรติศักดิ์", nick:"ดล", sex:"ชาย", birth:"1991-02-14",
   pos:"bd", type:"full", status:"active", startedAt:"2022-04-01", boss:"E11",
   edu:"บธ.บ. การจัดการ มหาวิทยาลัยเชียงใหม่",
   exp:["ผู้แทนขาย บริษัทซอฟต์แวร์ 4 ปี"],
   phone:"086-441-7789", email:"thanadol.k@example.com",
   address:"71/4 ต.หายยา อ.เมือง จ.เชียงใหม่ 50100",
   sos:{name:"สุนีย์ เกียรติศักดิ์", rel:"มารดา", phone:"084-119-8823"},
   docs:["idcard","house","degree","photo","resume","license"],
   history:[{at:"2022-04-01", pos:"bd", salary:24000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2022-07-01", pos:"bd", salary:26000, note:"ผ่านทดลองงาน"},
            {at:"2025-01-01", pos:"bd", salary:30000, note:"ปรับประจำปี"}]},

  {id:"E14", name:"ณัฐริกา ใจอารีย์", nick:"ริกา", sex:"หญิง", birth:"2003-01-20",
   pos:"graphic", type:"intern", status:"active", startedAt:"2026-06-01", boss:"E11",
   edu:"กำลังศึกษา ศป.บ. ออกแบบนิเทศศิลป์ มหาวิทยาลัยเชียงใหม่ ชั้นปีที่ 4",
   exp:[],
   phone:"092-556-1140", email:"nattarika.j@example.com",
   address:"18 ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200",
   sos:{name:"วีระ ใจอารีย์", rel:"บิดา", phone:"087-224-6612"},
   docs:["idcard","photo","resume"],
   history:[{at:"2026-06-01", pos:"graphic", salary:6000, note:"ฝึกงาน 4 เดือน"}]},

  {id:"E15", name:"บุญเรือน สายทอง", nick:"ป้าเรือน", sex:"หญิง", birth:"1974-07-03",
   pos:"maid", type:"full", status:"active", startedAt:"2019-08-01", boss:"E12",
   edu:"มัธยมศึกษาตอนต้น",
   exp:[],
   phone:"080-114-2290", email:"",
   address:"104 ต.ป่าตัน อ.เมือง จ.เชียงใหม่ 50300",
   sos:{name:"ประยูร สายทอง", rel:"สามี", phone:"080-114-2291"},
   docs:["idcard","house","photo"],
   history:[{at:"2019-08-01", pos:"maid", salary:11000, note:"เริ่มงาน"},
            {at:"2025-01-01", pos:"maid", salary:12500, note:"ปรับประจำปี"}]},

  {id:"E17", name:"ภัทรพล คำมูล", nick:"ต้น", sex:"ชาย", birth:"1999-10-08",
   pos:"website", type:"probat", status:"active", startedAt:"2026-07-15", boss:"E11",
   edu:"วท.บ. วิทยาการคอมพิวเตอร์ มหาวิทยาลัยราชภัฏเชียงใหม่",
   exp:["นักพัฒนาเว็บ ฟรีแลนซ์ 1 ปี"],
   phone:"091-224-8830", email:"pattarapon.k@example.com",
   address:"88 ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300",
   sos:{name:"สมหมาย คำมูล", rel:"บิดา", phone:"089-117-2245"},
   docs:["idcard","house","degree","photo","resume"],
   history:[{at:"2026-07-15", pos:"website", salary:19000, note:"เริ่มงาน ทดลองงาน"}]},

  {id:"E16", name:"สิทธิชัย รุ่งเรือง", nick:"ชัย", sex:"ชาย", birth:"1996-03-12",
   pos:"content", type:"full", status:"left", startedAt:"2023-03-01", leftAt:"2026-05-31",
   leftWhy:"ลาออก ย้ายกลับภูมิลำเนา", boss:"E11",
   edu:"นศ.บ. นิเทศศาสตร์ มหาวิทยาลัยราชภัฏเชียงใหม่",
   exp:["ครีเอทีฟคอนเทนต์ เอเจนซี่ 1 ปี"],
   phone:"089-441-0098", email:"sitthichai.r@example.com",
   address:"56 ต.สันกลาง อ.สันกำแพง จ.เชียงใหม่ 50130",
   sos:{name:"อารีย์ รุ่งเรือง", rel:"มารดา", phone:"081-556-3341"},
   docs:["idcard","house","degree","photo","resume"],
   history:[{at:"2023-03-01", pos:"content", salary:19000, note:"เริ่มงาน ทดลองงาน"},
            {at:"2023-06-01", pos:"content", salary:21000, note:"ผ่านทดลองงาน"}]}
];

/*
 * วันหยุดบริษัท — ใช้ตัดออกจากวันทำการของรอบ
 * อ่านจากหน้าวันหยุดบริษัทของผู้ดูแลระบบ (holidays.ts) ชุดเดียวกับใบลา โอที และปฏิทินทุกหน้า
 * เดิมฝ่ายบุคคลมีรายการวันหยุดของตัวเองแยกไว้ 3 วัน วันทำการของรอบจึงไม่ตรงกับหน้าอื่น
 */

/*
 * รอบเงินเดือนตัดวันที่ผู้ดูแลระบบตั้งไว้ (ค่าตั้งต้นวันที่ 25) รอบถัดไปเริ่มวันรุ่งขึ้น
 * รอบ "สิงหาคม 2569" จึงหมายถึง 26 ก.ค. 2569 ถึง 25 ส.ค. 2569
 *
 * อ่านผ่านฟังก์ชันทุกครั้ง ห้ามเก็บเป็นค่าคงที่ระดับไฟล์ — ผู้ดูแลแก้แล้วต้องมีผลทันทีทั้งระบบ
 *
 * TODO: ⚠️ วันจ่ายเงินเดือนคือสิ้นเดือนหรือวันที่ 1 ของเดือนถัดไป ยังไม่ยืนยัน
 */
export function hrCutDay() {
  return settings().schedule.payCutDay;
}

function pad2(n: number) {
  return (n < 10 ? "0" : "") + n;
}

function isoOf(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** ช่วงวันหนึ่งช่วง — ปกติคือรอบเดือน แต่หน้าคำนวณเงินเดือนกำหนดเองได้ */
export type Cycle = { from: string; to: string };

/** ช่วงวันของรอบเดือนหนึ่ง — "2026-08" → 26 ก.ค. ถึง 25 ส.ค. */
export function hrCycle(month: string): Cycle {
  const [y, mo] = month.split("-").map(Number);
  const cut = hrCutDay();
  return {
    from: isoOf(new Date(y, mo - 2, cut + 1)),
    to: isoOf(new Date(y, mo - 1, cut)),
  };
}

/** บันทึกเก่า (ใคร เมื่อไร เพราะอะไร) — เก็บไว้ให้ข้อมูลเดิมอ่านได้ หน้าจอรอบเงินเดือนไม่อ่านแล้ว (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export type Reopen = { at: string; by: string; why: string };

/* พนักงานรายเดือนกับทดลองงานจ่ายรายวันคิดคนละฐาน ปิดรอบจึงแยกกลุ่มกัน */
export type PayGroup = "month" | "day";

/** ชื่อกลุ่มการจ่าย ใช้ในหัวกล่องและป้ายสถานะของทุกหน้าในสายรอบเงินเดือน */
export const GROUP_LABEL: Record<PayGroup, string> = {
  month: "พนักงานรายเดือน",
  /* ทดลองงานจ่ายรายสัปดาห์ (ผู้ใช้สั่ง 19 ต.ค. 2569 · เดิมรายวัน) */
  day: "ทดลองงาน จ่ายรายสัปดาห์",
};

/** ยอดของคนหนึ่งที่บันทึกไว้ตอนปิดรอบ — ย้อนดูได้แม้เงินเดือนเปลี่ยนภายหลัง */
export type CycleLine = {
  id: string;
  name: string;
  pos: PosKey;
  base: number;
  ot: number;
  /** ค่าคอม ค่าตอบแทนพิเศษ เบี้ยเลี้ยง รวมรายได้ และรายการปรับปรุงพร้อมเหตุผล
      — รอบที่ปิดก่อนมีช่องเหล่านี้ไม่มีเก็บไว้ หน้าที่อ่านต้องถือว่าเป็น 0 */
  com?: number;
  inc?: number;
  allow?: number;
  /** รายได้รายการอื่นที่กรอกเอง (นอกจาก Incentive/ค่าตำแหน่ง) รวมกัน — รอบเก่าไม่มี = 0 (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  more?: number;
  gross?: number;
  /** รายการปรับปรุงด้วยมือแบบเก่า — รอบที่ปิดก่อน 16 ต.ค. 2569 เท่านั้น รอบใหม่เก็บ items */
  adjust?: Adjust[];
  /** รายการเงินได้/รายการหักที่กรอกเองตามแบบสลิป ณ วันปิดรอบ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  items?: PayItems;
  /** = −(รวมรายการหักที่กรอกเอง) · รอบเก่าคือยอดปรับปรุงรวม (บวกได้) */
  adj: number;
  ss: number;
  late: number;
  /** ภาษีหัก ณ ที่จ่าย 3% ของทดลองงานจ่ายรายวัน — รอบที่ปิดก่อนมีช่องนี้ไม่มี = สลิปเว้นว่าง ไม่คิดย้อน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  wht?: number;
  /** ค่าใช้จ่ายคืน (ใบเบิกที่อนุมัติแล้ว) — ไม่ใช่รายได้ ไม่คิดประกันสังคม บวกเข้ายอดสุทธิ · รอบเก่าไม่มี */
  reimb?: number;
  net: number;
  /** เฉพาะกลุ่มจ่ายรายวัน — วันที่มาทำงานและอัตราต่อวัน */
  days: number;
  rate: number;
};

/** ยอดรวมของกลุ่มหนึ่งในรอบหนึ่ง บันทึกตอนกดปิดรอบ ไม่ได้คำนวณใหม่ */
export type CycleSum = {
  n: number;
  base: number;
  ot: number;
  com: number;
  inc: number;
  allow: number;
  /** รายได้อื่นที่กรอกเอง · ภาษีหัก ณ ที่จ่าย — รอบเก่าไม่มี (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  more?: number;
  wht?: number;
  adj: number;
  ss: number;
  late: number;
  /** ค่าใช้จ่ายคืน (ใบเบิกที่อนุมัติแล้ว) — ไม่ใช่รายได้ ไม่คิดประกันสังคม บวกเข้ายอดสุทธิ · รอบเก่าไม่มี */
  reimb?: number;
  net: number;
  days: number;
  lines: CycleLine[];
};

export type Period = {
  month: string;
  closed: boolean;
  closedAt: string;
  closedBy: string;
  reopened: Reopen[];
  /** กลุ่มทดลองงานจ่ายรายวัน ปิดแยกจากกลุ่มรายเดือน */
  dayClosed: boolean;
  dayClosedAt: string;
  dayClosedBy: string;
  dayReopened: Reopen[];
  /** ยอดที่ปิดไว้ของแต่ละกลุ่ม — มีเฉพาะรอบเงินเดือน (payruns) */
  sum: CycleSum | null;
  daySum: CycleSum | null;
};

/*
 * ด่านเดียวกันทุกหน้า — "รอบของกลุ่มนี้ปิดแล้วหรือยัง" และ "ยอดที่บันทึกไว้ตอนปิด"
 * หน้าจอต้องถามผ่านสามตัวนี้ ห้ามอ่าน p.closed / p.daySum เองทีละที่
 * ไม่งั้นจะมีบางหน้าที่ลืมเช็คกลุ่มรายวัน แล้วแก้ตัวเลขของรอบที่ปิดไปแล้วได้ (HR-BR-03)
 */
export function closedIn(p: Period | undefined, group: PayGroup) {
  return Boolean(group === "day" ? p?.dayClosed : p?.closed);
}

/** ยอดของกลุ่มนี้ที่บันทึกไว้ ณ วันปิดรอบ — ไม่มี = รอบนี้ยังไม่ปิด (หรือเป็นรอบเก่าก่อนมีการเก็บยอด) */
export function sumIn(p: Period | undefined, group: PayGroup) {
  return (group === "day" ? p?.daySum : p?.sum) ?? null;
}

/** บรรทัดของคนหนึ่งในยอดที่ปิดไว้ — สลิปที่เผยแพร่แล้วต้องอ่านตัวนี้ ไม่ใช่คำนวณใหม่ */
export function lineIn(p: Period | undefined, group: PayGroup, id: string) {
  return sumIn(p, group)?.lines.find((x) => x.id === id) ?? null;
}

/** เติมค่าที่ขาดให้รอบที่เก็บไว้ก่อนมีการปิดแยกกลุ่ม (ข้อมูลเก่าใน localStorage) */
export function fillPeriod(p: Period): Period {
  return {
    ...p,
    reopened: p.reopened ?? [],
    dayClosed: p.dayClosed ?? false,
    dayClosedAt: p.dayClosedAt ?? "",
    dayClosedBy: p.dayClosedBy ?? "",
    dayReopened: p.dayReopened ?? [],
    sum: p.sum ?? null,
    daySum: p.daySum ?? null,
  };
}

/*
 * รอบเดือนให้เลือกตั้งแต่ ม.ค. 2569 ถึงรอบปัจจุบัน (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * รอบก่อน ก.ค. 2569 เป็นประวัติที่ปิดไปแล้ว ไม่มีข้อมูลเวลาพิเศษ (แบบเดียวกับ ก.ค.)
 * ส่วนรอบที่ยังไม่มีในข้อมูลที่เก็บไว้ สโตร์เติมให้เองด้วย ensurePeriods
 */
export const HR_FIRST_MONTH = "2026-01";
/** รอบแรกที่มีข้อมูลจริง — รอบก่อนหน้านี้ที่เติมให้ถือว่าปิดไปแล้ว */
const HR_LIVE_MONTH = "2026-07";

/** รอบเก่าก่อน ก.ค. 2569 ที่ปิดครบทุกขั้นแล้ว (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export const HR_PAST_MONTHS = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

/**
 * วันที่ของแต่ละขั้นในรอบเก่า ตามแบบรอบ ก.ค. (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ปิดรอบเวลา ~28 → ปิดรอบเงินเดือนวันถัดไป → สร้างสลิป → เผยแพร่ภายในสิ้นเดือน
 * (approved = วันที่ CEO อนุมัติของรอบเก่า เก็บไว้เป็นประวัติ · เลิกขั้นนี้แล้ว ผู้ใช้สั่ง 13 ต.ค. 2569)
 * เดือนสั้น (ก.พ.) เลื่อนให้ทุกขั้นยังอยู่ในเดือนเดียวกัน
 */
export function pastStepDates(month: string) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  const base = Math.min(28, last - 2);
  const at = (d: number) => `${month}-${pad2(Math.min(d, last))}`;
  return {
    timeClosed: at(base),
    approved: at(base + 1),
    payClosed: at(base + 1),
    made: at(base + 2),
    published: at(base + 3),
  };
}

/** รอบเงินเดือนเก่าที่ปิดแล้วทั้งสองกลุ่ม — ไม่มียอดบันทึกไว้ (แบบเดียวกับ ก.ค.) หน้าจอคิดจากประวัติเงินเดือน */
export function pastPayrun(month: string): Period {
  const at = pastStepDates(month).payClosed;
  return {
    month, closed: true, closedAt: at, closedBy: "E12", reopened: [],
    dayClosed: true, dayClosedAt: at, dayClosedBy: "E12", dayReopened: [], sum: null, daySum: null,
  };
}

/** รอบเก่าที่ปิดไปแล้ว ไม่มีข้อมูลพิเศษ — ปิดรอบเวลาวันที่ ~28 ตามแบบรอบ ก.ค. */
function pastPeriod(month: string): Period {
  const at = pastStepDates(month).timeClosed;
  return {
    month, closed: true, closedAt: at, closedBy: "E12", reopened: [],
    dayClosed: true, dayClosedAt: at, dayClosedBy: "E12", dayReopened: [], sum: null, daySum: null,
  };
}

function openPeriod(month: string): Period {
  return {
    month, closed: false, closedAt: "", closedBy: "", reopened: [],
    dayClosed: false, dayClosedAt: "", dayClosedBy: "", dayReopened: [], sum: null, daySum: null,
  };
}

/** รอบเดือนที่วันหนึ่งตกอยู่ — ตัดรอบวันที่ 25: "2026-10-06" → "2026-10", "2026-10-26" → "2026-11" */
export function cycleMonthOfDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const next = d > hrCutDay();
  const mo = next ? (m === 12 ? 1 : m + 1) : m;
  const yr = next && m === 12 ? y + 1 : y;
  return `${yr}-${pad2(mo)}`;
}

/** ทุกเดือนตั้งแต่ first ถึง last (รวมทั้งสองฝั่ง) เป็น "yyyy-mm" */
export function monthsBetween(first: string, last: string) {
  const out: string[] = [];
  let [y, m] = first.split("-").map(Number);
  while (`${y}-${pad2(m)}` <= last) {
    out.push(`${y}-${pad2(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * เติมรอบที่ขาด ตั้งแต่ ม.ค. 2569 ถึงรอบของวันนี้ (ผู้ใช้สั่ง 6 ต.ค. 2569) — เดินตามวันจริง เดือนใหม่มาก็เพิ่มเอง
 * รอบที่มีอยู่แล้วไม่ถูกแตะ · รอบก่อน ก.ค. 2569 ที่เติมถือว่าปิดแล้ว · ตั้งแต่ ก.ค. เป็นต้นไปเติมเป็นรอบเปิด
 * เรียงตามเดือนเสมอ เพราะหลายหน้าถือว่าตัวท้ายคือรอบล่าสุด
 */
export function ensurePeriods(list: Period[], today: string): Period[] {
  const have = new Set(list.map((p) => p.month));
  const add = monthsBetween(HR_FIRST_MONTH, cycleMonthOfDay(today))
    .filter((m) => !have.has(m))
    .map((m) => (m < HR_LIVE_MONTH ? pastPeriod(m) : openPeriod(m)));
  const sorted = list.every((p, i) => i === 0 || list[i - 1].month <= p.month);
  if (!add.length && sorted) return list;
  return [...list, ...add].sort((a, b) => a.month.localeCompare(b.month));
}

/**
 * เดือนที่เปิดมาเป็นค่าตั้งต้น — รอบล่าสุดที่จบไปแล้ว (วันตัดรอบผ่านไปแล้ว) ซึ่งเป็นรอบที่ฝ่ายบุคคลกำลังปิด
 * รอบปัจจุบันที่ยังเดินอยู่ไม่ใช่ค่าตั้งต้น ยังเลือกดูได้จากตัวเลื่อนเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569)
 */
export function defaultHrMonth(months: string[], today: string) {
  const ended = months.filter((m) => hrCycle(m).to < today);
  return ended[ended.length - 1] ?? months[months.length - 1];
}

export const HR_PERIOD: Period[] = [
  ...HR_PAST_MONTHS.map(pastPeriod),
  {month:"2026-07", closed:true,  closedAt:"2026-07-28", closedBy:"E12", reopened:[],
   dayClosed:true, dayClosedAt:"2026-07-28", dayClosedBy:"E12", dayReopened:[], sum:null, daySum:null},
  /* ปิดรอบเวลาแล้ว ปิดรอบเงินเดือนได้เลย (ลำดับ ปิดรอบเวลา → คำนวณและปิดรอบเงินเดือน → ออกสลิป · ไม่มีขั้น CEO ผู้ใช้สั่ง 13 ต.ค. 2569)
     รายการผิดปกติของรอบนี้ HR ตรวจและบันทึกผลครบทุกรายการก่อนปิด */
  {month:"2026-08", closed:true, closedAt:"2026-08-27", closedBy:"E12", reopened:[],
   dayClosed:true, dayClosedAt:"2026-08-27", dayClosedBy:"E12", dayReopened:[], sum:null, daySum:null},
  {month:"2026-09", closed:false, closedAt:"", closedBy:"", reopened:[],
   dayClosed:false, dayClosedAt:"", dayClosedBy:"", dayReopened:[], sum:null, daySum:null},
  openPeriod("2026-10"),
];

export type LeaveKind = "personal" | "vacation" | "sick";

export const HR_LEAVE_LABEL: Record<LeaveKind, string> = {
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
  sick: "ลาป่วย",
};

export type OtKind = "after_work" | "holiday" | "public";

export const HR_OT_LABEL: Record<OtKind, string> = {
  after_work: "วันธรรมดา",
  /* นักขัตฤกษ์อื่นคิดอัตราเดียวกับเสาร์อาทิตย์ · public = วันแรงงานเท่านั้น (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  holiday: "วันหยุดเสาร์อาทิตย์/นักขัตฤกษ์",
  public: "วันแรงงาน",
};

/**
 * ประเภทโอทีที่ใช้คิดเงิน — ระบบเลือกอัตราจากวันที่เอง ผู้ยื่นไม่ต้องเลือก กันกรอกผิดอัตรา (ต้นแบบ otKindOf)
 * วันแรงงาน (1 พ.ค.) 3 เท่า · เสาร์อาทิตย์และนักขัตฤกษ์อื่น 2 เท่า · วันทำงาน 1.5 เท่า (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * วันทำงานธรรมดาใช้ประเภทที่บันทึกไว้ ยกเว้นบันทึกว่าวันแรงงานแต่ปฏิทินไม่ใช่ → ลดเป็นวันหยุด (ตามต้นแบบ)
 */
export function otKindAt(o: { d: string; kind: OtKind }): OtKind {
  const k = otKindOf(o.d);
  if (k !== "weekday") return k;
  return o.kind === "public" ? "holiday" : o.kind;
}

/** รายการที่เครื่องบันทึกเวลาให้มาไม่ครบ ต้องให้ HR ตามจนได้คำตอบก่อนปิดรอบ */
export type IssueKind = "norecord" | "nopair";

export const HR_ISSUE_LABEL: Record<IssueKind, string> = {
  norecord: "ไม่มีการลงเวลาและไม่มีใบลา",
  nopair: "ลงเวลาเข้าแต่ไม่มีลงเวลาออก",
};

/* was = ค่าก่อนที่ HR แก้ เก็บไว้ให้เห็นว่าตัวเลขถูกแตะ ไม่ใช่ลบของเดิมทิ้ง
   no  = เลขที่ใบที่ทำให้เกิดแถวนี้ (LV-/OT-) — ใบเดียวกันมาถึงได้สองทาง
         (สโตร์ของบทบาท และคิวคำขอรายรหัส) ต้องนับครั้งเดียว จึงต้องเทียบเลขที่ก่อน
         ข้อมูลตั้งต้นของฝ่ายบุคคลไม่มีเลขที่ จึงเป็นช่องที่ว่างได้ */
export type LateRow = { d: string; min: number; was?: number };
/* half = ลาครึ่งวันช่วงไหน (am เช้า · pm บ่าย) ไม่มีค่า = ไม่รู้ช่วง — ใช้ตรวจลาแล้วแต่มีเช็คอิน (ผู้ใช้สั่ง 15 ต.ค. 2569) */
/* h = ชั่วโมงที่ลาจริงของวันที่ลาไม่เต็มวัน (span "half" = ไม่เต็มวัน รวมลารายชั่วโมง) (ผู้ใช้สั่ง 19 ต.ค. 2569)
   แถวเก่าไม่มี h คิดจากช่วงเช้า/บ่ายตามเวลาทำงาน (เช้า 09–12 = 3 ชม.) ไม่รู้ช่วงคิด 4 ชม. */
export type LeaveRow = { d: string; type: LeaveKind; span: "full" | "half"; half?: "am" | "pm"; no?: string; h?: number };

/** ชั่วโมงลาของแถวหนึ่ง — เต็มวัน = 8 ชม. (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function leaveRowHours(x: LeaveRow, sch?: DaySchedule) {
  if (x.span !== "half") return LEAVE_DAY_HOURS;
  if (x.h != null) return x.h;
  if (x.half) return halfHours(x.half === "am" ? "morning" : "afternoon", sch);
  return LEAVE_DAY_HOURS / 2;
}

/** วันลาของแถวหนึ่ง (หน่วยวัน = ชั่วโมง ÷ 8) */
export function leaveRowDays(x: LeaveRow, sch?: DaySchedule) {
  return leaveRowHours(x, sch) / LEAVE_DAY_HOURS;
}
/*
 * HR ยืนยันวันที่ลาแล้วแต่มีเช็คอิน (ผู้ใช้สั่ง 15 ต.ค. 2569) — คีย์ "รหัสพนักงาน|วันที่"
 * by = ผู้ยืนยัน · at = เวลาที่ยืนยัน · note = หมายเหตุ (ว่างได้) เช่น มาทำงานจริง ยกเลิกใบลาภายหลัง
 * ยืนยันแล้วไม่ฟ้องแดงและไม่นับเป็นรายการที่ต้องตรวจ
 */
export type ClashOk = { by: string; at: string; note: string };
export type OtRow = { d: string; h: number; kind: OtKind; was?: number; no?: string };
/* in / out = เวลาเข้า-ออกงานที่ฝ่ายบุคคลแก้ให้ (พนักงานลืมกด) · note = ข้อความสรุปที่บันทึกไว้ มีค่าเมื่อเคลียร์แล้ว */
export type IssueRow = { d: string; kind: IssueKind; note: string; in?: string; out?: string };

export type TimeRec = {
  late: LateRow[];
  leave: LeaveRow[];
  ot: OtRow[];
  issues: IssueRow[];
  /** เวลาเข้า-ออกงานที่ฝ่ายบุคคลแก้ให้ รายวัน (ผู้ใช้สั่ง 6 ต.ค. 2569) — ไม่มี = ตามที่ลงเวลาไว้ */
  fix?: DayFix[];
};

export type DayFix = { d: string; in: string; out: string };

/*
 * เวลาทำงานเก็บเป็นรายคน กรองตามช่วงวันของรอบ
 * ถ้าเก็บเป็นรายเดือนปฏิทินแทน วันที่ 26–31 จะตกรอบไปทั้งหมด
 *
 * E16 พ้นสภาพ 31 พ.ค. 2569 จึงไม่มีข้อมูล ระบบต้องไม่พังเมื่อไม่มีคีย์
 */
const HR_TIME_BASE: Record<string, TimeRec> = {
  E01:{late:[{d:"2026-08-05",min:18}], leave:[],
       ot:[{d:"2026-07-16",h:4,kind:"after_work"},{d:"2026-08-18",h:3,kind:"after_work"}], issues:[]},
  E02:{late:[{d:"2026-07-07",min:15},{d:"2026-08-04",min:25},{d:"2026-08-20",min:12}],
       leave:[{d:"2026-08-24",type:"vacation",span:"full"},{d:"2026-08-25",type:"vacation",span:"full"}],
       ot:[], issues:[]},
  E03:{late:[], leave:[{d:"2026-07-20",type:"personal",span:"full"},{d:"2026-08-07",type:"sick",span:"full"}],
       ot:[{d:"2026-07-09",h:2,kind:"after_work"},{d:"2026-08-13",h:2.5,kind:"after_work"}],
       issues:[{d:"2026-08-19",kind:"nopair",note:"Human Resources ตรวจแล้ว ลืมกดออก หัวหน้ายืนยันว่าอยู่ทำงานถึง 18:00"}]},
  E04:{late:[{d:"2026-08-11",min:9}], leave:[],
       ot:[{d:"2026-07-11",h:7,kind:"holiday"},{d:"2026-07-23",h:3,kind:"after_work"},{d:"2026-07-28",h:5,kind:"public"},
           {d:"2026-08-15",h:8,kind:"holiday"},{d:"2026-08-26",h:2,kind:"after_work"}],
       issues:[]},
  E05:{late:[{d:"2026-07-02",min:10}], leave:[{d:"2026-08-21",type:"personal",span:"half",half:"pm"}],
       ot:[], issues:[]},
  E06:{late:[{d:"2026-08-06",min:31}], leave:[{d:"2026-07-27",type:"sick",span:"full"}],
       ot:[{d:"2026-07-14",h:2.5,kind:"after_work"},{d:"2026-08-29",h:6,kind:"holiday"}],
       issues:[{d:"2026-08-27",kind:"norecord",note:""}]},
  E07:{late:[], leave:[], ot:[{d:"2026-08-20",h:2,kind:"after_work"}], issues:[]},
  E08:{late:[{d:"2026-08-03",min:14}], leave:[{d:"2026-08-10",type:"sick",span:"full"}],
       ot:[{d:"2026-07-21",h:1.5,kind:"after_work"}], issues:[]},
  E09:{late:[], leave:[],
       ot:[{d:"2026-07-08",h:3,kind:"after_work"},{d:"2026-08-14",h:3,kind:"after_work"}], issues:[]},
  E10:{late:[{d:"2026-08-17",min:7}], leave:[{d:"2026-08-31",type:"personal",span:"full"}],
       ot:[{d:"2026-07-15",h:2,kind:"after_work"}],
       issues:[{d:"2026-08-05",kind:"nopair",note:"ลืมกดออก ยืนยันกับหัวหน้าแล้วว่าอยู่ถึง 18:00"}]},
  E11:{late:[], leave:[], ot:[], issues:[]},
  E12:{late:[], leave:[{d:"2026-08-28",type:"personal",span:"full"}], ot:[], issues:[]},
  E13:{late:[{d:"2026-07-06",min:8},{d:"2026-08-18",min:20}], leave:[], ot:[], issues:[]},
  E14:{late:[{d:"2026-08-06",min:11},{d:"2026-08-13",min:16}], leave:[], ot:[], issues:[]},
  E15:{late:[], leave:[], ot:[], issues:[]},
  E17:{late:[{d:"2026-08-12",min:0}], leave:[],
       ot:[], issues:[{d:"2026-08-20",kind:"norecord",note:"Human Resources ตรวจแล้ว ลืมตอกบัตร หัวหน้ายืนยันว่ามาทำงาน"}]}
};
/*
 * ตัวอย่างเวลาทำงานรอบ ต.ค. 2569 (26 ก.ย. – 25 ต.ค.) ของทีมงานที่ยังไม่มีบัญชีเข้าระบบ (เจ้าของสั่ง 8 ต.ค. 2569)
 * หน้าสรุปเวลาทำงานรอบปัจจุบันจะได้มีมาสาย โอที และรายการที่ต้องตรวจให้ดู
 * คนที่ผูกบทบาทไว้ (ROLE_EMPLOYEE) อ่านใบลา/โอทีจากใบจริง จึงไม่ใส่ตรงนี้
 * เครื่องที่เก็บข้อมูลไว้แล้วได้แถวเหล่านี้ผ่าน addTimeSample (เติมเฉพาะวันที่ที่ยังไม่มีแถว)
 */
const HR_TIME_OCT_2569: Record<string, Partial<TimeRec>> = {
  E02: { late: [{ d: "2026-09-29", min: 12 }, { d: "2026-10-06", min: 22 }] },
  E03: { ot: [{ d: "2026-10-01", h: 2, kind: "after_work" }], issues: [{ d: "2026-10-02", kind: "nopair", note: "" }] },
  E04: { late: [{ d: "2026-10-05", min: 8 }], ot: [{ d: "2026-09-26", h: 6, kind: "holiday" }] },
  E06: { late: [{ d: "2026-10-01", min: 35 }], issues: [{ d: "2026-10-05", kind: "norecord", note: "" }] },
  E07: { ot: [{ d: "2026-09-30", h: 2, kind: "after_work" }] },
  E08: { late: [{ d: "2026-09-28", min: 5 }], leave: [{ d: "2026-10-07", type: "personal", span: "half", half: "am" }] },
  E13: { late: [{ d: "2026-10-01", min: 18 }] },
  E17: {
    late: [{ d: "2026-10-07", min: 10 }],
    issues: [{ d: "2026-09-30", kind: "nopair", note: "Human Resources ตรวจแล้ว ลืมกดออก หัวหน้ายืนยันว่าอยู่ทำงานถึง 18:00" }],
  },
};

/** เติมแถวตัวอย่างรอบ ต.ค. 2569 — วันที่ที่มีแถวอยู่แล้วในรายการชนิดเดียวกันไม่ถูกแตะ */
export function addTimeSample(time: Record<string, TimeRec>): Record<string, TimeRec> {
  let out = time;
  for (const [id, add] of Object.entries(HR_TIME_OCT_2569)) {
    const cur = out[id] ?? { late: [], leave: [], ot: [], issues: [] };
    const merge = <R extends { d: string }>(have: R[], extra: R[] = []) => {
      const days = new Set(have.map((x) => x.d));
      const miss = extra.filter((x) => !days.has(x.d));
      return miss.length ? [...have, ...miss] : have;
    };
    const next: TimeRec = {
      ...cur,
      late: merge(cur.late, add.late),
      leave: merge(cur.leave, add.leave),
      ot: merge(cur.ot, add.ot),
      issues: merge(cur.issues, add.issues),
    };
    if (next.late !== cur.late || next.leave !== cur.leave || next.ot !== cur.ot || next.issues !== cur.issues)
      out = { ...out, [id]: next };
  }
  return out;
}

export const HR_TIME: Record<string, TimeRec> = addTimeSample(HR_TIME_BASE);

/*
 * ลาครึ่งวันของข้อมูลตั้งต้นเดิมไม่มีช่วงเช้า/บ่าย (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * ข้อมูลที่เครื่องเก็บไว้แล้วเติมช่วงให้เฉพาะแถวที่ตรงกับข้อมูลตั้งต้น (วันที่ ชนิดลา ไม่มีเลขที่ใบ)
 * แถวที่ผู้ใช้สร้างเองแล้วไม่มีช่วง ปล่อยไว้ — หน้าจอแสดง "ครึ่งวัน" ตามเดิม
 */
export function fillSeedLeaveHalf(time: Record<string, TimeRec>): Record<string, TimeRec> {
  let out = time;
  for (const [id, seed] of Object.entries(HR_TIME)) {
    const cur = out[id];
    if (!cur?.leave?.length) continue;
    let hit = false;
    const leave = cur.leave.map((x) => {
      if (x.span !== "half" || x.half || x.no) return x;
      const m = seed.leave.find((y) => y.d === x.d && y.type === x.type && y.span === "half" && y.half && !y.no);
      if (!m) return x;
      hit = true;
      return { ...x, half: m.half };
    });
    if (hit) out = { ...out, [id]: { ...cur, leave } };
  }
  return out;
}


/*
 * ฐานการคำนวณเงินเดือน
 *
 * BR-01 ค่าล่วงเวลา = (เงินเดือน / 30 / 8) x 1.5 วันธรรมดา และ x 2 วันหยุด
 * BR-04 ประกันสังคม 5% ของเงินเดือนฐาน ไม่รวมค่าล่วงเวลาและไม่เกินเพดานของปีนั้น
 * BR-06 อัตราและเพดานอยู่ในตารางตั้งค่า ไม่ hard code ทีละที่
 * BR-07 ต้องปิดรอบเวลาทำงานก่อนถึงคำนวณเงินเดือนได้
 *
 * TODO: ⚠️ มาสายและขาดงานมีผลต่อการหักเงินหรือไม่ ยังไม่มีคำตอบ จึงยังไม่หักในหน้านี้
 * TODO: ⚠️ Commission คิดจากยอดที่ปิดการขายได้ หรือยอดที่ลูกค้าชำระแล้ว ยังไม่มีคำตอบ
 * TODO: ⚠️ ภาษีหัก ณ ที่จ่ายของพนักงาน ทำในระบบหรือให้สำนักงานบัญชีทำ ยังไม่มีคำตอบ
 */
/*
 * อัตราโอที (เท่าของค่าจ้างรายชั่วโมง) — ผู้ดูแลระบบตั้งได้ที่ /admin/rates
 * ส่งวันที่มาด้วย = ใช้อัตราที่มีผล ณ วันนั้น (ค่าใหม่มีวันเริ่มใช้ · Full Proposal M5)
 * ไม่ส่ง = อัตราที่ใช้อยู่วันนี้
 */
export const hrOtRate = (on?: string): Record<OtKind, number> => {
  const r = on ? ratesOn(on) : settings().rates;
  return { after_work: r.otAfterWork, holiday: r.otHoliday, public: r.otPublic };
};
/* ชั่วโมงต่อวันคิดจากเวลาทำงานที่ผู้ดูแลระบบตั้ง (หักพักกลางวันแล้ว) — ปรับกะแล้วค่าจ้างรายชั่วโมงตามเอง */
export const HR_OT_DIVISOR = {
  days: 30,
  get hours() {
    const min = minutesOfDay(WORK_SCHEDULE.end) - minutesOfDay(WORK_SCHEDULE.start) - WORK_SCHEDULE.breakMinutes;
    return min > 0 ? min / 60 : 8;
  },
};
/** ประกันสังคม (สัดส่วน เช่น 0.05) — ผู้ดูแลระบบตั้งเป็นเปอร์เซ็นต์ที่ /admin/rates */
export const hrSsRate = (on?: string) => (on ? ratesOn(on) : settings().rates).socialSecurity / 100;

/** เพดานประกันสังคมเปลี่ยนตามปี — เก็บเป็นช่วงปีที่มีผล ไม่ใช่ค่าเดียว */
/** ค่าตั้งต้นของเพดานประกันสังคม — ค่าที่ใช้จริงอ่านผ่าน ssCeilings() (ตั้งได้ที่ /admin/rates) */
export const HR_SS_CEILING: { from: number; to: number; ceiling: number; max: number }[] =
  [
  {from:2569, to:2571, ceiling:17500, max:875},
  {from:2572, to:2574, ceiling:20000, max:1000},
  {from:2575, to:9999, ceiling:23000, max:1150}
];

/**
 * อัตราค่าคอมมิชชั่นตามตำแหน่ง (ERD commission_rate, HR-BR-08) — ตำแหน่งที่ไม่อยู่ในนี้ไม่ได้รับ
 * ฝ่ายขายอ่านจากอัตราที่ผู้ดูแลระบบตั้ง (/admin/rates ค่าตั้งต้น 5%) · PM 2.5% ของยอดที่ลูกค้าจ่าย
 */
export const hrCommission = (on?: string): Partial<Record<PosKey, number>> => ({
  sales: (on ? ratesOn(on) : settings().rates).commission / 100,
  pm: 0.025,
});

/*
 * BR-09 ฐานคิดค่าคอมมิชชั่น (ต้นแบบ hr-payroll.html) — อ่านจากงานจริงของฝ่ายอื่น ไม่กรอกตัวเลขเอง
 *   Sales = มูลค่าดีลที่ปิดการขายได้ในรอบนั้น ดีลที่ยกเลิกไม่นับ
 *   PM         = ยอดที่ลูกค้าจ่ายจริงในรอบนั้น (ใบเสร็จ) ของโปรเจคที่ตนดูแล
 * hr-link.ts เป็นคนรวบรวมจากสโตร์ขาย บัญชี และ PM แล้วส่งเข้ามา — ไฟล์นี้ไม่อ่านสโตร์ของฝ่ายอื่นเอง
 * ผู้ขายของดีลคือ Deal.seller (บันทึกตอนปิดการขาย) หรือผู้ดูแลลูกค้าสำหรับดีลเก่า — ชื่อที่ไม่อยู่ในทะเบียนไม่นับให้ใคร
 */
export type ComSource = {
  sales: { emp: string; date: string; total: number }[];
  paid: { emp: string; date: string; total: number }[];
  /**
   * ใบเบิกค่าใช้จ่ายที่อนุมัติแล้ว (วันที่อนุมัติ) — จ่ายคืนพร้อมเงินเดือนเป็นบรรทัด "ค่าใช้จ่ายคืน"
   * อนุมัติภายในวันตัดรอบ (25) เข้างวดนั้น หลังจากนั้นเข้างวดถัดไป = วันที่อนุมัติตกอยู่ในช่วงวันของรอบไหน
   */
  /* no/label = เลขที่ใบเบิกและชื่อรายการ ใช้แสดงในหัวข้อ "ค่าใช้จ่ายคืน" ของหน้าคำนวณเงินเดือน (ต้นแบบ) */
  /* key = กุญแจใบเบิกของบทบาท (เดือน + ประเภท) ใช้บันทึกว่าจ่ายแล้วทีละใบ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  reimb?: { emp: string; date: string; total: number; paidIn?: string; role?: Role; claim?: string; key?: string; no?: string; label?: string }[];
};

/**
 * ใบเบิกที่จ่ายคืนในรอบนี้ของคนหนึ่ง
 * จ่ายแล้ว (paidIn) = นับเฉพาะรอบที่จ่าย · ยังไม่จ่าย = นับในรอบที่ยังไม่ปิดรอบแรกที่วันอนุมัติไม่เกินวันตัดรอบ
 * ใบที่อนุมัติหลังวันตัดรอบจึงเข้างวดถัดไป และใบที่ค้างจ่ายไม่หล่นหาย (ERD HR-BR-18)
 */
export function reimbItems(e: Employee, c: Cycle, src?: ComSource) {
  const month = monthKeyOf(c);
  return (src?.reimb ?? []).filter(
    /* รอบรายวันของทดลองงานบันทึก paidIn เป็นคีย์ "จาก~ถึง" (ผู้ใช้สั่ง 6 ต.ค. 2569) */
    (x) =>
      x.emp === e.id &&
      (x.paidIn ? x.paidIn === month || x.paidIn === `${c.from}~${c.to}` : x.date <= c.to),
  );
}

export function reimbIn(e: Employee, c: Cycle, src?: ComSource) {
  return reimbItems(e, c, src).reduce((a, x) => a + x.total, 0);
}

/** ที่มาของยอดตามตำแหน่ง — แสดงในรายละเอียดการคำนวณ */
export const COMMISSION_SOURCE: Partial<Record<PosKey, string>> = {
  sales: "ดีลที่ปิดการขายได้ในรอบนี้",
  pm: "ยอดที่ลูกค้าจ่ายจริงในรอบนี้ ของโปรเจคที่ดูแล",
};

export function commissionBase(e: Employee, c: Cycle, src?: ComSource) {
  if (!src) return 0;
  const list = e.pos === "sales" ? src.sales : e.pos === "pm" ? src.paid : [];
  return list
    .filter((x) => x.emp === e.id && x.date >= c.from && x.date <= c.to)
    .reduce((a, x) => a + x.total, 0);
}

/** รายการปรับปรุงด้วยมือ — ต้องมีเหตุผลกำกับทุกครั้ง (BR-03) */
export type Adjust = { amt: number; why: string };

/*
 * ─── รายการเงินได้/รายการหักที่กรอกเองตามแบบสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569) ───
 * แทน Incentive + ค่าตำแหน่ง + "รายการปรับปรุงด้วยมือ" แบบพิมพ์เหตุผลเอง
 * สลิปลงบรรทัดตามคีย์ตรง ๆ ไม่ต้องเดาจากชื่อ · ว่าง = 0
 * มาสาย ประกันสังคม ค่าล่วงเวลา ภาษีหัก ณ ที่จ่าย ยังคิดจากสูตรเหมือนเดิม
 */
export type PayItemKey =
  | "position" | "fuel" | "living" | "phone" | "food" | "diligence" | "commission" | "incentive" | "otherInc" | "guaranteeBack"
  | "absent" | "sick" | "personal" | "otherCut" | "welfare" | "advance" | "otherPay" | "guarantee" | "studentLoan";

export const PAY_INCOME_ITEMS: { k: PayItemKey; label: string }[] = [
  { k: "position", label: "ค่าตำแหน่ง" },
  { k: "fuel", label: "ค่าน้ำมัน" },
  { k: "living", label: "ค่าครองชีพ" },
  { k: "phone", label: "ค่าโทรศัพท์" },
  { k: "food", label: "ค่าอาหาร" },
  { k: "diligence", label: "เบี้ยขยัน" },
  { k: "commission", label: "ค่า commission" },
  { k: "incentive", label: "ค่า Incentive" },
  /* รายได้ที่ไม่ตรงบรรทัดใด (ย้ายมาจากรายการปรับปรุงเก่า) — ต่อท้าย ค่า Incentive บนสลิป */
  { k: "otherInc", label: "รายได้อื่นๆ" },
  /* HR ตัดสินเองว่าใครได้คืนเท่าไหร่ ระบบหักออกจากยอดสะสมให้ (ผู้ใช้สั่ง 30 ต.ค. 2569) */
  { k: "guaranteeBack", label: "คืนเงินประกันผลงาน" },
];

export const PAY_CUT_ITEMS: { k: PayItemKey; label: string }[] = [
  { k: "absent", label: "หัก ขาดงาน" },
  { k: "sick", label: "หัก ลาป่วย" },
  { k: "personal", label: "หัก ลากิจ" },
  { k: "otherCut", label: "หัก อื่นๆ" },
  { k: "welfare", label: "หัก สวัสดิการ" },
  { k: "advance", label: "หัก เบิกล่วงหน้า" },
  { k: "otherPay", label: "หัก จ่ายอื่นๆ" },
  { k: "guarantee", label: "หัก ประกันผลงาน" },
  { k: "studentLoan", label: "หัก กยศ" },
];

export type PayItems = Partial<Record<PayItemKey, number>>;

export type Extra = { items: PayItems };

/** อัตราภาษีหัก ณ ที่จ่ายของค่าจ้างทดลองงานรายวัน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
export const DAILY_WHT_RATE = 0.03;

/** รวมยอดของรายการชุดหนึ่ง (รายได้หรือรายการหัก) */
export function itemSum(items: PayItems, list: { k: PayItemKey }[]) {
  return round2(list.reduce((a, x) => a + (items[x.k] ?? 0), 0));
}

/* รายการปรับปรุงเก่า → คีย์ที่ชื่อตรง (ย้ายข้อมูลครั้งเดียว ไม่ใช้กับข้อมูลใหม่) */
const LEGACY_INCOME: [RegExp, PayItemKey][] = [
  [/ตำแหน่ง/, "position"],
  [/น้ำมัน/, "fuel"],
  [/ครองชีพ/, "living"],
  [/โทรศัพท์|มือถือ/, "phone"],
  [/อาหาร/, "food"],
  [/ขยัน/, "diligence"],
  [/คอม|commission/i, "commission"],
  [/incentive|อินเซน/i, "incentive"],
];
const LEGACY_CUT: [RegExp, PayItemKey][] = [
  [/ขาดงาน/, "absent"],
  [/ลาป่วย/, "sick"],
  [/ลากิจ/, "personal"],
  [/สวัสดิการ/, "welfare"],
  [/เบิกล่วงหน้า|เบิกเงินล่วงหน้า|advance/i, "advance"],
  [/ประกันผลงาน/, "guarantee"],
  [/กยศ|กองทุนเงินให้กู้ยืม/, "studentLoan"],
];

/**
 * ค่าตอบแทนรุ่นเก่า {incentive, allowance, adjust} → รายการตามแบบสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * ค่าตำแหน่ง/Incentive ลงช่องเดิม · ปรับปรุงที่ชื่อตรงลงช่องนั้น · ไม่ตรง: บวก → รายได้อื่นๆ ลบ → หัก อื่นๆ
 * รอบเก่าที่มีแต่ยอดรวม (adj) ไม่มีรายการ ลงช่องอื่นๆ ตามเครื่องหมาย
 */
export function itemsOfLegacy(x: { incentive?: number; allowance?: number; adjust?: Adjust[]; adj?: number }): PayItems {
  const out: PayItems = {};
  const add = (k: PayItemKey, v: number) => {
    if (v) out[k] = round2((out[k] ?? 0) + v);
  };
  add("incentive", x.incentive ?? 0);
  add("position", x.allowance ?? 0);
  const list = x.adjust ?? [];
  for (const a of list) {
    if (!a.amt) continue;
    if (a.amt > 0) add(LEGACY_INCOME.find(([re]) => re.test(a.why))?.[1] ?? "otherInc", a.amt);
    else add(LEGACY_CUT.find(([re]) => re.test(a.why))?.[1] ?? "otherCut", -a.amt);
  }
  if (!list.length && x.adj) add(x.adj > 0 ? "otherInc" : "otherCut", Math.abs(x.adj));
  return out;
}

/** ข้อมูลที่เก็บไว้ทุกรุ่น → รูปแบบปัจจุบัน — รุ่นใหม่ (มี items) ผ่านไปเลย ทิ้งค่าที่ไม่ใช่ตัวเลข */
export function normalizeExtra(raw: unknown): Extra {
  const o = (raw ?? {}) as { items?: unknown; incentive?: number; allowance?: number; adjust?: Adjust[] };
  if (o.items && typeof o.items === "object") {
    const items: PayItems = {};
    for (const [k, v] of Object.entries(o.items as Record<string, unknown>))
      /* หัก กยศ./ประกันผลงาน: 0 = HR สั่งเว้นรอบนี้ ไม่ใช่ว่าง จึงต้องเก็บไว้ (ผู้ใช้สั่ง 30 ต.ค. 2569) */
      if (typeof v === "number" && Number.isFinite(v) && (v || k === "guarantee" || k === "studentLoan")) items[k as PayItemKey] = v;
    return { items };
  }
  return { items: itemsOfLegacy(o) };
}

/*
 * ค่าที่ไม่มีสูตร — CEO เป็นผู้พิจารณา HR กรอกตาม (รูปแบบรายการตามแบบสลิป ผู้ใช้สั่ง 16 ต.ค. 2569)
 */
export const HR_EXTRA: Record<string, Record<string, Extra>> = {
  "2026-07": {
    E11:{items:{incentive:8000, position:5000}},
    E10:{items:{incentive:4000, position:3000}},
    E12:{items:{incentive:2000, position:2000}},
    E01:{items:{position:1500}},
    E04:{items:{incentive:3000}}
  },
  "2026-08": {
    E11:{items:{incentive:8000, position:5000}},
    E10:{items:{incentive:5000, position:3000}},
    E12:{items:{incentive:2000, position:2000}}
  }
};

/* รอบ ม.ค.–มิ.ย. 2569 ปิดรอบเงินเดือนแล้วแบบเดียวกับ ก.ค. (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export const HR_PAYRUN: Period[] = [
  ...HR_PAST_MONTHS.map(pastPayrun),
  {month:"2026-07", closed:true, closedAt:"2026-07-29", closedBy:"E12", reopened:[],
   dayClosed:true, dayClosedAt:"2026-07-29", dayClosedBy:"E12", dayReopened:[], sum:null, daySum:null}
];

export type Slip = {
  month: string;
  published: boolean;
  madeAt: string;
  publishedAt: string;
  by: string;
  /** กลุ่มจ่ายรายวัน ออกสลิปและเผยแพร่แยกจากกลุ่มรายเดือน */
  dayMadeAt: string;
  dayPublished: boolean;
  dayPublishedAt: string;
  dayBy: string;
  dayUnpublished: Reopen[];
  /** นับครั้งที่พนักงานเปิดดูและดาวน์โหลด — บันทึกประวัติการเข้าถึง (BR-05) */
  views: Record<string, number>;
  downloads: Record<string, number>;
  unpublished: Reopen[];
};

/* รอบ ก.ค. 2569 ปิดและเผยแพร่ไว้แล้วตามต้นแบบ พนักงานจึงมีสลิปให้เปิดดูตั้งแต่แรก */
/* รอบ ม.ค.–มิ.ย. 2569 เผยแพร่สลิปแล้วแบบเดียวกับ ก.ค. (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export const HR_PAYSLIP: Slip[] = [
  ...HR_PAST_MONTHS.map(pastSlip),
  {month:"2026-07", published:true, madeAt:"2026-07-30", publishedAt:"2026-07-31", by:"E12",
   dayMadeAt:"2026-07-30", dayPublished:true, dayPublishedAt:"2026-07-31", dayBy:"E12",
   dayUnpublished:[], views:{}, downloads:{}, unpublished:[]}
];

/** สลิปของรอบเก่า — สร้างและเผยแพร่แล้วทั้งสองกลุ่ม (แบบเดียวกับ ก.ค.) (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export function pastSlip(month: string): Slip {
  const d = pastStepDates(month);
  return {
    month, published: true, madeAt: d.made, publishedAt: d.published, by: "E12",
    dayMadeAt: d.made, dayPublished: true, dayPublishedAt: d.published, dayBy: "E12",
    dayUnpublished: [], views: {}, downloads: {}, unpublished: [],
  };
}

/** เติมค่าที่ขาดให้สลิปที่เก็บไว้ก่อนแยกกลุ่ม (ข้อมูลเก่าใน localStorage) */
export function fillSlip(sp: Slip): Slip {
  return {
    ...sp,
    unpublished: sp.unpublished ?? [],
    dayMadeAt: sp.dayMadeAt ?? "",
    dayPublished: sp.dayPublished ?? false,
    dayPublishedAt: sp.dayPublishedAt ?? "",
    dayBy: sp.dayBy ?? "",
    dayUnpublished: sp.dayUnpublished ?? [],
  };
}

/*
 * ใบลาของนักศึกษาฝึกงาน — ฝ่ายบุคคลเป็นผู้อนุมัติเอง (ต้นแบบ hr-dashboard.html)
 * นักศึกษาฝึกงานไม่มีบัญชีเข้าระบบ ใบจึงอยู่ในสโตร์ของฝ่ายบุคคล ไม่ได้อยู่ในใบลาของบทบาทใด
 * TODO: ของจริงอยู่ที่ leave_request (approver_role = hr สำหรับพนักงานประเภทฝึกงาน)
 */
export type InternLeave = {
  id: string;
  emp: string;
  lt: LeaveKind;
  from: string;
  to: string;
  days: number;
  note: string;
  at: string;
  status: "pending" | "approved" | "rejected";
  by?: string;
  decidedAt?: string;
};

export const HR_INTERN_LEAVE: InternLeave[] = [
  {id:"LV-2569-0016", emp:"E14", lt:"personal", from:"2026-09-11", to:"2026-09-11", days:1,
   note:"ไปสอบที่มหาวิทยาลัย", at:"2026-09-08 09:15", status:"pending"},
  {id:"LV-2569-0017", emp:"E14", lt:"sick", from:"2026-09-02", to:"2026-09-02", days:1,
   note:"เป็นไข้", at:"2026-09-02 08:05", status:"approved", by:"E12", decidedAt:"2026-09-02 08:40"},
  /* ตัวอย่างรอบปัจจุบัน (เจ้าของสั่ง 8 ต.ค. 2569) — เติมเข้าเครื่องเดิมผ่าน hr-store (เฉพาะเลขที่ที่ยังไม่มี) */
  {id:"LV-2569-0066", emp:"E14", lt:"personal", from:"2026-10-15", to:"2026-10-15", days:1,
   note:"สอบกลางภาคที่มหาวิทยาลัย", at:"2026-10-06 10:30", status:"pending"},
];

/*
 * ⚠️ เลิกขั้น CEO อนุมัติยอดเงินเดือนแล้ว — ปิดรอบตอนคำนวณเงินเดือนแล้วออกสลิป/เผยแพร่ได้เลย (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ชนิดและข้อมูลด้านล่างเหลือไว้อ่านประวัติการอนุมัติของรอบเก่าเท่านั้น ไม่มีหน้าไหนใช้เป็นด่านแล้ว
 *
 * (เดิม) CEO อนุมัติยอดเงินเดือนก่อน ฝ่ายบุคคลจึงปิดรอบได้ (ต้นแบบ hr-payroll.html / ceo-approvals.html)
 * แยกตามรอบและกลุ่มการจ่าย — draft ยังไม่ส่ง · waiting รอ CEO · approved อนุมัติแล้ว · rejected ตีกลับ
 * ยอดที่ส่ง (คน / สุทธิ / ประกันสังคม) เก็บไว้ ณ ตอนส่ง CEO จะได้เห็นตัวเลขเดียวกับที่ฝ่ายบุคคลส่งมา
 * TODO: ของจริงอยู่ที่ payroll_approval (month, group, status, decided_by, decided_at, reason)
 */
export type PayApproval = {
  status: "draft" | "waiting" | "approved" | "rejected";
  people?: number;
  net?: number;
  /** ประกันสังคมส่วนลูกจ้าง — นำส่งจริงคือสองเท่า (รวมส่วนบริษัท) */
  ss?: number;
  sentBy?: string;
  sentAt?: string;
  by?: string;
  at?: string;
  reason?: string;
  /** ยอดรายคน ณ ตอนส่งล่าสุด (หรือตอน CEO อนุมัติ) — ไว้เทียบหาว่าอะไรเปลี่ยน (ผู้ใช้สั่ง 19 ต.ค. 2569) · รอบเก่าไม่มี */
  lines?: PaySnap;
  /** แก้ไขแล้วส่งใหม่ครั้งที่เท่าไร — ไม่มี/0 = ส่งครั้งแรก (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  ver?: number;
  /** ระบบส่งใหม่ให้เองเพราะ HR แก้ยอดหลังส่ง (ไม่ได้กดส่งเอง) */
  auto?: boolean;
  /** สถานะก่อนส่งใหม่ — "approved" = แก้หลัง CEO อนุมัติไปแล้ว */
  prev?: "waiting" | "approved" | "rejected" | "draft";
  /** ยอดสุทธิรวมของการส่งครั้งก่อน */
  prevNet?: number;
  /** สิ่งที่เปลี่ยนจากการส่งครั้งก่อน — รายคน ช่อง ก่อน → หลัง */
  changes?: PayChange[];
};

/*
 * ─── ยอดรายคน ณ ตอนส่ง และสิ่งที่เปลี่ยน (ผู้ใช้สั่ง 19 ต.ค. 2569) ───
 * แก้ยอดหลังส่ง CEO = ระบบส่งใหม่ให้เอง (แบบเดียวกับงานที่ PM ตรวจ) พร้อมรายการ "สิ่งที่เปลี่ยน"
 * เก็บแค่ตัวเลขรายช่องของแต่ละคน (คีย์ = รหัสพนักงาน · ช่อง = PAY_SNAP_FIELDS หรือ "i.<รายการ>")
 */
export type PaySnap = Record<string, Record<string, number>>;
export type PayChange = {
  emp: string;
  /** ชื่อ ณ ตอนส่ง — สำรองไว้เผื่อคนนั้นออกจากทะเบียนแล้ว (โชว์ผ่าน emp-name) */
  name: string;
  field: string;
  was: number;
  now: number;
  /** add = เพิ่งเข้ารอบ · drop = ออกจากรอบ */
  kind?: "add" | "drop";
};

const PAY_SNAP_FIELDS: { k: string; label: string; get: (x: CycleLine) => number }[] = [
  { k: "days", label: "วันทำงาน", get: (x) => x.days },
  { k: "base", label: "เงินเดือน/ค่าจ้าง", get: (x) => x.base },
  { k: "ot", label: "ค่าล่วงเวลา", get: (x) => x.ot },
  { k: "com", label: "ค่าคอมมิชชั่น (คำนวณ)", get: (x) => (x.com ?? 0) - (x.items?.commission ?? 0) },
  { k: "late", label: "หักมาสาย", get: (x) => x.late },
  { k: "ss", label: "ประกันสังคม", get: (x) => x.ss },
  { k: "wht", label: "ภาษีหัก ณ ที่จ่าย", get: (x) => x.wht ?? 0 },
  { k: "reimb", label: "ค่าใช้จ่ายคืน", get: (x) => x.reimb ?? 0 },
];

/** ชื่อช่องของสิ่งที่เปลี่ยน — "net" = ยอดสุทธิ */
export function payFieldLabel(k: string) {
  if (k === "net") return "ยอดสุทธิ";
  if (k.startsWith("i.")) {
    const key = k.slice(2);
    return [...PAY_INCOME_ITEMS, ...PAY_CUT_ITEMS].find((x) => x.k === key)?.label ?? key;
  }
  return PAY_SNAP_FIELDS.find((x) => x.k === k)?.label ?? k;
}

/** ยอดรายคนของรอบ ณ ตอนนี้ → เก็บกับการส่ง/การอนุมัติ */
export function paySnapOf(sum: CycleSum): PaySnap {
  const out: PaySnap = {};
  for (const x of sum.lines) {
    const f: Record<string, number> = { net: round2(x.net) };
    for (const d of PAY_SNAP_FIELDS) {
      const v = round2(d.get(x));
      if (v !== 0) f[d.k] = v;
    }
    for (const [k, v] of Object.entries(x.items ?? {})) if (v) f[`i.${k}`] = round2(v);
    out[x.id] = f;
  }
  return out;
}

/** ชื่อรายคนของรอบ ณ ตอนนี้ — ใช้ตอนสร้างรายการสิ่งที่เปลี่ยน */
export function payNamesOf(sum: CycleSum): Record<string, string> {
  return Object.fromEntries(sum.lines.map((x) => [x.id, x.name]));
}

/**
 * สิ่งที่เปลี่ยนระหว่างยอดที่ส่งครั้งก่อนกับตอนนี้ — รายคน: ยอดสุทธิก่อน แล้วตามด้วยช่องที่ขยับ
 * คนที่เพิ่งเข้ารอบ/ออกจากรอบขึ้นแถวเดียว (ยอดสุทธิ 0 → x หรือ x → 0)
 */
export function payChanges(
  was: PaySnap,
  now: PaySnap,
  names: Record<string, string> = {},
  wasNames: Record<string, string> = {},
): PayChange[] {
  const out: PayChange[] = [];
  const diff = (a: number, b: number) => Math.abs(a - b) > 0.005;
  for (const id of new Set([...Object.keys(was), ...Object.keys(now)])) {
    const a = was[id];
    const b = now[id];
    const name = names[id] ?? wasNames[id] ?? id;
    if (!a && b) {
      out.push({ emp: id, name, field: "net", was: 0, now: b.net ?? 0, kind: "add" });
      continue;
    }
    if (a && !b) {
      out.push({ emp: id, name, field: "net", was: a.net ?? 0, now: 0, kind: "drop" });
      continue;
    }
    if (!a || !b) continue;
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => k !== "net");
    const moved = keys.filter((k) => diff(a[k] ?? 0, b[k] ?? 0));
    if (moved.length === 0 && !diff(a.net ?? 0, b.net ?? 0)) continue;
    out.push({ emp: id, name, field: "net", was: a.net ?? 0, now: b.net ?? 0 });
    for (const k of moved) out.push({ emp: id, name, field: k, was: a[k] ?? 0, now: b[k] ?? 0 });
  }
  return out;
}

/** ยอดตอนนี้ไม่ตรงกับที่ส่งไว้ — มียอดรายคนเทียบรายคน · รอบเก่าไม่มีรายคนเทียบยอดสุทธิรวม */
export function payDrifted(ap: PayApproval, sum: CycleSum) {
  if (ap.lines) return payChanges(ap.lines, paySnapOf(sum)).length > 0;
  return ap.net !== undefined && Math.abs(sum.net - ap.net) > 0.005;
}

export const payApproveKey = (month: string, group: PayGroup) => `${month}|${group}`;

/*
 * ⚠️ ห้ามใส่ตัวเลขยอดไว้ในชุดตั้งต้น (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * ต้นแบบ ceo-approvals.html มียอดเขียนตายไว้ (421,853.25 / 9,200) ซึ่งไม่ใช่ยอดที่หน้าคำนวณเงินเดือนคิดได้
 * CEO อนุมัติเลขหนึ่งแล้วจ่ายอีกเลขหนึ่ง = การอนุมัติไม่มีความหมาย
 * หน้า /ceo/approvals จึงอ่านยอดจากผลการคำนวณของรอบตรง ๆ ไม่มียอดของตัวเอง
 * ช่อง people/net/ss ที่นี่เป็น "ยอด ณ ตอนที่ฝ่ายบุคคลกดส่ง" ไว้ตรวจว่าตัวเลขขยับหลังส่งหรือยังเท่านั้น
 */
export const HR_PAYAPPROVE: Record<string, PayApproval> = {
  /* รอบ ม.ค.–มิ.ย. 2569 CEO อนุมัติแล้วแบบเดียวกับ ก.ค. (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  ...Object.fromEntries(HR_PAST_MONTHS.flatMap((m) => Object.entries(pastApprovals(m)))),
  "2026-07|month": {status:"approved", by:"CEO", at:"2026-07-29 09:10"},
  "2026-07|day": {status:"approved", by:"CEO", at:"2026-07-29 09:10"},
  /* รอบ ส.ค. 2569 เคยรอ CEO อนุมัติ — เลิกขั้นนี้แล้ว รอบนี้คำนวณแล้วปิดรอบเงินเดือนได้เลย (ผู้ใช้สั่ง 13 ต.ค. 2569) */
};

/** CEO อนุมัติยอดของรอบเก่าแล้วทั้งสองกลุ่ม (แบบเดียวกับ ก.ค.) (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export function pastApprovals(month: string): Record<string, PayApproval> {
  const at = `${pastStepDates(month).approved} 09:10`;
  return {
    [payApproveKey(month, "month")]: { status: "approved", by: "CEO", at },
    [payApproveKey(month, "day")]: { status: "approved", by: "CEO", at },
  };
}

export function payApproval(all:Record<string, PayApproval>, month: string, group: PayGroup) {
  return all[payApproveKey(month, group)] ?? { status: "draft" as const };
}

// ─── การคำนวณ ─────────────────────────────────────────────────────

function parseDate(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysApart(from: string, to: string) {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86400000);
}

export function empOf(list: Employee[], id: string) {
  return list.find((e) => e.id === id);
}

/**
 * วันทำการในช่วงหนึ่ง — จันทร์ถึงศุกร์ที่ไม่ใช่วันหยุดบริษัท
 *
 * ทุกฟังก์ชันด้านล่างคิดจาก "ช่วงวัน" ไม่ใช่ "ชื่อเดือน"
 * เพราะรอบเงินเดือนคร่อมสองเดือนปฏิทินอยู่แล้ว และหน้าคำนวณเงินเดือน
 * ยังเปิดให้กำหนดช่วงเองเพื่อดูตัวเลขย้อนหลังได้ด้วย
 * ตัวที่รับชื่อเดือนเป็นเพียงทางลัดที่แปลงเป็นช่วงวันให้ก่อน
 */
export function workdaysIn(c: Cycle) {
  const end = parseDate(c.to);
  const out: string[] = [];
  for (let d = parseDate(c.from); d <= end; d.setDate(d.getDate() + 1)) {
    const w = d.getDay();
    if (w !== 0 && w !== 6 && !holidays()[isoOf(d)]) out.push(isoOf(d));
  }
  return out;
}

export function workdays(month: string) {
  return workdaysIn(hrCycle(month));
}

/**
 * วันทำการที่คนนี้อยู่จริงในช่วง
 * เข้าใหม่กลางรอบหรือลาออกกลางรอบ นับเฉพาะช่วงที่ยังอยู่ (HR-05 S-3)
 */
export function daysOfIn(e: Employee, c: Cycle) {
  /* ผ่านทดลองงานกลางรอบ — ช่วงที่ยังจ่ายรายวันนับถึงวันก่อนเริ่มเงินเดือนเท่านั้น (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const payFrom = e.type === "full" && isDaily(e, c) ? e.probPass?.payFrom : undefined;
  return workdaysIn(c).filter((d) => {
    if (d < e.startedAt) return false;
    if (e.leftAt && d > e.leftAt) return false;
    if (payFrom && d >= payFrom) return false;
    return true;
  });
}

export function daysOf(e: Employee, month: string) {
  return daysOfIn(e, hrCycle(month));
}

/** อยู่ในช่วงนี้ไหม — คนที่ยังไม่เข้าหรือออกไปแล้วไม่ต้องแสดง */
export function inRange(e: Employee, c: Cycle) {
  if (e.startedAt > c.to) return false;
  if (e.leftAt && e.leftAt < c.from) return false;
  return true;
}

export function inPeriod(e: Employee, month: string) {
  return inRange(e, hrCycle(month));
}

/** ตัดเฉพาะรายการที่อยู่ในช่วงวันที่กำหนด */
export function recInRange(
  time: Record<string, TimeRec>,
  id: string,
  c: Cycle,
): TimeRec {
  const r = time[id] ?? { late: [], leave: [], ot: [], issues: [] };
  const on = <T extends { d: string }>(x: T) => x.d >= c.from && x.d <= c.to;
  return {
    late: r.late.filter(on),
    leave: r.leave.filter(on),
    ot: r.ot.filter(on),
    issues: r.issues.filter(on),
  };
}

export function recIn(time: Record<string, TimeRec>, id: string, month: string) {
  return recInRange(time, id, hrCycle(month));
}

export function lateMin(r: TimeRec) {
  return r.late.reduce((a, x) => a + x.min, 0);
}

/** วันลารวม — ลาไม่เต็มวันนับตามชั่วโมงจริง ÷ 8 (ผู้ใช้สั่ง 19 ต.ค. 2569 · เดิมครึ่งวัน = 0.5) */
/* วันหยุด/เสาร์–อาทิตย์ไม่นับเป็นวันลา — แถวเก่าที่กางทุกวันในปฏิทินไว้ก็ไม่ถูกนับ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function leaveDays(r: TimeRec, sch?: DaySchedule) {
  return r.leave.filter((x) => isWorkIso(x.d)).reduce((a, x) => a + leaveRowDays(x, sch), 0);
}

export function otHours(r: TimeRec, kind?: OtKind) {
  return r.ot.filter((x) => !kind || x.kind === kind).reduce((a, x) => a + x.h, 0);
}

/** รายการที่ยังไม่มีคำอธิบาย — ค้างอยู่เท่ากับปิดรอบไม่ได้ */
export function openIssues(r: TimeRec) {
  return r.issues.filter((x) => !x.note);
}

/** เงินเดือนตามสัญญา ณ วันสุดท้ายของช่วง — ขึ้นเงินกลางรอบไม่ย้อนหลัง */
export function baseSalaryIn(e: Employee, c: Cycle) {
  let sal = 0;
  for (const h of e.history) if (h.at <= c.to) sal = h.salary;
  return sal;
}

export function baseSalary(e: Employee, month: string) {
  return baseSalaryIn(e, hrCycle(month));
}

/** สัดส่วนวันที่อยู่จริงในช่วง — เข้าใหม่หรือลาออกกลางรอบจ่ายตามสัดส่วน */
export function prorateIn(e: Employee, c: Cycle) {
  const total = daysApart(c.from, c.to) + 1;
  const from = e.startedAt > c.from ? e.startedAt : c.from;
  const to = e.leftAt && e.leftAt < c.to ? e.leftAt : c.to;
  const days = Math.max(0, daysApart(from, to) + 1);
  return { days, total, ratio: days / total };
}

export function prorate(e: Employee, month: string) {
  return prorateIn(e, hrCycle(month));
}

export function hourly(base: number) {
  return base / HR_OT_DIVISOR.days / HR_OT_DIVISOR.hours;
}

/** เพดานประกันสังคมของปีที่วันสุดท้ายของช่วงตกอยู่ — ฝ่ายบุคคลตั้งช่วงปีล่วงหน้าได้ที่ /admin/rates */
export function ceilingOf(monthOrDate: string) {
  const year = Number(monthOrDate.split("-")[0]) + 543;
  const list = ssCeilings();
  return list.find((c) => year >= c.from && year <= c.to) ?? list[list.length - 1];
}

/** ช่วงเพดานประกันสังคมทั้งหมด เรียงตามปี */
export function ssCeilings() {
  const list = settings().ssCeiling;
  return [...(list.length ? list : HR_SS_CEILING)].sort((a, b) => a.from - b.from);
}

export function extraOf(all: Record<string, Record<string, Extra>>, id: string, month: string): Extra {
  /* ผ่าน normalizeExtra เสมอ — กันข้อมูลรุ่นเก่าที่หลุดการย้ายมา (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const v = all[month]?.[id];
  return v ? normalizeExtra(v) : { items: {} };
}

function round2(v: number) {
  return Math.round(v * 100) / 100;
}

/** พนักงานทดลองงานจ่ายค่าจ้างรายวันตามวันที่มาทำงานจริง ไม่ใช่เงินเดือนหารสัดส่วน (ตามต้นแบบ) */
export function isDaily(e: Employee, at?: Cycle | string) {
  if (e.type === "probat") return true;
  /*
   * ผ่านทดลองงานกลางรอบ (ผู้ใช้สั่ง 13 ต.ค. 2569) — ประเภทเป็นพนักงานประจำแล้ว แต่ยังจ่ายแบบทดลองงานจนจบรอบ
   * ตัดสินจากวันแรกของช่วง (รอบเดือน/รอบรายวัน) เทียบ payFrom · ไม่ส่งช่วงมา = ดูจากวันนี้
   */
  const payFrom = e.probPass?.payFrom;
  if (!payFrom) return false;
  const d = at === undefined ? todayIso() : typeof at === "string" ? at : at.from;
  return d < payFrom;
}

/*
 * ─── รายการหักประจำ (ผู้ใช้สั่ง 30 ต.ค. 2569) ─────────────────────
 * เงินประกันผลงาน: ระบบหักเองตั้งแต่รอบแรกที่จ่ายรายเดือน จนยอดสะสมถึงเพดาน
 * กยศ.: HR กรอกยอดที่ประวัติพนักงาน ระบบเติมให้ทุกรอบ
 * ยอดในกล่องแก้ค่าตอบแทนของรอบนั้นชนะเสมอ · 0 = เว้นรอบนี้
 * ทดลองงานจ่ายรายวันและฝึกงานไม่มีสองรายการนี้
 *
 * ก่อน GUARANTEE_FROM ไม่หักเอง — ยอดเก่าอยู่ใน "ยอดยกมา" แล้ว และรอบที่ปิดไปแล้วไม่มีบรรทัดนี้
 * รอบที่ปิดแล้วเก็บยอดจริงลง extras ตอนปิด (freezeGuarantee) ยอดสะสมจึงไม่ขยับตามค่าที่แก้ทีหลัง
 */
export const GUARANTEE_FROM = "2026-11";

export function hasPayCuts(e: Employee, c: Cycle) {
  return e.type !== "intern" && !isDaily(e, c);
}

/** ยอดหักอัตโนมัติของเดือนหนึ่ง ถ้า held คือยอดสะสมก่อนเดือนนั้น — รอบสุดท้ายของคนที่พ้นสภาพไม่หัก */
function guaranteeAuto(e: Employee, month: string, held: number) {
  const c = hrCycle(month);
  if (month < GUARANTEE_FROM || !hasPayCuts(e, c) || !inRange(e, c) || (e.leftAt && e.leftAt <= c.to)) return 0;
  const r = ratesOn(c.to);
  return Math.max(0, Math.min(r.guaranteePerMonth, round2(r.guaranteeCap - held)));
}

/** ยอดสะสมก่อนเดือนนี้ = ยอดยกมา + ยอดหัก − ยอดคืน นับต่อเนื่องข้ามปี */
function guaranteeBefore(e: Employee, month: string, extras: Record<string, Record<string, Extra>>) {
  const typed = Object.keys(extras).filter((m) => /^\d{4}-\d{2}$/.test(m) && m < GUARANTEE_FROM);
  const list = [...typed, ...monthsBetween(GUARANTEE_FROM, month)].filter((m) => m < month).sort();
  let held = e.guaranteeOpening ?? 0;
  for (const m of list) {
    const it = extraOf(extras, e.id, m).items;
    held = round2(held + (it.guarantee ?? guaranteeAuto(e, m, held)) - (it.guaranteeBack ?? 0));
  }
  return held;
}

/** ยอดเงินประกันสะสมถึงสิ้นรอบเดือนนี้ — ใช้ทั้งประวัติพนักงาน สลิป และตารางสรุปเงินเดือน */
export function guaranteeHeld(e: Employee, month: string, extras: Record<string, Record<string, Extra>>) {
  const held = guaranteeBefore(e, month, extras);
  const it = extraOf(extras, e.id, month).items;
  return round2(held + (it.guarantee ?? guaranteeAuto(e, month, held)) - (it.guaranteeBack ?? 0));
}

/** ยอดที่ระบบเติมให้ในรอบนี้ถ้า HR ไม่ได้แก้ */
export function standingCuts(e: Employee, c: Cycle, extras: Record<string, Record<string, Extra>>): PayItems {
  if (!hasPayCuts(e, c)) return {};
  const month = monthKeyOf(c);
  return { guarantee: guaranteeAuto(e, month, guaranteeBefore(e, month, extras)), studentLoan: e.studentLoan ?? 0 };
}

/** ตอนปิดรอบ เก็บยอดหักเงินประกันจริงของรอบนั้น */
export function freezeGuarantee(extras: Record<string, Record<string, Extra>>, month: string, lines: CycleLine[]) {
  const round = { ...(extras[month] ?? {}) };
  for (const l of lines) {
    const it = extraOf(extras, l.id, month).items;
    round[l.id] = { items: { ...it, guarantee: l.items?.guarantee ?? 0 } };
  }
  return { ...extras, [month]: round };
}

/**
 * วันเริ่มจ่ายรายเดือนหลังผ่านทดลองงาน = วันแรกของรอบเงินเดือนถัดไปหลังวันที่มีผล
 * วันที่มีผลตรงกับวันแรกของรอบพอดี = เริ่มรอบนั้นเลย (ผู้ใช้สั่ง 13 ต.ค. 2569)
 */
export function payFromAfterPass(at: string) {
  const c = hrCycle(cycleMonthOfDay(at));
  return at === c.from ? at : addDay(c.to, 1);
}

/**
 * "จ่ายแบบทดลองงานถึงรอบ … · เริ่มเงินเดือนรอบ …" — null = ไม่ได้บันทึกผ่านทดลองงานผ่านกล่องผ่านทดลองงาน
 * (ผู้ใช้สั่ง 13 ต.ค. 2569)
 */
export function probPayNote(e: Employee) {
  const p = e.probPass;
  if (!p || e.type !== "full") return null;
  const start = `เริ่มเงินเดือนรอบ ${thaiMonth(cycleMonthOfDay(p.payFrom))}`;
  /* ผ่านตรงวันแรกของรอบ = ไม่มีช่วงจ่ายแบบทดลองงานต่อ */
  if (p.at >= p.payFrom) return start;
  return `จ่ายแบบทดลองงานถึงรอบ ${thaiDate(addDay(p.payFrom, -1))} · ${start}`;
}

/** ตัวหารค่าจ้างรายวันของทดลองงาน — เงินเดือน ÷ 22 วันทำงาน (ผู้ใช้สั่ง 19 ต.ค. 2569 · เดิม ÷ 30) */
export const PROB_DAY_DIVISOR = 22;

/**
 * อัตราค่าจ้างรายวันของทดลองงาน = เงินเดือนตามสัญญา ÷ 22 (ผู้ใช้สั่ง 19 ต.ค. 2569)
 * มาสายหักนาทีละ อัตรารายวัน ÷ 8 ÷ 60 (lateDeduction ใช้อัตรานี้อยู่แล้ว)
 */
export function dailyRateIn(e: Employee, c: Cycle) {
  return baseSalaryIn(e, c) / PROB_DAY_DIVISOR;
}

/**
 * วันที่มาทำงานจริงในช่วง = วันทำการที่ยังอยู่ หักวันลา
 * ส่ง today มาเพื่อตัดวันในอนาคตทิ้ง — ไม่งั้นจะกลายเป็นจ่ายค่าจ้างวันที่ยังไม่ได้มาทำงาน
 * ไม่ส่ง (รอบที่ปิดไปแล้ว) นับทั้งรอบ
 */
export function workedDaysIn(
  e: Employee,
  c: Cycle,
  time: Record<string, TimeRec>,
  today?: string,
) {
  const upTo = (d: string) => !today || d <= today;
  const work = daysOfIn(e, c).filter(upTo);
  /* หักเฉพาะวันลาที่ตรงวันทำงานของคนนั้นในรอบ — วันหยุด/เสาร์–อาทิตย์/วันก่อนเริ่มงานไม่หัก (ผู้ใช้สั่ง 19 ต.ค. 2569)
     เดิมหักทุกแถว ใบลาหลายวันที่คร่อมเสาร์–อาทิตย์ทำให้ทดลองงานได้ค่าจ้างขาด */
  const workSet = new Set(work);
  const days = work.length;
  const leave = recInRange(time, e.id, c)
    .leave.filter((x) => workSet.has(x.d))
    .reduce((a, x) => a + leaveRowDays(x, scheduleFor(e)), 0);
  return days - leave;
}

export type PaySlipCalc = {
  base: number;
  ot: number;
  com: number;
  inc: number;
  allow: number;
  /** รายได้รายการอื่นที่กรอกเอง (ค่าน้ำมัน ค่าครองชีพ … รายได้อื่นๆ) รวมกัน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  more: number;
  /** = −(รวมรายการหักที่กรอกเอง) — ติดลบหรือศูนย์ · รอบเก่าคือยอดปรับปรุงรวม */
  adj: number;
  /** รายการเงินได้/รายการหักตามแบบสลิป — สลิปอ่านตรงนี้ทีละช่อง */
  items: PayItems;
  ss: number;
  /** ภาษีหัก ณ ที่จ่าย 3% — ทดลองงานจ่ายรายวันเท่านั้น รายเดือน = 0 (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  wht: number;
  /** นาทีสายรวมในรอบ และนาทีที่ถูกหักจริง (หลังหักนาทีที่อนุโลม) */
  lateMin: number;
  lateChargedMin: number;
  /** เงินที่หักเพราะมาสาย — 0 ถ้าผู้ดูแลระบบปิดการหัก */
  late: number;
  gross: number;
  /** ค่าใช้จ่ายคืน — อยู่นอกรายได้ (ไม่รวมใน gross ไม่คิดประกันสังคม) แต่รวมในยอดสุทธิ */
  reimb: number;
  net: number;
  /** ลาเกินสิทธิ์ที่ระบบหักให้ (รวมอยู่ใน items แล้ว) — ยอดที่ปิดรอบไว้ไม่มีช่องนี้ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  leaveOver?: LeaveOver[];
};

/**
 * ยอดที่บันทึกไว้ตอนปิดรอบของคนหนึ่ง → รูปแบบเดียวกับผลการคำนวณสด
 *
 * สลิปและตารางของรอบที่ปิดแล้วต้องอ่านตัวเลขชุดนี้ ไม่ใช่คิดใหม่ (HR-BR-03)
 * ไม่งั้นเงินเดือนที่ขึ้นภายหลังจะย้อนไปเปลี่ยนสลิปที่เผยแพร่ไปแล้วเงียบ ๆ
 * รอบเก่าที่ยังไม่มีช่องค่าคอม/ค่าตอบแทนพิเศษถือเป็น 0 ตามหมายเหตุที่หัว CycleLine
 * นาทีที่มาสายไม่ได้เก็บใน snapshot ช่องนาทีจึงเป็น 0 — หน้าจอที่อ่านต้องไม่พิมพ์จำนวนนาที
 */
export function calcOfLine(x: CycleLine): PaySlipCalc {
  const com = x.com ?? 0;
  const inc = x.inc ?? 0;
  const allow = x.allow ?? 0;
  const more = x.more ?? 0;
  return {
    base: x.base,
    ot: x.ot,
    com,
    inc,
    allow,
    more,
    adj: x.adj,
    /* รอบที่ปิดก่อนมีรายการตามแบบสลิป — แปลงจาก Incentive/ค่าตำแหน่ง/รายการปรับปรุงที่บันทึกไว้ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    items: x.items ?? itemsOfLegacy({ incentive: inc, allowance: allow, adjust: x.adjust, adj: x.adj }),
    ss: x.ss,
    /* รอบเก่าไม่มีภาษีที่บันทึกไว้ = 0 · ไม่คิดย้อนหลัง ยอดสุทธิที่บันทึกไว้ไม่เปลี่ยน */
    wht: x.wht ?? 0,
    lateMin: 0,
    lateChargedMin: 0,
    late: x.late,
    gross: x.gross ?? round2(x.base + x.ot + com + inc + allow + more + x.adj),
    reimb: x.reimb ?? 0,
    net: x.net,
  };
}

/*
 * รายได้กับรายการหักของสลิป — ตัดยอดที่เดียว ทุกหน้าจอจะได้ตัวเลขชุดเดียวกัน
 *
 * สลิปต้องเห็นรายการหักแยกเป็นสามช่อง ประกันสังคม · หักมาสาย · รายการปรับปรุงอื่น
 * ไม่ใช่ยอดรวมช่องเดียว (ผู้ใช้กำหนด 24 ก.ย. 2569) เพราะพนักงานใช้สลิปตรวจว่าถูกหักอะไรไปบ้าง
 * ยอดรวมช่องเดียวแปลว่าต้องไปถามฝ่ายบุคคลทุกครั้ง และเป็นจุดที่เถียงกันบ่อยที่สุด
 *
 * รายการปรับปรุงจึงย้ายจากฝั่งรายได้มาอยู่ฝั่งรายการหัก — ติดลบคือหักเพิ่ม บวกคือคืนกลับ
 * ค่าใช้จ่ายคืนไม่ใช่รายการหัก อยู่ฝั่งบวกเหมือนเดิม
 * บวกลบแล้วต้องได้ยอดสุทธิเสมอ: รวมรายได้ − รวมรายการหัก + ค่าใช้จ่ายคืน = สุทธิ
 */

/** รวมรายได้ของสลิป — ไม่รวมรายการหัก (adj) เพราะอยู่ฝั่งรายการหัก */
export function earnOf(gross: number, adj: number) {
  return round2(gross - adj);
}

/** รวมรายการหัก — ประกันสังคม + มาสาย + รายการหักที่กรอกเอง (adj กลับเครื่องหมาย) + ภาษีหัก ณ ที่จ่าย */
export function cutOf(p: { ss: number; late: number; adj: number; wht?: number }) {
  return round2(p.ss + p.late - p.adj + (p.wht ?? 0));
}

/**
 * เงินที่หักเพราะมาสาย — หักทุกนาที ไม่มีผ่อนผันและไม่มีอนุโลม (ผู้ใช้กำหนด 18 ก.ย. 2569)
 * ผู้ดูแลระบบเลือกที่ /admin/schedule:
 *   ตามฐานเงินเดือน — นาทีละ เงินเดือน ÷ 30 ÷ 8 ÷ 60 · ทดลองงานนาทีละ (เงินเดือน ÷ 22) ÷ 8 ÷ 60 (ผู้ใช้สั่ง 19 ต.ค. 2569)
 *   กำหนดเอง       — นาทีละกี่บาทตามที่กรอก (latePerMinute)
 * ใช้ตัวหารเดียวกับค่าล่วงเวลา (HR_OT_DIVISOR) ตัวเลขสองฝั่งจะได้ไปทางเดียวกัน
 */
export function lateDeduction(e: Employee, c: Cycle, minutes: number) {
  /* อัตราหักมาสายของรอบนั้น — รอบเก่าคิดด้วยอัตราที่ใช้อยู่ตอนนั้น ไม่ใช่อัตราวันนี้ */
  const r = ratesOn(c.to);
  const charged = Math.max(0, minutes);
  const perDay = isDaily(e, c) ? dailyRateIn(e, c) : baseSalaryIn(e, c) / HR_OT_DIVISOR.days;
  /* ชั่วโมงต่อวันตามเวลาทำงานของคนนั้น (แม่บ้าน 08:00–17:00 ก็ 8 ชม.) (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const ownMs = targetWorkMs(scheduleFor(e));
  const hoursPerDay = ownMs > 0 ? ownMs / 3_600_000 : HR_OT_DIVISOR.hours;
  const perMin = r.lateMode === "fixed" ? r.latePerMinute : perDay / hoursPerDay / 60;
  return { charged, perMin, amount: round2(charged * perMin) };
}

/*
 * ─── ลาเกินสิทธิ์ของพนักงานรายเดือน (ผู้ใช้สั่ง 19 ต.ค. 2569) ───
 * หัก = (เงินเดือน ÷ 30) × วันที่เกิน · วันที่เกิน = ชั่วโมงที่เกิน ÷ 8
 * ไล่ใบลาที่อนุมัติแล้วของปีการลาตามวันที่ ส่วนที่เลยสิทธิ์ของประเภทนั้น (รวมพักร้อนยกมา) และตกในรอบนี้ถูกหักในรอบนี้
 * นับเฉพาะวันทำงาน (ใบหลายวันที่คร่อมเสาร์-อาทิตย์ไม่ถูกนับวันหยุด)
 * ลงบรรทัดหักตามแบบสลิป: ลาป่วย → "หัก ลาป่วย" · ลากิจ → "หัก ลากิจ" · ลาพักร้อน → "หัก อื่นๆ"
 * ทดลองงานไม่ใช้สูตรนี้ — จ่ายตามวันที่มาทำงานจริงอยู่แล้ว
 */
export type LeaveOver = { kind: LeaveKind; hours: number; amt: number };

export const LEAVE_CUT_KEY: Record<LeaveKind, PayItemKey> = { sick: "sick", personal: "personal", vacation: "otherCut" };

/** วันทำงานของบริษัท — จันทร์–ศุกร์ ไม่ใช่วันหยุดบริษัท (ชุดเดียวกับ workdaysIn) */
export function isWorkIso(iso: string) {
  const w = parseDate(iso).getDay();
  return w !== 0 && w !== 6 && !holidays()[iso];
}

/**
 * วันที่ของใบลาหนึ่งใบ (ผู้ใช้สั่ง 19 ต.ค. 2569 — แก้บั๊กทดลองงานได้เงินขาด)
 * ใบหลายวันกางเฉพาะวันทำงาน (จันทร์–ศุกร์ ไม่ใช่วันหยุดบริษัท) — เดิมกางทุกวันในปฏิทิน
 * เสาร์–อาทิตย์/วันหยุดที่อยู่กลางใบจึงถูกหักเป็นวันลา ค่าจ้างทดลองงานหายเกินจริง
 * ใบวันเดียวคงวันนั้นไว้ตามที่ขอ (หน้าเวลาเห็นใบ) แต่การนับวันลา/วันทำงานไม่นับวันหยุดอยู่ดี
 */
export function leaveDatesOf(from: string, to: string = from) {
  if (to <= from) return [from];
  const out: string[] = [];
  for (let d = parseDate(from); isoOf(d) <= to; d.setDate(d.getDate() + 1)) {
    const iso = isoOf(d);
    if (isWorkIso(iso)) out.push(iso);
    /* กันวนไม่รู้จบ */
    if (out.length > 90) break;
  }
  return out;
}

/** ชั่วโมงลาเกินสิทธิ์ที่ตกในช่วงนี้ แยกประเภท */
export function leaveOverIn(e: Employee, c: Cycle, time: Record<string, TimeRec>): Record<LeaveKind, number> {
  const out: Record<LeaveKind, number> = { personal: 0, vacation: 0, sick: 0 };
  const sch = scheduleFor(e);
  const rows = (time[e.id]?.leave ?? []).filter((x) => isWorkIso(x.d));
  const sumH = (kind: LeaveKind, from: string, to: string) =>
    rows.filter((x) => x.type === kind && x.d >= from && x.d <= to).reduce((a, x) => a + leaveRowHours(x, sch), 0);
  const years = [...new Set([leaveYearOf(c.from), leaveYearOf(c.to)])];
  for (const y of years) {
    const period = leavePeriodOf(y);
    const [yf, yt] = periodRange(period);
    for (const kind of Object.keys(out) as LeaveKind[]) {
      const label = HR_LEAVE_LABEL[kind];
      let ent = entitlementDays(label, period) * LEAVE_DAY_HOURS;
      /* พักร้อนยกมาจากปีก่อน (ส่วนที่ไม่ได้ใช้ ไม่เกินเพดาน) — สูตรเดียวกับ carriedDays ของหน้าการลา */
      const max = settings().rates.vacationCarryMax;
      if (kind === "vacation" && max > 0) {
        const prev = leavePeriodOf(y - 1);
        const [pf, pt] = periodRange(prev);
        const base = entitlementDays(label, prev);
        if (base) ent += Math.min(max, Math.max(0, base - sumH(kind, pf, pt) / LEAVE_DAY_HOURS)) * LEAVE_DAY_HOURS;
      }
      const list = rows.filter((x) => x.type === kind && x.d >= yf && x.d <= yt).sort((a, b) => a.d.localeCompare(b.d));
      let cum = 0;
      for (const x of list) {
        const before = cum;
        cum += leaveRowHours(x, sch);
        const over = Math.max(0, cum - Math.max(ent, before));
        if (over > 0 && x.d >= c.from && x.d <= c.to) out[kind] += over;
      }
    }
  }
  return out;
}

/** เงินที่หักเพราะลาเกินสิทธิ์ — รายเดือนเท่านั้น */
export function leaveOverCut(e: Employee, c: Cycle, time: Record<string, TimeRec>): LeaveOver[] {
  if (isDaily(e, c)) return [];
  const perDay = baseSalaryIn(e, c) / HR_OT_DIVISOR.days;
  const over = leaveOverIn(e, c, time);
  return (Object.keys(over) as LeaveKind[])
    .filter((k) => over[k] > 0)
    .map((k) => ({ kind: k, hours: over[k], amt: round2(perDay * (over[k] / LEAVE_DAY_HOURS)) }));
}

/** รายการหักที่กรอกเอง + หักลาเกินสิทธิ์ที่ระบบคิดให้ (บวกเข้าบรรทัดเดียวกันของสลิป) */
function withLeaveCut(items: PayItems, cuts: LeaveOver[]): PayItems {
  if (!cuts.length) return items;
  const out: PayItems = { ...items };
  for (const x of cuts) out[LEAVE_CUT_KEY[x.kind]] = round2((out[LEAVE_CUT_KEY[x.kind]] ?? 0) + x.amt);
  return out;
}

/**
 * ยอดเงินของคนหนึ่งในรอบหนึ่ง
 *
 * ปัดทีละก้อนก่อนรวม แล้วค่อยลบประกันสังคมออกจากยอดรวม
 * ถ้าปัดตอนท้ายครั้งเดียว ยอดรวมจะไม่เท่ากับผลบวกของบรรทัดที่พิมพ์ในสลิป
 */
export function payIn(
  e: Employee,
  c: Cycle,
  time: Record<string, TimeRec>,
  extras: Record<string, Record<string, Extra>>,
  today?: string,
  src?: ComSource,
): PaySlipCalc {
  const full = baseSalaryIn(e, c);
  const base = isDaily(e, c)
    ? round2(dailyRateIn(e, c) * workedDaysIn(e, c, time, today))
    : round2(full * prorateIn(e, c).ratio);
  const r = recInRange(time, e.id, c);
  const ot = round2(
    r.ot.reduce((a, o) => a + hourly(full) * hrOtRate(c.to)[otKindAt(o)] * o.h, 0),
  );
  const com = round2(commissionBase(e, c, src) * (hrCommission(c.to)[e.pos] ?? 0));
  /* รายการตามแบบสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569) — Incentive/ค่าตำแหน่งยังแยกช่องไว้ให้หน้าที่รวมยอดเดิมอ่านได้ */
  /* หักลาเกินสิทธิ์ของรายเดือนบวกเข้าบรรทัดหักลาของสลิป (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const leaveOver = leaveOverCut(e, c, time);
  const typed = extraOf(extras, e.id, extraKeyOf(e, c)).items;
  const items = withLeaveCut({ ...standingCuts(e, c, extras), ...typed }, leaveOver);
  const inc = items.incentive ?? 0;
  const allow = items.position ?? 0;
  const more = round2(itemSum(items, PAY_INCOME_ITEMS) - inc - allow);
  const adj = -itemSum(items, PAY_CUT_ITEMS);
  /* BR-04 ประกันสังคมคิดจากเงินเดือนฐาน ไม่รวมค่าล่วงเวลาและไม่เกินเพดาน
     พนักงานทดลองงานไม่หักประกันสังคม (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  const ss = isDaily(e, c) ? 0 : round2(Math.min(base, ceilingOf(c.to).ceiling) * hrSsRate(c.to));
  const gross = round2(base + ot + com + inc + allow + more + adj);
  const lateTotal = lateMin(r);
  const lateCut = lateDeduction(e, c, lateTotal);
  /* ภาษีหัก ณ ที่จ่าย 3% ของทดลองงานจ่ายรายวัน = 3% ของ (รวมเงินได้ − รายการหักก่อนภาษี) ปัด 2 ตำแหน่ง
     ย้ายมาคิดในการคำนวณเงินเดือน บันทึกพร้อมรอบตอนปิด สลิปอ่านค่าที่บันทึกไว้ (ผู้ใช้สั่ง 16 ต.ค. 2569)
     รายเดือนไม่มีบรรทัดนี้ (เว้นว่าง) */
  const pre = round2(gross - ss - lateCut.amount);
  const wht = isDaily(e, c) ? Math.max(0, round2(pre * DAILY_WHT_RATE)) : 0;
  const reimb = round2(reimbIn(e, c, src));
  return {
    base,
    ot,
    com,
    inc,
    allow,
    more,
    adj,
    items,
    ss,
    wht,
    lateMin: lateTotal,
    lateChargedMin: lateCut.charged,
    late: lateCut.amount,
    gross,
    reimb,
    net: round2(pre - wht + reimb),
    leaveOver,
  };
}

export function payOf(
  e: Employee,
  month: string,
  time: Record<string, TimeRec>,
  extras: Record<string, Record<string, Extra>>,
  src?: ComSource,
) {
  return payIn(e, hrCycle(month), time, extras, undefined, src);
}

/** รอบเดือนที่ช่วงวันนี้ถือว่าเป็นของเดือนไหน — ใช้กับยอดขายและค่าตอบแทนพิเศษ */
export function monthKeyOf(c: Cycle) {
  return c.to.slice(0, 7);
}

/**
 * คีย์ของค่าตอบแทนที่ไม่มีสูตร (Incentive ค่าตำแหน่ง ปรับปรุง)
 * รายเดือนผูกกับรอบเดือน — ใช้เดือนของวันสุดท้าย เพราะรอบตัดวันที่ 25 จบในเดือนนั้น
 * ทดลองงานผูกกับรอบจ่ายรายช่วง "จาก~ถึง" (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ถ้าผูกกับเดือน รอบรายช่วงหลายรอบในเดือนเดียวกันจะได้ก้อนเดียวกันซ้ำทุกรอบ
 */
export function extraKeyOf(e: Employee, c: Cycle) {
  return isDaily(e, c) ? dailyRoundId(c) : monthKeyOf(c);
}

/** ช่วงวันนี้ตรงกับรอบเดือนไหนพอดีไหม — ไม่ตรงคือช่วงที่กำหนดเอง ปิดรอบไม่ได้ */
export function cycleMonthOf(c: Cycle, months: string[]) {
  return months.find((m) => {
    const x = hrCycle(m);
    return x.from === c.from && x.to === c.to;
  });
}

/*
 * ─── ผลการคำนวณของรอบ — แหล่งเดียวของทุกหน้า ───────────────────
 *
 * หน้าคำนวณเงินเดือน สลิป และประวัติรอบต้องได้ตัวเลขชุดเดียวกันเสมอ (ไม่มีหน้าอนุมัติของ CEO แล้ว ผู้ใช้สั่ง 13 ต.ค. 2569)
 * (ผู้ใช้กำหนด 23 ก.ย. 2569 — CEO อนุมัติเลขหนึ่งแล้วจ่ายอีกเลขหนึ่งไม่ได้)
 * จึงต้องคิดด้วยฟังก์ชันเดียวกันตรงนี้ ห้ามหน้าไหนคิดเอง
 */
export type PayLine = {
  e: Employee;
  c: PaySlipCalc;
  /** วันที่มาทำงานและอัตราต่อวัน (กลุ่มจ่ายรายวัน) */
  days: number;
  rate: number;
  /** ตัวเลขชุดนี้มาจากยอดที่บันทึกไว้ตอนปิดรอบ ไม่ได้คำนวณใหม่ */
  snapped: boolean;
};

/**
 * บรรทัดเงินเดือนของทุกคนในช่วงวันหนึ่ง
 * รอบที่ปิดแล้วอ่านยอดที่บันทึกไว้ ไม่คำนวณใหม่ (HR-BR-03)
 * ไม่งั้นหน้าคำนวณ หน้าสลิป และหน้าอนุมัติจะไม่ตรงกันทันทีที่มีอะไรขยับหลังปิดรอบ
 */
export function payLines(
  emp: Employee[],
  range: Cycle,
  time: Record<string, TimeRec>,
  extras: Record<string, Record<string, Extra>>,
  today: string,
  src: ComSource | undefined,
  payrun: Period | undefined,
  month: string | null | undefined,
): PayLine[] {
  return emp
    .filter((e) => inRange(e, range))
    .map((e) => {
      const g: PayGroup = isDaily(e, range) ? "day" : "month";
      const saved = month ? lineIn(payrun, g, e.id) : null;
      return {
        e,
        c: saved ? calcOfLine(saved) : payIn(e, range, time, extras, today, src),
        days: saved ? saved.days : workedDaysIn(e, range, time, today),
        rate: saved ? saved.rate : dailyRateIn(e, range),
        snapped: Boolean(saved),
      };
    });
}

/** บรรทัดของกลุ่มเดียว — รายเดือนกับจ่ายรายวันปิดรอบแยกกัน */
/* range = ช่วงของบรรทัดชุดนี้ — คนผ่านทดลองงานกลางรอบอยู่กลุ่มไหนขึ้นกับรอบ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function linesOfGroup(lines: PayLine[], group: PayGroup, range?: Cycle) {
  return lines.filter((x) => (isDaily(x.e, range) ? "day" : "month") === group);
}

/**
 * ยอดของกลุ่มหนึ่งที่จะบันทึกไว้กับรอบตอนกดปิด
 * เก็บรายคนไว้ด้วย หน้าประวัติรอบจะได้กางดูได้ว่าใครได้เท่าไหร่ โดยไม่ต้องคำนวณใหม่
 */
export function sumOfGroup(
  lines: PayLine[],
  group: PayGroup,
  range: Cycle,
  extras: Record<string, Record<string, Extra>>,
): CycleSum {
  const day = group === "day";
  const out: CycleSum = {
    n: lines.length,
    base: 0, ot: 0, com: 0, inc: 0, allow: 0, more: 0, wht: 0, adj: 0, ss: 0, late: 0, net: 0, days: 0,
    lines: [],
  };
  for (const { e, c, days: worked, rate } of lines) {
    const days = day ? worked : 0;
    out.base += c.base;
    out.ot += c.ot;
    out.com += c.com;
    out.inc += c.inc;
    out.allow += c.allow;
    out.more = (out.more ?? 0) + c.more;
    out.wht = (out.wht ?? 0) + c.wht;
    out.adj += c.adj;
    out.ss += c.ss;
    out.late += c.late;
    out.reimb = (out.reimb ?? 0) + c.reimb;
    out.net += c.net;
    out.days += days;
    out.lines.push({
      id: e.id,
      name: e.name,
      pos: e.pos,
      base: c.base,
      ot: c.ot,
      com: c.com,
      inc: c.inc,
      allow: c.allow,
      more: c.more,
      gross: c.gross,
      /* เก็บรายการตามแบบสลิปไว้ด้วย สลิปย้อนหลังจะได้แสดงได้แม้ข้อมูลรอบนั้นถูกแก้ภายหลัง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
      items: { ...c.items },
      adj: c.adj,
      ss: c.ss,
      late: c.late,
      wht: c.wht,
      reimb: c.reimb,
      net: c.net,
      days,
      rate: day ? rate : 0,
    });
  }
  return out;
}

/*
 * ยอดที่ปิดรอบของรอบตั้งต้น (ก.ค. 2569)
 *
 * ต้นแบบมีตัวเลขชุดนี้เขียนไว้ตรง ๆ แต่รหัสพนักงานในต้นแบบไม่ตรงกับทะเบียนของระบบ
 * (เช่น E13 ในต้นแบบคือแม่บ้าน แต่ของเราคือฝ่ายขาย) ถ้าคัดลอกมาทั้งก้อน สลิปจะขึ้นชื่อผิดคน
 * จึงคิดยอดจากทะเบียนจริงด้วยสูตรเดียวกับหน้าคำนวณเงินเดือน แล้วเก็บเป็น snapshot ของรอบนั้น
 * รอบหลังจากนี้บันทึกตอนฝ่ายบุคคลกดปิดรอบตามปกติ
 */
function seedSum(month: string, day: boolean): CycleSum {
  const c = hrCycle(month);
  const out: CycleSum = {
    n: 0, base: 0, ot: 0, com: 0, inc: 0, allow: 0, adj: 0, ss: 0, late: 0, net: 0, days: 0,
    lines: [],
  };
  for (const e of HR_EMP) {
    if (!inPeriod(e, month) || isDaily(e, hrCycle(month)) !== day) continue;
    const x = payIn(e, c, HR_TIME, HR_EXTRA, c.to);
    const days = day ? workedDaysIn(e, c, HR_TIME, c.to) : 0;
    out.n += 1;
    out.base += x.base;
    out.ot += x.ot;
    out.com += x.com;
    out.inc += x.inc;
    out.allow += x.allow;
    out.more = (out.more ?? 0) + x.more;
    out.wht = (out.wht ?? 0) + x.wht;
    out.adj += x.adj;
    out.ss += x.ss;
    out.late += x.late;
    out.reimb = (out.reimb ?? 0) + x.reimb;
    out.net += x.net;
    out.days += days;
    out.lines.push({
      id: e.id, name: e.name, pos: e.pos,
      base: x.base, ot: x.ot, com: x.com, inc: x.inc, allow: x.allow, more: x.more, gross: x.gross,
      items: { ...x.items },
      adj: x.adj, ss: x.ss, late: x.late, wht: x.wht, reimb: x.reimb, net: x.net,
      days, rate: day ? dailyRateIn(e, c) : 0,
    });
  }
  return out;
}

for (const p of HR_PAYRUN) {
  if (p.closed && !p.sum) p.sum = seedSum(p.month, false);
  if (p.dayClosed && !p.daySum) p.daySum = seedSum(p.month, true);
}

/*
 * ═══ รอบจ่ายรายวันของพนักงานทดลองงาน (ผู้ใช้สั่ง 6 ต.ค. 2569) ═══════════
 *
 * ทดลองงานไม่ได้จ่ายตามรอบเดือน — หนึ่งรอบคือช่วงวันที่ใดก็ได้ วันเดียวหรือหลายวัน (เช่น 6 – 8 ต.ค.)
 * ปิดรอบเวลา → คำนวณและปิดรอบเงินเดือน → ส่งสลิป เดินครบเหมือนรอบเดือน แต่ทีละช่วงวัน
 * ไม่มีขั้น CEO อนุมัติแล้ว (ผู้ใช้สั่ง 13 ต.ค. 2569) · ประวัติการอนุมัติเก่าอยู่ใน payApprove คีย์ `${id}|day`
 * ช่อง dayClosed / daySum ของรอบเดือนเป็นข้อมูลเก่า หน้าในสายรอบเงินเดือนไม่อ่านแล้ว
 */
export type DailyRound = {
  /** "yyyy-mm-dd~yyyy-mm-dd" — ช่วงวันเดียวกันมีได้รอบเดียว */
  id: string;
  from: string;
  to: string;
  /** ปิดรอบเวลาทำงาน — รอบเกิดขึ้นตอนกดปิดนี้ */
  closedAt: string;
  closedBy: string;
  /** ปิดรอบเงินเดือน พร้อมยอดที่บันทึกไว้ ณ ตอนปิด */
  payClosedAt: string;
  payClosedBy: string;
  sum: CycleSum | null;
  /** สลิป */
  slipsMadeAt: string;
  published: boolean;
  publishedAt: string;
  publishedBy: string;
  unpublished: Reopen[];
  views: Record<string, number>;
  downloads: Record<string, number>;
};

export function dailyRoundId(c: Cycle) {
  return `${c.from}~${c.to}`;
}

/** คีย์ของรอบรายวัน (มี "~") — คีย์รอบเดือนเป็น "yyyy-mm" */
export function isDailyRoundKey(key: string) {
  return /^\d{4}-\d{2}-\d{2}~\d{4}-\d{2}-\d{2}$/.test(key);
}

export function dailyRoundRange(key: string): Cycle {
  const [from, to] = key.split("~");
  return { from, to };
}

/**
 * ชื่อรอบตามช่วงวันจริง — "6 ต.ค. 2569" · "6 – 8 ต.ค. 2569" · "28 ก.ย. – 3 ต.ค. 2569"
 * ข้ามปีพิมพ์ปีทั้งสองฝั่ง
 */
export function rangeLabel(c: Cycle) {
  if (c.from === c.to) return thaiDate(c.from);
  const [y1, m1, d1] = c.from.split("-").map(Number);
  const [y2, m2] = c.to.split("-").map(Number);
  if (y1 !== y2) return `${thaiDate(c.from)} – ${thaiDate(c.to)}`;
  const tail = thaiDate(c.to);
  if (m1 === m2) return `${d1} – ${tail}`;
  return `${thaiDate(c.from).replace(/ \d{4}$/, "")} – ${tail}`;
}

/** ชื่อรอบจากคีย์ของ payApprove — รอบเดือน "กันยายน 2569" · รอบรายวัน "6 – 8 ต.ค. 2569" */
export function payKeyLabel(key: string, monthLabel: (m: string) => string) {
  /* รอบรายสัปดาห์ขึ้นต้นว่า "สัปดาห์" (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  return isDailyRoundKey(key) ? probRoundLabel(dailyRoundRange(key)) : monthLabel(key);
}

/** รอบที่ทับช่วงนี้แต่ไม่ใช่ช่วงเดียวกัน — ปิดซ้อนกันไม่ได้ ไม่งั้นวันเดียวกันจ่ายสองครั้ง */
export function overlapRound(rounds: DailyRound[], c: Cycle) {
  return rounds.find((r) => r.id !== dailyRoundId(c) && r.from <= c.to && r.to >= c.from);
}

/**
 * รอบจ่ายรายวันที่นับเป็นของรอบเดือนนี้ — วันสุดท้ายของรอบตกในช่วงรอบเดือน (hrCycle) เรียงเก่าไปใหม่
 * หน้ายอดเงินเดือนของ CEO กับต้นทุนแรงงานบนแดชบอร์ดใช้ตัวนี้ตัวเดียว ยอดจึงตรงกัน (ผู้ใช้สั่ง 14 ต.ค. 2569)
 */
export function dailyRoundsOfMonth(rounds: DailyRound[], month: string) {
  const c = hrCycle(month);
  return rounds.filter((r) => r.to >= c.from && r.to <= c.to).sort((a, b) => a.from.localeCompare(b.from));
}

function addDay(iso: string, n: number) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
}

/**
 * ช่วงวันที่เปิดมาเป็นค่าตั้งต้นของกลุ่มทดลองงาน
 * รอบที่ยังเดินไม่จบ (ตาม pick) ล่าสุดก่อน · ไม่มีก็ต่อจากรอบล่าสุดถึงวันนี้ · ไม่มีรอบเลยคือวันนี้วันเดียว
 */
export function defaultDailyRange(
  rounds: DailyRound[],
  today: string,
  pick: (r: DailyRound) => boolean = (r) => !r.published,
): Cycle {
  const sorted = [...rounds].sort((a, b) => b.to.localeCompare(a.to));
  const open = sorted.find(pick);
  if (open) return { from: open.from, to: open.to };
  /* ไม่มีรอบค้าง — สัปดาห์ถัดจากรอบล่าสุด (ถ้าเริ่มแล้ว) ไม่งั้นสัปดาห์ของวันนี้ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const last = sorted[0];
  if (last) {
    const next = addDay(last.to, 1);
    if (next <= today) return weekRangeFor(next, rounds);
  }
  return weekRangeFor(today, rounds);
}

/*
 * ═══ รอบจ่ายรายสัปดาห์ของทดลองงาน (ผู้ใช้สั่ง 19 ต.ค. 2569) ═══
 * แทนรอบรายวันแบบเลือกช่วงเอง — หนึ่งรอบ = หนึ่งสัปดาห์ จันทร์–อาทิตย์
 * โครงข้อมูลเดิม (DailyRound, คีย์ "จาก~ถึง") ใช้ต่อ รอบรายวันเก่าที่มีอยู่แล้วคงไว้ตามเดิม อ่านอย่างเดียว
 * สัปดาห์ที่คร่อมรอบรายวันเก่า ตัดวันที่รอบเก่าจ่ายไปแล้วออก (วันเดียวกันจ่ายสองครั้งไม่ได้)
 */
export const PROB_ROUND_LABEL = "รายสัปดาห์";

/** สัปดาห์ (จันทร์–อาทิตย์) ที่วันนี้ตกอยู่ */
export function weekOf(iso: string): Cycle {
  const d = parseDate(iso);
  const back = (d.getDay() + 6) % 7;
  const from = addDay(iso, -back);
  return { from, to: addDay(from, 6) };
}

/** ช่วงเป็นสัปดาห์จันทร์–อาทิตย์เต็มพอดีไหม */
export function isWeekRange(c: Cycle) {
  const w = weekOf(c.from);
  return w.from === c.from && w.to === c.to;
}

/**
 * รอบรายสัปดาห์ของวันที่เลือก — สัปดาห์ของวันนั้น ตัดวันที่รอบเก่า (ไม่ใช่สัปดาห์เต็ม) ครอบไว้แล้วออก
 * วันที่เลือกตกในรอบเก่าพอดี = คืนรอบเก่านั้น (เปิดดูได้อย่างเดียว)
 */
export function weekRangeFor(iso: string, rounds: DailyRound[] = []): Cycle {
  const hit = rounds.find((r) => r.from <= iso && iso <= r.to);
  if (hit) return { from: hit.from, to: hit.to };
  const w = weekOf(iso);
  const covered = (d: string) => rounds.some((r) => r.from <= d && d <= r.to);
  let from = iso;
  while (from > w.from && !covered(addDay(from, -1))) from = addDay(from, -1);
  let to = iso;
  while (to < w.to && !covered(addDay(to, 1))) to = addDay(to, 1);
  return { from, to };
}

/** ชื่อรอบของทดลองงาน — "สัปดาห์ 13 – 19 ต.ค. 2569" · รอบรายวันเก่าใช้ช่วงวันตามเดิม */
export function probRoundLabel(c: Cycle) {
  return isWeekRange(c) ? `สัปดาห์ ${rangeLabel(c)}` : rangeLabel(c);
}

/**
 * บรรทัดเงินของกลุ่มทดลองงานในช่วงวันหนึ่ง — รอบที่ปิดเงินเดือนแล้วอ่านยอดที่บันทึกไว้ (HR-BR-03)
 * ค่าตอบแทนที่ไม่มีสูตรอ่านตามรหัสรอบรายช่วง (extraKeyOf) ไม่ใช่รอบเดือน
 */
export function dailyPayLines(
  emp: Employee[],
  range: Cycle,
  time: Record<string, TimeRec>,
  extras: Record<string, Record<string, Extra>>,
  today: string,
  src: ComSource | undefined,
  round: DailyRound | undefined,
): PayLine[] {
  return emp
    .filter((e) => isDaily(e, range) && inRange(e, range))
    .map((e) => {
      const saved = round?.payClosedAt ? round.sum?.lines.find((x) => x.id === e.id) ?? null : null;
      return {
        e,
        c: saved ? calcOfLine(saved) : payIn(e, range, time, extras, today, src),
        days: saved ? saved.days : workedDaysIn(e, range, time, today),
        rate: saved ? saved.rate : dailyRateIn(e, range),
        snapped: Boolean(saved),
      };
    });
}

/** ยอดของรอบรายวันที่จะบันทึกตอนปิด — สูตรเดียวกับรอบเดือน */
export function dailySumOf(
  lines: PayLine[],
  range: Cycle,
  extras: Record<string, Record<string, Extra>>,
) {
  return sumOfGroup(lines, "day", range, extras);
}

function blankRound(c: Cycle): DailyRound {
  return {
    id: dailyRoundId(c), from: c.from, to: c.to,
    closedAt: "", closedBy: "", payClosedAt: "", payClosedBy: "", sum: null,
    slipsMadeAt: "", published: false, publishedAt: "", publishedBy: "", unpublished: [],
    views: {}, downloads: {},
  };
}

export function newDailyRound(c: Cycle, closedAt: string, closedBy: string): DailyRound {
  return { ...blankRound(c), closedAt, closedBy };
}

/** รอบรายวันที่เดินครบทุกขั้นแล้ว — ใช้กับข้อมูลตั้งต้นและข้อมูลเก่าที่ย้ายมา */
function doneRound(
  c: Cycle,
  emp: Employee[],
  time: Record<string, TimeRec>,
  at: { closed: string; paid: string; made: string; published: string; by: string },
): DailyRound {
  const lines = dailyPayLines(emp, c, time, {}, c.to, undefined, undefined);
  return {
    ...blankRound(c),
    closedAt: at.closed, closedBy: at.by,
    payClosedAt: at.paid, payClosedBy: at.by, sum: dailySumOf(lines, c, {}),
    slipsMadeAt: at.made, published: Boolean(at.published), publishedAt: at.published, publishedBy: at.published ? at.by : "",
  };
}

/** รอบเดือนที่ข้อมูลตั้งต้นแบ่งงานรายวันออกเป็นหลายรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export const HR_DAILY_SPLIT_MONTH = "2026-07";

/**
 * รอบรายวันตั้งต้นของรอบ ก.ค. 2569 — แบ่งงานรายวันทั้งรอบเป็นสามรอบจ่าย ปิดและส่งสลิปครบแล้ว
 * วันที่ของแต่ละขั้นอยู่หลังวันสุดท้ายของรอบนั้นเสมอ
 */
export function seedSplitRounds(emp: Employee[], time: Record<string, TimeRec>): DailyRound[] {
  const c = hrCycle(HR_DAILY_SPLIT_MONTH);
  /* เริ่มนับจากวันที่คนทดลองงานคนแรกเข้างานในรอบ — รอบที่ไม่มีใครเลยไม่ต้องมี */
  const starts = emp.filter((e) => isDaily(e, c) && inRange(e, c)).map((e) => (e.startedAt > c.from ? e.startedAt : c.from));
  if (!starts.length) return [];
  const start = starts.sort()[0];
  const total = daysApart(start, c.to) + 1;
  const size = Math.max(1, Math.ceil(total / 3));
  const parts: Cycle[] = [];
  for (let from = start; from <= c.to; from = addDay(from, size)) {
    const to = addDay(from, size - 1);
    parts.push({ from, to: to < c.to ? to : c.to });
  }
  return parts.map((p) =>
    doneRound(p, emp, time, {
      closed: addDay(p.to, 1),
      paid: addDay(p.to, 1),
      made: addDay(p.to, 2),
      published: addDay(p.to, 2),
      by: "E12",
    }),
  );
}

/**
 * ย้ายรอบรายวันแบบรายเดือนเดิม (dayClosed / daySum / dayPublished) มาเป็นรอบรายวันหนึ่งรอบต่อรอบเดือน
 * เฉพาะรอบเดือนที่ปิดรอบเวลาของกลุ่มรายวันแล้ว และมีพนักงานทดลองงานอยู่ในช่วงนั้น
 * รอบ ก.ค. 2569 ใช้รอบตั้งต้นที่แบ่งเป็นสามรอบแทน
 */
export function legacyDailyRound(
  p: Period,
  run: Period | undefined,
  slip: Slip | undefined,
  emp: Employee[],
  time: Record<string, TimeRec>,
): DailyRound | null {
  if (!p.dayClosed) return null;
  const c = hrCycle(p.month);
  if (!emp.some((e) => isDaily(e, c) && inRange(e, c))) return null;
  const r: DailyRound = { ...blankRound(c), closedAt: p.dayClosedAt, closedBy: p.dayClosedBy };
  if (!run?.dayClosed) return r;
  const lines = dailyPayLines(emp, c, time, {}, c.to, undefined, undefined);
  return {
    ...r,
    payClosedAt: run.dayClosedAt,
    payClosedBy: run.dayClosedBy,
    sum: run.daySum ?? dailySumOf(lines, c, {}),
    slipsMadeAt: slip?.dayMadeAt ?? "",
    published: slip?.dayPublished ?? false,
    publishedAt: slip?.dayPublishedAt ?? "",
    publishedBy: slip?.dayBy ?? "",
    unpublished: slip?.dayUnpublished ?? [],
  };
}

/*
 * ═══ ตัวช่วยของหน้าข้อมูลพนักงาน ═══════════════════════════════════
 * อยู่ตรงนี้เพราะทั้งการ์ดในรายการและกล่องประวัติใช้ชุดเดียวกัน
 * ตัวเลขทั้งหมดคิดจากปฏิทินล้วน ๆ ไม่มีคะแนนผลงานของใครอยู่ในนี้
 */

/** อายุงานแบบอ่านง่าย — ถึงวันนี้ หรือถึงวันพ้นสภาพถ้าออกไปแล้ว */
export function empYears(from: string, today: string, to?: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to ?? today}T00:00:00`);
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  if (m < 0) m = 0;
  const y = Math.floor(m / 12);
  const mm = m % 12;
  if (!y && !mm) return "ไม่ถึงเดือน";
  return `${y ? `${y} ปี ` : ""}${mm ? `${mm} เดือน` : ""}`.trim();
}

/** เหลือกี่วันถึงครบกำหนดทดลองงาน — ติดลบคือเลยกำหนดมาแล้ว */
export function probDaysLeft(startedAt: string, today: string) {
  return daysBetween(today, toIsoDate(probEnd(startedAt)));
}

/**
 * ผ่านช่วงทดลองงานมาแล้วกี่เปอร์เซ็นต์ของ "เวลา" — วันที่ผ่านมาเทียบระยะทดลองงาน
 * ไม่ใช่คะแนนผลงาน ระบบยังไม่ได้เก็บคะแนนผลงานของใครเลย
 */
export function probPct(startedAt: string, today: string) {
  const end = toIsoDate(probEnd(startedAt));
  const all = daysBetween(startedAt, end) + 1;
  const gone = daysBetween(startedAt, today) + 1;
  return Math.max(0, Math.min(100, Math.round((gone * 100) / all)));
}

/** สีไล่จากแดง → ส้ม → เขียวตามความคืบหน้าของเวลา */
export function probColor(pct: number) {
  const h = pct <= 50 ? 2 + (48 - 2) * (pct / 50) : 48 + (142 - 48) * ((pct - 50) / 50);
  return `hsl(${h.toFixed(1)},72%,46%)`;
}

/** บรรทัด "ครบกำหนดทดลองงาน" — วันที่ + เหลือ/เลยกี่วัน */
export function probLine(startedAt: string, today: string) {
  const left = probDaysLeft(startedAt, today);
  const day = thaiDate(toIsoDate(probEnd(startedAt)));
  if (left > 0) return `${day} · เหลืออีก ${left} วัน`;
  if (left === 0) return `${day} · ครบกำหนดวันนี้`;
  return `${day} · เลยกำหนดมาแล้ว ${Math.abs(left)} วัน`;
}
