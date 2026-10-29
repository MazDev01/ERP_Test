"use client";

import {
  EXPENSE_CLAIMS,
  TRAVEL_KIND,
  isFuelType,
  keyOf,
  parseClaimKey,
  splitClaim,
  type ExpenseClaim,
  type FuelRow,
  type LegacyClaim,
  type OtherRow,
} from "./expense-data";
import { addMissingClaims, checkClaim, claimApproveBlock, isLocked } from "./expense-data";
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
  addMissingClaims,
  splitMixed,
);

/** เลขที่ใบเบิกทุกใบที่ใช้ไปแล้วทั้งบริษัท — ใบของทุกบทบาท ใบของทีมงานที่ยังไม่มีบัญชี (emp-requests) และใบที่จ่ายคืนไปแล้ว (HR_REIMB) */
function usedNos(all: ExpenseClaim[][]) {
  return [
    ...all.flat().flatMap((c) => (c.no ? [c.no] : [])),
    ...empRequestIds("expense"),
    ...HR_REIMB.map((r) => r.no),
  ];
}

/*
 * ใบเก่าที่ปนหลายประเภทในใบเดียว → แยกเป็นใบละประเภท (ผู้ใช้สั่ง 29 ต.ค. 2569)
 * ทำทีเดียวทุกบทบาท เพราะใบที่แยกออกไปของใบที่มีเลขแล้วต้องได้เลขใหม่ที่ไม่ซ้ำทั้งบริษัท
 */
function splitMixed(all: Partial<Record<Role, ExpenseClaim[]>>) {
  const slices = Object.values(all).filter((v): v is ExpenseClaim[] => Array.isArray(v));
  const taken = usedNos(slices);
  const nextNo = () => {
    const no = nextDocNo("EX", taken);
    taken.push(no);
    return no;
  };
  const out = { ...all };
  for (const r of Object.keys(out) as Role[]) {
    const v = out[r];
    if (Array.isArray(v)) out[r] = (v as LegacyClaim[]).flatMap((c) => splitClaim(c, nextNo));
  }
  return out;
}

export function useExpenseClaims() {
  return store.use();
}

export function monthKey(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** ใบเบิกของเดือนและประเภทนั้น (key = claimKey) ถ้ายังไม่มีให้ถือเป็นใบร่างเปล่า จะได้กรอกได้เลย */
export function claimOf(claims: ExpenseClaim[], key: string): ExpenseClaim {
  const { month, type } = parseClaimKey(key);
  return (
    claims.find((c) => keyOf(c) === key) ?? {
      month,
      type,
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

/*
 * แก้ใบเบิกใบนั้น (key = เดือน + ประเภท) ถ้ายังไม่มีในสโตร์ก็สร้างให้
 *
 * ใบที่ยื่นไปแล้ว (รออนุมัติ / อนุมัติแล้ว) แก้ไม่ได้ กันไว้ที่นี่ ไม่ใช่เชื่อหน้าจออย่างเดียว
 * (กติกาเดียวกับ submitClaim — "กันที่ชั้นสโตร์" เจ้าของสั่ง 24 ก.ย. 2569)
 * ถ้าแก้ได้หลังยื่น ตัวเลขที่ผู้อนุมัติเห็นกับตัวเลขที่เจ้าตัวแก้จะคนละชุดกัน
 * allowLocked มีไว้ให้การเปลี่ยนสถานะที่ตั้งใจ เช่นดึงใบกลับมาแก้ (withdrawClaim)
 */
function edit(
  key: string,
  patch: (c: ExpenseClaim) => ExpenseClaim,
  allowLocked = false,
) {
  store.update((claims) => {
    const found = claims.some((c) => keyOf(c) === key);
    if (!found) return [patch(claimOf(claims, key)), ...claims];
    return claims.map((c) =>
      keyOf(c) === key && (allowLocked || !isLocked(c.status)) ? patch(c) : c,
    );
  });
}

export function setClaimField(key: string, field: "plate" | "nickname", value: string) {
  edit(key, (c) => ({ ...c, [field]: value }));
}

/*
 * init = ค่าตั้งต้นของแถว (ใช้ตอนเริ่มกรอกแถวว่างที่หน้าจอเติมให้ในเดือนที่ยังไม่มีรายการ)
 * หนึ่งใบหนึ่งประเภท — แถวค่าน้ำมันลงได้เฉพาะใบค่าน้ำมัน และเป็นรถชนิดของใบเสมอ (ผู้ใช้สั่ง 29 ต.ค. 2569)
 */
export function addFuelRow(key: string, init: Partial<FuelRow> = {}) {
  edit(key, (c) =>
    isFuelType(c.type)
      ? {
          ...c,
          fuel: [...c.fuel, { id: newId("F"), date: "", place: "", km: "", work: "", note: "", ...init, vehicle: c.type }],
        }
      : c,
  );
}

export function updateFuelRow(
  key: string,
  id: string,
  patch: Partial<Omit<FuelRow, "id" | "vehicle">>,
) {
  edit(key, (c) => ({
    ...c,
    fuel: c.fuel.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  }));
}

export function removeFuelRow(key: string, id: string) {
  edit(key, (c) => ({ ...c, fuel: c.fuel.filter((r) => r.id !== id) }));
}

/* ค่าเดินทาง / ค่าใช้จ่ายอื่น — หัวข้อ วันที่ จำนวนเงิน รายละเอียด และหลักฐาน
   ลงได้เฉพาะใบที่ไม่ใช่ค่าน้ำมัน · ใบค่าเดินทางตั้งหัวข้อ "ค่าเดินทาง" ให้ทุกแถว (ผู้ใช้สั่ง 29 ต.ค. 2569) */
export function addOtherRow(key: string, init: Partial<OtherRow> = {}) {
  edit(key, (c) =>
    isFuelType(c.type)
      ? c
      : {
          ...c,
          other: [
            ...(c.other ?? []),
            {
              id: newId("O"),
              kind: "",
              date: "",
              amount: "",
              note: "",
              ...init,
              ...(c.type === "travel" ? { kind: TRAVEL_KIND } : {}),
            },
          ],
        },
  );
}

export function updateOtherRow(key: string, id: string, patch: Partial<Omit<OtherRow, "id">>) {
  edit(key, (c) => ({
    ...c,
    other: (c.other ?? []).map((r) =>
      r.id === id ? { ...r, ...patch, ...(c.type === "travel" ? { kind: TRAVEL_KIND } : {}) } : r,
    ),
  }));
}

export function removeOtherRow(key: string, id: string) {
  edit(key, (c) => ({ ...c, other: (c.other ?? []).filter((r) => r.id !== id) }));
}

/**
 * ยื่นใบเบิก — คืน false ถ้ายื่นไม่ได้ (กรอกไม่ครบ) โดยไม่เปลี่ยนสถานะใบ
 * ล็อกใบไว้ไม่ให้แก้ต่อ และบันทึกเวลาที่ยื่น
 *
 * ตรวจซ้ำที่นี่ ไม่ใช่เชื่อหน้าจออย่างเดียว (เจ้าของสั่ง 24 ก.ย. 2569)
 * "กันที่การส่ง ไม่ใช่ที่การอนุมัติ" — ถ้าหน้าจอไหนลืมตรวจ ใบที่กรอกไม่ครบก็ยังหลุดไปถึง GM ได้
 */
export function submitClaim(key: string) {
  const draft = store.current().find((c) => keyOf(c) === key);
  if (!draft || !checkClaim(draft).ok) return false;
  const stamp = bkkNow();
  /* เลขที่ใบเบิกเดินต่อกันทั้งบริษัท — หนึ่งใบ (หนึ่งประเภท) หนึ่งเลข */
  const no = nextDocNo("EX", usedNos(store.all()));
  /* ใบที่ยกเลิกไปแล้วยื่นใหม่ได้ด้วยเลขเดิม เหมือนใบที่ถูกตีกลับ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  edit(key, (c) =>
    c.status === "ร่าง" || c.status === "ไม่อนุมัติ" || c.status === "ยกเลิก"
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

/** หัวหน้าอนุมัติใบเบิกใบนั้น (key = เดือน + ประเภท) */
export function approveClaim(role: Role, key: string, comment: string) {
  /* ใบที่ตัดสินไปแล้วไม่ส่งแจ้งเตือนซ้ำ — เช็คก่อนส่ง เหมือนใบลาและโอที */
  if (!store.ofRole(role).some((c) => keyOf(c) === key && c.status === "รออนุมัติ")) return;
  /* ใบที่มีค่าคอมมิชชั่น/อินเซนทีฟอนุมัติไม่ได้ — กันที่สโตร์ด้วย ไม่ใช่แค่ปุ่มบนหน้าจอ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  if (store.ofRole(role).some((c) => keyOf(c) === key && c.status === "รออนุมัติ" && claimApproveBlock(c))) return;
  store.updateRole(role, (claims) =>
    claims.map((c) =>
      keyOf(c) === key && c.status === "รออนุมัติ"
        ? { ...c, status: "อนุมัติแล้ว" as const, comment, decidedAt: stampNow() }
        : c,
    ),
  );
}

export function rejectClaim(role: Role, key: string, comment: string) {
  if (!store.ofRole(role).some((c) => keyOf(c) === key && c.status === "รออนุมัติ")) return;
  store.updateRole(role, (claims) =>
    claims.map((c) =>
      keyOf(c) === key && c.status === "รออนุมัติ"
        ? { ...c, status: "ไม่อนุมัติ" as const, comment, decidedAt: stampNow() }
        : c,
    ),
  );
}

/**
 * ปิดรอบเงินเดือนแล้ว → ใบเบิกที่รวมอยู่ในรอบนั้นถือว่าจ่ายคืนแล้ว (เรียกผ่าน closePayrunFlow เท่านั้น)
 * ใบที่จ่ายแล้วไม่ถูกนับซ้ำในรอบถัดไป · ใบที่ยังไม่จ่ายเข้ารอบถัดไปเสมอ ไม่หล่นหาย
 * key = กุญแจของใบ (เดือน + ประเภท) — เดือนเดียวกันมีหลายใบได้ จ่ายทีละใบ (ผู้ใช้สั่ง 29 ต.ค. 2569)
 */
export function markReimbursed(items: { role: Role; key: string }[], payMonth: string) {
  for (const it of items) {
    store.updateRole(it.role, (claims) =>
      claims.map((c) =>
        keyOf(c) === it.key && c.status === "อนุมัติแล้ว" && !c.paidIn ? { ...c, paidIn: payMonth } : c,
      ),
    );
  }
}

export function resetExpenseClaims() {
  store.reset();
}

/** ยกเลิกใบที่รออนุมัติ — ใบยังอยู่ในรายการเป็นสถานะ "ยกเลิก" (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export function cancelClaim(key: string) {
  edit(key, (c) => (c.status === "รออนุมัติ" ? { ...c, status: "ยกเลิก" } : c), true);
}

/** ดึงใบที่ยื่นไปแล้วกลับมาแก้ ทำได้ตราบใดที่หัวหน้ายังไม่อนุมัติ */
export function withdrawClaim(key: string) {
  edit(
    key,
    (c) => (c.status === "รออนุมัติ" ? { ...c, status: "ร่าง", submittedAt: "" } : c),
    true,
  );
}
