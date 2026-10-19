"use client";

/*
 * ตัวเลือกการเรียงของหน้าผู้สนใจ เก็บแยกตามพนักงาน (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * เอาคอลัมน์ย่อยใต้ขั้นหลักของ Pipeline ออกแล้ว — ข้อมูลคอลัมน์ย่อยเดิมถูกทิ้งตอนอ่าน เหลือแค่การเรียง (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * คงคีย์เดิมไว้ ตัวเลือกการเรียงที่พนักงานตั้งไว้แล้วจะได้ไม่หาย
 * TODO: ย้ายไปตารางของพนักงานเมื่อต่อ backend
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";

export type SortDir = "new" | "old";

export type UserPipe = { sort: SortDir };

type AllPipes = Record<string, UserPipe>;

const EMPTY: UserPipe = { sort: "new" };

/* รับทั้งรูปแบบเก่า (มี cols/place/pending) และใหม่ — ขอแค่เป็นอ็อบเจ็กต์ต่อพนักงาน */
function isAll(v: unknown): v is AllPipes {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((p) => typeof p === "object" && p !== null);
}

/* ย้ายข้อมูล: ทิ้งคอลัมน์ย่อย/ตำแหน่งการ์ด/ที่หมายที่รอ เก็บเฉพาะการเรียง (ผู้ใช้สั่ง 14 ต.ค. 2569) */
const store = createPersistedStore<AllPipes>("maz-erp.pipeline-cols.v1", {}, isAll, (all) => {
  const out: AllPipes = {};
  for (const [k, u] of Object.entries(all)) out[k] = { sort: (u as Partial<UserPipe>).sort === "old" ? "old" : "new" };
  return out;
});

const SERVER: AllPipes = {};

export function usePipePrefs(user: string): UserPipe {
  const all = useSyncExternalStore(store.subscribe, store.get, () => SERVER);
  return all[user] ?? EMPTY;
}

export function setSort(user: string, sort: SortDir) {
  store.update((all) => ({ ...all, [user]: { ...(all[user] ?? EMPTY), sort } }));
}

/**
 * ค่าที่ใช้เรียง "ล่าสุด → เก่าสุด" (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * ผู้สนใจไม่มีวันที่สร้างในข้อมูล — ใช้วันติดต่อครั้งแรกแทน (เพิ่มผู้สนใจต้องกรอกการติดต่อครั้งแรกเสมอ)
 * ไม่มีบันทึกการติดต่อเลย = ใช้เดือนจากรหัส (…-6909-… = ก.ย. 2569) แล้วตัดสินด้วยลำดับรหัส
 */
export function createdKey(code: string, leadCode: string | undefined, firstContact: string, createdAt?: string): string {
  /* ผู้สนใจที่เพิ่มหลัง 14 ต.ค. 2569 มีวันที่สร้างจริง — ใช้ก่อน */
  if (createdAt) return createdAt;
  if (firstContact) return firstContact;
  const m = /-(\d{2})(\d{2})-/.exec(leadCode ?? code);
  if (!m) return "";
  return `${Number(m[1]) + 2500 - 543}-${m[2]}-01`;
}
