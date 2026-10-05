"use client";

/*
 * แถบเมนูล่างบนมือถือ — แต่ละคนเลือกเองว่าจะเอาหน้าไหนไว้ช่องไหน (เจ้าของสั่ง 25 ก.ย. 2569)
 *
 * เก็บแยกตามบทบาท เพราะคนหนึ่งสวมได้หลายบทบาทและแต่ละบทบาทมีหน้าคนละชุด
 * เป็นค่าของเครื่อง ไม่ใช่ค่าตั้งค่าระบบ จึงไม่ต้องลงประวัติที่ /admin/log
 *
 * ช่องกลาง (ปุ่มกลมนูน) ตรึงไว้ที่หน้าลงเวลาเสมอ — ทุกคนตอกบัตรทุกวัน
 * จึงเก็บเฉพาะสี่ช่องข้าง: ซ้ายสอง ขวาสอง
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { mobileHomeOf, type NavItem } from "./nav";
import { type Role } from "./role";

/** จำนวนช่องที่เลือกได้ — ไม่รวมปุ่มกลาง */
export const BOTNAV_SLOTS = 4;

/** ช่องที่ยังไม่ได้เลือกอะไร — ปล่อยว่างได้ ไม่บังคับให้ครบสี่ */
export const BOTNAV_EMPTY = "";

type Prefs = Partial<Record<Role, string[]>>;

function isPrefs(value: unknown): value is Prefs {
  if (typeof value !== "object" || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(
    (v) => Array.isArray(v) && v.every((x) => typeof x === "string"),
  );
}

const store = createPersistedStore<Prefs>("maz-erp.botnav.v1", {}, isPrefs);

export function useBotnavPrefs() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

/** ช่องที่บทบาทนี้ตั้งไว้ — ยังไม่เคยตั้งคืน null ให้ผู้เรียกใช้ค่าตั้งต้นของตัวเอง */
export function botnavOf(prefs: Prefs, role: Role): string[] | null {
  const saved = prefs[role];
  return saved && saved.length === BOTNAV_SLOTS ? saved : null;
}

export function setBotnav(role: Role, slots: string[]) {
  store.update((p) => ({ ...p, [role]: slots.slice(0, BOTNAV_SLOTS) }));
}

/** คืนค่าเป็นค่าตั้งต้นของบทบาทนั้น */
export function resetBotnav(role: Role) {
  store.update((p) => {
    const next = { ...p };
    delete next[role];
    return next;
  });
}

/** หน้าหลักกับโปรไฟล์ไม่ได้อยู่ในเมนูข้าง แต่เลือกมาไว้ในแถบล่างได้
 *  บทบาทที่หน้าหลักคือหน้าลงเวลาเอง (นักศึกษาฝึกงาน) ไม่มีช่องหน้าหลัก เพราะซ้ำกับปุ่มกลาง */
export const BOTNAV_EXTRA = (role: Role) => [
  ...(mobileHomeOf(role) === "/" ? [] : [{ href: mobileHomeOf(role), label: "หน้าหลัก", icon: "home" as const }]),
  { href: "/profile", label: "โปรไฟล์", icon: "user" as const },
];

/**
 * หน้าที่เลือกมาไว้ในแถบล่างได้ — เฉพาะหน้าในเมนูของบทบาทตัวเอง
 * หน้าลงเวลา ("/") ไม่อยู่ในรายการ เพราะตรึงไว้ที่ปุ่มกลางแล้ว
 */
export function botnavChoices(items: NavItem[], role: Role) {
  return [
    ...BOTNAV_EXTRA(role),
    ...items.filter((i) => i.href !== "/").map((i) => ({ href: i.href, label: i.label, icon: i.icon })),
  ];
}

/*
 * ค่าตั้งต้น: หน้าหลัก · แดชบอร์ด · การลา · โปรไฟล์
 *
 * บทบาทที่ไม่มีแดชบอร์ด (เช่นทีมงาน) ใช้หน้างานหน้าแรกของบทบาทแทน
 * เจ้าของสั่ง 25 ก.ย. 2569 ให้แถบของทีมงานเป็น หน้าหลัก · งานที่ได้รับ · ลงเวลา · การลา · โปรไฟล์
 * เดิมช่องที่สองว่างเปล่าเพราะไปหาแต่หน้าแดชบอร์ดที่บทบาทนั้นไม่มี
 */
export function botnavDefault(items: NavItem[], role: Role) {
  const work = items.filter((i) => i.href !== "/" && i.href !== "/leave");
  const second =
    items.find((i) => i.href.endsWith("/dashboard") || i.href === "/presales-dash") ?? work[0];
  const leave = items.find((i) => i.href === "/leave");
  const home = mobileHomeOf(role) === "/" ? BOTNAV_EMPTY : mobileHomeOf(role);
  return [home, second?.href ?? BOTNAV_EMPTY, leave?.href ?? BOTNAV_EMPTY, "/profile"];
}
