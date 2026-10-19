"use client";

/*
 * กระดาน "แผนติดตาม" ของพนักงานขาย (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * คอลัมน์อิสระที่พนักงานตั้งเอง ไม่ผูกกับขั้นการขาย ไม่เปิดงานจริง ไม่นับในรายงาน
 * เก็บแยกตามรหัสพนักงานที่ล็อกอิน · ตำแหน่งการ์ดและประวัติการย้ายเก็บตามรหัสผู้สนใจ
 * TODO: ย้ายไปตารางของพนักงานเมื่อต่อ backend
 */

import { useSyncExternalStore } from "react";
import { bkkOf, bkkStamp, daysBetween, pad2, toIsoDate } from "./format";
import { createPersistedStore } from "./persisted-store";

/** คอลัมน์ตั้งต้น — ลบไม่ได้ การ์ดที่ยังไม่ได้วางอยู่ที่นี่ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export const UNSORTED = "unsorted";
export const UNSORTED_NAME = "ยังไม่จัด";

/** อยู่คอลัมน์เดิมนานเท่านี้ขึ้นไป = ขึ้นป้ายค้าง (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export const FOLLOWUP_STALE_DAYS = 14;

/* สีจากชุดป้ายสถานะที่แอปใช้อยู่แล้ว 6 สี (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export const COL_COLORS: { cls: string; label: string }[] = [
  { cls: "t-miss", label: "เทา" },
  { cls: "t-info", label: "ฟ้า" },
  { cls: "t-job", label: "ม่วง" },
  { cls: "t-early", label: "ส้ม" },
  { cls: "t-late", label: "แดง" },
  { cls: "t-ok", label: "เขียว" },
];

export type FCol = { id: string; name: string; cls: string };

/** การย้ายหนึ่งครั้ง — เก็บชื่อคอลัมน์ ณ ตอนย้าย ลบ/เปลี่ยนชื่อทีหลังประวัติยังอ่านรู้เรื่อง · at = "yyyy-mm-dd HH:mm" */
export type FMove = { from: string; to: string; at: string; by: string };

export type UserBoard = {
  /** คอลัมน์ที่พนักงานเพิ่ม (ไม่รวมยังไม่จัด ซึ่งอยู่หน้าสุดเสมอ) */
  cols: FCol[];
  /** รหัสผู้สนใจ → คอลัมน์ · ไม่มี = ยังไม่จัด */
  place: Record<string, string>;
  /** วันที่การ์ดโผล่ในยังไม่จัดครั้งแรก — ใช้นับวันเมื่อยังไม่เคยย้าย */
  seen: Record<string, string>;
  history: Record<string, FMove[]>;
};

type AllBoards = Record<string, UserBoard>;

const EMPTY: UserBoard = { cols: [], place: {}, seen: {}, history: {} };

function isAll(v: unknown): v is AllBoards {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((b) => {
    const u = b as Partial<UserBoard> | null;
    return Boolean(u) && Array.isArray(u!.cols) && typeof u!.place === "object";
  });
}

const store = createPersistedStore<AllBoards>("maz-erp.followup-board.v1", {}, isAll, (all) => {
  const out: AllBoards = {};
  for (const [k, u] of Object.entries(all)) out[k] = { ...EMPTY, ...u, seen: u.seen ?? {}, history: u.history ?? {} };
  return out;
});

const SERVER: AllBoards = {};

export function useBoard(user: string): UserBoard {
  const all = useSyncExternalStore(store.subscribe, store.get, () => SERVER);
  return all[user] ?? EMPTY;
}

function edit(user: string, fn: (u: UserBoard) => UserBoard) {
  store.update((all) => ({ ...all, [user]: fn(all[user] ?? EMPTY) }));
}

const newId = () => `fc${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const nameOf = (u: UserBoard, id: string) =>
  id === UNSORTED ? UNSORTED_NAME : (u.cols.find((c) => c.id === id)?.name ?? UNSORTED_NAME);

/** คอลัมน์ที่การ์ดอยู่จริง — คอลัมน์ที่ถูกลบไปแล้ว = ยังไม่จัด */
export function colOf(u: UserBoard, code: string): string {
  const id = u.place[code];
  return id && u.cols.some((c) => c.id === id) ? id : UNSORTED;
}

export function addCol(user: string, c: Omit<FCol, "id">) {
  edit(user, (u) => ({ ...u, cols: [...u.cols, { ...c, id: newId() }] }));
}

export function updateCol(user: string, id: string, patch: Partial<Omit<FCol, "id">>) {
  edit(user, (u) => ({ ...u, cols: u.cols.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
}

export function shiftCol(user: string, id: string, dir: -1 | 1) {
  edit(user, (u) => {
    const i = u.cols.findIndex((c) => c.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= u.cols.length) return u;
    const cols = [...u.cols];
    [cols[i], cols[j]] = [cols[j], cols[i]];
    return { ...u, cols };
  });
}

/** ลบคอลัมน์ — การ์ดในคอลัมน์กลับไปยังไม่จัด และบันทึกเป็นการย้ายหนึ่งครั้ง (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function removeCol(user: string, id: string, by: string) {
  edit(user, (u) => {
    const name = nameOf(u, id);
    const at = bkkStamp();
    const place = { ...u.place };
    const history = { ...u.history };
    for (const [code, col] of Object.entries(u.place)) {
      if (col !== id) continue;
      delete place[code];
      history[code] = [...(history[code] ?? []), { from: name, to: UNSORTED_NAME, at, by }];
    }
    return { ...u, cols: u.cols.filter((c) => c.id !== id), place, history };
  });
}

/** ย้ายการ์ด — ต่อท้ายประวัติทุกครั้ง (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function moveCard(user: string, code: string, to: string, by: string) {
  edit(user, (u) => {
    const from = colOf(u, code);
    if (from === to) return u;
    const place = { ...u.place };
    if (to === UNSORTED) delete place[code];
    else place[code] = to;
    const entry: FMove = { from: nameOf(u, from), to: nameOf(u, to), at: bkkStamp(), by };
    return { ...u, place, history: { ...u.history, [code]: [...(u.history[code] ?? []), entry] } };
  });
}

/** จดวันที่การ์ดโผล่ครั้งแรก — แตะสโตร์เฉพาะเมื่อมีการ์ดใหม่ กันวนเรนเดอร์ */
export function markSeen(user: string, codes: string[]) {
  const u = store.get()[user] ?? EMPTY;
  const fresh = codes.filter((c) => !u.seen[c] && !u.history[c]?.length);
  if (!fresh.length) return;
  const at = bkkStamp();
  edit(user, (x) => ({ ...x, seen: { ...x.seen, ...Object.fromEntries(fresh.map((c) => [c, at])) } }));
}

/**
 * วันที่ผู้สนใจเข้าระบบ เป็น "yyyy-mm-dd HH:mm" หรือ "yyyy-mm-dd" (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * ใช้วันที่สร้างก่อน · ข้อมูลเดิมไม่มี = วันติดต่อครั้งแรก · ไม่มีทั้งคู่ = ว่าง
 */
export function entryStampOf(createdAt?: string, firstContact?: string): string {
  if (createdAt) {
    if (!createdAt.includes("T")) return createdAt.slice(0, 16);
    const d = new Date(createdAt);
    if (!Number.isNaN(d.getTime())) {
      const b = bkkOf(d);
      return `${toIsoDate(b)} ${pad2(b.getHours())}:${pad2(b.getMinutes())}`;
    }
  }
  return firstContact ?? "";
}

/**
 * เวลาที่การ์ดเข้าคอลัมน์ปัจจุบัน — การย้ายล่าสุด
 * ยังไม่เคยย้าย = วันที่เข้าระบบ แล้วค่อยวันที่โผล่ในยังไม่จัด (ผู้ใช้สั่ง 14 ต.ค. 2569)
 */
export function enteredAt(u: UserBoard, code: string, entry = ""): string {
  return u.history[code]?.at(-1)?.at ?? (entry || u.seen[code] || "");
}

/** ทุกกระดานในเครื่องนี้ ใช้รวมประวัติจากพนักงานทุกคน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function useAllBoards(): Record<string, UserBoard> {
  return useSyncExternalStore(store.subscribe, store.get, () => SERVER);
}

export const DELETED_COL = "(คอลัมน์ที่ลบแล้ว)";

/** ชื่อคอลัมน์ในประวัติ — ปกติเก็บชื่อไว้แล้ว ถ้าเป็นรหัสคอลัมน์ให้แปลงจากคอลัมน์ปัจจุบันของเจ้าของกระดาน */
function colName(u: UserBoard, v: string): string {
  if (v === UNSORTED) return UNSORTED_NAME;
  if (!/^fc[0-9a-z]{6,}$/.test(v)) return v;
  return u.cols.find((c) => c.id === v)?.name ?? DELETED_COL;
}

export type TrailStep = { name: string; start: string; end: string; by: string; days: number };

/**
 * เส้นทางผ่านคอลัมน์ของผู้สนใจหนึ่งราย รวมจากกระดานของทุกคนเรียงตามเวลา (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * codes = รหัสปัจจุบัน + รหัสผู้สนใจเดิม · ช่วงแรกเริ่มจากวันที่เข้าระบบ · ช่วงสุดท้ายถึง end
 * ไม่มีใครเคยย้าย = คืนค่าว่าง
 */
export function followupTrail(all: Record<string, UserBoard>, codes: string[], entry: string, end: string): TrailStep[] {
  const moves: { from: string; to: string; at: string; by: string }[] = [];
  let seen = "";
  for (const u of Object.values(all)) {
    for (const code of codes) {
      for (const m of u.history?.[code] ?? []) moves.push({ ...m, from: colName(u, m.from), to: colName(u, m.to) });
      const s = u.seen?.[code];
      if (s && (!seen || s < seen)) seen = s;
    }
  }
  if (!moves.length) return [];
  moves.sort((a, b) => a.at.localeCompare(b.at));
  const span = (a: string, b: string) => (a && b ? Math.max(0, daysBetween(a.slice(0, 10), b.slice(0, 10))) : 0);
  const first = entry || seen;
  const steps: TrailStep[] = [{ name: moves[0].from, start: first, end: moves[0].at, by: "", days: span(first, moves[0].at) }];
  moves.forEach((m, i) => {
    const stop = moves[i + 1]?.at ?? end;
    steps.push({ name: m.to, start: m.at, end: stop, by: m.by, days: span(m.at, stop) });
  });
  return steps;
}
