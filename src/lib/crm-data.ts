/*
 * ข้อมูลสายงานขาย: ผู้สนใจ → คำขอก่อนการขาย → ใบเสนอราคา → ดีลและใบงาน
 * ทุกโมดูลอ้างถึงลูกค้าด้วย customerCode เดียวกัน จึงเชื่อมกันได้ทั้งสาย
 * TODO: ย้ายไปตาราง customer / presales_request / quotation / deal เมื่อต่อ backend
 */

import type { ServiceKey } from "./pm-data";
import { settings } from "./system-settings";
import { addDays, round2 } from "./format";

// ═══ ลูกค้าและผู้สนใจ ═══════════════════════════════════════════
export type CustomerStatus = "รอนัดหมาย" | "ปิดงาน" | "ปฏิเสธ";

export const CUSTOMER_STATUS: Record<CustomerStatus, string> = {
  รอนัดหมาย: "t-info",
  ปิดงาน: "t-ok",
  ปฏิเสธ: "t-miss",
};

/*
 * ประเภทผู้ซื้อ — ตัดสินว่าเวลาหักภาษี ณ ที่จ่ายต้องยื่นแบบไหน
 * นิติบุคคลยื่น ภ.ง.ด.53 บุคคลธรรมดายื่น ภ.ง.ด.3 (ดู acc-data.ts)
 */
export type BuyerType = "juristic" | "individual";

export const BUYER_TYPE: Record<BuyerType, string> = {
  juristic: "นิติบุคคล",
  individual: "บุคคลธรรมดา",
};

export type Customer = {
  code: string;
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  taxId: string;
  /**
   * ชื่อเต็มตามหนังสือรับรอง เช่น "บริษัท สยามพลาสติก จำกัด" — ชื่อที่ต้องพิมพ์บนใบกำกับภาษี
   * ชื่อสั้นในช่อง name ใช้เรียกกันในระบบเท่านั้น ลูกค้าใช้ขอคืน VAT ไม่ได้
   */
  legalName?: string;
  /** ที่อยู่ตามหนังสือรับรอง — ที่อยู่ส่งของ (address) ใช้แทนไม่ได้ · ว่าง = ใช้ address */
  legalAddress?: string;
  /** "00000" = สำนักงานใหญ่ · เลขห้าหลักอื่น = สาขา · ว่าง = ยังไม่ได้ระบุ ออกใบกำกับภาษีไม่ได้ */
  branch?: string;
  /** ตั้งต้นให้ใบเสนอราคา แก้เป็นรายฉบับได้ */
  type: BuyerType;
  status: CustomerStatus;
  /**
   * รหัสผู้สนใจเดิมก่อนปิดการขาย (LEAD-…) — มีเฉพาะรายที่กลายเป็นลูกค้าแล้ว
   * เก็บไว้เป็นข้อมูลอ้างอิง ลิงก์เก่าและเอกสารเก่าที่อ้างรหัสนี้จะได้ยังชี้ไปถูกราย
   */
  leadCode?: string;
  /** เหตุผลที่ปิดเสนอ — ว่างถ้ายังไม่ปิด */
  closedReason: string;
  owner: string;
};

export type Activity = {
  id: string;
  customerCode: string;
  date: string;
  channel: string;
  summary: string;
  nextAction: string;
  followUp: string;
};

/*
 * ประวัติการเปลี่ยนแปลงของผู้สนใจ — มีสองเรื่องที่บันทึก
 * เปลี่ยนสถานะ กับ รับช่วงดูแล (เปลี่ยนตัวคนที่ถือรายการนี้)
 * แยกด้วย kind เพราะ from/to คนละความหมาย อันหนึ่งเป็นสถานะ อีกอันเป็นชื่อคน
 */
export type ChangeLog = {
  id: string;
  at: string;
  customerCode: string;
  reason: string;
  by: string;
} & (
  | { kind: "status"; from: CustomerStatus; to: CustomerStatus }
  | { kind: "owner"; from: string; to: string }
);

export const CHANGE_KIND: Record<ChangeLog["kind"], string> = {
  status: "เปลี่ยนสถานะ",
  owner: "รับช่วงดูแล",
};

/* แหล่งที่มาและช่องทางติดต่อ — ผู้ดูแลระบบแก้ได้ที่ /admin/options (optionsOf ใน options.ts) */

/** ผู้สนใจที่ไม่ได้ติดต่อเกินกี่วัน ถือว่าค้างต้องตามต่อ */
export const STALE_DAYS = 30;

/**
 * หาผู้สนใจ/ลูกค้าจากรหัส — รับรหัสผู้สนใจเดิมด้วย
 *
 * รายที่ปิดการขายแล้วเปลี่ยนรหัสจาก LEAD- เป็น CUS- ลิงก์เก่าและเอกสารเก่าที่อ้าง LEAD-
 * ต้องยังเปิดไปเจอรายเดิม ไม่ใช่เปิดไปเจอผู้สนใจรายใหม่ที่มาใช้เลขต่อ
 */
export function findParty(customers: Customer[], code: string) {
  return customers.find((c) => c.code === code) ?? customers.find((c) => c.leadCode === code);
}

// ═══ ข้อมูลผู้ซื้อบนใบกำกับภาษี ══════════════════════════════════
/*
 * ใบกำกับภาษีต้องมีชื่อเต็มตามหนังสือรับรอง ที่อยู่ เลขประจำตัวผู้เสียภาษี 13 หลัก
 * และคำว่า "สำนักงานใหญ่" หรือ "สาขาที่ …" ครบทุกอย่าง (ป.86 ประมวลรัษฎากร)
 * ขาดอย่างใดอย่างหนึ่งลูกค้าใช้ขอคืนภาษีซื้อไม่ได้ ระบบจึงต้องห้ามออก ไม่ใช่ออกแล้วเว้นขีดไว้
 * บุคคลธรรมดาไม่มีชื่อนิติบุคคลและไม่มีสาขา จึงขอแค่ชื่อ ที่อยู่ และเลขประจำตัวผู้เสียภาษี
 */
export const HEAD_OFFICE = "00000";

/** "00000" → "สำนักงานใหญ่" · "00002" → "สาขาที่ 00002" · ว่าง → ว่าง (ไม่ใส่ขีด) */
export function branchLabel(branch: string) {
  const code = (branch ?? "").trim();
  if (!code) return "";
  return code === HEAD_OFFICE ? "สำนักงานใหญ่" : `สาขาที่ ${code}`;
}

export type TaxInvoiceBuyer = {
  /** ชื่อที่พิมพ์บนเอกสาร — ชื่อเต็มตามหนังสือรับรองเสมอเมื่อเป็นนิติบุคคล */
  name: string;
  taxId: string;
  address: string;
  /** "สำนักงานใหญ่" / "สาขาที่ …" — บุคคลธรรมดาเป็นค่าว่าง */
  branch: string;
  /** ช่องที่ยังไม่ได้กรอก — มีอย่างน้อยหนึ่งช่องแปลว่าออกใบกำกับภาษีไม่ได้ */
  missing: string[];
};

/**
 * ข้อมูลผู้ซื้อสำหรับใบกำกับภาษี พร้อมรายการช่องที่ยังขาด
 * ไม่มีลูกค้าในระบบเลย = ขาดทุกช่อง หน้าจอที่จะออกเอกสารต้องเช็ค missing ก่อนเสมอ
 */
export function taxInvoiceBuyer(c: Customer | undefined): TaxInvoiceBuyer {
  const missing: string[] = [];
  if (!c) {
    return { name: "", taxId: "", address: "", branch: "", missing: ["ข้อมูลลูกค้าทั้งหมด"] };
  }
  const juristic = c.type === "juristic";
  const legalName = (c.legalName ?? "").trim();
  const address = (c.legalAddress ?? "").trim() || c.address.trim();
  const taxId = c.taxId.trim();
  const branch = (c.branch ?? "").trim();

  if (juristic && !legalName) missing.push("ชื่อนิติบุคคลเต็มตามหนังสือรับรอง");
  if (!taxId) missing.push("เลขประจำตัวผู้เสียภาษี 13 หลัก");
  else if (!/^\d{13}$/.test(taxId)) missing.push("เลขประจำตัวผู้เสียภาษีที่ครบ 13 หลัก");
  if (!address) missing.push("ที่อยู่จดทะเบียน");
  if (juristic && !branch) missing.push("สำนักงานใหญ่ / สาขาที่ออกใบกำกับภาษี");

  return {
    name: juristic ? legalName || c.name : c.name,
    taxId,
    address,
    branch: juristic ? branchLabel(branch) : "",
    missing,
  };
}

export const CUSTOMERS: Customer[] = [
  /* ชุดเดียวกับต้นแบบ dose-erp-maz/leads.html (14 ราย) */
  { code: "LEAD-6909-001", name: "เทคโซลูชั่น จำกัด", contact: "สมชาย จันทร์เพ็ญ", phone: "081-234-5678", email: "somchai@techsolution.co.th", address: "99/1 ถ.นิมมานเหมินท์ อ.เมือง จ.เชียงใหม่ 50200", source: "เว็บไซต์", taxId: "0505561000123", legalName: "บริษัท เทคโซลูชั่น จำกัด", legalAddress: "99/1 ถ.นิมมานเหมินท์ ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200", branch: "00000", type: "juristic", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6908-014", name: "อัลฟ่าคอร์ป จำกัด", contact: "วิภาดา ธนกิจ", phone: "089-112-3344", email: "", address: "55/7 ถ.ซุปเปอร์ไฮเวย์ ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300", source: "แนะนำต่อ", taxId: "0505562000987", legalName: "บริษัท อัลฟ่าคอร์ป จำกัด", legalAddress: "55/7 ถ.ซุปเปอร์ไฮเวย์ ต.ช้างเผือก อ.เมือง จ.เชียงใหม่ 50300", branch: "00000", type: "juristic", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6908-002", name: "บ้านสวนพฤกษา", contact: "กิตติ ศรีสุข", phone: "086-909-1122", email: "kitti@baansuan.com", address: "18/3 ม.5 ต.สันผีเสื้อ อ.เมือง จ.เชียงใหม่ 50300", source: "ออกบูธ", taxId: "1509900111223", type: "individual", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "CUS-6908-021", name: "สยามพลาสติก", contact: "ณัฐพล พงษ์ไพร", phone: "082-556-7788", email: "nut@siamplastic.co.th", address: "145 ม.4 ต.หนองป่าครั่ง อ.เมือง จ.เชียงใหม่", source: "เว็บไซต์", taxId: "0505558000456", legalName: "บริษัท สยามพลาสติก จำกัด", legalAddress: "145 ม.4 ต.หนองป่าครั่ง อ.เมือง จ.เชียงใหม่ 50000", branch: "00000", type: "juristic", leadCode: "LEAD-6908-021", status: "ปิดงาน", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "CUS-6905-007", name: "เอ็มเทคเอ็นจิเนียริ่ง", contact: "อรทัย รุ่งเรือง", phone: "095-221-9080", email: "orathai@mtech.co.th", address: "88/9 ถ.เชียงใหม่-ลำปาง อ.เมือง จ.เชียงใหม่", source: "ลูกค้าเก่า", taxId: "0505560000789", legalName: "บริษัท เอ็มเทคเอ็นจิเนียริ่ง จำกัด", branch: "00000", type: "juristic", leadCode: "LEAD-6905-007", status: "ปิดงาน", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6907-011", name: "ร้านทองไพศาล", contact: "ธนา วงศ์ทอง", phone: "083-447-1290", email: "", address: "231 ถ.วัวลาย ต.หายยา อ.เมือง จ.เชียงใหม่ 50100", source: "โทรเข้า", taxId: "1509900222334", type: "individual", status: "ปฏิเสธ", closedReason: "ชะลอโครงการ — ยังไม่มีกำหนดกลับมา", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6909-002", name: "มั่นคงก่อสร้าง", contact: "ปิยะ มั่นคง", phone: "081-778-4433", email: "piya@mankong.co.th", address: "409 ม.2 ต.ท่าศาลา อ.เมือง จ.เชียงใหม่ 50000", source: "เว็บไซต์", taxId: "0505563000246", legalName: "บริษัท มั่นคงก่อสร้าง จำกัด", legalAddress: "409 ม.2 ต.ท่าศาลา อ.เมือง จ.เชียงใหม่ 50000", branch: "00000", type: "juristic", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6907-018", name: "คลินิกใสใส", contact: "สุดารัตน์ แก้วใส", phone: "094-332-1177", email: "", address: "77/12 ถ.ห้วยแก้ว ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200", source: "เฟซบุ๊ก", taxId: "1509900333445", type: "individual", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6908-030", name: "วีพีโลจิสติกส์", contact: "วรพล อินทร์แก้ว", phone: "087-665-2201", email: "worapon@vplogis.co.th", address: "302 ม.6 ต.สันทรายน้อย อ.สันทราย จ.เชียงใหม่ 50210", source: "แนะนำต่อ", taxId: "0505559000321", legalName: "บริษัท วีพีโลจิสติกส์ จำกัด", legalAddress: "302 ม.6 ต.สันทรายน้อย อ.สันทราย จ.เชียงใหม่ 50210", branch: "00001", type: "juristic", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "CUS-6906-004", name: "ครัวคุณจิ", contact: "จิราพร นาคทอง", phone: "092-118-5566", email: "", address: "12 ถ.ช้างคลาน อ.เมือง จ.เชียงใหม่", source: "ออกบูธ", taxId: "1509901234567", type: "individual", leadCode: "LEAD-6906-004", status: "ปิดงาน", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "CUS-6906-019", name: "ทองดีการช่าง", contact: "อนุชา ทองดี", phone: "088-909-3311", email: "", address: "64 ถ.เจริญราษฎร์ ต.วัดเกต อ.เมือง จ.เชียงใหม่ 50000", source: "โทรเข้า", taxId: "1509900444556", type: "individual", leadCode: "LEAD-6906-019", status: "ปิดงาน", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6909-003", name: "บุญมีฟาร์ม", contact: "เมธาวี บุญมี", phone: "081-556-9911", email: "methawee@boonmee.farm", address: "9 ม.8 ต.ออนใต้ อ.สันกำแพง จ.เชียงใหม่ 50130", source: "เฟซบุ๊ก", taxId: "1509900555667", type: "individual", status: "รอนัดหมาย", closedReason: "", owner: "ชนัญชิดา ใจดี" },
  { code: "LEAD-6908-008", name: "ใจงามเบเกอรี่", contact: "ศิริพร ใจงาม", phone: "090-224-6677", email: "", address: "120/4 ถ.มหิดล ต.ป่าแดด อ.เมือง จ.เชียงใหม่ 50100", source: "เว็บไซต์", taxId: "1509900666778", type: "individual", status: "ปฏิเสธ", closedReason: "เลือกผู้ให้บริการรายอื่น", owner: "ชนัญชิดา ใจดี" },
  { code: "CUS-6908-027", name: "พูลผลอะไหล่", contact: "ชัยวัฒน์ พูลผล", phone: "084-771-2288", email: "", address: "72 ถ.มหิดล ต.หายยา อ.เมือง จ.เชียงใหม่ 50100", source: "ลูกค้าเก่า", taxId: "0505557000654", legalName: "บริษัท พูลผลอะไหล่ จำกัด", legalAddress: "72 ถ.มหิดล ต.หายยา อ.เมือง จ.เชียงใหม่ 50100", branch: "00000", type: "juristic", leadCode: "LEAD-6908-027", status: "ปิดงาน", closedReason: "", owner: "ชนัญชิดา ใจดี" },
];

export const ACTIVITIES: Activity[] = [
  /* การติดต่อล่าสุดของผู้สนใจแต่ละราย ตามต้นแบบ leads.html (last / channel / summary / next_action / next_followup) */
  { id: "AC-101", customerCode: "LEAD-6909-001", date: "2026-09-03", channel: "โทรศัพท์", summary: "สอบถามราคาทำเว็บไซต์บริษัท ขอให้ส่งตัวอย่างงานก่อน", nextAction: "ส่งพอร์ตงานทางอีเมล", followUp: "2026-09-10" },
  { id: "AC-102", customerCode: "LEAD-6908-014", date: "2026-08-18", channel: "นัดพบ", summary: "เข้าพบที่ออฟฟิศ คุยเรื่องระบบสต๊อก ยังไม่สรุปงบ", nextAction: "รอลูกค้าเคาะงบภายในเดือนนี้", followUp: "2026-09-08" },
  { id: "AC-103", customerCode: "LEAD-6908-002", date: "2026-08-02", channel: "โทรศัพท์", summary: "สนใจทำเพจและระบบจองห้องพัก ขอเวลาปรึกษาหุ้นส่วน", nextAction: "โทรตามอีกครั้ง", followUp: "" },
  { id: "AC-104", customerCode: "CUS-6908-021", date: "2026-08-28", channel: "อีเมล", summary: "ส่งใบเสนอราคาแล้ว รอผลพิจารณาจากผู้บริหาร", nextAction: "ติดตามผลใบเสนอราคา", followUp: "2026-09-09" },
  { id: "AC-105", customerCode: "CUS-6905-007", date: "2026-08-25", channel: "นัดพบ", summary: "ปิดการขายระบบจัดการคลัง เริ่มงานต้นเดือนหน้า", nextAction: "ส่งมอบใบงานให้ทีม PM", followUp: "" },
  { id: "AC-106", customerCode: "LEAD-6907-011", date: "2026-08-12", channel: "โทรศัพท์", summary: "แจ้งว่าชะลอโครงการออกไปก่อน ยังไม่มีกำหนด", nextAction: "", followUp: "" },
  { id: "AC-107", customerCode: "LEAD-6909-002", date: "2026-09-01", channel: "โทรศัพท์", summary: "สอบถามระบบติดตามหน้างาน ขอนัดเข้าพบ", nextAction: "นัดเข้าพบที่ไซต์งาน", followUp: "2026-09-12" },
  { id: "AC-108", customerCode: "LEAD-6907-018", date: "2026-07-20", channel: "อีเมล", summary: "ขอใบเสนอราคาระบบนัดหมายคนไข้ ส่งไปแล้วยังไม่ตอบกลับ", nextAction: "โทรตาม", followUp: "" },
  { id: "AC-109", customerCode: "LEAD-6908-030", date: "2026-08-30", channel: "นัดพบ", summary: "คุยขอบเขตงานระบบติดตามรถ รอสรุปจำนวนคันที่ใช้จริง", nextAction: "รอข้อมูลจำนวนรถจากลูกค้า", followUp: "2026-09-07" },
  { id: "AC-110", customerCode: "CUS-6906-004", date: "2026-08-21", channel: "โทรศัพท์", summary: "รับงานทำเว็บไซต์ร้าน ชำระมัดจำแล้ว", nextAction: "", followUp: "" },
  { id: "AC-111", customerCode: "CUS-6906-019", date: "2026-06-28", channel: "โทรศัพท์", summary: "สอบถามราคาคร่าวๆ ยังไม่ระบุความต้องการชัดเจน", nextAction: "ส่งข้อมูลบริการเพิ่มเติม", followUp: "" },
  { id: "AC-112", customerCode: "LEAD-6909-003", date: "2026-09-04", channel: "อีเมล", summary: "สนใจระบบจัดการออเดอร์ผลผลิต ขอดูเดโม", nextAction: "นัดเดโมออนไลน์", followUp: "2026-09-11" },
  { id: "AC-113", customerCode: "LEAD-6908-008", date: "2026-08-08", channel: "โทรศัพท์", summary: "แจ้งว่าเลือกใช้ผู้ให้บริการรายอื่นแล้ว", nextAction: "", followUp: "" },
  { id: "AC-114", customerCode: "CUS-6908-027", date: "2026-08-27", channel: "นัดพบ", summary: "ต่อยอดระบบเดิม เพิ่มโมดูลรายงาน", nextAction: "จัดทำใบเสนอราคา", followUp: "2026-09-08" },
];

export const CHANGE_LOGS: ChangeLog[] = [
  /* ต้นแบบ leads.html LOG (4 รายการ) */
  { id: "CL-1", kind: "status", at: "2026-08-12", customerCode: "LEAD-6907-011", from: "รอนัดหมาย", to: "ปฏิเสธ", reason: "ชะลอโครงการ — ยังไม่มีกำหนดกลับมา", by: "ชนัญชิดา ใจดี" },
  { id: "CL-2", kind: "status", at: "2026-08-08", customerCode: "LEAD-6908-008", from: "รอนัดหมาย", to: "ปฏิเสธ", reason: "เลือกผู้ให้บริการรายอื่น", by: "ชนัญชิดา ใจดี" },
  { id: "CL-3", kind: "status", at: "2026-08-25", customerCode: "CUS-6905-007", from: "รอนัดหมาย", to: "ปิดงาน", reason: "ปิดการขายระบบจัดการคลัง", by: "ชนัญชิดา ใจดี" },
  { id: "CL-4", kind: "status", at: "2026-08-21", customerCode: "CUS-6906-004", from: "รอนัดหมาย", to: "ปิดงาน", reason: "ปิดการขายเว็บไซต์ร้าน", by: "ชนัญชิดา ใจดี" },
];

// ═══ คำขอก่อนการขาย ════════════════════════════════════════════
export type PresalesStatus =
  | "รอรับงาน" | "กำลังทำ" | "รอข้อมูลเพิ่ม" | "ส่งกลับแล้ว" | "ปิดคำขอ";

export const PRESALES_STATUS: Record<PresalesStatus, string> = {
  รอรับงาน: "t-miss",
  กำลังทำ: "t-info",
  รอข้อมูลเพิ่ม: "t-early",
  ส่งกลับแล้ว: "t-ok",
  ปิดคำขอ: "t-job",
};

export type Urgency = "ปกติ" | "ด่วน" | "ด่วนมาก";

export type PresalesRequest = {
  id: string;
  no: string;
  customerCode: string;
  /** BD = ข้อเสนอเชิงธุรกิจ · SA = วิเคราะห์เชิงเทคนิค */
  kind: "BD" | "SA";
  problem: string;
  assignee: string;
  due: string;
  urgency: Urgency;
  /** เหตุผลที่ต้องด่วนมาก — บังคับกรอกเมื่อเลือกด่วนมาก */
  urgentReason: string;
  budget: number;
  /** ชื่อไฟล์ที่แนบมาตอนส่งคำขอ — ยังไม่มี storage จึงเก็บแค่ชื่อไว้แสดง */
  attachments: string[];
  status: PresalesStatus;
  createdAt: string;
  /** ผู้รับคำขอ (PM) ขอข้อมูลเพิ่มจากฝ่ายขาย — ข้อความล่าสุด */
  ask?: string;
  /** ฝ่ายขายตอบข้อมูลเพิ่ม — ข้อความล่าสุด */
  reply?: string;
  /** ชั่วโมงที่ทีมก่อนการขายใช้กับคำขอนี้ทั้งหมด (ต้นแบบ presales.html hours) */
  hours?: number;
  /*
   * แผนงานของข้อเสนอ (Full Proposal · M2) — BD/SA วางเป็น "ช่วงสัปดาห์" เพราะตอนทำข้อเสนอ
   * ยังไม่รู้ว่าลูกค้าจะเริ่มวันไหน · PM เลือกวันเริ่มตอนรับงาน ระบบแปลงสัปดาห์เป็นวันที่จริงให้
   * ไม่มีแผน = ใช้แม่แบบเฟสมาตรฐานเหมือนเดิม
   */
  plan?: ProposalPlanPhase[];
};

export type ProposalPlanPhase = {
  name: string;
  /** รหัสตำแหน่งในทีม (TeamRole ของโมดูลโปรเจค) — เก็บเป็นสตริงเพื่อไม่ผูกสองโมดูลเข้าด้วยกัน */
  role: string;
  /** สัปดาห์ที่เริ่มและจบ นับจากสัปดาห์ที่ 1 ของโครงการ */
  fromWeek: number;
  toWeek: number;
  tasks: string[];
};

export type PresalesRound = {
  id: string;
  requestNo: string;
  round: number;
  at: string;
  by: string;
  hours: number;
  note: string;
  file: string;
  /** ข้อเสนอส่งกลับได้สองแบบ — ไฟล์ PDF (ค่าตั้งต้น) หรือลิงก์ Canva */
  kind?: "pdf" | "canva";
  /** ลิงก์ Canva — ใช้เมื่อ kind = canva */
  url?: string;
  /** ไฟล์และลิงก์ทั้งหมดที่แนบในรอบนี้ (ต้นแบบ presales-work.html files) — file/url ข้างบนคือรายการแรก · รอบเก่าไม่มี */
  files?: { name: string; url?: string }[];
};

/** สถานะที่ยังไม่จบ ถ้าเลยกำหนดถือว่าค้าง */
export const PRESALES_OPEN: PresalesStatus[] = ["รอรับงาน", "กำลังทำ", "รอข้อมูลเพิ่ม"];

export const PRESALES_REQUESTS: PresalesRequest[] = [
  /* ต้นแบบ dose-erp-maz/presales.html (9 คำขอ) · ไฟล์ของลูกค้าตาม CUSFILES */
  { id: "PS1", no: "PS-2569-0031", customerCode: "CUS-6908-021", kind: "SA", problem: "ต้องการระบบจัดการสต๊อกวัตถุดิบเชื่อมกับบัญชีเดิม", assignee: "ปิยะวัฒน์ (SA)", due: "2026-09-04", urgency: "ด่วน", urgentReason: "", budget: 300000, attachments: ["TOR-siamplastic.pdf", "หน้าจอระบบคลังเดิม.png"], status: "ส่งกลับแล้ว", createdAt: "2026-08-22", hours: 14.5 },
  { id: "PS2", no: "PS-2569-0030", customerCode: "LEAD-6908-030", kind: "SA", problem: "ระบบติดตามรถขนส่ง ยังไม่สรุปจำนวนคันที่ใช้จริง", assignee: "ปิยะวัฒน์ (SA)", due: "2026-09-08", urgency: "ปกติ", urgentReason: "", budget: 150000, attachments: [], status: "รอข้อมูลเพิ่ม", createdAt: "2026-08-20", hours: 6 },
  { id: "PS3", no: "PS-2569-0029", customerCode: "LEAD-6909-002", kind: "SA", problem: "ระบบติดตามความคืบหน้าหน้างานพร้อมถ่ายรูปแนบ", assignee: "ปิยะวัฒน์ (SA)", due: "2026-09-12", urgency: "ปกติ", urgentReason: "", budget: 200000, attachments: [], status: "รอรับงาน", createdAt: "2026-09-05", hours: 0 },
  { id: "PS4", no: "PS-2569-0028", customerCode: "LEAD-6909-003", kind: "BD", problem: "ขอข้อเสนอระบบจัดการออเดอร์ผลผลิต พร้อมเดโม", assignee: "ธนดล (BD)", due: "2026-09-11", urgency: "ด่วน", urgentReason: "", budget: 0, attachments: [], status: "กำลังทำ", createdAt: "2026-09-04", hours: 3.5 },
  { id: "PS5", no: "PS-2569-0026", customerCode: "CUS-6908-027", kind: "SA", problem: "ต่อยอดระบบเดิม เพิ่มโมดูลรายงานผู้บริหาร", assignee: "ปิยะวัฒน์ (SA)", due: "2026-08-26", urgency: "ปกติ", urgentReason: "", budget: 180000, attachments: ["ตัวอย่างรายงานที่ผู้บริหารใช้.xlsx"], status: "ส่งกลับแล้ว", createdAt: "2026-08-18", hours: 9 },
  { id: "PS6", no: "PS-2569-0024", customerCode: "LEAD-6909-001", kind: "BD", problem: "ทำเว็บไซต์บริษัทพร้อมระบบจัดการเนื้อหา", assignee: "ธนดล (BD)", due: "2026-09-09", urgency: "ด่วนมาก", urgentReason: "ลูกค้าต้องใช้ยื่นประมูลวันที่ 15", budget: 150000, attachments: [], status: "กำลังทำ", createdAt: "2026-09-02", hours: 5 },
  { id: "PS7", no: "PS-2569-0021", customerCode: "LEAD-6907-018", kind: "BD", problem: "ระบบนัดหมายคนไข้ ลูกค้าเงียบหลังส่งข้อเสนอ", assignee: "ธนดล (BD)", due: "2026-08-01", urgency: "ปกติ", urgentReason: "", budget: 60000, attachments: [], status: "ปิดคำขอ", createdAt: "2026-07-10", hours: 7.5 },
  { id: "PS8", no: "PS-2569-0019", customerCode: "CUS-6905-007", kind: "SA", problem: "ระบบจัดการคลังสินค้า ปิดการขายแล้ว", assignee: "ปิยะวัฒน์ (SA)", due: "2026-08-12", urgency: "ด่วน", urgentReason: "", budget: 40000, attachments: ["https://example.com"], status: "ปิดคำขอ", createdAt: "2026-07-26", hours: 18 },
  { id: "PS9", no: "PS-2569-0017", customerCode: "LEAD-6908-002", kind: "BD", problem: "เพจและระบบจองห้องพัก ลูกค้าขอเวลาปรึกษาหุ้นส่วน", assignee: "ธนดล (BD)", due: "2026-08-20", urgency: "ปกติ", urgentReason: "", budget: 80000, attachments: [], status: "รอข้อมูลเพิ่ม", createdAt: "2026-07-30", hours: 4 },
];

export const PRESALES_ROUNDS: PresalesRound[] = [
  /* ต้นแบบ presales.html ROUNDS */
  { id: "PR1", requestNo: "PS-2569-0031", round: 2, at: "2026-09-02", by: "ปิยะวัฒน์ (SA)", hours: 6, note: "ปรับขอบเขตตามที่ลูกค้าขอตัดโมดูลรายงาน", file: "proposal-siamplastic-r2.pdf" },
  { id: "PR2", requestNo: "PS-2569-0031", round: 1, at: "2026-08-24", by: "ปิยะวัฒน์ (SA)", hours: 8.5, note: "ข้อเสนอรอบแรก ครอบคลุมทั้ง 3 โมดูล", file: "proposal-siamplastic-r1.pdf" },
  { id: "PR6", requestNo: "PS-2569-0026", round: 1, at: "2026-08-25", by: "ปิยะวัฒน์ (SA)", hours: 9, note: "ข้อเสนอโมดูลรายงานผู้บริหาร ทำเป็นสไลด์นำเสนอ", file: "ข้อเสนอ พูลผลอะไหล่ (Canva)", kind: "canva", url: "https://www.canva.com/design/DAGxxxxxxx/view" },
  { id: "PR3", requestNo: "PS-2569-0019", round: 3, at: "2026-08-10", by: "ปิยะวัฒน์ (SA)", hours: 4, note: "ปรับราคาสุดท้ายก่อนปิดการขาย", file: "proposal-mtech-r3.pdf" },
  { id: "PR4", requestNo: "PS-2569-0019", round: 2, at: "2026-08-04", by: "ปิยะวัฒน์ (SA)", hours: 7, note: "เพิ่มการอบรมและคู่มือตามที่ลูกค้าขอ", file: "ข้อเสนอ เอ็มเทค รอบ 2 (Canva)", kind: "canva", url: "https://www.canva.com/design/DAGyyyyyyy/view" },
  { id: "PR5", requestNo: "PS-2569-0019", round: 1, at: "2026-07-28", by: "ปิยะวัฒน์ (SA)", hours: 7, note: "ข้อเสนอรอบแรก", file: "proposal-mtech-r1.pdf" },
  /* คลินิกใสใสกับบ้านสวนพฤกษาใน ROUNDS ของต้นแบบ — เพิ่ม 22 ก.ย. 2569 (crm-store เติมให้เครื่องที่เก็บข้อมูลไว้ก่อน) */
  { id: "PR7", requestNo: "PS-2569-0021", round: 2, at: "2026-07-28", by: "ธนดล (BD)", hours: 4, note: "ปรับแผนการตลาดตามงบที่ลูกค้าแจ้ง", file: "proposal-clinic-r2.pdf" },
  { id: "PR8", requestNo: "PS-2569-0021", round: 1, at: "2026-07-20", by: "ธนดล (BD)", hours: 6, note: "แผนการตลาดออนไลน์ 3 เดือนแรก", file: "proposal-clinic-r1.pdf" },
  { id: "PR9", requestNo: "PS-2569-0017", round: 1, at: "2026-08-15", by: "ธนดล (BD)", hours: 5, note: "ข้อเสนอเพจและระบบจองห้องพัก รอลูกค้าปรึกษาหุ้นส่วน", file: "ลิงก์ Canva", kind: "canva", url: "https://www.canva.com/design/bansuan" },
];

// ═══ ใบเสนอราคา ═══════════════════════════════════════════════
export type QuotationStatus = "ร่าง" | "ส่งแล้ว" | "ตอบรับ" | "ปฏิเสธ" | "หมดอายุ";

export const QUOTATION_STATUS: Record<QuotationStatus, string> = {
  ร่าง: "t-miss",
  ส่งแล้ว: "t-info",
  ตอบรับ: "t-ok",
  ปฏิเสธ: "t-late",
  หมดอายุ: "t-early",
};

/** รหัสผู้ออกเอกสาร — ผู้ดูแลระบบเพิ่มได้ที่ /admin/company */
export type IssuerCode = string;

/** ผู้ออกเอกสารทั้งหมด — อ่านจากการตั้งค่าทุกครั้ง */
export function issuers() {
  return settings().issuers;
}

/** ผู้ออกเอกสารตามรหัส — ไม่เจอ (ถูกลบไปแล้ว) ใช้รายแรกแทน เอกสารเก่าจะได้เปิดได้ */
export function issuerOf(code: IssuerCode) {
  const all = issuers();
  return all.find((i) => i.code === code) ?? all[0];
}

/* อัตราภาษี — ผู้ดูแลระบบแก้ได้ที่ /admin/rates อ่านใหม่ทุกครั้ง */
export const vatRate = () => settings().rates.vat;
export const whtRate = () => settings().rates.wht;
/** ใบเสนอราคาเหลือไม่เกินกี่วันถือว่าใกล้หมดอายุ */
export const EXPIRING_DAYS = 7;

export type Quotation = {
  id: string;
  /** เลขที่เอกสาร — ออกทันทีตอนสร้างใบ (ไม่มีร่างแล้ว · 5 ต.ค. 2569) */
  no: string;
  customerCode: string;
  issuer: IssuerCode;
  /** ประเภทผู้ซื้อของฉบับนี้ — ตั้งต้นจากลูกค้า แต่แก้ได้ */
  buyer: BuyerType;
  /** ประเภทบริการ — ส่งต่อไปถึงงานเข้าใหม่ของ PM (ใบเก่าที่ยังไม่มีช่องนี้ถือเป็น "ระบบ") */
  service?: ServiceKey;
  issued: string;
  validDays: number;
  validUntil: string;
  /** ยอดก่อนหักส่วนลด */
  amount: number;
  discount: number;
  /** ลูกค้าหักภาษี ณ ที่จ่ายจากใบนี้หรือไม่ */
  wht: boolean;
  /**
   * อัตราหัก ณ ที่จ่ายของใบนี้ — งานคนละประเภทคนละอัตรา (รับจ้างทำของ 3% · โฆษณา 2% · ขนส่ง 1% · ค่าเช่า 5%)
   * ว่าง = ใบเก่าที่ออกก่อนมีช่องนี้ ใช้อัตรามาตรฐานตอนนั้น (whtRate())
   */
  whtPct?: number;
  /** รายละเอียดงานเป็น HTML เล็ก ๆ (วางจาก Word ได้) · <hr> = ขึ้นหน้าใหม่ตอนพิมพ์ */
  body: string;
  terms: string;
  status: QuotationStatus;
  revision: number;
  createdAt: string;
  /** วันที่ส่งให้ลูกค้าจริง ("บันทึกว่าส่งแล้ว") — วันยืนราคาเริ่มนับจากวันนี้ · ว่าง = ออกเลขแล้วแต่ยังไม่ได้ส่ง */
  sentAt?: string;
  /** อ้างอิงคำขอก่อนการขาย (PS-…) */
  ps?: string;
  /** ออกแทนใบเดิม — ลูกค้าไม่ตกลงแล้วออกใบใหม่เลขใหม่ ใบเดิมแก้ไม่ได้ */
  replaces?: string;
  /** ใบนี้ถูกออกใบใหม่แทนแล้ว */
  replacedBy?: string;
  rejectedAt?: string;
  rejectReason?: string;
};

/** สถานะที่ยังกลับมาแก้ใบเสนอราคาแล้วเสนอใหม่ได้ */
export const REVISABLE: QuotationStatus[] = ["ส่งแล้ว", "ปฏิเสธ", "หมดอายุ"];

export type QuotationRevision = {
  id: string;
  quotationId: string;
  revision: number;
  at: string;
  what: string;
  total: number;
  /** สำเนาของฉบับนั้นตอนถูกแทนที่ — ใช้เปิด "ดูฉบับนี้" · ฉบับปัจจุบันและข้อมูลตั้งต้นไม่มี */
  snapshot?: Quotation;
};

/** อัตราที่ให้เลือกได้ตอนออกใบเสนอราคา — ตรงกับประเภทเงินได้ที่หักกันจริง */
export const WHT_PCTS = [1, 2, 3, 5];

/**
 * อัตราหัก ณ ที่จ่ายที่ใช้จริงกับใบเสนอราคาฉบับหนึ่ง — 0 = ไม่หัก
 *
 * บุคคลธรรมดาที่ซื้อของไม่มีหน้าที่หักภาษี ณ ที่จ่าย ต่อให้ติ๊กช่องไว้ก็ไม่หัก
 * ไม่ได้ระบุอัตราไว้ (ใบเก่า) ใช้อัตรามาตรฐาน · ที่เหลือห้ามเดาเอง
 */
export function whtPctOf(q: Pick<Quotation, "wht" | "whtPct" | "buyer">) {
  if (!q.wht || q.buyer === "individual") return 0;
  const pct = q.whtPct ?? whtRate();
  return pct > 0 ? pct : 0;
}

/**
 * คิดยอดทั้งใบจากตัวเลขดิบ — ที่เดียวเท่านั้น หน้าอื่นห้ามคิดเอง
 * รับได้ทั้งใบที่บันทึกแล้วและค่าที่กำลังกรอกอยู่ในฟอร์ม ตัวเลขจะได้ตรงกันทุกจอ
 */
export function quotationTotals(
  q: Pick<Quotation, "amount" | "discount" | "issuer" | "wht" | "whtPct" | "buyer">,
) {
  const gross = round2(q.amount);
  const discount = Math.min(round2(q.discount), gross);
  const base = round2(gross - discount);
  const rate = issuerOf(q.issuer).vat ? vatRate() : 0;
  const vat = round2((base * rate) / 100);
  const whtPct = whtPctOf(q);
  const whtAmount = round2((base * whtPct) / 100);
  return {
    gross, discount, base, vatRate: rate, vat, whtPct, whtAmount,
    /**
     * ยอดที่ลูกค้าโอนจริง = ฐาน + VAT − หัก ณ ที่จ่าย — และเป็นยอดดีลเมื่อปิดการขาย
     *
     * ที่ไหนก็ตามที่แสดง "ยอด" เพียงตัวเดียว (ตารางใบเสนอราคา ยอดรวมท้ายตาราง กล่องยืนยัน
     * การแจ้งเตือน แดชบอร์ด) ต้องใช้ยอดนี้เท่านั้น จะได้ไม่เห็นเลขหนึ่งแล้วได้อีกเลขหนึ่ง
     * อยากเห็นยอดก่อนหักให้ดูในเอกสารที่แยกบรรทัดครบ (quotation-paper / acc-doc)
     *
     * เดิมมีอีกช่อง total = ฐาน + VAT ไว้ให้ตารางรายการโดยเฉพาะ — เอาออกแล้ว
     * เพราะทำให้ตารางขึ้น 321,000 แต่เอกสารกับดีลขึ้น 312,000
     */
    grand: round2(base + vat - whtAmount),
  };
}

/**
 * วันที่ใบเสนอราคามีผลถึง — นับจากวันที่ส่งให้ลูกค้าจริง ไม่ใช่วันที่ออกเอกสาร (ต้นแบบ quotations.html validOf)
 * ยังไม่ได้ส่ง (ไม่มี sentAt) ใช้วันที่คิดไว้ตอนออกเลข
 */
export function quotationValidUntil(q: Quotation) {
  return q.sentAt ? addDays(q.sentAt, q.validDays) : q.validUntil;
}

/**
 * สถานะของใบเสนอราคาที่อนุมานจากข้อมูล — ใบเสนอราคาไม่มีช่องสถานะให้กดเปลี่ยน (ต้นแบบ quotations.html)
 * ใช้ขึ้นป้ายในหน้าที่สรุปรายการสั้น ๆ เช่นการ์ดใบเสนอราคาในหน้าผู้สนใจ
 */
export function quotationStateOf(q: Quotation, hasDeal: boolean, today: string): { label: string; cls: string } {
  if (q.status === "ร่าง") return { label: "ร่าง", cls: "t-miss" };
  if (hasDeal) return { label: "ส่งไปวางบิลแล้ว", cls: "t-ok" };
  if (q.rejectedAt) return { label: "ลูกค้าปฏิเสธ", cls: "t-late" };
  if (q.replacedBy) return { label: "ออกใบใหม่แทนแล้ว", cls: "t-job" };
  /* ไม่มีขั้น "บันทึกว่าส่งแล้ว" (ผู้ใช้สั่ง 5 ต.ค. 2569) — ออกเลขแล้ว = รอดำเนินการ จนกว่าจะปฏิเสธหรือส่งไปวางบิล */
  return quotationValidUntil(q) < today
    ? { label: "หมดอายุ", cls: "t-early" }
    : { label: "รอดำเนินการ", cls: "t-info" };
}

/**
 * ปฏิเสธได้ไหม — ใบที่ยังไม่ได้ตัดสิน: ออกเลขแล้ว ไม่มีดีล ไม่ถูกแทน ยังไม่ปฏิเสธ (หมดอายุแล้วก็ปฏิเสธได้)
 * ใบแบบนี้ต้องปฏิเสธก่อน ถึงออกใบใหม่ให้ลูกค้ารายเดียวกันได้ (ผู้ใช้สั่ง 5 ต.ค. 2569)
 */
export function canRejectQuotation(q: Quotation, hasDeal: boolean) {
  return q.status !== "ร่าง" && Boolean(q.no) && !hasDeal && !q.replacedBy && !q.rejectedAt;
}

/**
 * ส่งไปวางบิลได้ไหม = หลักฐานว่าลูกค้าตกลง (ต้นแบบ quotations.html canSend)
 * ต้องออกเลขแล้ว ยังไม่มีดีล ยังไม่ถูกออกใบใหม่แทน ลูกค้ายังไม่ปฏิเสธ และยังไม่เลยวันที่มีผล
 * ไม่ต้องบันทึกว่าส่งแล้วก่อน — ขั้นนั้นเอาออกแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569)
 */
export function canBillQuotation(q: Quotation, hasDeal: boolean, today: string) {
  return (
    q.status !== "ร่าง" && Boolean(q.no) && !hasDeal &&
    !q.replacedBy && !q.rejectedAt && quotationValidUntil(q) >= today
  );
}

export const QUOTATIONS: Quotation[] = [
  /* ต้นแบบ dose-erp-maz/quotations.html — ลูกค้าไม่ตกลงให้ออกใบใหม่เลขใหม่ (replaces / replacedBy)
     ร่าง 2 ใบของต้นแบบ (Q1 Q2) เอาออกแล้ว — ผู้ใช้สั่ง 5 ต.ค. 2569: ไม่มีร่าง ออกแล้วแก้ไม่ได้ ต้องออกใบใหม่ */
  { id: "Q3", no: "MAZ-2569-0042", customerCode: "CUS-6908-021", issuer: "MAZ", buyer: "juristic", service: "website", issued: "2026-08-28", validDays: 30, validUntil: "2026-09-27", amount: 320000, discount: 0, wht: false, body: "<p>เว็บไซต์บริษัท ระบบสต๊อกวัตถุดิบ เชื่อมบัญชีเดิม และอบรม</p><ul><li>เว็บไซต์บริษัท</li><li>ระบบจัดการสต๊อกวัตถุดิบ</li><li>เชื่อมต่อข้อมูลกับระบบบัญชีเดิม</li><li>อบรมการใช้งานและคู่มือ</li></ul>", terms: "มัดจำ 50% ก่อนเริ่มงาน", status: "ตอบรับ", revision: 1, createdAt: "2026-08-28", sentAt: "2026-08-28", ps: "PS-2569-0031" },
  { id: "Q4", no: "MAZ-2569-0041", customerCode: "LEAD-6908-030", issuer: "MAZ", buyer: "juristic", service: "dataviz", issued: "2026-08-30", validDays: 10, validUntil: "2026-09-09", amount: 128000, discount: 0, wht: true, whtPct: 3, body: "<p>แดชบอร์ดติดตามรถขนส่ง</p><ul><li>ติดตามตำแหน่งแบบเรียลไทม์</li><li>รายงานระยะทางรายคัน</li><li>ติดตั้งหน้างาน 1 ครั้ง</li></ul>", terms: "ชำระเต็มจำนวนเมื่อส่งมอบ", status: "ส่งแล้ว", revision: 1, createdAt: "2026-08-30", sentAt: "2026-08-30", ps: "PS-2569-0030", replaces: "MAZ-2569-0035" },
  { id: "Q5", no: "MAZ-2569-0040", customerCode: "CUS-6908-027", issuer: "MAZ", buyer: "juristic", service: "dm", issued: "2026-08-27", validDays: 30, validUntil: "2026-09-26", amount: 175000, discount: 0, wht: false, body: "<p>ต่อยอดระบบเดิม เพิ่มโมดูลรายงานผู้บริหาร</p><ul><li>วางแผนแคมเปญ</li><li>แดชบอร์ดสรุปยอดขาย</li><li>รายงานผู้บริหารรายเดือน</li><li>ส่งออกไฟล์ Excel</li><li>อบรมผู้ใช้</li></ul>", terms: "มัดจำ 30% ก่อนเริ่มงาน", status: "ตอบรับ", revision: 1, createdAt: "2026-08-27", sentAt: "2026-08-27", ps: "PS-2569-0026" },
  { id: "Q6", no: "MAZ-2569-0038", customerCode: "CUS-6905-007", issuer: "MAZ", buyer: "juristic", service: "website", issued: "2026-08-14", validDays: 30, validUntil: "2026-09-13", amount: 39000, discount: 0, wht: true, whtPct: 3, body: "<p>เว็บไซต์บริษัทและระบบฟอร์มติดต่อ</p><ul><li>เว็บไซต์บริษัท 5 หน้า</li><li>ระบบฟอร์มติดต่อและอีเมลแจ้งเตือน</li></ul>", terms: "มัดจำ 50% ก่อนเริ่มงาน", status: "ตอบรับ", revision: 1, createdAt: "2026-08-14", sentAt: "2026-08-14", ps: "PS-2569-0019" },
  { id: "Q7", no: "MAZ-2569-0036", customerCode: "CUS-6906-004", issuer: "IND", buyer: "individual", service: "website", issued: "2026-08-10", validDays: 30, validUntil: "2026-09-09", amount: 26000, discount: 0, wht: false, body: "<p>เว็บไซต์ร้านอาหาร 5 หน้า พร้อมระบบเมนูออนไลน์</p>", terms: "ชำระเต็มจำนวนก่อนเริ่มงาน", status: "ตอบรับ", revision: 1, createdAt: "2026-08-10", sentAt: "2026-08-10" },
  { id: "Q8", no: "MAZ-2569-0035", customerCode: "LEAD-6908-030", issuer: "MAZ", buyer: "juristic", service: "dataviz", issued: "2026-08-22", validDays: 30, validUntil: "2026-09-21", amount: 110280.37, discount: 0, wht: true, whtPct: 3, body: "<p>แดชบอร์ดติดตามรถขนส่ง</p><ul><li>ติดตามตำแหน่งแบบเรียลไทม์</li><li>รายงานระยะทางรายคัน</li><li>แจ้งเตือนรถออกนอกเส้นทาง</li></ul>", terms: "ชำระเต็มจำนวนเมื่อส่งมอบ", status: "หมดอายุ", revision: 1, createdAt: "2026-08-22", sentAt: "2026-08-22", ps: "PS-2569-0030", replacedBy: "MAZ-2569-0041" },
  { id: "Q9", no: "MAZ-2569-0034", customerCode: "LEAD-6908-008", issuer: "MAZ", buyer: "individual", service: "seo", issued: "2026-07-28", validDays: 30, validUntil: "2026-08-27", amount: 41000, discount: 0, wht: false, body: "<p>SEO เว็บไซต์ร้านเบเกอรี่</p><ul><li>ปรับเว็บไซต์ให้ค้นหาเจอ</li><li>ดูแลบทความ 3 เดือน</li></ul>", terms: "มัดจำ 50% ก่อนเริ่มงาน", status: "หมดอายุ", revision: 1, createdAt: "2026-07-28", sentAt: "2026-07-28" },
  { id: "Q10", no: "MAZ-2569-0031", customerCode: "LEAD-6907-018", issuer: "MAZ", buyer: "individual", service: "branding", issued: "2026-07-16", validDays: 30, validUntil: "2026-08-15", amount: 48000, discount: 0, wht: false, body: "<p>ออกแบบแบรนด์คลินิก</p><ul><li>โลโก้และชุดสี</li><li>ป้ายหน้าร้าน</li><li>สื่อออนไลน์ชุดแรก</li></ul>", terms: "มัดจำ 50% ก่อนเริ่มงาน", status: "ปฏิเสธ", revision: 1, createdAt: "2026-07-16", sentAt: "2026-07-16", rejectedAt: "2026-08-12", rejectReason: "เลือกผู้เสนอรายอื่นที่ราคาถูกกว่า" },
  { id: "Q11", no: "MAZ-2569-0029", customerCode: "CUS-6906-019", issuer: "MAZ", buyer: "individual", service: "complan", issued: "2026-07-02", validDays: 30, validUntil: "2026-08-01", amount: 95000, discount: 0, wht: false, body: "<p>แผนการสื่อสาร ระบบจัดการงานซ่อม</p><ul><li>วิเคราะห์กลุ่มลูกค้า</li><li>วางแผนสื่อ 6 เดือน</li><li>ผลิตสื่อชุดแรก</li><li>สรุปผลรายเดือน</li></ul>", terms: "มัดจำ 40% ก่อนเริ่มงาน", status: "ตอบรับ", revision: 1, createdAt: "2026-07-02", sentAt: "2026-07-02" },
  { id: "Q12", no: "B1-2569-0007", customerCode: "LEAD-6908-014", issuer: "B1", buyer: "juristic", service: "website", issued: "2026-08-20", validDays: 30, validUntil: "2026-09-19", amount: 85000, discount: 0, wht: true, whtPct: 3, body: "<p>เว็บไซต์องค์กร อัลฟ่าคอร์ป</p><ul><li>เว็บไซต์ 6 หน้า</li><li>ระบบข่าวสาร</li></ul>", terms: "ชำระ 30 วันหลังส่งมอบ", status: "ส่งแล้ว", revision: 1, createdAt: "2026-08-20" },
];

export const QUOTATION_REVISIONS: QuotationRevision[] = [];

// ═══ ดีลและใบงาน ═══════════════════════════════════════════════
export type DealStatus = "ปิดการขาย" | "ไม่ตกลง" | "ยกเลิก";

export const DEAL_STATUS: Record<DealStatus, string> = {
  ปิดการขาย: "t-ok",
  ไม่ตกลง: "t-late",
  ยกเลิก: "t-miss",
};

export type JobStatus = "สร้างแล้ว" | "มอบหมาย" | "กำลังทำ" | "ส่งมอบ";

export const JOB_STATUS: Record<JobStatus, string> = {
  สร้างแล้ว: "t-miss",
  มอบหมาย: "t-info",
  กำลังทำ: "t-job",
  ส่งมอบ: "t-ok",
};

/** การยกเลิกดีลหลังปิดการขาย — ใคร เมื่อไร เพราะอะไร (บังคับเหตุผลเสมอ) */
export type DealCancel = { at: string; by: string; why: string };

/**
 * สัญญาที่แนบกับดีล (ต้นแบบ ceo-deals.html) — ฝ่ายขายเป็นคนแนบ แนบเพิ่มได้ตลอด ลบไม่ได้
 * ขอบเขตงานยึดตามใบเสนอราคาเสมอ สัญญาเก็บไว้เป็นหลักฐานและส่งต่อให้ PM
 * ⚠️ ยังไม่มีตาราง deal_attachment ใน ERD (kind, file/url, contract_no, signed_at, uploaded_by)
 */
export type DealContract = {
  /** เลขที่สัญญาของคู่สัญญา — ไม่บังคับ */
  no: string;
  /** วันที่เซ็น yyyy-mm-dd — ไม่บังคับ */
  signed: string;
  kind: "pdf" | "link";
  /** ชื่อไฟล์ หรือลิงก์ */
  name: string;
  url: string;
  /** ชื่อคนแนบ */
  by: string;
  /** วันที่แนบ yyyy-mm-dd */
  at: string;
};

export type Deal = {
  id: string;
  no: string;
  customerCode: string;
  quotationNo: string;
  total: number;
  status: DealStatus;
  poRef: string;
  start: string;
  delivery: string;
  scope: string;
  closedAt: string;
  /** เหตุผลที่ไม่ปิดจบหรือยกเลิก */
  lostReason: string;
  /** ยกเลิกหลังปิดการขาย — เหตุผลเก็บที่ lostReason ด้วยเพื่อให้หน้าเดิมแสดงได้ */
  cancelled?: DealCancel;
  /** ผู้ขายที่ปิดดีลนี้ (ชื่อ ตามผู้ดูแลลูกค้าตอนปิดการขาย) — ฐานค่าคอมมิชชั่นของฝ่ายขาย · ดีลเก่าไม่มี ใช้ผู้ดูแลลูกค้าแทน */
  seller?: string;
  /** สัญญาที่ฝ่ายขายแนบไว้ — ไม่มีก็ได้ */
  contracts?: DealContract[];
};

export type JobOrder = {
  id: string;
  dealNo: string;
  no: string;
  owner: string;
  item: string;
  due: string;
  status: JobStatus;
};

/** สัญญาตัวอย่างตามต้นแบบ ceo-deals.html */
export const SEED_CONTRACTS: Record<string, DealContract[]> = {
  "DL-2569-0018": [
    { no: "CT-2569-0004", signed: "2026-08-26", kind: "pdf", name: "contract-mtech.pdf", url: "", by: "ชนัญชิดา ใจดี", at: "2026-08-26" },
    { no: "CT-2569-0004 (แก้ไขครั้งที่ 1)", signed: "2026-09-02", kind: "pdf", name: "contract-mtech-r1.pdf", url: "", by: "ชนัญชิดา ใจดี", at: "2026-09-02" },
  ],
};

export const DEALS: Deal[] = [
  /* ต้นแบบ dose-erp-maz/deals.html (5 ดีล) — ยอดดีล = ยอดใบเสนอราคาหลังหัก ณ ที่จ่าย */
  { id: "D1", no: "DL-2569-0018", customerCode: "CUS-6905-007", quotationNo: "MAZ-2569-0038", total: 40560, status: "ปิดการขาย", poRef: "", start: "2026-09-01", delivery: "2026-10-15", scope: "เว็บไซต์บริษัทและระบบฟอร์มติดต่อ", closedAt: "2026-08-25", lostReason: "", seller: "ชนัญชิดา ใจดี", contracts: SEED_CONTRACTS["DL-2569-0018"] },
  { id: "D2", no: "DL-2569-0017", customerCode: "CUS-6906-004", quotationNo: "MAZ-2569-0036", total: 26000, status: "ยกเลิก", cancelled: { at: "2026-09-06", by: "ฝ่ายบัญชี", why: "ลูกค้ายุติโครงการหลังชำระงวดแรก" }, poRef: "", start: "2026-08-25", delivery: "2026-09-30", scope: "เว็บไซต์ร้านอาหาร 5 หน้า พร้อมระบบเมนูออนไลน์", closedAt: "2026-08-21", lostReason: "ลูกค้ายุติโครงการหลังชำระงวดแรก", seller: "ชนัญชิดา ใจดี" },
  { id: "D5", no: "DL-2569-0011", customerCode: "CUS-6906-019", quotationNo: "MAZ-2569-0029", total: 101650, status: "ยกเลิก", cancelled: { at: "2026-08-18", by: "ชนัญชิดา ใจดี", why: "ลูกค้าชะลอโครงการ ขอยกเลิกก่อนเริ่มงาน" }, poRef: "", start: "2026-08-10", delivery: "2026-09-20", scope: "ระบบจัดการงานซ่อม", closedAt: "2026-08-18", lostReason: "ลูกค้าชะลอโครงการ ขอยกเลิกก่อนเริ่มงาน", seller: "ชนัญชิดา ใจดี" },
  { id: "D3", no: "DL-2569-0009", customerCode: "CUS-6908-021", quotationNo: "MAZ-2569-0042", total: 342400, status: "ปิดการขาย", poRef: "", start: "2026-09-15", delivery: "2026-12-20", scope: "เว็บไซต์บริษัท ระบบสต๊อกวัตถุดิบ เชื่อมบัญชีเดิม และอบรม", closedAt: "2026-09-02", lostReason: "", seller: "ชนัญชิดา ใจดี" },
  { id: "D4", no: "DL-2569-0007", customerCode: "CUS-6908-027", quotationNo: "MAZ-2569-0040", total: 187250, status: "ปิดการขาย", poRef: "", start: "2026-09-08", delivery: "2026-11-10", scope: "ต่อยอดระบบเดิม เพิ่มโมดูลรายงานผู้บริหาร", closedAt: "2026-08-30", lostReason: "", seller: "ชนัญชิดา ใจดี" },
];

export const JOB_ORDERS: JobOrder[] = [
  /* ต้นแบบ deals.html JOBS */
  { id: "J1", dealNo: "DL-2569-0018", no: "JO-2569-0031", owner: "ชนิกานต์ (PM)", item: "ระบบจัดการคลังสินค้า", due: "2026-10-10", status: "กำลังทำ" },
  { id: "J2", dealNo: "DL-2569-0018", no: "JO-2569-0032", owner: "ชนิกานต์ (PM)", item: "อบรมการใช้งานและคู่มือ", due: "2026-10-15", status: "สร้างแล้ว" },
  { id: "J3", dealNo: "DL-2569-0009", no: "JO-2569-0034", owner: "ชนิกานต์ (PM)", item: "ออกแบบและพัฒนาเว็บไซต์บริษัท", due: "2026-11-05", status: "มอบหมาย" },
  { id: "J4", dealNo: "DL-2569-0009", no: "JO-2569-0035", owner: "ชนิกานต์ (PM)", item: "ระบบจัดการสต๊อกวัตถุดิบ", due: "2026-12-01", status: "สร้างแล้ว" },
  { id: "J5", dealNo: "DL-2569-0009", no: "JO-2569-0036", owner: "ชนิกานต์ (PM)", item: "เชื่อมต่อข้อมูลกับระบบบัญชีเดิม", due: "2026-12-10", status: "สร้างแล้ว" },
  { id: "J6", dealNo: "DL-2569-0009", no: "JO-2569-0037", owner: "ชนิกานต์ (PM)", item: "อบรมการใช้งานและคู่มือ", due: "2026-12-18", status: "สร้างแล้ว" },
  { id: "J7", dealNo: "DL-2569-0017", no: "JO-2569-0029", owner: "ชนิกานต์ (PM)", item: "เว็บไซต์ร้านอาหาร 5 หน้า", due: "2026-09-28", status: "ส่งมอบ" },
];
