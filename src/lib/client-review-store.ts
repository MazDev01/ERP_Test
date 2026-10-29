"use client";

/*
 * ลูกค้าตรวจงานผ่านลิงก์ (เฟส 1 — หน้าบ้านอย่างเดียว เจ้าของสั่ง 2 ต.ค. 2569)
 *
 *   PM ส่งงานที่ตรวจผ่านแล้วให้ลูกค้า → ได้ลิงก์ /review/<token> หนึ่งรอบ (Draft N ต่องาน)
 *   ลูกค้าเปิดลิงก์ ไม่ต้องล็อกอิน → ดูไฟล์ คอมเมนต์ตามเวลาในวิดีโอ/ปักหมุดบนรูป → ส่งความเห็น หรืออนุมัติทั้งหมด
 *   ลูกค้าคอมเมนต์ → PM ส่งให้ทีมแก้ (ใช้ทางตีกลับเดิม sendBackWork) → ทีมส่งแก้ → PM ตรวจผ่าน = ส่งลูกค้ารอบใหม่
 *   ลูกค้าอนุมัติ → งานปิดเองทันที (approveWorkFlow byClient) แก้/ตีกลับไม่ได้อีก (เจ้าของสั่ง 20 ต.ค. 2569)
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

/* แบนเนอร์คลินิกตัวอย่าง (รอบที่ลูกค้าคอมเมนต์แล้ว PM ส่งต่อให้ทีมแก้) */
const DEMO_BANNER = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
<defs><linearGradient id="b" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fdeff2"/><stop offset="1" stop-color="#f7d6de"/></linearGradient></defs>
<rect width="1200" height="420" fill="url(#b)"/>
<circle cx="930" cy="210" r="170" fill="#fff" opacity=".7"/><circle cx="930" cy="210" r="120" fill="#f2b8c6"/>
<g font-family="sans-serif">
<rect x="1010" y="28" width="150" height="44" rx="22" fill="#b0103a"/><text x="1036" y="57" font-size="18" font-weight="700" fill="#fff">ใสใส คลินิก</text>
<text x="70" y="130" font-size="44" font-weight="800" fill="#5a0f22">เลเซอร์หน้าใส</text>
<text x="70" y="185" font-size="30" font-weight="700" fill="#b0103a">โปรเดือนตุลาคม</text>
<text x="70" y="245" font-size="15" fill="#7a5560">เหลือเพียง 1,990 บาท จากปกติ 3,500 บาท</text>
<rect x="70" y="290" width="200" height="54" rx="27" fill="#b0103a"/><text x="112" y="324" font-size="19" font-weight="700" fill="#fff">จองคิวเลย</text>
</g></svg>`);


/* แบนเนอร์ร้านเค้กตัวอย่าง (รอบที่ลูกค้าคอมเมนต์แล้ว รอ PM ส่งต่อ) */
const DEMO_CAKE = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="420" viewBox="0 0 1200 420">
<rect width="1200" height="420" fill="#fbf1e4"/>
<circle cx="900" cy="230" r="160" fill="#f3dcc0"/>
<rect x="800" y="210" width="200" height="110" rx="14" fill="#8a5a3c"/><rect x="800" y="190" width="200" height="34" rx="12" fill="#f7e6ee"/>
<rect x="895" y="140" width="10" height="50" fill="#f5a623"/><circle cx="900" cy="132" r="9" fill="#ffcf5a"/>
<g font-family="sans-serif">
<text x="70" y="70" font-size="22" font-weight="700" fill="#6b3f26">ใจงามเบเกอรี่</text>
<text x="70" y="160" font-size="46" font-weight="800" fill="#4a2a18">เค้กวันเกิด</text>
<text x="70" y="215" font-size="28" font-weight="700" fill="#a0673f">สั่งล่วงหน้า 2 วัน</text>
<rect x="70" y="270" width="200" height="54" rx="27" fill="#d9b48f"/><text x="118" y="304" font-size="19" font-weight="700" fill="#fff">สั่งเค้ก</text>
</g></svg>`);

const DEMO_CAKE_POSTER = svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
<rect width="1280" height="720" fill="#4a2a18"/><circle cx="980" cy="200" r="240" fill="#fff" opacity=".06"/>
<text x="90" y="340" font-family="sans-serif" font-size="64" font-weight="800" fill="#fff">ใจงามเบเกอรี่</text>
<text x="90" y="410" font-family="sans-serif" font-size="32" fill="#f3dcc0">วิดีโอเปิดเว็บ · ร่างแรก</text>
</svg>`);

/* ภาพเฟรมของคอมเมนต์ในวิดีโอตัวอย่าง */
const frameAt = (label: string) =>
  svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135">
<defs><linearGradient id="f" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6b0000"/><stop offset="1" stop-color="#db0000"/></linearGradient></defs>
<rect width="240" height="135" fill="url(#f)"/><text x="120" y="78" font-family="sans-serif" font-size="28" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>
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
  /* ตัวอย่างลูกค้าตอบกลับเดือน ต.ค. 2569 (เพิ่ม 8 ต.ค. 2569 สำหรับสาธิต) — คู่กับงานสถานะ wait ใน PJ-2569-0021/0022
     migrate ด้านล่างเติมให้เครื่องที่ยังไม่มีตาม token */
  {
    token: "jngBkr7Lp2wOct01Xa",
    pj: "PJ-2569-0021",
    taskName: "ออกแบบหน้าแรกและหน้าสินค้า",
    round: 1,
    createdAt: "2026-10-06 10:00",
    createdBy: "ชนิกานต์ วัฒนกุล",
    expiresAt: "2026-11-05",
    message: "แบบหน้าแรกและหน้าสินค้ารอบแรกค่ะ รบกวนดูสี ภาพเค้ก และปุ่มสั่งซื้อ ติดตรงไหนปักหมุดไว้ได้เลยค่ะ",
    contact: "วรรณา ใจงาม",
    project: "เว็บไซต์และระบบสั่งเค้ก ใจงามเบเกอรี่",
    files: [
      { id: "f-oct1-home", name: "หน้าแรก-ใจงาม-v2.png", kind: "image", size: "1.4 MB", url: DEMO_IMAGE },
      { id: "f-oct1-prod", name: "หน้าสินค้า-ใจงาม-v2.png", kind: "image", size: "1.1 MB", url: DEMO_IMAGE, approved: true },
    ],
    status: "submitted",
    submittedAt: "2026-10-07 20:15",
    comments: [
      { id: "c-oct1-1", fileId: "f-oct1-home", author: "วรรณา ใจงาม", text: "อยากให้ภาพเค้กวันเกิดขึ้นเป็นภาพแรกค่ะ ขายดีสุด", at: "2026-10-07 20:02", pin: { x: 48, y: 32, n: 1 } },
      { id: "c-oct1-2", fileId: "f-oct1-home", author: "วรรณา ใจงาม", text: "ปุ่มสั่งเค้กขอสีเข้มกว่านี้อีกนิด ตอนนี้กลืนกับพื้นหลัง", at: "2026-10-07 20:06", pin: { x: 72, y: 58, n: 2 } },
      { id: "c-oct1-3", fileId: "f-oct1-home", author: "วรรณา ใจงาม", text: "เพิ่มเบอร์โทรร้านที่ส่วนท้ายด้วยค่ะ", at: "2026-10-07 20:10" },
    ],
  },
  {
    token: "sxSaiC4m9QwOct02Yb",
    pj: "PJ-2569-0022",
    taskName: "เขียนแคปชันแคมเปญ ต.ค.",
    round: 1,
    createdAt: "2026-10-02 11:00",
    createdBy: "ชนิกานต์ วัฒนกุล",
    expiresAt: "2026-11-01",
    message: "แคปชันโพสต์เดือนตุลาคม 6 โพสต์ค่ะ ถ้าโอเคกดอนุมัติได้เลย ทีมจะตั้งเวลาโพสต์ตามแผน",
    contact: "พญ.อรวรรณ ใสสะอาด",
    project: "แคมเปญเลเซอร์หน้าใส คลินิกใสใส",
    files: [
      { id: "f-oct2-cap", name: "แคปชัน-ต.ค.-ใสใส.pdf", kind: "pdf", size: "310 KB", approved: true },
    ],
    status: "approved",
    submittedAt: "2026-10-03 09:40",
    comments: [
      { id: "c-oct2-1", fileId: "f-oct2-cap", author: "พญ.อรวรรณ ใสสะอาด", text: "อนุมัติค่ะ โพสต์ที่ 4 ขอเปลี่ยนคำว่า 'หายขาด' เป็น 'ดูแลต่อเนื่อง' ตามกฎโฆษณาคลินิก", at: "2026-10-03 09:38", page: 2 },
    ],
  },
  /*
   * ตัวอย่างรอบที่ลูกค้าคอมเมนต์แล้ว แต่ PM ยังไม่ได้ส่งต่อ (เพิ่ม 20 ต.ค. 2569) — คู่กับงาน "ทำแบนเนอร์และวิดีโอเปิดหน้าเว็บ" ของ E05
   * PM กดส่งให้ทีมแก้ → งานเป็นต้องแก้ไข ทีมเห็นรูปพร้อมหมุดในหน้างานที่ได้รับ
   */
  {
    token: "jngBnrV5kQOct04Wd",
    pj: "PJ-2569-0021",
    taskName: "ทำแบนเนอร์และวิดีโอเปิดหน้าเว็บ",
    round: 1,
    createdAt: "2026-10-14 10:00",
    createdBy: "ชนิกานต์ วัฒนกุล",
    expiresAt: "2026-11-13",
    message: "แบนเนอร์หน้าแรก 2 ขนาดและวิดีโอเปิดเว็บรอบแรกค่ะ ติดตรงไหนปักหมุดหรือคอมเมนต์ตามเวลาในวิดีโอได้เลยค่ะ",
    contact: "วรรณา ใจงาม",
    project: "เว็บไซต์และระบบสั่งเค้ก ใจงามเบเกอรี่",
    files: [
      { id: "f-oct4-desk", name: "แบนเนอร์-ใจงาม-เดสก์ท็อป.png", kind: "image", size: "740 KB", url: DEMO_CAKE },
      { id: "f-oct4-mob", name: "แบนเนอร์-ใจงาม-มือถือ.png", kind: "image", size: "210 KB", local: true },
      { id: "f-oct4-vid", name: "วิดีโอเปิดเว็บ-ใจงาม-20วิ.mp4", kind: "video", size: "8.4 MB", poster: DEMO_CAKE_POSTER, duration: 20, demo: true },
    ],
    status: "submitted",
    submittedAt: "2026-10-15 20:30",
    comments: [
      { id: "c-oct4-1", fileId: "f-oct4-desk", author: "วรรณา ใจงาม", text: "ปุ่มสั่งเค้กสีจางไป ขอน้ำตาลเข้มแบบโลโก้ค่ะ", at: "2026-10-15 20:05", pin: { x: 14, y: 71, n: 1 } },
      { id: "c-oct4-2", fileId: "f-oct4-desk", author: "วรรณา ใจงาม", text: "ภาพเค้กขอใหญ่ขึ้นอีกนิด ให้เห็นหน้าเค้ก", at: "2026-10-15 20:08", pin: { x: 75, y: 55, n: 2 } },
      { id: "c-oct4-3", fileId: "f-oct4-desk", author: "วรรณา ใจงาม", text: "ชื่อร้านขอตัวใหญ่ขึ้นค่ะ", at: "2026-10-15 20:10", pin: { x: 12, y: 16, n: 3 } },
      { id: "c-oct4-4", fileId: "f-oct4-mob", author: "วรรณา ใจงาม", text: "บนมือถือตัวหนังสือทับภาพเค้ก", at: "2026-10-15 20:14", pin: { x: 46, y: 52, n: 1 } },
      { id: "c-oct4-5", fileId: "f-oct4-vid", author: "วรรณา ใจงาม", text: "ช่วงนี้ตัดภาพเร็วไป อยากให้ค้างภาพเค้กนานขึ้น", at: "2026-10-15 20:20", t: 6, frame: frameAt("0:06") },
      { id: "c-oct4-6", fileId: "f-oct4-vid", author: "วรรณา ใจงาม", text: "ตอนจบขอใส่เบอร์โทรร้านด้วยค่ะ", at: "2026-10-15 20:24", t: 18, frame: frameAt("0:18") },
    ],
  },
  /*
   * ตัวอย่างรอบที่ PM ส่งความเห็นลูกค้าต่อให้ทีมแก้ (เพิ่ม 20 ต.ค. 2569 สำหรับสาธิตหมุดในหน้างานของทีม)
   * คู่กับงาน "ทำแบนเนอร์หน้าเว็บคลินิก" ของ E05 ที่สถานะต้องแก้ไขอยู่แล้ว — forwardedAt ตรงกับ back.at ของงาน
   * ไฟล์มือถือเป็น local ไม่มี url = ตัวอย่างไฟล์ที่เปิดไม่ได้นอกแท็บ PM (กรอบตัวแทนพร้อมหมุด)
   * คอมเมนต์ c-oct3-4 PM ติ๊กแก้แล้ว — ทีมไม่เห็น
   */
  {
    token: "sxBnrK8vTqOct03Zc",
    pj: "PJ-2569-0022",
    taskName: "ทำแบนเนอร์หน้าเว็บคลินิก",
    round: 1,
    createdAt: "2026-10-06 09:30",
    createdBy: "ชนิกานต์ วัฒนกุล",
    expiresAt: "2026-11-05",
    message: "แบนเนอร์หน้าแรก 2 ขนาด และแบนเนอร์เคลื่อนไหวค่ะ ติดตรงไหนปักหมุดไว้ได้เลยค่ะ",
    contact: "พญ.อรวรรณ ใสสะอาด",
    project: "แคมเปญเลเซอร์หน้าใส คลินิกใสใส",
    files: [
      { id: "f-oct3-desk", name: "banner-ใสใส-เดสก์ท็อป.png", kind: "image", size: "620 KB", url: DEMO_BANNER },
      { id: "f-oct3-mob", name: "banner-ใสใส-มือถือ.png", kind: "image", size: "160 KB", local: true },
      { id: "f-oct3-vid", name: "แบนเนอร์เคลื่อนไหว-15วิ.mp4", kind: "video", size: "6.2 MB", poster: DEMO_POSTER, duration: 15, demo: true },
    ],
    status: "submitted",
    submittedAt: "2026-10-06 19:40",
    comments: [
      { id: "c-oct3-1", fileId: "f-oct3-desk", author: "พญ.อรวรรณ ใสสะอาด", text: "ตัวอักษรราคาเล็กไป อยากให้ 1,990 บาทเด่นกว่านี้", at: "2026-10-06 19:20", pin: { x: 18, y: 58, n: 1 } },
      { id: "c-oct3-2", fileId: "f-oct3-desk", author: "พญ.อรวรรณ ใสสะอาด", text: "โลโก้คลินิกต้องอยู่มุมซ้ายบนตามแบรนด์บุ๊กค่ะ", at: "2026-10-06 19:22", pin: { x: 90, y: 12, n: 2 } },
      { id: "c-oct3-3", fileId: "f-oct3-desk", author: "พญ.อรวรรณ ใสสะอาด", text: "ปุ่มจองคิวขอเป็นสีเดียวกับเว็บหลัก", at: "2026-10-06 19:25", pin: { x: 14, y: 76, n: 3 } },
      { id: "c-oct3-4", fileId: "f-oct3-desk", author: "พญ.อรวรรณ ใสสะอาด", text: "พื้นหลังชมพูอ่อนกว่านี้นิดนึง", at: "2026-10-06 19:27", done: true },
      { id: "c-oct3-5", fileId: "f-oct3-mob", author: "พญ.อรวรรณ ใสสะอาด", text: "บนมือถือราคาอ่านไม่ออกเลยค่ะ", at: "2026-10-06 19:31", pin: { x: 50, y: 64, n: 1 } },
      { id: "c-oct3-6", fileId: "f-oct3-mob", author: "พญ.อรวรรณ ใสสะอาด", text: "โลโก้ย้ายมาซ้ายบนเหมือนเดสก์ท็อป", at: "2026-10-06 19:33", pin: { x: 80, y: 10, n: 2 } },
      { id: "c-oct3-7", fileId: "f-oct3-vid", author: "พญ.อรวรรณ ใสสะอาด", text: "ช่วงนี้โลโก้ขึ้นช้าไป ขอให้ขึ้นตั้งแต่วินาทีแรก", at: "2026-10-06 19:36", t: 4, frame: frameAt("0:04") },
    ],
    forwardedAt: "2026-10-07",
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
      if (isState(v)) {
        store.set(migrate(v));
        syncClientOk();
      }
    } catch {
      // ข้อมูลเสีย — คงของเดิมไว้
    }
  });
}

/*
 * ลูกค้าอนุมัติในอีกแท็บ — สโตร์ของ PM ในแท็บนี้ยังถือของเก่า ปิดงานซ้ำในแท็บนี้ด้วย
 * ไม่งั้นแท็บ PM เขียนทับสถานะ "เสร็จแล้ว" ที่แท็บลูกค้าเพิ่งบันทึก ตอน PM กดอะไรสักอย่าง
 */
function syncClientOk() {
  const pm = pmSnapshot();
  const s = store.get();
  for (const r of s.rounds) {
    if (r.status !== "approved" || !r.closedAt) continue;
    if (latestRound(s, r.pj, r.taskName)?.token !== r.token) continue;
    const t = pm.projects.find((p) => isRef(p, r.pj))?.tasks.find((x) => x.name === r.taskName);
    if (t && !t.clientOk) approveWorkFlow(r.pj, r.taskName, r.closedAt, true);
  }
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
  approveWorkFlow(r.pj, r.taskName, at, true);
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
  /* ลูกค้าอนุมัติ = งานเสร็จทันที ไม่ต้องรอ PM กดปิด */
  patchRound(token, (x) => ({
    ...x,
    files,
    status: approved ? "approved" : "submitted",
    submittedAt: at,
    ...(approved ? { closedAt: at } : {}),
  }));
  addProjectAct(r.pj, {
    kind: "status",
    who: r.contact || "ลูกค้า",
    at,
    tx: approved
      ? `ลูกค้าอนุมัติ ${r.taskName} รอบที่ ${r.round}`
      : `ลูกค้าส่งความเห็น ${r.comments.length} จุด ใน ${r.taskName} รอบที่ ${r.round}`,
  });
  if (approved) approveWorkFlow(r.pj, r.taskName, at, true);
}

/** งานใบนี้เคยส่งให้ลูกค้าตรวจแล้ว — ต้องจบด้วยลูกค้าอนุมัติ PM ตรวจผ่านเองไม่ได้ */
export function needsClientOk(s: ClientReviewState, pj: string, taskName: string) {
  return s.rounds.some((r) => r.pj === pj && r.taskName === taskName);
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
