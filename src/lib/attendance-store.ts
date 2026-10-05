"use client";

import { useSyncExternalStore } from "react";
import { loadRecords, saveRecords, type PunchRecord } from "./attendance";
import { currentRole, ROLES, subscribeRole, type Role } from "./role";

/*
 * localStorage และนาฬิกาเป็น "external store" ในสายตา React
 * จึงอ่านผ่าน useSyncExternalStore แทนการ setState ใน useEffect
 * (React 19 ห้าม setState ใน effect body — ทำให้ render ซ้อนกัน)
 */

// ─── รายการตอกบัตร ────────────────────────────────────────────────
const EMPTY: PunchRecord[] = [];
let recordsCache: PunchRecord[] | null = null;
/* จำไว้ว่าแคชเป็นของบทบาทไหน พอสลับบทบาทต้องอ่านของคนใหม่ ไม่ใช้ของเดิมค้าง */
let cachedRole: Role | null = null;
/** เพิ่มขึ้นทุกครั้งที่การตอกบัตรเปลี่ยน — ใช้บอก snapshot รวมว่าต้องอ่านใหม่ */
let version = 0;
const recordListeners = new Set<() => void>();

function bump() {
  version += 1;
  for (const listener of recordListeners) listener();
}

export function subscribeRecords(onChange: () => void) {
  recordListeners.add(onChange);
  const offRole = subscribeRole(onChange);
  return () => {
    recordListeners.delete(onChange);
    offRole();
  };
}

export function getRecordsSnapshot(): PunchRecord[] {
  const role = currentRole();
  if (recordsCache === null || cachedRole !== role) {
    cachedRole = role;
    recordsCache = loadRecords(role);
  }
  return recordsCache;
}

/** ตอน SSR ยังไม่มี localStorage — ให้เป็นลิสต์ว่างที่อ้างอิงเดิมเสมอ */
export function getRecordsServerSnapshot(): PunchRecord[] {
  return EMPTY;
}

/** ล้างการตอกบัตรทั้งหมด — ใช้ตอนทดสอบ กู้คืนไม่ได้ */
export function clearRecords() {
  recordsCache = EMPTY;
  cachedRole = currentRole();
  saveRecords(cachedRole, EMPTY);
  bump();
}

export function addRecord(record: PunchRecord) {
  recordsCache = [...getRecordsSnapshot(), record];
  cachedRole = currentRole();
  saveRecords(cachedRole, recordsCache);
  bump();
}

/*
 * การตอกบัตรของทุกบทบาทพร้อมกัน — มีที่ใช้ที่เดียวคือสะพานฝ่ายบุคคล (hr-link.ts)
 * เพราะฝ่ายบุคคลต้องเห็นเวลาเข้างานของทุกคน ไม่ใช่แค่ของคนที่ล็อกอินอยู่
 *
 * หน้าของพนักงานห้ามใช้ตัวนี้ ต้องใช้ getRecordsSnapshot ที่หั่นตามบทบาทแล้ว
 * ไม่งั้นพนักงานจะเห็นเวลาเข้าออกของเพื่อนร่วมงาน
 */
let allCache: Record<Role, PunchRecord[]> | null = null;
let allStamp = -1;

function getAllSnapshot(): Record<Role, PunchRecord[]> {
  /* อ่านใหม่เมื่อมีคนตอกบัตรเพิ่มเท่านั้น จะได้คืนวัตถุอ้างอิงเดิมให้ useMemo ใช้ต่อได้ */
  if (allCache === null || allStamp !== version) {
    allStamp = version;
    allCache = Object.fromEntries(
      ROLES.map((r) => [r.key, loadRecords(r.key)]),
    ) as Record<Role, PunchRecord[]>;
  }
  return allCache;
}

const EMPTY_ALL = Object.fromEntries(ROLES.map((r) => [r.key, EMPTY])) as Record<
  Role,
  PunchRecord[]
>;

export function useAllPunches() {
  return useSyncExternalStore(subscribeRecords, getAllSnapshot, () => EMPTY_ALL);
}

// ─── นาฬิกาเดินวินาที ─────────────────────────────────────────────
let tick = 0;
let timer: ReturnType<typeof setInterval> | null = null;
const clockListeners = new Set<() => void>();

export function subscribeClock(onChange: () => void) {
  clockListeners.add(onChange);
  if (timer === null) {
    // ตั้งค่าแรกทันที React จะอ่าน snapshot ซ้ำหลัง subscribe จึงไม่ค้างที่ 0
    tick = Date.now();
    timer = setInterval(() => {
      tick = Date.now();
      for (const listener of clockListeners) listener();
    }, 1000);
  }
  return () => {
    clockListeners.delete(onChange);
    if (clockListeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

export function getClockSnapshot() {
  return tick;
}

/** 0 = ยังไม่ mount ฝั่ง client ใช้แสดง placeholder แทนเวลา */
export function getClockServerSnapshot() {
  return 0;
}
