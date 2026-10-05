/*
 * เพิ่มรายการที่มีรหัสผูกระบบจากหน้างาน — ใช้ที่เก็บเดียวกับ /admin/options (settings().catalog)
 * รหัสสร้างให้เอง · ชื่อซ้ำกับของเดิมไม่เพิ่ม คืนรหัสของเดิมให้เลือกแทน
 */

import { logChange } from "./admin-log";
import { newCatalogKey } from "./catalog";
import { whtTypes } from "./acc-data";
import { hrDepts, hrDocs, hrPositions } from "./hr-data";
import { services, teamRoles } from "./pm-data";
import { saveSection, settings } from "./system-settings";

export type AddCatalogKey = "services" | "teamRoles" | "whtTypes" | "depts" | "positions" | "docs";

const LABEL: Record<AddCatalogKey, string> = {
  services: "ประเภทบริการ",
  teamRoles: "ตำแหน่งในทีม",
  whtTypes: "ประเภทเงินได้ที่หัก ณ ที่จ่าย",
  depts: "แผนก",
  positions: "ตำแหน่งงาน",
  docs: "เอกสารประจำตัวพนักงาน",
};

/* สีของตำแหน่งในทีมที่เพิ่มจากหน้างาน — วนตามจำนวนที่มี ผู้ดูแลเปลี่ยนสีทีหลังได้ */
const TONES = ["#2f7dd1", "#e0568a", "#0ea5a5", "#d97706", "#7c5ce0", "#2e9e6b", "#be185d", "#0369a1"];

export function addCatalogItem(
  key: AddCatalogKey,
  label: string,
  extra: { dept?: string; rate?: number; req?: boolean } = {},
): { value: string } | { error: string } {
  const c = settings().catalog;
  const id = newCatalogKey();
  const same = (x: { label: string }) => x.label.trim() === label;
  switch (key) {
    case "services": {
      const list = services();
      const dup = list.find(same);
      if (dup) return { value: dup.key };
      saveSection("catalog", { ...c, services: [...list, { key: id, label }] });
      break;
    }
    case "teamRoles": {
      const list = teamRoles();
      const dup = list.find(same);
      if (dup) return { value: dup.key };
      saveSection("catalog", { ...c, teamRoles: [...list, { key: id, label, color: TONES[list.length % TONES.length] }] });
      break;
    }
    case "whtTypes": {
      const list = whtTypes();
      const dup = list.find(same);
      if (dup) return { value: dup.key };
      saveSection("catalog", { ...c, whtTypes: [...list, { key: id, label, rate: extra.rate ?? 3 }] });
      break;
    }
    case "depts": {
      const list = hrDepts();
      const dup = list.find(same);
      if (dup) return { value: dup.v };
      saveSection("catalog", { ...c, depts: [...list, { v: id, label }] });
      break;
    }
    case "positions": {
      const list = hrPositions();
      const dup = list.find(same);
      if (dup) return { value: dup.v };
      if (!extra.dept) return { error: "เลือกแผนกของตำแหน่งนี้" };
      saveSection("catalog", { ...c, positions: [...list, { v: id, label, dept: extra.dept }] });
      break;
    }
    case "docs": {
      const list = hrDocs();
      const dup = list.find(same);
      if (dup) return { value: dup.v };
      saveSection("catalog", { ...c, docs: [...list, { v: id, label, req: Boolean(extra.req) }] });
      break;
    }
  }
  logChange("ตัวเลือกในรายการ", `${LABEL[key]}: เพิ่ม ${label} (จากหน้างาน)`);
  return { value: id };
}
