"use client";

/*
 * ประวัติการตั้งค่า — ทุกครั้งที่ผู้ดูแลระบบเปลี่ยนค่าที่มีผลกับบทบาทอื่น บันทึกไว้ที่นี่
 * ใช้ตอบคำถามว่า "ทำไมวันนี้เข้างานเก้าโมงครึ่งแล้วสาย" ได้ว่าใครเปลี่ยนเมื่อไร
 *
 * บันทึกจากหน้าจอของผู้ดูแล (หลังเรียกฟังก์ชันบันทึก) ไม่ได้ดักในสโตร์
 * เพราะข้อความต้องบอกเป็นภาษาคนว่าเปลี่ยนอะไรจากอะไรเป็นอะไร ซึ่งหน้าจอรู้ดีที่สุด
 * เก็บย้อนหลังไม่เกิน LOG_LIMIT รายการ — ยังไม่มี backend ถ้าเก็บไม่จำกัด localStorage จะเต็ม
 */

import { useSyncExternalStore } from "react";
import { bkkStamp } from "./format";
import { RETIRED_ADMIN_NAME, USERS } from "./mock-data";
import { createPersistedStore } from "./persisted-store";
import { currentProfile } from "./profile-data";

export type LogArea =
  | "บัญชีผู้ใช้"
  | "บทบาทและสิทธิ์"
  | "เวลาทำงาน"
  | "วันหยุดบริษัท"
  | "การลา"
  | "พื้นที่เข้างาน"
  | "ข้อมูลบริษัท"
  | "อัตราและภาษี"
  | "เลขที่เอกสาร"
  | "ข้อมูลตัวอย่าง"
  | "การเชื่อมต่อ"
  | "ตัวเลือกในรายการ"
  /* หน้าตำแหน่งและสายอนุมัติ เพิ่ม 28 ก.ย. 2569 (Full Proposal · M5) */
  | "ตำแหน่งและสายอนุมัติ";

export type LogEntry = { id: string; at: string; by: string; area: LogArea; detail: string };

const LOG_LIMIT = 300;

/** คนจริงที่ถือสิทธิ์ผู้ดูแลระบบ — ฝ่ายบุคคล (ดู ADMIN_BACKUP ใน role.ts) */
const ADMIN_OWNER = USERS.hr.name;

/*
 * ประวัติที่บันทึกไว้ก่อน 24 ก.ย. 2569 ลงชื่อผู้ดูแลระบบที่เป็นคนสมมติไว้ทุกรายการ
 * ชื่อที่ไม่มีตัวตนทำให้ตรวจย้อนไม่ได้ว่าใครแก้ จึงเปลี่ยนเป็นคนจริงที่ถือสิทธิ์นี้ (ฝ่ายบุคคล)
 * ไม่เปลี่ยนคีย์สโตร์ เพราะจะทิ้งประวัติที่เก็บไว้ในเครื่องไปด้วย
 */
function renameRetiredAdmin(list: LogEntry[]): LogEntry[] {
  return list.some((e) => e.by === RETIRED_ADMIN_NAME)
    ? list.map((e) => (e.by === RETIRED_ADMIN_NAME ? { ...e, by: ADMIN_OWNER } : e))
    : list;
}

const store = createPersistedStore<LogEntry[]>(
  "maz-erp.admin-log.v1",
  [],
  (v): v is LogEntry[] => Array.isArray(v),
  renameRetiredAdmin,
);

export function useAdminLog() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function logChange(area: LogArea, detail: string) {
  /* ลงประวัติแล้วแจ้งบทบาทที่ได้รับผลเข้า LINE ด้วย — เกณฑ์เดียวกับกระดิ่งในระบบ */
  const entry: LogEntry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: bkkStamp(),
    /* ชื่อคนที่ล็อกอินอยู่จริงตอนนั้น ไม่ใช่ชื่อตายตัวของบทบาทผู้ดูแลระบบ
       ฝ่ายบุคคลกับผู้บริหารถือสิทธิ์นี้คนละคน ประวัติต้องแยกออกว่าใครเป็นคนแก้ */
    by: currentProfile().name,
    area,
    detail,
  };
  store.update((list) => [entry, ...list].slice(0, LOG_LIMIT));
}

export function clearAdminLog() {
  store.reset();
}
