/*
 * ใบเบิกค่าใช้จ่ายรายเดือน — ค่าน้ำมันรถ กับ incentive/commission
 * หนึ่งเดือนมีหนึ่งใบ ยื่นทีเดียวทั้งสองส่วน
 * TODO: ย้ายไปตาราง expense_claim เมื่อต่อ backend
 */

import { settings } from "./system-settings";
import type { Role } from "./role";

import { round2 } from "./format";

/** จ่ายคืนกิโลเมตรละกี่บาท — ฝ่ายบุคคลตั้งได้ที่ /admin/rates (Full Proposal · M5) */
export const fuelRate = () => settings().rates.fuelPerKm;

/** ค่าคอมมิชชั่นกี่เปอร์เซ็นต์ของมูลค่าดีล — ผู้ดูแลระบบตั้งได้ที่ /admin/rates */
export const commissionRate = () => settings().rates.commission;

/** ยอดต่อครั้งที่ไม่เกินนี้ ไม่เข้าเกณฑ์หักภาษี ณ ที่จ่าย */
export const WHT_FREE_LIMIT = 1000;

/* ยกเลิก = ผู้ยื่นถอนใบที่รออนุมัติออกเอง ใบยังอยู่ในรายการให้ตามรอย (ผู้ใช้สั่ง 9 ต.ค. 2569) */
export type ClaimStatus = "ร่าง" | "รออนุมัติ" | "อนุมัติแล้ว" | "ไม่อนุมัติ" | "ยกเลิก";

export const CLAIM_STATUS: Record<ClaimStatus, string> = {
  ร่าง: "t-miss",
  รออนุมัติ: "t-early",
  อนุมัติแล้ว: "t-ok",
  ไม่อนุมัติ: "t-late",
  ยกเลิก: "t-miss",
};

/** ส่งแล้วหรืออนุมัติแล้ว ห้ามแก้ต่อ ไม่งั้นตัวเลขจะไม่ตรงกับที่ผู้อนุมัติเห็น */
export function isLocked(status: ClaimStatus) {
  return status === "รออนุมัติ" || status === "อนุมัติแล้ว";
}

export type FuelRow = {
  id: string;
  date: string;
  /** เส้นทาง เริ่มต้น → สิ้นสุด */
  place: string;
  /** ระยะทางเป็นกิโลเมตร เก็บเป็นข้อความเพราะกำลังพิมพ์อยู่ */
  km: string;
  work: string;
  note: string;
};

export type IncomeRow = {
  id: string;
  item: string;
  /** มูลค่าดีลที่เอามาคิดค่าคอม */
  amount: string;
  /** เลขที่ดีลที่ดึงมา — ว่างแปลว่าพิมพ์เอง (เช่น incentive พิเศษ) */
  dealNo: string;
};

/*
 * ค่าใช้จ่ายอื่นนอกจากค่าน้ำมัน (ERD expense_claim: fuel / other · Full Proposal · M6)
 * ประเภทมาจากข้อมูลหลัก (optionsOf("expenseKind")) · file = ชื่อไฟล์หลักฐานที่แนบ
 */
export type OtherRow = {
  id: string;
  kind: string;
  date: string;
  /** จำนวนเงิน เก็บเป็นข้อความเพราะกำลังพิมพ์อยู่ */
  amount: string;
  note: string;
  file?: string;
};

export type ExpenseClaim = {
  /** เดือนของใบเบิก รูปแบบ yyyy-mm */
  month: string;
  status: ClaimStatus;
  plate: string;
  nickname: string;
  fuel: FuelRow[];
  income: IncomeRow[];
  /** ใบที่บันทึกไว้ก่อนมีช่องนี้ยังไม่มีรายการอื่น */
  other?: OtherRow[];
  /** คำอธิบายจากผู้อนุมัติ ตอนไม่อนุมัติ */
  comment: string;
  submittedAt: string;
  /** รอบเงินเดือนที่จ่ายคืนใบนี้แล้ว (yyyy-mm) — ERD expense_claim.payroll_line_id · ว่างคือยังไม่ได้จ่าย */
  paidIn?: string;
  /** วันเวลาที่ผู้อนุมัติตัดสิน — ใช้หาว่าค่าใช้จ่ายคืนเข้าเงินเดือนงวดไหน */
  decidedAt?: string;
  /**
   * เลขที่ใบเบิกตาม ERD (EX-ปี พ.ศ.-ลำดับ) — ออกตอนพนักงานกดส่ง ใบร่างยังไม่มี
   * ใบที่ยื่นแล้วต้องมีเลขเสมอ เพราะเป็นเอกสารที่ใช้เบิกเงิน ต้องอ้างอิงได้ทั้งในรายการ
   * หน้าอนุมัติ และในรายละเอียดเงินเดือน (ผู้ใช้ตัดสิน 23 ก.ย. 2569)
   */
  no?: string;
};

const num = (v: string) => Number(String(v).replace(/,/g, "")) || 0;

/** เงินค่าน้ำมันของแถวเดียว = ระยะทาง × เรตต่อกิโลเมตร */
export function fuelAmount(row: FuelRow) {
  return round2(num(row.km) * fuelRate());
}

/** ค่าคอมของแถวเดียว = มูลค่าดีล × เปอร์เซ็นต์ — เก็บไว้อ่านใบเก่าที่ยังมีแถวค่าคอมติดมา ไม่เข้ายอดที่ขอเบิกแล้ว */
export function commissionOf(row: IncomeRow) {
  return round2((num(row.amount) * commissionRate()) / 100);
}

/** ยอดค่าใช้จ่ายอื่นทั้งใบ */
export function otherTotal(rows: OtherRow[] = []) {
  return round2(rows.reduce((sum, r) => sum + num(r.amount), 0));
}

/** กรอกครบไหม — ว่างช่องไหนบอกช่องนั้น */
export function otherRowProblem(r: OtherRow, month: string) {
  if (!r.kind) return "ยังไม่ได้เลือกประเภท";
  if (!r.date) return "ยังไม่ได้เลือกวันที่";
  if (r.date.slice(0, 7) !== month) return "วันที่ไม่อยู่ในเดือนของใบนี้";
  if (!(num(r.amount) > 0)) return "ยังไม่ได้กรอกจำนวนเงิน";
  if (!r.note.trim()) return "ยังไม่ได้กรอกรายละเอียด";
  return "";
}

export function fuelTotal(rows: FuelRow[]) {
  return round2(rows.reduce((sum, r) => sum + fuelAmount(r), 0));
}

export function commissionTotal(rows: IncomeRow[]) {
  return round2(rows.reduce((sum, r) => sum + commissionOf(r), 0));
}

/**
 * ยอดรวมทั้งใบ — ที่เดียวเท่านั้น หน้าอื่นห้ามคิดเอง
 *
 * ค่าคอมมิชชั่นย้ายไปคิดในเงินเดือนแล้ว (ERD) และแท็บค่าคอมถูกเอาออกจากหน้าใบเบิก
 * ยอดนี้จึงเป็น "ค่าน้ำมันที่ขอเบิก" อย่างเดียว เท่ากับยอดท้ายใบในหน้า /expense
 * เดิมยังบวก commissionTotal อยู่ ทำให้กระดิ่งบอก 27,102.50 ขณะที่หน้าใบเบิกบอก 620.00
 * (ใบตั้งต้นบางใบยังมีแถวค่าคอมค้างไว้ และหน้าจอไม่แสดงแถวนั้นแล้ว)
 */
export function claimTotal(claim: ExpenseClaim) {
  return round2(fuelTotal(claim.fuel) + otherTotal(claim.other));
}

/* ต้นแบบ dose-erp-maz/expense.html CLAIMS */
const SALES_CLAIMS: ExpenseClaim[] = [
  {
    month: "2026-09",
    status: "ร่าง",
    plate: "1กจ 4471 เชียงใหม่",
    nickname: "ชม",
    fuel: [
      { id: "F1", date: "2026-09-03", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: "48", work: "เข้าพบลูกค้านำเสนอระบบ", note: "" },
      { id: "F2", date: "2026-09-07", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: "76", work: "สำรวจหน้างานก่อนเสนอราคา", note: "" },
    ],
    income: [
      { id: "I1", item: "ดีล DL-2569-0009 สยามพลาสติก", amount: "342400", dealNo: "DL-2569-0009" },
      { id: "I2", item: "ดีล DL-2569-0007 พูลผลอะไหล่", amount: "187250", dealNo: "DL-2569-0007" },
    ],
    comment: "",
    submittedAt: "",
  },
  {
    month: "2026-08",
    status: "อนุมัติแล้ว",
    no: "EX-2569-0001",
    plate: "1กจ 4471 เชียงใหม่",
    nickname: "ชม",
    fuel: [
      { id: "F3", date: "2026-08-21", place: "ออฟฟิศ – ครัวคุณจิ ถ.ช้างคลาน", km: "22", work: "ส่งมอบงานและเก็บเอกสาร", note: "เติมน้ำมันเอง" },
    ],
    income: [
      { id: "I3", item: "ดีล DL-2569-0017 ครัวคุณจิ", amount: "52000", dealNo: "DL-2569-0017" },
    ],
    comment: "",
    submittedAt: "2026-09-01 09:20",
  },
];

/* PM กับบัญชีไม่มีค่าคอมมิชชั่นจากการขาย เบิกได้เฉพาะค่าน้ำมันตอนออกนอกออฟฟิศ */
const PM_CLAIMS: ExpenseClaim[] = [
  {
    month: "2026-09",
    status: "รออนุมัติ",
    no: "EX-2569-0009",
    plate: "2กท 8890 เชียงใหม่",
    nickname: "กร",
    fuel: [
      { id: "F11", date: "2026-09-04", place: "ออฟฟิศ → สยามพลาสติก อ.เมือง", km: "48", work: "ประชุมเปิดโปรเจคกับลูกค้า", note: "" },
    ],
    income: [],
    comment: "",
    submittedAt: "2026-09-08 09:15",
  },
  {
    month: "2026-08",
    status: "อนุมัติแล้ว",
    no: "EX-2569-0002",
    plate: "2กท 8890 เชียงใหม่",
    nickname: "กร",
    fuel: [
      { id: "F12", date: "2026-08-19", place: "ออฟฟิศ → ครัวคุณจิ ถ.ช้างคลาน", km: "22", work: "ตรวจงานหน้าร้านกับทีมออกแบบ", note: "" },
      { id: "F13", date: "2026-08-28", place: "ออฟฟิศ → เอ็มเทคเอ็นจิเนียริ่ง", km: "34", work: "ติดตามความคืบหน้ากับลูกค้า", note: "" },
    ],
    income: [],
    comment: "",
    submittedAt: "2026-09-01 10:05",
  },
];

/* บัญชีกับบุคคลเป็นคนเดียวกัน (E12) — ใบร่างเดือนปัจจุบันอยู่ที่ HR_CLAIMS
   ประวัติใบที่ยื่นแล้วคนละเดือนกับฝั่งบุคคล ให้หน้ารายการใบเบิกมีข้อมูลครบทุกสถานะ (ผู้ใช้สั่ง 9 ต.ค. 2569)
   เลขที่ EX-2569-0030 ถึง 0033 ไม่ชนกับเลขเดิม (สูงสุด 0029 ใน emp-requests) */
const ACC_CLAIMS: ExpenseClaim[] = [
  { month: "2026-09", status: "รออนุมัติ", no: "EX-2569-0033", plate: "2กจ 8841 เชียงใหม่", nickname: "อร", income: [], comment: "", submittedAt: "2026-10-02 16:10",
    fuel: [
      { id: "F171", date: "2026-09-11", place: "ออฟฟิศ → ธนาคารกสิกรไทย สาขานิมมานเหมินท์", km: "7", work: "นำฝากเช็คค่างวดจากลูกค้า", note: "" },
      { id: "F172", date: "2026-09-25", place: "ออฟฟิศ → สำนักงานสรรพากรพื้นที่เชียงใหม่ 1", km: "11", work: "ยื่นแบบ ภ.พ.30 ประจำเดือนสิงหาคม", note: "" },
    ],
    other: [{ id: "O171", kind: "ค่าเดินทาง", date: "2026-09-25", amount: "40", note: "ค่าจอดรถสำนักงานสรรพากร", file: "ใบเสร็จค่าจอดรถ.jpg" }] },
  { month: "2026-08", status: "อนุมัติแล้ว", no: "EX-2569-0032", plate: "2กจ 8841 เชียงใหม่", nickname: "อร", income: [], comment: "", submittedAt: "2026-09-01 11:30", decidedAt: "2026-09-03 10:20", paidIn: "2026-09",
    fuel: [
      { id: "F173", date: "2026-08-07", place: "ออฟฟิศ → สำนักงานประกันสังคมจังหวัดเชียงใหม่", km: "9", work: "ยื่นเงินสมทบประกันสังคมเดือนกรกฎาคม", note: "" },
      { id: "F174", date: "2026-08-20", place: "ออฟฟิศ → มั่นคงก่อสร้าง สำนักงานใหญ่", km: "26", work: "วางบิลและรับเช็คงวดที่ 2", note: "" },
    ] },
  { month: "2026-07", status: "ไม่อนุมัติ", no: "EX-2569-0031", plate: "2กจ 8841 เชียงใหม่", nickname: "อร", income: [], submittedAt: "2026-08-01 09:05", decidedAt: "2026-08-04 14:30",
    comment: "ระยะทางวันที่ 18 ก.ค. สูงกว่าเส้นทางจริง ตรวจเลขไมล์แล้วยื่นใหม่",
    fuel: [
      { id: "F175", date: "2026-07-18", place: "ออฟฟิศ → สยามพลาสติก อ.เมือง", km: "96", work: "วางบิลและรับเช็คค่าบริการ", note: "" },
    ] },
  { month: "2026-06", status: "ยกเลิก", no: "EX-2569-0030", plate: "2กจ 8841 เชียงใหม่", nickname: "อร", income: [], comment: "", submittedAt: "2026-07-02 10:40",
    fuel: [],
    other: [{ id: "O172", kind: "ค่าอุปกรณ์และวัสดุ", date: "2026-06-26", amount: "320", note: "ซื้อแฟ้มเก็บเอกสารภาษี", file: "ใบเสร็จ.jpg" }] },
];

/* ฝ่ายบุคคล — เดินเอกสารประกันสังคมและสรรพากรเป็นงานประจำเดือน จึงมีค่าน้ำมันทุกเดือน
   ไม่มีค่าคอมมิชชั่น เพราะตำแหน่งนี้ไม่ได้อยู่ในตาราง HR_COMMISSION */
/* ทีมงานยังไม่เคยตั้งเบิก — เริ่มจากศูนย์ */
const STAFF_CLAIMS: ExpenseClaim[] = [];

const HR_CLAIMS: ExpenseClaim[] = [
  {
    month: "2026-09",
    status: "ร่าง",
    plate: "2กจ 8841 เชียงใหม่",
    nickname: "อร",
    fuel: [
      { id: "F31", date: "2026-09-04", place: "ออฟฟิศ → สำนักงานประกันสังคม", km: "9", work: "ยื่นแบบขึ้นทะเบียนพนักงานใหม่", note: "" },
    ],
    income: [],
    comment: "",
    submittedAt: "",
  },
];

/*
 * ตัวอย่างใบเบิกรอบปัจจุบัน (ก.ย. – ต.ค. 2569) สำหรับสาธิต (เจ้าของสั่ง 8 ต.ค. 2569)
 * ใบเบิกหนึ่งใบต่อหนึ่งเดือน — เครื่องที่เก็บข้อมูลไว้แล้วได้ใบของ "เดือนที่ยังไม่มี" เพิ่มผ่าน addMissingClaims
 * เดือนที่ผู้ใช้มีใบอยู่แล้ว (แม้เป็นใบร่าง) ไม่ถูกแตะ
 */
const CLAIMS_OCT_2569: Partial<Record<Role, ExpenseClaim[]>> = {
  sales: [
    { month: "2026-10", status: "ร่าง", plate: "1กจ 4471 เชียงใหม่", nickname: "ชม", income: [], comment: "", submittedAt: "",
      fuel: [
        { id: "F101", date: "2026-10-01", place: "ออฟฟิศ – เอ็มเทคเอ็นจิเนียริ่ง อ.สารภี", km: "34", work: "นำเสนอใบเสนอราคาระบบ ERP", note: "" },
        { id: "F102", date: "2026-10-06", place: "ออฟฟิศ – บุญมีฟาร์ม อ.สันทราย", km: "41", work: "เข้าพบลูกค้าเก็บความต้องการ", note: "" },
      ],
      other: [{ id: "O101", kind: "ค่ารับรองลูกค้า", date: "2026-10-06", amount: "850", note: "เลี้ยงกาแฟลูกค้าหลังประชุม", file: "ใบเสร็จร้านกาแฟ.jpg" }] },
  ],
  ps: [
    { month: "2026-09", status: "รออนุมัติ", no: "EX-2569-0026", plate: "1กจ 4471 เชียงใหม่", nickname: "ปุ๊ก", income: [], comment: "", submittedAt: "2026-10-01 09:40",
      fuel: [
        { id: "F111", date: "2026-09-16", place: "ออฟฟิศ – สยามพลาสติก อ.เมือง", km: "48", work: "สาธิตระบบให้ทีมลูกค้า", note: "" },
        { id: "F112", date: "2026-09-24", place: "ออฟฟิศ – มั่นคงก่อสร้าง ไซต์งาน", km: "76", work: "สำรวจระบบเครือข่ายหน้างาน", note: "" },
      ] },
  ],
  pm: [
    { month: "2026-10", status: "ร่าง", plate: "2กท 8890 เชียงใหม่", nickname: "กร", income: [], comment: "", submittedAt: "",
      fuel: [
        { id: "F121", date: "2026-10-03", place: "ออฟฟิศ → บุญมีฟาร์ม อ.สันทราย", km: "41", work: "คุมงานติดตั้งระบบหน้างาน", note: "" },
      ] },
  ],
  hr: [
    { month: "2026-10", status: "ร่าง", plate: "2กจ 8841 เชียงใหม่", nickname: "อร", income: [], comment: "", submittedAt: "",
      fuel: [
        { id: "F131", date: "2026-10-05", place: "ออฟฟิศ → สำนักงานสรรพากรพื้นที่", km: "11", work: "ยื่นแบบ ภ.ง.ด.1 ประจำเดือนกันยายน", note: "" },
      ] },
  ],
  staff: [
    { month: "2026-10", status: "ร่าง", plate: "ขค 8812 เชียงใหม่", nickname: "มายด์", income: [], comment: "", submittedAt: "",
      fuel: [
        { id: "F141", date: "2026-10-02", place: "ออฟฟิศ – ครัวคุณจิ ถ.ช้างคลาน", km: "22", work: "ถ่ายภาพเมนูใหม่ทำเนื้อหาเว็บไซต์", note: "" },
      ] },
    { month: "2026-09", status: "รออนุมัติ", no: "EX-2569-0023", plate: "ขค 8812 เชียงใหม่", nickname: "มายด์", income: [], comment: "", submittedAt: "2026-10-01 10:15",
      fuel: [
        { id: "F142", date: "2026-09-15", place: "ออฟฟิศ – อัลฟ่าคอร์ป สาขาเชียงใหม่", km: "12", work: "อบรมการใช้งานระบบหลังบ้านเว็บไซต์", note: "" },
        { id: "F143", date: "2026-09-23", place: "ออฟฟิศ – พูลผลอะไหล่ อ.หางดง", km: "29", work: "เก็บข้อมูลสินค้าทำแคตตาล็อกออนไลน์", note: "" },
      ],
      other: [{ id: "O141", kind: "ค่าอุปกรณ์และวัสดุ", date: "2026-09-23", amount: "390", note: "ซื้อฉากถ่ายภาพสินค้า", file: "ใบเสร็จ.jpg" }] },
  ],
  gm: [
    { month: "2026-09", status: "รออนุมัติ", no: "EX-2569-0025", plate: "1กข 2025 เชียงใหม่", nickname: "เสริฐ", income: [], comment: "", submittedAt: "2026-10-02 08:50",
      fuel: [
        { id: "F151", date: "2026-09-18", place: "ออฟฟิศ – มั่นคงก่อสร้าง สำนักงานใหญ่", km: "26", work: "ประชุมผู้บริหารลูกค้าเรื่องสัญญาบำรุงรักษา", note: "" },
      ],
      other: [{ id: "O151", kind: "ค่ารับรองลูกค้า", date: "2026-09-18", amount: "2450", note: "รับประทานอาหารกลางวันกับผู้บริหารลูกค้า", file: "ใบกำกับภาษีร้านอาหาร.pdf" }] },
  ],
  maid: [
    { month: "2026-10", status: "ร่าง", plate: "", nickname: "ป้าเรือน", income: [], comment: "", submittedAt: "", fuel: [],
      other: [{ id: "O161", kind: "ค่าอุปกรณ์และวัสดุ", date: "2026-10-05", amount: "640", note: "น้ำยาถูพื้นและถุงขยะ", file: "ใบเสร็จ.jpg" }] },
    { month: "2026-09", status: "อนุมัติแล้ว", no: "EX-2569-0024", plate: "", nickname: "ป้าเรือน", income: [], comment: "", submittedAt: "2026-09-26 15:20", decidedAt: "2026-09-28 10:05", fuel: [],
      other: [
        { id: "O162", kind: "ค่าอุปกรณ์และวัสดุ", date: "2026-09-10", amount: "520", note: "กระดาษชำระและสบู่ล้างมือ", file: "ใบเสร็จ.jpg" },
        { id: "O163", kind: "อื่นๆ", date: "2026-09-22", amount: "180", note: "น้ำดื่มต้อนรับลูกค้า", file: "ใบเสร็จ.jpg" },
      ] },
  ],
};

/** เติมใบเบิกของเดือนที่ยังไม่มีในเครื่อง — เดือนที่มีใบอยู่แล้วไม่ถูกแตะ */
export function addMissingClaims(have: ExpenseClaim[], seed: ExpenseClaim[]): ExpenseClaim[] {
  const months = new Set(have.map((c) => c.month));
  const add = seed.filter((c) => !months.has(c.month));
  return add.length ? [...add, ...have] : have;
}

/* ใบเบิกแยกตามบทบาท เพราะหนึ่งบทบาทคือหนึ่งคน (ดู role-store.ts) */
export const EXPENSE_CLAIMS: Record<Role, ExpenseClaim[]> = {
  sales: [...CLAIMS_OCT_2569.sales!, ...SALES_CLAIMS],
  ps: [...CLAIMS_OCT_2569.ps!],
  pm: [...CLAIMS_OCT_2569.pm!, ...PM_CLAIMS],
  acc: ACC_CLAIMS,
  hr: [...CLAIMS_OCT_2569.hr!, ...HR_CLAIMS],
  staff: [...CLAIMS_OCT_2569.staff!, ...STAFF_CLAIMS],
  gm: [...CLAIMS_OCT_2569.gm!],
  ceo: [],
  /* นักศึกษาฝึกงานไม่มีเมนูนี้ */
  intern: [],
  maid: [...CLAIMS_OCT_2569.maid!],
};


/* ── ตรวจก่อนยื่น ───────────────────────────────────────────────
 * ส่งใบที่กรอกไม่ครบไปให้หัวหน้า = ถูกตีกลับแน่นอน เสียเวลาทั้งสองฝ่าย
 * จึงตรวจให้ครบตั้งแต่ตอนกรอก และบอกเป็นรายแถวว่าขาดอะไร
 */

/** ตัวคั่นต้นทาง–ปลายทางที่ยอมรับ — ลูกศร ขีด หรือคำว่า "ถึง" / "ไป" */
const ROUTE_SPLIT = /→|->|—|–|-|ถึง|ไป(?:ที่)?/;

/** เส้นทางบอกครบทั้งสองปลายไหม — ทั้งสองฝั่งของตัวคั่นต้องมีตัวอักษร */
function routeEnds(place: string) {
  const parts = place.split(ROUTE_SPLIT).map((x) => x.trim());
  return parts.length >= 2 && parts[0].length > 0 && parts.slice(1).some((x) => x.length > 0);
}

/** ช่องในแถวค่าน้ำมันที่ยังไม่ครบ — ไม่มีชื่อช่องแปลว่าแถวนี้ครบแล้ว */
export type FuelMiss = { field: "" | "date" | "place" | "km" | "work"; why: string };

/**
 * แถวค่าน้ำมันแถวนี้ยังขาดอะไร และขาดที่ "ช่องไหน"
 * หน้าจอต้องชี้ลงไปถึงช่อง ไม่ใช่บอกแค่ว่ายื่นไม่ได้ (กติกา: ปฏิเสธเมื่อไรต้องบอกเหตุผล)
 */
export function fuelRowMiss(row: FuelRow, month: string): FuelMiss {
  if (!row.date) return { field: "date", why: "ยังไม่ได้เลือกวันที่" };
  if (row.date.slice(0, 7) !== month)
    return { field: "date", why: "วันที่ไม่ได้อยู่ในเดือนที่เบิก" };
  if (!row.place.trim()) return { field: "place", why: "ยังไม่ได้กรอกเส้นทาง (ต้นทาง → ปลายทาง)" };
  /* ต้องมีทั้งต้นทางและปลายทาง (เจ้าของสั่ง 24 ก.ย. 2569)
     "ไปหาลูกค้า" เฉย ๆ ทำให้ผู้อนุมัติจ่ายเงินโดยไม่รู้ว่าไปไหน และตรวจย้อนหลังไม่ได้
     รับตัวคั่นหลายแบบ เพราะคนพิมพ์ลูกศรไม่เหมือนกัน */
  if (!routeEnds(row.place))
    return { field: "place", why: "เส้นทางต้องบอกทั้งต้นทางและปลายทาง เช่น ออฟฟิศ → ลูกค้า" };
  if (num(row.km) <= 0) return { field: "km", why: "ระยะทางต้องมากกว่า 0" };
  if (!row.work.trim()) return { field: "work", why: "ยังไม่ได้กรอกงานที่ไปปฏิบัติ" };
  return { field: "", why: "" };
}

/** ข้อความบอกว่าแถวค่าน้ำมันแถวนี้ยังขาดอะไร — ว่างแปลว่าครบ */
export function fuelRowProblem(row: FuelRow, month: string): string {
  return fuelRowMiss(row, month).why;
}

/** ข้อความบอกว่าแถวค่าคอมแถวนี้ยังขาดอะไร — ว่างแปลว่าครบ */
export function incomeRowProblem(row: IncomeRow): string {
  if (!row.item.trim()) return "ยังไม่ได้กรอกรายการ";
  if (num(row.amount) <= 0) return "จำนวนเงินต้องมากกว่า 0";
  return "";
}

export type ClaimCheck = {
  /** ยื่นได้ไหม */
  ok: boolean;
  /** เหตุผลที่ยื่นไม่ได้ อ่านแล้วรู้เลยว่าต้องไปแก้ตรงไหน */
  reasons: string[];
};

export function checkClaim(claim: ExpenseClaim): ClaimCheck {
  const reasons: string[] = [];

  if (!claim.fuel.length && !claim.income.length && !claim.other?.length) {
    reasons.push("ยังไม่มีรายการในใบนี้");
  }
  if (claim.fuel.length && !claim.plate.trim()) {
    reasons.push("เบิกค่าน้ำมันต้องกรอกป้ายทะเบียนรถ");
  }

  const badFuel = claim.fuel
    .map((r, i) => ({ i: i + 1, why: fuelRowProblem(r, claim.month) }))
    .filter((x) => x.why);
  /* บอกเป็นรายแถวพร้อมชื่อช่อง — อ่านแล้วเดินไปแก้ได้เลยว่าแถวไหนช่องไหน */
  for (const x of badFuel) reasons.push(`ค่าน้ำมันครั้งที่ ${x.i}: ${x.why}`);

  const badOther = (claim.other ?? [])
    .map((r, i) => ({ i: i + 1, why: otherRowProblem(r, claim.month) }))
    .filter((x) => x.why);
  for (const x of badOther) reasons.push(`ค่าใช้จ่ายอื่นลำดับ ${x.i}: ${x.why}`);

  const badIncome = claim.income
    .map((r, i) => ({ i: i + 1, why: incomeRowProblem(r) }))
    .filter((x) => x.why);
  for (const x of badIncome) reasons.push(`ค่าคอมลำดับ ${x.i}: ${x.why}`);

  return { ok: reasons.length === 0, reasons };
}
