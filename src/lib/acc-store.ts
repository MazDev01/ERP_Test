"use client";

/*
 * งานบัญชีทั้งสายอยู่ในสโตร์เดียว เพราะเอกสารอ้างกันเป็นทอด ๆ
 * ดีล → งวดชำระ → ใบแจ้งหนี้ → ใบเสร็จ (ออกใบเสร็จ = รับชำระ ไม่มีขั้นบันทึกรับเงินแยก)
 * ถ้าแยกสโตร์จะเกิดสถานะที่ขัดกันเอง เช่น มีใบเสร็จทั้งที่ยังไม่มีใบแจ้งหนี้
 */

import { settings } from "./system-settings";
import { useSyncExternalStore } from "react";
import {
  ACC_CREDIT_NOTES,
  ACC_DEALS,
  ACC_DEBIT_NOTES,
  ACC_INVOICES,
  ACC_PAYMENTS,
  ACC_RECEIPTS,
  ACC_REFUNDS,
  ACC_WHT,
  invoiceAmounts,
  ISSUER_VAT,
  nextAccDocNo,
  type AccDeal,
  type Collection,
  type CreditNote,
  type CreditReason,
  type DebitNote,
  type Installment,
  type Invoice,
  type Payment,
  type Receipt,
  type Refund,
  type WhtRow,
} from "./acc-data";
import { bkkNow, bkkStamp, nextDocNo, pad2, round2, toIsoDate } from "./format";
import { createPersistedStore } from "./persisted-store";

export type AccState = {
  deals: AccDeal[];
  invoices: Invoice[];
  payments: Payment[];
  receipts: Receipt[];
  wht: WhtRow[];
  /** ใบลดหนี้ — รวมใบที่ยังรอผู้บริหารอนุมัติ (ยังไม่มีเลขที่) */
  credits: CreditNote[];
  /** ใบเพิ่มหนี้ที่ออกเพื่อแก้ใบลดหนี้ที่ออกผิด */
  debits: DebitNote[];
  /** การคืนเงินลูกค้าจริง — คนละระเบียนกับใบลดหนี้ */
  refunds: Refund[];
};

const INITIAL: AccState = {
  deals: ACC_DEALS,
  invoices: ACC_INVOICES,
  payments: ACC_PAYMENTS,
  receipts: ACC_RECEIPTS,
  wht: ACC_WHT,
  credits: ACC_CREDIT_NOTES,
  debits: ACC_DEBIT_NOTES,
  refunds: ACC_REFUNDS,
};

function isAccState(value: unknown): value is AccState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (["deals", "invoices", "payments", "receipts", "wht", "credits", "debits", "refunds"] as const).every(
    (k) => Array.isArray(s[k]),
  );
}

/*
 * v4 (21 ก.ย. 2569) — ออกใบเสร็จ = รับชำระ (AC-BR-05) ข้อมูลเก่าที่รับเงินแยกไว้โดยยังไม่มีใบเสร็จใช้ต่อไม่ได้
 * v5 (23 ก.ย. 2569) — ดีลเก็บ "ยอดหักภาษี ณ ที่จ่าย" ที่ยกมาจากใบเสนอราคาแทนธงจริง/เท็จ
 *                     และใบเสร็จเก็บเงินที่รับจริงแยกจากภาษีที่ลูกค้าหักไว้
 *                     ของเก่าคนละรูปแบบ แปลงแล้วได้ตัวเลขที่เดาเอาเอง จึงเริ่มจากชุดตั้งต้นใหม่
 */
/*
 * v6 (24 ก.ย. 2569) — ใบลดหนี้ ใบเพิ่มหนี้ และการคืนเงิน
 *                     ของเก่าเก็บใบแจ้งหนี้ที่ยกเลิกไว้เฉย ๆ โดยไม่มีเอกสารกลับรายการ (ขัด AC-BR-10)
 *                     เติมย้อนหลังให้เองไม่ได้ เพราะใบลดหนี้ต้องผ่านผู้บริหารและต้องมีวันที่ออกจริง
 * v7 (24 ก.ย. 2569) — ใบเพิ่มหนี้ต้องผ่านผู้บริหารเหมือนกัน (เจ้าของระบบขยายข้อ 4)
 *                     ของเก่าเก็บใบเพิ่มหนี้ที่ออกเลขไปแล้วโดยไม่มีคนอนุมัติ ย้อนไปหาคนเซ็นไม่ได้
 * v8 (24 ก.ย. 2569) — การคืนเงินเรียงใหม่เป็น ขอ → อนุมัติ → โอน → บันทึกหลักฐาน
 *                     ของเก่าเก็บวันที่โอนไว้ตั้งแต่ตอนขอ แยกไม่ออกว่ารายการไหนโอนจริงไปแล้ว
 *                     และรายการไหนแค่กรอกวันที่ล่วงหน้าไว้ เดาแทนคนที่โอนไม่ได้
 * v9 (24 ก.ย. 2569) — เจ้าของระบบสั่งพักใบลดหนี้ ใบเพิ่มหนี้ และการคืนเงินทั้งหมด
 *                     กลับไปยกเลิกใบแจ้งหนี้ที่ยังไม่ชำระพร้อมดีลเหมือนเดิม และใบแจ้งหนี้เก็บ
 *                     ชื่อคนยกเลิกกับเวลาเพิ่มขึ้นมา · ของเก่า v6–v8 ค้างคำขอที่ไม่มีหน้าจอรับแล้ว
 *                     และใบที่รอใบลดหนี้อนุมัติยังไม่เคยถูกยกเลิกจริง เดาแทนคนยกเลิกไม่ได้
 */
/*
 * เติมวางบิลงวดแรกของโปรเจคตั้งต้นที่เพิ่มเข้าชุดตั้งต้นทีหลัง (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * โปรเจคผูกกับใบแจ้งหนี้งวดแรก เครื่องที่เก็บข้อมูลบัญชีไว้ก่อนจึงต้องมีใบพวกนี้ด้วย
 * กติกา "เติมของที่หาย ไม่ทับของที่มี" — ดีลที่มีอยู่แล้ว หรือเลขที่เอกสารที่ถูกใช้ไปแล้วในเครื่อง ข้ามทั้งชุด
 */
function migrateAcc(v: AccState): AccState {
  const haveDeal = new Set(v.deals.map((d) => d.no));
  const usedInv = new Set(v.invoices.map((x) => x.no));
  const usedRcp = new Set(v.receipts.map((x) => x.no));
  const add = ACC_DEALS.filter((d) => {
    if (haveDeal.has(d.no)) return false;
    const inv = ACC_INVOICES.filter((x) => x.deal === d.no);
    const rcp = ACC_RECEIPTS.filter((x) => x.deal === d.no);
    return !inv.some((x) => usedInv.has(x.no)) && !rcp.some((x) => usedRcp.has(x.no));
  });
  if (!add.length) return v;
  const nos = new Set(add.map((d) => d.no));
  const invNos = new Set(ACC_INVOICES.filter((x) => nos.has(x.deal)).map((x) => x.no));
  return {
    ...v,
    deals: [...v.deals, ...add.map((d) => ({ ...d, accSeen: true }))],
    invoices: [...v.invoices, ...ACC_INVOICES.filter((x) => nos.has(x.deal))],
    receipts: [...v.receipts, ...ACC_RECEIPTS.filter((x) => nos.has(x.deal))],
    payments: [...v.payments, ...ACC_PAYMENTS.filter((x) => invNos.has(x.inv))],
  };
}

const store = createPersistedStore<AccState>("maz-erp.acc.v9", INITIAL, isAccState, migrateAcc);

export function useAcc() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function resetAcc() {
  store.reset();
}

/** อ่านค่าปัจจุบันนอกคอมโพเนนต์ — ใช้ตอนส่งงานข้ามฝ่าย (ดู flow.ts) */
export function accSnapshot() {
  return store.get();
}

/**
 * ดีลที่ฝ่ายขายเพิ่งปิดการขาย เข้ามารอวางบิล
 * ยังไม่มีงวดชำระ เพราะการแบ่งงวดเป็นหน้าที่ของบัญชี ไม่ใช่ของฝ่ายขาย
 */
export function openDealForBilling(deal: AccDeal) {
  store.update((s) =>
    s.deals.some((d) => d.no === deal.no)
      ? s
      : { ...s, deals: [{ ...deal, accSeen: false }, ...s.deals] },
  );
}

/** ดีลใหม่ที่ฝ่ายบัญชียังไม่ได้เปิดดู — จุดแดงที่เมนูวางบิลและแท็บรอวางบิล (AC-BR-01) */
export function unseenDeals(s: AccState) {
  return s.deals.filter((d) => d.accSeen === false && !d.cancelled);
}

/** ฝ่ายบัญชีเปิดแท็บรอวางบิลแล้ว — ถือว่าเห็นดีลใหม่ทุกใบ จุดแดงหายไป */
export function markDealsSeen() {
  store.update((s) =>
    s.deals.some((d) => d.accSeen === false)
      ? { ...s, deals: s.deals.map((d) => (d.accSeen === false ? { ...d, accSeen: true } : d)) }
      : s,
  );
}

// ─── ตัวช่วยที่หลายหน้าใช้ร่วมกัน ──────────────────────────────────
/** ดีลนี้รับเงินจากลูกค้าไปแล้วหรือยัง — ตัดสินว่าใครเป็นคนยกเลิกดีลได้ (ก่อนรับเงิน = ฝ่ายขาย · หลังรับเงิน = ฝ่ายบัญชี) */
export function dealPaid(s: AccState, deal: string) {
  /* ออกใบเสร็จ = รับชำระ — มีใบเสร็จอย่างน้อยหนึ่งใบคือรับเงินแล้ว */
  return s.receipts.some((r) => r.deal === deal);
}

/**
 * ยกเลิกดีลฝั่งบัญชี — งวดที่ยังไม่ออกบิลออกไม่ได้อีก
 *
 * ใบแจ้งหนี้ที่ยัง "ไม่ได้รับชำระ" ถูกยกเลิกไปพร้อมดีล พร้อมบันทึกว่าใครยกเลิกและเมื่อไร
 * ยอดค้างเป็นศูนย์ทันทีตรงนี้ ไม่มีขั้นรออนุมัติคั่น
 * ใบเสร็จที่ออกไปแล้วและเงินที่รับมาแล้วไม่แตะ และระบบไม่คืนเงินให้เอง (ผู้ใช้กำหนด 21 ก.ย. 2569)
 * เรียกผ่าน cancelDealFlow เท่านั้น
 */
export function cancelDealBilling(
  deal: string,
  c: { at: string; by: string; why: string; note?: string },
) {
  store.update((s) => ({
    ...s,
    deals: s.deals.map((d) => (d.no === deal ? { ...d, cancelled: c } : d)),
    invoices: s.invoices.map((v) =>
      /* ใบที่รับเงินครบแล้วยอดค้างเป็นศูนย์อยู่แล้ว ไม่ต้องแตะ — ใบที่ยังค้างเท่านั้นที่ยกเลิก */
      v.deal === deal && v.status !== "cancelled" && v.outstanding > 0
        ? { ...v, status: "cancelled" as const, outstanding: 0, cancelled: c }
        : v,
    ),
  }));
}

// ─── ใบลดหนี้ · ใบเพิ่มหนี้ · คืนเงิน — พักไว้ ไม่ได้ใช้งาน ─────────
/*
 * ★ ส่วนนี้พักไว้ทั้งก้อน (เจ้าของระบบสั่ง 24 ก.ย. 2569 — ดูเหตุผลและวิธีเปิดใช้ใหม่ที่ acc-data.ts)
 *   ไม่มีหน้าจอไหนเรียกฟังก์ชันในส่วนนี้แล้ว และ s.credits / s.debits / s.refunds ว่างเสมอ
 *   ช่องทั้งสามยังอยู่ในสโตร์เพื่อให้ acc-credits-page.tsx ที่พักไว้ยังคอมไพล์ผ่าน
 *   ตัวนำหน้าเลขที่ใช้ CN/DN/RF ตรง ๆ เพราะถอดออกจากหน้าตั้งค่าแล้ว
 *
 * สายเดินเอกสารเดิม (ไว้อ่านตอนเปิดใช้ใหม่)
 *   ฝ่ายบัญชีขอออกใบลดหนี้ → ผู้บริหารอนุมัติ → ระบบออกเลขที่ ลดยอดค้าง แล้วพิมพ์เอกสารได้
 *   ออกผิด → ขอออกใบเพิ่มหนี้อ้างใบลดหนี้ใบนั้น ผู้บริหารอนุมัติแล้วจึงออกเลขที่ ห้ามลบและห้ามแก้ใบเดิม
 *   คืนเงิน → คนละระเบียน ผู้บริหารอนุมัติแยกอีกใบ และไม่ไปแตะใบเสร็จหรือเงินที่รับมาแล้ว
 */

export function creditsOf(s: AccState, invoiceNo: string) {
  return s.credits.filter((c) => c.inv === invoiceNo);
}

/** ใบเพิ่มหนี้ที่ออกเลขแล้วของใบลดหนี้ใบนี้ — ใบที่ยังรออนุมัติยังไม่ถือว่าแก้อะไร */
export function debitsOfCredit(s: AccState, creditNo: string) {
  return s.debits.filter((d) => d.credit === creditNo && d.status === "issued");
}

/** ยอดที่ใบลดหนี้ใบหนึ่งลดจริงตอนนี้ = ยอดในใบ − ใบเพิ่มหนี้ที่ออกมาแก้ */
export function creditNet(s: AccState, c: CreditNote) {
  return round2(c.total - debitsOfCredit(s, c.no).reduce((a, d) => a + d.total, 0));
}

/**
 * ยอดที่ยังเพิ่มหนี้กลับได้ของใบลดหนี้ใบหนึ่ง — เกินกว่านี้คือสร้างหนี้ใหม่ ไม่ใช่การแก้
 * ใบที่ออกแล้วและใบที่รอผู้บริหารอนุมัติกันยอดไว้ทั้งคู่ ใบที่ถูกตีกลับไม่กันยอด
 * (หลักเดียวกับ creditRoom ของใบลดหนี้)
 */
export function debitRoom(s: AccState, c: CreditNote) {
  const waiting = s.debits
    .filter((d) => d.credit === c.no && d.status === "waiting")
    .reduce((a, d) => a + d.total, 0);
  return Math.max(0, round2(creditNet(s, c) - waiting));
}

/** ยอดลดหนี้สุทธิของใบแจ้งหนี้ใบหนึ่ง — นับเฉพาะใบลดหนี้ที่ออกเลขแล้ว */
export function creditedTotal(s: AccState, invoiceNo: string) {
  return round2(
    creditsOf(s, invoiceNo)
      .filter((c) => c.status === "issued")
      .reduce((a, c) => a + creditNet(s, c), 0),
  );
}

/**
 * ยอดที่ยังลดหนี้ได้ของใบแจ้งหนี้ใบหนึ่ง (ข้อ 1 — ห้ามเกินยอดตามใบแจ้งหนี้)
 * ใบที่ออกแล้วและใบที่รอผู้บริหารอนุมัติกันยอดไว้ทั้งคู่ ใบที่ถูกตีกลับไม่กันยอด
 */
export function creditRoom(s: AccState, invoiceNo: string) {
  const v = s.invoices.find((x) => x.no === invoiceNo);
  if (!v) return 0;
  const waiting = creditsOf(s, invoiceNo)
    .filter((c) => c.status === "waiting")
    .reduce((a, c) => a + c.total, 0);
  return Math.max(0, round2(v.total - creditedTotal(s, invoiceNo) - waiting));
}

/** ใบแจ้งหนี้ใบนี้ถูกลดหนี้เต็มยอดแล้ว (หรือขอไว้เต็มแล้ว) — ไม่ต้องตามเก็บและไม่ต้องออกใบเสร็จอีก */
export function creditCovered(s: AccState, invoiceNo: string) {
  return creditsOf(s, invoiceNo).length > 0 && creditRoom(s, invoiceNo) <= 0;
}

/**
 * ยอดคืนเงินของใบลดหนี้ใบหนึ่งที่กันยอดไว้แล้ว — กันคืนซ้ำเกินยอดที่ลดหนี้ไว้ (ข้อ 1 ฝั่งคืนเงิน)
 * นับทั้งใบที่รออนุมัติ ใบที่อนุมัติแล้วรอโอน และใบที่คืนไปแล้ว · ใบที่ถูกตีกลับไม่กันยอด
 */
export function refundedOf(s: AccState, creditNo: string) {
  return round2(
    s.refunds
      .filter((r) => r.credit === creditNo && r.status !== "returned")
      .reduce((a, r) => a + r.amount, 0),
  );
}

/**
 * ยอดที่ยังคืนเงินได้ของใบลดหนี้ใบหนึ่ง = ยอดที่ใบนั้นลดจริง (หักใบเพิ่มหนี้แล้ว) − ที่กันไว้แล้ว
 *
 * ใบเพิ่มหนี้ที่ออกมาแก้ดึงยอดกลับไป ช่องที่เหลือให้คืนจึงเล็กลงด้วย ไม่ใช่ยอดหน้าใบลดหนี้
 * เพดานนี้เป็น "บันทึกไม่ได้" ทุกขั้น ไม่ใช่แค่ตอนกรอก เพราะใบเพิ่มหนี้ออกทีหลังคำขอคืนเงินได้
 * skip = รายการที่กำลังตรวจตัวเอง (ตอนแก้ส่งใหม่หรือตอนอนุมัติ) ไม่ต้องกันยอดซ้อนตัวเอง
 */
export function refundRoom(s: AccState, creditNo: string, skip = "") {
  const c = s.credits.find((x) => x.no === creditNo && x.status === "issued");
  if (!c) return 0;
  const held = s.refunds
    .filter((r) => r.credit === creditNo && r.status !== "returned" && r.id !== skip)
    .reduce((a, r) => a + r.amount, 0);
  return Math.max(0, round2(creditNet(s, c) - held));
}

/* ★ ใช้เฉพาะโค้ดใบลดหนี้/ใบเพิ่มหนี้/คืนเงินที่พักไว้ (24 ก.ย. 2569) — เอกสารที่ใช้งานจริงออกเลขด้วย nextDocNo */
function docStamp() {
  const now = bkkNow();
  return { yy: String(now.getFullYear()).slice(-2), mm: pad2(now.getMonth() + 1) };
}

function newId(prefix: string) {
  return `${prefix}${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

/** ปั้นคำขอใบลดหนี้หนึ่งใบ — ยังไม่มีเลขที่ เลขออกตอนผู้บริหารอนุมัติ */
function draftCredit(
  s: AccState,
  v: Invoice,
  amount: number,
  reasonCode: CreditReason,
  reason: string,
  at: string,
  by: string,
): CreditNote {
  const deal = s.deals.find((d) => d.no === v.deal);
  /* ยอดแยกบรรทัดถอดตามสัดส่วนของใบแจ้งหนี้ต้นทาง ไม่คิดภาษีใหม่ */
  const money = deal
    ? invoiceAmounts(deal, amount)
    : { base: round2(amount), vat: 0, wht: 0, total: round2(amount) };
  return {
    id: newId("CR"),
    no: "",
    inv: v.no,
    receipt: s.receipts.find((r) => r.inv === v.no)?.no ?? "",
    deal: v.deal,
    cus: v.cus,
    reasonCode,
    reason,
    issue: "",
    reqAt: at,
    reqBy: by,
    status: "waiting",
    decidedAt: "",
    decidedBy: "",
    comment: "",
    base: money.base,
    vat: money.vat,
    wht: money.wht,
    total: money.total,
    vatDoc: ISSUER_VAT,
  };
}

/**
 * ฝ่ายบัญชีขอออกใบลดหนี้ — คืนรหัสคำขอ หรือค่าว่างถ้าขอไม่ได้
 *
 * ปฏิเสธเมื่อ: ไม่มีใบแจ้งหนี้ · ไม่ได้ใส่เหตุผล · ยอดไม่เป็นบวก
 * หรือยอดเกินที่ยังลดได้ของใบนั้น (ข้อ 1 — บันทึกไม่ได้จริง ไม่ใช่แค่เตือน)
 */
export function requestCreditNote(input: {
  inv: string;
  amount: number;
  reasonCode: CreditReason;
  reason: string;
  by: string;
}) {
  let id = "";
  store.update((s) => {
    const v = s.invoices.find((x) => x.no === input.inv);
    const reason = input.reason.trim();
    const amount = round2(input.amount);
    if (!v || !reason || amount <= 0 || amount > creditRoom(s, input.inv)) return s;
    const draft = draftCredit(s, v, amount, input.reasonCode, reason, bkkStamp(), input.by);
    id = draft.id;
    return { ...s, credits: [...s.credits, draft] };
  });
  return id;
}

/** ฝ่ายบัญชีแก้ยอด/เหตุผลของใบที่ถูกตีกลับแล้วส่งใหม่ — ใบที่ออกเลขแล้วแตะไม่ได้ */
export function resubmitCreditNote(id: string, amount: number, reason: string, by: string) {
  let ok = false;
  store.update((s) => {
    const c = s.credits.find((x) => x.id === id);
    const v = c && s.invoices.find((x) => x.no === c.inv);
    const why = reason.trim();
    const next = round2(amount);
    if (!c || !v || c.status !== "returned" || !why || next <= 0) return s;
    if (next > creditRoom(s, c.inv)) return s;
    const deal = s.deals.find((d) => d.no === c.deal);
    const money = deal
      ? invoiceAmounts(deal, next)
      : { base: next, vat: 0, wht: 0, total: next };
    ok = true;
    return {
      ...s,
      credits: s.credits.map((x) =>
        x.id === id
          ? {
              ...x,
              ...money,
              reason: why,
              status: "waiting" as const,
              reqAt: bkkStamp(),
              reqBy: by,
              comment: "",
            }
          : x,
      ),
    };
  });
  return ok;
}

/**
 * ผู้บริหารตัดสินใบลดหนี้ (ข้อ 4)
 *
 * อนุมัติ → ออกเลขที่ ณ ตอนนั้น วันที่ออกคือวันที่อนุมัติ และลดยอดค้างของใบแจ้งหนี้ทันที
 * ยอดค้างคิดก่อนหักภาษี ณ ที่จ่าย (ฐาน + VAT) จึงลดด้วยยอดชุดเดียวกัน ไม่ใช่ยอดที่ลูกค้าโอน
 * ใบที่รับชำระไปแล้วยอดค้างเป็นศูนย์อยู่แล้ว ส่วนที่เหลือไปที่การคืนเงิน ซึ่งเป็นคนละระเบียน (ข้อ 3)
 * ตีกลับ → ต้องมีเหตุผล ฝ่ายบัญชีเห็นแล้วแก้ส่งใหม่ · เอกสารยังไม่เคยมีเลข จึงไม่มีเลขที่เสียไป
 */
export function decideCreditNote(id: string, ok: boolean, by: string, comment = "") {
  let issued = "";
  store.update((s) => {
    const c = s.credits.find((x) => x.id === id);
    if (!c || c.status !== "waiting") return s;
    const stamp = bkkStamp();
    if (!ok) {
      const why = comment.trim();
      if (!why) return s;
      return {
        ...s,
        credits: s.credits.map((x) =>
          x.id === id
            ? { ...x, status: "returned" as const, decidedAt: stamp, decidedBy: by, comment: why }
            : x,
        ),
      };
    }
    const { yy, mm } = docStamp();
    const no = nextAccDocNo(
      "CN",
      yy,
      mm,
      s.credits.map((x) => x.no),
    );
    issued = no;
    const cut = round2(c.base + c.vat);
    return {
      ...s,
      credits: s.credits.map((x) =>
        x.id === id
          ? {
              ...x,
              no,
              issue: toIsoDate(bkkNow()),
              status: "issued" as const,
              decidedAt: stamp,
              decidedBy: by,
            }
          : x,
      ),
      invoices: s.invoices.map((v) =>
        v.no === c.inv ? { ...v, outstanding: Math.max(0, round2(v.outstanding - cut)) } : v,
      ),
    };
  });
  return issued;
}

/**
 * ฝ่ายบัญชีขอออกใบเพิ่มหนี้แก้ใบลดหนี้ที่ออกผิด (ข้อ 2 + ข้อ 4) — คืนรหัสคำขอ หรือค่าว่างถ้าขอไม่ได้
 *
 * ใบลดหนี้ใบเดิมยังอยู่ครบพร้อมเลขที่เดิม ไม่ถูกลบและไม่ถูกแก้
 * ยอดเพิ่มหนี้รวมของใบลดหนี้ใบหนึ่งต้องไม่เกินยอดที่ใบนั้นลดไว้ — เพิ่มเกินคือสร้างหนี้ใหม่ ไม่ใช่การแก้
 * ตอนขอยังไม่มีเลขที่และยังไม่ขยับยอดค้างของใบแจ้งหนี้ ทั้งสองอย่างเกิดตอนผู้บริหารอนุมัติ
 */
export function requestDebitNote(input: {
  credit: string;
  amount: number;
  reason: string;
  by: string;
}) {
  let id = "";
  store.update((s) => {
    const c = s.credits.find((x) => x.no === input.credit && x.status === "issued");
    const v = c && s.invoices.find((x) => x.no === c.inv);
    const reason = input.reason.trim();
    const amount = round2(input.amount);
    if (!c || !v || !reason || amount <= 0 || amount > debitRoom(s, c)) return s;
    const draft = draftDebit(s, c, amount, reason, bkkStamp(), input.by);
    id = draft.id;
    return { ...s, debits: [...s.debits, draft] };
  });
  return id;
}

/** ปั้นคำขอใบเพิ่มหนี้หนึ่งใบ — ยังไม่มีเลขที่ เลขออกตอนผู้บริหารอนุมัติ */
function draftDebit(
  s: AccState,
  c: CreditNote,
  amount: number,
  reason: string,
  at: string,
  by: string,
): DebitNote {
  const deal = s.deals.find((d) => d.no === c.deal);
  /* ยอดแยกบรรทัดถอดตามสัดส่วนของใบแจ้งหนี้ต้นทาง ชุดเดียวกับใบลดหนี้ที่ใบนี้แก้ */
  const money = deal
    ? invoiceAmounts(deal, amount)
    : { base: amount, vat: 0, wht: 0, total: amount };
  return {
    id: newId("DB"),
    no: "",
    credit: c.no,
    inv: c.inv,
    deal: c.deal,
    cus: c.cus,
    reason,
    issue: "",
    reqAt: at,
    reqBy: by,
    status: "waiting",
    decidedAt: "",
    decidedBy: "",
    comment: "",
    vatDoc: ISSUER_VAT,
    ...money,
  };
}

/** ฝ่ายบัญชีแก้ยอด/เหตุผลของใบเพิ่มหนี้ที่ถูกตีกลับแล้วส่งใหม่ — ใบที่ออกเลขแล้วแตะไม่ได้ */
export function resubmitDebitNote(id: string, amount: number, reason: string, by: string) {
  let ok = false;
  store.update((s) => {
    const d = s.debits.find((x) => x.id === id);
    const c = d && s.credits.find((x) => x.no === d.credit);
    const why = reason.trim();
    const next = round2(amount);
    if (!d || !c || d.status !== "returned" || !why || next <= 0) return s;
    if (next > debitRoom(s, c)) return s;
    const deal = s.deals.find((x) => x.no === d.deal);
    const money = deal
      ? invoiceAmounts(deal, next)
      : { base: next, vat: 0, wht: 0, total: next };
    ok = true;
    return {
      ...s,
      debits: s.debits.map((x) =>
        x.id === id
          ? {
              ...x,
              ...money,
              reason: why,
              status: "waiting" as const,
              reqAt: bkkStamp(),
              reqBy: by,
              comment: "",
            }
          : x,
      ),
    };
  });
  return ok;
}

/**
 * ผู้บริหารตัดสินใบเพิ่มหนี้ (ข้อ 4 ที่ขยายให้ครอบคลุมใบเพิ่มหนี้)
 *
 * อนุมัติ → ออกเลขที่ ณ ตอนนั้น วันที่ออกคือวันที่อนุมัติ และยอดค้างของใบแจ้งหนี้กลับคืนมาเท่าที่เพิ่มหนี้
 * แต่ไม่เกินยอดเต็มของใบแจ้งหนี้ · ตีกลับ → ต้องมีเหตุผล และเอกสารยังไม่เคยมีเลข จึงไม่มีเลขที่เสียไป
 */
export function decideDebitNote(id: string, ok: boolean, by: string, comment = "") {
  let issued = "";
  store.update((s) => {
    const d = s.debits.find((x) => x.id === id);
    if (!d || d.status !== "waiting") return s;
    const stamp = bkkStamp();
    if (!ok) {
      const why = comment.trim();
      if (!why) return s;
      return {
        ...s,
        debits: s.debits.map((x) =>
          x.id === id
            ? { ...x, status: "returned" as const, decidedAt: stamp, decidedBy: by, comment: why }
            : x,
        ),
      };
    }
    const { yy, mm } = docStamp();
    const no = nextAccDocNo(
      "DN",
      yy,
      mm,
      s.debits.map((x) => x.no),
    );
    issued = no;
    const back = round2(d.base + d.vat);
    return {
      ...s,
      debits: s.debits.map((x) =>
        x.id === id
          ? {
              ...x,
              no,
              issue: toIsoDate(bkkNow()),
              status: "issued" as const,
              decidedAt: stamp,
              decidedBy: by,
            }
          : x,
      ),
      invoices: s.invoices.map((v) =>
        v.no === d.inv
          ? { ...v, outstanding: Math.min(round2(v.base + v.vat), round2(v.outstanding + back)) }
          : v,
      ),
    };
  });
  return issued;
}

/**
 * ฝ่ายบัญชีขอคืนเงินลูกค้า (ข้อ 3) — คืนรหัสคำขอ หรือค่าว่างถ้าขอไม่ได้
 *
 * คืนได้เฉพาะใบลดหนี้ที่ออกเลขแล้วและใบแจ้งหนี้นั้นรับเงินมาแล้วจริง (มีใบเสร็จ)
 * เงินที่ยังไม่เคยเข้าไม่มีอะไรให้คืน — ใบลดหนี้ใบนั้นไปหักกับยอดค้างแทน
 * ยอดคืนรวมของใบลดหนี้ใบหนึ่งต้องไม่เกินยอดที่ใบนั้นลดจริง
 *
 * ตอนขอยังไม่มีวันที่โอนและหลักฐาน เพราะเงินยังไม่ได้ออก — สองช่องนั้นมาที่ recordRefundTransfer
 */
export function requestRefund(input: {
  credit: string;
  amount: number;
  reason: string;
  bank: string;
  by: string;
}) {
  let id = "";
  store.update((s) => {
    const c = s.credits.find((x) => x.no === input.credit && x.status === "issued");
    if (!c) return s;
    const amount = round2(input.amount);
    const reason = input.reason.trim();
    const bank = input.bank.trim();
    if (!reason || !bank || amount <= 0) return s;
    if (!s.receipts.some((r) => r.inv === c.inv)) return s;
    if (amount > refundRoom(s, c.no)) return s;
    const draft: Refund = {
      id: newId("RF"),
      no: "",
      credit: c.no,
      inv: c.inv,
      deal: c.deal,
      cus: c.cus,
      amount,
      reason,
      bank,
      paidDate: "",
      method: "",
      evidence: "",
      paidBy: "",
      paidAt: "",
      reqAt: bkkStamp(),
      reqBy: input.by,
      status: "waiting",
      decidedAt: "",
      decidedBy: "",
      comment: "",
    };
    id = draft.id;
    return { ...s, refunds: [...s.refunds, draft] };
  });
  return id;
}

/** ฝ่ายบัญชีแก้คำขอคืนเงินที่ถูกตีกลับแล้วส่งใหม่ — สายเดียวกับใบลดหนี้และใบเพิ่มหนี้ */
export function resubmitRefund(
  id: string,
  amount: number,
  reason: string,
  bank: string,
  by: string,
) {
  let ok = false;
  store.update((s) => {
    const r = s.refunds.find((x) => x.id === id);
    const c = r && s.credits.find((x) => x.no === r.credit && x.status === "issued");
    const why = reason.trim();
    const acct = bank.trim();
    const next = round2(amount);
    if (!r || !c || r.status !== "returned" || !why || !acct || next <= 0) return s;
    /* ใบที่ถูกตีกลับไม่กันยอดไว้ เพดานจึงคิดจากยอดที่ใบลดหนี้ยังเหลือให้คืนตอนนี้ */
    if (next > refundRoom(s, c.no, r.id)) return s;
    ok = true;
    return {
      ...s,
      refunds: s.refunds.map((x) =>
        x.id === id
          ? {
              ...x,
              amount: next,
              reason: why,
              bank: acct,
              status: "waiting" as const,
              reqAt: bkkStamp(),
              reqBy: by,
              comment: "",
            }
          : x,
      ),
    };
  });
  return ok;
}

/**
 * ผู้บริหารตัดสินการคืนเงิน (ข้อ 4) — เงินออกจากบริษัทจริง จึงต้องผ่านเหมือนใบลดหนี้
 *
 * อนุมัติแล้วได้เลขที่รายการ แต่ยังไม่ถือว่าเงินออก — สถานะเป็น approved รอคนโอนมาบันทึกหลักฐาน
 * ใบเสร็จและเงินที่รับมาแล้วไม่ถูกแก้ (AC-BR-18)
 *
 * เพดานยอดคืนตรวจซ้ำตรงนี้ด้วย เพราะใบเพิ่มหนี้ที่ออกหลังวันที่ขอดึงยอดที่ลดไว้กลับไปได้
 * อนุมัติไม่ได้แล้วต้องตีกลับให้ฝ่ายบัญชีแก้ยอด ไม่ใช่ปล่อยเงินออกเกินที่ลดหนี้ไว้จริง
 */
export function decideRefund(id: string, ok: boolean, by: string, comment = "") {
  let issued = "";
  store.update((s) => {
    const r = s.refunds.find((x) => x.id === id);
    if (!r || r.status !== "waiting") return s;
    const stamp = bkkStamp();
    if (!ok) {
      const why = comment.trim();
      if (!why) return s;
      return {
        ...s,
        refunds: s.refunds.map((x) =>
          x.id === id
            ? { ...x, status: "returned" as const, decidedAt: stamp, decidedBy: by, comment: why }
            : x,
        ),
      };
    }
    if (r.amount > refundRoom(s, r.credit, r.id)) return s;
    const { yy, mm } = docStamp();
    const no = nextAccDocNo(
      "RF",
      yy,
      mm,
      s.refunds.map((x) => x.no),
    );
    issued = no;
    return {
      ...s,
      refunds: s.refunds.map((x) =>
        x.id === id ? { ...x, no, status: "approved" as const, decidedAt: stamp, decidedBy: by } : x,
      ),
    };
  });
  return issued;
}

/**
 * คนที่โอนเงินจริงกลับมาบันทึกวันที่โอนและหลักฐาน — ขั้นสุดท้ายของสายคืนเงิน
 * ทำได้เฉพาะรายการที่ผู้บริหารอนุมัติแล้ว และต้องมีหลักฐานเสมอ ถึงตรงนี้สถานะจึงเป็น "คืนเงินแล้ว"
 */
export function recordRefundTransfer(
  id: string,
  input: { paidDate: string; method: string; evidence: string; by: string },
) {
  let ok = false;
  store.update((s) => {
    const r = s.refunds.find((x) => x.id === id);
    const evidence = input.evidence.trim();
    if (!r || r.status !== "approved" || !input.paidDate || !evidence) return s;
    /* ใบเพิ่มหนี้ที่ออกหลังวันอนุมัติดึงยอดกลับไปแล้ว — โอนตามยอดเดิมไม่ได้ ต้องกลับไปแก้คำขอ */
    if (r.amount > refundRoom(s, r.credit, r.id)) return s;
    ok = true;
    return {
      ...s,
      refunds: s.refunds.map((x) =>
        x.id === id
          ? {
              ...x,
              status: "paid" as const,
              paidDate: input.paidDate,
              method: input.method.trim() || "โอนเงิน",
              evidence,
              paidBy: input.by,
              paidAt: bkkStamp(),
            }
          : x,
      ),
    };
  });
  return ok;
}

/**
 * การคืนเงินที่อนุมัติแล้วแต่ยังไม่ได้บันทึกการโอน — งานค้างของฝ่ายบัญชี
 * ต้องขึ้นให้เห็นทั้งบนหน้าจอและในกระดิ่ง ไม่ใช่เงียบหายไปหลังผู้บริหารกดอนุมัติ
 */
export function refundsToPay(s: AccState) {
  return s.refunds.filter((r) => r.status === "approved");
}

// ─── ยอดลูกหนี้ของใบแจ้งหนี้หนึ่งใบ ────────────────────────────────
/**
 * ยอดที่ยังต้องเก็บจากลูกค้าของใบแจ้งหนี้ใบหนึ่ง — ทุกหน้าที่พูดถึงลูกหนี้ต้องอ่านค่านี้ค่าเดียว
 *
 * คิดก่อนหักภาษี ณ ที่จ่าย (ฐาน + VAT) และขยับตามใบเสร็จ ใบลดหนี้ และใบเพิ่มหนี้ไปแล้ว
 * ห้ามหน้าไหนเอา "ยอดตามใบแจ้งหนี้" (v.total) มาแสดงเป็นยอดที่ต้องเก็บ
 * เพราะใบที่รับชำระไปบางส่วนแล้วจะโชว์ยอดเต็มค้างอยู่ทั้งที่เงินเข้ามาแล้ว (สองหน้าจะไม่ตรงกัน)
 */
export function invoiceDue(v: Invoice) {
  return Math.max(0, round2(v.outstanding));
}

/**
 * สถานะจริงของใบแจ้งหนี้ — คิดจากยอดค้างและใบเสร็จเสมอ ไม่อ่านค่าที่เก็บไว้ในเอกสาร
 *
 * ค่าที่เก็บไว้บันทึกตอนออกใบเสร็จครั้งสุดท้ายเท่านั้น คิดสดทุกครั้งแทน
 * ทุกหน้าจะได้อ่านสถานะชุดเดียวกัน ไม่ใช่ต่างคนต่างตีความค่าที่ค้างอยู่ในเอกสาร
 * เก็บไว้อ่านอย่างเดียวคือ "ยกเลิก" เพราะการยกเลิกไม่มีทางคิดย้อนจากตัวเลขได้
 */
export function invoiceStatus(s: AccState, v: Invoice): Invoice["status"] {
  if (v.status === "cancelled") return "cancelled";
  if (invoiceDue(v) > 0) return receiptsOf(s, v.no).length > 0 ? "partial" : "pending";
  return "paid";
}

export function invoiceOf(s: AccState, deal: string, seq: number) {
  return s.invoices.find((v) => v.deal === deal && v.seq === seq) ?? null;
}

/** สถานะของงวด — คิดจากใบแจ้งหนี้และใบเสร็จเสมอ ไม่เก็บซ้ำในตัวงวด (มีใบเสร็จ = ชำระแล้ว) */
export function seqStatus(s: AccState, deal: string, seq: number) {
  const v = invoiceOf(s, deal, seq);
  if (!v) return "pending" as const;
  /*
   * ปิดงวดได้ต้อง "มีใบเสร็จ" ของใบนั้นจริง ไม่ใช่แค่ยอดค้างเป็นศูนย์ (AC-BR-04)
   * ชำระบางส่วนหรือใบที่ถูกยกเลิกยังไม่ถือว่าปิดงวด งวดถัดไปจึงยังวางบิลไม่ได้
   */
  return invoiceStatus(s, v) === "paid" && receiptsOf(s, v.no).length > 0
    ? ("paid" as const)
    : ("invoiced" as const);
}

/**
 * ออกใบแจ้งหนี้งวดถัดไปได้ก็ต่อเมื่องวดก่อนหน้าออกใบเสร็จแล้ว (AC-BR-04)
 * กันไม่ให้ทวงพร้อมกันหลายงวดจนลูกค้าสับสนว่าต้องจ่ายใบไหนก่อน
 */
export function canBill(s: AccState, deal: AccDeal, index: number) {
  /* ดีลที่ยกเลิกแล้วออกใบแจ้งหนี้งวดต่อไม่ได้ */
  if (deal.cancelled) return false;
  if (seqStatus(s, deal.no, deal.plan[index].seq) !== "pending") return false;
  return deal.plan.slice(0, index).every((p) => seqStatus(s, deal.no, p.seq) === "paid");
}

/** งวดนี้ออกใบแจ้งหนี้ไปแล้ว (ไม่นับใบที่ยกเลิก) — แก้หรือลบในหน้าแบ่งงวดไม่ได้ (AC-BR-03) */
export function seqLocked(s: AccState, deal: string, seq: number) {
  return s.invoices.some((v) => v.deal === deal && v.seq === seq && v.status !== "cancelled");
}

/**
 * ใบแจ้งหนี้ที่รอออกใบเสร็จ — ยังไม่ถูกยกเลิกและยังรับเงินไม่ครบ (ชำระบางส่วนยังต้องตามเก็บส่วนที่เหลือ)
 * เงื่อนไขชุดเดียวกับที่หน้าวางบิลและกระดิ่งใช้ ทุกที่จึงได้ยอดลูกหนี้ตรงกัน
 */
export function awaitingReceipt(s: AccState) {
  return s.invoices.filter((v) => invoiceStatus(s, v) !== "cancelled" && invoiceDue(v) > 0);
}

export function paymentOf(s: AccState, invoiceNo: string) {
  return s.payments.find((p) => p.inv === invoiceNo) ?? null;
}

export function receiptOf(s: AccState, invoiceNo: string) {
  return s.receipts.find((r) => r.inv === invoiceNo) ?? null;
}

/** ใบเสร็จทุกใบของใบแจ้งหนี้หนึ่ง — งวดที่ลูกค้าทยอยจ่ายมีได้หลายใบ */
export function receiptsOf(s: AccState, invoiceNo: string) {
  return s.receipts.filter((r) => r.inv === invoiceNo);
}

// ─── การกระทำ ────────────────────────────────────────────────────
/**
 * ตั้งหรือแก้งวดชำระของดีล — ยอดรวมทุกงวดต้องเท่ากับยอดดีลพอดี (AC-BR-03)
 * งวดที่ออกใบแจ้งหนี้แล้วคงค่าเดิมเสมอ ไม่ว่าหน้าจอส่งอะไรมา เพราะเอกสารออกเลขไปแล้ว
 */
export function savePlan(dealNo: string, plan: Installment[]) {
  store.update((s) => {
    const deal = s.deals.find((d) => d.no === dealNo);
    if (!deal) return s;
    const locked = deal.plan.filter((p) => seqLocked(s, dealNo, p.seq));
    const next = [
      ...locked,
      ...plan.filter((p) => !locked.some((l) => l.seq === p.seq)),
    ]
      .sort((a, b) => a.seq - b.seq)
      .map((p, i) => ({ ...p, seq: i + 1 }));
    /* ถ้าลำดับงวดที่ล็อกขยับ แปลว่าหน้าจอส่งมาผิด — ไม่บันทึก */
    if (locked.some((l) => next[l.seq - 1]?.amount !== l.amount)) return s;
    return { ...s, deals: s.deals.map((d) => (d.no === dealNo ? { ...d, plan: next } : d)) };
  });
}

/**
 * ออกใบแจ้งหนี้ของงวดหนึ่ง
 *
 * เลขที่รูปแบบ INV + ปี ค.ศ. สองหลัก + ขีด + เดือนสองหลัก + ลำดับสี่หลัก
 * ยอดที่ต้องชำระ = ยอดงวดพอดี ไม่คิด VAT หรือหัก ณ ที่จ่ายซ้ำ (AC-BR-02)
 */
export function issueInvoice(dealNo: string, seq: number, due: string) {
  store.update((s) => {
    const deal = s.deals.find((d) => d.no === dealNo);
    const item = deal?.plan.find((p) => p.seq === seq);
    if (!deal || !item || !canBill(s, deal, deal.plan.indexOf(item))) return s;

    const money = invoiceAmounts(deal, item.amount);
    const today = bkkNow();
    const invoice: Invoice = {
      /* รูปแบบเลขเดียวกับเอกสารอื่นทั้งระบบ: คำนำหน้า-ปีไทย-ลำดับ 4 หลัก (ผู้ใช้สั่ง 25 ก.ย. 2569)
         เดิมใบแจ้งหนี้กับใบเสร็จใช้ปี ค.ศ. สองหลักต่อเดือน (INV-2569-0014) ซึ่งอ่านคนละแบบกับใบอื่น */
      no: nextDocNo(settings().docs.invoice, s.invoices.map((v) => v.no)),
      deal: deal.no,
      cus: deal.cus,
      seq,
      issue: toIsoDate(today),
      due,
      base: money.base,
      vat: money.vat,
      wht: money.wht,
      total: money.total,
      /* ยอดคงเหลือคิดก่อนหักภาษี ณ ที่จ่าย — ภาษีที่ลูกค้าหักไว้ถือว่าชำระแล้ว */
      outstanding: round2(money.base + money.vat),
      status: "pending",
      col: [],
    };
    return {
      ...s,
      invoices: [...s.invoices, invoice],
      deals: s.deals.map((d) =>
        d.no === dealNo
          ? { ...d, plan: d.plan.map((p) => (p.seq === seq ? { ...p, due } : p)) }
          : d,
      ),
    };
  });
}

export function logCollection(invoiceNo: string, entry: Collection) {
  store.update((s) => ({
    ...s,
    invoices: s.invoices.map((v) =>
      v.no === invoiceNo ? { ...v, col: [...v.col, entry] } : v,
    ),
  }));
}

/**
 * ออกใบเสร็จ = บันทึกว่าลูกค้าชำระงวดนั้นแล้ว (AC-BR-05)
 *
 * ใบเสร็จออกตาม "เงินที่ได้รับจริง" กับ "ภาษีที่ลูกค้าหักไว้" ที่ฝ่ายบัญชีกรอก ไม่ใช่ยอดเต็มของงวดเสมอไป
 * รับไม่ครบมูลค่างวด ใบแจ้งหนี้เป็นชำระบางส่วนและยังอยู่ในรายการรอออกใบเสร็จ ไว้ออกใบที่สองเมื่อได้เงินส่วนที่เหลือ
 * งานเข้าคิว PM เมื่องวดแรกชำระครบ — หน้าจอต้องเรียกผ่าน issueReceiptFlow ใน flow.ts
 * คืนเลขที่ใบเสร็จ หรือค่าว่างถ้าออกไม่ได้
 */
export function issueReceipt(invoiceNo: string, date: string, received: number, wht: number) {
  let issued = "";
  store.update((s) => {
    const v = s.invoices.find((x) => x.no === invoiceNo);
    if (!v || !date || v.status === "cancelled" || v.outstanding <= 0) return s;
    const got = round2(received);
    const tax = round2(wht);
    /* ใบเสร็จที่ไม่มีเงินเข้าเลย หรือรับเกินมูลค่างวด ไม่ใช่ใบเสร็จที่ถูกต้อง */
    if (got <= 0 || tax < 0 || round2(got + tax) > v.outstanding) return s;

    /* แยกฐานภาษีกับ VAT ของยอดที่รับครั้งนี้ตามสัดส่วนของใบแจ้งหนี้ ใบกำกับภาษีจะได้ขึ้นครบทุกบรรทัด */
    const paid = round2(got + tax);
    const gross = round2(v.base + v.vat);
    const base = gross ? round2((v.base * paid) / gross) : paid;
    const left = round2(v.outstanding - paid);
    const receipt: Receipt = {
      no: nextDocNo(settings().docs.receipt, s.receipts.map((r) => r.no)),
      inv: v.no,
      deal: v.deal,
      seq: v.seq,
      cus: v.cus,
      date,
      base,
      vatAmount: round2(paid - base),
      wht: tax,
      total: got,
      /* หักภาษีไว้ = ยังไม่ได้หนังสือรับรอง จนกว่าลูกค้าจะส่งมา */
      certReceived: tax <= 0,
      vat: ISSUER_VAT,
    };
    /* เงินเข้าจริงคือยอดบนใบเสร็จ ภาษีที่ถูกหักเก็บแยกไว้ให้แดชบอร์ดรวมเป็นรายได้ได้ครบ */
    const payment: Payment = {
      inv: v.no,
      date,
      received: got,
      wht: tax,
      certReceived: receipt.certReceived,
    };
    issued = receipt.no;
    return {
      ...s,
      receipts: [...s.receipts, receipt],
      payments: [...s.payments.filter((p) => p.inv !== v.no), payment],
      invoices: s.invoices.map((x) =>
        x.no === invoiceNo
          ? { ...x, outstanding: left, status: left > 0 ? ("partial" as const) : ("paid" as const) }
          : x,
      ),
    };
  });
  return issued;
}

export function saveWht(row: WhtRow) {
  store.update((s) => ({
    ...s,
    wht: s.wht.some((w) => w.id === row.id)
      ? s.wht.map((w) => (w.id === row.id ? row : w))
      : [...s.wht, row],
  }));
}

/**
 * ลบรายการภาษีหัก ณ ที่จ่าย
 *
 * ลบได้เฉพาะรายการที่ "ยังไม่ได้ออกหนังสือรับรอง" เท่านั้น
 * เพราะเอกสารที่ออกเลขให้ผู้รับเงินไปแล้วห้ามลบตามกติกาเอกสารของระบบ
 * ถ้าออกผิดต้องแก้ในใบเดิม ไม่ใช่ลบทิ้งแล้วออกใหม่
 */
export function removeWht(id: string) {
  store.update((s) => ({
    ...s,
    wht: s.wht.filter((w) => !(w.id === id && !w.no.trim())),
  }));
}

export function newWhtId() {
  return `W${Date.now().toString(36)}`;
}
