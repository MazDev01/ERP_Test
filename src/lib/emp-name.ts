"use client";

/*
 * ชื่อที่โชว์ของพนักงาน = ชื่อเล่น (ผู้ใช้สั่ง 19 ต.ค. 2569 ตามที่พนักงานขอ)
 *
 * รายการ ตาราง การ์ด ชิป ตัวเลือก ปฏิทิน แจ้งเตือน แชต ผู้รับผิดชอบงาน ฯลฯ โชว์ชื่อเล่น
 * ชื่อจริงเต็มยังอยู่เฉพาะตอนเปิดดูรายละเอียดของคนนั้น และบนเอกสารทางการ
 * (สลิป ใบสรุปเงินเดือน หนังสือรับรองหัก ณ ที่จ่าย สัญญา ใบเสนอราคา/ใบแจ้งหนี้/ใบเสร็จ)
 *
 * ข้อมูลที่เก็บชื่อเป็นข้อความ (by, takenBy, seller, owner ...) ไม่แก้ของที่เก็บไว้
 * ตอนโชว์ค้นจากทะเบียนแล้วแปลงเป็นชื่อเล่น · หาไม่เจอโชว์ข้อความเดิม
 */

import { useMemo } from "react";
import { HR_EMP, withFullPos, type Employee } from "./hr-data";
import { hrSnapshot, useHr } from "./hr-store";

type Named = { name: string; nick?: string };

/** ชื่อที่โชว์ — ชื่อเล่นถ้ามี ไม่มีใช้ชื่อเต็ม */
export function displayName(e: Named | null | undefined): string {
  if (!e) return "";
  return e.nick?.trim() || e.name;
}

/** ข้อความสำหรับช่องค้นหา — ค้นได้ทั้งชื่อเล่นและชื่อเต็ม */
export function nameHay(e: Named | null | undefined): string {
  if (!e) return "";
  return `${e.name} ${e.nick ?? ""}`;
}

/** ตัวอักษรย่อบนอวาตาร์ — มาจากชื่อที่โชว์ (ข้ามสระหน้า เ แ โ ใ ไ ให้ได้พยัญชนะตัวแรก) */
export function initialOf(e: Named | string | null | undefined): string {
  const s = (typeof e === "string" ? e : displayName(e)).trim();
  const chars = Array.from(s.replace(/^[เแโใไ]+/, ""));
  return chars[0] ?? Array.from(s)[0] ?? "";
}

type Lookup = (key: string | null | undefined) => string;

function makeLookup(list: Employee[]): Lookup {
  const byId = new Map<string, Employee>();
  const byName = new Map<string, Employee>();
  const byFirst = new Map<string, Employee | null>();
  for (const e of list) {
    byId.set(e.id, e);
    const full = e.name.trim();
    if (full) byName.set(full, e);
    const first = full.split(/\s+/)[0];
    /* ชื่อต้นซ้ำกันสองคน = ระบุตัวไม่ได้ จึงไม่แปลง */
    if (first) byFirst.set(first, byFirst.has(first) ? null : e);
  }
  const find = (s: string) => byId.get(s) ?? byName.get(s) ?? byFirst.get(s) ?? undefined;
  return (key) => {
    if (!key) return key ?? "";
    const s = key.trim();
    const hit = find(s);
    if (hit) return displayName(hit);
    /* ข้อมูลเก่าเก็บเป็น "ชื่อ (ตำแหน่ง)" เช่น "ปิยะวัฒน์ (SA)" — แปลงเฉพาะส่วนชื่อ คงวงเล็บไว้ */
    const m = /^(.+?)\s*(\(.+\))$/.exec(s);
    if (m) {
      const inner = find(m[1].trim());
      /* ตำแหน่งย่อในวงเล็บโชว์เป็นชื่อเต็ม (ผู้ใช้สั่ง 29 ต.ค. 2569) */
      if (inner) return `${displayName(inner)} ${withFullPos(m[2])}`;
    }
    return withFullPos(key);
  };
}

let cacheList: Employee[] | null = null;
let cacheFn: Lookup | null = null;

function lookupOf(list: Employee[]): Lookup {
  if (list !== cacheList || !cacheFn) {
    cacheList = list;
    cacheFn = makeLookup(list);
  }
  return cacheFn;
}

/**
 * แปลงรหัสพนักงาน หรือชื่อที่เก็บเป็นข้อความ เป็นชื่อที่โชว์ — ใช้นอก React (lib, ตัวสร้างแจ้งเตือน)
 * ในคอมโพเนนต์ใช้ useNameOf() เพื่อให้เปลี่ยนตามทะเบียนทันที
 */
export function nameOf(key: string | null | undefined): string {
  const list = typeof window === "undefined" ? HR_EMP : hrSnapshot().emp;
  return lookupOf(list)(key);
}

/** ฮุกคืนฟังก์ชันแปลงรหัส/ชื่อเต็ม → ชื่อที่โชว์ อ่านจากทะเบียนฝ่ายบุคคลชุดปัจจุบัน */
export function useNameOf(): Lookup {
  const hr = useHr();
  return useMemo(() => lookupOf(hr.emp), [hr.emp]);
}
