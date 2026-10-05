"use client";
import { bkkStamp, nextDocNo } from "./format";

import { OT_RECORDS, type OtRecord } from "./ot-data";
import type { Role } from "./role";
import { createRoleStore } from "./role-store";

/* คำขอโอทีของผู้ที่ล็อกอินอยู่ — แยกเก็บตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน */
const store = createRoleStore<OtRecord[]>(
  "maz-erp.ot.v2",
  OT_RECORDS,
  (v): v is OtRecord[] => Array.isArray(v),
);

export function useOtRecords() {
  return store.use();
}

export function addOtRequest(input: {
  date: string;
  startMin: number;
  endMin: number;
  hours: number;
  reason: string;
}) {
  const record: OtRecord = {
    /* เลขที่ใบขอตาม ERD: OT-ปี พ.ศ.-ลำดับ เดินต่อกันทั้งบริษัท */
    id: nextDocNo("OT", store.all().flat().map((r) => r.id)),
    date: input.date,
    startMin: input.startMin,
    endMin: input.endMin,
    hours: input.hours,
    approvedHours: null,
    reason: input.reason,
    status: "รออนุมัติ",
    comment: "",
    submittedAt: bkkStamp(),
  };
  store.update((rs) => [record, ...rs]);
  return record;
}

/*
 * ยกเลิกคำขอโอทีของตัวเอง — ได้เฉพาะใบที่ยังไม่ถูกตัดสิน
 * กันที่นี่เหมือนใบลา (cancelLeaveRequest) ไม่ใช่เชื่อว่าหน้าจอซ่อนปุ่มให้แล้ว
 * ใบที่อนุมัติไปแล้วถูกพลิกเป็น "ยกเลิก" = ชั่วโมงที่คิดเงินไปแล้วหายจากรอบ
 */
export function cancelOtRequest(id: string) {
  store.update((rs) =>
    rs.map((r) =>
      r.id === id && r.status === "รออนุมัติ" ? { ...r, status: "ยกเลิก" as const } : r,
    ),
  );
}

/** คำขอโอทีของทุกบทบาท — หน้าอนุมัติเท่านั้น */
export function useAllOt() {
  return store.useAll();
}

/** หัวหน้าอนุมัติโอที — ปรับชั่วโมงที่อนุมัติได้ เช่นตัดตามเวลาตอกบัตรจริง */
export function approveOt(role: Role, id: string, approvedHours: number, comment: string) {
  store.updateRole(role, (rs) =>
    rs.map((r) =>
      r.id === id && r.status === "รออนุมัติ"
        ? { ...r, status: "อนุมัติแล้ว" as const, approvedHours, comment, decidedAt: bkkStamp() }
        : r,
    ),
  );
}

export function rejectOt(role: Role, id: string, comment: string) {
  store.updateRole(role, (rs) =>
    rs.map((r) =>
      r.id === id && r.status === "รออนุมัติ"
        ? { ...r, status: "ไม่อนุมัติ" as const, approvedHours: null, comment, decidedAt: bkkStamp() }
        : r,
    ),
  );
}

export function resetOtRecords() {
  store.reset();
}
