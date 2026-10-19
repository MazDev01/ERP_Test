"use client";

/*
 * นาฬิกาจำลองของโหมดทดสอบหน้าลงเวลา (ผู้ใช้สั่ง 13 ต.ค. 2569)
 * ปุ่ม "จำลอง: มาเช้า / มาสาย / เลิกงาน / ลาครึ่งวันเช้า / ออกก่อนเวลา" ต้องจำลองเวลาได้
 * ไม่งั้นคิดจากนาฬิกาจริงแล้วผลเพี้ยน (ตามแบบ checkin.html ตัวแปร simNow)
 *
 * offset = มิลลิวินาทีที่บวกเข้ากับเวลาจริง (0 = ใช้เวลาจริง) — นาฬิกายังเดินต่อจากเวลาที่จำลอง
 * leave  = ใบลาจำลองของวันนี้ (นาทีของวัน) — null = ใช้ใบลาจริง
 * อ่านเฉพาะในหน้าลงเวลา (checkin-screen.tsx) ไม่กระทบกติกาลงเวลาที่อื่น
 * TODO: เอาออกพร้อมโหมดทดสอบก่อนใช้งานจริง
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { bkkOf } from "./format";
import type { LeaveWindow } from "./work-schedule";

export type ClockDemo = { offset: number; leave: { from: number; to: number } | null };

const OFF: ClockDemo = { offset: 0, leave: null };

const store = createPersistedStore<ClockDemo>(
  "maz-erp.clock-demo.v1",
  OFF,
  (v): v is ClockDemo =>
    typeof v === "object" && v !== null && typeof (v as ClockDemo).offset === "number",
);

export function useClockDemo(): ClockDemo {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

/** เวลาตอนนี้ตามนาฬิกาจำลอง */
export function demoNow() {
  return new Date(Date.now() + store.get().offset);
}

/** ตั้งนาฬิกาให้เป็นนาทีที่ minute ของวันนี้ (หน้าปัดไทย) พร้อมใบลาจำลอง */
export function setClockDemo(minute: number, leave: LeaveWindow = null) {
  const wall = bkkOf(new Date());
  const sec = wall.getHours() * 3600 + wall.getMinutes() * 60 + wall.getSeconds();
  store.set({ offset: minute * 60_000 - sec * 1000 - wall.getMilliseconds(), leave });
}

/** กลับไปใช้เวลาจริงและใบลาจริง */
export function clearClockDemo() {
  store.set(OFF);
}
