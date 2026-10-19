/*
 * งานฝ่ายบัญชี — วางบิล → รับชำระ → ออกใบเสร็จ → ยื่นภาษีหัก ณ ที่จ่าย
 *
 * ดีลที่ปิดการขายแล้วเข้ามาที่ "วางบิล" ให้ตั้งงวดชำระและออกใบแจ้งหนี้
 * การออกใบเสร็จคือการบันทึกว่าลูกค้าชำระงวดนั้นแล้ว ไม่มีขั้นบันทึกรับเงินแยก (AC-BR-05)
 * งวดถัดไปออกใบแจ้งหนี้ได้ก็ต่อเมื่องวดก่อนหน้าออกใบเสร็จแล้ว (AC-BR-04)
 *
 * กติกาเอกสารที่ต้องรักษาไว้เมื่อต่อ backend:
 * เอกสารที่ออกเลขแล้วห้ามลบและห้ามยกเลิกเพื่อออกใหม่ ต้องแก้ในใบเดิมและลง document_change_log
 *
 * ยังไม่มี backend — เมื่อต่อ API แล้วให้แทนที่ด้วยตาราง
 * installment / invoice / payment / receipt / collection_log / wht_payable
 */

/* อัตราภาษีใช้ชุดเดียวกับฝ่ายขาย ไม่ประกาศซ้ำ ไม่งั้นสองฝ่ายคิดยอดไม่ตรงกัน */
import { vatRate, whtRate } from "./crm-data";
import { round2, todayIso } from "./format";
import { merged } from "./catalog";
import { settings, whtRateOn } from "./system-settings";

export { vatRate, whtRate };

// ═══ ดีลที่รอวางบิล ════════════════════════════════════════════
export type Installment = {
  seq: number;
  /** สัดส่วนของยอดสุทธิ — รวมทุกงวดต้องเท่ากับยอดดีลพอดี */
  pct: number;
  amount: number;
  due: string;
};

export type AccDeal = {
  no: string;
  cus: string;
  quo: string;
  quoDate: string;
  /** ยอดก่อนภาษีทั้งดีล — ตรงกับยอดในใบเสนอราคาของฝ่ายขาย */
  base: number;
  /** ผู้ออกเอกสารจดภาษีมูลค่าเพิ่มหรือไม่ — ตามผู้ออกใบเสนอราคา */
  vat: boolean;
  /**
   * ยอดภาษีหัก ณ ที่จ่ายทั้งดีล — ค่าที่ยกมาจากใบเสนอราคาของดีลนี้ ไม่ใช่ค่าที่หน้าจอคิดเอง
   * 0 = ไม่หัก (ลูกค้าบุคคลธรรมดา หรือใบเสนอราคาไม่ได้ระบุให้หัก) ต้องเขียนบนเอกสารว่าไม่หัก
   */
  wht: number;
  /** อัตราที่ใช้หัก — ไว้พิมพ์บนเอกสาร งานคนละประเภทคนละอัตรา · 0 = ไม่หัก */
  whtPct: number;
  /** ยอดที่ลูกค้าโอนจริงทั้งดีล = ก่อนภาษี + VAT − หัก ณ ที่จ่าย */
  net: number;
  scope: string;
  plan: Installment[];
  /**
   * ดีลถูกยกเลิกหลังปิดการขาย — วางบิลงวดต่อไม่ได้แล้ว
   * note = บันทึกเพิ่มเติมว่าตกลงอะไรกับลูกค้าไว้ (ไม่บังคับ) — เจ้าของระบบสั่งเพิ่ม 24 ก.ย. 2569
   * เพราะคนที่มาอ่านย้อนหลังต้องรู้ว่าเรื่องนี้จบลงอย่างไร ไม่ใช่รู้แค่ว่ายกเลิกเพราะอะไร
   */
  cancelled?: { at: string; by: string; why: string; note?: string };
  /** false = ดีลใหม่ที่ฝ่ายบัญชียังไม่ได้เปิดดู ขึ้นจุดแดงที่เมนูวางบิลและแท็บรอวางบิล (AC-BR-01) */
  accSeen?: boolean;
};

// ═══ เงื่อนไขชำระเงินที่ฝ่ายขายตกลงกับลูกค้า ═══════════════════
/*
 * เงื่อนไขชำระเงินอยู่ในใบเสนอราคาเป็นข้อความอิสระ ฝ่ายขายพิมพ์เองได้ทุกแบบ
 * ฝ่ายบัญชีต้องเห็นข้อความเดิมก่อนเสมอ แล้วค่อยตั้งงวดตามนั้น
 * ตั้งงวดให้อัตโนมัติได้เฉพาะตอนที่อ่านเป็นสัดส่วนได้ชัดเจนจริง ๆ
 * เดาผิดอันตรายกว่าไม่เดา เพราะลูกค้าจะได้ใบแจ้งหนี้ที่ขัดกับที่ตกลงไว้
 */

/** เจอคำเหล่านี้แปลว่าเปอร์เซ็นต์ในข้อความอาจไม่ใช่สัดส่วนงวด — ไม่เดาเด็ดขาด */
const NOT_PLAN_WORDS = ["ส่วนลด", "ลดราคา", "ดอกเบี้ย", "ค่าปรับ", "ภาษี", "vat", "แวต", "หัก ณ ที่จ่าย"];

/**
 * อ่านเงื่อนไขชำระเงินเป็นสัดส่วนงวด — คืน null เมื่ออ่านไม่ได้แน่ชัด
 *
 * กติกาที่ตั้งไว้ให้เข้มไว้ก่อน:
 * ต้องมีตัวเลขตามด้วย % อย่างน้อยหนึ่งตัว · ทุกตัวอยู่ระหว่าง 0–100 · รวมกันได้ 100 พอดี
 * และต้องไม่มีคำที่ทำให้เปอร์เซ็นต์นั้นเป็นเรื่องอื่น (เช่น ส่วนลด ภาษี)
 * "มัดจำ 50% ก่อนเริ่มงาน" รวมได้ 50 ไม่ใช่ 100 จึงถือว่าอ่านไม่ได้ ไม่เติมอีก 50 ให้เอง
 */
export function parseTermsPct(terms: string): number[] | null {
  const text = (terms ?? "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (NOT_PLAN_WORDS.some((w) => lower.includes(w))) return null;

  const found = [...text.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => parseFloat(m[1]));
  /* 12 งวดคือเพดานที่สมเหตุสมผล มากกว่านี้แปลว่าอ่านข้อความผิดมากกว่าเป็นแผนงวดจริง */
  if (!found.length || found.length > 12) return null;
  if (found.some((p) => !(p > 0) || p > 100)) return null;
  if (round2(found.reduce((a, p) => a + p, 0)) !== 100) return null;
  return found;
}

/**
 * แปลงสัดส่วนที่อ่านได้เป็นงวดชำระพร้อมจำนวนเงิน
 * เศษสตางค์ตกที่งวดสุดท้าย ยอดรวมจะได้เท่ายอดสุทธิพอดีตาม AC-BR-03
 */
export function planFromPct(net: number, pcts: number[]): Installment[] {
  let left = round2(net);
  return pcts.map((pct, i) => {
    const amount = i === pcts.length - 1 ? left : round2((net * pct) / 100);
    left = round2(left - amount);
    return { seq: i + 1, pct, amount, due: "" };
  });
}

/**
 * แยกยอดของใบแจ้งหนี้หนึ่งงวดเป็น ฐานภาษี · VAT · หัก ณ ที่จ่าย — ยอดที่ต้องชำระคือยอดงวดพอดี (AC-BR-02)
 *
 * ยอดดีลคือยอดรวมทั้งสิ้นตามใบเสนอราคา (ฐาน + VAT − หัก ณ ที่จ่าย) จึงไม่คิดภาษีทับเข้าไปอีก
 * แต่ต้องถอดกลับมาเก็บทีละบรรทัด เพราะใบแจ้งหนี้กับใบเสร็จ/ใบกำกับภาษีต้องพิมพ์ครบสี่บรรทัด
 * วิธีถอด: แบ่งฐานภาษีตามสัดส่วนของยอดงวด แล้วให้ส่วนต่างตกที่ภาษี ยอดรวมจะได้เท่ายอดงวดเสมอ
 */
export function invoiceAmounts(deal: AccDeal, amount: number) {
  const total = round2(amount);
  /* สัดส่วนของงวดนี้ต่อทั้งดีล — ใช้ตัวเดียวกันกับทั้งฐานภาษีและภาษีหัก ณ ที่จ่าย ยอดจึงลงตัวเสมอ */
  const share = deal.net ? total / deal.net : 1;
  /* ภาษีหัก ณ ที่จ่ายมาจากใบเสนอราคาเท่านั้น ไม่มีค่ามาก็คือไม่หัก ห้ามคิดอัตราให้เอง */
  const wht = round2((deal.wht || 0) * share);
  const base = deal.net && deal.vat ? round2(deal.base * share) : round2(total + wht);
  /* เศษจากการปัดตกที่ VAT ยอดรวมจะได้เท่ายอดงวดพอดี (ฐาน + VAT − หัก ณ ที่จ่าย = ยอดงวด) */
  const vat = deal.vat ? round2(total + wht - base) : 0;
  return { base, vat, wht, total };
}

export const ACC_DEALS: AccDeal[] = [
  /* ต้นแบบ dose-erp-maz/billing.html DEALS (4 ดีล) — ยอดสุทธิตรงกับดีลของฝ่ายขาย */
  {
    no: "DL-2569-0009", cus: "สยามพลาสติก", quo: "MAZ-2569-0042", quoDate: "2026-09-02",
    base: 320000, vat: true, wht: 0, whtPct: 0, net: 342400,
    scope: "ระบบจัดการคลังสินค้าและอบรมการใช้งาน",
    plan: [
      { seq: 1, pct: 50, amount: 171200, due: "2026-09-15" },
      { seq: 2, pct: 50, amount: 171200, due: "2026-10-15" },
    ],
  },
  {
    no: "DL-2569-0007", cus: "พูลผลอะไหล่", quo: "MAZ-2569-0040", quoDate: "2026-08-28",
    base: 175000, vat: true, wht: 0, whtPct: 0, net: 187250,
    /* ดีลใหม่ที่ฝ่ายบัญชียังไม่ได้เปิดดู */
    accSeen: false,
    scope: "ระบบขายหน้าร้านและสต๊อกอะไหล่",
    plan: [],
  },
  {
    no: "DL-2569-0017", cus: "ครัวคุณจิ", quo: "MAZ-2569-0036", quoDate: "2026-08-01",
    base: 26000, vat: false, wht: 0, whtPct: 0, net: 26000,
    scope: "ทำเว็บไซต์ร้านอาหารพร้อมระบบจองโต๊ะ",
    plan: [
      { seq: 1, pct: 40, amount: 10400, due: "2026-08-20" },
      { seq: 2, pct: 60, amount: 15600, due: "2026-09-05" },
    ],
    cancelled: { at: "2026-09-06", by: "ฝ่ายบัญชี", why: "ลูกค้ายุติโครงการหลังชำระงวดแรก" },
  },
  {
    no: "DL-2569-0018", cus: "เอ็มเทคเอ็นจิเนียริ่ง", quo: "MAZ-2569-0038", quoDate: "2026-07-08",
    base: 39000, vat: true, wht: 1170, whtPct: 3, net: 40560,
    scope: "เว็บไซต์บริษัทและระบบฟอร์มติดต่อ",
    plan: [{ seq: 1, pct: 100, amount: 40560, due: "2026-07-25" }],
  },
  /*
   * วางบิลงวดแรกของโปรเจคตั้งต้นที่เหลือ (ผู้ใช้สั่ง 5 ต.ค. 2569) — โปรเจคผูกกับใบแจ้งหนี้งวดแรก
   * ทุกโปรเจคและงานในกล่อง PM จึงต้องมีใบแจ้งหนี้งวดแรกที่ชำระแล้วอยู่จริงในฝั่งบัญชี
   */
  {
    no: "DL-2569-0015", cus: "อัลฟ่าคอร์ป", quo: "MAZ-2569-0028", quoDate: "2026-05-15",
    base: 145000, vat: false, wht: 0, whtPct: 0, net: 145000,
    scope: "ระบบจัดการเอกสารภายในองค์กร",
    plan: [{ seq: 1, pct: 100, amount: 145000, due: "2026-05-30" }],
  },
  {
    no: "DL-2569-0029", cus: "เซลล่า ไทยแลนด์", quo: "MAZ-2569-0046", quoDate: "2026-08-26",
    base: 96000, vat: false, wht: 0, whtPct: 0, net: 96000,
    scope: "Digital Marketing 1 แคมเปญ ระยะ 3 เดือน",
    plan: [
      { seq: 1, pct: 50, amount: 48000, due: "2026-09-01" },
      { seq: 2, pct: 50, amount: 48000, due: "2026-10-01" },
    ],
  },
  {
    no: "DL-2569-0031", cus: "ครัวคุณจิ", quo: "MAZ-2569-0048", quoDate: "2026-09-03",
    base: 8500, vat: false, wht: 0, whtPct: 0, net: 8500,
    scope: "แก้แบนเนอร์โปรโมชันหน้าเว็บ 3 ชิ้น",
    plan: [{ seq: 1, pct: 100, amount: 8500, due: "2026-09-05" }],
  },
  {
    no: "DL-2569-0026", cus: "บุญมีฟาร์ม", quo: "MAZ-2569-0045", quoDate: "2026-09-04",
    base: 128000, vat: false, wht: 0, whtPct: 0, net: 128000,
    scope: "เว็บไซต์ฟาร์มและระบบสั่งจองล่วงหน้า",
    plan: [
      { seq: 1, pct: 40, amount: 51200, due: "2026-09-06" },
      { seq: 2, pct: 60, amount: 76800, due: "2026-10-05" },
    ],
  },
  {
    no: "DL-2569-0035", cus: "เอ็นอาร์ พร็อพเพอร์ตี้", quo: "MAZ-2569-0052", quoDate: "2026-09-01",
    base: 270000, vat: false, wht: 0, whtPct: 0, net: 270000,
    scope: "Digital Marketing 3 แคมเปญ ระยะ 6 เดือน",
    plan: [
      { seq: 1, pct: 34, amount: 91800, due: "2026-09-06" },
      { seq: 2, pct: 33, amount: 89100, due: "2026-10-06" },
      { seq: 3, pct: 33, amount: 89100, due: "" },
    ],
  },
  {
    no: "DL-2569-0033", cus: "อัลฟ่าคอร์ป", quo: "MAZ-2569-0050", quoDate: "2026-09-05",
    base: 15000, vat: false, wht: 0, whtPct: 0, net: 15000,
    scope: "ต่ออายุโฮสติ้งและย้ายขึ้นเซิร์ฟเวอร์ใหม่",
    plan: [{ seq: 1, pct: 100, amount: 15000, due: "2026-09-07" }],
  },
];

// ═══ ใบแจ้งหนี้ ════════════════════════════════════════════════
export type InvoiceStatus = "pending" | "partial" | "paid" | "cancelled";

export const INVOICE_STATUS: Record<InvoiceStatus, { label: string; cls: string }> = {
  pending: { label: "รอชำระ", cls: "t-early" },
  partial: { label: "ชำระบางส่วน", cls: "t-early" },
  paid: { label: "ชำระครบ", cls: "t-ok" },
  cancelled: { label: "ยกเลิก", cls: "t-miss" },
};

export type Collection = {
  date: string;
  channel: string;
  result: string;
  next: string;
};

/* ช่องทางติดตามหนี้ — ผู้ดูแลระบบแก้ได้ที่ /admin/options (optionsOf("collectChannel")) */

export type Invoice = {
  no: string;
  deal: string;
  cus: string;
  seq: number;
  issue: string;
  due: string;
  base: number;
  vat: number;
  /** ภาษีหัก ณ ที่จ่ายที่คาดว่าลูกค้าจะหัก ตามใบเสนอราคา — 0 = ไม่หัก */
  wht: number;
  /** ยอดที่ลูกค้าต้องโอน = ฐาน + VAT − หัก ณ ที่จ่าย */
  total: number;
  /**
   * มูลค่างวดที่ยังไม่ได้รับชำระ คิดก่อนหักภาษี ณ ที่จ่าย (ฐาน + VAT)
   * ต้องคิดก่อนหัก เพราะเงินที่ลูกค้าหักไว้ถือว่าจ่ายแล้ว (นำส่งกรมสรรพากรแทนเรา)
   * ไม่งั้นงวดที่ถูกหักภาษีจะค้างยอดเท่าภาษีที่ถูกหักตลอดไป
   */
  outstanding: number;
  status: InvoiceStatus;
  /**
   * ใบที่ถูกยกเลิกไปพร้อมดีล — เก็บไว้ว่าใครยกเลิกและเมื่อไร (ผู้ใช้กำหนด 21 ก.ย. 2569)
   * ต้องมีชื่อคนกับเวลาเสมอ ไม่งั้นย้อนกลับมาดูทีหลังไม่รู้ว่าใครสั่ง
   * note = สิ่งที่ตกลงกับลูกค้าไว้ เช่นออกเอกสารอะไรในโปรแกรมบัญชี — ไม่บังคับกรอก
   */
  cancelled?: { at: string; by: string; why: string; note?: string };
  col: Collection[];
};

export const ACC_INVOICES: Invoice[] = [
  /* ต้นแบบ billing.html INVOICES (4 ใบ) — ออกใบเสร็จแล้ว = ชำระครบ */
  {
    no: "INV-2569-0014", deal: "DL-2569-0009", cus: "สยามพลาสติก", seq: 1,
    issue: "2026-09-02", due: "2026-09-15",
    base: 160000, vat: 11200, wht: 0, total: 171200,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0018", deal: "DL-2569-0017", cus: "ครัวคุณจิ", seq: 1,
    issue: "2026-08-05", due: "2026-08-20",
    base: 10400, vat: 0, wht: 0, total: 10400,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0031", deal: "DL-2569-0017", cus: "ครัวคุณจิ", seq: 2,
    issue: "2026-08-21", due: "2026-09-05",
    base: 15600, vat: 0, wht: 0, total: 15600,
    /* ยกเลิกตามดีล — ยอดค้างเป็นศูนย์ ไม่ต้องตามเก็บ */
    outstanding: 0, status: "cancelled",
    cancelled: { at: "2026-09-06 14:05", by: "ฝ่ายบัญชี", why: "ลูกค้ายุติโครงการหลังชำระงวดแรก" },
    col: [
      {
        date: "2026-09-01", channel: "โทรศัพท์",
        result: "ฝ่ายบัญชีลูกค้าแจ้งรอบจ่ายทุกวันที่ 25", next: "2026-09-25",
      },
    ],
  },
  {
    no: "INV-2569-0022", deal: "DL-2569-0018", cus: "เอ็มเทคเอ็นจิเนียริ่ง", seq: 1,
    issue: "2026-07-10", due: "2026-07-25",
    base: 39000, vat: 2730, wht: 1170, total: 40560,
    outstanding: 0, status: "paid", col: [],
  },
  /* ใบแจ้งหนี้งวดแรกของโปรเจคตั้งต้นที่เหลือ — ชำระแล้วทุกใบ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  {
    no: "INV-2569-0032", deal: "DL-2569-0015", cus: "อัลฟ่าคอร์ป", seq: 1,
    issue: "2026-05-20", due: "2026-05-30",
    base: 145000, vat: 0, wht: 0, total: 145000,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0033", deal: "DL-2569-0029", cus: "เซลล่า ไทยแลนด์", seq: 1,
    issue: "2026-08-27", due: "2026-09-01",
    base: 48000, vat: 0, wht: 0, total: 48000,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0034", deal: "DL-2569-0031", cus: "ครัวคุณจิ", seq: 1,
    issue: "2026-09-03", due: "2026-09-05",
    base: 8500, vat: 0, wht: 0, total: 8500,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0035", deal: "DL-2569-0026", cus: "บุญมีฟาร์ม", seq: 1,
    issue: "2026-09-04", due: "2026-09-06",
    base: 51200, vat: 0, wht: 0, total: 51200,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0036", deal: "DL-2569-0035", cus: "เอ็นอาร์ พร็อพเพอร์ตี้", seq: 1,
    issue: "2026-09-02", due: "2026-09-06",
    base: 91800, vat: 0, wht: 0, total: 91800,
    outstanding: 0, status: "paid", col: [],
  },
  {
    no: "INV-2569-0037", deal: "DL-2569-0033", cus: "อัลฟ่าคอร์ป", seq: 1,
    issue: "2026-09-05", due: "2026-09-07",
    base: 15000, vat: 0, wht: 0, total: 15000,
    outstanding: 0, status: "paid", col: [],
  },
  /*
   * ข้อมูลตัวอย่างเดือน ต.ค. 2569 (เจ้าของระบบสั่ง 8 ต.ค. 2569 — เดโมแล้วหน้าบัญชีเดือนนี้ว่าง)
   * งวดถัดไปของดีลที่มีอยู่แล้วเท่านั้น ไม่เปิดดีลใหม่ ฝั่งขายและ PM จึงอ้างถึงกันครบ
   * ยอดคิดด้วย invoiceAmounts ชุดเดียวกับตอนกดออกใบจริง · เครื่องที่มีข้อมูลเดิมได้รับผ่าน migrateAcc
   */
  {
    no: "INV-2569-0040", deal: "DL-2569-0029", cus: "เซลล่า ไทยแลนด์", seq: 2,
    issue: "2026-09-25", due: "2026-10-01",
    base: 48000, vat: 0, wht: 0, total: 48000,
    outstanding: 0, status: "paid", col: [],
  },
  {
    /* เลยกำหนดชำระ — ลูกค้าแจ้งรอรอบโอน */
    no: "INV-2569-0041", deal: "DL-2569-0026", cus: "บุญมีฟาร์ม", seq: 2,
    issue: "2026-09-28", due: "2026-10-05",
    base: 76800, vat: 0, wht: 0, total: 76800,
    outstanding: 76800, status: "pending",
    col: [
      {
        date: "2026-10-07", channel: "โทรศัพท์",
        result: "คุณเมธาวีแจ้งรอเงินขายผลผลิตเข้า จะโอนภายในสัปดาห์หน้า", next: "2026-10-12",
      },
    ],
  },
  {
    no: "INV-2569-0042", deal: "DL-2569-0035", cus: "เอ็นอาร์ พร็อพเพอร์ตี้", seq: 2,
    issue: "2026-10-01", due: "2026-10-06",
    base: 89100, vat: 0, wht: 0, total: 89100,
    outstanding: 0, status: "paid", col: [],
  },
  {
    /* ชำระมาครึ่งหนึ่ง ยังค้างอีกครึ่ง — ยังไม่ถึงกำหนด */
    no: "INV-2569-0043", deal: "DL-2569-0009", cus: "สยามพลาสติก", seq: 2,
    issue: "2026-10-01", due: "2026-10-15",
    base: 160000, vat: 11200, wht: 0, total: 171200,
    outstanding: 85600, status: "partial", col: [],
  },
];

// ═══ เงินที่รับเข้าจริง ═══════════════════════════════════════════
/* เกิดพร้อมใบเสร็จเสมอ (ออกใบเสร็จ = รับชำระ) — เก็บไว้ให้แดชบอร์ดรวมยอดรับเงินตามวันที่ */
export type Payment = {
  inv: string;
  date: string;
  /** เงินโอนเข้าบัญชี ไม่รวมภาษีที่ลูกค้าหักไว้ */
  received: number;
  wht: number;
  /** ได้หนังสือรับรองหัก ณ ที่จ่ายจากลูกค้าแล้วหรือยัง */
  certReceived: boolean;
};

export const ACC_PAYMENTS: Payment[] = [
  /* ต้นแบบสร้างจากใบเสร็จ (รับชำระ = ออกใบเสร็จ) */
  { inv: "INV-2569-0014", date: "2026-09-05", received: 171200, wht: 0, certReceived: true },
  { inv: "INV-2569-0018", date: "2026-08-18", received: 10400, wht: 0, certReceived: true },
  { inv: "INV-2569-0022", date: "2026-07-31", received: 40560, wht: 1170, certReceived: true },
  { inv: "INV-2569-0032", date: "2026-05-28", received: 145000, wht: 0, certReceived: true },
  { inv: "INV-2569-0033", date: "2026-09-01", received: 48000, wht: 0, certReceived: true },
  { inv: "INV-2569-0034", date: "2026-09-05", received: 8500, wht: 0, certReceived: true },
  { inv: "INV-2569-0035", date: "2026-09-06", received: 51200, wht: 0, certReceived: true },
  { inv: "INV-2569-0036", date: "2026-09-06", received: 91800, wht: 0, certReceived: true },
  { inv: "INV-2569-0037", date: "2026-09-07", received: 15000, wht: 0, certReceived: true },
  /* ข้อมูลตัวอย่างเดือน ต.ค. 2569 */
  { inv: "INV-2569-0040", date: "2026-10-02", received: 48000, wht: 0, certReceived: true },
  { inv: "INV-2569-0042", date: "2026-10-05", received: 89100, wht: 0, certReceived: true },
  { inv: "INV-2569-0043", date: "2026-10-06", received: 85600, wht: 0, certReceived: true },
];

// ═══ ใบเสร็จรับเงิน ════════════════════════════════════════════
export type Receipt = {
  no: string;
  inv: string;
  deal: string;
  seq: number;
  cus: string;
  date: string;
  /** ราคาก่อนภาษีของยอดที่รับชำระครั้งนี้ */
  base: number;
  vatAmount: number;
  /** ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้จริงในการจ่ายครั้งนี้ — 0 = ไม่ได้หัก */
  wht: number;
  /**
   * เงินที่ได้รับจริง = ราคาก่อนภาษี + VAT − ภาษีหัก ณ ที่จ่าย
   * ใบเสร็จต้องบอกยอดที่รับจริงเท่านั้น ออกใบเสร็จเกินกว่าเงินที่ได้รับคือเอกสารเท็จ
   */
  total: number;
  /** ได้หนังสือรับรองการหักภาษี ณ ที่จ่ายจากลูกค้าแล้วหรือยัง — ยังไม่ได้ต้องขึ้นหมายเหตุบนใบเสร็จ */
  certReceived: boolean;
  /** ผู้ออกจดทะเบียน VAT ไหม เป็นตัวกำหนดชื่อเอกสาร */
  vat: boolean;
};

export const ACC_RECEIPTS: Receipt[] = [
  /* ต้นแบบ billing.html / receipts.html RECEIPTS (3 ใบ) */
  {
    no: "RCP-2569-0006", inv: "INV-2569-0022", deal: "DL-2569-0018", seq: 1,
    cus: "เอ็มเทคเอ็นจิเนียริ่ง", date: "2026-07-31",
    base: 39000, vatAmount: 2730, wht: 1170, total: 40560, certReceived: true, vat: true,
  },
  {
    no: "RCP-2569-0005", inv: "INV-2569-0018", deal: "DL-2569-0017", seq: 1,
    cus: "ครัวคุณจิ", date: "2026-08-18",
    base: 10400, vatAmount: 0, wht: 0, total: 10400, certReceived: true, vat: true,
  },
  {
    no: "RCP-2569-0007", inv: "INV-2569-0014", deal: "DL-2569-0009", seq: 1,
    cus: "สยามพลาสติก", date: "2026-09-05",
    base: 160000, vatAmount: 11200, wht: 0, total: 171200, certReceived: true, vat: true,
  },
  {
    no: "RCP-2569-0008", inv: "INV-2569-0032", deal: "DL-2569-0015", seq: 1,
    cus: "อัลฟ่าคอร์ป", date: "2026-05-28",
    base: 145000, vatAmount: 0, wht: 0, total: 145000, certReceived: true, vat: false,
  },
  {
    no: "RCP-2569-0009", inv: "INV-2569-0033", deal: "DL-2569-0029", seq: 1,
    cus: "เซลล่า ไทยแลนด์", date: "2026-09-01",
    base: 48000, vatAmount: 0, wht: 0, total: 48000, certReceived: true, vat: false,
  },
  {
    no: "RCP-2569-0010", inv: "INV-2569-0034", deal: "DL-2569-0031", seq: 1,
    cus: "ครัวคุณจิ", date: "2026-09-05",
    base: 8500, vatAmount: 0, wht: 0, total: 8500, certReceived: true, vat: false,
  },
  {
    no: "RCP-2569-0011", inv: "INV-2569-0035", deal: "DL-2569-0026", seq: 1,
    cus: "บุญมีฟาร์ม", date: "2026-09-06",
    base: 51200, vatAmount: 0, wht: 0, total: 51200, certReceived: true, vat: false,
  },
  {
    no: "RCP-2569-0012", inv: "INV-2569-0036", deal: "DL-2569-0035", seq: 1,
    cus: "เอ็นอาร์ พร็อพเพอร์ตี้", date: "2026-09-06",
    base: 91800, vatAmount: 0, wht: 0, total: 91800, certReceived: true, vat: false,
  },
  {
    no: "RCP-2569-0013", inv: "INV-2569-0037", deal: "DL-2569-0033", seq: 1,
    cus: "อัลฟ่าคอร์ป", date: "2026-09-07",
    base: 15000, vatAmount: 0, wht: 0, total: 15000, certReceived: true, vat: false,
  },
  /* ข้อมูลตัวอย่างเดือน ต.ค. 2569 */
  {
    no: "RCP-2569-0015", inv: "INV-2569-0040", deal: "DL-2569-0029", seq: 2,
    cus: "เซลล่า ไทยแลนด์", date: "2026-10-02",
    base: 48000, vatAmount: 0, wht: 0, total: 48000, certReceived: true, vat: false,
  },
  {
    no: "RCP-2569-0016", inv: "INV-2569-0042", deal: "DL-2569-0035", seq: 2,
    cus: "เอ็นอาร์ พร็อพเพอร์ตี้", date: "2026-10-05",
    base: 89100, vatAmount: 0, wht: 0, total: 89100, certReceived: true, vat: false,
  },
  {
    /* รับบางส่วน 85,600 จากงวด 171,200 — ฐาน/VAT แยกตามสัดส่วนแบบเดียวกับ issueReceipt */
    no: "RCP-2569-0017", inv: "INV-2569-0043", deal: "DL-2569-0009", seq: 2,
    cus: "สยามพลาสติก", date: "2026-10-06",
    base: 80000, vatAmount: 5600, wht: 0, total: 85600, certReceived: true, vat: true,
  },
];

/** ผู้ออกเอกสารจดภาษีมูลค่าเพิ่มหรือไม่ — กำหนดชื่อเอกสารที่ออก ผู้ใช้เลือกเองไม่ได้ */
export const ISSUER_VAT = true;

/**
 * งวดนี้เป็นงวดที่เท่าไร — ฝ่ายบัญชีไม่ต้องรู้เลขดีล บอกแค่ลำดับงวดและเป็นงวดสุดท้ายหรือยัง (ต้นแบบ receipts.html seqText)
 */
export function seqText(seq: number, total: number) {
  if (total && seq >= total) return total > 1 ? `งวดสุดท้าย (งวดที่ ${seq})` : "ชำระครั้งเดียว";
  return `งวดที่ ${seq}${total ? ` จาก ${total} งวด` : ""}`;
}

export function receiptKind(vat: boolean) {
  return vat ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน";
}

/**
 * ข้อความบนเอกสารเรื่องภาษีหัก ณ ที่จ่าย — ต้องเขียนทุกใบ ไม่ว่าหักหรือไม่หัก
 * ไม่หักก็ต้องบอกว่าไม่หัก ลูกค้าจะได้ไม่ต้องเดาว่าลืมพิมพ์หรือจงใจ
 */
export const NO_WHT_NOTE = "ไม่หักภาษี ณ ที่จ่าย";

/** ลูกค้าหักภาษีไว้แล้วแต่ยังไม่ส่งหนังสือรับรองมา — ต้องขึ้นบนใบเสร็จเพื่อให้ทั้งสองฝ่ายรู้ว่ายังค้างเอกสารกันอยู่ */
export const WHT_CERT_WAIT = "รอรับหนังสือรับรองการหักภาษี ณ ที่จ่ายจากลูกค้า";

// ═══ ภาษีหัก ณ ที่จ่ายที่เราหักผู้ให้บริการภายนอก ═════════════════════════
/** 53 = นิติบุคคล · 3 = บุคคลธรรมดา */
export type WhtKind = "53" | "3";

export const WHT_KIND: Record<WhtKind, string> = {
  "53": "นิติบุคคล · ภ.ง.ด.53",
  "3": "บุคคลธรรมดา · ภ.ง.ด.3",
};

/*
 * ประเภทผู้ถูกหักภาษี — เอกสารที่บริษัทใช้มีแค่หนังสือรับรอง 50 ทวิ แยกตามประเภทนี้ (ผู้ใช้สั่ง 16 ต.ค. 2569)
 * juristic = นิติบุคคล (ภ.ง.ด.53) · individual = บุคคลธรรมดา (ภ.ง.ด.3)
 */
export type WhtPayee = "juristic" | "individual";

export const WHT_PAYEE: Record<WhtPayee, string> = {
  juristic: "นิติบุคคล",
  individual: "บุคคลธรรมดา",
};

export const payeeOfKind = (k: WhtKind): WhtPayee => (k === "3" ? "individual" : "juristic");
export const kindOfPayee = (p: WhtPayee): WhtKind => (p === "individual" ? "3" : "53");

/** รหัสประเภทเงินได้ที่หัก ณ ที่จ่าย — ชุดตั้งต้นด้านล่าง + ที่ผู้ดูแลระบบเพิ่ม (whtTypes()) */
export type WhtType = string;

export const BUILTIN_WHT_TYPES: { key: WhtType; label: string; rate: number }[] = [
  { key: "service", label: "ค่าบริการ / รับจ้างทำของ", rate: 3 },
  { key: "rent", label: "ค่าเช่าทรัพย์สิน", rate: 5 },
  { key: "ads", label: "ค่าโฆษณา", rate: 2 },
  { key: "transport", label: "ค่าขนส่ง", rate: 1 },
  { key: "pro", label: "ค่าวิชาชีพอิสระ", rate: 3 },
  { key: "other", label: "อื่นๆ", rate: 3 },
];

/**
 * ประเภทเงินได้ทั้งหมด — ผู้ดูแลระบบเพิ่ม/แก้ชื่อ/อัตราได้ที่ /admin/options
 * อัตราที่ตั้งวันเริ่มใช้ไว้ (whtHistory) มาก่อนเสมอ — ตั้งล่วงหน้าแล้วสลับเองเมื่อถึงวัน
 */
export function whtTypes() {
  const s = settings();
  const list = merged(s.catalog.whtTypes, BUILTIN_WHT_TYPES, (t) => t.key);
  if (!s.whtHistory.length) return list;
  const day = todayIso();
  return list.map((t) => ({ ...t, rate: whtRateOn(t.key, day, t.rate, s.whtHistory) }));
}

/** อัตราหัก ณ ที่จ่ายของประเภทนี้ ณ วันที่กำหนด — ใช้ดูย้อนหลัง */
export function whtRateAt(key: string, iso: string) {
  const s = settings();
  const base = merged(s.catalog.whtTypes, BUILTIN_WHT_TYPES, (t) => t.key).find((t) => t.key === key);
  return whtRateOn(key, iso, base?.rate ?? 3, s.whtHistory);
}

export function whtType(key: WhtType) {
  const all = whtTypes();
  return all.find((t) => t.key === key) ?? all[0];
}

export type WhtRow = {
  id: string;
  date: string;
  name: string;
  tax: string;
  kind: WhtKind;
  /** ประเภทผู้ถูกหักภาษี — ตรงกับ kind เสมอ (53 = นิติบุคคล · 3 = บุคคลธรรมดา) ข้อมูลเก่า migrate จาก kind (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  payeeType: WhtPayee;
  type: WhtType;
  base: number;
  rate: number;
  /** เลขที่หนังสือรับรองที่ออกให้ผู้ให้บริการ — ว่างแปลว่ายังไม่ได้ออก · ระบบออกเลขเอง (issueWht) */
  no: string;
  /* ช่องเพิ่มของแบบ 50 ทวิ (ผู้ใช้สั่ง 9 ต.ค. 2569) — ไม่บังคับ ข้อมูลเก่าในเครื่องไม่มีก็เปิดได้ */
  /** ที่อยู่ผู้ถูกหักภาษี */
  addr?: string;
  /** ผู้จ่ายเงิน — 1 หัก ณ ที่จ่าย (ค่าตั้งต้น) · 2 ออกให้ตลอดไป · 3 ออกให้ครั้งเดียว · 4 อื่น ๆ */
  cond?: WhtCond;
  /** ข้อความของเงื่อนไข "อื่น ๆ" */
  condNote?: string;
  /** วันที่ออกหนังสือรับรอง (yyyy-mm-dd) — รายการเก่าที่ไม่มีใช้วันที่จ่าย */
  issued?: string;
  /** เงินที่จ่ายเข้า กบข./กสจ./กองทุนสงเคราะห์ · ประกันสังคม · กองทุนสำรองเลี้ยงชีพ */
  gpf?: number;
  sso?: number;
  pvd?: number;
};

export type WhtCond = 1 | 2 | 3 | 4;

export const WHT_COND: Record<WhtCond, string> = {
  1: "หัก ณ ที่จ่าย",
  2: "ออกให้ตลอดไป",
  3: "ออกให้ครั้งเดียว",
  4: "อื่น ๆ",
};

/** แถวในตารางประเภทเงินได้ของแบบ 50 ทวิ */
export type WhtFormRow = "1" | "2" | "3" | "4a" | "4b" | "5" | "6";

/**
 * ประเภทเงินได้ของระบบ → แถวในแบบ 50 ทวิ
 * ค่าบริการ ค่าเช่า ค่าโฆษณา ค่าขนส่ง ค่าวิชาชีพ หักตามคำสั่งกรมสรรพากรที่ออกตามมาตรา 3 เตรส = แถว 5
 * ประเภทที่ผู้ดูแลเพิ่มเองดูจากชื่อ ไม่เข้าข่ายไปแถว 6 อื่น ๆ
 */
export function whtFormRow(key: WhtType): WhtFormRow {
  if (["service", "rent", "ads", "transport", "pro"].includes(key)) return "5";
  if (key === "other") return "6";
  const label = whtType(key)?.label ?? "";
  if (/นายหน้า|ค่าธรรมเนียม/.test(label)) return "2";
  if (/ลิขสิทธิ์|กู๊ดวิล/.test(label)) return "3";
  if (/ดอกเบี้ย/.test(label)) return "4a";
  if (/ปันผล/.test(label)) return "4b";
  if (/เงินเดือน|ค่าจ้าง(?!ทำ)|โบนัส/.test(label) && !/รับจ้าง/.test(label)) return "1";
  if (/บริการ|เช่า|โฆษณา|ขนส่ง|จ้างทำของ|รับเหมา|วิชาชีพ/.test(label)) return "5";
  return "6";
}

const SEED_WHT: Omit<WhtRow, "payeeType">[] = [
  { id: "W1", date: "2026-09-03", name: "บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)", tax: "0107536000081", kind: "53", type: "service", base: 2500, rate: 3, no: "MAZ-WHT-2569-0001" },
  { id: "W2", date: "2026-09-01", name: "บริษัท ไทยเรียลตี้ พร็อพเพอร์ตี้ จำกัด", tax: "0105551000123", kind: "53", type: "rent", base: 35000, rate: 5, no: "MAZ-WHT-2569-0002" },
  { id: "W3", date: "2026-09-05", name: "นายวิชัย ตั้งใจดี", tax: "1509901234567", kind: "3", type: "pro", base: 12000, rate: 3, no: "" },
  { id: "W4", date: "2026-08-28", name: "บริษัท เอสเอ็มโลจิสติกส์ จำกัด", tax: "0105549009911", kind: "53", type: "transport", base: 8400, rate: 1, no: "MAZ-WHT-2569-0014" },
  /* ข้อมูลตัวอย่างปลาย ก.ย. – ต.ค. 2569 — สองรายการท้ายยังไม่ได้ออกหนังสือรับรอง */
  { id: "W2609A", date: "2026-09-25", name: "บริษัท ซีเอ็นเอ็กซ์ คลาวด์ จำกัด", tax: "0505561004567", kind: "53", type: "service", base: 12000, rate: 3, no: "MAZ-WHT-2569-0015" },
  { id: "W2610A", date: "2026-10-01", name: "บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)", tax: "0107536000081", kind: "53", type: "service", base: 2800, rate: 3, no: "MAZ-WHT-2569-0016" },
  { id: "W2610B", date: "2026-10-01", name: "บริษัท ไทยเรียลตี้ พร็อพเพอร์ตี้ จำกัด", tax: "0105551000123", kind: "53", type: "rent", base: 35000, rate: 5, no: "MAZ-WHT-2569-0017" },
  { id: "W2610C", date: "2026-10-03", name: "บริษัท พลัสมีเดีย แอดเวอร์ไทซิ่ง จำกัด", tax: "0505560001234", kind: "53", type: "ads", base: 18500, rate: 2, no: "MAZ-WHT-2569-0018" },
  { id: "W2610D", date: "2026-10-05", name: "นางสาวพิมพ์ชนก แสงทอง", tax: "1509900777889", kind: "3", type: "pro", base: 15000, rate: 3, no: "MAZ-WHT-2569-0019" },
  { id: "W2610E", date: "2026-10-06", name: "บริษัท เอสเอ็มโลจิสติกส์ จำกัด", tax: "0105549009911", kind: "53", type: "transport", base: 6200, rate: 1, no: "" },
  { id: "W2610F", date: "2026-10-07", name: "นายธีรวัฒน์ คำแสน", tax: "1509900888990", kind: "3", type: "service", base: 9500, rate: 3, no: "" },
];

export const ACC_WHT: WhtRow[] = SEED_WHT.map((r) => ({ ...r, payeeType: payeeOfKind(r.kind) }));

/** ภาษีที่ต้องหักและนำส่งของหนึ่งรายการ */
export function whtAmount(row: Pick<WhtRow, "base" | "rate">) {
  return Math.round(((row.base * row.rate) / 100) * 100) / 100;
}

/* ระบบไม่มีใบลดหนี้ ใบเพิ่มหนี้ และคืนเงิน — ถอดชนิดข้อมูลและชุดตั้งต้นออกทั้งหมด (ผู้ใช้สั่ง 14 ต.ค. 2569) */
