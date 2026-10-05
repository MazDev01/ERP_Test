"use client";

/*
 * ตัวช่วยของหน้า /notify-test — ตรวจความพร้อมของเครื่อง จำลอง push และอ่านบันทึกจาก service worker
 * ไม่มีส่วนไหนเรียก backend (ยังไม่มี) ทุกอย่างอยู่ในเครื่องที่ทดสอบ
 */

import { isAndroid, isIOS, isSecure, isStandalone, notifyState, type PwaResult } from "./pwa";
import { pushServiceOf, type PushPayload } from "./push-scenarios";

export type CheckState = "ok" | "no" | "wait";

export type Check = { key: string; state: CheckState; title: string; detail: string };

/** รุ่น iOS จาก user agent — null ถ้าไม่ใช่ iOS หรืออ่านไม่ออก (iPad รุ่นใหม่รายงานตัวเป็น Mac) */
export function iosVersion(): [number, number] | null {
  const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent);
  return isIOS() && m ? [Number(m[1]), Number(m[2])] : null;
}

function browserName() {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return "Chrome (iOS)";
  if (/FxiOS/.test(ua)) return "Firefox (iOS)";
  if (/EdgiOS|EdgA|Edg\//.test(ua)) return "Edge";
  if (/SamsungBrowser/.test(ua)) return "Samsung Internet";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua)) return "Safari";
  return "ไม่ทราบ";
}

export function deviceLabel() {
  const os = isIOS()
    ? `iOS ${iosVersion()?.join(".") ?? "?"}`
    : isAndroid()
      ? `Android ${/Android ([\d.]+)/.exec(navigator.userAgent)?.[1] ?? ""}`.trim()
      : "คอมพิวเตอร์";
  return `${os} · ${browserName()}${isStandalone() ? " · ติดตั้งแล้ว" : ""}`;
}

async function registration() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  if (reg?.active) return reg;
  /* เปิดครั้งแรก PwaBoot เพิ่งสั่งลงทะเบียน — รอให้พร้อมสักครู่ ไม่งั้นตรวจแล้วขึ้นว่ายังไม่ทำงานทุกครั้ง */
  const ready = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 3000)),
  ]);
  return ready ?? reg ?? null;
}

/** ตรวจทีละข้อตามลำดับที่ต้องผ่าน — ข้อบนไม่ผ่าน ข้อล่างก็ไม่มีทางผ่าน */
export async function diagnose(): Promise<Check[]> {
  const out: Check[] = [];
  const ios = isIOS();
  const ver = iosVersion();

  out.push({
    key: "device",
    state: "ok",
    title: deviceLabel(),
    detail: navigator.userAgent,
  });

  out.push(
    isSecure()
      ? { key: "https", state: "ok", title: location.protocol === "https:" ? "เปิดผ่าน HTTPS" : "เชื่อมต่อปลอดภัย (localhost ได้รับยกเว้น)", detail: location.origin }
      : {
          key: "https",
          state: "no",
          title: "ไม่ได้เปิดผ่าน HTTPS",
          detail: "มือถือต้องเปิดผ่าน https และใบรับรองต้องเชื่อถือได้ — ดูเอกสารทดสอบหัวข้อเตรียมเครื่อง",
        },
  );

  if (ios) {
    const okVer = ver !== null && (ver[0] > 16 || (ver[0] === 16 && ver[1] >= 4));
    out.push({
      key: "ios",
      state: okVer ? "ok" : "no",
      title: okVer ? "iOS รุ่นรองรับ Web Push" : "iOS ต่ำกว่า 16.4",
      detail: okVer ? "iOS 16.4 ขึ้นไปรับแจ้งเตือนจากเว็บแอปได้" : "ต้องอัปเดต iOS เป็น 16.4 ขึ้นไป",
    });
    if (browserName() !== "Safari")
      out.push({
        key: "ios-browser",
        state: "wait",
        title: `เปิดด้วย ${browserName()}`,
        detail: "ให้เปิดด้วย Safari แล้วเพิ่มไปยังหน้าจอโฮม",
      });
  }

  const standalone = isStandalone();
  out.push({
    key: "installed",
    state: standalone ? "ok" : ios ? "no" : "wait",
    title: standalone ? "เปิดจากไอคอนบนหน้าจอโฮม" : "เปิดในแท็บเบราว์เซอร์",
    detail: standalone
      ? "โหมดแอป"
      : ios
        ? "iOS รับแจ้งเตือนได้เฉพาะตอนเปิดจากไอคอนบนหน้าจอโฮม"
        : "Android รับแจ้งเตือนในแท็บได้ แต่ควรทดสอบแบบติดตั้งด้วย",
  });

  const reg = await registration();
  const active = Boolean(reg?.active);
  out.push({
    key: "sw",
    state: active && navigator.serviceWorker.controller ? "ok" : active ? "wait" : "no",
    title: active ? "Service worker ทำงานอยู่" : "Service worker ยังไม่ทำงาน",
    detail: !active
      ? "ต้องเปิดผ่าน HTTPS ที่เชื่อถือได้ แล้วโหลดหน้าใหม่"
      : navigator.serviceWorker.controller
        ? `ขอบเขต ${reg!.scope}`
        : "ลงทะเบียนแล้วแต่ยังไม่คุมหน้านี้ — โหลดหน้าใหม่หนึ่งครั้ง",
  });

  const perm = notifyState();
  out.push({
    key: "permission",
    state: perm === "granted" ? "ok" : perm === "denied" || perm === "unsupported" ? "no" : "wait",
    title: `สิทธิ์แจ้งเตือน: ${perm}`,
    detail:
      perm === "granted"
        ? "อนุญาตแล้ว"
        : perm === "denied"
          ? ios
            ? "เปิดใหม่ที่ การตั้งค่า › การแจ้งเตือน › ERP MAZ"
            : "เปิดใหม่ที่ ไอคอนแม่กุญแจหน้าลิงก์ › การแจ้งเตือน"
          : "กดปุ่ม ขอสิทธิ์แจ้งเตือน ด้านล่าง",
  });

  const hasPush = Boolean(reg && "pushManager" in reg);
  out.push({
    key: "push",
    state: hasPush ? "ok" : "no",
    title: hasPush ? "รองรับ Push API" : "ไม่รองรับ Push API",
    detail: hasPush
      ? "พร้อมรับ push จากเซิร์ฟเวอร์เมื่อมี backend"
      : ios
        ? "iOS มี Push API เฉพาะตอนเปิดจากไอคอนบนหน้าจอโฮม"
        : "เบราว์เซอร์นี้รับ push ไม่ได้",
  });

  out.push({
    key: "badge",
    state: "setAppBadge" in navigator ? "ok" : "wait",
    title: "setAppBadge" in navigator ? "ตัวเลขบนไอคอนแอปได้" : "ไม่รองรับตัวเลขบนไอคอน",
    detail: "ไม่บังคับ — ใช้แสดงจำนวนเรื่องค้าง",
  });

  out.push({
    key: "vibrate",
    state: "vibrate" in navigator ? "ok" : "wait",
    title: "vibrate" in navigator ? "สั่นได้" : "ไม่รองรับการสั่น",
    detail: ios ? "iOS สั่นตามการตั้งค่าเสียงของเครื่องเอง สั่งจากเว็บไม่ได้ — ถือว่าปกติ" : "ไม่บังคับ",
  });

  return out;
}

/**
 * จำลอง push — ส่ง payload ให้ service worker แสดงผ่านทางเดียวกับ push จริง
 * delay ให้เวลากดออกจากแอปหรือล็อกจอ (สูงสุด 30 วินาที ตามที่ sw.js จำกัด)
 */
export async function simulatePush(payload: Omit<PushPayload, "sentAt">, delay: number) {
  const reg = await registration();
  const worker = reg?.active;
  if (!worker) return { ok: false, reason: "service worker ยังไม่ทำงาน" };
  worker.postMessage({ type: "simulate-push", payload, delay });
  return {
    ok: true,
    reason: delay > 0 ? `จะขึ้นในอีก ${delay} วินาที — ออกจากแอปหรือล็อกจอได้เลย` : "ส่งให้เครื่องแสดงแล้ว",
  };
}

export type LogEntry = {
  kind: "received" | "clicked";
  source?: "push" | "simulate";
  id: string;
  title: string;
  at: number;
  sentAt?: number;
  url?: string;
};

export async function readLog(): Promise<LogEntry[]> {
  try {
    const res = await (await caches.open("maz-push-log")).match("/__push-log");
    return res ? ((await res.json()) as LogEntry[]) : [];
  } catch {
    return [];
  }
}

export async function clearLog() {
  try {
    await caches.delete("maz-push-log");
  } catch {
    /* ลบไม่ได้ก็แค่ยังเห็นของเก่า */
  }
}

export async function setBadge(n: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (!nav.setAppBadge) return false;
  await (n > 0 ? nav.setAppBadge(n) : nav.clearAppBadge?.());
  return true;
}

/* ── ลงทะเบียนกับตัวส่งทดสอบบนคอม (tools/push-sender.mjs) ──
 * ตัวส่งเป็นคนถือกุญแจและรายชื่อเครื่อง ระบบนี้ไม่มี backend ของตัวเอง
 * เปิดระบบตรง ๆ โดยไม่ผ่านตัวส่ง /__push/* จะไม่มี — การ์ดบอกว่าต้องเปิดผ่านลิงก์ทดสอบ */

export type SenderInfo = { publicKey: string } | null;

/** ตัวส่งรันอยู่ไหม — ได้กุญแจกลับมาแปลว่าเปิดผ่านตัวส่ง */
export async function senderInfo(): Promise<SenderInfo> {
  try {
    const res = await fetch("/__push/key", { cache: "no-store" });
    if (!res.ok) return null;
    const d = (await res.json()) as { publicKey?: string };
    return d.publicKey ? { publicKey: d.publicKey } : null;
  } catch {
    return null;
  }
}

function keyBytes(s: string) {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** กุญแจของ subscription เดิมตรงกับของตัวส่งไหม — ตัวส่งสร้างกุญแจใหม่ (ลบ .data) ต้องลงทะเบียนใหม่ */
function sameKey(sub: PushSubscription, publicKey: string) {
  const k = sub.options.applicationServerKey;
  if (!k) return false;
  const a = new Uint8Array(k);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export async function currentSubscription() {
  const reg = await registration();
  return reg && "pushManager" in reg ? reg.pushManager.getSubscription() : null;
}

/**
 * ลงทะเบียนเครื่องนี้กับตัวส่ง — เรียกหลังได้สิทธิ์แจ้งเตือนแล้ว (enableNotify)
 * userVisibleOnly บังคับทั้ง iOS และ Chrome: ทุก push ต้องแสดงให้ผู้ใช้เห็น
 */
export async function registerDevice(publicKey: string, label: string): Promise<PwaResult> {
  if (notifyState() !== "granted") return { ok: false, reason: "ต้องอนุญาตการแจ้งเตือนก่อน" };
  const reg = await registration();
  if (!reg || !("pushManager" in reg))
    return {
      ok: false,
      reason: isIOS() ? "iPhone ต้องเปิดจากไอคอนบนหน้าจอโฮมก่อน" : "เครื่องนี้ยังไม่มี Push API",
    };
  try {
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub, publicKey)) {
      await sub.unsubscribe();
      sub = null;
    }
    /* บางเครื่องต่อระบบ push ไม่ได้ (เน็ตบล็อก เบราว์เซอร์ไม่มี FCM) คำสั่งนี้จะค้างเงียบ — ตัดที่ 25 วินาที ให้ผู้ทดสอบรู้ */
    sub ??= await Promise.race([
      reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }),
      new Promise<never>((_, no) =>
        setTimeout(() => no(new Error("ระบบ push ของเครื่องไม่ตอบใน 25 วินาที — ตรวจเน็ตแล้วลองใหม่")), 25000),
      ),
    ]);
    const res = await fetch("/__push/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON(), label, platform: deviceLabel() }),
    });
    if (!res.ok) return { ok: false, reason: "ตัวส่งไม่รับการลงทะเบียน — ลองใหม่อีกครั้ง" };
    return { ok: true, reason: `ลงทะเบียนแล้ว ผ่าน ${pushServiceOf(sub.endpoint)} — ส่งจากคอมได้เลย` };
  } catch (e) {
    return { ok: false, reason: `ลงทะเบียนไม่สำเร็จ: ${String(e)}` };
  }
}

export async function unregisterDevice() {
  const sub = await currentSubscription();
  if (!sub) return;
  await fetch("/__push/devices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => {});
  await sub.unsubscribe();
}
