"use client";

/*
 * สโตร์ของฝ่ายบุคคล — พนักงาน เวลาทำงาน รอบเงินเดือน และสลิป
 *
 * รวมไว้สโตร์เดียวเพราะสี่หน้านี้เดินต่อกันเป็นสาย
 * ปิดรอบเวลาทำงาน → คำนวณเงินเดือน → สร้างสลิป → เผยแพร่
 * ถ้าแยกสโตร์ ด่านกันข้ามขั้นจะต้องอ่านข้ามสโตร์กันไปมาทุกหน้า
 *
 * ยังไม่ต่อ backend ทุกอย่างอยู่ใน localStorage ของเครื่องที่เปิดอยู่
 */

import { useSyncExternalStore } from "react";
import {
  HR_EMP,
  HR_EXTRA,
  HR_PAYRUN,
  HR_PAYSLIP,
  HR_PERIOD,
  HR_TIME,
  HR_INTERN_LEAVE,
  HR_PAYAPPROVE,
  ROLE_EMPLOYEE,
  accountRoles,
  payApproveKey,
  fillPeriod,
  withLoginAccounts,
  fillSlip,
  hrCycle,
  type CycleSum,
  type PayGroup,
  type PosKey,
  type EmpType,
  type Employee,
  type Extra,
  type Period,
  type Slip,
  type TimeRec,
  type InternLeave,
  type PayApproval,
  closedIn,
} from "./hr-data";
import { isWorkday } from "./holidays";
import { bkkStamp, parseIsoDate, toIsoDate, todayIso } from "./format";
import { requirePasswordReset, restoreAccount, suspendAccount } from "./accounts";
import { createPersistedStore } from "./persisted-store";
import type { Role } from "./role";

export type HrState = {
  emp: Employee[];
  time: Record<string, TimeRec>;
  /** รอบเวลาทำงาน — ปิดแล้วตัวเลขเวลาถูกล็อก */
  periods: Period[];
  /** รอบคำนวณเงินเดือน — ปิดได้ต่อเมื่อรอบเวลาทำงานของเดือนนั้นปิดแล้ว */
  payruns: Period[];
  slips: Slip[];
  extras: Record<string, Record<string, Extra>>;
  /** ใบลาของนักศึกษาฝึกงาน — ฝ่ายบุคคลอนุมัติเอง */
  internLeave: InternLeave[];
  /** CEO อนุมัติยอดเงินเดือน แยกรอบและกลุ่ม (คีย์ month|group) */
  payApprove: Record<string, PayApproval>;
};

const INITIAL: HrState = {
  emp: withLoginAccounts(HR_EMP),
  time: HR_TIME,
  periods: HR_PERIOD,
  payruns: HR_PAYRUN,
  slips: HR_PAYSLIP,
  extras: HR_EXTRA,
  internLeave: HR_INTERN_LEAVE,
  payApprove: HR_PAYAPPROVE,
};

function isHrState(value: unknown): value is HrState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    Array.isArray(s.emp) &&
    Array.isArray(s.periods) &&
    Array.isArray(s.payruns) &&
    Array.isArray(s.slips) &&
    typeof s.time === "object" &&
    typeof s.extras === "object"
  );
}

/*
 * เครื่องที่เคยเปิดหน้าฝ่ายบุคคลแล้วมีรายชื่อพนักงานเก็บไว้ชุดเก่า
 * คนที่เพิ่มเข้าชุดตั้งต้นทีหลัง (E18–E20) จะไม่โผล่ ถ้าไม่เติมให้ตรงนี้
 * เติมเฉพาะรหัสที่ยังไม่มี คนเดิมที่ถูกแก้ไว้ (ย้ายประเภท ฯลฯ) ไม่ถูกทับ
 */
function addNewStaff(s: HrState): HrState {
  const have = new Set(s.emp.map((e) => e.id));
  const missing = HR_EMP.filter((e) => !have.has(e.id));
  const added = missing.length ? { ...s, emp: [...s.emp, ...missing] } : s;
  /* ERD เพิ่มตำแหน่ง sales — ผู้ขายที่ล็อกอินได้เคยถูกบันทึกเป็น bd ย้ายให้ตรง ไม่งั้นไม่ได้ค่าคอม */
  const seller = ROLE_EMPLOYEE.sales;
  const withStaff = {
    ...added,
    emp: added.emp.map((e) =>
      e.id === seller && e.pos === "bd"
        ? { ...e, pos: "sales", history: e.history.map((h) => (h.pos === "bd" ? { ...h, pos: "sales" } : h)) }
        : e,
    ),
  };
  /* ข้อมูลที่เก็บไว้ก่อนแยกกลุ่มปิดรอบ ยังไม่มีช่องของกลุ่มรายวัน เติมให้ครบก่อนใช้ */
  return {
    ...withStaff,
    emp: withLoginAccounts(withStaff.emp),
    periods: withStaff.periods.map(fillPeriod),
    payruns: withStaff.payruns.map(fillPeriod),
    slips: withStaff.slips.map(fillSlip),
    /* ข้อมูลที่เก็บไว้ก่อนมีใบลาฝึกงานและการอนุมัติของ CEO */
    internLeave: withStaff.internLeave ?? HR_INTERN_LEAVE,
    payApprove: withStaff.payApprove ?? HR_PAYAPPROVE,
  };
}

const store = createPersistedStore<HrState>("maz-erp.hr.v3", INITIAL, isHrState, addNewStaff);

export function useHr() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

/** อ่านนอก React — ทีมงานของ PM ซิงก์จากทะเบียนชุดเดียวกันนี้ (ERD HR-BR-19, ดู pm-store) */
export function hrSnapshot() {
  return store.get();
}

export const subscribeHr = store.subscribe;

export function resetHr() {
  store.reset();
}

/** ผู้ใช้ที่ล็อกอินเป็นฝ่ายบุคคล — ยังไม่มี auth จริงจึงตรึงไว้ที่คนเดียว */
export const HR_ME = "E12";

// ─── ข้อมูลพนักงาน ────────────────────────────────────────────────

/**
 * เปลี่ยนประเภทการจ้าง — ฝึกงาน / ทดลองงาน / พนักงานประจำ
 *
 * บันทึกเป็นประวัติแถวใหม่ ไม่ใช่แก้แถวเดิม เพราะวันที่มีผลคือวันที่ HR สั่ง
 * ไม่ใช่วันที่เริ่มงาน ถ้าทับแถวเดิมจะไม่เหลือหลักฐานว่าเคยเป็นอะไรมาก่อน
 *
 * เงินเดือนยกมาจากแถวล่าสุด เพราะการเปลี่ยนประเภทไม่ได้แปลว่าเงินเดือนเปลี่ยน
 * ถ้าจะปรับต้องเป็นคำสั่งแยกอีกใบ
 */
export function changeEmpType(id: string, type: EmpType, today: string, note: string) {
  store.update((s) => ({
    ...s,
    emp: s.emp.map((e) => {
      if (e.id !== id || e.type === type) return e;
      const last = e.history[e.history.length - 1];
      return {
        ...e,
        type,
        history: [...e.history, { at: today, pos: e.pos, salary: last.salary, note }],
      };
    }),
  }));
}

/**
 * บันทึกผ่านทดลองงาน (HR-06 S-4) — เปลี่ยนเป็นพนักงานประจำพร้อมเงินเดือนใหม่ตั้งแต่วันที่มีผล
 *
 * ต่างจาก changeEmpType ตรงที่ต้องให้ HR ระบุเงินเดือนเอง ห้ามยกตัวเลขเดิมมาใช้ต่อ
 * เพราะตัวเลขเดิมของคนทดลองงานเป็นฐานของอัตรารายวัน คนละความหมายกับเงินเดือนรายเดือน
 */
export function passProbation(id: string, at: string, salary: number) {
  store.update((s) => ({
    ...s,
    emp: s.emp.map((e) =>
      e.id !== id || e.type !== "probat"
        ? e
        : {
            ...e,
            type: "full" as const,
            history: [
              ...e.history,
              { at, pos: e.pos, salary, note: "ผ่านทดลองงาน เปลี่ยนเป็นจ่ายรายเดือน" },
            ],
          },
    ),
  }));
}

/** ข้อมูลที่แก้ทับได้ตรง ๆ — ไม่กระทบตัวเลขเงินเดือนย้อนหลัง จึงไม่ต้องเก็บเป็นประวัติ */
/**
 * เพิ่มพนักงานใหม่ (ตามต้นแบบ hr-employees.html)
 *
 * คนเข้าใหม่เริ่มที่ "ทดลองงาน" เสมอ HR เป็นคนเปลี่ยนเป็นพนักงานประจำเมื่อผ่านเกณฑ์ (BR ของ HR-06)
 * เงินเดือนที่กรอกลงเป็นประวัติแถวแรกพร้อมวันที่มีผล ไม่เขียนทับภายหลัง
 */
export function addEmployee(
  input: Omit<Employee, "id" | "status" | "history"> & { salary: number },
) {
  const { salary, ...rest } = input;
  /** คืนรหัสของคนที่เพิ่ม — หน้ารายชื่อใช้เลื่อนไปหาคนนั้น (ต้นแบบ scrollIntoView) */
  let added = "";
  store.update((s) => {
    /* รอบที่ปิดแล้วไม่รับคนเพิ่มไม่ว่ากรณีใด (ผู้ใช้กำหนด 23 ก.ย. 2569)
       คนเข้าใหม่ย้อนหลังจริงให้จ่ายเป็นรายการปรับปรุงในรอบถัดไป — หน้าจอกันไว้แล้ว กันซ้ำที่นี่อีกชั้น */
    const lock = lockedUntil(s);
    if (lock && rest.startedAt <= lock) return s;
    /* รหัสถัดจากเลขที่มากที่สุด ไม่ใช้จำนวนแถว เพราะพนักงานที่พ้นสภาพยังอยู่ในระบบ (ห้ามลบ) */
    const max = s.emp.reduce((n, e) => Math.max(n, Number(e.id.replace(/\D/g, "")) || 0), 0);
    const id = `E${String(max + 1).padStart(2, "0")}`;
    added = id;
    const emp: Employee = {
      ...rest,
      id,
      status: "active",
      history: [
        {
          at: rest.startedAt,
          pos: rest.pos,
          salary,
          /* ต้นแบบบันทึก "เริ่มงาน" อย่างเดียวทุกประเภท — ประเภทดูได้จากตัวพนักงานอยู่แล้ว */
          note: "เริ่มงาน",
        },
      ],
    };
    return { ...s, emp: [...s.emp, emp] };
  });
  return added;
}

/*
 * บัญชีผู้ใช้ของพนักงาน — สร้าง รีเซ็ตรหัส ระงับ และคืนสิทธิ์ (หน้า /hr/accounts)
 *
 * ⚠️ ยังไม่มี backend จึงเก็บแค่ชื่อผู้ใช้กับสถานะไว้ข้างพนักงาน ไม่ได้เก็บรหัสผ่าน
 * รหัสชั่วคราวที่หน้าจอแสดงมีไว้ให้ฝ่ายบุคคลส่งต่อเท่านั้น ของจริงต้องสร้างที่ระบบยืนยันตัวตน
 */
function editEmp(id: string, fn: (e: Employee) => Employee) {
  store.update((s) => ({ ...s, emp: s.emp.map((e) => (e.id === id ? fn(e) : e)) }));
}

/*
 * บัญชีเป็นของพนักงานรายคน (ERD: user_account ผูกกับ employee หนึ่งต่อหนึ่ง)
 * สถานะในหน้าเข้าสู่ระบบยังเก็บตามบทบาท (accounts.ts) เพราะตอนนี้หนึ่งบทบาทคือหนึ่งคนที่ล็อกอินได้ (ROLE_EMPLOYEE)
 * จึงแตะสถานะของบทบาทได้เฉพาะเมื่อพนักงานคนนี้คือคนที่ล็อกอินในบทบาทนั้นจริง
 * ไม่งั้นระงับพนักงานใหม่ที่ได้บทบาท "ทีมงาน" จะไประงับกมลชนก (E05) ที่ใช้บทบาทนั้นอยู่ไปด้วย
 */
function ownRoles(id: string, roles: Role[]) {
  return roles.filter((r) => ROLE_EMPLOYEE[r] === id);
}

export function createAccount(id: string, user: string, today: string, roles: Role[]) {
  editEmp(id, (e) =>
    e.account
      ? e
      : { ...e, account: { user, roles, status: "active", mustChange: true, createdAt: today } },
  );
  /* บทบาทที่เพิ่งได้บัญชี ต้องตั้งรหัสเองตอนเข้าระบบครั้งแรก */
  for (const r of ownRoles(id, roles)) requirePasswordReset(r, true);
}

/** ตั้งรหัสใหม่ให้พนักงาน — เปลี่ยนชื่อผู้ใช้ไปพร้อมกันได้ และบังคับตั้งรหัสเองตอนเข้าระบบ */
export function resetAccount(id: string, user: string, roles: Role[]) {
  editEmp(id, (e) =>
    e.account ? { ...e, account: { ...e.account, user, roles, mustChange: true } } : e,
  );
  for (const r of ownRoles(id, roles)) requirePasswordReset(r, true);
}

/** เปลี่ยนบทบาทที่บัญชีนี้เข้าใช้ได้ (คนควบสองตำแหน่งได้สองบทบาท) */
export function setAccountRoles(id: string, roles: Role[]) {
  editEmp(id, (e) => (e.account ? { ...e, account: { ...e.account, roles } } : e));
}

export function setAccountStatus(id: string, status: "active" | "suspended", at = "") {
  const emp = store.get().emp.find((e) => e.id === id);
  editEmp(id, (e) => (e.account ? { ...e, account: { ...e.account, status } } : e));
  /* ระงับบัญชีต้องมีผลที่หน้าเข้าสู่ระบบด้วย — ระงับทุกบทบาทที่บัญชีนี้ควบอยู่ */
  for (const r of ownRoles(id, accountRoles(emp?.account))) {
    if (status === "suspended") suspendAccount(r, `ฝ่ายบุคคลระงับบัญชีของ ${emp?.name ?? id}`, at);
    else restoreAccount(r);
  }
}

export type EmpProfile = Pick<
  Employee,
  "name" | "nick" | "sex" | "birth" | "edu" | "exp" | "phone" | "email" | "address" | "sos" | "boss" | "docs"
> & {
  /* ตำแหน่งควบ — แก้พร้อมข้อมูลพนักงานได้เลย ไม่ต้องลงประวัติเงินเดือนเหมือนการปรับตำแหน่งหลัก */
  posMore?: PosKey[];
};

/** by = ชื่อผู้แก้ (ฝ่ายบุคคล) · ประทับเวลาไว้ที่ตัวพนักงานเป็น "แก้ไขล่าสุด" */
export function updateEmpProfile(id: string, profile: EmpProfile, by: string) {
  store.update((s) => ({
    ...s,
    emp: s.emp.map((e) => (e.id === id ? { ...e, ...profile, edited: { by, at: bkkStamp() } } : e)),
  }));
}

/**
 * วันสุดท้ายของรอบเงินเดือนล่าสุดที่ปิดแล้ว — ปรับตำแหน่ง/เงินเดือนหรือพ้นสภาพ
 * ให้มีผลก่อนหรือเท่าวันนี้ไม่ได้ ไม่งั้นตัวเลขของรอบที่ปิดไปแล้วจะเปลี่ยนเอง
 */
export function lockedUntil(s: HrState) {
  return s.payruns
    .filter((p) => p.closed)
    .map((p) => hrCycle(p.month).to)
    .sort()
    .pop();
}

/** ปรับตำแหน่งหรือเงินเดือน — ต่อแถวประวัติใหม่ ไม่แก้แถวเดิม ด้วยเหตุผลเดียวกับ changeEmpType */
export function changePosition(id: string, at: string, pos: PosKey, salary: number, note: string) {
  store.update((s) => {
    const lock = lockedUntil(s);
    if (lock && at <= lock) return s;
    return {
      ...s,
      emp: s.emp.map((e) =>
        e.id !== id
          ? e
          : {
              ...e,
              pos,
              /* แทรกตามวันที่ ประวัติต้องเรียงเก่า→ใหม่เสมอ baseSalaryIn อาศัยลำดับนี้ */
              history: [...e.history, { at, pos, salary, note }].sort((a, b) =>
                a.at.localeCompare(b.at),
              ),
            },
      ),
    };
  });
}

/** พ้นสภาพ / กลับมาปฏิบัติงาน — ว่างทั้งคู่คือกลับมาเป็นพนักงานปัจจุบัน */
export function setEmpLeft(id: string, leftAt: string, leftWhy: string) {
  store.update((s) => {
    const lock = lockedUntil(s);
    if (leftAt && lock && leftAt <= lock) return s;
    return {
      ...s,
      emp: s.emp.map((e) => {
        if (e.id !== id) return e;
        if (!leftAt) {
          const rest = { ...e, status: "active" as const };
          delete rest.leftAt;
          delete rest.leftWhy;
          return rest;
        }
        return { ...e, status: "left" as const, leftAt, leftWhy };
      }),
    };
  });
  /* พ้นสภาพแล้วต้องเข้าระบบไม่ได้ — ระงับบัญชีให้ทันทีเมื่อวันพ้นสภาพมาถึงแล้ว
     ลาออกล่วงหน้ายังใช้ระบบได้จนถึงวันนั้น · ยกเลิกการพ้นสภาพไม่คืนสิทธิ์เอง ให้ฝ่ายบุคคลตัดสินที่หน้าบัญชีผู้ใช้ */
  const e = store.get().emp.find((x) => x.id === id);
  if (leftAt && leftAt <= todayIso() && e?.status === "left" && e.account?.status === "active") {
    setAccountStatus(id, "suspended", bkkStamp());
  }
}

// ─── เวลาทำงาน ────────────────────────────────────────────────────

function editTime(id: string, fn: (r: TimeRec) => TimeRec) {
  store.update((s) => {
    const cur = s.time[id] ?? { late: [], leave: [], ot: [], issues: [] };
    return { ...s, time: { ...s.time, [id]: fn(cur) } };
  });
}

/**
 * แก้จำนวนนาทีที่มาสาย
 *
 * เก็บค่าเดิมไว้ใน was ครั้งแรกที่แก้เท่านั้น แก้ซ้ำจะไม่ทับค่าเดิมทิ้ง
 * เพราะสิ่งที่ต้องตรวจย้อนได้คือ "เครื่องบันทึกมาเท่าไร" ไม่ใช่ค่าก่อนแก้รอบล่าสุด
 */
export function setLateMin(id: string, day: string, min: number) {
  editTime(id, (r) => ({
    ...r,
    late: r.late.map((x) =>
      x.d === day ? { ...x, min, was: x.was ?? x.min } : x,
    ),
  }));
}

export function setOtHours(id: string, day: string, hours: number) {
  editTime(id, (r) => ({
    ...r,
    ot: r.ot.map((x) => (x.d === day ? { ...x, h: hours, was: x.was ?? x.h } : x)),
  }));
}

/**
 * บันทึกเหตุผลของรายการที่ต้องตรวจ
 *
 * ระบุด้วยวันที่ ไม่ใช่ลำดับในอาเรย์ เพราะรายการที่แสดงถูกกรองตามรอบมาแล้ว
 * ลำดับที่เห็นบนจอกับลำดับจริงในข้อมูลจึงไม่ตรงกัน
 */
export function noteIssue(id: string, day: string, note: string) {
  editTime(id, (r) => ({
    ...r,
    issues: r.issues.map((x) => (x.d === day ? { ...x, note } : x)),
  }));
}

// ─── ใบลาของนักศึกษาฝึกงาน ───────────────────────────────────────

/** วันทำงานระหว่างสองวัน (รวมหัวท้าย) — วันหยุดไม่นับเป็นวันลา */
function workdaysBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = parseIsoDate(from); toIsoDate(d) <= to; d.setDate(d.getDate() + 1)) {
    const iso = toIsoDate(d);
    if (isWorkday(d, iso)) out.push(iso);
  }
  return out;
}

/**
 * ฝ่ายบุคคลอนุมัติหรือไม่อนุมัติใบลาของนักศึกษาฝึกงาน
 * อนุมัติแล้ววันลาลงเวลาทำงานของคนนั้นทันที สรุปเวลาทำงานจะเห็นเป็น "ลา" ไม่ใช่ขาดงาน
 */
export function decideInternLeave(id: string, ok: boolean, now: string, by = HR_ME) {
  store.update((s) => {
    const r = s.internLeave.find((x) => x.id === id && x.status === "pending");
    if (!r) return s;
    const internLeave = s.internLeave.map((x) =>
      x.id === id
        ? { ...x, status: ok ? ("approved" as const) : ("rejected" as const), by, decidedAt: now }
        : x,
    );
    if (!ok) return { ...s, internLeave };
    const cur = s.time[r.emp] ?? { late: [], leave: [], ot: [], issues: [] };
    const add = workdaysBetween(r.from, r.to)
      .filter((d) => !cur.leave.some((l) => l.d === d))
      .map((d) => ({ d, type: r.lt, span: "full" as const }));
    return {
      ...s,
      internLeave,
      time: { ...s.time, [r.emp]: { ...cur, leave: [...cur.leave, ...add] } },
    };
  });
}

// ─── CEO อนุมัติยอดเงินเดือน ─────────────────────────────────────

/** ฝ่ายบุคคลส่งยอดของกลุ่มหนึ่งให้ CEO อนุมัติ — ส่งซ้ำได้หลังถูกตีกลับ */
export function sendPayrollToCeo(
  month: string,
  group: PayGroup,
  snap: { people: number; net: number; ss: number },
  now: string,
  by = HR_ME,
) {
  store.update((s) => ({
    ...s,
    payApprove: {
      ...s.payApprove,
      [payApproveKey(month, group)]: { status: "waiting", ...snap, sentBy: by, sentAt: now },
    },
  }));
}

/**
 * CEO อนุมัติหรือตีกลับยอดที่ส่งมา — ตีกลับต้องมีเหตุผล ฝ่ายบุคคลจะเห็นบนป้ายสถานะ
 *
 * snap = ยอดที่ CEO เห็นบนจอตอนกด (อ่านจากผลคำนวณของรอบ ไม่ใช่ยอดที่เก็บไว้เอง)
 * บันทึกทับไว้ด้วย เพราะสิ่งที่อนุมัติคือเลขที่เห็น ถ้าเลขขยับทีหลังต้องรู้ได้ว่าขยับจากอะไร
 */
export function decidePayroll(
  month: string,
  group: PayGroup,
  ok: boolean,
  reason: string,
  now: string,
  by = "CEO",
  snap?: { people: number; net: number; ss: number },
) {
  store.update((s) => {
    const key = payApproveKey(month, group);
    const cur = s.payApprove[key];
    if (!cur || cur.status !== "waiting") return s;
    return {
      ...s,
      payApprove: {
        ...s.payApprove,
        [key]: {
          ...cur,
          ...(ok && snap ? snap : {}),
          status: ok ? "approved" : "rejected",
          by,
          at: now,
          reason: ok ? "" : reason,
        },
      },
    };
  });
}

/**
 * ยกเลิกการอนุมัติเอง เพราะยอดที่คิดได้ไม่ใช่ยอดที่ส่งไปแล้ว (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * CEO อนุมัติเลขหนึ่ง แล้วจ่ายอีกเลขหนึ่งไม่ได้ ตัวเลขขยับเมื่อไรการอนุมัติเดิมเป็นโมฆะทันที
 * กลับไปเป็นร่างพร้อมเหตุผล ไม่ใช่ "ตีกลับ" เพราะ CEO ไม่ได้เป็นคนสั่ง — ฝ่ายบุคคลต้องส่งใหม่
 * ยอดที่บันทึกไว้ล้างทิ้งด้วย ไม่งั้นรอบต่อไปจะเทียบกับเลขเก่าที่ไม่มีความหมายแล้ว
 */
export function voidPayApproval(month: string, group: PayGroup, why: string) {
  store.update((s) => {
    const key = payApproveKey(month, group);
    const cur = s.payApprove[key];
    if (!cur || (cur.status !== "waiting" && cur.status !== "approved")) return s;
    return { ...s, payApprove: { ...s.payApprove, [key]: { status: "draft", reason: why } } };
  });
}

// ─── ปิดรอบและเปิดรอบใหม่ ─────────────────────────────────────────

const BLANK_PERIOD: Omit<Period, "month"> = {
  closed: false,
  closedAt: "",
  closedBy: "",
  reopened: [],
  dayClosed: false,
  dayClosedAt: "",
  dayClosedBy: "",
  dayReopened: [],
  sum: null,
  daySum: null,
};

function editPeriod(list: Period[], month: string, fn: (p: Period) => Period) {
  const rows = list.some((p) => p.month === month)
    ? list
    : [...list, { month, ...BLANK_PERIOD }];
  return rows.map((p) => (p.month === month ? fn(p) : p));
}

/* ปิดรอบของกลุ่มเดียว อีกกลุ่มไม่ถูกแตะ — สองกลุ่มตรวจเสร็จคนละเวลากันได้ */
function closeIn(
  list: Period[],
  month: string,
  today: string,
  by: string,
  group: PayGroup,
  sum: CycleSum | null,
) {
  return editPeriod(list, month, (p) =>
    group === "day"
      ? { ...p, dayClosed: true, dayClosedAt: today, dayClosedBy: by, daySum: sum }
      : { ...p, closed: true, closedAt: today, closedBy: by, sum },
  );
}

function reopenIn(
  list: Period[],
  month: string,
  today: string,
  by: string,
  why: string,
  group: PayGroup,
) {
  return editPeriod(list, month, (p) =>
    group === "day"
      ? {
          ...p,
          dayClosed: false,
          dayClosedAt: "",
          dayClosedBy: "",
          dayReopened: [...p.dayReopened, { at: today, by, why }],
        }
      : {
          ...p,
          closed: false,
          closedAt: "",
          closedBy: "",
          reopened: [...p.reopened, { at: today, by, why }],
        },
  );
}

/** ปิดรอบเวลาทำงานของกลุ่มหนึ่ง — หน้าจอกันไว้แล้วว่าต้องไม่มีรายการค้างตรวจ */
export function closePeriod(month: string, today: string, group: PayGroup, by = HR_ME) {
  store.update((s) => ({ ...s, periods: closeIn(s.periods, month, today, by, group, null) }));
}

/** เปิดรอบเวลาทำงานใหม่ — ต้องมีเหตุผลเสมอ ระบบเก็บเป็นประวัติ */
export function reopenPeriod(
  month: string,
  today: string,
  why: string,
  group: PayGroup,
  by = HR_ME,
) {
  store.update((s) => ({ ...s, periods: reopenIn(s.periods, month, today, by, why, group) }));
}

/**
 * ปิดรอบเงินเดือนของกลุ่มหนึ่ง พร้อมเก็บยอดที่ปิดไว้ในตัวรอบ
 * เก็บเป็นตัวเลข ณ วันที่ปิด ไม่คำนวณใหม่ตอนเปิดดู เพราะเงินเดือนของคนเปลี่ยนได้ภายหลัง
 */
export function closePayrun(
  month: string,
  today: string,
  group: PayGroup,
  sum: CycleSum,
  by = HR_ME,
) {
  store.update((s) => {
    /*
     * ห้ามข้ามขั้น — ปิดรอบเงินเดือนได้ก็ต่อเมื่อปิดรอบเวลาทำงานของกลุ่มนั้นแล้ว
     * (ลำดับที่เจ้าของกำหนด: ปิดรอบเวลา → CEO อนุมัติ → ปิดเงินเดือน → ออกสลิป)
     * กันที่ชั้นสโตร์ ไม่ใช่เชื่อว่าหน้าจอซ่อนปุ่มให้แล้ว — เงินเดือนที่ปิดจากเวลาที่ยังแก้ได้
     * คือยอดที่เปลี่ยนได้ทีหลังทั้งที่สลิปออกไปแล้ว
     */
    const period = s.periods.find((x) => x.month === month);
    if (!closedIn(period, group)) return s;
    return { ...s, payruns: closeIn(s.payruns, month, today, by, group, sum) };
  });
}

export function reopenPayrun(
  month: string,
  today: string,
  why: string,
  group: PayGroup,
  by = HR_ME,
) {
  store.update((s) => ({ ...s, payruns: reopenIn(s.payruns, month, today, by, why, group) }));
}

/**
 * เปิดรอบเงินเดือนกลับ (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * รอบที่ปิดและ CEO อนุมัติแล้วแก้เงียบ ๆ ไม่ได้ (HR-BR-03) ถ้าจำเป็นต้องแก้จริง
 * ต้องเป็นการเปิดรอบกลับที่ทำสามอย่างพร้อมกันในครั้งเดียว ไม่ใช่ทยอยทำทีละอย่าง
 *   1. เปิดรอบกลับพร้อมเหตุผล ใคร และเมื่อไร (เก็บใน reopened ของรอบ)
 *   2. ยกเลิกการอนุมัติของ CEO — ยอดต้องถูกส่งให้อนุมัติใหม่
 *   3. เพิกถอนสลิปที่เผยแพร่ไปแล้ว และล้างวันที่สร้าง เพื่อบังคับให้สร้างใหม่จากตัวเลขชุดใหม่
 * ทำในการอัปเดตเดียว ไม่งั้นจะมีจังหวะที่รอบเปิดแล้วแต่สลิปเก่ายังเผยแพร่อยู่
 *
 * ยอดที่ปิดไว้ (sum) ไม่ลบทิ้ง — ประวัติรอบต้องยังอ่านได้ว่าตอนปิดครั้งก่อนปิดไปเท่าไร
 */
export function reopenPayrunWithReason(
  month: string,
  today: string,
  why: string,
  group: PayGroup,
  by = HR_ME,
) {
  const reason = why.trim();
  if (!reason) return false;
  const day = group === "day";
  store.update((s) => {
    const run = s.payruns.find((p) => p.month === month);
    if (!run || !(day ? run.dayClosed : run.closed)) return s;
    const key = payApproveKey(month, group);
    const ap = s.payApprove[key];
    return {
      ...s,
      payruns: reopenIn(s.payruns, month, today, by, reason, group),
      /* กลับไปเป็นร่าง ไม่ใช่ "ตีกลับ" เพราะ CEO ไม่ได้เป็นคนสั่ง — เก็บเหตุผลไว้ให้เห็นบนป้ายสถานะ */
      payApprove: ap
        ? { ...s.payApprove, [key]: { status: "draft" as const, reason: `เปิดรอบกลับ · ${reason}` } }
        : s.payApprove,
      slips: s.slips.map((sp) =>
        sp.month !== month
          ? sp
          : day
            ? {
                ...sp,
                dayMadeAt: "",
                dayPublished: false,
                dayPublishedAt: "",
                dayBy: "",
                dayUnpublished: sp.dayPublished
                  ? [...sp.dayUnpublished, { at: today, by, why: `เปิดรอบกลับ · ${reason}` }]
                  : sp.dayUnpublished,
              }
            : {
                ...sp,
                madeAt: "",
                published: false,
                publishedAt: "",
                by: "",
                unpublished: sp.published
                  ? [...sp.unpublished, { at: today, by, why: `เปิดรอบกลับ · ${reason}` }]
                  : sp.unpublished,
              },
      ),
    };
  });
  return true;
}

// ─── ค่าที่ไม่มีสูตร ──────────────────────────────────────────────

/** บันทึก Incentive ค่าตำแหน่ง และรายการปรับปรุงของคนหนึ่งในรอบหนึ่ง */
export function saveExtra(month: string, id: string, extra: Extra) {
  store.update((s) => ({
    ...s,
    extras: { ...s.extras, [month]: { ...(s.extras[month] ?? {}), [id]: extra } },
  }));
}

// ─── สลิปเงินเดือน ────────────────────────────────────────────────

function editSlip(month: string, fn: (sp: Slip) => Slip) {
  store.update((s) => {
    const has = s.slips.some((x) => x.month === month);
    const rows = has
      ? s.slips
      : [
          ...s.slips,
          {
            month,
            published: false,
            madeAt: "",
            publishedAt: "",
            by: "",
            dayMadeAt: "",
            dayPublished: false,
            dayPublishedAt: "",
            dayBy: "",
            dayUnpublished: [],
            views: {},
            downloads: {},
            unpublished: [],
          },
        ];
    return { ...s, slips: rows.map((x) => (x.month === month ? fn(x) : x)) };
  });
}

/** สร้างสลิปของกลุ่มหนึ่ง — ทำได้เมื่อรอบเงินเดือนของกลุ่มนั้นปิดแล้ว (กันไว้ที่หน้าจอ) */
export function makeSlips(month: string, today: string, group: PayGroup) {
  editSlip(month, (sp) =>
    group === "day" ? { ...sp, dayMadeAt: today } : { ...sp, madeAt: today },
  );
}

export function publishSlips(month: string, today: string, group: PayGroup, by = HR_ME) {
  /* พนักงานต้องรู้ทันทีที่เปิดให้ดู ไม่ต้องรอ HR เดินไปบอกทีละคน */
  editSlip(month, (sp) =>
    group === "day"
      ? { ...sp, dayPublished: true, dayPublishedAt: today, dayBy: by }
      : { ...sp, published: true, publishedAt: today, by },
  );
}

/** ยกเลิกการเผยแพร่ — ต้องมีเหตุผล และเก็บเป็นประวัติไว้ทุกครั้ง */
export function unpublishSlips(
  month: string,
  today: string,
  why: string,
  group: PayGroup,
  by = HR_ME,
) {
  editSlip(month, (sp) =>
    group === "day"
      ? {
          ...sp,
          dayPublished: false,
          dayPublishedAt: "",
          dayBy: "",
          dayUnpublished: [...sp.dayUnpublished, { at: today, by, why }],
        }
      : {
          ...sp,
          published: false,
          publishedAt: "",
          by: "",
          unpublished: [...sp.unpublished, { at: today, by, why }],
        },
  );
}

/**
 * นับครั้งที่เปิดดูและดาวน์โหลดสลิป
 *
 * นับเฉพาะรอบที่เผยแพร่แล้ว เพราะก่อนเผยแพร่คนที่เปิดคือ HR เองที่มาตรวจงาน
 * ไม่ใช่พนักงานเจ้าของสลิป การนับรวมกันจะทำให้ประวัติการเข้าถึงอ่านไม่ได้
 */
export function countView(month: string, id: string) {
  editSlip(month, (sp) =>
    sp.published ? { ...sp, views: { ...sp.views, [id]: (sp.views[id] ?? 0) + 1 } } : sp,
  );
}

export function countDownload(month: string, id: string) {
  editSlip(month, (sp) =>
    sp.published
      ? { ...sp, downloads: { ...sp.downloads, [id]: (sp.downloads[id] ?? 0) + 1 } }
      : sp,
  );
}
