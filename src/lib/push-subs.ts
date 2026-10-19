"use client";

/*
 * การรับแจ้งเตือนแบบ push — เก็บแยกรายอุปกรณ์ ผูกกับบัญชีพนักงาน (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * คนเดียวมีได้หลายเครื่อง (มือถือ + คอม) แต่ละเครื่องเปิด/ปิดของตัวเอง
 *
 * TODO: ยังไม่มี backend (Vercel) และยังไม่มีกุญแจ VAPID ของระบบ
 *   - ตอนนี้เก็บในเครื่อง (localStorage) และถ้าเครื่องยังไม่มี PushSubscription จะเก็บค่าว่างไว้ก่อน
 *   - ต่อ backend แล้วให้ pushManager.subscribe ด้วยกุญแจของระบบ แล้วส่ง subscription ไปเก็บที่
 *     endpoint ฝั่งเซิร์ฟเวอร์ (POST/DELETE ต่ออุปกรณ์) แทนสโตร์นี้
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";

export type PushDevice = {
  /** รหัสสุ่มของเบราว์เซอร์นี้ — เก็บใน localStorage ของเครื่อง */
  deviceId: string;
  endpoint: string | null;
  /** PushSubscription.toJSON() — null = ยังไม่มี (รอกุญแจ VAPID ของระบบ) */
  subscription: PushSubscriptionJSON | null;
  ua: string;
  createdAt: string;
  enabled: boolean;
};

/** รหัสพนักงาน → อุปกรณ์ที่ลงทะเบียนไว้ */
type PushSubs = Record<string, PushDevice[]>;

const EMPTY: PushSubs = {};

function isSubs(v: unknown): v is PushSubs {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const store = createPersistedStore<PushSubs>("maz-erp.push-subs.v1", EMPTY, isSubs);

/* ค่าตั้งรายเรื่องแบบเก่า (ป๊อปอัป/เสียง/สั่น/เวลาเตือน/พักกลางวัน) ไม่ใช้แล้ว — ลบทิ้งจากเครื่องเงียบ ๆ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem("maz-erp.notify.v1");
  } catch {
    /* โหมดส่วนตัว — ไม่เป็นไร */
  }
}

const DEVICE_KEY = "maz-erp.device-id";

/** รหัสของอุปกรณ์นี้ — สร้างครั้งแรกแล้วเก็บไว้ในเบราว์เซอร์ */
export function deviceId(): string {
  try {
    let id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2) + Date.now().toString(36);
      window.localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "no-storage";
  }
}

/** เบราว์เซอร์นี้แจ้งเตือนได้ไหม (ต้องมีทั้ง Notification และ service worker) */
export function pushSupported() {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator;
}

/** อุปกรณ์นี้ของบัญชีนี้ — null = ยังไม่เคยลงทะเบียน */
export function useThisDevice(empId: string | undefined): PushDevice | null {
  const subs = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  if (!empId || typeof window === "undefined") return null;
  const id = deviceId();
  return subs[empId]?.find((d) => d.deviceId === id) ?? null;
}

/** subscription ที่เครื่องนี้มีอยู่แล้ว (ถ้ามี) — ใช้ service worker ตัวเดียวกับ pwa.ts (/sw.js) */
async function existingSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg || !("pushManager" in reg)) return null;
    return await reg.pushManager.getSubscription();
  } catch {
    return null;
  }
}

/** ลงทะเบียน/เปิดอุปกรณ์นี้ให้บัญชีนี้ — เรียกหลังได้สิทธิ์ Notification แล้ว */
export async function subscribeThisDevice(empId: string) {
  const id = deviceId();
  const sub = await existingSubscription();
  // TODO: ไม่มี subscription → pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: <VAPID ของระบบ> })
  //       แล้วส่งไป endpoint ฝั่งเซิร์ฟเวอร์ (ยังไม่ได้สร้าง)
  const json = sub ? sub.toJSON() : null;
  store.update((all) => {
    const list = all[empId] ?? [];
    const prev = list.find((d) => d.deviceId === id);
    const next: PushDevice = {
      deviceId: id,
      endpoint: json?.endpoint ?? prev?.endpoint ?? null,
      subscription: json ?? prev?.subscription ?? null,
      ua: navigator.userAgent,
      createdAt: prev?.createdAt ?? new Date().toISOString(),
      enabled: true,
    };
    return { ...all, [empId]: [...list.filter((d) => d.deviceId !== id), next] };
  });
}

/** ปิดอุปกรณ์นี้ของบัญชีนี้ — ไม่ลบรายการ เปิดกลับได้ */
export function unsubscribeThisDevice(empId: string) {
  const id = deviceId();
  // TODO: แจ้ง endpoint ฝั่งเซิร์ฟเวอร์ให้หยุดส่งไปอุปกรณ์นี้
  store.update((all) => ({
    ...all,
    [empId]: (all[empId] ?? []).map((d) => (d.deviceId === id ? { ...d, enabled: false } : d)),
  }));
}
