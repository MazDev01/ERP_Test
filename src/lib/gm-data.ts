"use client";

/*
 * ข้อมูลของผู้จัดการทั่วไป (GM) — ใช้ร่วมกันระหว่างแดชบอร์ดกับปฏิทินทีม
 * (ต้นแบบ gm-dashboard.html · gm-calendar.html 22 ก.ย. 2569)
 *
 * ทุกอย่างคิดสดจากสโตร์ ไม่เก็บตัวเลขสรุปซ้ำ
 *   วันลาที่อนุมัติแล้ว — ทะเบียนเวลาทำงานของฝ่ายบุคคล (useHrTime ทับด้วยใบจริงของบทบาทที่ล็อกอินได้)
 *                        + คำขอของทีมงานใน emp-requests ที่อนุมัติแล้ว (ยังไม่ไหลเข้าทะเบียน)
 *   วันลาที่รออนุมัติ — ใบของบทบาทใน leave-store + คำขอของทีมงานใน emp-requests
 *   คิวรออนุมัติ     — ตามสายอนุมัติใน role.ts (approvesFor) + emp-requests ที่ส่งถึง GM
 *                        ชุดเดียวกับที่หน้า /approvals แสดง ตัวเลขสองหน้าจึงตรงกัน
 */

import { useMemo } from "react";
import { empReqLeaveHours, useEmpRequests } from "./emp-requests";
import { fmtLeaveHours, leaveHoursOf } from "./leave-data";
import { fuelAmount } from "./expense-data";
import { useAllClaims } from "./expense-store";
import { addDays, thaiMonth } from "./format";
import { HR_LEAVE_LABEL, ROLE_EMPLOYEE, leaveRowHours } from "./hr-data";
import { useHrTime } from "./hr-link";
import { useHr } from "./hr-store";
import { useAllLeave } from "./leave-store";
import { USERS } from "./mock-data";
import { displayName, nameOf as empNameOf } from "./emp-name";
import { useAllOt } from "./ot-store";
import { approvesFor, useApprovalRoute, type Role } from "./role";

/** วันลาหนึ่งช่วงของพนักงานหนึ่งคน */
export type TeamLeave = {
  key: string;
  /** รหัสพนักงาน */
  emp: string;
  name: string;
  from: string;
  to: string;
  type: string;
  pending: boolean;
  /** รหัสใบลา — มีเฉพาะใบที่รออนุมัติ ใช้เปิดตรงรายการในหน้า /approvals (?find=) */
  id?: string;
  /** ชั่วโมงลาของวันที่ลาไม่เต็มวัน — ไม่มีค่า = ลาเต็มวัน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  hours?: number;
  /** GM เป็นผู้อนุมัติใบนี้ — กดแล้วพาไปหน้ารายการรออนุมัติได้ */
  mine: boolean;
};

/** ต่อท้ายชื่อประเภทลาเมื่อลาไม่เต็มวัน — " · 3 ชม." · ลาเต็มวัน = "" (ผู้ใช้สั่ง 19 ต.ค. 2569) */
export function teamLeaveHoursText(l: Pick<TeamLeave, "hours">) {
  return l.hours != null ? ` · ${fmtLeaveHours(l.hours)}` : "";
}

/** คำขอหนึ่งใบในคิวของ GM */
export type GmPending = {
  key: string;
  kind: "leave" | "ot" | "expense";
  name: string;
  /** สรุปคำขอหนึ่งบรรทัด — ประเภทการลา + วันที่ / ทำงานล่วงเวลา X ชม. / ค่าน้ำมัน */
  what: string;
  /** leave: ประเภทการลา + ช่วงวัน (ให้หน้าจอจัดรูปวันที่เอง) */
  from?: string;
  to?: string;
  /** ot: วันที่ทำโอที */
  date?: string;
  /** "yyyy-mm-dd hh:mm" เวลาที่ยื่น — เรียงเก่าสุดก่อน */
  at: string;
};

const GM: Role = "gm";

export function useTeamLeave(): TeamLeave[] {
  const hr = useHr();
  const time = useHrTime();
  const extra = useEmpRequests();
  const byRole = useAllLeave();
  const route = useApprovalRoute();

  return useMemo(() => {
    const nameOf = new Map(hr.emp.map((e) => [e.id, displayName(e)]));
    const gmLeaveFrom = new Set(approvesFor(GM, route).filter((d) => d.kind === "leave").map((d) => d.from));
    const out: TeamLeave[] = [];

    /* อนุมัติแล้วจากทะเบียน — เก็บเป็นรายวัน รวมวันติดกันที่ประเภทเดียวกันเป็นช่วงเดียว */
    for (const [emp, rec] of Object.entries(time)) {
      const days = [...(rec.leave ?? [])].sort((a, b) => a.d.localeCompare(b.d));
      let last: TeamLeave | undefined;
      for (const l of days) {
        const type = HR_LEAVE_LABEL[l.type as keyof typeof HR_LEAVE_LABEL] ?? "ลา";
        /* ลาไม่เต็มวันแยกเป็นแถวของตัวเอง ไม่รวมเข้าช่วงลาเต็มวัน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
        const partial = l.span === "half";
        if (!partial && last && last.hours == null && last.type === type && addDays(last.to, 1) === l.d) {
          last.to = l.d;
          continue;
        }
        last = { key: `hr-${emp}-${l.d}`, emp, name: nameOf.get(emp) ?? emp, from: l.d, to: l.d, type, pending: false, mine: false, ...(partial ? { hours: leaveRowHours(l) } : {}) };
        out.push(last);
      }
    }

    /* คำขอของทีมงานที่ยังไม่มีบัญชี — อนุมัติแล้วยังไม่ไหลเข้าทะเบียน จึงนับจากตรงนี้ด้วย */
    for (const r of extra) {
      if (r.kind !== "leave" || r.status === "rejected" || !r.from) continue;
      const pending = r.status === "pending";
      /* ตั้งแต่ 23 ก.ย. 2569 ใบที่อนุมัติแล้วไหลเข้าทะเบียนเวลาทำงานแล้ว (hr-link · addEmpRequests)
         ลงซ้ำที่นี่อีกครั้งจะขึ้นสองแถวในรายการลาของสัปดาห์ */
      if (!pending && (time[r.emp]?.leave ?? []).some((l) => l.d === r.from)) continue;
      out.push({
        key: `emp-${r.id}`, emp: r.emp, name: nameOf.get(r.emp) ?? r.emp,
        from: r.from, to: r.toDate || r.from, type: r.leaveType ?? "ลา", pending,
        ...(r.span === "half" ? { hours: empReqLeaveHours(r) } : {}),
        id: pending ? r.id : undefined, mine: pending && r.to === GM,
      });
    }

    /* ใบลารออนุมัติของบทบาทที่ล็อกอินได้ — บัญชีกับบุคคลเป็นคนเดียวกัน กันซ้ำด้วยรหัสใบ */
    const seen = new Set<string>();
    for (const [role, emp] of Object.entries(ROLE_EMPLOYEE)) {
      if (!emp) continue;
      for (const v of byRole[role as Role] ?? []) {
        if (v.status !== "รอการอนุมัติ" || seen.has(v.id)) continue;
        seen.add(v.id);
        out.push({
          key: `role-${role}-${v.id}`, emp, name: nameOf.get(emp) ?? empNameOf(USERS[role as Role].name),
          from: v.date, to: v.toDate || v.date, type: v.type, pending: true,
          ...(v.days < 1 ? { hours: leaveHoursOf(v) } : {}),
          id: v.id, mine: gmLeaveFrom.has(role as Role),
        });
      }
    }
    return out.sort((a, b) => a.from.localeCompare(b.from) || a.name.localeCompare(b.name));
  }, [hr.emp, time, extra, byRole, route]);
}

/** คิวรออนุมัติของ GM — เรียงรอนานสุดก่อน */
export function useGmPending(): GmPending[] {
  const hr = useHr();
  const extra = useEmpRequests();
  const leaves = useAllLeave();
  const ots = useAllOt();
  const claims = useAllClaims();
  const route = useApprovalRoute();

  return useMemo(() => {
    const out: GmPending[] = [];
    for (const { kind, from } of approvesFor(GM, route)) {
      const name = empNameOf(USERS[from].name);
      if (kind === "leave")
        for (const v of leaves[from])
          if (v.status === "รอการอนุมัติ")
            out.push({ key: `lv-${from}-${v.id}`, kind, name, what: v.type, from: v.date, to: v.toDate || v.date, at: v.submittedAt || `${v.date} 00:00` });
      if (kind === "ot")
        for (const v of ots[from])
          if (v.status === "รออนุมัติ")
            out.push({ key: `ot-${from}-${v.id}`, kind, name, what: `OT ${v.hours} ชม.`, date: v.date, at: v.submittedAt || `${v.date} 00:00` });
      if (kind === "expense")
        for (const v of claims[from])
          if (v.status === "รออนุมัติ")
            out.push({ key: `ex-${from}-${v.month}`, kind, name, what: `ค่าน้ำมัน ${thaiMonth(v.month)}`, at: v.submittedAt || `${v.month}-01 00:00` });
    }
    const nameOf = new Map(hr.emp.map((e) => [e.id, displayName(e)]));
    for (const r of extra) {
      if (r.to !== GM || r.status !== "pending") continue;
      /* ใบของ GM เองไม่เข้าคิวของตัวเอง */
      if (r.emp === ROLE_EMPLOYEE.gm) continue;
      const name = nameOf.get(r.emp) ?? r.emp;
      if (r.kind === "leave")
        out.push({ key: `emp-${r.id}`, kind: "leave", name, what: r.leaveType ?? "ลา", from: r.from, to: r.toDate || r.from, at: r.at });
      else if (r.kind === "ot")
        out.push({ key: `emp-${r.id}`, kind: "ot", name, what: `OT ${r.hours ?? 0} ชม.`, date: r.date, at: r.at });
      else out.push({ key: `emp-${r.id}`, kind: "expense", name, what: `ค่าน้ำมัน ${thaiMonth(r.month ?? "")}`, at: r.at });
    }
    return out.sort((a, b) => a.at.localeCompare(b.at));
  }, [hr.emp, extra, leaves, ots, claims, route]);
}

/** ช่วงวันที่หนึ่งช่วงของกราฟ (yyyy-mm-dd ทั้งสองข้าง รวมวันสุดท้าย) */
export type DateSpan = { from: string; to: string };

/** วันที่ตกช่วงไหน — ไม่ตกช่วงไหนเลย = -1 */
function spanIndex(spans: DateSpan[], iso: string) {
  if (!iso) return -1;
  return spans.findIndex((b) => iso >= b.from && iso <= b.to);
}
const spansKey = (spans: DateSpan[]) => spans.map((b) => `${b.from}_${b.to}`).join(",");
const spansOf = (key: string): DateSpan[] =>
  key
    ? key.split(",").map((k) => {
        const [from, to] = k.split("_");
        return { from, to };
      })
    : [];

/** ชั่วโมงโอทีที่อนุมัติแล้วทั้งบริษัท แยกตามช่วงวันที่ (ตามวันที่ทำโอที) ตามลำดับของ spans */
export function useApprovedOt(spans: DateSpan[]): number[] {
  /* useHrTime รวมโอทีที่อนุมัติแล้วใน emp-requests ไว้แล้ว (hr-link · addEmpRequests) — นับซ้ำที่นี่อีกจะเกินสองเท่า */
  const time = useHrTime();
  const key = spansKey(spans);
  return useMemo(() => {
    const ss = spansOf(key);
    const h = ss.map(() => 0);
    for (const rec of Object.values(time))
      for (const x of rec.ot ?? []) {
        const i = spanIndex(ss, x.d);
        if (i >= 0) h[i] += x.h;
      }
    return h.map((v) => Math.round(v * 100) / 100);
  }, [time, key]);
}

/**
 * ค่าเดินทาง (ค่าน้ำมัน) ในใบเบิกที่ GM อนุมัติแล้ว แยกตามช่วงวันที่ (ตามวันที่เดินทางของแต่ละแถว) ตามลำดับของ spans
 * ใบของบทบาทตามสายอนุมัติ + ใบของทีมงานใน emp-requests ที่ส่งถึง GM · ไม่รวมใบของ GM เอง
 * ค่าคอมมิชชั่น CEO เป็นผู้อนุมัติ ไม่ใช่ GM จึงไม่นับที่นี่ (ผู้ใช้สั่ง 20 ต.ค. 2569)
 */
export function useGmApprovedTravel(spans: DateSpan[]): number[] {
  const claims = useAllClaims();
  const extra = useEmpRequests();
  const route = useApprovalRoute();
  const key = spansKey(spans);
  return useMemo(() => {
    const ss = spansOf(key);
    const sum = ss.map(() => 0);
    const add = (iso: string, v: number) => {
      const i = spanIndex(ss, iso);
      if (i >= 0) sum[i] += v;
    };
    for (const { kind, from } of approvesFor(GM, route)) {
      if (kind !== "expense") continue;
      for (const c of claims[from] ?? []) {
        if (c.status !== "อนุมัติแล้ว") continue;
        for (const f of c.fuel) add(f.date || `${c.month}-01`, fuelAmount(f));
      }
    }
    for (const r of extra) {
      if (r.to !== GM || r.kind !== "expense" || r.status !== "approved" || r.emp === ROLE_EMPLOYEE.gm) continue;
      for (const f of r.fuel ?? []) add(f.date || `${r.month ?? ""}-01`, fuelAmount(f));
    }
    return sum.map((v) => Math.round(v));
  }, [claims, extra, route, key]);
}
