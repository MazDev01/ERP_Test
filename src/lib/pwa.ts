"use client";

/*
 * ตัวช่วยฝั่ง PWA — ติดตั้งลงหน้าจอโฮม และขออนุญาตแจ้งเตือน
 * เก็บสถานะไว้นอก React แล้วให้หน้า /install subscribe เอา
 * เพราะ beforeinstallprompt มาถึงก่อนที่หน้าจะ mount ได้
 */

import { useSyncExternalStore } from "react";

/** ชนิดของ event ที่เบราว์เซอร์ยิงมาก่อนจะเสนอให้ติดตั้ง — ยังไม่มีใน lib.dom */
type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type NotifyState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported"
  /** iOS ยอมให้ขอสิทธิ์แจ้งเตือนเฉพาะตอนเปิดจากไอคอนบนหน้าจอโฮมเท่านั้น */
  | "ios-needs-install";

export type PwaSnapshot = {
  canInstall: boolean;
  installed: boolean;
  notify: NotifyState;
  /** จดทะเบียน service worker สำเร็จหรือยัง */
  ready: boolean;
};

const SERVER: PwaSnapshot = {
  canInstall: false,
  installed: false,
  notify: "default",
  ready: false,
};

let deferred: InstallPrompt | null = null;
let snapshot: PwaSnapshot = SERVER;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function isIOS() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS รุ่นใหม่รายงานตัวเป็น Mac ต้องดูว่ามีจอสัมผัสด้วยไหม
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function isAndroid() {
  return typeof navigator !== "undefined" && /Android/.test(navigator.userAgent);
}

/** เปิดอยู่จากไอคอนบนหน้าจอโฮม ไม่ใช่ในแท็บเบราว์เซอร์ */
export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // Safari บน iOS ใช้ตัวนี้ตัวเดียว ไม่รองรับ display-mode
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function notifyState(): NotifyState {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return isIOS() && !isStandalone() ? "ios-needs-install" : "unsupported";
  }
  const p = Notification.permission;
  if (p === "default" && isIOS() && !isStandalone()) return "ios-needs-install";
  return p;
}

/** ต้องเสิร์ฟผ่าน https ถึงจะติดตั้งและรับแจ้งเตือนได้ (localhost ยกเว้นให้) */
export function isSecure() {
  if (typeof window === "undefined") return false;
  return (
    location.protocol === "https:" ||
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1"
  );
}

function refresh() {
  const next: PwaSnapshot = {
    canInstall: deferred !== null,
    installed: isStandalone(),
    notify: notifyState(),
    ready: snapshot.ready,
  };
  const same =
    next.canInstall === snapshot.canInstall &&
    next.installed === snapshot.installed &&
    next.notify === snapshot.notify &&
    next.ready === snapshot.ready;
  if (same) return;
  snapshot = next;
  emit();
}

let started = false;

/** เรียกครั้งเดียวตอนแอปเริ่มทำงาน */
export function startPwa() {
  if (started || typeof window === "undefined") return;
  started = true;

  window.addEventListener("beforeinstallprompt", (e) => {
    /* กันไม่ให้ Chrome เด้งแถบติดตั้งเอง เรามีปุ่มในหน้า /install ให้กดแล้ว */
    e.preventDefault();
    deferred = e as InstallPrompt;
    refresh();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    refresh();
  });

  if ("serviceWorker" in navigator && isSecure()) {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then(() => {
        snapshot = { ...snapshot, ready: true };
        emit();
      })
      .catch(() => {
        /* จดทะเบียนไม่สำเร็จก็ใช้งานต่อได้ แค่ไม่มีหน้าออฟไลน์ */
      });
  }

  refresh();
}

/**
 * เรนเดอร์ฝั่งเบราว์เซอร์แล้วหรือยัง
 * ต้องรู้ก่อนถึงจะอ่านค่าอย่างชนิดของเครื่องหรือโปรโตคอลได้
 * ถ้าอ่านตรง ๆ ตอนเรนเดอร์ HTML ที่เซิร์ฟเวอร์ส่งมากับที่เบราว์เซอร์วาดจะไม่ตรงกัน
 */
export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function usePwa(): PwaSnapshot {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => SERVER,
  );
}

export type PwaResult = { ok: boolean; reason: string };

export async function install(): Promise<PwaResult> {
  if (isStandalone()) return { ok: true, reason: "ติดตั้งไว้แล้ว" };
  if (isIOS())
    return { ok: false, reason: "iPhone และ iPad ต้องติดตั้งเองตามขั้นตอนด้านล่าง" };
  if (!deferred)
    return {
      ok: false,
      reason: "เบราว์เซอร์ยังไม่พร้อมให้ติดตั้ง — ลองโหลดหน้านี้ใหม่อีกครั้ง",
    };

  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  /* กล่องนี้ใช้ได้ครั้งเดียว ต่อให้ผู้ใช้กดยกเลิกก็ต้องทิ้ง
     เบราว์เซอร์จะยิง beforeinstallprompt มาใหม่เองถ้ายังติดตั้งได้อยู่ */
  deferred = null;
  refresh();
  return outcome === "accepted"
    ? { ok: true, reason: "ติดตั้งเรียบร้อย เปิดจากไอคอนบนหน้าจอโฮมได้เลย" }
    : { ok: false, reason: "ยกเลิกการติดตั้งไปแล้ว" };
}

export async function enableNotify(): Promise<PwaResult> {
  const state = notifyState();
  if (state === "granted") return { ok: true, reason: "เปิดการแจ้งเตือนไว้แล้ว" };
  if (state === "ios-needs-install")
    return { ok: false, reason: "iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน แล้วเปิดจากไอคอนนั้น" };
  if (state === "unsupported")
    return { ok: false, reason: "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน" };
  if (state === "denied")
    return {
      ok: false,
      reason: "ปิดการแจ้งเตือนไว้ ต้องไปเปิดใหม่ที่ตั้งค่าของเบราว์เซอร์",
    };

  const result = await Notification.requestPermission();
  refresh();
  return result === "granted"
    ? { ok: true, reason: "เปิดการแจ้งเตือนเรียบร้อย" }
    : { ok: false, reason: "ยังไม่ได้อนุญาต — กดอีกครั้งแล้วเลือก อนุญาต" };
}

export async function testNotify(): Promise<PwaResult> {
  if (notifyState() !== "granted")
    return { ok: false, reason: "ต้องเปิดการแจ้งเตือนก่อนถึงจะทดสอบได้" };

  const body = "ถ้าเห็นข้อความนี้ แปลว่าการแจ้งเตือนใช้งานได้แล้ว";
  /* ผ่าน service worker เสมอเมื่อมี — บน iOS ที่ติดตั้งลงโฮมแล้ว
     new Notification() ตรง ๆ จะโยน error */
  if ("serviceWorker" in navigator) {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    if (reg) {
      await reg.showNotification("ทดสอบแจ้งเตือน ERP MAZ", {
        body,
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: "maz-erp-test",
      });
      return { ok: true, reason: "ส่งแจ้งเตือนทดสอบแล้ว" };
    }
  }
  new Notification("ทดสอบแจ้งเตือน ERP MAZ", { body, icon: "/icon.svg" });
  return { ok: true, reason: "ส่งแจ้งเตือนทดสอบแล้ว" };
}
