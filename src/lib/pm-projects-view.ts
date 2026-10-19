"use client";

/*
 * มุมมองหน้ารายการโปรเจค — แถว / โฟลเดอร์ แบบ Google Drive (ผู้ใช้สั่ง 16 ต.ค. 2569)
 *
 * จำแยกตามบทบาท (PM กับ GM เปิดหน้าเดียวกัน แต่อาจชอบคนละแบบ)
 * เป็นค่าของเครื่อง ไม่ใช่ค่าตั้งค่าระบบ — ยังไม่เคยเลือก = โฟลเดอร์ (หน้าตาเดิม)
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { type Role } from "./role";

export type PmProjectsView = "list" | "grid";

type Prefs = Partial<Record<Role, PmProjectsView>>;

function isPrefs(value: unknown): value is Prefs {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every((v) => v === "list" || v === "grid");
}

const store = createPersistedStore<Prefs>("maz-erp.pm-projects-view.v1", {}, isPrefs);

export function usePmProjectsView(role: Role): PmProjectsView {
  const prefs = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  return prefs[role] ?? "grid";
}

export function setPmProjectsView(role: Role, view: PmProjectsView) {
  store.update((p) => ({ ...p, [role]: view }));
}
