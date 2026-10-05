"use client";

/*
 * สโตร์ที่แยกข้อมูลตามบทบาท
 *
 * งานส่วนตัวในกลุ่ม "ของฉัน" (ตอกบัตร ใบลา โอที ใบเบิก) เป็นของ "คน" ไม่ใช่ของระบบ
 * และในระบบนี้หนึ่งบทบาทคือหนึ่งคน (ดู mock-data.ts) สลับบทบาทจึงต้องได้ข้อมูลของคนนั้น
 * ไม่ใช่ใบลาของคนก่อนหน้าค้างอยู่
 *
 * เก็บลง localStorage เป็นก้อนเดียว { sales: [...], pm: [...], acc: [...] }
 * แล้วหั่นเฉพาะส่วนของบทบาทปัจจุบันตอนอ่าน — ข้อมูลของบทบาทอื่นไม่หายไปไหน
 *
 * TODO: เมื่อต่อ backend ให้แทนด้วยการกรองด้วย employee_id ของผู้ล็อกอินแทน
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { currentRole, subscribeRole, ROLES, type Role } from "./role";

export type ByRole<T> = Record<Role, T>;

export function createRoleStore<T>(
  key: string,
  seed: ByRole<T>,
  /** ตรวจว่าส่วนของบทบาทหนึ่งยังใช้ได้ กันข้อมูลเก่าคนละรูปแบบ */
  isSlice: (value: unknown) => value is T,
  /** ปรับข้อมูลเก่าของแต่ละบทบาทให้ทันรูปแบบล่าสุด */
  fixSlice?: (value: T) => T,
) {
  /* บทบาทที่เพิ่มทีหลัง (เช่น ceo, gm) ยังไม่มีส่วนของตัวเองในข้อมูลที่เก็บไว้ก่อน
     จึงตรวจเฉพาะส่วนที่มีอยู่ แล้วค่อยเติมส่วนที่ขาดจากชุดตั้งต้น — ไม่งั้นข้อมูลเดิมทั้งก้อนถูกทิ้ง */
  function isByRole(value: unknown): value is ByRole<T> {
    if (typeof value !== "object" || value === null) return false;
    const all = value as Record<string, unknown>;
    const have = ROLES.filter((r) => r.key in all);
    return have.length > 0 && have.every((r) => isSlice(all[r.key]));
  }

  function fill(all: ByRole<T>): ByRole<T> {
    const out = { ...all };
    for (const r of ROLES) {
      if (!(r.key in out)) out[r.key] = seed[r.key];
      if (fixSlice) out[r.key] = fixSlice(out[r.key]);
    }
    return out;
  }

  const store = createPersistedStore<ByRole<T>>(key, seed, isByRole, fill);

  const get = () => store.get()[currentRole()];
  const getServer = () => store.getServer().sales;

  /* ข้อมูลเปลี่ยนได้สองทาง — แก้ข้อมูลเอง หรือสลับบทบาท จึงต้องฟังทั้งคู่ */
  function subscribe(onChange: () => void) {
    const off = [store.subscribe(onChange), subscribeRole(onChange)];
    return () => off.forEach((fn) => fn());
  }

  return {
    /** ข้อมูลของบทบาทที่ล็อกอินอยู่ */
    use: () => useSyncExternalStore(subscribe, get, getServer),
    /**
     * ข้อมูลของทุกบทบาท — ใช้เฉพาะหน้าอนุมัติ ที่หัวหน้าต้องเห็นคำขอของลูกน้อง
     * หน้าอื่นห้ามใช้ ไม่งั้นพนักงานจะเห็นใบลาของคนอื่นไปด้วย
     */
    useAll: () => useSyncExternalStore(store.subscribe, store.get, store.getServer),
    /** อ่านนอก React */
    current: get,
    /** ทุกบทบาทนอก React — ใช้หาเลขที่เอกสารถัดไป ที่ต้องไม่ซ้ำทั้งบริษัท */
    all: (): T[] => ROLES.map((r) => store.get()[r.key]).filter((v) => v !== undefined),
    /** อ่านส่วนของบทบาทที่ระบุนอก React — ใช้หาใบที่หัวหน้ากำลังอนุมัติ */
    ofRole: (role: Role) => store.get()[role],
    /** แก้เฉพาะส่วนของบทบาทที่ล็อกอินอยู่ */
    update(fn: (slice: T) => T) {
      const role = currentRole();
      store.update((all) => ({ ...all, [role]: fn(all[role]) }));
    },
    /** แก้ส่วนของบทบาทที่ระบุ — สำหรับหัวหน้าที่อนุมัติคำขอของลูกน้อง */
    updateRole(role: Role, fn: (slice: T) => T) {
      store.update((all) => ({ ...all, [role]: fn(all[role]) }));
    },
    reset: store.reset,
  };
}
