/*
 * ตั้งค่าการแจ้งเตือนของพนักงาน — หน้าโปรไฟล์เป็นคนแก้ หน้าอื่นเป็นคนใช้
 * (หน้าตอกบัตรใช้เวลาเตือนล่วงหน้า · กระดิ่งใช้ว่าเรื่องไหนเปิดอยู่)
 * TODO: ย้ายไปตาราง notification_setting เมื่อต่อ backend
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";

/** เรื่องที่แจ้งเตือนได้ — คีย์เดียวกับที่การแจ้งเตือนในกระดิ่งใช้จัดกลุ่ม */
export const NOTIFY_EVENTS = [
  { key: "checkin", title: "เตือนเช็คอินเข้างาน", detail: "แจ้งเมื่อถึงเวลาเข้างานและอยู่ในพื้นที่ทำงาน" },
  { key: "checkout", title: "เตือนเช็คเอาท์ออกงาน", detail: "แจ้งตอนครบเวลาเลิกงานของกะวันนั้น" },
  { key: "forgot", title: "ลืมเช็คเอาท์", detail: "เตือนอีกครั้ง 30 นาทีหลังเลิกงานถ้ายังไม่กด" },
  { key: "leave", title: "ผลอนุมัติใบลา", detail: "เมื่อหัวหน้าอนุมัติหรือไม่อนุมัติใบลาของคุณ" },
  { key: "presales", title: "คำขอก่อนการขายส่งกลับ", detail: "เมื่อ BD หรือ SA ส่งข้อเสนอกลับมาให้คุณ" },
  { key: "quotexp", title: "ใบเสนอราคาใกล้หมดอายุ", detail: "เตือนล่วงหน้าก่อนใบเสนอราคาที่คุณออกจะหมดอายุ" },
] as const;

export type NotifyEventKey = (typeof NOTIFY_EVENTS)[number]["key"];

export const NOTIFY_CHANNELS = [
  { key: "popup", label: "ป๊อปอัป" },
  { key: "sound", label: "เสียง" },
  { key: "vibrate", label: "สั่น" },
] as const;

export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number]["key"];

export type NotifySettings = {
  /** สวิตช์ใหญ่ ปิดแล้วไม่เตือนอะไรเลย */
  on: boolean;
  /** เตือนก่อนเวลาเข้างานกี่นาที (0 = ตรงเวลา) */
  leadIn: number;
  /** เตือนก่อนเลิกงานกี่นาที */
  leadOut: number;
  /** ยังไม่กดแล้วเตือนซ้ำทุกกี่นาที (0 = ไม่เตือนซ้ำ) */
  repeat: number;
  /** ช่วงพักกลางวันเตือนแบบเงียบ */
  quietLunch: boolean;
  channels: Record<string, Record<string, boolean>>;
};

export const DEFAULT_NOTIFY: NotifySettings = {
  on: true,
  leadIn: 10,
  leadOut: 0,
  repeat: 5,
  quietLunch: true,
  channels: Object.fromEntries(
    NOTIFY_EVENTS.map((e) => [
      e.key,
      {
        popup: true,
        sound: e.key === "checkin" || e.key === "checkout",
        vibrate: e.key === "checkin",
      },
    ]),
  ),
};

function isSettings(value: unknown): value is NotifySettings {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return typeof s.on === "boolean" && typeof s.leadIn === "number";
}

const store = createPersistedStore<NotifySettings>(
  "maz-erp.notify.v1",
  DEFAULT_NOTIFY,
  isSettings,
);

export function useNotifySettings() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function saveNotifySettings(next: NotifySettings) {
  store.set(next);
}

export function resetNotifySettings() {
  store.reset();
}

/** เรื่องนี้เตือนแบบป๊อปอัปอยู่ไหม — ปิดสวิตช์ใหญ่แล้วถือว่าปิดหมด */
export function popupOn(s: NotifySettings, event: NotifyEventKey) {
  return s.on && (s.channels[event]?.popup ?? true);
}
