/*
 * ตัวส่งแจ้งเตือนทดสอบ — รันบนคอมผู้ทดสอบเท่านั้น ไม่ใช่ส่วนหนึ่งของระบบ ERP MAZ และไม่ขึ้น Vercel
 *
 *   npm run push:sender          (ระบบต้องรันอยู่ที่ :3000 ก่อน — npm start หรือ npm run dev)
 *   npx cloudflared tunnel --url http://localhost:3100    ← ลิงก์ที่ให้มือถือเปิด
 *
 * ทำสองอย่าง
 *   1. ส่งต่อทุกคำขอไปที่ระบบ (:3000) — มือถือจึงใช้ระบบผ่านลิงก์เดียวตามปกติ
 *   2. จัดการ /__push/* เอง
 *        GET    /__push/key       กุญแจสาธารณะ (มือถือใช้ลงทะเบียน)
 *        POST   /__push/devices   มือถือลงทะเบียนตัวเอง
 *        DELETE /__push/devices   มือถือยกเลิกตัวเอง
 *        GET    /__push           หน้าส่งแจ้งเตือน        ← เฉพาะเปิดจากคอมเครื่องนี้
 *        GET    /__push/list      รายชื่อเครื่อง           ← เฉพาะเปิดจากคอมเครื่องนี้
 *        POST   /__push/send      ส่งแจ้งเตือน             ← เฉพาะเปิดจากคอมเครื่องนี้
 *
 * กุญแจ VAPID และรายชื่อเครื่องเก็บใน .data/ (ไม่ขึ้น git) — ลบโฟลเดอร์ทิ้งคือเริ่มใหม่หมด
 */

import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import webpush from "web-push";
import { PUSH_SCENARIOS, pushServiceOf } from "../src/lib/push-scenarios.ts";

const PORT = Number(process.env.SENDER_PORT || 3100);
const TARGET = new URL(process.env.APP_URL || "http://localhost:3000");
const DATA = path.join(process.cwd(), ".data");
const KEY_FILE = path.join(DATA, "vapid.json");
const DEV_FILE = path.join(DATA, "push-devices.json");

mkdirSync(DATA, { recursive: true });

/* สร้างกุญแจครั้งแรกครั้งเดียว — เปลี่ยนกุญแจเมื่อไร ทุกเครื่องต้องลงทะเบียนใหม่ */
if (!existsSync(KEY_FILE)) writeFileSync(KEY_FILE, JSON.stringify(webpush.generateVAPIDKeys(), null, 2));
const vapid = JSON.parse(readFileSync(KEY_FILE, "utf8"));
/* Apple ตรวจ subject เข้ม: ต้องเป็น mailto: ที่โดเมนจริง หรือ https: — โดเมน .local/localhost ได้ 403 BadJwtToken (Google ไม่ตรวจ)
   ตั้งอีเมลผู้ดูแลจริงได้ด้วย VAPID_SUBJECT=mailto:... */
webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", vapid.publicKey, vapid.privateKey);

const readDevices = () => {
  try {
    return JSON.parse(readFileSync(DEV_FILE, "utf8"));
  } catch {
    return [];
  }
};
const writeDevices = (list) => writeFileSync(DEV_FILE, JSON.stringify(list, null, 2));
const idOf = (endpoint) => createHash("sha256").update(endpoint).digest("hex").slice(0, 10);

/* คำขอที่มาทางอุโมงค์ cloudflared มีหัว cf-connecting-ip เสมอ — ไม่มี = เปิดจากคอมเครื่องนี้ตรง ๆ
   หน้าส่งและรายชื่อเครื่องต้องเปิดจากคอมเท่านั้น ไม่งั้นใครได้ลิงก์ก็ยิงแจ้งเตือนใส่ทุกเครื่องได้ */
const isLocal = (req) =>
  !req.headers["cf-connecting-ip"] &&
  ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress);

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    return {};
  }
}

async function send(device, payload) {
  const started = Date.now();
  try {
    const r = await webpush.sendNotification(
      { endpoint: device.endpoint, keys: device.keys },
      JSON.stringify(payload),
      /* high = ปลุกเครื่องที่ล็อกจออยู่ (Android Doze / iOS) ให้ขึ้นทันที · TTL 1 ชม. เผื่อเครื่องไม่มีเน็ตชั่วคราว */
      { TTL: 3600, urgency: "high" },
    );
    return { ok: true, status: r.statusCode, ms: Date.now() - started };
  } catch (e) {
    return {
      ok: false,
      status: e.statusCode || 0,
      gone: e.statusCode === 404 || e.statusCode === 410,
      error: String(e.body || e.message).slice(0, 300),
      ms: Date.now() - started,
    };
  }
}

async function handlePush(req, res, url) {
  const p = url.pathname;

  if (p === "/__push/key" && req.method === "GET") return json(res, 200, { publicKey: vapid.publicKey });

  if (p === "/__push/devices" && req.method === "POST") {
    const b = await readBody(req);
    const s = b.subscription;
    if (typeof s?.endpoint !== "string" || !s.endpoint.startsWith("https://") || !s.keys?.p256dh || !s.keys?.auth)
      return json(res, 400, { error: "subscription ไม่ครบ" });
    const list = readDevices();
    const old = list.find((d) => d.endpoint === s.endpoint || d.endpoint === b.oldEndpoint);
    const device = {
      id: idOf(s.endpoint),
      endpoint: s.endpoint,
      keys: { p256dh: String(s.keys.p256dh), auth: String(s.keys.auth) },
      label: String(b.label || old?.label || "ไม่ได้ตั้งชื่อ").slice(0, 60),
      platform: String(b.platform || old?.platform || "").slice(0, 80),
      service: pushServiceOf(s.endpoint),
      createdAt: old?.createdAt || new Date().toISOString(),
    };
    writeDevices([device, ...list.filter((d) => d !== old && d.endpoint !== s.endpoint)]);
    console.log(`+ ลงทะเบียน ${device.label} (${device.service})`);
    return json(res, 200, { id: device.id, service: device.service });
  }

  if (p === "/__push/devices" && req.method === "DELETE") {
    const b = await readBody(req);
    const list = readDevices();
    writeDevices(list.filter((d) => d.endpoint !== b.endpoint));
    return json(res, 200, { removed: list.length - readDevices().length });
  }

  /* ── ต่อจากนี้เฉพาะคอมเครื่องนี้ ── */
  if (!isLocal(req)) return json(res, 403, { error: "เปิดได้จากคอมที่รันตัวส่งเท่านั้น" });

  if (p === "/__push" || p === "/__push/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    /* อ่านใหม่ทุกครั้ง — แก้หน้าแล้วรีเฟรชได้เลย ไม่ต้องรีสตาร์ทตัวส่ง */
    return res.end(readFileSync(new URL("./push-sender.html", import.meta.url), "utf8"));
  }

  if (p === "/__push/list" && req.method === "GET")
    return json(res, 200, {
      devices: readDevices().map((d) => ({ ...d, keys: undefined })),
      /* ส่งหัวข้อ/ข้อความ/ระดับไปด้วย ให้หน้าส่งแสดงตัวอย่างก่อนกดส่ง */
      scenarios: PUSH_SCENARIOS.map((s) => {
        const p = s.build();
        return { key: s.key, label: s.label, checks: s.checks, title: p.title, body: p.body, url: p.url, level: p.level };
      }),
    });

  if (p === "/__push/send" && req.method === "POST") {
    const b = await readBody(req);
    const scenario = PUSH_SCENARIOS.find((s) => s.key === b.scenario) ?? PUSH_SCENARIOS[0];
    const draft = scenario.build();
    /* ข้อความพิมพ์เอง — ทับเฉพาะช่องที่กรอก */
    if (b.title) draft.title = String(b.title).slice(0, 120);
    if (b.body) draft.body = String(b.body).slice(0, 400);
    if (b.url) draft.url = String(b.url).startsWith("/") ? String(b.url) : "/";
    const payload = { ...draft, id: randomUUID().slice(0, 8), sentAt: Date.now() };

    const all = readDevices();
    const targets = b.to === "all" ? all : all.filter((d) => d.id === b.to);
    if (targets.length === 0) return json(res, 404, { error: "ไม่มีเครื่องที่เลือก" });

    const results = await Promise.all(
      targets.map(async (d) => ({ id: d.id, label: d.label, service: d.service, ...(await send(d, payload)) })),
    );
    /* 404/410 = เครื่องถอนสิทธิ์หรือลบแอปแล้ว เก็บไว้ก็ส่งไม่ถึงอีก */
    const gone = new Set(results.filter((r) => r.gone).map((r) => r.id));
    const now = new Date().toISOString();
    writeDevices(
      readDevices()
        .filter((d) => !gone.has(d.id))
        .map((d) => {
          const r = results.find((x) => x.id === d.id);
          return r ? { ...d, lastSentAt: now, lastStatus: r.status, lastError: r.error } : d;
        }),
    );
    for (const r of results) console.log(`${r.ok ? "✓" : "✗"} ${payload.title} → ${r.label} ${r.status}${r.error ? " " + r.error : ""}`);
    return json(res, 200, { payloadId: payload.id, results });
  }

  return json(res, 404, { error: "ไม่พบ" });
}

/* ส่งต่อไปที่ระบบ ERP MAZ ตามเดิมทุกอย่าง */
function proxy(req, res) {
  const upstream = http.request(
    {
      hostname: TARGET.hostname,
      port: TARGET.port,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, host: TARGET.host },
    },
    (up) => {
      res.writeHead(up.statusCode || 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(`ติดต่อระบบที่ ${TARGET.origin} ไม่ได้ — รันระบบก่อน (npm start หรือ npm run dev)`);
  });
  req.pipe(upstream);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", "http://x");
    if (url.pathname === "/__push" || url.pathname.startsWith("/__push/"))
      return handlePush(req, res, url).catch((e) => json(res, 500, { error: String(e) }));
    proxy(req, res);
  })
  .listen(PORT, () => {
    console.log(`ตัวส่งแจ้งเตือนทดสอบ: http://localhost:${PORT}/__push`);
    console.log(`ส่งต่อระบบไปที่ ${TARGET.origin}`);
    console.log(`ลิงก์ให้มือถือ: npx cloudflared tunnel --url http://localhost:${PORT}`);
  });
