"use client";

/*
 * ตัวตนและการแบ่งงานของทีมก่อนการขาย (บทบาท ps) — ใช้ร่วมกันสามหน้า
 * งานก่อนการขาย (/presales-work) · แดชบอร์ด (/presales-dash) · ตารางงาน (/presales-schedule)
 * ต้นแบบ dose-erp-maz/presales-*.html
 */

import { useSyncExternalStore } from "react";
import type { PresalesRequest } from "./crm-data";
import { bkkStamp, daysBetween } from "./format";
import { USERS } from "./mock-data";
import { createPersistedStore } from "./persisted-store";

/** ชื่อในคิวงานตามต้นแบบ "ปิยะวัฒน์ (SA)" — ชื่อต้นกับตำแหน่งของคนที่ล็อกอิน */
export const PS_ME = {
  name: `${USERS.ps.name.split(" ")[0]} (${USERS.ps.position})`,
  full: USERS.ps.name,
  employeeId: USERS.ps.employeeId,
  kind: (USERS.ps.position === "BD" ? "BD" : "SA") as "SA" | "BD",
};

/** ประเภทคำขอที่กล่องงานก่อนการขายรับผิดชอบ — ตอนนี้รับทั้งสองประเภท */
export const PS_KINDS: PresalesRequest["kind"][] = ["SA", "BD"];

/*
 * ประเภทของคำขอบอก "เนื้องาน" ไม่ใช่ "ตัวคน" (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * SA = วิเคราะห์เชิงเทคนิค · BD = ข้อเสนอเชิงธุรกิจ — ติดกับใบงานตั้งแต่ฝ่ายขายเปิดคำขอ
 * ใครกดรับงานไปทำเป็นคนละเรื่อง ไปอยู่บรรทัดผู้รับผิดชอบ (psOwner) ป้ายประเภทห้ามเปลี่ยนตาม
 */
export const PS_KIND_LABEL: Record<PresalesRequest["kind"], string> = {
  SA: "วิเคราะห์เทคนิค",
  BD: "ข้อเสนอธุรกิจ",
};

/** ป้ายประเภทแบบเต็ม "SA · วิเคราะห์เทคนิค" — ใช้ที่ที่มีที่พอให้อ่านว่าเป็นงานอะไร */
export function psKindText(kind: PresalesRequest["kind"]) {
  return `${kind} · ${PS_KIND_LABEL[kind]}`;
}

/** แท็บของหน้างานก่อนการขาย — รอข้อมูลเพิ่มแยกแท็บ เพราะเป็นงานที่รอฝ่ายขายตอบ ไม่ใช่งานในมือ */
export type PsTab = "todo" | "doing" | "wait" | "done";

export function psBucket(r: PresalesRequest): PsTab {
  if (r.status === "รอรับงาน") return "todo";
  if (r.status === "กำลังทำ") return "doing";
  if (r.status === "รอข้อมูลเพิ่ม") return "wait";
  return "done";
}

/*
 * คำขอที่ต้องมีคนเห็น (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * บริษัทมี SA กับ BD อย่างละคน การแยกกล่องงานตามประเภททำให้คำขอของอีกประเภท
 * ไม่ขึ้นที่ใครเลยแล้วหายไป กล่องเดียวจึงรวมทั้งสองประเภท แล้วติดป้ายบอกประเภท
 * กับผู้รับผิดชอบไว้ทุกแถวแทน — จะกรองตามตำแหน่งก็ต่อเมื่อมีผู้ใช้ BD จริงแล้ว
 */
export function psMine(r: PresalesRequest) {
  return PS_KINDS.includes(r.kind);
}

/** ใครรับผิดชอบคำขอนี้ — ยังไม่มีใครรับก็ต้องบอกให้เห็น ไม่ใช่เว้นว่าง */
export function psOwner(r: PresalesRequest) {
  const who = r.assignee.trim();
  if (!who) return "ยังไม่มีผู้รับผิดชอบ";
  /* ชื่อที่ฝ่ายขายระบุมาตอนเปิดคำขอ ยังไม่ใช่การรับงาน — ต้องแยกให้ออก */
  return r.status === "รอรับงาน" ? `${who} · ยังไม่กดรับงาน` : who;
}

/** ไม่มีใครรับเกินกี่วันถึงต้องเตือนผู้จัดการทั่วไป */
export const PS_UNTAKEN_DAYS = 1;

/** คำขอนี้ค้างอยู่ในขั้น "รอรับงาน" มากี่วันแล้ว — ขั้นอื่นถือว่ามีคนรับแล้ว */
export function psUntakenDays(r: PresalesRequest, today: string) {
  return r.status === "รอรับงาน" ? daysBetween(r.createdAt, today) : 0;
}

/** ลิงก์เจาะเข้าคำขอเดียวในหน้างานก่อนการขาย — เปิดแท็บของงานนั้นพร้อมหน้าต่างงาน */
export function psWorkLink(no: string) {
  return `/presales-work?find=${encodeURIComponent(no)}`;
}

/* ─── บทสนทนาขอ/ตอบข้อมูลเพิ่ม ────────────────────────────────────
 *
 * ใบคำขอเก็บได้แค่ข้อความล่าสุดอย่างละหนึ่ง (ask / reply ใน crm-data)
 * ฝ่ายขายจึงเปิดกล่อง "ตอบข้อมูลเพิ่ม" มาเจอช่องเปล่า ไม่รู้ว่าทีมถามอะไร แล้วไปถามกันในไลน์แทน
 * ที่นี่เก็บทุกข้อความต่อกันเป็นสายเดียว ทั้งสองฝั่งจึงอ่านย้อนได้ว่าคุยอะไรกันไปแล้ว
 */
export type PsNote = {
  /** ps = ทีมก่อนการขายถาม · sales = ฝ่ายขายตอบ */
  side: "ps" | "sales";
  /** ชื่อผู้พิมพ์ — ต้องรู้ว่าใครถาม ไม่ใช่แค่ว่า "ทีมถาม" */
  by: string;
  /** "yyyy-mm-dd hh:mm" */
  at: string;
  tx: string;
  /** ไฟล์ที่แนบมากับคำตอบของฝ่ายขาย (ผู้ใช้สั่ง 5 ต.ค. 2569) — ยังไม่มีที่เก็บไฟล์ จึงเก็บชื่อไว้แสดง */
  files?: { name: string; url?: string }[];
};

/*
 * คำขอตั้งต้นที่ค้างอยู่ในขั้น "รอข้อมูลเพิ่ม" มาก่อนจะมีสายสนทนา — ไม่มีคำถามติดมาเลย
 * เติมคำถามของทีมไว้ ฝ่ายขายจะได้มีอะไรให้ตอบตั้งแต่เปิดระบบครั้งแรก
 */
const PS_THREAD_SEED: Record<string, PsNote[]> = {
  "PS-2569-0030": [
    {
      side: "ps",
      by: "ปิยะวัฒน์ (SA)",
      at: "2026-08-28 10:20",
      tx: "ขอจำนวนรถที่ใช้จริงตอนนี้กี่คัน และต้องติดกล่องติดตามทุกคันหรือเฉพาะรถขนส่งหลัก",
    },
  ],
  "PS-2569-0017": [
    {
      side: "ps",
      by: "ธนดล (BD)",
      at: "2026-08-18 14:05",
      tx: "ลูกค้าจะให้เราทำเพจด้วยไหม หรือเอาเฉพาะระบบจองห้องพัก · ขอจำนวนห้องที่ต้องรองรับด้วย",
    },
  ],
  /* ชุดตัวอย่างเดือน ต.ค. 2569 (crm-data DEMO_OCT_PRESALES) — migrate ด้านล่างเติมให้เครื่องที่ยังไม่มีคีย์นี้ */
  "PS-2569-0038": [
    {
      side: "ps",
      by: "ธนดล (BD)",
      at: "2026-10-04 11:30",
      tx: "ขอทราบงบโฆษณาต่อเดือน และกลุ่มลูกค้าเป้าหมาย (ช่วงอายุ/ย่านที่อยู่)",
    },
  ],
  "PS-2569-0041": [
    {
      side: "ps",
      by: "ปิยะวัฒน์ (SA)",
      at: "2026-10-02 09:40",
      tx: "ระบบสต๊อกเดิมเป็นโปรแกรมอะไร มี API หรือส่งออกไฟล์ได้ไหม",
    },
    {
      side: "sales",
      by: "ชนัญชิดา ใจดี",
      at: "2026-10-03 13:15",
      tx: "ใช้ Express รุ่นเก่า ส่งออกได้เฉพาะไฟล์ Excel รายวัน",
      files: [{ name: "ตัวอย่างไฟล์ส่งออกสต๊อก.xlsx" }],
    },
  ],
};

const threads = createPersistedStore<Record<string, PsNote[]>>(
  "maz-erp.presales-thread.v1",
  PS_THREAD_SEED,
  (v): v is Record<string, PsNote[]> => typeof v === "object" && v !== null,
  /* คำขอที่เพิ่งเติมคำถามตั้งต้นให้ — เครื่องที่เก็บข้อมูลไว้ก่อนต้องเห็นด้วย ของที่คุยกันไปแล้วห้ามทับ */
  (v) => ({ ...PS_THREAD_SEED, ...v }),
);

export function usePsThreads() {
  return useSyncExternalStore(threads.subscribe, threads.get, threads.getServer);
}

/**
 * สายสนทนาของคำขอหนึ่งใบ เรียงเก่าไปใหม่
 *
 * ใบที่ถาม/ตอบกันไว้ก่อนจะมีสายสนทนา ยังมีแต่ข้อความล่าสุดใน ask/reply
 * จึงประกอบเป็นสายให้ดูก่อน ไม่ปล่อยให้กล่องตอบว่างเปล่าเหมือนเดิม
 */
export function psThreadOf(all: Record<string, PsNote[]>, r: PresalesRequest): PsNote[] {
  const kept = all[r.no];
  if (kept?.length) return kept;
  const out: PsNote[] = [];
  if (r.ask) out.push({ side: "ps", by: r.assignee, at: "", tx: r.ask });
  if (r.reply) out.push({ side: "sales", by: USERS.sales.name, at: "", tx: r.reply });
  return out;
}

/** คำถามล่าสุดที่ยังรอฝ่ายขายตอบ — ไม่มีคำถามค้างคืน undefined */
export function psLastAsk(all: Record<string, PsNote[]>, r: PresalesRequest) {
  const list = psThreadOf(all, r);
  const last = list[list.length - 1];
  return last?.side === "ps" ? last : undefined;
}

/** ทีมก่อนการขายถามข้อมูลเพิ่ม — เรียกคู่กับ askPresalesInfo ใน crm-store */
export function addPsAsk(no: string, tx: string) {
  addPsNote(no, { side: "ps", by: PS_ME.name, at: bkkStamp(), tx });
}

/** ฝ่ายขายตอบข้อมูลเพิ่ม — เรียกคู่กับ replyPresalesInfo ใน crm-store */
export function addPsReply(no: string, tx: string, files?: { name: string; url?: string }[]) {
  addPsNote(no, { side: "sales", by: USERS.sales.name, at: bkkStamp(), tx, ...(files?.length ? { files } : {}) });
}

function addPsNote(no: string, note: PsNote) {
  threads.update((all) => ({ ...all, [no]: [...(all[no] ?? []), note] }));
}
