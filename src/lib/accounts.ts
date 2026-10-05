"use client";

/*
 * สถานะบัญชีผู้ใช้ — ฝ่ายบุคคลระงับบัญชี หรือสั่งให้ตั้งรหัสผ่านใหม่ได้ที่ /hr/accounts
 * (ผู้ใช้สั่ง 18 ก.ย. 2569 ให้บัญชีผู้ใช้เป็นหน้าที่ของฝ่ายบุคคล หน้าของผู้ดูแลระบบถูกเอาออก)
 *
 * สถานะเก็บ "ตามบทบาท" เพราะหน้าเข้าสู่ระบบยังเลือกด้วยบทบาท
 * บัญชีของคนที่ควบสองบทบาท ระงับทีเดียวมีผลทั้งสองบทบาท (ดู setAccountStatus ใน hr-store)
 * หน้าเข้าสู่ระบบอ่านสถานะจากที่นี่: ระงับอยู่ → ขึ้นหน้าบัญชีถูกระงับ · ต้องตั้งรหัสใหม่ → ไปหน้าตั้งรหัสผ่าน
 *
 * ยังไม่มี backend — กันได้แค่ในเครื่องนี้ ของจริงต้องตรวจที่เซิร์ฟเวอร์ตอนล็อกอิน
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import type { Role } from "./role";

export type Account = {
  suspended: boolean;
  suspendedWhy: string;
  suspendedAt: string;
  mustResetPassword: boolean;
  lastLoginAt: string;
};

export type Accounts = Partial<Record<Role, Account>>;

const BLANK: Account = {
  suspended: false,
  suspendedWhy: "",
  suspendedAt: "",
  mustResetPassword: false,
  lastLoginAt: "",
};

const store = createPersistedStore<Accounts>("maz-erp.accounts.v1", {}, (v): v is Accounts =>
  typeof v === "object" && v !== null && !Array.isArray(v),
);

export function useAccounts() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function accountOf(role: Role, all: Accounts = store.get()): Account {
  return { ...BLANK, ...all[role] };
}

function patch(role: Role, p: Partial<Account>) {
  store.update((all) => ({ ...all, [role]: { ...accountOf(role, all), ...p } }));
}

export function suspendAccount(role: Role, why: string, at: string) {
  patch(role, { suspended: true, suspendedWhy: why, suspendedAt: at });
}

export function restoreAccount(role: Role) {
  patch(role, { suspended: false, suspendedWhy: "", suspendedAt: "" });
}

export function requirePasswordReset(role: Role, on: boolean) {
  patch(role, { mustResetPassword: on });
}

export function markLogin(role: Role, at: string) {
  patch(role, { lastLoginAt: at });
}

export function resetAccounts() {
  store.reset();
}
