"use client";

/*
 * เส้นทางบนแถบบน (ผู้ใช้สั่ง 12 ต.ค. 2569) — แบบ "ใบเสนอราคา / สร้างใบเสนอราคา"
 * ช่วงต้นอ่านจากเมนู (nav.ts) ช่วงท้ายที่เมนูไม่รู้ (ชื่อลูกค้า เลขที่เอกสาร หน้าสร้างใหม่)
 * หน้านั้นเติมเองด้วย useCrumb — ออกจากหน้าแล้วล้างให้เอง
 */

import { useEffect, useRef, useSyncExternalStore } from "react";

/** ช่วงหนึ่งของเส้นทาง — มี href = กดกลับไปหน้านั้นได้ */
export type Crumb = {
  label: string;
  href?: string;
  /** แทนช่วงต้นที่อ่านจากเมนู — หน้าที่เข้าได้จากสองทาง (ผู้สนใจที่ปิดงานแล้วย้อนไปดีล) */
  root?: boolean;
  /** หน้าย่อยที่สลับด้วย state ในหน้าเดียว (ใบเบิก → รายการ) — กดแล้วเรียกฟังก์ชันแทนลิงก์ */
  onClick?: () => void;
};
type CrumbPart = string | Crumb | null | undefined | false;

const EMPTY: Crumb[] = [];
let trail: Crumb[] = EMPTY;
const listeners = new Set<() => void>();

function emit(next: Crumb[]) {
  trail = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** ช่วงท้ายที่หน้าเติมไว้ — แถบบนอ่านอันนี้ */
export function usePageCrumbs(): Crumb[] {
  return useSyncExternalStore(subscribe, () => trail, () => EMPTY);
}

/**
 * หน้าที่ลึกกว่าเมนูเติมช่วงท้ายของเส้นทางบนแถบบน (ผู้ใช้สั่ง 12 ต.ค. 2569)
 * เช่น useCrumb("สร้างใบเสนอราคา") · useCrumb({ label: "ชื่องาน", href: "/pm/projects?pj=…" }, "จัดคิวงาน")
 * ค่าว่าง/false ข้ามไป — ใช้ตอนข้อมูลยังโหลดไม่เสร็จได้
 */
export function useCrumb(...parts: CrumbPart[]) {
  const list = parts.filter((p): p is string | Crumb => Boolean(p)).map((p) => (typeof p === "string" ? { label: p } : p));
  /* ฟังก์ชันเปลี่ยนทุกครั้งที่วาด — เก็บตัวล่าสุดไว้ใน ref ไม่เอาเข้า key จะได้ไม่ตั้งเส้นทางใหม่ทุกรอบ */
  const latest = useRef(list);
  useEffect(() => {
    latest.current = list;
  });
  const key = JSON.stringify(list.map((c) => ({ ...c, onClick: c.onClick ? 1 : undefined })));
  useEffect(() => {
    const mine: Crumb[] = (JSON.parse(key) as (Omit<Crumb, "onClick"> & { onClick?: 1 })[]).map((c, i) => ({
      ...c,
      onClick: c.onClick ? () => latest.current[i]?.onClick?.() : undefined,
    }));
    emit(mine);
    return () => {
      if (trail === mine) emit(EMPTY);
    };
  }, [key]);
}
