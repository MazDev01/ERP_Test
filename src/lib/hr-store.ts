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
  addTimeSample,
  fillSeedLeaveHalf,
  type ClashOk,
  HR_INTERN_LEAVE,
  HR_PAYAPPROVE,
  HR_PAST_MONTHS,
  pastPayrun,
  pastSlip,
  pastApprovals,
  ROLE_EMPLOYEE,
  accountRoles,
  payApproveKey,
  fillPeriod,
  ensurePeriods,
  withLoginAccounts,
  fillSlip,
  normalizeExtra,
  hrCycle,
  payFromAfterPass,
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
  type PaySnap,
  payChanges,
  closedIn,
  HR_DAILY_SPLIT_MONTH,
  dailyRoundId,
  legacyDailyRound,
  newDailyRound,
  overlapRound,
  weekRangeFor,
  seedSplitRounds,
  type Cycle,
  type DailyRound,
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
  /**
   * การอนุมัติยอดเงินเดือนของ CEO (คีย์ รอบ|กลุ่ม) — ด่านก่อนปิดรอบเงินเดือน (กลับมาใช้ ผู้ใช้สั่ง 19 ต.ค. 2569)
   */
  payApprove: Record<string, PayApproval>;
  /** รอบจ่ายรายวันของพนักงานทดลองงาน — ช่วงวันที่ใดก็ได้ ไม่ผูกกับรอบเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  dailyRounds: DailyRound[];
  /** วันที่ลาแล้วแต่มีเช็คอินที่ HR ยืนยันแล้ว คีย์ "รหัสพนักงาน|วันที่" (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  clashOk: Record<string, ClashOk>;
};

/*
 * ย้ายกลุ่มทดลองงานจากรอบเดือนมาเป็นรอบรายวัน (ผู้ใช้สั่ง 6 ต.ค. 2569) — ทำครั้งเดียวตอนยังไม่มี dailyRounds
 * รอบ ก.ค. 2569 แบ่งเป็นสามรอบจ่ายที่ปิดครบแล้ว · รอบเดือนอื่นที่ปิดรอบเวลากลุ่มรายวันแล้วกลายเป็นหนึ่งรอบต่อรอบเดือน
 * การอนุมัติของ CEO ย้ายจากคีย์ "เดือน|day" ไปเป็น "จาก~ถึง|day" — คีย์เดิมที่ยังรอ/ถูกตีกลับลบทิ้ง
 * ไม่งั้น CEO จะเห็นยอดรายเดือนของกลุ่มที่ไม่ได้จ่ายรายเดือนแล้วค้างในคิว
 * ช่อง dayClosed/daySum/dayPublished ของรอบเดือนไม่ถูกแตะ (หน้าสลิปของพนักงานยังอ่านอยู่)
 */
function addDailyRounds(s: HrState): HrState {
  if (Array.isArray(s.dailyRounds)) return s;
  const rounds: DailyRound[] = [];
  const payApprove = { ...s.payApprove };
  for (const p of s.periods) {
    const legacyKey = payApproveKey(p.month, "day");
    const legacy = payApprove[legacyKey];
    if (p.month === HR_DAILY_SPLIT_MONTH && p.dayClosed) {
      for (const r of seedSplitRounds(s.emp, s.time)) {
        rounds.push(r);
        payApprove[payApproveKey(r.id, "day")] = { status: "approved", by: "CEO", at: `${r.payClosedAt} 09:10` };
      }
    } else {
      const r = legacyDailyRound(
        p,
        s.payruns.find((x) => x.month === p.month),
        s.slips.find((x) => x.month === p.month),
        s.emp,
        s.time,
      );
      if (r) {
        rounds.push(r);
        if (legacy) payApprove[payApproveKey(r.id, "day")] = legacy;
      }
    }
    if (legacy && (legacy.status === "waiting" || legacy.status === "rejected")) delete payApprove[legacyKey];
  }
  return { ...s, payApprove, dailyRounds: rounds.sort((a, b) => a.from.localeCompare(b.from)) };
}


const INITIAL: HrState = addDailyRounds({
  emp: withLoginAccounts(HR_EMP),
  time: HR_TIME,
  /* รอบเดือนเดินตามวันจริง — เครื่องที่ยังไม่เคยเก็บข้อมูลก็ได้รอบถึงเดือนปัจจุบัน (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  periods: ensurePeriods(HR_PERIOD, todayIso()),
  payruns: HR_PAYRUN,
  slips: HR_PAYSLIP,
  extras: HR_EXTRA,
  internLeave: HR_INTERN_LEAVE,
  payApprove: HR_PAYAPPROVE,
  dailyRounds: undefined as unknown as DailyRound[],
  clashOk: {},
});

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
  /* เติมรอบ ม.ค. 2569 ถึงรอบปัจจุบันที่ยังไม่มี รอบเดิมไม่ถูกแตะ (ผู้ใช้สั่ง 6 ต.ค. 2569) */
  const periods = ensurePeriods(withStaff.periods.map(fillPeriod), todayIso());
  return addPastRounds({
    ...withStaff,
    /* รอบรายวันเก่าที่ไม่มีช่องนับครั้งเปิดดู/ยกเลิกการส่ง เติมให้ครบ */
    dailyRounds: Array.isArray(withStaff.dailyRounds)
      ? withStaff.dailyRounds.map((r) => ({
          ...r,
          unpublished: r.unpublished ?? [],
          views: r.views ?? {},
          downloads: r.downloads ?? {},
        }))
      : withStaff.dailyRounds,
    /* บัญชีรับเงินเดือน — ข้อมูลเก่าไม่มี เติมเป็นค่าว่าง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    emp: withLoginAccounts(withStaff.emp).map((e) => ({ ...e, bankName: e.bankName ?? "", bankNo: e.bankNo ?? "" })),
    /* ค่าตอบแทนรุ่นเก่า (Incentive/ค่าตำแหน่ง/รายการปรับปรุง) → รายการตามแบบสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    extras: Object.fromEntries(
      Object.entries(withStaff.extras ?? {}).map(([k, m]) => [
        k,
        Object.fromEntries(Object.entries(m ?? {}).map(([id, x]) => [id, normalizeExtra(x)])),
      ]),
    ),
    periods,
    payruns: withStaff.payruns.map(fillPeriod),
    slips: withStaff.slips.map(fillSlip),
    /* ข้อมูลที่เก็บไว้ก่อนมีใบลาฝึกงานและการอนุมัติของ CEO
       ใบตั้งต้นที่เพิ่มทีหลัง (ตัวอย่าง ต.ค. 2569) เติมเฉพาะเลขที่ที่ยังไม่มี — ใบที่ตัดสินไปแล้วไม่ถูกทับ */
    internLeave: withStaff.internLeave
      ? [
          ...withStaff.internLeave,
          ...HR_INTERN_LEAVE.filter((r) => !withStaff.internLeave.some((x) => x.id === r.id)),
        ]
      : HR_INTERN_LEAVE,
    /* แถวเวลาทำงานตัวอย่างรอบ ต.ค. 2569 — เติมเฉพาะวันที่ที่ยังไม่มี */
    /* ลาครึ่งวันตั้งต้นที่ยังไม่มีช่วงเช้า/บ่าย เติมให้เฉพาะแถวที่ตรงกับข้อมูลตั้งต้น (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    time: fillSeedLeaveHalf(addTimeSample(withStaff.time)),
    /* ข้อมูลที่เก็บไว้ก่อนมีการยืนยันวันลาที่มีเช็คอิน (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    clashOk: withStaff.clashOk ?? {},
    payApprove: withStaff.payApprove ?? HR_PAYAPPROVE,
  });
}

/*
 * รอบ ม.ค.–มิ.ย. 2569 ต้องเดินครบทุกขั้นแบบรอบ ก.ค. (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ปิดรอบเวลา → คำนวณ → ปิดรอบเงินเดือน → เผยแพร่สลิป ทั้งสองกลุ่ม (ไม่มีขั้น CEO แล้ว ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ข้อมูลที่เก็บไว้ก่อนหน้านี้ไม่มีรอบเงินเดือน/สลิป/การอนุมัติของเดือนเหล่านี้ เติมให้เฉพาะที่ยังไม่มี ของเดิมไม่ถูกทับ
 * เติมเฉพาะเดือนที่รอบเวลาทั้งสองกลุ่มปิดแล้ว — กันรอบเงินเดือนปิดทั้งที่รอบเวลายังเปิดอยู่
 */
function addPastRounds(s: HrState): HrState {
  const months = HR_PAST_MONTHS.filter((m) => {
    const p = s.periods.find((x) => x.month === m);
    return closedIn(p, "month") && closedIn(p, "day");
  });
  const runHave = new Set(s.payruns.map((p) => p.month));
  const slipHave = new Set(s.slips.map((sp) => sp.month));
  const runAdd = months.filter((m) => !runHave.has(m)).map(pastPayrun);
  const slipAdd = months.filter((m) => !slipHave.has(m)).map(pastSlip);
  const apAdd = Object.fromEntries(
    months.flatMap((m) => Object.entries(pastApprovals(m))).filter(([k]) => !(k in s.payApprove)),
  );
  if (!runAdd.length && !slipAdd.length && !Object.keys(apAdd).length) return s;
  return {
    ...s,
    payruns: [...s.payruns, ...runAdd].sort((a, b) => a.month.localeCompare(b.month)),
    slips: [...s.slips, ...slipAdd].sort((a, b) => a.month.localeCompare(b.month)),
    payApprove: { ...apAdd, ...s.payApprove },
  };
}

/* ไม่ล้างสถานะรอ CEO / ตีกลับทิ้งแล้ว — ขั้น CEO อนุมัติกลับมา (ผู้ใช้สั่ง 19 ต.ค. 2569)
   เครื่องที่ผ่าน dropPayGate ไปแล้วเหลือแต่ที่อนุมัติแล้ว รอบที่ยังเปิดอยู่จึงเริ่มเป็นร่าง HR ส่งใหม่ได้เลย */
const store = createPersistedStore<HrState>("maz-erp.hr.v3", INITIAL, isHrState, (s) =>
  addDailyRounds(addNewStaff(s)),
);

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
  /*
   * ผ่านกลางรอบ (ผู้ใช้สั่ง 13 ต.ค. 2569) — ประเภทเป็นพนักงานประจำตั้งแต่วันที่มีผล
   * แต่ค่าจ้างยังคิดแบบทดลองงานจนจบรอบที่วันนั้นตกอยู่ เงินเดือนเริ่มรอบถัดไป (payFrom)
   * แถวเงินเดือนใหม่จึงลงวันที่ payFrom — baseSalaryIn ของรอบที่ยังจ่ายรายวันได้อัตราเดิม
   */
  const payFrom = payFromAfterPass(at);
  store.update((s) => ({
    ...s,
    emp: s.emp.map((e) =>
      e.id !== id || e.type !== "probat"
        ? e
        : {
            ...e,
            type: "full" as const,
            probPass: { at, payFrom },
            history: [
              ...e.history,
              {
                at: payFrom,
                pos: e.pos,
                salary,
                note: at === payFrom ? "ผ่านทดลองงาน เปลี่ยนเป็นจ่ายรายเดือน" : "ผ่านทดลองงาน เริ่มจ่ายรายเดือนรอบนี้",
              },
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
  "name" | "nick" | "sex" | "birth" | "edu" | "exp" | "phone" | "email" | "address" | "sos" | "boss" | "docs" | "bankName" | "bankNo"
> & {
  /* ตำแหน่งควบ — แก้พร้อมข้อมูลพนักงานได้เลย ไม่ต้องลงประวัติเงินเดือนเหมือนการปรับตำแหน่งหลัก */
  posMore?: PosKey[];
};

/** by = ชื่อผู้แก้ (ฝ่ายบุคคล) · ประทับเวลาไว้ที่ตัวพนักงานเป็น "แก้ไขล่าสุด" */
/** ลบพนักงานออกจากทะเบียน (ผู้ใช้สั่ง 13 ต.ค. 2569) — ยืนยันก่อนลบที่หน้าพนักงาน */
export function deleteEmployee(id: string) {
  store.update((s) => ({ ...s, emp: s.emp.filter((e) => e.id !== id) }));
}

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
  /* พ้นสภาพแล้วระงับบัญชีให้ทันที · ยกเลิกพ้นสภาพแล้วเปิดบัญชีคืน — HR ไม่ต้องไปทำซ้ำที่หน้าบัญชี (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  if (leftAt && e?.status === "left" && e.account?.status === "active") {
    setAccountStatus(id, "suspended", bkkStamp());
  } else if (!leftAt && e?.status === "active" && e.account?.status === "suspended") {
    setAccountStatus(id, "active");
  }
}

// ─── เวลาทำงาน ────────────────────────────────────────────────────

/**
 * บันทึกเวลาเข้า-ออกงานที่ฝ่ายบุคคลแก้ทั้งรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * วันที่มีรายการผิดปกติค้างอยู่และกรอกเวลาครบ ถือว่าตรวจแล้ว — ปิดรอบได้
 */
export function saveDayFixes(id: string, rows: { d: string; in: string; out: string }[]) {
  editTime(id, (r) => {
    const fix = [...(r.fix ?? []).filter((x) => !rows.some((y) => y.d === x.d)), ...rows].sort((a, b) =>
      a.d.localeCompare(b.d),
    );
    const issues = r.issues.map((x) => {
      const row = rows.find((y) => y.d === x.d);
      if (x.note || !row || !row.in || !row.out) return x;
      return { ...x, in: row.in, out: row.out, note: `เข้า ${row.in} น. · ออก ${row.out} น.` };
    });
    return { ...r, fix, issues };
  });
}

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
/**
 * เคลียร์วันที่ผิดปกติ — ฝ่ายบุคคลแก้ได้แค่เวลาเข้า-ออกงาน กรณีพนักงานลืมกด (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * note เก็บข้อความสรุป "เข้า 08:30 น. · ออก 17:30 น. · หมายเหตุ" — มีค่าแปลว่าเคลียร์แล้ว
 */
export function noteIssue(id: string, day: string, note: string, time: { in?: string; out?: string } = {}) {
  const text = [time.in && `เข้า ${time.in} น.`, time.out && `ออก ${time.out} น.`, note]
    .filter(Boolean)
    .join(" · ");
  editTime(id, (r) => ({
    ...r,
    issues: r.issues.map((x) => (x.d === day ? { ...x, ...time, note: text } : x)),
  }));
}

/**
 * HR ยืนยันวันที่ลาแล้วแต่มีเช็คอิน (ผู้ใช้สั่ง 15 ต.ค. 2569) — เก็บผู้ยืนยัน เวลา และหมายเหตุ
 * ยืนยันแล้วไม่นับเป็นรายการที่ต้องตรวจ · ไม่แตะเวลาเข้า-ออกและใบลา
 */
export function confirmClash(id: string, day: string, note: string, by = HR_ME) {
  store.update((s) => ({
    ...s,
    clashOk: { ...(s.clashOk ?? {}), [`${id}|${day}`]: { by, at: bkkStamp(), note: note.trim() } },
  }));
}

/* ไม่มีการยกเลิกการยืนยัน — ยืนยันแล้วถือเป็นที่สิ้นสุด ข้อมูลส่งต่อถึง CEO (ผู้ใช้สั่ง 15 ต.ค. 2569) */

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

// ─── CEO อนุมัติยอดเงินเดือน — กลับมาใช้ (ผู้ใช้สั่ง 19 ต.ค. 2569 · ยกเลิกคำสั่ง 13–14 ต.ค.) ─────────
// HR คำนวณ → ส่ง CEO → CEO อนุมัติหรือไม่อนุมัติพร้อมเหตุผล → ไม่อนุมัติ HR แก้แล้วส่งใหม่
// → อนุมัติแล้ว HR ปิดรอบเงินเดือน แล้วสร้างและเผยแพร่สลิป
// แก้ยอดหลังส่ง (รอ CEO / อนุมัติแล้ว / ไม่อนุมัติ) = ระบบส่งใหม่ให้เอง "แก้ไขแล้ว รออนุมัติใหม่" (ผู้ใช้สั่ง 19 ต.ค. 2569)
//   แบบเดียวกับงานที่ PM ตรวจ · นับครั้งที่ส่งใหม่ (ver) และเก็บสิ่งที่เปลี่ยนรายคนไว้ให้ CEO ดู (usePayrollAutoResubmit)
// คีย์ "รอบ|กลุ่ม" — รอบเดือน "yyyy-mm|month" · รอบรายสัปดาห์ของทดลองงาน "จาก~ถึง|day"

/** ยอดที่ส่ง — รวมทั้งกลุ่ม + ยอดรายคน (lines) และชื่อรายคนไว้ทำรายการสิ่งที่เปลี่ยน */
export type PaySend = { people: number; net: number; ss: number; lines?: PaySnap; names?: Record<string, string> };

/** ยอดส่งชุดใหม่ทับของเดิม — เคยส่งแล้วนับเป็น "ส่งใหม่ครั้งที่ n" พร้อมสิ่งที่เปลี่ยนจากครั้งก่อน */
function resend(cur: PayApproval | undefined, snap: PaySend, now: string, by: string, auto: boolean): PayApproval {
  const { names, ...nums } = snap;
  const sent = Boolean(cur && (cur.sentAt || cur.status !== "draft" || cur.reason));
  if (!sent || !cur) return { status: "waiting", ...nums, sentBy: by, sentAt: now };
  return {
    status: "waiting",
    ...nums,
    sentBy: by,
    sentAt: now,
    ver: (cur.ver ?? 0) + 1,
    auto,
    prev: cur.status,
    prevNet: cur.net,
    changes: cur.lines && snap.lines ? payChanges(cur.lines, snap.lines, names) : [],
    /* ร่างที่ถูกยกเลิกการอนุมัติแบบเก่า — ไม่มียอดรายคนให้เทียบ เก็บเหตุผลเดิม (ยอดเก่า → ใหม่) ไว้ให้ CEO อ่าน */
    ...(cur.status === "draft" && cur.reason ? { reason: cur.reason } : {}),
  };
}

/** ฝ่ายบุคคลส่งยอดของกลุ่มหนึ่งให้ CEO อนุมัติ — กด "ส่งใหม่" ได้หลังถูกตีกลับ (นับเป็นการส่งใหม่ครั้งถัดไป) */
export function sendPayrollToCeo(month: string, group: PayGroup, snap: PaySend, now: string, by = HR_ME) {
  store.update((s) => {
    const key = payApproveKey(month, group);
    if (isPayClosed(s, month, group)) return s;
    return { ...s, payApprove: { ...s.payApprove, [key]: resend(s.payApprove[key], snap, now, by, false) } };
  });
}

/**
 * CEO อนุมัติหรือไม่อนุมัติยอดที่ส่งมา — ไม่อนุมัติต้องมีเหตุผล ฝ่ายบุคคลเห็นบนป้ายสถานะและกระดิ่ง
 * snap = ยอดที่ CEO เห็นบนจอตอนกด (อ่านจากผลคำนวณของรอบ) บันทึกทับไว้ เพราะสิ่งที่อนุมัติคือเลขที่เห็น
 */
export function decidePayroll(
  month: string,
  group: PayGroup,
  ok: boolean,
  reason: string,
  now: string,
  by = "CEO",
  snap?: PaySend,
) {
  store.update((s) => {
    const key = payApproveKey(month, group);
    const cur = s.payApprove[key];
    if (!cur || cur.status !== "waiting") return s;
    const nums = snap ? { people: snap.people, net: snap.net, ss: snap.ss, ...(snap.lines ? { lines: snap.lines } : {}) } : {};
    return {
      ...s,
      payApprove: {
        ...s.payApprove,
        [key]: {
          ...cur,
          ...(ok ? nums : {}),
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
 * HR แก้ยอดหลังส่ง → ส่งให้ CEO อนุมัติใหม่เอง ไม่ต้องกดส่งซ้ำ (ผู้ใช้สั่ง 19 ต.ค. 2569 · แทนการยกเลิกการอนุมัติกลับเป็นร่าง)
 * ใช้กับรอบที่รอ CEO / อนุมัติแล้ว / ไม่อนุมัติ และรอบที่เคยถูกยกเลิกการอนุมัติแบบเก่า (ร่างที่มีเหตุผล)
 * รอบที่ปิดเงินเดือนแล้วไม่ถูกแตะ (ยอดปิดไว้แล้ว)
 */
export function resubmitPayApproval(month: string, group: PayGroup, snap: PaySend, now: string) {
  store.update((s) => {
    const key = payApproveKey(month, group);
    const cur = s.payApprove[key];
    if (!cur) return s;
    if (cur.status === "draft" && !cur.reason) return s;
    if (isPayClosed(s, month, group)) return s;
    /* ตัวเฝ้าหลายตัวบนหน้าเดียวกันเรียกซ้ำได้ — ยอดชุดนี้ส่งไปแล้วไม่นับเป็นการส่งใหม่อีกครั้ง */
    if (cur.status !== "draft" && cur.lines && snap.lines && payChanges(cur.lines, snap.lines).length === 0) return s;
    return {
      ...s,
      payApprove: { ...s.payApprove, [key]: resend(cur, snap, now, cur.sentBy || HR_ME, true) },
    };
  });
}

/** รอบเงินเดือนของกลุ่มนี้ปิดแล้วหรือยัง — รอบเดือนดู payruns · รอบทดลองงานดู payClosedAt ของรอบ */
function isPayClosed(s: HrState, key: string, group: PayGroup) {
  if (group === "day" && key.includes("~")) return Boolean(s.dailyRounds.find((r) => r.id === key)?.payClosedAt);
  return closedIn(s.payruns.find((p) => p.month === key), group);
}

/** CEO อนุมัติยอดของรอบนี้แล้วหรือยัง — ด่านปิดรอบเงินเดือนที่ชั้นสโตร์ */
function payApproved(s: HrState, key: string, group: PayGroup) {
  return s.payApprove[payApproveKey(key, group)]?.status === "approved";
}

// ─── ปิดรอบ ─────────────────────────────────────────

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

/** ปิดรอบเวลาทำงานของกลุ่มหนึ่ง — หน้าจอกันไว้แล้วว่าต้องไม่มีรายการค้างตรวจ */
export function closePeriod(month: string, today: string, group: PayGroup, by = HR_ME) {
  store.update((s) => ({ ...s, periods: closeIn(s.periods, month, today, by, group, null) }));
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
): boolean {
  let done = false;
  store.update((s) => {
    /*
     * ห้ามข้ามขั้น — ปิดรอบเงินเดือนได้ก็ต่อเมื่อปิดรอบเวลาทำงานของกลุ่มนั้นแล้ว
     * (ลำดับ: ปิดรอบเวลา → คำนวณและปิดรอบเงินเดือน → ออกสลิป/เผยแพร่ · ไม่มีขั้น CEO แล้ว ผู้ใช้สั่ง 13 ต.ค. 2569)
     * กันที่ชั้นสโตร์ ไม่ใช่เชื่อว่าหน้าจอซ่อนปุ่มให้แล้ว — เงินเดือนที่ปิดจากเวลาที่ยังแก้ได้
     * คือยอดที่เปลี่ยนได้ทีหลังทั้งที่สลิปออกไปแล้ว
     */
    const period = s.periods.find((x) => x.month === month);
    if (!closedIn(period, group)) return s;
    /* ต้องให้ CEO อนุมัติยอดก่อน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
    if (!payApproved(s, month, group)) return s;
    done = true;
    return { ...s, payruns: closeIn(s.payruns, month, today, by, group, sum) };
  });
  /* ปิดไม่สำเร็จ (ยังไม่อนุมัติ) — ผู้เรียกต้องไม่บันทึกใบเบิกว่าจ่ายแล้ว (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  return done;
}

// ─── รอบจ่ายรายวันของพนักงานทดลองงาน (ผู้ใช้สั่ง 6 ต.ค. 2569) ─────────

function editRound(id: string, fn: (r: DailyRound) => DailyRound) {
  store.update((s) => ({ ...s, dailyRounds: s.dailyRounds.map((r) => (r.id === id ? fn(r) : r)) }));
}

/**
 * ปิดรอบเวลาทำงานของช่วงวันหนึ่ง — รอบรายวันเกิดขึ้นตรงนี้
 * กันที่สโตร์อีกชั้น: ช่วงเดียวกันปิดซ้ำไม่ได้ และช่วงที่ทับรอบเดิมไม่ได้ (วันเดียวกันจ่ายสองครั้ง)
 */
export function closeDailyTime(c: Cycle, today: string, by = HR_ME) {
  store.update((s) => {
    if (s.dailyRounds.some((r) => r.id === dailyRoundId(c)) || overlapRound(s.dailyRounds, c)) return s;
    /* รอบใหม่ต้องเป็นรอบรายสัปดาห์ (จันทร์–อาทิตย์ ตัดวันที่รอบรายวันเก่าจ่ายแล้ว) (ผู้ใช้สั่ง 19 ต.ค. 2569) */
    const w = weekRangeFor(c.from, s.dailyRounds);
    if (w.from !== c.from || w.to !== c.to) return s;
    const dailyRounds = [...s.dailyRounds, newDailyRound(c, today, by)].sort((a, b) => a.from.localeCompare(b.from));
    return { ...s, dailyRounds };
  });
}

/** ปิดรอบเงินเดือนของรอบรายวัน พร้อมยอดที่บันทึกไว้ — ต้องปิดรอบเวลาแล้ว (มีรอบอยู่) */
export function closeDailyPay(id: string, today: string, sum: CycleSum, by = HR_ME): boolean {
  /* ต้องให้ CEO อนุมัติยอดของรอบรายสัปดาห์ก่อน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  if (!payApproved(store.get(), id, "day")) return false;
  const r = store.get().dailyRounds.find((x) => x.id === id);
  if (!r?.closedAt || r.payClosedAt) return false;
  editRound(id, (r) => (r.closedAt && !r.payClosedAt ? { ...r, payClosedAt: today, payClosedBy: by, sum } : r));
  return true;
}

export function makeDailySlips(id: string, today: string) {
  editRound(id, (r) => (r.payClosedAt && !r.slipsMadeAt ? { ...r, slipsMadeAt: today } : r));
}

export function publishDailySlips(id: string, today: string, by = HR_ME) {
  editRound(id, (r) => (r.payClosedAt ? { ...r, published: true, publishedAt: today, publishedBy: by } : r));
}

export function unpublishDailySlips(id: string, today: string, why: string, by = HR_ME) {
  editRound(id, (r) => ({
    ...r,
    published: false,
    publishedAt: "",
    publishedBy: "",
    unpublished: [...r.unpublished, { at: today, by, why }],
  }));
}

/** นับครั้งเปิดดู/ดาวน์โหลดสลิปของรอบรายวัน — นับเฉพาะรอบที่ส่งแล้ว เหตุผลเดียวกับ countView */
export function countDailyView(id: string, emp: string) {
  editRound(id, (r) => (r.published ? { ...r, views: { ...r.views, [emp]: (r.views[emp] ?? 0) + 1 } } : r));
}

export function countDailyDownload(id: string, emp: string) {
  editRound(id, (r) =>
    r.published ? { ...r, downloads: { ...r.downloads, [emp]: (r.downloads[emp] ?? 0) + 1 } } : r,
  );
}

/*
 * ปิดแล้วปิดเลย — ไม่มีฟังก์ชันย้อนสถานะรอบ (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ช่อง reopened / dayReopened ของรอบยังเก็บไว้เพื่อให้ข้อมูลเก่าอ่านได้ หน้าจอไม่อ่านแล้ว
 */

// ─── ค่าที่ไม่มีสูตร ──────────────────────────────────────────────

/** บันทึกรายการเงินได้/รายการหักที่กรอกเองของคนหนึ่งในรอบหนึ่ง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
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
