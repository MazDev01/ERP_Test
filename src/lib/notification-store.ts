"use client";

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";

/*
 * เก็บเฉพาะ "อ่านแล้ว" ของแต่ละเรื่อง ตัวเนื้อหาคำนวณสดจากข้อมูลจริงเสมอ
 * ถ้าเรื่องนั้นจบไปแล้ว รายการหายเอง ไม่ต้องมาไล่ลบ
 */
const store = createPersistedStore<string[]>(
  "maz-erp.notice-read.v1",
  [],
  (v): v is string[] => Array.isArray(v),
);

export function useReadNotices() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function markRead(id: string) {
  store.update((ids) => (ids.includes(id) ? ids : [...ids, id]));
}

export function markAllRead(ids: string[]) {
  store.update((current) => [...new Set([...current, ...ids])]);
}
