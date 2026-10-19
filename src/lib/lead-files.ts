"use client";

/*
 * ไฟล์ Proposal และเอกสารของผู้สนใจแต่ละราย (ผู้ใช้สั่ง 14 ต.ค. 2569)
 *
 * ฝ่ายขายทำ Proposal เอง แล้วแนบไว้ที่หน้าผู้สนใจ /leads/[code]
 * แยกสโตร์ของตัวเอง ไม่แตะสโตร์ CRM — จับคู่กับผู้สนใจด้วยรหัสผู้สนใจ (lead)
 * ยังไม่มีที่เก็บไฟล์จริง เก็บแค่ชื่อ ขนาด วันที่ เหมือนไฟล์แนบที่อื่นในระบบ · ลิงก์ (Google Drive, Canva) เปิดได้จริง
 */

import { useSyncExternalStore } from "react";
import { bkkStamp } from "./format";
import { createPersistedStore } from "./persisted-store";

export type LeadFile = {
  id: string;
  /** รหัสผู้สนใจที่ไฟล์นี้อยู่ */
  lead: string;
  name: string;
  /** ไบต์ — ลิงก์เป็น 0 */
  size: number;
  url?: string;
  /** ชื่อคนแนบ — คนแนบเท่านั้นที่ลบได้ */
  by: string;
  /** "yyyy-mm-dd HH:mm" เวลาไทย */
  at: string;
};

function isFiles(v: unknown): v is LeadFile[] {
  return (
    Array.isArray(v) &&
    v.every((f) => typeof f === "object" && f !== null && typeof f.id === "string" && typeof f.lead === "string")
  );
}

const EMPTY: LeadFile[] = [];
const store = createPersistedStore<LeadFile[]>("maz-erp.lead-files.v1", EMPTY, isFiles);

export function useLeadFiles() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function addLeadFiles(lead: string, files: { name: string; size: number; url?: string }[], by: string) {
  if (!files.length) return;
  const at = bkkStamp();
  const stamp = Date.now().toString(36);
  const added: LeadFile[] = files.map((f, i) => ({
    id: `lf-${stamp}-${i}`,
    lead,
    name: f.name,
    size: f.size,
    url: f.url,
    by,
    at,
  }));
  store.update((list) => [...added, ...list]);
}

export function removeLeadFile(id: string) {
  store.update((list) => list.filter((f) => f.id !== id));
}
