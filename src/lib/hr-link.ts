"use client";

/*
 * สะพานเชื่อมฝ่ายบุคคลกับบทบาทอื่น
 *
 * ปัญหาที่ไฟล์นี้แก้: ระบบมีคนอยู่สองชุดที่ยังไม่ใช่ชุดเดียวกัน
 *   1. คนที่ล็อกอินได้ 5 บทบาท (USERS ใน mock-data.ts) — มีใบลา ใบโอที ใบเบิกของตัวเอง
 *   2. ทะเบียนพนักงาน 17 คนของฝ่ายบุคคล (HR_EMP ใน hr-data.ts)
 *
 * ตราบใดที่ยังไม่มีตารางพนักงานจริง คนสองชุดนี้ผูกกันด้วยตารางเดียวข้างล่าง
 * ใครที่ผูกไว้แล้ว **เวลาทำงานของเขาจะอ่านจากใบลาและใบโอทีจริงในระบบ**
 * ไม่ใช่จากข้อมูลตั้งต้นของฝ่ายบุคคล เพราะใบที่พนักงานยื่นเองคือของจริงกว่า
 *
 * ทั้งห้าบทบาทผูกครบแล้ว — ฝ่ายขาย PM และบัญชีถูกเพิ่มเข้าทะเบียนเป็น E18–E20
 * ส่วนทีมงานใช้ E05 ที่มีอยู่ในทะเบียนจริงอยู่แล้ว ไม่ได้สร้างคนซ้ำ
 * TODO: ⚠️ ข้อมูลส่วนตัวและเงินเดือนของสามคนแรกเป็นค่าสมมติ ดูหมายเหตุใน hr-data.ts
 */

import { useCallback, useEffect, useMemo } from "react";
import { dayKey, recordsOfDay, toSessions, type PunchRecord } from "./attendance";
import { useAllPunches } from "./attendance-store";
import { companySchedule, lateMinutes, minutesOfDay, scheduleFor, type DaySchedule } from "./work-schedule";
import {
  ROLE_EMPLOYEE,
  HR_REIMB,
  DEMO_CHECKIN,
  DEMO_LEAVE_TODAY,
  accountRoles,
  closedIn,
  hrCycle,
  linesOfGroup,
  payLines,
  sumOfGroup,
  dailyPayLines,
  dailyRoundRange,
  dailySumOf,
  isDailyRoundKey,
  leaveDatesOf,
  payDrifted,
  payNamesOf,
  paySnapOf,
  type ComSource,
  type Cycle,
  type LeaveKind,
  type PayGroup,
  type TimeRec,
} from "./hr-data";
import { useCrm } from "./crm-store";
import { claimTotal, fuelTotal } from "./expense-data";
import { useAllClaims } from "./expense-store";
import { useAcc } from "./acc-store";
import { resubmitPayApproval, useHr } from "./hr-store";
import { usePm } from "./pm-store";
import { useAllLeave } from "./leave-store";
import { useEmpRequests, type EmpRequest } from "./emp-requests";
import { otKindOf, paidHours } from "./ot-data";
import { useAllOt } from "./ot-store";
import { bkkOf, bkkStamp, pad2, thaiMonth, todayIso } from "./format";
import { isWorkday } from "./holidays";
import { useRole, type Role } from "./role";
import { mineItems, PS_REQUEST_ITEM, type MineKind, type NavItem } from "./nav";
import { psHasRequestFor } from "./presales-work";
import { LEAVE_DAY_HOURS, leaveHoursOf, type LeaveRecord } from "./leave-data";

/* บทบาทที่ล็อกอินได้ → รหัสในทะเบียนพนักงาน (ย้ายไปอยู่ hr-data เพื่อให้สโตร์ใช้ได้โดยไม่วนกัน) */
export { ROLE_EMPLOYEE };

/** รหัสพนักงาน → บทบาท (ใช้ตอนอยากรู้ว่าคนนี้ล็อกอินเป็นอะไร) */
export const EMPLOYEE_ROLE: Record<string, Role> = Object.fromEntries(
  Object.entries(ROLE_EMPLOYEE).map(([role, id]) => [id, role as Role]),
) as Record<string, Role>;

/*
 * ประเภทการลาในใบลามี 5 แบบ แต่ฝ่ายบุคคลสรุปเหลือ 3 กลุ่ม
 * ลาคลอดกับลาไม่รับค่าจ้างจัดเป็น "ลากิจ" ไปก่อน เพราะยังไม่มีช่องของตัวเอง
 *
 * TODO: ⚠️ ลาคลอดกับลาไม่รับค่าจ้างมีผลต่อการจ่ายเงินต่างจากลากิจ
 * ต้องแยกกลุ่มออกมาเมื่อได้ข้อสรุปเรื่องเงื่อนไขการหักเงิน
 */
const LEAVE_GROUP: Record<string, LeaveKind> = {
  ลาพักร้อน: "vacation",
  ลาป่วย: "sick",
  ลากิจ: "personal",
  ลาคลอด: "personal",
  ลาไม่รับค่าจ้าง: "personal",
};

/*
 * สายมาสายจากการตอกบัตรจริง
 *
 * วันที่พนักงานตอกบัตรเองถือว่าของจริงกว่าทะเบียนเสมอ จึงเขียนทับวันนั้น
 * แต่ **ไม่ล้างวันอื่นทิ้ง** เพราะทะเบียนมีวันก่อนเริ่มใช้ระบบอยู่ด้วย
 * ถ้าใช้วิธีแทนที่ทั้งก้อนแบบใบลา ประวัติมาสายเก่าจะหายหมดทันทีที่ผูกบทบาท
 */
function mergeLate(seed: TimeRec["late"], records: PunchRecord[], sch: DaySchedule) {
  const byDay = new Map<string, PunchRecord[]>();
  for (const r of records) {
    const day = dayKey(new Date(r.at));
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }

  const real = new Map<string, number>();
  for (const [day, list] of byDay) {
    const first = toSessions(recordsOfDay(list, day))[0]?.in;
    if (!first) continue;
    /* มาทำงานวันหยุดหรือเสาร์-อาทิตย์ไม่ถือว่าสาย — วันนั้นไม่มีเวลาเข้างานที่ต้องมาให้ทัน */
    if (!isWorkday(new Date(`${day}T00:00:00`), day)) continue;
    /* สายเทียบเวลาเข้างานของคนนั้น — แม่บ้านเข้า 08:00 (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    const min = lateMinutes(new Date(first.at), sch);
    /* ตอกบัตรทันเวลาก็ต้องบันทึกว่าวันนั้นไม่สาย ไม่ใช่ปล่อยให้ค่าของทะเบียนค้างอยู่ */
    real.set(day, min > 0 ? min : 0);
  }

  const kept = seed.filter((x) => !real.has(x.d));
  const fromPunch = [...real.entries()]
    .filter(([, min]) => min > 0)
    .map(([d, min]) => ({ d, min }));
  return [...kept, ...fromPunch].sort((a, b) => a.d.localeCompare(b.d));
}

/** ใบลาที่ถือว่าเกิดขึ้นจริง — รออนุมัติหรือไม่อนุมัติไม่นับ */
function counted(r: LeaveRecord) {
  return r.status === "อนุมัติแล้ว";
}

/** ใบลาหนึ่งใบกินหลายวันได้ กางออกเป็นรายวันเพื่อให้ตรงกับที่ฝ่ายบุคคลนับ */
function spread(r: LeaveRecord) {
  const out: { d: string; type: LeaveKind; span: "full" | "half"; half?: "am" | "pm"; no: string; h?: number }[] = [];
  const type = LEAVE_GROUP[r.type] ?? "personal";
  /* ลาไม่เต็มวัน (ครึ่งวัน/รายชั่วโมง) ติดชั่วโมงจริงไปด้วย — เดิมลารายชั่วโมงถูกนับเป็นเต็มวัน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const partial = r.date === r.toDate && (Boolean(r.half) || (r.hours != null && r.hours < LEAVE_DAY_HOURS));
  const span = partial ? ("half" as const) : ("full" as const);
  const h = partial ? leaveHoursOf(r) : undefined;
  /* ช่วงเช้า/บ่ายติดไปด้วย — หน้าสรุปเวลาใช้ตรวจลาแล้วแต่มีเช็คอิน (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const half = r.half === "morning" ? ("am" as const) : r.half === "afternoon" ? ("pm" as const) : undefined;
  /* กางเฉพาะวันทำงาน — เสาร์–อาทิตย์/วันหยุดกลางใบไม่ใช่วันลา (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  for (const d of leaveDatesOf(r.date, r.toDate)) {
    /* ติดเลขที่ใบไปกับทุกวัน — ใบเดียวกันที่มาถึงอีกทางจะได้ไม่ถูกนับซ้ำ */
    out.push({ d, type, span, half, no: r.id, h });
  }
  return out;
}

/**
 * ชั่วโมงลาจริงของคำขอลาไม่เต็มวันในคิวรายรหัส — เวลาเริ่ม–สิ้นสุดหักพักเที่ยงที่คาบเกี่ยว (ผู้ใช้สั่ง 19 ต.ค. 2569)
 * ไม่มีเวลา = ไม่รู้ (หน้าเวลาคิดจากช่วงเช้า/บ่ายแทน)
 */
export function reqLeaveHours(r: Pick<EmpRequest, "start" | "end">) {
  if (!r.start || !r.end) return undefined;
  const sch = companySchedule();
  const a = minutesOfDay(r.start);
  const b = minutesOfDay(r.end);
  const lunch = Math.max(0, Math.min(b, minutesOfDay(sch.lunchEnd)) - Math.max(a, minutesOfDay(sch.lunchStart)));
  const m = Math.max(0, b - a - lunch);
  return m > 0 ? m / 60 : undefined;
}

/** ชั่วโมงที่ได้เงินของคำขอโอทีหนึ่งใบ — ผู้อนุมัติปรับชั่วโมงได้ ใช้ที่ปรับแล้วก่อน */
function reqHours(r: EmpRequest) {
  return r.approvedHours ?? r.hours ?? 0;
}

/**
 * คำขอที่อนุมัติแล้วในคิวรายรหัส → เวลาทำงานของคนนั้น
 *
 * ผูกด้วย "รหัสพนักงาน" ไม่ใช่บัญชีผู้ใช้ (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * บัญชีเข้าระบบเป็นแค่ทางเข้า ไม่ใช่กุญแจของใบ — คนที่มีบัญชีก็มีใบในคิวนี้ได้
 * (เช่น EX-2569-0006 ของ E01 ที่ GM อนุมัติแล้ว) ถ้าข้ามคนที่มีบัญชี เงินจะหายเงียบ ๆ
 *
 * กันซ้ำที่ "ตัวใบ" ไม่ใช่ที่ "ตัวคน" — ใบเดียวกันมาถึงได้สองทาง (สโตร์ของบทบาทและคิวนี้)
 * ดูเลขที่เอกสารก่อน ไม่ตรงค่อยดูวันที่ (+ ชั่วโมงสำหรับโอที) ตามที่ผู้ใช้กำหนด
 * ลำดับจึงสำคัญ — ใบจริงของบทบาทลงก่อน แล้วคิวนี้ค่อยเติมเฉพาะที่ยังไม่มี
 */
function addEmpRequests(out: Record<string, TimeRec>, reqs: EmpRequest[]) {
  for (const r of reqs) {
    if (r.status !== "approved") continue;
    const base = out[r.emp] ?? { late: [], leave: [], ot: [], issues: [] };
    if (r.kind === "ot" && r.date) {
      const h = reqHours(r);
      /* ใบเดิม = เลขที่เดียวกัน หรือวันเดียวกันและชั่วโมงเท่ากัน (ผ่อนเศษนาทีจากการปัด) */
      const dup = base.ot.some(
        (x) => x.no === r.id || (x.d === r.date && Math.abs(x.h - h) < 0.01),
      );
      if (h <= 0 || dup) continue;
      const k = otKindOf(r.date);
      out[r.emp] = {
        ...base,
        ot: [...base.ot, { d: r.date, h, kind: k === "weekday" ? "after_work" : k, no: r.id }],
      };
    } else if (r.kind === "leave" && r.from) {
      /* ใบลาใบเดียวกันที่ลงไปแล้ว ไม่ต้องดูรายวันซ้ำ */
      if (base.leave.some((x) => x.no === r.id)) continue;
      const type = LEAVE_GROUP[r.leaveType ?? ""] ?? "personal";
      const span = r.span === "half" ? ("half" as const) : ("full" as const);
      const add: TimeRec["leave"] = [];
      /* กางเฉพาะวันทำงาน — เสาร์–อาทิตย์/วันหยุดกลางใบไม่ใช่วันลา (ผู้ใช้สั่ง 19 ต.ค. 2569) */
      for (const d of leaveDatesOf(r.from, r.toDate ?? r.from)) {
        /* วันหนึ่งลาได้ใบเดียว — วันที่มีอยู่แล้วคือใบเดียวกันที่มาอีกทาง */
        if (!base.leave.some((x) => x.d === d) && !add.some((x) => x.d === d))
          add.push({ d, type, span, half: span === "half" ? r.period : undefined, no: r.id, h: span === "half" ? reqLeaveHours(r) : undefined });
      }
      if (add.length) out[r.emp] = { ...base, leave: [...base.leave, ...add] };
    }
  }
}

/**
 * เวลาทำงานที่ฝ่ายบุคคลใช้ — ข้อมูลตั้งต้นของฝ่ายบุคคล
 * ทับด้วยใบจริงของคนที่ผูกบทบาทไว้ แล้วเติมด้วยคำขอที่อนุมัติแล้วในคิวรายรหัส
 *
 * ของคนที่ผูกบทบาท ทับทั้งก้อน ไม่ใช่เอามารวมกัน เพราะถ้ารวมจะนับซ้ำ
 * ใบลาใบเดียวกันมีอยู่ทั้งในข้อมูลตั้งต้นและในใบจริง
 * ลำดับจึงสำคัญ — ใบจริงของบทบาททับก่อน แล้วคิวรายรหัสค่อยเติมเฉพาะใบที่ยังไม่มี
 * (สลับลำดับเมื่อ 23 ก.ย. 2569 ตอนเลิกข้ามคนที่มีบัญชี ถ้าเติมก่อนจะถูกทับหายทั้งก้อน)
 *
 * ส่วนมาสายกับรายการที่ต้องตรวจยังมาจากข้อมูลตั้งต้นเสมอ
 * เพราะสองอย่างนั้นมาจากเครื่องบันทึกเวลา ไม่ใช่ใบที่พนักงานยื่น
 */
export function useHrTime(): Record<string, TimeRec> {
  const hr = useHr();
  const leave = useAllLeave();
  const ot = useAllOt();
  const punches = useAllPunches();
  const reqs = useEmpRequests();

  return useMemo(() => {
    const out: Record<string, TimeRec> = { ...hr.time };
    /* คนหนึ่งควบได้สองบทบาท (เช่น บัญชีและบุคคลเป็นคนเดียวกัน)
       ต้องรวมใบของทุกบทบาทที่เขาถือก่อนแล้วค่อยทับทีเดียว ไม่ใช่ทับทีละบทบาท
       ไม่งั้นใบของบทบาทที่วนถึงก่อนจะหายไปทั้งก้อน — โอทีที่อนุมัติแล้วจะไม่ได้เงิน */
    const rolesOf = new Map<string, Role[]>();
    for (const [role, id] of Object.entries(ROLE_EMPLOYEE))
      rolesOf.set(id, [...(rolesOf.get(id) ?? []), role as Role]);

    for (const [id, roles] of rolesOf) {
      const base = out[id] ?? { late: [], leave: [], ot: [], issues: [] };
      const sch = scheduleFor(hr.emp.find((e) => e.id === id));
      /* วันลาซ้ำวันเดียวกันจากสองบทบาทนับครั้งเดียว — วันหนึ่งลาได้ใบเดียว */
      const days = new Set<string>();
      const lv = roles
        .flatMap((r) => leave[r].filter(counted).flatMap(spread))
        .filter((x) => !days.has(x.d) && days.add(x.d));
      out[id] = {
        ...base,
        late: roles.reduce((acc, r) => mergeLate(acc, punches[r], sch), base.late),
        leave: lv,
        ot: roles.flatMap((r) =>
          ot[r]
            .filter((x) => paidHours(x) > 0)
            .map((x) => ({
              d: x.date,
              h: paidHours(x),
              /* ประเภทโอทีคิดจากวันที่ตามปฏิทิน ไม่ใช่ให้พนักงานเลือกเอง */
              kind: ((k) => (k === "weekday" ? "after_work" : k))(otKindOf(x.date)),
              no: x.id,
            })),
        ),
      };
    }
    addEmpRequests(out, reqs);
    return out;
  }, [hr.time, hr.emp, leave, ot, punches, reqs]);
}

/** ใบที่อนุมัติแล้วแต่ไม่โผล่ในรอบ — หนึ่งแถวคือหนึ่งใบที่จะไม่ได้เงินถ้าปิดรอบไปตอนนี้ */
export type MissingReq = {
  kind: "leave" | "ot" | "expense";
  emp: string;
  no: string;
  date: string;
  /** ชั่วโมง (โอที) · วัน (ลา) · บาท (ใบเบิก) — หน่วยอยู่ใน unit */
  amount: number;
  unit: string;
};

/**
 * ใบที่อนุมัติแล้วแต่ไม่โผล่ในรอบ — ด่านก่อนปิดรอบ (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * เคยเงียบมาแล้วสองครั้ง เพราะใบของคนที่มีบัญชีเข้าระบบไม่เคยถึงรอบเลย
 * ตัวนี้จึงเทียบ "ใบที่อนุมัติแล้วในช่วงรอบ" กับ "สิ่งที่อยู่ในผลคำนวณของรอบ" ตรง ๆ ทั้งสามชนิด
 * เจอไม่ครบเมื่อไรคือมีอะไรขาด ต้องกั้นไม่ให้ปิดรอบ ไม่ใช่แค่เตือนแล้วปล่อยผ่าน
 */
export function useMissingApproved(c: Cycle): MissingReq[] {
  const time = useHrTime();
  const reqs = useEmpRequests();
  const ot = useAllOt();
  const leave = useAllLeave();
  const claims = useAllClaims();
  const src = useComSource();

  return useMemo(() => {
    const inCycle = (d: string) => d >= c.from && d <= c.to;
    const out: MissingReq[] = [];

    /* ── โอที: ชั่วโมงที่อนุมัติต้องอยู่ในเวลาทำงานของวันนั้นครบ ── */
    const wantOt: { emp: string; date: string; hours: number; no: string }[] = [];
    for (const r of reqs)
      if (r.kind === "ot" && r.status === "approved" && r.date && inCycle(r.date) && reqHours(r) > 0)
        wantOt.push({ emp: r.emp, date: r.date, hours: reqHours(r), no: r.id });
    for (const [role, id] of Object.entries(ROLE_EMPLOYEE))
      for (const r of ot[role as Role] ?? [])
        if (inCycle(r.date) && paidHours(r) > 0)
          wantOt.push({ emp: id, date: r.date, hours: paidHours(r), no: r.id });
    for (const x of wantOt) {
      const got = (time[x.emp]?.ot ?? [])
        .filter((o) => o.d === x.date && inCycle(o.d))
        .reduce((a, o) => a + o.h, 0);
      /* ผ่อนให้เศษนาทีจากการปัด — ขาดจริงคือขาดเกินหนึ่งในร้อยของชั่วโมง */
      if (got + 0.01 < x.hours)
        out.push({ kind: "ot", emp: x.emp, no: x.no, date: x.date, amount: x.hours, unit: "ชม." });
    }

    /* ── ใบลา: ทุกวันของใบที่ตกอยู่ในรอบต้องมีอยู่ในเวลาทำงาน ── */
    const wantLv: { emp: string; days: string[]; no: string }[] = [];
    for (const r of reqs)
      if (r.kind === "leave" && r.status === "approved" && r.from) {
        /* วันชุดเดียวกับที่ลงเวลาทำงาน (เฉพาะวันทำงาน) — ไม่งั้นเสาร์–อาทิตย์ถูกนับว่าหายตลอด (ผู้ใช้สั่ง 19 ต.ค. 2569) */
        const days = leaveDatesOf(r.from, r.toDate ?? r.from).filter(inCycle);
        if (days.length) wantLv.push({ emp: r.emp, days, no: r.id });
      }
    for (const [role, id] of Object.entries(ROLE_EMPLOYEE))
      for (const r of leave[role as Role] ?? [])
        if (counted(r)) {
          const days = spread(r).map((x) => x.d).filter(inCycle);
          if (days.length) wantLv.push({ emp: id, days, no: r.id });
        }
    for (const x of wantLv) {
      const got = new Set((time[x.emp]?.leave ?? []).map((l) => l.d));
      const lost = x.days.filter((d) => !got.has(d));
      if (lost.length)
        out.push({ kind: "leave", emp: x.emp, no: x.no, date: lost[0], amount: lost.length, unit: "วัน" });
    }

    /* ── ใบเบิก: ใบที่อนุมัติในรอบต้องถูกจ่ายในรอบนี้ หรือถูกจ่ายไปแล้วในรอบก่อน ──
       เทียบด้วยกุญแจเดียวกับที่ใช้กันซ้ำ (เลขที่ แล้วค่อย รหัส+รอบเดือน+ยอด)
       ไม่งั้นใบเดียวกันที่เข้ามาด้วยเลขที่ของอีกทาง จะถูกนับว่าหาย ทั้งที่จ่ายแล้ว */
    const paid = new Set(
      (src.reimb ?? []).flatMap((x) => [
        ...(x.no ? [x.no] : []),
        `${x.emp}|${x.claim ?? x.date.slice(0, 7)}|${x.total.toFixed(2)}`,
      ]),
    );
    const wantEx: { emp: string; date: string; total: number; no: string; month: string }[] = [];
    for (const r of reqs)
      if (r.kind === "expense" && r.status === "approved") {
        const date = (r.decidedAt || r.at || `${r.month ?? ""}-01`).slice(0, 10);
        const total = fuelTotal(
          (r.fuel ?? []).map((x, i) => ({ ...x, id: `${r.id}-${i}`, km: String(x.km) })),
        );
        if (total > 0 && inCycle(date))
          wantEx.push({ emp: r.emp, date, total, no: r.id, month: r.month ?? date.slice(0, 7) });
      }
    for (const [role, id] of Object.entries(ROLE_EMPLOYEE))
      for (const cl of claims[role as Role] ?? []) {
        if (cl.status !== "อนุมัติแล้ว" || !cl.no) continue;
        const date = (cl.decidedAt || cl.submittedAt || `${cl.month}-01`).slice(0, 10);
        /* ยอดที่จ่ายคืนคือทั้งใบ — ค่าน้ำมัน + ค่าใช้จ่ายอื่น (claimTotal ที่เดียว) */
        const total = claimTotal(cl);
        if (total > 0 && inCycle(date))
          wantEx.push({ emp: id, date, total, no: cl.no, month: cl.month });
      }
    for (const x of wantEx)
      if (!paid.has(x.no) && !paid.has(`${x.emp}|${x.month}|${x.total.toFixed(2)}`))
        out.push({ kind: "expense", emp: x.emp, no: x.no, date: x.date, amount: x.total, unit: "บาท" });

    return out;
  }, [time, reqs, ot, leave, claims, src, c.from, c.to]);
}

/*
 * ─── ผลการคำนวณของรอบ — หน้าที่เกี่ยวข้องอ่านจากที่นี่ที่เดียว ──────
 *
 * ยอดของรอบต้องเป็น "ตัวเลขเดียวกับที่จ่าย" (ผู้ใช้กำหนด 23 ก.ย. 2569) — หน้าไหนอยากได้ยอดรอบเรียกตัวนี้ ห้ามคิดเอง
 * (เดิมหน้า /ceo/approvals ใช้ตัวนี้ตอนอนุมัติยอด — เลิกขั้น CEO อนุมัติแล้ว ผู้ใช้สั่ง 13 ต.ค. 2569)
 */
export function usePayrollSumFn() {
  const hr = useHr();
  const time = useHrTime();
  const src = useComSource();
  const today = todayIso();

  return useCallback(
    (month: string, group: PayGroup) => {
      /* รอบจ่ายรายวันของทดลองงาน — คีย์เป็นช่วงวัน "จาก~ถึง" (ผู้ใช้สั่ง 6 ต.ค. 2569) */
      if (isDailyRoundKey(month)) {
        const range = dailyRoundRange(month);
        const round = hr.dailyRounds.find((r) => r.id === month);
        return dailySumOf(dailyPayLines(hr.emp, range, time, hr.extras, today, src, round), range, hr.extras);
      }
      const range = hrCycle(month);
      const payrun = hr.payruns.find((p) => p.month === month);
      const lines = payLines(hr.emp, range, time, hr.extras, today, src, payrun, month);
      return sumOfGroup(linesOfGroup(lines, group, range), group, range, hr.extras);
    },
    [hr.emp, hr.payruns, hr.dailyRounds, hr.extras, time, src, today],
  );
}

/**
 * ยอดที่ส่งให้ CEO ไม่ตรงกับยอดที่คิดได้ตอนนี้ (ผู้ใช้สั่ง 19 ต.ค. 2569)
 * เทียบยอดรายคนที่บันทึกไว้ตอนส่ง/ตอนอนุมัติ (รอบเก่าไม่มีรายคนเทียบยอดสุทธิรวม) · รอบที่ปิดเงินเดือนแล้วไม่เทียบ
 * รวมรอบที่ไม่อนุมัติ (HR แก้แล้วส่งใหม่เอง) และร่างที่ถูกยกเลิกการอนุมัติแบบเก่า (มีเหตุผลค้าง)
 */
export function usePayrollDrift() {
  const hr = useHr();
  const sumOf = usePayrollSumFn();

  return useMemo(
    () =>
      Object.entries(hr.payApprove).flatMap(([key, a]) => {
        const legacyVoid = a.status === "draft" && Boolean(a.reason);
        if (a.status === "draft" && !legacyVoid) return [];
        const [month, group] = key.split("|") as [string, PayGroup];
        /* รอบเดือนกลุ่มรายวันแบบเก่าไม่ใช้แล้ว */
        if (!isDailyRoundKey(month) && group === "day") return [];
        const closed = isDailyRoundKey(month)
          ? Boolean(hr.dailyRounds.find((r) => r.id === month)?.payClosedAt)
          : closedIn(hr.payruns.find((p) => p.month === month), group);
        if (closed) return [];
        const sum = sumOf(month, group);
        if (!legacyVoid && !payDrifted(a, sum)) return [];
        return [{ month, group, sum }];
      }),
    [hr.payApprove, hr.dailyRounds, hr.payruns, sumOf],
  );
}

/**
 * แก้ยอดหลังส่ง = ส่งให้ CEO อนุมัติใหม่ทันที "แก้ไขแล้ว รออนุมัติใหม่" (ผู้ใช้สั่ง 19 ต.ค. 2569 · แทนการยกเลิกการอนุมัติ)
 * แบบเดียวกับงานที่ PM ตรวจ — HR ไม่ต้องกดส่งซ้ำ · CEO เห็นป้าย "แก้ไขแล้วส่งใหม่ ครั้งที่ n" และรายการสิ่งที่เปลี่ยน
 * ยังปิดรอบไม่ได้จนกว่า CEO จะอนุมัติยอดชุดใหม่
 */
export function usePayrollAutoResubmit() {
  const drift = usePayrollDrift();
  useEffect(() => {
    for (const d of drift)
      resubmitPayApproval(
        d.month,
        d.group,
        { people: d.sum.n, net: d.sum.net, ss: d.sum.ss, lines: paySnapOf(d.sum), names: payNamesOf(d.sum) },
        bkkStamp(),
      );
  }, [drift]);
}

/**
 * ใบที่ยังไม่ตัดสินและตกอยู่ในรอบนี้
 *
 * ฝ่ายบุคคลปิดรอบไปโดยไม่รู้ว่ามีใบค้างอยู่ = ตัวเลขที่ปิดไปแล้วจะเปลี่ยนทีหลัง
 * จึงต้องเห็นก่อนกดปิด ไม่ใช่ไปรู้ตอนมีคนทัก
 */
/**
 * บทบาทที่บัญชีของคนที่ล็อกอินอยู่เข้าใช้ได้ — คนควบสองตำแหน่งได้สองบทบาท
 * ไม่มีบัญชีที่ผูกบทบาทนี้ไว้ = ใช้บทบาทที่เลือกไว้อย่างเดียวเหมือนเดิม
 */
export function useMyRoles(): Role[] {
  const role = useRole();
  const hr = useHr();
  return useMemo(() => {
    /* ผู้ดูแลระบบเป็นบัญชีแยก (เจ้าของสั่ง 25 ก.ย. 2569) — ผู้บริหารไม่ได้ถือสิทธิ์นี้แล้ว
       เมนูตั้งค่าจึงไม่ติดไปอยู่ในเมนูของผู้บริหารอีก
       เข้าระบบด้วยบทบาทผู้ดูแลระบบแล้วก็ไม่ได้เมนูของบทบาทอื่นมาด้วยเช่นกัน
       บทบาทนี้ไม่มีกลุ่ม "ของฉัน" (NO_MINE) ถ้าดึงบทบาทฝ่ายบุคคลมาต่อ ใบลา/โอที/ใบเบิกของอรอนงค์
       จะมีสองชุดแยกตามการ์ดที่ใช้เข้าระบบ เพราะสโตร์ส่วนตัวแยกตามบทบาท (ดู role-store.ts) */
    /* บทบาทเดียวกันอาจมีหลายคนถือ (เช่น ฝ่ายบุคคลสองคน) — ยึดบัญชีของคนที่ล็อกอินอยู่ก่อน */
    const me = hr.emp.find((e) => e.id === ROLE_EMPLOYEE[role]);
    const acc = accountRoles(me?.account).includes(role)
      ? me?.account
      : hr.emp.find((e) => accountRoles(e.account).includes(role))?.account;
    const roles = accountRoles(acc);
    /* เมนูเรียงตามลำดับที่ฝ่ายบุคคลติกตอนสร้างบัญชี ไม่ใช่บทบาทที่ใช้เข้าระบบมาก่อน (ผู้ใช้สั่ง 6 ต.ค. 2569) */
    return roles.length > 1 && roles.includes(role) ? roles : [role];
  }, [hr.emp, role]);
}

/**
 * เวลาทำงานของคนที่ล็อกอินอยู่ — ตามตำแหน่งในทะเบียน (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * ไม่พบในทะเบียน (บทบาทเดโม) แม่บ้านใช้เวลาของตำแหน่งแม่บ้าน คนอื่นใช้เวลาของบริษัท
 */
export function useMySchedule(): DaySchedule {
  const role = useRole();
  const hr = useHr();
  /* ค่าตั้งค่าเปลี่ยน → เปลือกแอปวาดหน้าใหม่ทั้งหน้าอยู่แล้ว (settingsId) จึงจำตามคนกับบทบาทพอ */
  return useMemo(() => {
    const me =
      hr.emp.find((e) => e.id === ROLE_EMPLOYEE[role]) ??
      hr.emp.find((e) => accountRoles(e.account).includes(role));
    return scheduleFor(me ?? (role === "maid" ? "maid" : null));
  }, [hr.emp, role]);
}

/**
 * ทดลองงานกับฝึกงานไม่มีโควต้าวันลา — ทดลองงานหยุดคือหักเงิน ฝึกงานหยุดคือหยุด
 * จึงไม่แสดงการ์ดสิทธิ์คงเหลือและคำเตือนเกินสิทธิ์ (ผู้ใช้สั่ง 29 ต.ค. 2569)
 */
export function useNoLeaveQuota(): boolean {
  const role = useRole();
  const hr = useHr();
  const me =
    hr.emp.find((e) => e.id === ROLE_EMPLOYEE[role]) ??
    hr.emp.find((e) => accountRoles(e.account).includes(role));
  return me?.type === "probat" || me?.type === "intern";
}

/** เวลาทำงานของบทบาทที่ล็อกอินได้ (ใช้นอก React เช่นที่เก็บการแจ้งเตือน) */
export function scheduleOfRole(emp: { id: string; pos?: string }[], role: Role): DaySchedule {
  const me = emp.find((e) => e.id === ROLE_EMPLOYEE[role]);
  return scheduleFor(me ?? (role === "maid" ? "maid" : null));
}

/**
 * เมนู "ของฉัน" ของคนที่ล็อกอิน — ขึ้นตามประเภทพนักงานในทะเบียน ไม่ใช่ตามบทบาท (ผู้ใช้สั่ง 6 ต.ค. 2569)
 * ไม่พบในทะเบียน (บทบาทเดโม) ใช้ค่าตามบทบาทแทน
 */
export function useMyMine(): NavItem[] {
  const role = useRole();
  const roles = useMyRoles();
  const hr = useHr();
  const presales = useCrm().presales;
  return useMemo(() => {
    const me =
      hr.emp.find((e) => e.id === ROLE_EMPLOYEE[role]) ??
      hr.emp.find((e) => accountRoles(e.account).includes(role));
    const kind: MineKind = me
      ? me.type === "intern"
        ? "intern"
        : me.pos === "maid"
          ? "maid"
          : roles.every((r) => r === "ceo")
            ? "none"
            : "full"
      : role === "intern"
        ? "intern"
        : role === "maid"
          ? "maid"
          : role === "ceo"
            ? "none"
            : "full";
    /* มีคำขอทำข้อเสนอส่งถึงตัวเอง แต่ไม่ได้อยู่ทีมก่อนการขาย — เพิ่มเมนูคิวงานให้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
    const psItem =
      !roles.includes("ps") && psHasRequestFor(presales, ROLE_EMPLOYEE[role]) ? [PS_REQUEST_ITEM] : [];
    return [...mineItems(kind), ...psItem];
  }, [hr.emp, role, roles, presales]);
}

export function usePendingRequests(c: Cycle) {
  const leave = useAllLeave();
  const ot = useAllOt();
  const reqs = useEmpRequests();

  return useMemo(() => {
    const out: Record<string, { leave: number; ot: number; leaveDays: number }> = {};
    const inCycle = (d: string) => d >= c.from && d <= c.to;
    const add = (id: string, p: { leave?: number; ot?: number; leaveDays?: number }) => {
      const base = out[id] ?? { leave: 0, ot: 0, leaveDays: 0 };
      out[id] = {
        leave: base.leave + (p.leave ?? 0),
        ot: base.ot + (p.ot ?? 0),
        leaveDays: base.leaveDays + (p.leaveDays ?? 0),
      };
    };
    for (const [role, id] of Object.entries(ROLE_EMPLOYEE)) {
      const waiting = leave[role as Role].filter(
        (r) => r.status === "รอการอนุมัติ" && inCycle(r.date),
      );
      const o = ot[role as Role].filter(
        (r) => r.status === "รออนุมัติ" && inCycle(r.date),
      ).length;
      /* วันลาที่ยังไม่ตัดสิน — ยังไม่เข้าช่อง "ลา" ของรอบ แต่ฝ่ายบุคคลต้องเห็นว่าค้างอยู่เท่าไร
         (สิทธิ์ถูกหักตอนอนุมัติเท่านั้น · ผู้ใช้ตัดสิน 24 ก.ย. 2569) */
      if (waiting.length || o)
        add(id, {
          leave: waiting.length,
          ot: o,
          leaveDays: waiting.reduce((n, r) => n + r.days, 0),
        });
    }
    /* คำขอของคนที่ยังไม่มีบัญชีเข้าระบบก็ค้างได้เหมือนกัน (emp-requests) */
    for (const r of reqs) {
      if (r.status !== "pending") continue;
      if (r.kind === "leave" && r.from && inCycle(r.from))
        add(r.emp, { leave: 1, leaveDays: r.days ?? 0 });
      if (r.kind === "ot" && r.date && inCycle(r.date)) add(r.emp, { ot: 1 });
    }
    return out;
  }, [leave, ot, reqs, c.from, c.to]);
}

/** ทางลัดสำหรับหน้าที่คิดเป็นรอบเดือน */
export function usePendingInMonth(month: string) {
  return usePendingRequests(hrCycle(month));
}

/*
 * งานฝั่งโปรเจคของพนักงานคนหนึ่ง
 *
 * ใช้ได้เพราะรหัส E01–E10 ในทะเบียนพนักงานคือคนเดียวกับทีมงานฝั่ง PM
 * (ดูหมายเหตุหัวไฟล์ hr-data.ts) ระบบจึงอ้างถึงคนคนเดียวกันด้วยรหัสเดียวได้
 *
 * TODO: ⚠️ E11 เป็นคนละคนกันในสองชุด และ E12–E17 ไม่มีฝั่ง PM
 * ถ้าจะยุบทะเบียนสองชุดเป็นชุดเดียว ต้องสะสางตรงนั้นก่อน
 */
export function useEmployeeWork(id: string) {
  const pm = usePm();

  return useMemo(() => {
    const rows = pm.projects.flatMap((p) =>
      p.tasks.filter((t) => t.whos.includes(id)).map((t) => ({ p, t })),
    );
    return {
      open: rows.filter((x) => x.t.status !== "done"),
      done: rows.filter((x) => x.t.status === "done").length,
      /* โปรเจคที่คนนี้มีงานค้างอยู่ ไม่ซ้ำใบ */
      projects: [...new Map(rows.map((x) => [x.p.pj, x.p])).values()],
    };
  }, [pm.projects, id]);
}

/**
 * ฐานคิดค่าคอมมิชชั่นจากงานจริง (BR-09) — ส่งเข้า payIn / payOf
 *
 * ผู้ขาย: ดีลที่ปิดการขาย (ดีลที่ยกเลิกทีหลังไม่นับ) — ของผู้ขายที่ปิดดีลนั้น (Deal.seller หรือผู้ดูแลลูกค้า)
 * PM: ใบเสร็จที่ออกให้ดีลของโปรเจคที่ดูแล จับคู่ PM ด้วยชื่อในโปรเจค เพราะโปรเจคเก็บชื่อ ไม่ได้เก็บรหัส
 */
export function useComSource(): ComSource {
  const hr = useHr();
  const crm = useCrm();
  const acc = useAcc();
  const pm = usePm();
  const claims = useAllClaims();
  const reqs = useEmpRequests();

  return useMemo(() => {
    /* "ชนิกานต์ (PM)" หรือ "ชนิกานต์ วัฒนกุล" → รหัสพนักงาน */
    const empOfPm = (raw: string) => {
      const n = raw.replace(/\s*\(.*\)\s*$/, "").trim();
      return n ? hr.emp.find((e) => e.name === n || e.name.split(" ")[0] === n)?.id : undefined;
    };

    /* ผู้ขายของดีล = ชื่อที่บันทึกตอนปิดการขาย · ดีลเก่าใช้ผู้ดูแลลูกค้า
       หาในทะเบียนไม่เจอ (เช่นคนที่ไม่ได้อยู่ในระบบ) ไม่นับให้ใคร — ไม่เดาว่าเป็นของผู้ขายที่ล็อกอิน */
    const ownerOf = new Map(crm.customers.map((c) => [c.code, c.owner]));
    const sales = crm.deals.flatMap((d) => {
      if (d.status !== "ปิดการขาย" || !d.closedAt) return [];
      const emp = empOfPm(d.seller ?? ownerOf.get(d.customerCode) ?? "");
      return emp ? [{ emp, date: d.closedAt, total: d.total }] : [];
    });
    /* ใบเสร็จอ้างรายการวางบิล (เลขดีลฝั่งบัญชี) — โปรเจคผูกกับใบแจ้งหนี้งวดแรก หารายการวางบิลผ่านใบนั้น (ผู้ใช้สั่ง 5 ต.ค. 2569) */
    const pmOfDeal = new Map<string, string>();
    for (const p of pm.projects) {
      const id = empOfPm(p.pm);
      const billDeal = acc.invoices.find((v) => v.no === p.bill)?.deal ?? p.deal;
      if (id && billDeal) pmOfDeal.set(billDeal, id);
    }
    const paid = acc.receipts.flatMap((r) => {
      const emp = pmOfDeal.get(r.deal);
      return emp ? [{ emp, date: r.date, total: r.total }] : [];
    });
    /* ใบเบิกที่อนุมัติแล้ว → ค่าใช้จ่ายคืนในเงินเดือน (เฉพาะค่าน้ำมัน/ค่าใช้จ่าย ค่าคอมคิดในเงินเดือนอยู่แล้ว)
       ใบเก่าที่ไม่มีวันอนุมัติ ใช้วันที่ยื่นแทน */
    /* ใบเก่าที่ยังไม่มีบันทึกว่าจ่ายรอบไหน แต่อนุมัติอยู่ในรอบที่ปิดไปแล้ว ถือว่าจ่ายในรอบนั้น
       (ไม่งั้นจะโผล่ซ้ำในรอบที่ยังเปิดอยู่) */
    const closedMonths = hr.payruns.filter((p) => p.closed).map((p) => p.month);
    const closedAt = (date: string) =>
      closedMonths.find((m) => date >= hrCycle(m).from && date <= hrCycle(m).to) ??
      (closedMonths.length && date < hrCycle([...closedMonths].sort()[0]).from ? "before" : undefined);
    const reimb: NonNullable<ComSource["reimb"]> = Object.entries(ROLE_EMPLOYEE).flatMap(([role, emp]) =>
      (claims[role as Role] ?? [])
        .filter((c) => c.status === "อนุมัติแล้ว")
        .map((c) => {
          const date = (c.decidedAt || c.submittedAt || `${c.month}-01`).slice(0, 10);
          return {
            emp: emp as string,
            date,
            total: claimTotal(c),
            paidIn: c.paidIn ?? closedAt(date),
            role: role as Role,
            claim: c.month,
            no: c.no,
            label: `${c.other?.length ? "ค่าใช้จ่าย" : "ค่าน้ำมัน"} ${thaiMonth(c.month)}`,
          };
        })
        .filter((x) => x.total > 0),
    );
    /* ใบเบิกของพนักงานที่ยังไม่มีบัญชีเข้าระบบ (ต้นแบบ HR_REIMB) */
    for (const x of HR_REIMB)
      reimb.push({ emp: x.emp, date: x.decidedAt, total: x.amount, paidIn: closedAt(x.decidedAt), no: x.no, label: x.label });
    /* ใบเบิกที่อนุมัติแล้วในคิวรายรหัส — ผูกด้วยรหัสพนักงาน ไม่ใช่บัญชีผู้ใช้ (ผู้ใช้กำหนด 23 ก.ย. 2569)
       ไม่งั้นใบที่ผู้อนุมัติกดอนุมัติไปแล้วของคนที่มีบัญชีจะไม่มีวันถึงเงินเดือนของเขาเลย
       กันซ้ำที่ตัวใบแทน — เลขที่เอกสารก่อน ไม่ตรงค่อยดูรหัสพนักงาน + รอบเดือน + ยอด */
    const seenNo = new Set(reimb.flatMap((x) => (x.no ? [x.no] : [])));
    const sameBill = (emp: string, month: string, total: number) =>
      `${emp}|${month}|${total.toFixed(2)}`;
    const seenBill = new Set(
      reimb.map((x) => sameBill(x.emp, x.claim ?? x.date.slice(0, 7), x.total)),
    );
    for (const r of reqs) {
      if (r.kind !== "expense" || r.status !== "approved") continue;
      const date = (r.decidedAt || r.at || `${r.month ?? ""}-01`).slice(0, 10);
      /* อัตราต่อกิโลเมตรมาจากที่เดียวกับใบเบิกของบทบาท (fuelTotal) ห้ามคิดเอง */
      const total = fuelTotal(
        (r.fuel ?? []).map((x, i) => ({ ...x, id: `${r.id}-${i}`, km: String(x.km) })),
      );
      const month = r.month ?? date.slice(0, 7);
      if (total <= 0 || seenNo.has(r.id) || seenBill.has(sameBill(r.emp, month, total))) continue;
      seenNo.add(r.id);
      seenBill.add(sameBill(r.emp, month, total));
      reimb.push({
        emp: r.emp,
        date,
        total,
        paidIn: closedAt(date),
        claim: month,
        no: r.id,
        label: `ค่าน้ำมัน ${thaiMonth(month)}`,
      });
    }
    return { sales, paid, reimb };
  }, [hr.emp, hr.payruns, crm.deals, crm.customers, acc.receipts, pm.projects, claims, reqs]);
}

export type AttState = "ontime" | "late" | "leave" | "none";

/**
 * พนักงานวันนี้ — ใช้ในแดชบอร์ด CEO (ต้นแบบ ceo-dashboard.html "พนักงานวันนี้")
 * ลา = มีวันลาที่อนุมัติแล้วในวันนี้ · เข้างาน = ตอกบัตรจริงของบทบาทที่ผูกกับคนนั้น
 * ⚠️ คนที่ยังไม่มีบัญชีเข้าระบบตอกบัตรไม่ได้ จึงเป็น "ยังไม่เข้างาน" เสมอ จนกว่าจะเปิดบัญชีให้
 */
export function useTodayAttendance() {
  const hr = useHr();
  const time = useHrTime();
  const punches = useAllPunches();
  return useMemo(() => {
    const today = todayIso();
    const roleOf = new Map(Object.entries(ROLE_EMPLOYEE).map(([r, id]) => [id, r as Role]));
    return hr.emp
      .filter((e) => e.status === "active")
      .map((e) => {
        const lv = time[e.id]?.leave.find((l) => l.d === today);
        if (lv) return { e, state: "leave" as AttState, leave: lv.type, time: "" };
        const role = roleOf.get(e.id);
        const first = role ? toSessions(recordsOfDay(punches[role] ?? [], today))[0]?.in : undefined;
        if (!first) {
          /* ยังไม่มีการตอกบัตรจริง — ใช้ข้อมูลตัวอย่างตามต้นแบบ (เข้างานหลัง 09:00 = สาย) */
          if (DEMO_LEAVE_TODAY[e.id]) return { e, state: "leave" as AttState, leave: DEMO_LEAVE_TODAY[e.id], time: "" };
          const demo = DEMO_CHECKIN[e.id];
          if (demo) return { e, state: (demo > scheduleFor(e).start ? "late" : "ontime") as AttState, time: demo };
          return { e, state: "none" as AttState, time: "" };
        }
        const at = new Date(first.at);
        const wall = bkkOf(at);
        return {
          e,
          state: (lateMinutes(at, scheduleFor(e)) > 0 ? "late" : "ontime") as AttState,
          time: `${pad2(wall.getHours())}:${pad2(wall.getMinutes())}`,
        };
      });
  }, [hr.emp, time, punches]);
}

/** เวลาเข้า-ออกงานที่ตอกจริง รายคน รายวัน (เวลาไทย "HH:MM") — ว่าง = ไม่ได้ตอกฝั่งนั้น */
export type PunchDay = { in: string; out: string };

/**
 * เวลาตอกบัตรจริงของคนที่ผูกบทบาทไว้ — หน้าสรุปเวลาใช้ตรวจ "ลาแล้วแต่มีเช็คอิน" (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * เข้า = ตอกเข้าครั้งแรกของวัน · ออก = ตอกออกครั้งสุดท้ายของวัน
 * คนหนึ่งควบหลายบทบาท เอาเวลาเข้าที่เช้าสุดและเวลาออกที่ช้าสุด
 */
export function usePunchTimes(): Record<string, Record<string, PunchDay>> {
  const punches = useAllPunches();
  return useMemo(() => {
    const hm = (iso: string) => {
      const t = bkkOf(new Date(iso));
      return `${pad2(t.getHours())}:${pad2(t.getMinutes())}`;
    };
    const out: Record<string, Record<string, PunchDay>> = {};
    for (const [role, id] of Object.entries(ROLE_EMPLOYEE)) {
      const list = punches[role as Role] ?? [];
      const days = new Set(list.map((r) => dayKey(new Date(r.at))));
      for (const day of days) {
        const ss = toSessions(recordsOfDay(list, day));
        if (!ss.length) continue;
        const tin = hm(ss[0].in.at);
        const last = [...ss].reverse().find((s) => s.out);
        const tout = last?.out ? hm(last.out.at) : "";
        const mine = (out[id] ??= {});
        const had = mine[day];
        mine[day] = had
          ? {
              in: !had.in || tin < had.in ? tin : had.in,
              out: tout > had.out ? tout : had.out,
            }
          : { in: tin, out: tout };
      }
    }
    return out;
  }, [punches]);
}
