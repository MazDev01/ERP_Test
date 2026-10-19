"use client";

/*
 * แม่แบบ Proposal (กรอบ Proposal ของ CEO) (ผู้ใช้สั่ง 14 ต.ค. 2569)
 *
 * ผู้ดูแล/CEO อัปโหลดที่ตั้งค่าระบบ › งานขาย › แม่แบบ Proposal
 * ฝ่ายขายเปิด/ดาวน์โหลดจากการ์ด "ไฟล์ Proposal และเอกสาร" ในหน้าผู้สนใจ
 * ยังไม่มีที่เก็บไฟล์จริง — ไฟล์เก็บแค่ชื่อและขนาด · ลิงก์เปิดได้จริง
 */

import { useSyncExternalStore } from "react";
import { bkkStamp } from "./format";
import { createPersistedStore } from "./persisted-store";

export type ProposalTemplate = {
  id: string;
  name: string;
  /** คำอธิบาย (ไม่บังคับ) */
  desc: string;
  /** ชื่อไฟล์ หรือ URL ถ้าเป็นลิงก์ */
  file: string;
  size?: number;
  url?: string;
  by: string;
  /** "yyyy-mm-dd HH:mm" แก้ล่าสุด */
  at: string;
};

const SEED: ProposalTemplate[] = [
  {
    id: "ptpl-01",
    name: "Proposal Framework (CEO)",
    desc: "กรอบ Proposal หลักของบริษัท ใช้เป็นโครงทุกครั้งก่อนทำข้อเสนอให้ลูกค้า",
    file: "Proposal Framework (CEO).pdf",
    size: 1_240_000,
    by: "ผู้บริหาร",
    at: "2026-10-01 09:00",
  },
  {
    id: "ptpl-02",
    name: "Proposal Framework (CEO) — ฉบับแก้ไขได้",
    desc: "ฉบับ Google Slides คัดลอกไปแก้ต่อได้",
    file: "https://docs.google.com/presentation/d/proposal-framework-ceo",
    url: "https://docs.google.com/presentation/d/proposal-framework-ceo",
    by: "ผู้บริหาร",
    at: "2026-10-01 09:05",
  },
];

function isTemplates(v: unknown): v is ProposalTemplate[] {
  return Array.isArray(v) && v.every((t) => typeof t === "object" && t !== null && typeof t.id === "string");
}

const store = createPersistedStore<ProposalTemplate[]>("maz-erp.proposal-templates.v1", SEED, isTemplates);

export function useProposalTemplates() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export type ProposalTemplateInput = Pick<ProposalTemplate, "name" | "desc" | "file" | "size" | "url">;

export function addProposalTemplate(input: ProposalTemplateInput, by: string) {
  const t: ProposalTemplate = { ...input, id: `ptpl-${Date.now().toString(36)}`, by, at: bkkStamp() };
  store.update((list) => [t, ...list]);
}

/** แก้ไข/แทนไฟล์ — คนแก้ล่าสุดเป็นผู้ลงชื่อ */
export function updateProposalTemplate(id: string, input: ProposalTemplateInput, by: string) {
  store.update((list) => list.map((t) => (t.id === id ? { ...t, ...input, by, at: bkkStamp() } : t)));
}

export function removeProposalTemplate(id: string) {
  store.update((list) => list.filter((t) => t.id !== id));
}
