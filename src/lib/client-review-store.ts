"use client";

/*
 * ลูกค้าตรวจงานผ่านลิงก์ (เฟส 1 — หน้าบ้านอย่างเดียว เจ้าของสั่ง 2 ต.ค. 2569)
 *
 *   PM ส่งงานที่ตรวจผ่านแล้วให้ลูกค้า → ได้ลิงก์ /review/<token> หนึ่งรอบ (Draft N ต่องาน)
 *   ลูกค้าเปิดลิงก์ ไม่ต้องล็อกอิน → ดูไฟล์ คอมเมนต์ตามเวลาในวิดีโอ/ปักหมุดบนรูป → ส่งความเห็น หรืออนุมัติทั้งหมด
 *   PM เห็นความเห็น → ส่งให้ทีมแก้ (ใช้ทางตีกลับเดิม sendBackWork) หรือปิดงาน (approveWorkFlow)
 *
 * เฟส 1 ยังไม่มี backend ทุกอย่างอยู่ใน localStorage ของเบราว์เซอร์นี้ — ลิงก์จึงเปิดได้แค่ในเครื่องเดียวกัน
 * TODO เฟส 2: ตารางรอบตรวจที่เซิร์ฟเวอร์ + token แบบลงลายเซ็น (หมดอายุฝั่งเซิร์ฟเวอร์) + ที่เก็บไฟล์จริง
 *   ไฟล์ที่ PM เลือกจากเครื่องตอนนี้เปิดได้ผ่าน object URL ในรอบเปิดหน้านั้นเท่านั้น รีโหลดแล้วหาย
 */

import { useSyncExternalStore } from "react";
import { addDays, bkkStamp, todayIso } from "./format";
import { approveWorkFlow } from "./flow";
import { createPersistedStore } from "./persisted-store";
import { addProjectAct, pmSnapshot, sendBackWork, sendToClientWork } from "./pm-store";
import { isRef, legacyPj } from "./pm-data";

export type ReviewFileKind = "image" | "video" | "pdf" | "link";

export type ReviewFile = {
  id: string;
  name: string;
  kind: ReviewFileKind;
  /** ขนาดสำหรับแสดง เช่น "1.2 MB" — ไฟล์ที่รู้แค่ชื่อเป็น "—" */
  size: string;
  /** ที่อยู่ไฟล์ที่เปิดได้จริง (data URL ของตัวอย่าง หรือ URL ของลิงก์) — object URL ไม่เก็บตรงนี้ เพราะตายเมื่อรีโหลด */
  url?: string;
  poster?: string;
  /** ความยาววิดีโอเป็นวินาที */
  duration?: number;
  approved?: boolean;
  /** PM เลือกไฟล์จากเครื่อง — ตัวไฟล์อยู่ในหน่วยความจำของแท็บที่เลือกเท่านั้น (ดู liveUrl) */
  local?: boolean;
  /** ไฟล์วิดีโอตัวอย่าง ไม่มีไฟล์จริง — เล่นด้วยตัวเล่นจำลอง */
  demo?: boolean;
};

export type ReviewComment = {
  id: string;
  fileId: string;
  author: string;
  text: string;
  /** "YYYY-MM-DD HH:mm" */
  at: string;
  /** วินาทีในวิดีโอ — ไม่มี = ทั้งไฟล์ */
  t?: number;
  /** ภาพเฟรม ณ เวลานั้น (JPEG เล็ก ~240px) */
  frame?: string;
  /** หมุดบนรูป เป็นเปอร์เซ็นต์ของกว้าง/สูง */
  pin?: { x: number; y: number; n: number };
  page?: number;
  attach?: { name: string; data?: string };
  /** PM ติ๊กว่าแก้แล้ว */
  done?: boolean;
};

export type ReviewStatus = "open" | "submitted" | "approved" | "expired";

export type ReviewRound = {
  token: string;
  /** เลขที่โปรเจค (PJ-) — เดิมเก็บเลขที่ดีล ย้ายตอนอ่านข้อมูลเก่า (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  pj: string;
  taskName: string;
  /** รอบที่ของงานใบนี้ (Draft N) */
  round: number;
  createdAt: string;
  /** ชื่อ PM ที่ส่ง */
  createdBy: string;
  /** "YYYY-MM-DD" วันสุดท้ายที่ลิงก์ยังเปิดได้ */
  expiresAt: string;
  message: string;
  /** ผู้ติดต่อฝั่งลูกค้า — เติมชื่อผู้คอมเมนต์ให้ก่อน ลูกค้าแก้เองได้ */
  contact: string;
  /** ชื่อโปรเจคตอนส่ง — หน้าลูกค้าไม่ต้องอ่านสโตร์ของ PM */
  project: string;
  files: ReviewFile[];
  status: ReviewStatus;
  submittedAt?: string;
  comments: ReviewComment[];
  /** PM ส่งความเห็นต่อให้ทีมแก้แล้ว — ตรงกับ back.at ของงาน ใช้จับคู่ในหน้างานของทีม */
  forwardedAt?: string;
  /** PM ปิดงานหลังลูกค้าอนุมัติ */
  closedAt?: string;
};

export type ClientReviewState = { rounds: ReviewRound[] };

// ─── ตัวอย่าง (เดโม) ───────────────────────────────────────────────

function svgUrl(svg: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/* ภาพหน้าแรกเว็บไซต์ตัวอย่าง — วาดเป็น SVG ในตัว ไม่ต้องพึ่งไฟล์ภายนอก */
const DEMO_IMAGE = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
<rect width="1200" height="800" fill="#f4f6f8"/>
<rect width="1200" height="72" fill="#0d2b45"/>
<circle cx="64" cy="36" r="18" fill="#f5a623"/>
<text x="94" y="45" font-family="sans-serif" font-size="24" font-weight="700" fill="#fff">MTECH ENGINEERING</text>
<g font-family="sans-serif" font-size="17" fill="#c9d6e3"><text x="720" y="43">Home</text><text x="800" y="43">Services</text><text x="900" y="43">Projects</text><text x="1000" y="43">News</text><text x="1080" y="43">Contact</text></g>
<defs><linearGradient id="h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1b4f7a"/><stop offset="1" stop-color="#0d2b45"/></linearGradient></defs>
<rect y="72" width="1200" height="380" fill="url(#h)"/>
<path d="M700 452 L860 220 L960 330 L1040 250 L1200 452 Z" fill="#2a6a9c" opacity=".7"/>
<path d="M600 452 L780 300 L900 400 L980 340 L1200 452 Z" fill="#3a85bf" opacity=".6"/>
<text x="80" y="220" font-family="sans-serif" font-size="52" font-weight="800" fill="#fff">Engineering that</text>
<text x="80" y="285" font-family="sans-serif" font-size="52" font-weight="800" fill="#f5a623">builds the future</text>
<text x="80" y="335" font-family="sans-serif" font-size="20" fill="#c9d6e3">Industrial design · Installation · Maintenance since 2004</text>
<rect x="80" y="370" width="210" height="52" rx="26" fill="#f5a623"/><text x="122" y="403" font-family="sans-serif" font-size="19" font-weight="700" fill="#0d2b45">Get a quote</text>
<g font-family="sans-serif">
<rect x="80" y="500" width="320" height="230" rx="16" fill="#fff"/><rect x="80" y="500" width="320" height="120" rx="16" fill="#d8e3ec"/><text x="104" y="660" font-size="22" font-weight="700" fill="#0d2b45">Factory design</text><text x="104" y="692" font-size="15" fill="#6b7c8c">Layout, structure, utilities</text>
<rect x="440" y="500" width="320" height="230" rx="16" fill="#fff"/><rect x="440" y="500" width="320" height="120" rx="16" fill="#e7dccb"/><text x="464" y="660" font-size="22" font-weight="700" fill="#0d2b45">Installation</text><text x="464" y="692" font-size="15" fill="#6b7c8c">Machines and production lines</text>
<rect x="800" y="500" width="320" height="230" rx="16" fill="#fff"/><rect x="800" y="500" width="320" height="120" rx="16" fill="#d5e8dc"/><text x="824" y="660" font-size="22" font-weight="700" fill="#0d2b45">Maintenance</text><text x="824" y="692" font-size="15" fill="#6b7c8c">24/7 service contracts</text>
</g></svg>`);

/* ภาพปกของวิดีโอตัวอย่าง */
const DEMO_POSTER = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3b0a12"/><stop offset="1" stop-color="#c8102e"/></linearGradient></defs>
<rect width="1280" height="720" fill="url(#g)"/>
<circle cx="1040" cy="160" r="220" fill="#fff" opacity=".06"/><circle cx="200" cy="640" r="260" fill="#fff" opacity=".05"/>
<text x="90" y="330" font-family="sans-serif" font-size="64" font-weight="800" fill="#fff">MTECH</text>
<text x="90" y="400" font-family="sans-serif" font-size="34" fill="#ffd9de">Website intro · motion draft</text>
</svg>`);

/* token ตัวอย่าง — คงที่ เพื่อเปิดเดโมได้ทันที (ของจริงสุ่มด้วย newToken) */
export const DEMO_TOKEN = "mtk7Qd2LxR9vWp4aZc";

const SEED: ReviewRound[] = [
  {
    token: DEMO_TOKEN,
    pj: "PJ-2569-0002",
    taskName: "ออกแบบหน้าจอทั้งเว็บไซต์",
    round: 1,
    createdAt: "2026-10-01 10:30",
    createdBy: "ชนิกานต์ วัฒนกุล",
    expiresAt: "2026-12-29",
    message: "แบบหน้าแรกและวิดีโอเปิดเว็บรอบแรกค่ะ รบกวนดูสี ตัวอักษร และจังหวะวิดีโอ ติดตรงไหนคอมเมนต์ไว้ได้เลย",
    contact: "อรทัย รุ่งเรือง",
    project: "เว็บไซต์องค์กร เอ็มเทค",
    files: [
      { id: "f-demo-img", name: "หน้าแรก-ตัวอย่าง.png", kind: "image", size: "1.2 MB", url: DEMO_IMAGE },
      { id: "f-demo-vid", name: "วิดีโอเปิดเว็บ-draft1.mp4", kind: "video", size: "48.6 MB", poster: DEMO_POSTER, duration: 165, demo: true },
    ],
    status: "open",
    comments: [],
  },
];

const INITIAL: ClientReviewState = { rounds: SEED };

function isState(v: unknown): v is ClientReviewState {
  return typeof v === "object" && v !== null && Array.isArray((v as ClientReviewState).rounds);
}

/*
 * เติมรอบตัวอย่างที่เพิ่มเข้าชุดตั้งต้นทีหลัง — ไม่ทับรอบที่ผู้ใช้ทำไว้แล้ว
 * รอบรุ่นก่อน 5 ต.ค. 2569 อ้างโปรเจคด้วยเลขที่ดีล (ช่อง deal) — แปลงเป็นเลขที่โปรเจคจากสโตร์ของ PM
 */
function migrate(input: ClientReviewState): ClientReviewState {
  const legacy = input.rounds.some((r) => !r.pj);
  const v = legacy
    ? {
        ...input,
        rounds: input.rounds.map((r) => {
          if (r.pj) return r;
          const { deal, ...rest } = r as ReviewRound & { deal?: string };
          const pj = (deal && pmSnapshot().projects.find((p) => isRef(p, deal))?.pj) || legacyPj(deal);
          return { ...rest, pj };
        }),
      }
    : input;
  const have = new Set(v.rounds.map((r) => r.token));
  const added = SEED.filter((r) => !have.has(r.token));
  return added.length ? { ...v, rounds: [...v.rounds, ...added] } : v;
}

const store = createPersistedStore<ClientReviewState>("maz-erp.client-review.v1", INITIAL, isState, migrate);

/*
 * ลูกค้ากับ PM มักเปิดคนละแท็บ (เฟส 1 ต้องเป็นเบราว์เซอร์เดียวกัน) — ถ้าไม่ฟังการเปลี่ยนจากแท็บอื่น
 * แท็บ PM จะถือของเก่าในหน่วยความจำ แล้วเขียนทับคอมเมนต์ที่ลูกค้าเพิ่งส่งตอน PM กดอะไรสักอย่าง
 */
const STORE_KEY = "maz-erp.client-review.v1";
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== STORE_KEY || !e.newValue) return;
    try {
      const v: unknown = JSON.parse(e.newValue);
      if (isState(v)) store.set(migrate(v));
    } catch {
      // ข้อมูลเสีย — คงของเดิมไว้
    }
  });
}

export function useClientReviews() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function clientReviewSnapshot() {
  return store.get();
}

// ─── ตัวช่วย ──────────────────────────────────────────────────────

/** token สุ่ม 20 ตัวอักษร — เฟส 2 ต้องเป็น token ลงลายเซ็นที่ออกจากเซิร์ฟเวอร์ */
export function newToken(len = 20) {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const buf = new Uint32Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (n) => abc[n % abc.length]).join("");
}

export function newId(prefix: string) {
  return `${prefix}-${newToken(10)}`;
}

/** สถานะจริงของรอบ ณ วันนี้ — ลิงก์ที่ยังเปิดอยู่แต่เลยวันหมดอายุถือว่าหมดอายุ */
export function roundStatus(r: ReviewRound, today = todayIso()): ReviewStatus {
  if (r.status === "open" && r.expiresAt < today) return "expired";
  return r.status;
}

export function roundsOfTask(s: ClientReviewState, pj: string, taskName: string) {
  return s.rounds.filter((r) => r.pj === pj && r.taskName === taskName).sort((a, b) => a.round - b.round);
}

export function latestRound(s: ClientReviewState, pj: string, taskName: string) {
  const list = roundsOfTask(s, pj, taskName);
  return list[list.length - 1];
}

export function findRound(s: ClientReviewState, token: string) {
  return s.rounds.find((r) => r.token === token);
}

/** ชนิดไฟล์จากชื่อ — วิดีโอแยกออกจาก pdf (fileKind ของ PM ไม่มีวิดีโอ) */
export function reviewKindOf(name: string): ReviewFileKind {
  const x = name.toLowerCase();
  if (/^https?:\/\//.test(x) || x.includes("figma") || x.startsWith("ลิงก์")) return "link";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(x)) return "image";
  if (/\.(mp4|mov|webm|m4v|mkv|avi)$/.test(x)) return "video";
  return "pdf";
}

export function sizeText(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** "1.2 MB" → ไบต์ · อ่านไม่ออก = 0 */
function bytesOf(size: string) {
  const m = /^([\d.]+)\s*(B|KB|MB|GB)$/i.exec(size.trim());
  if (!m) return 0;
  const mul = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3 }[m[2].toUpperCase() as "B"];
  return Number(m[1]) * mul;
}

export function totalSize(files: ReviewFile[]) {
  const sum = files.reduce((s, f) => s + bytesOf(f.size), 0);
  return sum ? sizeText(Math.round(sum)) : "—";
}

/** วินาที → "2:45" */
export function clock(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** ตำแหน่งของคอมเมนต์ในไฟล์ — ใช้ทั้งหน้าลูกค้า ฝั่ง PM และข้อความตีกลับ */
export function commentWhere(c: ReviewComment) {
  if (c.t !== undefined) return `ที่ ${clock(c.t)}`;
  if (c.pin) return `จุดที่ ${c.pin.n}`;
  if (c.page) return `หน้า ${c.page}`;
  return "ทั้งไฟล์";
}

/*
 * object URL ของไฟล์ที่ PM เลือกจากเครื่อง — อยู่ในหน่วยความจำของแท็บนี้เท่านั้น ไม่ลง localStorage
 * รีโหลดหรือเปิดจากแท็บใหม่แล้วไม่มี → ตัวดูไฟล์ขึ้นตัวแทนพร้อมบอกว่ายังไม่มีที่เก็บไฟล์จริง
 * (เปิด "ดูแบบลูกค้า" เป็นแท็บใหม่ก็เป็นอีกหน้า แต่ origin เดียวกัน blob URL ยังเปิดได้ตราบที่แท็บ PM ยังอยู่
 *  จึงเก็บ URL ลง sessionStorage ด้วย แท็บที่เปิดจากแท็บนี้ได้สำเนา sessionStorage ไปด้วย)
 */
const LIVE = new Map<string, string>();
const LIVE_KEY = "maz-erp.client-review.live";

export function liveUrl(f: ReviewFile): string | undefined {
  if (f.url) return f.url;
  if (!f.local) return undefined;
  const hit = LIVE.get(f.id);
  if (hit) return hit;
  try {
    const all = JSON.parse(sessionStorage.getItem(LIVE_KEY) ?? "{}") as Record<string, string>;
    return all[f.id];
  } catch {
    return undefined;
  }
}

function keepLive(id: string, url: string) {
  LIVE.set(id, url);
  try {
    const all = JSON.parse(sessionStorage.getItem(LIVE_KEY) ?? "{}") as Record<string, string>;
    all[id] = url;
    sessionStorage.setItem(LIVE_KEY, JSON.stringify(all));
  } catch {
    // โหมดส่วนตัว — ยังเปิดได้ในแท็บนี้
  }
}

// ─── ฝั่ง PM ──────────────────────────────────────────────────────

export type NewReviewFile = Omit<ReviewFile, "id"> & { blobUrl?: string };

/**
 * สร้างรอบให้ลูกค้าตรวจ — คืน token ของลิงก์
 * งานเปลี่ยนเป็น "รอลูกค้าตรวจ" และลงกิจกรรมของโปรเจค (sendToClientWork)
 */
export function createRound(input: {
  pj: string;
  taskName: string;
  project: string;
  createdBy: string;
  message: string;
  contact: string;
  days: number;
  files: NewReviewFile[];
}) {
  const token = newToken();
  const at = bkkStamp();
  const s = store.get();
  const round = (latestRound(s, input.pj, input.taskName)?.round ?? 0) + 1;
  const files: ReviewFile[] = input.files.map((f) => {
    const id = newId("f");
    const { blobUrl, ...rest } = f;
    if (blobUrl) keepLive(id, blobUrl);
    return { ...rest, id };
  });
  const r: ReviewRound = {
    token,
    pj: input.pj,
    taskName: input.taskName,
    round,
    createdAt: at,
    createdBy: input.createdBy,
    expiresAt: addDays(at.slice(0, 10), Math.max(1, input.days)),
    message: input.message.trim(),
    contact: input.contact.trim(),
    project: input.project,
    files,
    status: "open",
    comments: [],
  };
  store.update((st) => ({ ...st, rounds: [...st.rounds, r] }));
  sendToClientWork(input.pj, input.taskName, round, at);
  return token;
}

function patchRound(token: string, fn: (r: ReviewRound) => ReviewRound) {
  store.update((s) => ({ ...s, rounds: s.rounds.map((r) => (r.token === token ? fn(r) : r)) }));
}

/** PM ติ๊ก "แก้แล้ว" ทีละคอมเมนต์ */
export function toggleCommentDone(token: string, id: string) {
  patchRound(token, (r) => ({
    ...r,
    comments: r.comments.map((c) => (c.id === id ? { ...c, done: !c.done } : c)),
  }));
}

/** ข้อความตีกลับจากคอมเมนต์ลูกค้า — บรรทัดละจุด ทีมเห็นในกล่อง "สิ่งที่ต้องแก้" เดิม */
export function composeReason(r: ReviewRound) {
  const open = r.comments.filter((c) => !c.done);
  const lines = open.map((c) => {
    const f = r.files.find((x) => x.id === c.fileId);
    const extra = c.attach ? ` (แนบ ${c.attach.name})` : "";
    return `ไฟล์ ${f?.name ?? "—"} ${commentWhere(c)}: ${c.text}${extra}`;
  });
  return [`ความเห็นจากลูกค้า รอบที่ ${r.round}${r.contact ? ` · ${r.contact}` : ""}`, ...lines].join("\n");
}

/** ส่งความเห็นของลูกค้าให้ทีมแก้ — ใช้ทางตีกลับเดิม งานกลายเป็น "ต้องแก้ไข" */
export function forwardToTeam(token: string) {
  const r = findRound(store.get(), token);
  if (!r || !r.comments.some((c) => !c.done)) return;
  const at = bkkStamp();
  sendBackWork(r.pj, r.taskName, composeReason(r), at);
  patchRound(token, (x) => ({ ...x, forwardedAt: at }));
}

/** ลูกค้าอนุมัติแล้ว PM ปิดงาน — ใช้ทางตรวจผ่านเดิม (ปิดใบงานฝั่งขายให้ถ้าครบทุกใบ) */
export function closeFromClient(token: string) {
  const r = findRound(store.get(), token);
  if (!r) return;
  const at = bkkStamp();
  approveWorkFlow(r.pj, r.taskName, at);
  patchRound(token, (x) => ({ ...x, closedAt: at }));
}

// ─── ฝั่งลูกค้า ───────────────────────────────────────────────────

/* แก้ได้เฉพาะรอบที่ยังเปิดและยังไม่หมดอายุ — ส่งแล้วถือเป็นเอกสาร ห้ามแก้ */
function patchOpen(token: string, fn: (r: ReviewRound) => ReviewRound) {
  patchRound(token, (r) => (roundStatus(r) === "open" ? fn(r) : r));
}

export function addComment(token: string, c: Omit<ReviewComment, "id" | "at">) {
  const full: ReviewComment = { ...c, id: newId("c"), at: bkkStamp() };
  patchOpen(token, (r) => ({ ...r, comments: [...r.comments, full] }));
  return full.id;
}

export function editComment(token: string, id: string, text: string) {
  const v = text.trim();
  if (!v) return;
  patchOpen(token, (r) => ({ ...r, comments: r.comments.map((c) => (c.id === id ? { ...c, text: v } : c)) }));
}

export function deleteComment(token: string, id: string) {
  patchOpen(token, (r) => ({ ...r, comments: r.comments.filter((c) => c.id !== id) }));
}

export function setFileApproved(token: string, fileId: string, approved: boolean) {
  patchOpen(token, (r) => ({ ...r, files: r.files.map((f) => (f.id === fileId ? { ...f, approved } : f)) }));
}

/**
 * ลูกค้าส่งรอบนี้ — all = กด "อนุมัติงานทั้งหมด"
 * ไม่มีคอมเมนต์และทุกไฟล์อนุมัติแล้ว = อนุมัติ · นอกนั้น = ส่งความเห็น
 */
export function submitRound(token: string, all: boolean) {
  const r = findRound(store.get(), token);
  if (!r || roundStatus(r) !== "open") return;
  const at = bkkStamp();
  const files = all ? r.files.map((f) => ({ ...f, approved: true })) : r.files;
  const approved = files.every((f) => f.approved) && (all || r.comments.length === 0);
  patchRound(token, (x) => ({ ...x, files, status: approved ? "approved" : "submitted", submittedAt: at }));
  addProjectAct(r.pj, {
    kind: "status",
    who: r.contact || "ลูกค้า",
    at,
    tx: approved
      ? `ลูกค้าอนุมัติ ${r.taskName} รอบที่ ${r.round}`
      : `ลูกค้าส่งความเห็น ${r.comments.length} จุด ใน ${r.taskName} รอบที่ ${r.round}`,
  });
}

/* ชื่อผู้คอมเมนต์ที่ลูกค้าแก้ไว้ — จำต่อเบราว์เซอร์ */
const NAME_KEY = "maz-erp.client-review.name";

export function rememberedName() {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(v: string) {
  try {
    localStorage.setItem(NAME_KEY, v);
  } catch {
    // ไม่เป็นไร ใช้ชื่อในช่องต่อได้
  }
}

/** วันหมดอายุตั้งต้น */
export const DEFAULT_EXPIRY_DAYS = 30;
