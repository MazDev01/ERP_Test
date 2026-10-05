/*
 * Service worker ของ ERP MAZ
 *
 * 1. กันหน้าจอขาวตอนเน็ตหลุด — ขอจากเครือข่ายก่อนเสมอ ถ้าขอไม่ได้ค่อยหยิบของในแคชมาแสดง
 * 2. แสดงแจ้งเตือนบนเครื่อง ทั้งที่มาจาก push จริง และที่หน้า /notify-test จำลองส่งมา
 *
 * ตั้งใจไม่แคชไฟล์ของ Next (/_next/static/...) เอง เพราะชื่อไฟล์เปลี่ยนทุกครั้งที่ build
 * ถ้าดักแคชไว้เองจะได้ของเก่าปนของใหม่ ปล่อยให้เบราว์เซอร์จัดการตาม HTTP cache ดีกว่า
 */

const VERSION = "maz-erp-v2";
const OFFLINE_URL = "/offline";

/* บันทึกการรับ/การกดแจ้งเตือน ให้หน้า /notify-test อ่าน — แคชแยก activate ไม่ลบ
   ต้องมีเพราะตอนแอปปิดอยู่ไม่มีหน้าไหนรับ postMessage ได้ */
const PUSH_LOG = "maz-push-log";
const PUSH_LOG_URL = "/__push-log";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== VERSION && k !== PUSH_LOG).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  /* สนใจเฉพาะการเปิดหน้า — รูป ฟอนต์ สคริปต์ ปล่อยผ่านตามปกติ
     ไม่งั้นคำขอ POST หรือคำขอข้ามโดเมนจะพังทั้งหมดตอนออฟไลน์ */
  if (request.mode !== "navigate" || request.method !== "GET") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cache = await caches.open(VERSION);
      return (
        (await cache.match(request)) ||
        (await cache.match(OFFLINE_URL)) ||
        Response.error()
      );
    }),
  );
});

async function appendLog(entry) {
  try {
    const cache = await caches.open(PUSH_LOG);
    const res = await cache.match(PUSH_LOG_URL);
    const list = res ? await res.json() : [];
    list.unshift(entry);
    await cache.put(
      PUSH_LOG_URL,
      new Response(JSON.stringify(list.slice(0, 40)), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  } catch {
    /* บันทึกไม่ได้ไม่เป็นไร แจ้งเตือนต้องขึ้นก่อน */
  }
  const pages = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  pages.forEach((p) => p.postMessage({ type: "push-log", entry }));
}

/*
 * แสดงแจ้งเตือนจาก payload — รูปแบบตรงกับ PushPayload ใน src/lib/push-scenarios.ts
 * push จริงกับการจำลองจากหน้าทดสอบวิ่งผ่านฟังก์ชันนี้ตัวเดียว ผลที่เห็นบนเครื่องจึงเหมือนกัน
 *
 * iOS: ทุก push ต้องแสดงแจ้งเตือนเสมอ ถ้าเงียบไปหลายครั้ง Safari จะถอนสิทธิ์ของเครื่องนั้นทิ้ง
 *      ไม่รองรับ vibrate / requireInteraction — ใส่มาก็ถูกข้าม ไม่พัง
 * Android: รองรับครบ แต่ silent คู่กับ vibrate ไม่ได้ (เบราว์เซอร์โยน TypeError)
 */
function handlePayload(data, source) {
  const receivedAt = Date.now();
  const title = data.title || "ERP MAZ";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icon.svg",
    badge: data.badge || "/icon.svg",
    tag: data.tag || "maz-erp",
    /* tag เดิมมาแทนที่ของเก่า แต่ต้องสั่น/มีเสียงทุกครั้ง — ไม่งั้นเรื่องใหม่ที่ tag ซ้ำจะขึ้นแบบเงียบ
       เรื่องไหนไม่อยากให้เตือนซ้ำ ส่ง renotify: false มาเอง */
    renotify: Boolean(data.tag) && data.renotify !== false,
    requireInteraction: Boolean(data.requireInteraction),
    silent: Boolean(data.silent),
    timestamp: data.sentAt || receivedAt,
    data: { url: data.url || "/", id: data.id || "" },
  };
  if (Array.isArray(data.vibrate) && !options.silent) options.vibrate = data.vibrate;

  const show = self.registration
    .showNotification(title, options)
    /* ตัวเลือกบางตัวไม่ผ่านบางเบราว์เซอร์ — ลดเหลือแบบพื้นฐานแต่ต้องขึ้นให้ได้ */
    .catch(() =>
      self.registration.showNotification(title, { body: options.body, data: options.data }),
    );

  /* ตัวเลขบนไอคอนแอป — iOS 16.4+ ที่ติดตั้งแล้ว · Android ขึ้นกับ launcher */
  const badge =
    typeof data.badgeCount === "number" && "setAppBadge" in self.navigator
      ? (data.badgeCount > 0
          ? self.navigator.setAppBadge(data.badgeCount)
          : self.navigator.clearAppBadge()
        ).catch(() => {})
      : null;

  return Promise.all([
    show,
    badge,
    appendLog({
      kind: "received",
      source,
      id: data.id || "",
      title,
      at: receivedAt,
      sentAt: data.sentAt || 0,
    }),
  ]);
}

/* push จริงผ่าน Apple / FCM — ตอนนี้ส่งจากตัวส่งทดสอบบนคอม (tools/push-sender.mjs)
   backend บน Vercel ที่มาทีหลังต้องส่ง payload รูปแบบเดียวกัน */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(handlePayload(data, "push"));
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data) return;

  /* หน้า /install กดปุ่ม "ทดสอบแจ้งเตือน" แล้วส่งข้อความมาที่นี่
     ต้องแสดงผ่าน service worker เพราะบน iOS ที่ติดตั้งลงโฮมแล้ว
     new Notification() ตรง ๆ ใช้ไม่ได้ */
  if (data.type === "notify") {
    event.waitUntil(
      self.registration.showNotification(data.title || "ERP MAZ", {
        body: data.body || "",
        icon: "/icon.svg",
        badge: "/icon.svg",
        tag: data.tag || "maz-erp",
      }),
    );
    return;
  }

  /* หน้า /notify-test จำลอง push — delay ให้เวลาสลับไปแอปอื่นหรือล็อกจอก่อน
     เบราว์เซอร์อาจปิด service worker ที่รอนานเกินไป จึงจำกัดไว้ 30 วินาที */
  if (data.type === "simulate-push" && data.payload) {
    const wait = Math.min(30, Math.max(0, Number(data.delay) || 0)) * 1000;
    event.waitUntil(
      new Promise((r) => setTimeout(r, wait)).then(() =>
        handlePayload({ ...data.payload, sentAt: Date.now() }, "simulate"),
      ),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const target = d.url ? new URL(d.url, self.location.origin).href : null;

  event.waitUntil(
    (async () => {
      await appendLog({
        kind: "clicked",
        id: d.id || "",
        title: event.notification.title,
        at: Date.now(),
        url: d.url || "",
      });
      const list = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const client = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        const focused = (await client.focus()) || client;
        /* แจ้งเตือนที่มีปลายทาง พาไปหน้านั้น — ไม่มี (เช่นปุ่มทดสอบในหน้า /install) แค่เปิดแอปขึ้นมา */
        if (target && "navigate" in focused) {
          try {
            await focused.navigate(target);
          } catch {
            /* หน้าที่ service worker ยังไม่คุม navigate ไม่ได้ — เปิดหน้าต่างใหม่ที่ปลายทางแทน */
            await self.clients.openWindow(target);
          }
        }
        return;
      }
      return self.clients.openWindow(target || "/");
    })(),
  );
});

/* ระบบ push หมุนกุญแจหรือหมดอายุ — ลงทะเบียนใหม่กับตัวส่งเองโดยไม่ต้องให้ผู้ใช้กดอีก
   (Chrome/Firefox ยิง event นี้ · Safari ยังไม่ยิง iPhone ต้องกดลงทะเบียนใหม่ในหน้าโปรไฟล์) */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const res = await fetch("/__push/key");
      if (!res.ok) return;
      const { publicKey } = await res.json();
      const pad = "=".repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, "+").replace(/_/g, "/"));
      const sub = await self.registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: Uint8Array.from(raw, (c) => c.charCodeAt(0)),
      });
      await fetch("/__push/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: sub.toJSON(),
          oldEndpoint: event.oldSubscription ? event.oldSubscription.endpoint : undefined,
        }),
      });
    })().catch(() => {}),
  );
});
