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
import { hrPos, posFullName, posOf, ROLE_EMPLOYEE, type PosKey } from "./hr-data";
import { currentRole } from "./role";
import { hrSnapshot } from "./hr-store";
import { nameOf } from "./emp-name";
import { createPersistedStore } from "./persisted-store";

/** ชื่อในคิวงานตามต้นแบบ "ปิยะวัฒน์ (SA)" — ชื่อต้นกับตำแหน่งของคนที่ล็อกอิน */
export const PS_ME = {
  name: `${USERS.ps.name.split(" ")[0]} (${USERS.ps.position})`,
  full: USERS.ps.name,
  employeeId: USERS.ps.employeeId,
  kind: (USERS.ps.position === "Business Development" ? "BD" : "SA") as "SA" | "BD",
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
  return `${posFullName(kind)} · ${PS_KIND_LABEL[kind]}`;
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
/* อาร์กิวเมนต์เดียว — ใช้กับ .filter(psMine) ได้ (ตัวที่สองของ filter คือลำดับ ไม่ใช่ตำแหน่ง) */
export function psMine(r: PresalesRequest) {
  const role = currentRole();
  return psMineFor(r, ROLE_EMPLOYEE[role] ?? "", role === "ps" ? psMyPositions() : null);
}

/*
 * คำขอนี้อยู่ในคิวงานของฉันไหม (ผู้ใช้สั่ง 14 ต.ค. 2569 — เลิกส่งตามประเภทงาน กลับไปเลือกตัวคน)
 *   คำขอที่ระบุตัวคน (toEmp) — เห็นเฉพาะคนนั้น จะอยู่บทบาทไหนก็ได้
 *   คำขอเก่า (ไม่มี toEmp) — คงกติกาเดิม เห็นเฉพาะทีมก่อนการขาย (myPos = null คือไม่ใช่ทีมก่อนการขาย)
 */
export function psMineFor(r: PresalesRequest, myEmp: string, myPos: readonly PosKey[] | null) {
  if (r.toEmp) return r.toEmp === myEmp;
  if (!myPos) return false;
  if (r.toPos) return myPos.includes(r.toPos);
  return PS_KINDS.includes(r.kind);
}

/** มีคำขอที่ส่งถึงพนักงานคนนี้ไหม — ใช้เปิดเมนู "คำขอทำข้อเสนอ" ให้คนนอกทีมก่อนการขาย (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function psHasRequestFor(all: readonly PresalesRequest[], empId: string | undefined) {
  return Boolean(empId) && all.some((r) => r.toEmp === empId);
}

/** ข้อความผู้รับคำขอที่เก็บกับคำขอ "ชื่อ (ตำแหน่ง)" (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function empAssignee(e: { name: string; pos: PosKey }) {
  return e.pos ? `${e.name} (${hrPos(e.pos).label})` : e.name;
}

/** ชื่อของคนที่กำลังทำงานในคิว — ทีมก่อนการขายใช้ชื่อเดิม คนอื่นใช้ "ชื่อต้น (ตำแหน่ง)" จากทะเบียน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function psActorName() {
  const role = currentRole();
  if (role === "ps") return PS_ME.name;
  const me = hrSnapshot().emp.find((e) => e.id === ROLE_EMPLOYEE[role]);
  return me ? `${me.name.split(" ")[0]}${me.pos ? ` (${hrPos(me.pos).label})` : ""}` : PS_ME.name;
}

/** ตำแหน่งของคนที่ล็อกอินบทบาททีมก่อนการขาย — ใช้กับคำขอเก่าที่ส่งถึงตำแหน่ง */
export function psMyPositions(): PosKey[] {
  const me = hrSnapshot().emp.find((e) => e.id === ROLE_EMPLOYEE.ps);
  return me ? posOf(me) : [];
}

/** ใครรับผิดชอบคำขอนี้ — ยังไม่มีใครรับก็ต้องบอกให้เห็น ไม่ใช่เว้นว่าง */
export function psOwner(r: PresalesRequest) {
  /* ที่เก็บเป็นชื่อจริง "ชื่อต้น (ตำแหน่ง)" — โชว์เป็นชื่อเล่น (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  const who = nameOf(r.assignee.trim());
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
  addPsNote(no, { side: "ps", by: psActorName(), at: bkkStamp(), tx });
}

/** ฝ่ายขายตอบข้อมูลเพิ่ม — เรียกคู่กับ replyPresalesInfo ใน crm-store */
export function addPsReply(no: string, tx: string, files?: { name: string; url?: string }[]) {
  addPsNote(no, { side: "sales", by: USERS.sales.name, at: bkkStamp(), tx, ...(files?.length ? { files } : {}) });
}

function addPsNote(no: string, note: PsNote) {
  threads.update((all) => ({ ...all, [no]: [...(all[no] ?? []), note] }));
}

/*
 * ประเภทงาน → ตำแหน่งที่เกี่ยวข้อง — ช่อง "ส่งให้" ในหน้าส่งโจทย์ใหม่แสดงเฉพาะคนในตำแหน่งเหล่านี้ (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * หนึ่งประเภทมีได้หลายตำแหน่ง · SA และ BD (ทีมก่อนการขาย) ช่วยงานเทคนิคได้ทุกประเภท จึงรวมให้ทุกประเภทเสมอ
 * ประเภทที่ผู้ดูแลระบบเพิ่มเองและไม่อยู่ในตารางนี้ — ได้เฉพาะ SA/BD
 */
export const SERVICE_POS: Record<string, readonly PosKey[]> = {
  bplan: ["bd"],
  branding: ["graphic"],
  seo: ["website"],
  franchise: ["bd"],
  complan: ["content"],
  dm: ["media"],
  dataviz: ["sa"],
  website: ["website"],
};
export const PS_HELPER_POS: readonly PosKey[] = ["sa", "bd"];

/** ตำแหน่งที่รับคำขอประเภทนี้ได้ (รวม SA/BD) */
export function servicePositions(service: string): PosKey[] {
  return [...new Set([...(SERVICE_POS[service] ?? []), ...PS_HELPER_POS])];
}

/** คนนี้รับคำขอประเภทนี้ได้ไหม — นับตำแหน่งควบด้วย */
export function canTakeService(e: { pos: PosKey; posMore?: PosKey[] }, service: string) {
  const want = servicePositions(service);
  return posOf(e).some((p) => want.includes(p));
}
