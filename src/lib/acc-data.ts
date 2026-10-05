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
      { seq: 2, pct: 50, amount: 171200, due: "" },
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
      { seq: 2, pct: 50, amount: 48000, due: "" },
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
      { seq: 2, pct: 60, amount: 76800, due: "" },
    ],
  },
  {
    no: "DL-2569-0035", cus: "เอ็นอาร์ พร็อพเพอร์ตี้", quo: "MAZ-2569-0052", quoDate: "2026-09-01",
    base: 270000, vat: false, wht: 0, whtPct: 0, net: 270000,
    scope: "Digital Marketing 3 แคมเปญ ระยะ 6 เดือน",
    plan: [
      { seq: 1, pct: 34, amount: 91800, due: "2026-09-06" },
      { seq: 2, pct: 33, amount: 89100, due: "" },
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

// ═══ ภาษีหัก ณ ที่จ่ายที่เราหักผู้รับเงิน ═════════════════════════
/** 53 = นิติบุคคล · 3 = บุคคลธรรมดา */
export type WhtKind = "53" | "3";

export const WHT_KIND: Record<WhtKind, string> = {
  "53": "นิติบุคคล · ภ.ง.ด.53",
  "3": "บุคคลธรรมดา · ภ.ง.ด.3",
};

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
  type: WhtType;
  base: number;
  rate: number;
  /** เลขที่หนังสือรับรองที่ออกให้ผู้รับเงิน — ว่างแปลว่ายังไม่ได้ออก */
  no: string;
};

export const ACC_WHT: WhtRow[] = [
  { id: "W1", date: "2026-09-03", name: "บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)", tax: "0107536000081", kind: "53", type: "service", base: 2500, rate: 3, no: "MAZ-WHT-2569-0001" },
  { id: "W2", date: "2026-09-01", name: "บริษัท ไทยเรียลตี้ พร็อพเพอร์ตี้ จำกัด", tax: "0105551000123", kind: "53", type: "rent", base: 35000, rate: 5, no: "MAZ-WHT-2569-0002" },
  { id: "W3", date: "2026-09-05", name: "นายวิชัย ตั้งใจดี", tax: "1509901234567", kind: "3", type: "pro", base: 12000, rate: 3, no: "" },
  { id: "W4", date: "2026-08-28", name: "บริษัท เอสเอ็มโลจิสติกส์ จำกัด", tax: "0105549009911", kind: "53", type: "transport", base: 8400, rate: 1, no: "MAZ-WHT-2569-0014" },
];

/** ภาษีที่ต้องหักและนำส่งของหนึ่งรายการ */
export function whtAmount(row: Pick<WhtRow, "base" | "rate">) {
  return Math.round(((row.base * row.rate) / 100) * 100) / 100;
}

// ═══ ใบลดหนี้ · ใบเพิ่มหนี้ · การคืนเงิน — พักไว้ ไม่ได้ใช้งาน ═══════
/*
 * ★ ส่วนนี้ "พักไว้" ทั้งก้อน (เจ้าของระบบสั่ง 24 ก.ย. 2569)
 *   ถามแล้วว่าใบลดหนี้มีไว้ทำอะไร แล้วตัดสินว่าบริษัทไม่ได้ทำงานแบบนี้
 *   เอกสารทั้งสามชนิดออกจากโปรแกรมบัญชีของฝ่ายบัญชีเอง ไม่ใช่จากระบบนี้
 *   จึงถอดเมนู หน้าจอ กระดิ่ง และขั้นอนุมัติของผู้บริหารออกหมด แต่ "โค้ดยังอยู่"
 *   เผื่อฝ่ายบัญชีทักท้วงแล้วต้องเปิดใช้ใหม่
 *
 *   จะเปิดใช้ใหม่ต้องทำครบทุกข้อ ไม่งั้นจะได้หน้าจอที่กดแล้วไม่มีอะไรเกิดขึ้น
 *     1. เติมเมนู /acc/credits · /ceo/credits · /gm/credits กลับใน nav.ts
 *        แล้วสร้างโฟลเดอร์ route สามอันคืน (คอมโพเนนต์ acc-credits-page.tsx ยังอยู่ครบ)
 *     2. เปิด CreditStrip ใน ceo-approvals-page.tsx คืน (ขั้นผู้บริหารอนุมัติ)
 *     3. เปิดกลุ่มแจ้งเตือนของ acc/ceo ใน notifications.ts คืน
 *     4. คืนตัวนำหน้าเลขที่ CN/DN/RF เป็นค่าตั้งค่าใน system-settings.ts + admin-doc-numbers-page.tsx
 *        (ตอนนี้ฟังก์ชันในสโตร์ใช้ตัวอักษรตรง ๆ ไปก่อน)
 *     5. เปลี่ยน cancelDealBilling ใน acc-store.ts กลับไปตั้งคำขอใบลดหนี้แทนการยกเลิกใบแจ้งหนี้
 *
 * กติกาเดิมที่เจ้าของระบบเคยตัดสินไว้ เก็บไว้เป็นที่มาของโค้ดข้างล่าง —
 * สี่ข้อนี้คือที่มาของทุกกติกาในส่วนนี้
 *   1. ลดหนี้บางส่วนได้ ใบลดหนี้บอกยอดที่ลด อ้างใบแจ้งหนี้เดิม และบอกเหตุผล
 *      ยอดรวมใบลดหนี้ทุกใบของใบแจ้งหนี้หนึ่งใบต้องไม่เกินยอดตามใบนั้น — ห้ามแค่เตือน ต้องบันทึกไม่ได้จริง
 *   2. ออกใบลดหนี้ผิด แก้ด้วยการออก "ใบเพิ่มหนี้" เท่านั้น ห้ามลบและห้ามแก้ใบเดิม
 *      เลขที่เอกสารที่ออกไปแล้วยกเลิกย้อนหลังไม่ได้ ใบเพิ่มหนี้อ้างใบลดหนี้ที่แก้และบอกเหตุผล
 *   3. การคืนเงินเป็นคนละระเบียนกับใบลดหนี้ ใบลดหนี้ลดภาระภาษีและลดลูกหนี้
 *      ส่วนการคืนเงินคือเงินออกจากบริษัทจริง ทั้งสองอย่างไม่จำเป็นต้องเกิดพร้อมกัน
 *      (ลดหนี้แล้วไปหักกลบงวดถัดไปก็ได้) ระเบียนคืนเงินเก็บวันที่โอน ยอด และหลักฐานการโอน
 *   4. ผู้บริหารอนุมัติใบลดหนี้ก่อนออกเลข และอนุมัติการคืนเงินด้วย
 *      หลักเดียวกับยอดเงินเดือนที่ผู้บริหารอนุมัติก่อนฝ่ายบุคคลปิดรอบ
 *
 * เจ้าของระบบขยายข้อ 4 ให้ครอบคลุมใบเพิ่มหนี้ด้วย (24 ก.ย. 2569 — ตอนตัดสินครั้งแรกยังไม่มีใบเพิ่มหนี้
 * จึงเอ่ยถึงแค่สองเอกสาร ไม่ได้ตั้งใจยกเว้น) ใบเพิ่มหนี้เรียกเก็บลูกค้าเพิ่มหลังเอกสารภาษีออกไปแล้ว
 * และมักเกิดจากความผิดพลาดของบริษัทเอง ต้องมีคนเห็นสองคนก่อนส่งออกไป
 * กติกาจึงเป็นชุดเดียวกันทั้งหมด — แก้เอกสารภาษีหรือแตะเงินที่ออกไปแล้ว ต้องผ่านผู้บริหาร
 */

/** สาเหตุที่ออกใบลดหนี้ (credit_note.reason_code) */
export type CreditReason = "deal_cancel" | "price_adjust" | "doc_error";

export const CREDIT_REASON: Record<CreditReason, string> = {
  deal_cancel: "ยกเลิกดีล",
  price_adjust: "ปรับลดยอด / เรียกเก็บเกิน",
  doc_error: "ออกเอกสารผิด",
};

/**
 * สถานะของเอกสารที่ต้องผ่านผู้บริหาร
 * waiting = ฝ่ายบัญชีส่งให้ผู้บริหารแล้ว ยังไม่มีเลขที่ · returned = ตีกลับ แก้แล้วส่งใหม่ได้
 * issued  = อนุมัติแล้ว ออกเลขที่ วันที่ออกคือวันที่อนุมัติ · ถึงขั้นนี้แล้วแก้ไม่ได้และลบไม่ได้
 */
export type DocApprovalStatus = "waiting" | "returned" | "issued";

export const DOC_APPROVAL: Record<DocApprovalStatus, { label: string; cls: string }> = {
  waiting: { label: "รอผู้บริหารอนุมัติ", cls: "t-early" },
  returned: { label: "ผู้บริหารตีกลับ", cls: "t-miss" },
  issued: { label: "ออกเอกสารแล้ว", cls: "t-ok" },
};

/** ยอดที่แยกบรรทัดเหมือนใบแจ้งหนี้ — เอกสารภาษีต้องพิมพ์ครบทุกบรรทัด ไม่ใช่ยอดก้อนเดียว */
export type TaxLines = {
  /** ฐานภาษีที่ลด/เพิ่ม ถอดตามสัดส่วนของใบแจ้งหนี้ต้นทาง */
  base: number;
  vat: number;
  /** ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ตามใบแจ้งหนี้ต้นทาง */
  wht: number;
  /** ยอดรวมฝั่งลูกค้า = ฐาน + VAT − หัก ณ ที่จ่าย */
  total: number;
};

export type CreditNote = TaxLines & {
  /** รหัสภายใน มีตั้งแต่ตอนขออนุมัติ — คนละเรื่องกับเลขที่เอกสาร */
  id: string;
  /** เลขที่ใบลดหนี้ เช่น CN26-090001 — ว่างจนกว่าผู้บริหารจะอนุมัติ (ข้อ 4) */
  no: string;
  /** ใบแจ้งหนี้ที่ลดหนี้ หนึ่งใบลดหนี้อ้างได้ใบเดียว (AC-BR-11) */
  inv: string;
  /** ใบเสร็จของใบแจ้งหนี้นั้น ว่าง = ยังไม่ได้รับชำระ */
  receipt: string;
  deal: string;
  cus: string;
  reasonCode: CreditReason;
  reason: string;
  /** วันที่ออกใบลดหนี้ = วันที่ผู้บริหารอนุมัติ ไม่ลงวันที่ย้อนหลัง */
  issue: string;
  reqAt: string;
  reqBy: string;
  status: DocApprovalStatus;
  decidedAt: string;
  decidedBy: string;
  /** เหตุผลที่ผู้บริหารตีกลับ — ฝ่ายบัญชีเห็นแล้วแก้ส่งใหม่ */
  comment: string;
  /** ผู้ออกจดทะเบียนภาษีมูลค่าเพิ่มไหม — กำหนดชื่อเอกสารที่พิมพ์ ผู้ใช้เลือกเองไม่ได้ */
  vatDoc: boolean;
};

/**
 * ใบเพิ่มหนี้ — เอกสารกลับรายการของใบลดหนี้ที่ออกผิด (ข้อ 2)
 * ผ่านผู้บริหารเหมือนใบลดหนี้และการคืนเงิน (ข้อ 4 ที่ขยายแล้ว) เพราะเป็นการเรียกเก็บลูกค้าเพิ่ม
 * หลังเอกสารภาษีออกไปแล้ว · เลขที่ออกตอนอนุมัติ ใบที่ถูกตีกลับจึงไม่เคยกินเลขที่
 */
export type DebitNote = TaxLines & {
  /** รหัสภายใน มีตั้งแต่ตอนขออนุมัติ — คนละเรื่องกับเลขที่เอกสาร */
  id: string;
  /** เลขที่ใบเพิ่มหนี้ เช่น DN26-090001 — ว่างจนกว่าผู้บริหารจะอนุมัติ */
  no: string;
  /** ใบลดหนี้ที่ใบนี้แก้ — อ้างได้ใบเดียว */
  credit: string;
  inv: string;
  deal: string;
  cus: string;
  reason: string;
  /** วันที่ออกใบเพิ่มหนี้ = วันที่ผู้บริหารอนุมัติ ไม่ลงวันที่ย้อนหลัง */
  issue: string;
  reqAt: string;
  reqBy: string;
  status: DocApprovalStatus;
  decidedAt: string;
  decidedBy: string;
  /** เหตุผลที่ผู้บริหารตีกลับ — ฝ่ายบัญชีเห็นแล้วแก้ส่งใหม่ */
  comment: string;
  vatDoc: boolean;
};

/**
 * สถานะการคืนเงิน — คนละชุดกับเอกสารภาษี เพราะการคืนเงินมีขั้น "โอนจริง" ต่อจากการอนุมัติ
 *
 * ลำดับที่เจ้าของระบบตัดสิน (24 ก.ย. 2569) : ขอ → ผู้บริหารอนุมัติ → โอน → บันทึกหลักฐาน
 * ของเดิมถามวันที่โอนและหลักฐานตั้งแต่ตอนขอ แปลว่าเงินออกไปก่อนแล้วผู้บริหารค่อยอนุมัติย้อนหลัง
 * การอนุมัติแบบนั้นไม่มีความหมาย จึงต้องมีสถานะคั่นระหว่างอนุมัติกับคืนเสร็จ
 *
 * waiting  = ฝ่ายบัญชีส่งให้ผู้บริหารแล้ว ยังไม่มีเลขที่
 * returned = ตีกลับพร้อมเหตุผล แก้แล้วส่งใหม่ได้
 * approved = อนุมัติแล้ว ออกเลขที่แล้ว แต่เงินยังไม่ออกจากบริษัท — เป็นงานค้างของฝ่ายบัญชี
 * paid     = โอนแล้วและบันทึกหลักฐานแล้ว เงินออกจากบริษัทจริงตรงขั้นนี้เท่านั้น
 */
export type RefundStatus = "waiting" | "returned" | "approved" | "paid";

export const REFUND_STATUS: Record<RefundStatus, { label: string; cls: string }> = {
  waiting: { label: "รอผู้บริหารอนุมัติ", cls: "t-early" },
  returned: { label: "ผู้บริหารตีกลับ", cls: "t-miss" },
  approved: { label: "อนุมัติแล้ว รอบันทึกการโอน", cls: "t-late" },
  paid: { label: "คืนเงินแล้ว", cls: "t-ok" },
};

/**
 * การคืนเงินลูกค้า — เงินออกจากบริษัทจริง (ข้อ 3)
 * แยกระเบียนจากใบลดหนี้ เพราะลดหนี้แล้วไม่จำเป็นต้องคืนเงินเสมอไป (หักกลบงวดถัดไปก็ได้)
 * และคืนเงินได้เฉพาะส่วนที่รับเงินมาแล้วจริง เงินที่ยังไม่เคยเข้าไม่มีอะไรให้คืน
 *
 * ช่องของขั้นขอกับช่องของขั้นโอนอยู่คนละชุดกัน ตอนขอกรอกได้แค่สี่อย่าง
 * คือใบลดหนี้ ยอด เหตุผล และบัญชีปลายทาง · วันที่โอนกับหลักฐานมาทีหลังเสมอ
 */
export type Refund = {
  id: string;
  /** เลขที่รายการคืนเงิน เช่น RF26-090001 — ว่างจนกว่าผู้บริหารจะอนุมัติ */
  no: string;
  /** ใบลดหนี้ที่คืนเงินตาม */
  credit: string;
  inv: string;
  deal: string;
  cus: string;
  amount: number;
  /** เหตุผลที่ต้องคืนเป็นเงินแทนการหักกลบ — ผู้บริหารอ่านข้อนี้ก่อนตัดสิน */
  reason: string;
  /** บัญชีปลายทางที่จะโอนคืน — กรอกตอนขอ ผู้บริหารจะได้เห็นว่าเงินจะไปที่ไหนก่อนอนุมัติ */
  bank: string;
  /** วันที่โอนเงินคืนจริง — ว่างจนกว่าจะบันทึกการโอน */
  paidDate: string;
  /** ช่องทางที่โอนคืน — บันทึกตอนโอนจริง */
  method: string;
  /** หลักฐานการโอน — เลขที่รายการโอนหรือชื่อไฟล์สลิป ต้องมีก่อนจึงจะปิดรายการได้ */
  evidence: string;
  /** คนที่โอนจริงและเวลาที่บันทึก — คนละคนกับผู้ขอได้ */
  paidBy: string;
  paidAt: string;
  reqAt: string;
  reqBy: string;
  status: RefundStatus;
  decidedAt: string;
  decidedBy: string;
  comment: string;
};

/** ชื่อเอกสารที่พิมพ์ — ขึ้นกับการจดทะเบียนภาษีมูลค่าเพิ่มของผู้ออก เช่นเดียวกับใบเสร็จ */
export function creditKind(vat: boolean) {
  return vat ? "ใบลดหนี้ / ใบกำกับภาษี" : "ใบลดหนี้";
}

export function debitKind(vat: boolean) {
  return vat ? "ใบเพิ่มหนี้ / ใบกำกับภาษี" : "ใบเพิ่มหนี้";
}

/**
 * เลขที่เอกสารถัดไปของฝั่งบัญชี — ตัวนำหน้า + ปี ค.ศ. สองหลัก + ขีด + เดือนสองหลัก + ลำดับสี่หลัก
 * เช่น CN26-090001 ชุดเดียวกับ INV และ RCP · ตัวนำหน้าแก้ได้ที่ /admin/doc-numbers
 *
 * เดินหน้าอย่างเดียว นับจากเลขที่มากที่สุดของเดือนนั้นที่มีอยู่แล้ว
 * เอกสารที่ออกเลขแล้วลบไม่ได้ เลขจึงไม่ข้ามและไม่ถูกใช้ซ้ำ
 */
export function nextAccDocNo(prefix: string, yy: string, mm: string, existing: string[]) {
  const head = `${prefix}${yy}-${mm}`;
  const max = existing
    .filter((n) => n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0);
  return head + String(max + 1).padStart(4, "0");
}

/* ว่างทั้งสามชุด — เอกสารพักไว้ ดีลที่ยกเลิกกลับไปใช้วิธีเดิมคือยกเลิกใบแจ้งหนี้ที่ยังไม่ชำระ */
export const ACC_CREDIT_NOTES: CreditNote[] = [];

export const ACC_DEBIT_NOTES: DebitNote[] = [];

export const ACC_REFUNDS: Refund[] = [];
