"use client";

/*
 * งานบัญชีทั้งสายอยู่ในสโตร์เดียว เพราะเอกสารอ้างกันเป็นทอด ๆ
 * ดีล → งวดชำระ → ใบแจ้งหนี้ → ใบเสร็จ (ออกใบเสร็จ = รับชำระ ไม่มีขั้นบันทึกรับเงินแยก)
 * ถ้าแยกสโตร์จะเกิดสถานะที่ขัดกันเอง เช่น มีใบเสร็จทั้งที่ยังไม่มีใบแจ้งหนี้
 */

import { settings } from "./system-settings";
import { useSyncExternalStore } from "react";
import {
  ACC_DEALS,
  ACC_INVOICES,
  ACC_PAYMENTS,
  ACC_RECEIPTS,
  ACC_WHT,
  invoiceAmounts,
  payeeOfKind,
  ISSUER_VAT,
  type AccDeal,
  type Collection,
  type Installment,
  type Invoice,
  type Payment,
  type Receipt,
  type WhtRow,
} from "./acc-data";
import { bkkNow, daysBetween, nextDocNo, round2, toIsoDate } from "./format";
import { createPersistedStore } from "./persisted-store";

/* ระบบไม่มีใบลดหนี้ ใบเพิ่มหนี้ และคืนเงิน — ถอดช่อง credits/debits/refunds ออกจากสโตร์ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export type AccState = {
  deals: AccDeal[];
  invoices: Invoice[];
  payments: Payment[];
  receipts: Receipt[];
  wht: WhtRow[];
};

const INITIAL: AccState = {
  deals: ACC_DEALS,
  invoices: ACC_INVOICES,
  payments: ACC_PAYMENTS,
  receipts: ACC_RECEIPTS,
  wht: ACC_WHT,
};

/* ข้อมูลเก่าในเครื่องยังมีช่อง credits/debits/refunds ค้างอยู่ — ไม่ใช้ตรวจแล้ว โหลดได้ตามเดิม แล้ว migrate ทิ้งช่องให้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
function isAccState(value: unknown): value is AccState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Record<string, unknown>;
  return (["deals", "invoices", "payments", "receipts", "wht"] as const).every(
    (k) => Array.isArray(s[k]),
  );
}

/**
 * ทิ้งระเบียนใบลดหนี้/ใบเพิ่มหนี้/คืนเงินที่ค้างใน localStorage (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * ไม่ขยับยอดค้างของใบแจ้งหนี้ — ตั้งแต่ v9 (24 ก.ย. 2569) ไม่มีหน้าจอออกเอกสารพวกนี้และชุดตั้งต้นว่าง
 * จึงไม่มีใบไหนเคยลดยอดค้างในคีย์นี้ ยอดคงเดิมถูกต้องแล้ว
 */
function dropCreditRecords(v: AccState): AccState {
  const raw = v as AccState & Record<string, unknown>;
  if (!("credits" in raw) && !("debits" in raw) && !("refunds" in raw)) return v;
  const { deals, invoices, payments, receipts, wht } = raw;
  return { deals, invoices, payments, receipts, wht };
}

/*
 * v4 (21 ก.ย. 2569) — ออกใบเสร็จ = รับชำระ (AC-BR-05) ข้อมูลเก่าที่รับเงินแยกไว้โดยยังไม่มีใบเสร็จใช้ต่อไม่ได้
 * v5 (23 ก.ย. 2569) — ดีลเก็บ "ยอดหักภาษี ณ ที่จ่าย" ที่ยกมาจากใบเสนอราคาแทนธงจริง/เท็จ
 *                     และใบเสร็จเก็บเงินที่รับจริงแยกจากภาษีที่ลูกค้าหักไว้
 *                     ของเก่าคนละรูปแบบ แปลงแล้วได้ตัวเลขที่เดาเอาเอง จึงเริ่มจากชุดตั้งต้นใหม่
 */
/*
 * v6–v9 (24 ก.ย. 2569) — เปลี่ยนรูปแบบข้อมูลหลายรอบ ของเก่าก่อน v9 ใช้ต่อไม่ได้ จึงเริ่มจากชุดตั้งต้นใหม่
 *                     ใบแจ้งหนี้ที่ยกเลิกพร้อมดีลเก็บชื่อคนยกเลิกกับเวลา (ประวัติเอกสารที่ถอดแล้วลบออก — ผู้ใช้สั่ง 14 ต.ค. 2569)
 */
/*
 * เติมวางบิลงวดแรกของโปรเจคตั้งต้นที่เพิ่มเข้าชุดตั้งต้นทีหลัง (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * โปรเจคผูกกับใบแจ้งหนี้งวดแรก เครื่องที่เก็บข้อมูลบัญชีไว้ก่อนจึงต้องมีใบพวกนี้ด้วย
 * กติกา "เติมของที่หาย ไม่ทับของที่มี" — ดีลที่มีอยู่แล้ว หรือเลขที่เอกสารที่ถูกใช้ไปแล้วในเครื่อง ข้ามทั้งชุด
 */
/** ข้อมูลตัวอย่างชุด ต.ค. 2569 = เอกสารที่ลงวันที่ตั้งแต่ 20 ก.ย. 2569 — ชุดตั้งต้นเดิมลงวันที่ก่อนหน้านั้นทั้งหมด */
const SAMPLE_FROM = "2026-09-20";

function migrateAcc(v: AccState): AccState {
  return addPayeeType(addSampleDocs(addSeedDeals(dropCreditRecords(v))));
}

/* รายการหัก ณ ที่จ่ายเก่าไม่มี payeeType — เติมจากแบบที่เคยเลือก 53 = นิติบุคคล · 3 = บุคคลธรรมดา (ผู้ใช้สั่ง 16 ต.ค. 2569) */
function addPayeeType(v: AccState): AccState {
  if (v.wht.every((w) => w.payeeType)) return v;
  return { ...v, wht: v.wht.map((w) => (w.payeeType ? w : { ...w, payeeType: payeeOfKind(w.kind) })) };
}

function addSeedDeals(v: AccState): AccState {
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

/*
 * ข้อมูลตัวอย่างเดือน ต.ค. 2569 (เจ้าของระบบสั่ง 8 ต.ค. 2569) — งวดถัดไปของดีลที่มีอยู่แล้ว + รายการภาษีหัก ณ ที่จ่าย
 * กติกาเดียวกัน "เติมของที่หาย ไม่ทับของที่มี":
 *   ใบแจ้งหนี้เติมเมื่อ เลขที่ยังไม่ถูกใช้ · ดีลยังอยู่และไม่ถูกยกเลิก · งวดนั้นยังไม่มีใบในเครื่อง
 *   ยอดงวดในเครื่องยังเท่าเดิม · งวดก่อนหน้าชำระครบแล้ว · และเลขที่ใบเสร็จของใบนั้นยังไม่ถูกใช้
 *   (ไม่ผ่านข้อใดข้อหนึ่ง ข้ามทั้งใบพร้อมใบเสร็จ ไม่งั้นได้ใบที่ชำระแล้วแต่ไม่มีใบเสร็จ)
 *   ภาษีหัก ณ ที่จ่ายเติมเมื่อรหัสยังไม่มีและเลขที่หนังสือรับรองยังไม่ถูกใช้
 */
function addSampleDocs(v: AccState): AccState {
  let s = v;
  const seeds = [...ACC_INVOICES]
    .filter((x) => x.issue >= SAMPLE_FROM && !v.invoices.some((y) => y.no === x.no))
    .sort((a, b) => a.seq - b.seq);
  for (const inv of seeds) {
    const deal = s.deals.find((d) => d.no === inv.deal);
    const item = deal?.plan.find((p) => p.seq === inv.seq);
    if (!deal || deal.cancelled || !item || item.amount !== inv.total) continue;
    if (s.invoices.some((x) => x.deal === inv.deal && x.seq === inv.seq && x.status !== "cancelled")) continue;
    if (!deal.plan.filter((p) => p.seq < inv.seq).every((p) => seqStatus(s, deal.no, p.seq) === "paid")) continue;
    const rcps = ACC_RECEIPTS.filter((r) => r.inv === inv.no);
    if (rcps.some((r) => s.receipts.some((x) => x.no === r.no))) continue;
    s = {
      ...s,
      deals: s.deals.map((d) =>
        d.no === deal.no
          ? { ...d, plan: d.plan.map((p) => (p.seq === inv.seq && !p.due ? { ...p, due: inv.due } : p)) }
          : d,
      ),
      invoices: [...s.invoices, inv],
      receipts: [...s.receipts, ...rcps],
      payments: [
        ...s.payments.filter((p) => p.inv !== inv.no),
        ...ACC_PAYMENTS.filter((p) => p.inv === inv.no),
      ],
    };
  }
  /* เติมครั้งเดียวทั้งชุด — ถ้ามีรายการในชุดนี้อยู่แล้วสักรายการแปลว่าเคยเติมไปแล้ว
     รายการที่ผู้ใช้ลบทิ้งทีหลังจะได้ไม่โผล่กลับมาทุกครั้งที่เปิดหน้า (migrate ทำงานทุกครั้งที่โหลด) */
  const sampleWht = ACC_WHT.filter((w) => w.date >= SAMPLE_FROM);
  if (sampleWht.some((w) => s.wht.some((x) => x.id === w.id))) return s;
  const wht = sampleWht.filter((w) => !(w.no && s.wht.some((x) => x.no === w.no)));
  return wht.length ? { ...s, wht: [...s.wht, ...wht] } : s;
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
 * ใบเสร็จที่ออกไปแล้วและเงินที่รับมาแล้วไม่แตะ (ผู้ใช้กำหนด 21 ก.ย. 2569)
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

// ─── ยอดลูกหนี้ของใบแจ้งหนี้หนึ่งใบ ────────────────────────────────
/**
 * ยอดที่ยังต้องเก็บจากลูกค้าของใบแจ้งหนี้ใบหนึ่ง — ทุกหน้าที่พูดถึงลูกหนี้ต้องอ่านค่านี้ค่าเดียว
 *
 * คิดก่อนหักภาษี ณ ที่จ่าย (ฐาน + VAT) และขยับตามใบเสร็จเท่านั้น (ไม่มีใบลดหนี้ — ผู้ใช้สั่ง 14 ต.ค. 2569)
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

/** ใบแจ้งหนี้ลงวันที่ล่วงหน้าและยังไม่ถึงวันออก — ลูกค้ายังไม่ได้รับ จึงไม่นับว่าค้าง/ใกล้ครบกำหนด (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function invoiceNotYet(v: Invoice, today: string) {
  return v.issue > today;
}

/** เลยวันครบกำหนดมากี่วัน (0 = ยังไม่เลย) — ใบที่ยังไม่ถึงวันออกเป็น 0 เสมอ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function invoiceLateDays(v: Invoice, today: string) {
  if (invoiceNotYet(v, today)) return 0;
  return Math.max(0, daysBetween(v.due, today));
}

/** แก้วันที่ออก/วันครบกำหนดได้เฉพาะใบที่ยังไม่รับเงินเลยและไม่ถูกยกเลิก (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function canEditInvoiceDates(s: AccState, v: Invoice) {
  return invoiceStatus(s, v) === "pending" && receiptsOf(s, v.no).length === 0;
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
export function issueInvoice(dealNo: string, seq: number, issue: string, due: string) {
  /* ฝ่ายบัญชีเลือกวันที่ออกเองได้ (ย้อนหลังหรือล่วงหน้า) · ครบกำหนดต้องไม่ก่อนวันออก (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  if (!issue || !due || due < issue) return;
  store.update((s) => {
    const deal = s.deals.find((d) => d.no === dealNo);
    const item = deal?.plan.find((p) => p.seq === seq);
    if (!deal || !item || !canBill(s, deal, deal.plan.indexOf(item))) return s;

    const money = invoiceAmounts(deal, item.amount);
    const invoice: Invoice = {
      /* รูปแบบเลขเดียวกับเอกสารอื่นทั้งระบบ: คำนำหน้า-ปีไทย-ลำดับ 4 หลัก (ผู้ใช้สั่ง 25 ก.ย. 2569)
         เดิมใบแจ้งหนี้กับใบเสร็จใช้ปี ค.ศ. สองหลักต่อเดือน (INV-2569-0014) ซึ่งอ่านคนละแบบกับใบอื่น */
      no: nextDocNo(settings().docs.invoice, s.invoices.map((v) => v.no)),
      deal: deal.no,
      cus: deal.cus,
      seq,
      /* วันที่บนเอกสารตามที่ฝ่ายบัญชีเลือก · เลขที่ยังเรียงตามลำดับที่กดออก (ปีของวันที่กด) (ผู้ใช้สั่ง 13 ต.ค. 2569) */
      issue,
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

/** แก้วันที่ออกและวันครบกำหนดของใบที่ยังไม่รับชำระ — งวดในดีลขยับวันครบกำหนดตาม (ผู้ใช้สั่ง 13 ต.ค. 2569) */
export function updateInvoiceDates(invoiceNo: string, issue: string, due: string) {
  if (!issue || !due || due < issue) return;
  store.update((s) => {
    const v = s.invoices.find((x) => x.no === invoiceNo);
    if (!v || !canEditInvoiceDates(s, v)) return s;
    return {
      ...s,
      invoices: s.invoices.map((x) => (x.no === invoiceNo ? { ...x, issue, due } : x)),
      deals: s.deals.map((d) =>
        d.no === v.deal
          ? { ...d, plan: d.plan.map((p) => (p.seq === v.seq ? { ...p, due } : p)) }
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

/**
 * เลขที่หนังสือรับรองถัดไป MAZ-WHT-<ปี พ.ศ.>-#### (ผู้ใช้สั่ง 9 ต.ค. 2569)
 * เดินหน้าอย่างเดียว นับจากเลขมากสุดของปีนั้นที่มีอยู่แล้ว — เลขที่ออกแล้วลบไม่ได้ (removeWht) จึงไม่ซ้ำ
 */
export function nextWhtNo(existing: string[], be: number) {
  const head = `MAZ-WHT-${be}-`;
  const max = existing
    .filter((n) => n.startsWith(head))
    .reduce((m, n) => Math.max(m, Number(n.slice(head.length)) || 0), 0);
  return head + String(max + 1).padStart(4, "0");
}

/**
 * บันทึกหนังสือรับรอง 50 ทวิ — รายการที่ยังไม่มีเลขได้เลขใหม่และวันที่ออกเป็นวันนี้
 * รายการที่มีเลขแล้วแก้ข้อมูลได้แต่เลขเดิมคงไว้ · คืนเลขที่ของรายการ
 */
export function issueWht(row: WhtRow) {
  let no = row.no;
  store.update((s) => {
    const issued = row.issued || toIsoDate(bkkNow());
    if (!no) no = nextWhtNo(s.wht.map((w) => w.no), Number(issued.slice(0, 4)) + 543);
    const next = { ...row, no, issued };
    return {
      ...s,
      wht: s.wht.some((w) => w.id === row.id)
        ? s.wht.map((w) => (w.id === row.id ? next : w))
        : [...s.wht, next],
    };
  });
  return no;
}

export function newWhtId() {
  return `W${Date.now().toString(36)}`;
}
