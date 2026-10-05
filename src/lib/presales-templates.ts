"use client";

/*
 * คลังเทมเพลตของทีมก่อนการขาย (บทบาท ps) — หน้า /presales-templates
 *
 * เก็บเทมเพลตข้อเสนอที่ใช้ซ้ำบ่อย แยกตามประเภทบริการชุดเดียวกับใบเสนอราคา (services() ใน pm-data)
 * ชนิดของเทมเพลตมีสามแบบ — ไฟล์ PDF · ลิงก์ Canva · ลิงก์อื่น ๆ
 * ยังไม่มีที่เก็บไฟล์จริง ไฟล์จึงเก็บแค่ชื่อกับขนาด (เหมือนกล่องแนบไฟล์ file-drop.tsx)
 * เลือกเทมเพลตไปแนบในหน้าส่งงาน (presales-work) แล้วนับจำนวนครั้งที่ใช้ให้
 */

import { useSyncExternalStore } from "react";
import { todayIso } from "./format";
import { createPersistedStore } from "./persisted-store";

export type TemplateKind = "pdf" | "canva" | "link";

export type PresalesTemplate = {
  id: string;
  name: string;
  /** รหัสประเภทบริการ — ServiceKey ของ pm-data */
  service: string;
  kind: TemplateKind;
  /** ชื่อไฟล์ (ชนิด pdf) หรือที่อยู่ลิงก์ (canva/link) */
  file: string;
  url?: string;
  /** ขนาดไฟล์เป็นไบต์ — ลิงก์ไม่มี */
  size?: number;
  note: string;
  uploadedBy: string;
  /** วันที่แก้ล่าสุด YYYY-MM-DD */
  updatedAt: string;
  /** แนบไปกับข้อเสนอแล้วกี่ครั้ง */
  uses: number;
};

const SEED: PresalesTemplate[] = [
  {
    id: "tpl-01",
    name: "โครงข้อเสนอแผนธุรกิจ SME ฉบับมาตรฐาน",
    service: "bplan",
    kind: "pdf",
    file: "BusinessPlan_Proposal_SME_v3.pdf",
    size: 2_480_000,
    note: "มีหน้าวิเคราะห์ตลาดและประมาณการรายได้ 3 ปี แก้ตัวเลขตามลูกค้าได้เลย",
    uploadedBy: "ปิยะวัฒน์ (SA)",
    updatedAt: "2026-09-12",
    uses: 14,
  },
  {
    id: "tpl-02",
    name: "Brand Identity Deck — ร้านอาหารและคาเฟ่",
    service: "branding",
    kind: "canva",
    file: "https://www.canva.com/design/DAF-brand-cafe/view",
    url: "https://www.canva.com/design/DAF-brand-cafe/view",
    note: "ใช้กับลูกค้าสายอาหาร มีหน้าตัวอย่างโลโก้ สี และมู้ดบอร์ด",
    uploadedBy: "ปิยะวัฒน์ (SA)",
    updatedAt: "2026-09-18",
    uses: 9,
  },
  {
    id: "tpl-03",
    name: "ข้อเสนอ SEO รายเดือน 6 เดือน",
    service: "seo",
    kind: "pdf",
    file: "SEO_6Months_Proposal.pdf",
    size: 1_320_000,
    note: "แพ็กเกจ 3 ระดับ ระบุจำนวนคีย์เวิร์ดและบทความต่อเดือน",
    uploadedBy: "ธนดล (BD)",
    updatedAt: "2026-08-29",
    uses: 6,
  },
  {
    id: "tpl-04",
    name: "แผนขยายแฟรนไชส์ ระยะที่ 1",
    service: "franchise",
    kind: "canva",
    file: "https://www.canva.com/design/DAF-franchise-p1/view",
    url: "https://www.canva.com/design/DAF-franchise-p1/view",
    note: "มีหน้าคู่มือแฟรนไชส์และโครงสร้างค่าธรรมเนียม",
    uploadedBy: "ปิยะวัฒน์ (SA)",
    updatedAt: "2026-09-05",
    uses: 3,
  },
  {
    id: "tpl-05",
    name: "Digital Marketing Plan — Facebook และ TikTok Ads",
    service: "dm",
    kind: "link",
    file: "https://docs.google.com/presentation/d/dm-ads-plan",
    url: "https://docs.google.com/presentation/d/dm-ads-plan",
    note: "Google Slides แก้ร่วมกันได้ ตารางงบโฆษณาอยู่หน้าท้าย",
    uploadedBy: "ธนดล (BD)",
    updatedAt: "2026-09-20",
    uses: 11,
  },
  {
    id: "tpl-06",
    name: "ข้อเสนอเว็บไซต์องค์กร พร้อมผังหน้าเว็บ",
    service: "website",
    kind: "pdf",
    file: "Website_Corporate_Sitemap.pdf",
    size: 3_150_000,
    note: "ผังหน้าเว็บ 8 หน้า และระยะเวลาทำงาน 45 วัน",
    uploadedBy: "ปิยะวัฒน์ (SA)",
    updatedAt: "2026-09-01",
    uses: 5,
  },
];

function isTemplates(v: unknown): v is PresalesTemplate[] {
  return Array.isArray(v) && v.every((t) => typeof t === "object" && t !== null && typeof t.id === "string");
}

const store = createPersistedStore<PresalesTemplate[]>("maz-erp.presales-templates.v1", SEED, isTemplates);

export function useTemplates() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function resetTemplates() {
  store.reset();
}

/** ลิงก์ Canva ขึ้นป้าย Canva · ลิงก์อื่นขึ้นป้ายลิงก์ */
export function linkKind(url: string): TemplateKind {
  return /canva\.(com|link)/i.test(url) ? "canva" : "link";
}

export type TemplateInput = Pick<PresalesTemplate, "name" | "service" | "kind" | "file" | "url" | "size" | "note">;

export function addTemplate(input: TemplateInput, by: string) {
  const t: PresalesTemplate = {
    ...input,
    id: `tpl-${Date.now().toString(36)}`,
    uploadedBy: by,
    updatedAt: todayIso(),
    uses: 0,
  };
  store.update((list) => [t, ...list]);
}

export function updateTemplate(id: string, input: TemplateInput) {
  store.update((list) => list.map((t) => (t.id === id ? { ...t, ...input, updatedAt: todayIso() } : t)));
}

export function removeTemplate(id: string) {
  store.update((list) => list.filter((t) => t.id !== id));
}

/** นับว่าเทมเพลตถูกแนบไปกับข้อเสนอ — เรียกตอนส่งงานจริง */
export function countTemplateUse(ids: string[]) {
  if (!ids.length) return;
  store.update((list) => list.map((t) => (ids.includes(t.id) ? { ...t, uses: t.uses + ids.filter((x) => x === t.id).length } : t)));
}
