/*
 * การ์ดไหนบนแดชบอร์ดที่เปิดดูอยู่ — จำไว้ในเครื่องของแต่ละคน
 * TODO: ย้ายไปตาราง user_preference เมื่อต่อ backend
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";

export const DASH_CARDS = [
  { key: "chart", label: "แนวโน้มมูลค่าที่ปิดได้" },
  { key: "breakdown", label: "สัดส่วนผู้สนใจ" },
  { key: "agenda", label: "ปฏิทินนัดหมาย" },
  { key: "compare", label: "ใบเสนอราคา เทียบ ปิดได้" },
  { key: "rank", label: "ลูกค้าที่ปิดได้สูงสุด" },
] as const;

export type DashCardKey = (typeof DASH_CARDS)[number]["key"];

export type DashCards = Record<string, boolean>;

const ALL_ON: DashCards = Object.fromEntries(DASH_CARDS.map((c) => [c.key, true]));

function isCards(value: unknown): value is DashCards {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const store = createPersistedStore<DashCards>("maz-erp.dashboard-cards.v1", ALL_ON, isCards);

export function useDashCards() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

/** การ์ดที่เพิ่มมาทีหลังถือว่าเปิดไว้ก่อน คนเก่าจะได้เห็นของใหม่ด้วย */
export function cardOn(cards: DashCards, key: DashCardKey) {
  return cards[key] ?? true;
}

export function toggleCard(key: DashCardKey) {
  store.update((c) => ({ ...c, [key]: !cardOn(c, key) }));
}

export function resetDashCards() {
  store.reset();
}
