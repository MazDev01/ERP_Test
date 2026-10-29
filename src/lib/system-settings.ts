/*
 * การตั้งค่าระบบ — ค่าที่ผู้ดูแลระบบปรับได้และมีผลกับทุกบทบาท (หน้า /admin/*)
 *
 *   schedule  เวลาทำงาน          holidays  วันหยุดบริษัท      leave  สิทธิ์วันลา
 *   company   ข้อมูลบริษัท        rates     อัตราและภาษี        docs   ตัวนำหน้าเลขที่เอกสาร
 *
 * โมดูลอื่นอ่านผ่าน settings() เสมอ ห้ามคัดลอกค่าไปเก็บเป็นค่าคงที่ของตัวเอง
 * ไฟล์นี้ต้องไม่ import โมดูลที่อ่านการตั้งค่า (work-schedule, holidays, crm-data ฯลฯ) ไม่งั้นจะวนกัน
 *
 * ── ทำไมมี "live" ──
 * หน้าต่าง ๆ เรนเดอร์บนเซิร์ฟเวอร์ด้วยค่าตั้งต้น ถ้าเบราว์เซอร์ใช้ค่าที่ผู้ดูแลแก้ไว้ตั้งแต่ตอน hydrate
 * ข้อความจะไม่ตรงกับฝั่งเซิร์ฟเวอร์ (เช่น "เริ่มงาน 09:00" กับ "08:30")
 * จึงคืนค่าตั้งต้นไว้ก่อน จนเปลือกแอปเรียก goLive() หลัง hydrate แล้วค่อยวาดหน้าใหม่ด้วยค่าจริง (ดู app-shell.tsx)
 *
 * ยังไม่มี backend — ค่าเก็บในเครื่องนี้เท่านั้น
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { todayIso } from "./format";

export type ScheduleSettings = {
  start: string;
  end: string;
  lateGraceMinutes: number;
  lunchStart: string;
  lunchEnd: string;
  otStart: string;
  /* ช่วงพักของโอทีวันหยุด (รวมวันแรงงาน) ไม่นับเป็นชั่วโมงโอที — พักเที่ยงกับพักเย็น (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  holLunchStart: string;
  holLunchEnd: string;
  holDinnerStart: string;
  holDinnerEnd: string;
  /** เลิกใช้แล้ว — ไม่มีการเตือนลืมตอกบัตรออก (ผู้ใช้สั่ง 16 ต.ค. 2569) ข้อมูลเก่าในเครื่องยังอ่านได้ */
  forgotPunchOutAfterHours?: number;
  /** วันที่ตัดรอบเงินเดือน — รอบถัดไปเริ่มวันรุ่งขึ้น (25 = 26 เดือนก่อน ถึง 25 เดือนนี้) */
  payCutDay: number;
};

/** note = คำอธิบายสั้นใต้ชื่อ (ใช้กับประเภทที่ผู้ดูแลระบบเพิ่มเอง) */
/** off = ปิดใช้งาน ไม่ขึ้นให้เลือกตอนยื่นลาใหม่ แต่ใบลาเก่ายังอ่านชื่อได้ (ต้นแบบ HR-12) */
export type LeaveQuota = { type: string; days: number; note?: string; off?: boolean };

export type CompanySettings = {
  name: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  /** เบอร์ Call Center ใต้ที่อยู่บนหัวเอกสาร (ต้นแบบ quotation-view / invoice-view / receipt-view) */
  callCenter: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  /**
   * เอกสารบริษัทที่แนบไว้ (หนังสือรับรอง ภ.พ.20 ฯลฯ)
   * ยังไม่มีที่เก็บไฟล์จริง — เก็บแค่ชื่อกับขนาดเหมือนกล่องแนบไฟล์หน้าอื่น (file-drop.tsx)
   */
  docs?: IssuerDoc[];
};

/*
 * เอกสารแนบใบเสนอราคาของผู้ออกเอกสาร (ต้นแบบ HR-18) — หนังสือรับรองบริษัท ภ.พ.20 ฯลฯ
 * title = ชื่อที่ลูกค้าเห็น · cat = ประเภทเอกสาร · expires = วันหมดอายุ (ว่าง = ไม่หมด)
 * attach = แนบไปกับใบเสนอราคาที่ออกหลังจากนี้โดยอัตโนมัติ · ยังไม่มีที่เก็บไฟล์จริง เก็บชื่อกับขนาดไว้ก่อน
 */
export type IssuerDoc = {
  id: string;
  name: string;
  size: number;
  title?: string;
  cat?: string;
  expires?: string;
  attach?: boolean;
  addedAt?: string;
  /*
   * รูปเอกสารแนบเก็บจริงในเครื่อง (ผู้ใช้สั่ง 15 ต.ค. 2569) — รับเฉพาะรูป JPG PNG WEBP
   * src = data URL ของรูปที่ย่อแล้ว (ด้านยาวไม่เกิน ~1600px · JPEG คุณภาพ ~0.8) · w/h = ขนาดหลังย่อ
   * ต่อท้ายใบเสนอราคาที่ออกในนามผู้ออกรายนี้ แผ่นละรูป พร้อมลายน้ำ (quotation-paper.tsx)
   * ไม่มี src = ไฟล์เดิมจากก่อนเปลี่ยน (เก็บแค่ชื่อ) — ไม่แสดงบนเอกสาร ผู้ดูแลลบทิ้งได้
   */
  src?: string;
  w?: number;
  h?: number;
};

/**
 * หักเงินมาสาย — ทุกนาที ไม่มีผ่อนผันและอนุโลม (ผู้ใช้กำหนด 18 ก.ย. 2569)
 *   off   ค่าเก่าจากก่อนมีกติกานี้ — อ่านเป็น wage (hr-data lateDeduction)
 *   wage  หักตามค่าจ้างของนาทีที่ไม่ได้ทำงาน (ค่าจ้างรายชั่วโมง ÷ 60 × นาที) — ตรงหลักไม่ทำงานไม่ได้ค่าจ้าง
 *   fixed หักอัตราคงที่บาทต่อนาที — ระวังขัดกฎหมายคุ้มครองแรงงานถ้าเกินค่าจ้างของเวลาที่ขาดไป
 */
export type LateMode = "off" | "wage" | "fixed";

export type RateSettings = {
  vat: number;
  wht: number;
  commission: number;
  otAfterWork: number;
  otHoliday: number;
  /** โอทีวันแรงงาน 1 พ.ค. เท่านั้น — วันหยุดราชการอื่นใช้ otHoliday (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  otPublic: number;
  /*
   * โอทีวันหยุดต้องยื่นล่วงหน้ากี่ "วันทำงาน" (เจ้าของแจ้ง 25 ก.ย. 2569)
   * เสาร์-อาทิตย์ต้องขอตั้งแต่วันศุกร์ = ล่วงหน้า 1 วันทำงาน
   * 0 = ไม่บังคับ ยื่นวันไหนก็ได้ · นับเฉพาะวันทำงาน ข้ามเสาร์-อาทิตย์และวันหยุดบริษัทให้เอง
   */
  otAheadDays: number;
  socialSecurity: number;
  lateMode: LateMode;
  /** บาทต่อนาที — ใช้เมื่อ lateMode = "fixed" */
  latePerMinute: number;
  /** นาทีที่อนุโลมต่อรอบเงินเดือน — สายรวมไม่เกินนี้ไม่หัก เกินหักเฉพาะส่วนที่เกิน */
  lateFreeMinutes: number;
  /** ระยะทดลองงาน (เดือน) — probation_months ใน ERD */
  probationMonths: number;
  /** จ่ายคืนค่าน้ำมันกิโลเมตรละกี่บาท (Full Proposal · M5 การคำนวณเงินเดือน) */
  fuelPerKm: number;
  /** จ่ายคืนค่าน้ำมันมอเตอร์ไซค์กิโลเมตรละกี่บาท — คนละอัตรากับรถยนต์ (ผู้ใช้สั่ง 29 ต.ค. 2569) */
  fuelMotoPerKm: number;
  /** ลาพักร้อนที่เหลือยกไปปีถัดไปได้สูงสุดกี่วัน — 0 = ไม่ยกยอด หมดสิ้นปี (ตั้งที่ /admin/leave) */
  vacationCarryMax: number;
  /** วันเริ่มรอบปีการลา "MM-DD" — รอบขึ้นใหม่เองทุกปีในวันนี้ (ตั้งที่ /admin/leave) */
  leaveYearStart: string;
};

export type DocPrefixes = {
  lead: string;
  presales: string;
  quotationMaz: string;
  quotationB1: string;
  deal: string;
  jobOrder: string;
  invoice: string;
  receipt: string;
  /** เลขที่โปรเจค PJ-<พ.ศ.>-xxxx — ออกตอนวางบิลงวดแรกได้รับชำระ งานเข้ากล่อง PM (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  project: string;
  /*
   * ไม่มีตัวนำหน้า CN/DN/RF — ระบบไม่มีใบลดหนี้ ใบเพิ่มหนี้ และคืนเงินถาวร ห้ามเติมกลับ (ผู้ใช้สั่ง 14 ต.ค. 2569)
   */
};

/**
 * ตัวเลือกในดรอปดาวน์ที่ผู้ดูแลระบบเพิ่ม/แก้/ลบได้ (/admin/options — ผู้ใช้สั่ง 18 ก.ย. 2569)
 * เป็นข้อความล้วน ไม่มีระบบไหนผูกกับค่าเหล่านี้ · ข้อมูลเก่าที่เคยเลือกไว้ยังเก็บข้อความเดิม
 * รายการสถานะที่ระบบใช้ตัดสินขั้นตอน (ดีล ใบเสนอราคา ฯลฯ) ไม่อยู่ในนี้ ตั้งใจไม่ให้แก้
 */
export type OptionKey =
  | "leadSource"
  | "leadChannel"
  | "leadClose"
  | "leadTakeover"
  | "quoteReject"
  | "collectChannel"
  | "adPlatform"
  | "eduLevel"
  /* ประเภทค่าใช้จ่ายในใบเบิก (Full Proposal · M5 ข้อมูลหลัก) */
  | "expenseKind"
  /* เพศในข้อมูลพนักงานและโปรไฟล์ — เพิ่มได้ ทุกหน้าที่ใช้ต้องอ่านจากรายการนี้ (เจ้าของสั่ง 28 ก.ย. 2569) */
  | "sex";

/**
 * รายการที่มีรหัสผูกกับระบบ — ผู้ดูแลระบบเพิ่มรายการใหม่และแก้ชื่อได้ (/admin/options)
 * ไม่มีค่า = ใช้ชุดตั้งต้นในไฟล์ข้อมูลของแต่ละฝ่าย · รายการตั้งต้นลบไม่ได้ (catalog.ts เติมกลับให้เสมอ)
 */
export type Catalog = {
  services?: { key: string; label: string; off?: boolean }[];
  depts?: { v: string; label: string; off?: boolean }[];
  /** off = ปิดใช้งาน ยังอยู่ในระบบให้ข้อมูลเก่าอ่านชื่อได้ แต่ไม่ขึ้นให้เลือกใหม่ */
  positions?: { v: string; label: string; dept: string; off?: boolean }[];
  docs?: { v: string; label: string; req: boolean; off?: boolean }[];
  teamRoles?: { key: string; label: string; color: string; off?: boolean }[];
  /** ประเภทนัดหมายของ PM (Full Proposal · M5 ข้อมูลหลัก) */
  eventKinds?: { key: string; label: string; color: string; off?: boolean }[];
  whtTypes?: { key: string; label: string; rate: number; off?: boolean }[];
};

/**
 * ผู้ออกเอกสาร — บริษัทหรือบุคคลที่ออกใบเสนอราคาในนามได้ (ผู้ใช้สั่ง 18 ก.ย. 2569 ให้เพิ่มเองได้)
 * แต่ละรายมีหัวกระดาษ บัญชีรับเงิน การจด VAT และตัวนำหน้าเลขใบเสนอราคาของตัวเอง
 * code = รหัสสั้นที่ใบเสนอราคาเก็บไว้ (MAZ, B1, IND ...) ห้ามเปลี่ยนหลังมีเอกสารอ้างถึง
 */
export type Issuer = {
  code: string;
  /** ชื่อในดรอปดาวน์ "ออกในนาม" */
  label: string;
  name: string;
  taxId: string;
  address: string;
  phone: string;
  email: string;
  /** ว่าง = ไม่พิมพ์บรรทัด Call Center · เครื่องที่บันทึกก่อนมีช่องนี้เติมจากข้อมูลบริษัท (fill) */
  callCenter?: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  vat: boolean;
  /** ตัวนำหน้าเลขใบเสนอราคา */
  prefix: string;
  docs?: IssuerDoc[];
  /*
   * ลายเซ็นผู้มีอำนาจลงนามและตราประทับ — ผู้ออกเอกสารละหนึ่งคน (ผู้ใช้สั่ง 16 ต.ค. 2569)
   * แสดงบนใบเสนอราคา (ช่องผู้เสนอราคา) และหนังสือรับรองหัก ณ ที่จ่าย 50 ทวิ (ช่องผู้จ่ายเงิน) อัตโนมัติ
   * ไม่มีค่า = ไม่มีลายเซ็น เอกสารหน้าตาเหมือนเดิม · ข้อมูลที่บันทึกไว้ก่อนมีช่องนี้ไม่ต้องย้ายค่า
   */
  sign?: IssuerImage;
  signName?: string;
  signTitle?: string;
  stamp?: IssuerImage;
};

/** รูปลายเซ็น/ตราประทับที่ย่อแล้ว — src = data URL (PNG เก็บพื้นโปร่งใส) · w/h = ขนาดหลังย่อ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
export type IssuerImage = { src: string; w: number; h: number; name: string; size: number };

/** ชื่อและตำแหน่งของผู้อนุมัติแต่ละสาย — ผู้ดูแลระบบแก้ได้ที่ /admin/settings?s=staff&t=positions (บทบาทที่ล็อกอินอนุมัติอยู่ใน role.ts) */
export type ApproverNames = Record<"pm" | "acc" | "hr" | "gm" | "exec", { name: string; title: string }>;

/*
 * สายอนุมัติรายตำแหน่ง (Full Proposal · M5 "ตำแหน่งและสายอนุมัติ")
 * คีย์คือรหัสตำแหน่ง (hr-data PosKey) · ค่าคือคีย์ผู้อนุมัติ (role.ts ApproverKey)
 * เก็บเป็น string เพราะ role.ts อ่านการตั้งค่าอยู่แล้ว ถ้า import ชนิดกลับมาจะวนกัน
 * ไม่ตั้งไว้ = ใช้สายอนุมัติตามบทบาทเหมือนเดิม
 */
/*
 * อัตราที่มีวันเริ่มใช้ (Full Proposal · M5 "ค่าใหม่มีวันที่เริ่มใช้ ค่าเดิมเก็บเป็นประวัติ")
 * เก็บเป็นชุดเต็มทีละวันที่ ไม่ได้เก็บเฉพาะช่องที่แก้ — อ่านย้อนหลังแล้วได้ทั้งชุดที่ใช้ ณ วันนั้น
 * at = วันแรกที่ใช้อัตราชุดนี้ (ISO) · ตั้งวันในอนาคตได้ ระบบสลับให้เองเมื่อถึงวัน
 */
export type RateChange = { at: string; rates: RateSettings; note: string };

/*
 * อัตราหัก ณ ที่จ่ายรายประเภท ที่มีวันเริ่มใช้ (Full Proposal · M5 "แก้อัตราพร้อมวันที่เริ่มใช้")
 * key = รหัสประเภทเงินได้ (catalog.whtTypes) · at = วันแรกที่ใช้อัตรานี้
 */
export type WhtChange = { key: string; at: string; rate: number };

/*
 * เพดานประกันสังคมตามช่วงปี พ.ศ. (Full Proposal · M5 "เพดานประกันสังคมบันทึกล่วงหน้าเป็นช่วงปี")
 * ceiling = ฐานเงินเดือนสูงสุดที่คิด · max = เงินสมทบสูงสุดต่อเดือน
 */
export type SsCeiling = { from: number; to: number; ceiling: number; max: number };

export type PosRoute = Record<string, { leave?: string; ot?: string; expense?: string }>;

/*
 * เวลาทำงานและจุดลงเวลาที่มีวันเริ่มใช้ (ต้นแบบ HR-15 "ประวัติการตั้งค่า")
 * at = วันแรกที่ใช้ชุดนี้ · ตั้งล่วงหน้าได้ ระบบสลับให้เองเมื่อถึงวัน เหมือนอัตราใน rateHistory
 * เก็บทั้งเวลาและพิกัดไว้ด้วยกัน เพราะต้นแบบให้บันทึกพร้อมกันครั้งเดียว
 */
/*
 * เวลาทำงานเฉพาะตำแหน่ง (ผู้ใช้สั่ง 16 ต.ค. 2569) — ตอนนี้มีแค่แม่บ้าน 08:00–17:00
 * pos = รหัสตำแหน่งในทะเบียนฝ่ายบุคคล · ตำแหน่งที่ไม่อยู่ในรายการใช้เวลาทำงานของบริษัท
 */
export type PosSchedule = { pos: string; start: string; end: string; lunchStart: string; lunchEnd: string };
export const DEFAULT_POS_SCHEDULES: PosSchedule[] = [
  { pos: "maid", start: "08:00", end: "17:00", lunchStart: "12:00", lunchEnd: "13:00" },
];

export type AttTimes = { start: string; end: string; lunchStart: string; lunchEnd: string };
export type AttPlace = { lat: number; lng: number; radius: number };
export type AttChange = { at: string; times: AttTimes; place: AttPlace; note: string };

/*
 * คำขอแก้วันหยุดบริษัทที่รอ CEO อนุมัติ (ผู้ใช้สั่ง 13 ต.ค. 2569 — "แบบรอบเงินเดือน")
 * holidays = ชุดที่ใช้อยู่จริง (อนุมัติแล้ว) ทั้งระบบอ่านชุดนี้เสมอ · draft = ชุดเต็มที่ฝ่ายบุคคลเสนอ
 * pending  รอ CEO — ร่างล็อกไว้ ฝ่ายบุคคลดึงกลับมาแก้ได้
 * rejected ตีกลับพร้อมเหตุผล — ฝ่ายบุคคลแก้แล้วส่งใหม่
 * approved อนุมัติแล้ว draft ถูกคัดลอกไปเป็น holidays แล้ว (เก็บไว้แจ้งผลในกระดิ่ง)
 */
export type HolidayReq = {
  status: "pending" | "rejected" | "approved";
  draft: Record<string, string>;
  sentAt: string;
  sentBy: string;
  at?: string;
  by?: string;
  reason?: string;
};

export type SystemSettings = {
  schedule: ScheduleSettings;
  /** เวลาทำงานเฉพาะตำแหน่ง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  positionSchedules: PosSchedule[];
  holidays: Record<string, string>;
  /** คำขอแก้วันหยุดที่ส่ง CEO ล่าสุด — null = ไม่มี (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  holidayReq: HolidayReq | null;
  leave: LeaveQuota[];
  company: CompanySettings;
  rates: RateSettings;
  docs: DocPrefixes;
  options: Record<OptionKey, string[]>;
  /* ตัวเลือกที่ปิดใช้งาน — ยังอยู่ในรายการให้ข้อมูลเก่าอ่านได้ แต่ไม่ขึ้นให้เลือกใหม่ (ต้นแบบ HR-10) */
  optionsOff: Partial<Record<OptionKey, string[]>>;
  catalog: Catalog;
  issuers: Issuer[];
  approvers: ApproverNames;
  posRoute: PosRoute;
  rateHistory: RateChange[];
  attHistory: AttChange[];
  ssCeiling: SsCeiling[];
  whtHistory: WhtChange[];
  /** รุ่นของชุดประเภทการลา — ต่ำกว่า LEAVE_REV แปลว่ายังเป็นชุดเก่า ต้องปรับครั้งเดียว (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  leaveRev?: number;
  /** รุ่นของประเภทค่าใช้จ่าย — ต่ำกว่า EXPENSE_KIND_REV ต้องเติมค่าคอมมิชชั่นครั้งเดียว (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  expenseKindRev?: number;
};

/* ชุดประเภทการลาสามประเภท ลากิจ 3 · ลาพักร้อน 6 · ลาป่วย 30 (ผู้ใช้สั่ง 9 ต.ค. 2569) */
const LEAVE_REV = 1;
/* เพิ่มค่าคอมมิชชั่นในประเภทค่าใช้จ่าย ให้เลือกจากปุ่มขอเบิกได้ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
const EXPENSE_KIND_REV = 1;

export const DEFAULT_SETTINGS: SystemSettings = {
  schedule: {
    start: "09:00",
    end: "18:00",
    lateGraceMinutes: 0,
    lunchStart: "12:00",
    lunchEnd: "13:00",
    /* 18:00–19:00 เป็นช่วงพักกินข้าว ไม่นับเป็นโอที */
    otStart: "19:00",
    /* พักของโอทีวันหยุด 12:00–13:00 และ 18:00–19:00 — เครื่องเก่าได้ค่านี้จาก fill() (ผู้ใช้สั่ง 13 ต.ค. 2569) */
    holLunchStart: "12:00",
    holLunchEnd: "13:00",
    holDinnerStart: "18:00",
    holDinnerEnd: "19:00",
    payCutDay: 25,
  },
  positionSchedules: DEFAULT_POS_SCHEDULES,
  holidayReq: null,
  /* วันหยุดราชการ ปี 2569 — วันตามจันทรคติและวันชดเชยต้องเทียบประกาศ ครม. ทุกปี */
  holidays: {
    "2026-01-01": "วันขึ้นปีใหม่",
    "2026-03-03": "วันมาฆบูชา",
    "2026-04-06": "วันจักรี",
    "2026-04-13": "วันสงกรานต์",
    "2026-04-14": "วันสงกรานต์",
    "2026-04-15": "วันสงกรานต์",
    "2026-05-01": "วันแรงงานแห่งชาติ",
    "2026-05-04": "วันฉัตรมงคล",
    "2026-05-31": "วันวิสาขบูชา",
    "2026-06-03": "วันเฉลิมพระชนมพรรษา สมเด็จพระนางเจ้าฯ พระบรมราชินี",
    "2026-07-28": "วันเฉลิมพระชนมพรรษา พระบาทสมเด็จพระเจ้าอยู่หัว",
    "2026-07-29": "วันอาสาฬหบูชา",
    "2026-07-30": "วันเข้าพรรษา",
    "2026-08-12": "วันแม่แห่งชาติ",
    "2026-10-13": "วันนวมินทรมหาราช",
    "2026-10-23": "วันปิยมหาราช",
    "2026-12-05": "วันพ่อแห่งชาติ · วันชาติ",
    "2026-12-10": "วันรัฐธรรมนูญ",
    "2026-12-31": "วันสิ้นปี",
  },
  /* สิทธิ์วันลาของรอบปีปัจจุบัน — ประเภทตั้งต้นตาม LEAVE_TYPES ใน leave-data.ts · ผู้ดูแลเพิ่มประเภทต่อท้ายได้
     สามประเภทหลักตาม ERD (leave_quota, HR-BR-13): ลากิจ 3 · ลาพักร้อน 6 · ลาป่วย 30 วันต่อปี ไม่สะสมข้ามปี */
  leave: [
    { type: "ลากิจ", days: 3 },
    { type: "ลาพักร้อน", days: 6 },
    { type: "ลาป่วย", days: 30 },
  ],
  leaveRev: LEAVE_REV,
  expenseKindRev: EXPENSE_KIND_REV,
  company: {
    name: "บริษัท ไอเมซเมกเกอร์ จำกัด (สำนักงานใหญ่)",
    taxId: "0505559001339",
    address: "อาคาร IMZ Group บ้านสวนกลางเวียง 59/56 หมู่ 4\nตำบลหนองหอย อำเภอเมือง จังหวัดเชียงใหม่ 50000",
    phone: "061-796-5177 , 052-005562",
    email: "info@mazmaker.com",
    callCenter: "083-864-4968",
    bankName: "ธนาคารกสิกรไทย",
    bankAccountName: "บจก. ไอเมซเมกเกอร์",
    bankAccountNo: "008-3-86894-5",
  },
  rates: {
    vat: 7,
    wht: 3,
    commission: 5,
    otAfterWork: 1.5,
    otHoliday: 2,
    otPublic: 3,
    otAheadDays: 1,
    socialSecurity: 5,
    /* ปิดไว้ก่อน — เปิดแล้วเงินเดือนของทุกรอบที่เปิดดูจะถูกหัก รวมรอบที่เผยแพร่สลิปไปแล้ว */
    lateMode: "wage",
    latePerMinute: 5,
    lateFreeMinutes: 0,
    probationMonths: 3,
    fuelPerKm: 5,
    fuelMotoPerKm: 2.5,
    /* ตั้งต้นไม่ยกยอด ตาม ERD (HR-BR-13 ไม่สะสมข้ามปี) — ผู้ดูแลเปิดได้ที่หน้าประเภทการลา */
    vacationCarryMax: 0,
    leaveYearStart: "01-01",
  },
  docs: {
    lead: "LEAD",
    presales: "PS",
    quotationMaz: "MAZ",
    quotationB1: "B1",
    deal: "DL",
    jobOrder: "JO",
    invoice: "INV",
    receipt: "RCP",
    project: "PJ",
  },
  options: {
    leadSource: ["เว็บไซต์", "เฟซบุ๊ก", "แนะนำต่อ", "ออกบูธ", "โทรเข้า", "ลูกค้าเก่า", "อื่นๆ"],
    leadChannel: ["โทรศัพท์", "นัดพบ", "อีเมล", "ไลน์", "เมสเซนเจอร์"],
    leadClose: ["งบไม่ถึง", "เลือกผู้ให้บริการรายอื่น", "ชะลอโครงการ", "ติดต่อไม่ได้", "ไม่ตรงกับบริการที่เรามี", "อื่นๆ"],
    leadTakeover: ["ผู้ดูแลเดิมลาออก", "ผู้ดูแลเดิมย้ายทีม", "ผู้ดูแลเดิมลายาว", "หัวหน้าสั่งให้สลับผู้ดูแล"],
    quoteReject: ["งบไม่ถึง", "เลือกผู้ให้บริการรายอื่น", "ชะลอโครงการ", "ขอบเขตงานไม่ตรง", "ติดต่อไม่ได้", "อื่นๆ"],
    collectChannel: ["โทรศัพท์", "อีเมล", "ไลน์", "เข้าพบ"],
    adPlatform: ["Google", "Facebook", "Instagram", "TikTok", "YouTube", "Line"],
    eduLevel: ["มัธยมศึกษาตอนปลาย / ปวช.", "ปวส. / อนุปริญญา", "ปริญญาตรี", "ปริญญาโท"],
    /* ไม่มีค่าคอมมิชชั่นแล้ว — ผู้บริหารให้ในรอบเงินเดือน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
    expenseKind: ["ค่าเดินทาง", "ค่ารับรองลูกค้า", "ค่าอุปกรณ์และวัสดุ", "ค่าที่พัก", "อื่นๆ"],
    sex: ["ชาย", "หญิง", "ไม่ระบุ"],
  },
  optionsOff: {},
  catalog: {},
  issuers: [],
  posRoute: {},
  rateHistory: [],
  attHistory: [],
  ssCeiling: [
    { from: 2569, to: 2571, ceiling: 17500, max: 875 },
    { from: 2572, to: 2574, ceiling: 20000, max: 1000 },
    { from: 2575, to: 9999, ceiling: 23000, max: 1150 },
  ],
  whtHistory: [],
  approvers: {
    pm: { name: "ชนิกานต์ วัฒนกุล", title: "ผู้จัดการโครงการ" },
    acc: { name: "อรอนงค์ พรหมมา", title: "บัญชีและบุคคล" },
    hr: { name: "อรอนงค์ พรหมมา", title: "ฝ่ายบุคคล" },
    gm: { name: "ประเสริฐ มั่นคงดี", title: "General Manager" },
    exec: { name: "CEO", title: "ผู้บริหาร" },
  },
};

/* ผู้ออกเอกสารตั้งต้น — MAZ ใช้ข้อมูลบริษัทเดิม (company) · IND ใช้เลขชุดเดียวกับ MAZ เหมือนระบบเดิม */
DEFAULT_SETTINGS.issuers = defaultIssuers(DEFAULT_SETTINGS.company, DEFAULT_SETTINGS.docs);

function defaultIssuers(c: CompanySettings, d: DocPrefixes): Issuer[] {
  const { docs: files, ...company } = c;
  return [
    { code: "MAZ", label: "บริษัท ไอเมซเมกเกอร์ จำกัด (MAZ)", ...company, vat: true, prefix: d.quotationMaz, ...(files ? { docs: files } : {}) },
    {
      code: "B1",
      label: "บริษัทในเครือ 1 (B1)",
      name: "บริษัทในเครือ 1",
      taxId: "",
      address: c.address,
      phone: c.phone,
      email: c.email,
      callCenter: c.callCenter,
      bankName: c.bankName,
      bankAccountName: c.bankAccountName,
      bankAccountNo: c.bankAccountNo,
      vat: true,
      prefix: d.quotationB1,
    },
    {
      code: "IND",
      label: "บุคคลธรรมดา (IND)",
      name: "บุคคลธรรมดา",
      taxId: "",
      address: "",
      phone: c.phone,
      email: c.email,
      callCenter: c.callCenter,
      bankName: c.bankName,
      bankAccountName: c.bankAccountName,
      bankAccountNo: c.bankAccountNo,
      vat: false,
      prefix: d.quotationMaz,
    },
  ];
}

function isSettings(v: unknown): v is SystemSettings {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (["schedule", "holidays", "leave", "company", "rates", "docs"] as const).every(
    (k) => typeof s[k] === "object" && s[k] !== null,
  );
}

/** เครื่องที่บันทึกไว้ก่อน — เติมค่าเดินทาง/ค่าคอมมิชชั่นที่ยังไม่มีครั้งเดียว ไม่ทับที่ผู้ดูแลลบทีหลัง (ผู้ใช้สั่ง 9 ต.ค. 2569) */
function withExpenseKinds(o: Record<OptionKey, string[]>, rev: number): Record<OptionKey, string[]> {
  if (rev >= EXPENSE_KIND_REV) return o;
  const list = o.expenseKind ?? [];
  const add = ["ค่าเดินทาง"].filter((k) => !list.includes(k));
  return add.length ? { ...o, expenseKind: [...add, ...list] } : o;
}

function withDefaultPosSchedules(list: PosSchedule[] | undefined): PosSchedule[] {
  if (!Array.isArray(list)) return DEFAULT_POS_SCHEDULES;
  const add = DEFAULT_POS_SCHEDULES.filter((d) => !list.some((x) => x.pos === d.pos));
  return add.length ? [...list, ...add] : list;
}

/** เติมช่องที่เพิ่มเข้ามาทีหลังจากค่าตั้งต้น โดยไม่ทับค่าที่ผู้ดูแลตั้งไว้ */
function fill(v: SystemSettings): SystemSettings {
  return {
    schedule: { ...DEFAULT_SETTINGS.schedule, ...v.schedule },
    /* เครื่องเก่ายังไม่มีเวลาเฉพาะตำแหน่ง — เติมแถวแม่บ้านตั้งต้นถ้ายังไม่มี (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    positionSchedules: withDefaultPosSchedules(v.positionSchedules),
    holidays: v.holidays,
    /* เครื่องเก่ายังไม่มีคำขอ — รายการวันหยุดที่เก็บไว้ถือเป็นชุดที่อนุมัติแล้ว (ผู้ใช้สั่ง 13 ต.ค. 2569) */
    holidayReq: v.holidayReq ?? null,
    /* เครื่องที่บันทึกไว้ก่อนเลิกลาคลอด/ลาไม่รับค่าจ้าง — ตัดประเภทอื่นทิ้ง และตั้งสิทธิ์เป็น 3/6/30 ครั้งเดียว
       หลังจากนั้นค่าที่ผู้ดูแลแก้เองไม่ถูกทับ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
    leave:
      Array.isArray(v.leave) && (v.leaveRev ?? 0) >= LEAVE_REV
        ? v.leave
        : DEFAULT_SETTINGS.leave.map((q) => {
            const had = Array.isArray(v.leave) ? v.leave.find((x) => x.type === q.type) : undefined;
            return had?.note ? { ...q, note: had.note } : q;
          }),
    leaveRev: LEAVE_REV,
    company: { ...DEFAULT_SETTINGS.company, ...v.company },
    rates: { ...DEFAULT_SETTINGS.rates, ...v.rates },
    docs: { ...DEFAULT_SETTINGS.docs, ...v.docs },
    /* หมวดนี้เพิ่มทีหลัง — เครื่องที่บันทึกไว้ก่อนยังไม่มี เติมจากค่าตั้งต้นทีละรายการ */
    options: withExpenseKinds({ ...DEFAULT_SETTINGS.options, ...(v.options ?? {}) }, v.expenseKindRev ?? 0),
    expenseKindRev: EXPENSE_KIND_REV,
    optionsOff: v.optionsOff ?? {},
    catalog: v.catalog ?? {},
    /* เครื่องที่บันทึกไว้ก่อนมีรายการผู้ออกเอกสาร — สร้างจากข้อมูลบริษัทและเลขเอกสารเดิม */
    approvers: { ...DEFAULT_SETTINGS.approvers, ...(v.approvers ?? {}) },
    /* หมวดนี้เพิ่ม 28 ก.ย. 2569 — เครื่องที่บันทึกไว้ก่อนยังไม่มี ถือว่าไม่มีสายรายตำแหน่ง */
    posRoute: v.posRoute ?? {},
    /* presalesRoute (ประเภทงาน → ตำแหน่ง) เลิกใช้แล้ว — คำขอก่อนการขายกลับไปเลือกตัวคน
       ค่าที่ค้างในเครื่องเก่าไม่ถูกอ่าน ไม่มีผลอะไร (ผู้ใช้สั่ง 14 ต.ค. 2569) */
    /* ชุดอัตราที่บันทึกไว้ก่อนมีช่องใหม่ (เช่น ค่าน้ำมันมอเตอร์ไซค์) เติมจากค่าตั้งต้น (ผู้ใช้สั่ง 29 ต.ค. 2569) */
    rateHistory: Array.isArray(v.rateHistory)
      ? v.rateHistory.map((h) => ({ ...h, rates: { ...DEFAULT_SETTINGS.rates, ...h.rates } }))
      : [],
    /* หมวดนี้เพิ่ม 29 ก.ย. 2569 — เครื่องที่บันทึกไว้ก่อนยังไม่มีประวัติเวลาทำงาน */
    attHistory: Array.isArray(v.attHistory) ? v.attHistory : [],
    ssCeiling: Array.isArray(v.ssCeiling) && v.ssCeiling.length ? v.ssCeiling : DEFAULT_SETTINGS.ssCeiling,
    whtHistory: Array.isArray(v.whtHistory) ? v.whtHistory : [],
    issuers:
      Array.isArray(v.issuers) && v.issuers.length
        ? /* ช่อง Call Center เพิ่มทีหลัง — ผู้ออกเอกสารที่บันทึกไว้ก่อนเติมจากข้อมูลบริษัท */
          v.issuers.map((i) =>
            i.callCenter === undefined
              ? { ...i, callCenter: { ...DEFAULT_SETTINGS.company, ...v.company }.callCenter }
              : i,
          )
        : defaultIssuers({ ...DEFAULT_SETTINGS.company, ...v.company }, { ...DEFAULT_SETTINGS.docs, ...v.docs }),
  };
}

/*
 * v3 (24 ก.ย. 2569) — ถอดตัวนำหน้า CN/DN/RF ออกจากชุดเลขที่เอกสาร
 *                     เพราะระบบไม่มีเอกสารสามชนิดนี้แล้ว (ถาวร — ผู้ใช้สั่ง 14 ต.ค. 2569)
 *                     ของเก่ายังเก็บสามช่องนั้นไว้ ถ้าอ่านต่อจะไปโผล่ในหน้าตรวจตัวนำหน้าซ้ำ
 */
const store = createPersistedStore<SystemSettings>(
  "maz-erp.system-settings.v3",
  DEFAULT_SETTINGS,
  isSettings,
  fill,
);

let live = false;
const liveListeners = new Set<() => void>();

/** เรียกครั้งเดียวจากเปลือกแอปหลัง hydrate — จากนี้ settings() คืนค่าที่ผู้ดูแลตั้งไว้ */
export function goLive() {
  if (live) return;
  live = true;
  for (const l of liveListeners) l();
}

/*
 * อัตราที่ใช้ ณ วันที่กำหนด — ชุดล่าสุดที่วันเริ่มใช้ไม่เกินวันนั้น
 * ไม่มีประวัติ หรือประวัติทั้งหมดเริ่มหลังวันนั้น = ใช้อัตราที่ตั้งไว้ปัจจุบัน
 * (รอบเงินเดือนที่ปิดไปแล้วเก็บตัวเลขของตัวเองไว้ ไม่คิดใหม่ — ดู hr-store)
 */
export function ratesOn(iso: string, s: SystemSettings = settings()): RateSettings {
  const hit = [...s.rateHistory].filter((h) => h.at <= iso).sort((a, b) => a.at.localeCompare(b.at)).pop();
  if (!hit) return s.rates;
  /*
   * สองช่องนี้ไม่ใช่อัตราเงิน และตั้งอยู่คนละหน้า (/admin/leave) จึงไม่เดินตามประวัติ
   * ไม่งั้นแก้เพดานยกยอดวันลาแล้วจะถูกชุดอัตราย้อนหลังทับทันที
   */
  return { ...hit.rates, vacationCarryMax: s.rates.vacationCarryMax, leaveYearStart: s.rates.leaveYearStart };
}

/**
 * อัตราหัก ณ ที่จ่ายของประเภทนี้ ณ วันที่กำหนด — ไม่มีประวัติถึงวันนั้นก็ใช้อัตราปัจจุบัน (base)
 */
export function whtRateOn(key: string, iso: string, base: number, history: WhtChange[]): number {
  const hit = history
    .filter((h) => h.key === key && h.at <= iso)
    .sort((a, b) => a.at.localeCompare(b.at))
    .pop();
  return hit ? hit.rate : base;
}

/*
 * อัตราที่ตั้งวันเริ่มใช้ไว้ล่วงหน้าต้องมีผลเองเมื่อถึงวัน — ไม่ต้องให้ใครมากดบันทึกซ้ำ
 * จำผลไว้ต่อ (ชุดค่าตั้งค่า + วันนี้) เพื่อให้ตัวอ้างอิงคงที่ หน้าจะได้ไม่วาดใหม่ทุกครั้งที่อ่าน
 */
let ratesCache: { src: SystemSettings; day: string; out: SystemSettings } | null = null;
function withEffectiveRates(s: SystemSettings): SystemSettings {
  if (!s.rateHistory.length && !s.attHistory.length) return s;
  const day = todayIso();
  if (ratesCache && ratesCache.src === s && ratesCache.day === day) return ratesCache.out;
  let out = s;
  if (s.rateHistory.length) {
    const rates = ratesOn(day, s);
    if (rates !== s.rates) out = { ...out, rates };
  }
  /* ชุดเวลาทำงานที่ตั้งวันเริ่มใช้ไว้ล่วงหน้า ต้องมีผลเองเมื่อถึงวัน เหมือนอัตรา */
  const att = attOn(day, s);
  if (att) {
    const c = out.schedule;
    const t = att.times;
    if (c.start !== t.start || c.end !== t.end || c.lunchStart !== t.lunchStart || c.lunchEnd !== t.lunchEnd)
      out = { ...out, schedule: { ...c, ...t } };
  }
  ratesCache = { src: s, day, out };
  return out;
}

/** ชุดเวลาทำงานและจุดลงเวลาที่ใช้ ณ วันที่กำหนด — ไม่มีประวัติถึงวันนั้นคืน null (ใช้ค่าที่ตั้งไว้ปัจจุบัน) */
export function attOn(iso: string, s: SystemSettings = settings()): AttChange | null {
  return (
    [...s.attHistory]
      .filter((h) => h.at <= iso)
      .sort((a, b) => a.at.localeCompare(b.at))
      .pop() ?? null
  );
}

/** ค่าที่ใช้คำนวณอยู่ตอนนี้ — อ่านนอก React ได้ */
export function settings(): SystemSettings {
  return live ? withEffectiveRates(store.get()) : DEFAULT_SETTINGS;
}

/*
 * บันทึกอัตราชุดใหม่พร้อมวันเริ่มใช้ — ชุดเดิมยังอยู่ในประวัติ
 * บันทึกซ้ำวันเดิม = ทับชุดของวันนั้น (ผู้ดูแลแก้ตัวเลขที่เพิ่งตั้งไปได้)
 * rates ที่ใช้อยู่อัปเดตตามวันนี้เสมอ เผื่อชุดใหม่มีผลย้อนหลังหรือมีผลวันนี้
 */
export function saveRatesFrom(at: string, rates: RateSettings, note: string) {
  store.update((s) => {
    const history = [...s.rateHistory.filter((h) => h.at !== at), { at, rates, note }].sort((a, b) =>
      a.at.localeCompare(b.at),
    );
    return { ...s, rateHistory: history, rates: ratesOn(todayIso(), { ...s, rateHistory: history }) };
  });
}

/*
 * บันทึกเวลาทำงานและจุดลงเวลาชุดใหม่พร้อมวันเริ่มใช้ — ชุดเดิมยังอยู่ในประวัติ (ต้นแบบ HR-15)
 * บันทึกซ้ำวันเดิม = ทับชุดของวันนั้น · เวลาที่ใช้อยู่อัปเดตตามวันนี้เสมอ
 * พิกัดเก็บที่ work-area (คนละที่เก็บ) — ผู้เรียกต้องบันทึกที่นั่นด้วยเมื่อวันเริ่มใช้ถึงแล้ว
 */
export function saveAttFrom(at: string, times: AttTimes, place: AttPlace, note: string) {
  store.update((s) => {
    const attHistory = [...s.attHistory.filter((h) => h.at !== at), { at, times, place, note }].sort((a, b) =>
      a.at.localeCompare(b.at),
    );
    const hit = attOn(todayIso(), { ...s, attHistory });
    return { ...s, attHistory, schedule: hit ? { ...s.schedule, ...hit.times } : s.schedule };
  });
}

function subscribeLive(onChange: () => void) {
  liveListeners.add(onChange);
  const off = store.subscribe(onChange);
  return () => {
    liveListeners.delete(onChange);
    off();
  };
}

/** สำหรับเปลือกแอป — เปลี่ยนตัวอ้างอิงเมื่อค่าที่ใช้คำนวณเปลี่ยน ใช้เป็น key วาดหน้าใหม่ */
export function useLiveSettings() {
  return useSyncExternalStore(subscribeLive, settings, () => DEFAULT_SETTINGS);
}

/** สำหรับหน้าตั้งค่าของผู้ดูแล — อ่านค่าที่เก็บไว้ตรง ๆ */
export function useSystemSettings() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function saveSection<K extends keyof SystemSettings>(key: K, value: SystemSettings[K]) {
  store.update((s) => ({ ...s, [key]: value }));
}

export function resetSection<K extends keyof SystemSettings>(key: K) {
  store.update((s) => ({ ...s, [key]: DEFAULT_SETTINGS[key] }));
}

/*
 * ─── วันหยุดบริษัทต้องให้ CEO อนุมัติ (ผู้ใช้สั่ง 13 ต.ค. 2569) ───
 * ฝ่ายบุคคลส่งชุดเต็ม → CEO อนุมัติ = ชุดนั้นเป็น holidays ที่ทั้งระบบใช้ · ตีกลับ = ฝ่ายบุคคลแก้แล้วส่งใหม่
 * ระหว่างรอ ทุกหน้ายังใช้ holidays ชุดเดิม
 */
export function submitHolidays(draft: Record<string, string>, by: string, at: string) {
  store.update((s) => ({ ...s, holidayReq: { status: "pending", draft, sentAt: at, sentBy: by } }));
}

/** ดึงคำขอกลับ / ทิ้งคำขอที่ถูกตีกลับ */
export function clearHolidayReq() {
  store.update((s) => ({ ...s, holidayReq: null }));
}

/**
 * CEO ตัดสิน — อนุมัติแล้ววันที่อยู่ในรอบเงินเดือนที่ปิดไปแล้ว (lockedUntil) คงค่าเดิมไว้
 * เพราะระหว่างรออาจมีรอบปิดเพิ่ม ตัวเลขของรอบที่ปิดแล้วต้องไม่ขยับ
 */
export function decideHolidays(ok: boolean, reason: string, by: string, at: string, lockedUntil?: string | null) {
  store.update((s) => {
    const req = s.holidayReq;
    if (!req || req.status !== "pending") return s;
    if (!ok) return { ...s, holidayReq: { ...req, status: "rejected", at, by, reason } };
    let next = req.draft;
    if (lockedUntil) {
      next = Object.fromEntries(Object.entries(req.draft).filter(([d]) => d > lockedUntil));
      for (const [d, n] of Object.entries(s.holidays)) if (d <= lockedUntil) next[d] = n;
    }
    return { ...s, holidays: next, holidayReq: { ...req, status: "approved", at, by, reason: "" } };
  });
}

/** รายการที่เปลี่ยนจากชุดที่ใช้อยู่ — เพิ่ม/แก้ชื่อ/ลบ เรียงตามวันที่ */
export function holidayDiff(active: Record<string, string>, draft: Record<string, string>) {
  const out: { d: string; kind: "add" | "edit" | "del"; name: string; was?: string }[] = [];
  for (const d of new Set([...Object.keys(active), ...Object.keys(draft)])) {
    if (!(d in active)) out.push({ d, kind: "add", name: draft[d] });
    else if (!(d in draft)) out.push({ d, kind: "del", name: active[d] });
    else if (active[d] !== draft[d]) out.push({ d, kind: "edit", name: draft[d], was: active[d] });
  }
  return out.sort((a, b) => a.d.localeCompare(b.d));
}

export function resetSystemSettings() {
  store.reset();
}

/*
 * key ให้เปลือกแอปวาดหน้าใหม่เมื่อค่าที่ใช้คำนวณเปลี่ยน — ค่าตั้งต้นได้ "0" เสมอ หน้าจึงไม่ถูกวาดใหม่ตอนโหลด
 * ไม่นับหมวดตัวเลือกในรายการ (options/catalog) เพราะหน้างานเพิ่มตัวเลือกได้กลางฟอร์ม
 * ถ้าวาดใหม่ทั้งหน้า ข้อมูลที่กรอกค้างไว้จะหาย · ดรอปดาวน์อ่านค่าใหม่เองตอนคอมโพเนนต์วาดรอบถัดไป
 */
/* holidayReq ไม่มีผลกับการคำนวณจนกว่าจะอนุมัติ (ตอนนั้น holidays เปลี่ยนเอง) ไม่ต้องวาดหน้าใหม่ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
const SKIP_KEY: (keyof SystemSettings)[] = ["options", "optionsOff", "catalog", "issuers", "holidayReq"];
const secIds = new WeakMap<object, number>();
let nextSec = 1;
function secId(o: unknown) {
  if (typeof o !== "object" || o === null) return String(o);
  let id = secIds.get(o);
  if (id === undefined) {
    id = nextSec++;
    secIds.set(o, id);
  }
  return String(id);
}

export function settingsId(s: SystemSettings) {
  if (s === DEFAULT_SETTINGS) return "0";
  const keys = (Object.keys(s) as (keyof SystemSettings)[]).filter((k) => !SKIP_KEY.includes(k));
  const sig = keys.map((k) => (s[k] === DEFAULT_SETTINGS[k] ? "d" : secId(s[k]))).join("-");
  return keys.every((k) => s[k] === DEFAULT_SETTINGS[k]) ? "0" : sig;
}
