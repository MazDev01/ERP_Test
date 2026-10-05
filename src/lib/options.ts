/*
 * ตัวเลือกในดรอปดาวน์ของแต่ละบทบาท — ผู้ดูแลระบบแก้ได้ที่ /admin/options
 * ค่าเก็บใน system-settings.ts (หมวด options) อ่านผ่าน optionsOf() ทุกครั้ง ห้ามเก็บเป็นค่าคงที่ระดับไฟล์
 */

import { saveSection, settings, type OptionKey } from "./system-settings";
import { logChange } from "./admin-log";

export type { OptionKey };

export type OptionGroup = {
  key: OptionKey;
  /** แท็บในหน้าผู้ดูแลระบบ */
  role: "sales" | "pm" | "acc" | "hr" | "all";
  label: string;
  /** ใช้ที่ไหน — ขึ้นใต้ชื่อในหน้าผู้ดูแลระบบ */
  where: string;
};

export const OPTION_ROLES: { key: OptionGroup["role"]; label: string }[] = [
  { key: "sales", label: "พนักงานขาย" },
  { key: "pm", label: "ผู้จัดการโครงการ" },
  { key: "acc", label: "พนักงานบัญชี" },
  { key: "hr", label: "ฝ่ายบุคคล" },
  { key: "all", label: "ทุกบทบาท" },
];

export const OPTION_GROUPS: OptionGroup[] = [
  { key: "leadSource", role: "sales", label: "แหล่งที่มาของผู้สนใจ", where: "ฟอร์มผู้สนใจ · หน้ารายละเอียดผู้สนใจ" },
  { key: "leadChannel", role: "sales", label: "ช่องทางติดต่อ", where: "ฟอร์มผู้สนใจ · บันทึกการติดต่อ" },
  { key: "leadClose", role: "sales", label: "เหตุผลปิดผู้สนใจ", where: "กล่องปิดผู้สนใจ (ไม่สำเร็จ)" },
  { key: "leadTakeover", role: "sales", label: "เหตุผลรับช่วงดูแล", where: "กล่องรับช่วงดูแลผู้สนใจของคนอื่น" },
  { key: "quoteReject", role: "sales", label: "เหตุผลที่ลูกค้าปฏิเสธใบเสนอราคา", where: "กล่องบันทึกลูกค้าปฏิเสธ · รายงานเหตุผลที่ไม่ตกลง" },
  { key: "adPlatform", role: "pm", label: "แพลตฟอร์มโฆษณา", where: "หน้าโฆษณาและรายงาน" },
  { key: "collectChannel", role: "acc", label: "ช่องทางติดตามหนี้", where: "กล่องบันทึกการติดตามหนี้ หน้าวางบิล" },
  { key: "sex", role: "all", label: "เพศ", where: "ข้อมูลพนักงาน · หน้าโปรไฟล์" },
  { key: "expenseKind", role: "all", label: "ประเภทค่าใช้จ่าย", where: "ใบเบิกค่าใช้จ่าย (รายการค่าใช้จ่ายอื่น)" },
  { key: "eduLevel", role: "all", label: "ระดับการศึกษา", where: "หน้าโปรไฟล์ของพนักงานทุกคน" },
];

/** ตัวเลือกที่ใช้งานอยู่ — ตัวที่ฝ่ายบุคคลปิดไว้ไม่ขึ้นให้เลือกใหม่ (ข้อมูลเก่ายังเก็บข้อความเดิม) */
export function optionsOf(key: OptionKey): string[] {
  const off = settings().optionsOff[key] ?? [];
  return settings().options[key].filter((x) => !off.includes(x));
}

/** ทุกตัวเลือกรวมที่ปิดไว้ — ใช้ในหน้าตั้งค่า */
export function allOptionsOf(key: OptionKey): string[] {
  return settings().options[key];
}

/** เพิ่มตัวเลือกจากหน้างาน (ปุ่ม "+ เพิ่มตัวเลือกใหม่" ในดรอปดาวน์) — ต่อท้ายรายการ ลงประวัติการตั้งค่า */
export function addOption(key: OptionKey, text: string) {
  const list = optionsOf(key);
  if (list.includes(text)) return;
  saveSection("options", { ...settings().options, [key]: [...list, text] });
  const g = OPTION_GROUPS.find((x) => x.key === key);
  logChange("ตัวเลือกในรายการ", `${g?.label ?? key}: เพิ่ม ${text} (จากหน้างาน)`);
}
