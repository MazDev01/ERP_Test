"use client";

import {
  EXPENSE_CLAIMS,
  type ExpenseClaim,
  type FuelRow,
  type OtherRow,
} from "./expense-data";
import { checkClaim, isLocked } from "./expense-data";
import { bkkNow, nextDocNo, pad2 } from "./format";
import type { Role } from "./role";
import { empRequestIds } from "./emp-requests";
import { HR_REIMB } from "./hr-data";
import { createRoleStore } from "./role-store";

/* ใบเบิกของผู้ที่ล็อกอินอยู่ — แยกเก็บตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน
   v4 — ใบตั้งต้นที่ยื่นแล้วมีเลขที่เอกสารครบทุกใบ (23 ก.ย. 2569) ของเดิมในเครื่องบางใบไม่มีเลข
   จึงขึ้นรุ่นใหม่ให้อ่านชุดตั้งต้นที่มีเลขแทน ไม่งั้นรายละเอียดเงินเดือนจะขึ้นเลขที่เป็น "—" */
const store = createRoleStore<ExpenseClaim[]>(
  "maz-erp.expense.v4",
  EXPENSE_CLAIMS,
  (v): v is ExpenseClaim[] => Array.isArray(v),
  /* ค่าคอมย้ายไปคิดในเงินเดือนแล้ว (ERD) — ใบที่ยังไม่ตัดสินต้องไม่มีรายการค่าคอมค้าง
     ไม่งั้นยอดเบิกจะรวมค่าคอมที่มองไม่เห็นบนหน้าจอ · ใบที่อนุมัติไปแล้วเก็บไว้เป็นประวัติ */
  (claims) =>
    claims.map((c) =>
      (c.status === "ร่าง" || c.status === "รออนุมัติ") && c.income.length ? { ...c, income: [] } : c,
    ),
);

export function useExpenseClaims() {
  return store.use();
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** ใบเบิกของเดือนนั้น ถ้ายังไม่มีให้ถือเป็นใบร่างเปล่า จะได้กรอกได้เลย */
export function claimOf(claims: ExpenseClaim[], month: string): ExpenseClaim {
  return (
    claims.find((c) => c.month === month) ?? {
      month,
      status: "ร่าง",
      plate: "",
      nickname: "",
      fuel: [],
      income: [],
      comment: "",
      submittedAt: "",
    }
  );
}

function stampNow() {
  const d = bkkNow();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function newId(prefix: string) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** แก้ใบของเดือนนั้น ถ้ายังไม่มีในสโตร์ก็สร้างให้ */
/*
 * แก้ใบเบิกของเดือนนั้น
 *
 * ใบที่ยื่นไปแล้ว (รออนุมัติ / อนุมัติแล้ว) แก้ไม่ได้ กันไว้ที่นี่ ไม่ใช่เชื่อหน้าจออย่างเดียว
 * (กติกาเดียวกับ submitClaim — "กันที่ชั้นสโตร์" เจ้าของสั่ง 24 ก.ย. 2569)
 * ถ้าแก้ได้หลังยื่น ตัวเลขที่ผู้อนุมัติเห็นกับตัวเลขที่เจ้าตัวแก้จะคนละชุดกัน
 * allowLocked มีไว้ให้การเปลี่ยนสถานะที่ตั้งใจ เช่นดึงใบกลับมาแก้ (withdrawClaim)
 */
function edit(
  month: string,
  patch: (c: ExpenseClaim) => ExpenseClaim,
  allowLocked = false,
) {
  store.update((claims) => {
    const found = claims.some((c) => c.month === month);
    if (!found) return [patch(claimOf(claims, month)), ...claims];
    return claims.map((c) =>
      c.month === month && (allowLocked || !isLocked(c.status)) ? patch(c) : c,
    );
  });
}

export function setClaimField(
  month: string,
  field: "plate" | "nickname",
  value: string,
) {
  edit(month, (c) => ({ ...c, [field]: value }));
}

/** init = ค่าตั้งต้นของแถว (ใช้ตอนเริ่มกรอกแถวว่างที่หน้าจอเติมให้ในเดือนที่ยังไม่มีรายการ) */
export function addFuelRow(month: string, init: Partial<FuelRow> = {}) {
  edit(month, (c) => ({
    ...c,
    fuel: [...c.fuel, { id: newId("F"), date: "", place: "", km: "", work: "", note: "", ...init }],
  }));
}

export function updateFuelRow(
  month: string,
  id: string,
  patch: Partial<Omit<FuelRow, "id">>,
) {
  edit(month, (c) => ({
    ...c,
    fuel: c.fuel.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  }));
}

export function removeFuelRow(month: string, id: string) {
  edit(month, (c) => ({ ...c, fuel: c.fuel.filter((r) => r.id !== id) }));
}

/* ค่าใช้จ่ายอื่นนอกจากค่าน้ำมัน — ประเภท วันที่ จำนวนเงิน รายละเอียด และหลักฐาน */
export function addOtherRow(month: string, init: Partial<OtherRow> = {}) {
  edit(month, (c) => ({
    ...c,
    other: [...(c.other ?? []), { id: newId("O"), kind: "", date: "", amount: "", note: "", ...init }],
  }));
}

export function updateOtherRow(month: string, id: string, patch: Partial<Omit<OtherRow, "id">>) {
  edit(month, (c) => ({
    ...c,
    other: (c.other ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
  }));
}

export function removeOtherRow(month: string, id: string) {
  edit(month, (c) => ({ ...c, other: (c.other ?? []).filter((r) => r.id !== id) }));
}

/** ส่งขออนุมัติ — ล็อกใบไว้ไม่ให้แก้ต่อ และบันทึกเวลาที่ยื่น */
/**
 * ยื่นใบเบิก — คืน false ถ้ายื่นไม่ได้ (กรอกไม่ครบ) โดยไม่เปลี่ยนสถานะใบ
 *
 * ตรวจซ้ำที่นี่ ไม่ใช่เชื่อหน้าจออย่างเดียว (เจ้าของสั่ง 24 ก.ย. 2569)
 * "กันที่การส่ง ไม่ใช่ที่การอนุมัติ" — ถ้าหน้าจอไหนลืมตรวจ ใบที่กรอกไม่ครบก็ยังหลุดไปถึง GM ได้
 */
export function submitClaim(month: string) {
  const draft = store.current().find((c) => c.month === month);
  if (!draft || !checkClaim(draft).ok) return false;
  const stamp = bkkNow();
  /* เลขที่ใบเบิกเดินต่อกันทั้งบริษัท — รวมใบของทีมงานที่ยังไม่มีบัญชี (emp-requests) และใบที่จ่ายคืนไปแล้ว (HR_REIMB) */
  const no = nextDocNo("EX", [
    ...store.all().flat().flatMap((c) => (c.no ? [c.no] : [])),
    ...empRequestIds("expense"),
    ...HR_REIMB.map((r) => r.no),
  ]);
  const mine = store.current().find((c) => c.month === month);
  if (mine && (mine.status === "ร่าง" || mine.status === "ไม่อนุมัติ")) {
  }
  edit(month, (c) =>
    c.status === "ร่าง" || c.status === "ไม่อนุมัติ"
      ? {
          ...c,
          status: "รออนุมัติ",
          /* ยื่นใหม่หลังถูกตีกลับใช้เลขเดิม */
          no: c.no ?? no,
          comment: "",
          submittedAt: `${stamp.getFullYear()}-${pad2(stamp.getMonth() + 1)}-${pad2(stamp.getDate())} ${pad2(stamp.getHours())}:${pad2(stamp.getMinutes())}`,
        }
      : c,
  );
  return true;
}

/** ใบเบิกของทุกบทบาท — หน้าอนุมัติเท่านั้น */
export function useAllClaims() {
  return store.useAll();
}

/** หัวหน้าอนุมัติใบเบิกของเดือนนั้น */
export function approveClaim(role: Role, month: string, comment: string) {
  /* ใบที่ตัดสินไปแล้วไม่ส่งแจ้งเตือนซ้ำ — เช็คก่อนส่ง เหมือนใบลาและโอที */
  if (!store.ofRole(role).some((c) => c.month === month && c.status === "รออนุมัติ")) return;
  store.updateRole(role, (claims) =>
    claims.map((c) =>
      c.month === month && c.status === "รออนุมัติ"
        ? { ...c, status: "อนุมัติแล้ว" as const, comment, decidedAt: stampNow() }
        : c,
    ),
  );
}

export function rejectClaim(role: Role, month: string, comment: string) {
  if (!store.ofRole(role).some((c) => c.month === month && c.status === "รออนุมัติ")) return;
  store.updateRole(role, (claims) =>
    claims.map((c) =>
      c.month === month && c.status === "รออนุมัติ"
        ? { ...c, status: "ไม่อนุมัติ" as const, comment, decidedAt: stampNow() }
        : c,
    ),
  );
}

/**
 * ปิดรอบเงินเดือนแล้ว → ใบเบิกที่รวมอยู่ในรอบนั้นถือว่าจ่ายคืนแล้ว (เรียกผ่าน closePayrunFlow เท่านั้น)
 * ใบที่จ่ายแล้วไม่ถูกนับซ้ำในรอบถัดไป · ใบที่ยังไม่จ่ายเข้ารอบถัดไปเสมอ ไม่หล่นหาย
 */
export function markReimbursed(items: { role: Role; month: string }[], payMonth: string) {
  for (const it of items) {
    store.updateRole(it.role, (claims) =>
      claims.map((c) =>
        c.month === it.month && c.status === "อนุมัติแล้ว" && !c.paidIn ? { ...c, paidIn: payMonth } : c,
      ),
    );
  }
}

export function resetExpenseClaims() {
  store.reset();
}

/** ดึงใบที่ยื่นไปแล้วกลับมาแก้ ทำได้ตราบใดที่หัวหน้ายังไม่อนุมัติ */
export function withdrawClaim(month: string) {
  edit(
    month,
    (c) => (c.status === "รออนุมัติ" ? { ...c, status: "ร่าง", submittedAt: "" } : c),
    true,
  );
}
