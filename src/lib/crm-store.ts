"use client";

import type { ServiceKey } from "./pm-data";
import { settings } from "./system-settings";
import { useSyncExternalStore } from "react";
import {
  ACTIVITIES,
  CHANGE_LOGS,
  CUSTOMERS,
  DEALS,
  DEMO_OCT_ACTIVITIES,
  DEMO_OCT_CHANGE_LOGS,
  DEMO_OCT_CUSTOMERS,
  DEMO_OCT_DEALS,
  DEMO_OCT_JOB_ORDERS,
  DEMO_OCT_PRESALES,
  DEMO_OCT_QUOTATIONS,
  DEMO_OCT_ROUNDS,
  SEED_CONTRACTS,
  JOB_ORDERS,
  PRESALES_REQUESTS,
  PRESALES_ROUNDS,
  QUOTATION_REVISIONS,
  QUOTATIONS,
  canBillQuotation,
  canRejectQuotation,
  findParty,
  quotationTotals,
  type Activity,
  type BuyerType,
  type ChangeLog,
  type Customer,
  type CustomerStatus,
  type Deal,
  type DealCancel,
  type DealContract,
  issuerOf,
  type IssuerCode,
  type JobOrder,
  type PresalesRequest,
  type PresalesRound,
  type ProposalPlanPhase,
  type Quotation,
  type QuotationRevision,
  type Urgency, ACC_DEMO_QUOTATIONS } from "./crm-data";
import { addDays, bkkNow, nextDocNo, todayIso } from "./format";
import { firstLine } from "./rich-text";
import { CURRENT_USER } from "./mock-data";
import { createPersistedStore } from "./persisted-store";

/*
 * งานขายทั้งสายอยู่ในสโตร์เดียว เพราะแต่ละขั้นส่งงานต่อกัน:
 * รับผู้สนใจ → ขอข้อเสนอ → ส่งใบเสนอราคา → ลูกค้ายอมรับ → เกิดดีลและใบงาน
 * ถ้าแยกสโตร์ จะเกิดสถานะที่ขัดกันเอง เช่น ดีลปิดแล้วแต่ลูกค้ายังเป็นผู้สนใจ
 */
export type CrmState = {
  customers: Customer[];
  activities: Activity[];
  changeLogs: ChangeLog[];
  presales: PresalesRequest[];
  presalesRounds: PresalesRound[];
  quotations: Quotation[];
  quotationRevisions: QuotationRevision[];
  deals: Deal[];
  jobOrders: JobOrder[];
  /** ชุดตัวอย่างที่เคยเติมเข้าเครื่องนี้แล้ว — เติมครั้งเดียว ผู้ใช้ลบทิ้งแล้วจะไม่กลับมาอีก */
  demo?: string[];
};

/** ป้ายของชุดตัวอย่างเดือน ต.ค. 2569 (crm-data DEMO_OCT_*) */
const DEMO_OCT = "2569-10";

const INITIAL: CrmState = {
  customers: [...DEMO_OCT_CUSTOMERS, ...CUSTOMERS],
  activities: [...DEMO_OCT_ACTIVITIES, ...ACTIVITIES],
  changeLogs: [...DEMO_OCT_CHANGE_LOGS, ...CHANGE_LOGS],
  presales: [...DEMO_OCT_PRESALES, ...PRESALES_REQUESTS],
  presalesRounds: [...DEMO_OCT_ROUNDS, ...PRESALES_ROUNDS],
  quotations: [...DEMO_OCT_QUOTATIONS, ...QUOTATIONS],
  quotationRevisions: QUOTATION_REVISIONS,
  deals: [...DEMO_OCT_DEALS, ...DEALS],
  jobOrders: [...DEMO_OCT_JOB_ORDERS, ...JOB_ORDERS],
  demo: [DEMO_OCT],
};

/*
 * เติมชุดตัวอย่างเดือน ต.ค. 2569 ให้เครื่องที่เก็บข้อมูลไว้ก่อน (เพิ่ม 8 ต.ค. 2569 สำหรับเดโม)
 * เติมเฉพาะรายการที่ยังไม่มี ไม่ทับ ไม่ลบของผู้ใช้ และเติมครั้งเดียว (จำไว้ที่ demo)
 * รหัส/เลขที่เอกสารชนกับของที่ผู้ใช้สร้างเอง = ข้ามรายการนั้น พร้อมรายการที่อ้างถึงมันทั้งสาย
 * จะได้ไม่มีเลขที่ซ้ำ และไม่มีใบเสนอราคาของตัวอย่างไปผูกกับลูกค้าจริงของผู้ใช้
 */
function addDemoOct(v: CrmState): CrmState {
  if (v.demo?.includes(DEMO_OCT)) return v;
  const demoCodes = new Set(DEMO_OCT_CUSTOMERS.flatMap((c) => [c.code, c.leadCode ?? ""]).filter(Boolean));
  const takenCodes = new Set(v.customers.flatMap((c) => [c.code, c.leadCode ?? ""]).filter(Boolean));
  const customers = DEMO_OCT_CUSTOMERS.filter(
    (c) => !takenCodes.has(c.code) && !(c.leadCode && takenCodes.has(c.leadCode)),
  );
  /* ลูกค้าที่อ้างได้ = ที่เพิ่งเติม + ของเดิมในเครื่องที่ไม่ใช่รหัสของชุดตัวอย่าง */
  const okCus = new Set([
    ...customers.map((c) => c.code),
    ...v.customers.filter((c) => !demoCodes.has(c.code)).map((c) => c.code),
  ]);

  const takenPs = new Set(v.presales.flatMap((p) => [p.id, p.no]));
  const presales = DEMO_OCT_PRESALES.filter(
    (p) => okCus.has(p.customerCode) && !takenPs.has(p.id) && !takenPs.has(p.no),
  );
  const newPs = new Set(presales.map((p) => p.no));
  const takenRound = new Set(v.presalesRounds.map((r) => r.id));
  const rounds = DEMO_OCT_ROUNDS.filter((r) => newPs.has(r.requestNo) && !takenRound.has(r.id));

  const demoPs = new Set(DEMO_OCT_PRESALES.map((p) => p.no));
  const takenQ = new Set(v.quotations.flatMap((q) => [q.id, q.no]));
  const quotations = DEMO_OCT_QUOTATIONS.filter(
    (q) =>
      okCus.has(q.customerCode) &&
      !takenQ.has(q.id) &&
      !takenQ.has(q.no) &&
      (!q.ps || !demoPs.has(q.ps) || newPs.has(q.ps)),
  );
  const newQ = new Set(quotations.map((q) => q.no));
  const takenDeal = new Set(v.deals.flatMap((d) => [d.id, d.no, d.quotationNo]));
  const deals = DEMO_OCT_DEALS.filter(
    (d) => newQ.has(d.quotationNo) && !takenDeal.has(d.id) && !takenDeal.has(d.no),
  );
  const newDeal = new Set(deals.map((d) => d.no));
  const takenJob = new Set(v.jobOrders.flatMap((j) => [j.id, j.no]));
  const jobOrders = DEMO_OCT_JOB_ORDERS.filter(
    (j) => newDeal.has(j.dealNo) && !takenJob.has(j.id) && !takenJob.has(j.no),
  );

  const takenAc = new Set(v.activities.map((a) => a.id));
  const takenCl = new Set(v.changeLogs.map((l) => l.id));
  return {
    ...v,
    customers: [...customers, ...v.customers],
    activities: [
      ...DEMO_OCT_ACTIVITIES.filter((a) => okCus.has(a.customerCode) && !takenAc.has(a.id)),
      ...v.activities,
    ],
    changeLogs: [
      ...DEMO_OCT_CHANGE_LOGS.filter((l) => okCus.has(l.customerCode) && !takenCl.has(l.id)),
      ...v.changeLogs,
    ],
    presales: [...presales, ...v.presales],
    presalesRounds: [...rounds, ...v.presalesRounds],
    quotations: [...quotations, ...v.quotations],
    deals: [...deals, ...v.deals],
    jobOrders: [...jobOrders, ...v.jobOrders],
    demo: [...(v.demo ?? []), DEMO_OCT],
  };
}

/*
 * เติมฟิลด์ที่เพิ่มเข้ามาทีหลังให้ข้อมูลเก่าที่ค้างอยู่ในเครื่องผู้ใช้
 * ไม่เปลี่ยนคีย์ เพราะจะทิ้งผู้สนใจและใบเสนอราคาที่เขาสร้างไว้เองไปด้วย
 */
function migrateCrm(saved: CrmState): CrmState {
  const v = addDemoOct(saved);
  const typeOf = new Map(CUSTOMERS.map((c) => [c.code, c.type]));
  const customers = v.customers.map((c) =>
    c.type ? c : { ...c, type: typeOf.get(c.code) ?? ("juristic" as BuyerType) },
  );
  /* รหัสผู้สนใจเดิมเพิ่มเข้ามาทีหลัง (23 ก.ย. 2569) — ลูกค้าที่ปิดการขายไปก่อนหน้านี้ยังไม่มีช่องนี้
     เติมย้อนจากรหัสปัจจุบัน (CUS-6908-021 → LEAD-6908-021) ลิงก์เก่าจะได้เปิดได้ และลำดับไม่ถูกใช้ซ้ำ */
  const leadHead = settings().docs.lead + "-";
  const withLead = customers.map((c) =>
    c.leadCode || c.code.startsWith(leadHead)
      ? c
      : { ...c, leadCode: leadHead + c.code.replace(/^[A-Za-z]+-/, "") },
  );
  const buyerOf = new Map(withLead.map((c) => [c.code, c.type]));
  return {
    ...v,
    customers: withLead,
    /* ใบเสนอราคาไม่มีร่างแล้ว (ผู้ใช้สั่ง 5 ต.ค. 2569: ไม่มีร่าง ออกแล้วแก้ไม่ได้ ต้องออกใบใหม่)
       ร่างที่ค้างในเครื่องเก่า (สถานะ "ร่าง" และยังไม่มีเลขที่) ทิ้งไป ไม่ให้โผล่ในรายการโดยไม่มีทางจัดการ */
    /* ตัวอย่างใบของลูกค้าเดิมที่ยังไม่วางบิล — เติมเฉพาะที่ยังไม่มีทั้งรหัสและเลขที่ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
    quotations: [
      ...v.quotations,
      ...ACC_DEMO_QUOTATIONS.filter(
        (s) => v.customers.some((c) => c.code === s.customerCode) && !v.quotations.some((q) => q.id === s.id || q.no === s.no),
      ),
    ]
      .filter((q) => !(q.status === "ร่าง" && !q.no))
      .map((q) =>
        q.buyer ? q : { ...q, buyer: buyerOf.get(q.customerCode) ?? ("juristic" as BuyerType) },
      ),
    presales: v.presales.map((p) => (p.attachments ? p : { ...p, attachments: [] })),
    /* รอบข้อเสนอตั้งต้นที่เพิ่มทีหลัง (PR7–PR9 · 22 ก.ย. 2569) — เติมเฉพาะที่ยังไม่มีทั้งรหัสและเลขรอบของคำขอนั้น
       ไม่ทับรอบที่ทีมก่อนการขายส่งเองในเครื่อง */
    presalesRounds: [
      ...v.presalesRounds,
      ...PRESALES_ROUNDS.filter(
        (s) =>
          !v.presalesRounds.some(
            (x) => x.id === s.id || (x.requestNo === s.requestNo && x.round === s.round),
          ),
      ),
    ],
    /* ของเก่ามีแต่การเปลี่ยนสถานะ ยังไม่มีการรับช่วงดูแล
       ต้องผ่าน Record ก่อน เพราะ ChangeLog เป็นยูเนียน กระจายตรง ๆ ไม่ได้ */
    changeLogs: v.changeLogs.map((l) =>
      l.kind
        ? l
        : ({ ...(l as Record<string, unknown>), kind: "status" } as unknown as ChangeLog),
    ),
    /* ตัวอย่างดีลที่ถูกยกเลิก (ครัวคุณจิ) เพิ่มเข้าชุดตั้งต้น 21 ก.ย. 2569 — เครื่องที่เก็บข้อมูลไว้ก่อนให้เห็นด้วย
       ใช้เฉพาะรายการตั้งต้นที่มีการยกเลิก และของในเครื่องยังเดินอยู่ ไม่ทับของที่ผู้ใช้ยกเลิกเอง */
    deals: v.deals.map((d) => {
      const seed = DEALS.find((x) => x.no === d.no && x.cancelled);
      const next =
        seed && d.status === "ปิดการขาย" && !d.cancelled
          ? { ...d, status: seed.status, lostReason: seed.lostReason, cancelled: seed.cancelled }
          : d;
      /* สัญญาตัวอย่างเพิ่มเข้าชุดตั้งต้น 22 ก.ย. 2569 — ดีลที่ยังไม่เคยมีช่องสัญญาเลยให้เห็นด้วย */
      return next.contracts || !SEED_CONTRACTS[d.no] ? next : { ...next, contracts: SEED_CONTRACTS[d.no] };
    }),
  };
}

const store = createPersistedStore<CrmState>(
  /* v4 (23 ก.ย. 2569) — ลูกค้าเพิ่มชื่อนิติบุคคล/ที่อยู่จดทะเบียน/สาขา และใบเสนอราคาเพิ่มอัตราหัก ณ ที่จ่าย
     ของเก่าไม่มีสามช่องนี้ ถ้าใช้ต่อจะออกใบกำกับภาษีไม่ได้ทั้งชุด จึงเริ่มจากชุดตั้งต้นใหม่
     v5 (28 ก.ย. 2569) — ลูกค้าตั้งต้นทั้ง 14 รายกรอกข้อมูลออกใบกำกับภาษีครบแล้ว (เจ้าของยืนยันว่าเป็นข้อมูลสมมติ)
     เครื่องที่ยังถือชุด v4 อยู่จะออกใบเสร็จของลูกค้าเก่าไม่ได้ จึงเปลี่ยนคีย์ให้เริ่มจากชุดใหม่ */
  "maz-erp.crm.v5",
  INITIAL,
  (v): v is CrmState =>
    typeof v === "object" && v !== null && Array.isArray((v as CrmState).customers),
  migrateCrm,
);

export function useCrm() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function resetCrm() {
  store.reset();
}

/** อ่านค่าปัจจุบันนอกคอมโพเนนต์ — ใช้ตอนส่งงานข้ามฝ่าย (ดู flow.ts) */
export function crmSnapshot() {
  return store.get();
}

/**
 * ลูกค้าตัวจริงของดีลหนึ่ง — ฝั่งบัญชีเก็บไว้แค่ชื่อลูกค้า ต้องย้อนกลับมาหาที่นี่
 * ไล่จากดีลฝั่งขายก่อน ไม่เจอค่อยดูใบเสนอราคา แล้วค่อยเทียบด้วยชื่อเป็นทางสุดท้าย
 */
export function customerOfDeal(s: CrmState, dealNo: string, quotationNo: string, name: string) {
  const code =
    s.deals.find((d) => d.no === dealNo)?.customerCode ??
    s.quotations.find((q) => q.no === quotationNo)?.customerCode;
  return (
    (code ? findParty(s.customers, code) : undefined) ?? s.customers.find((c) => c.name === name)
  );
}

// ─── ตัวช่วยออกเลขเอกสาร ──────────────────────────────────────────
function today() {
  return todayIso();
}

/** เลขเอกสารเดินตามรอบปี พ.ศ. แยกตามชนิด — กันเลขซ้ำด้วยการดูของเดิมที่มากสุด */
/* ตัวนำหน้าตั้งได้ที่ /admin/doc-numbers — เปลี่ยนแล้วเลขลำดับเริ่มนับใหม่ของตัวนำหน้าใหม่ */
const nextNo = nextDocNo;

/**
 * รหัสผู้สนใจถัดไป — รูปแบบ LEAD-ปีเดือน-ลำดับ ตามที่ฝ่ายขายใช้กันอยู่
 *
 * ปีคริสต์สองหลัก (LEAD-6909-001 = ก.ย. 2026)
 * เคยบวก 543 เป็นปีพุทธ ได้ LEAD-6909-… ไม่ตรงกับรหัสเดิม และนับลำดับใหม่จาก 001 ซ้ำ
 *
 * เลขที่ออกไปแล้วถือว่าใช้ไปตลอด ลำดับเดินหน้าอย่างเดียว จึงนับทุกรหัสที่เคยออกในเดือนนั้น
 * ทั้งผู้สนใจที่ยังตามอยู่ · รายที่ถูกปฏิเสธ · และรายที่ปิดการขายไปแล้ว (หัวเปลี่ยนเป็น CUS- แต่เลขเดิม
 * และยังเก็บรหัสเดิมไว้ที่ leadCode) ถ้านับเฉพาะรหัสที่ขึ้นต้นด้วย LEAD- รายที่ปิดการขายจะคืนเลข
 * ให้รายใหม่ ลิงก์เก่าก็จะเปิดไปคนละบริษัท
 */
export function nextLeadCode(customers: Customer[]) {
  const d = bkkNow();
  /* ปีไทยสองหลัก + เดือน (เช่น 6909 = ก.ย. 2569) — ให้ตัวเลขปีอ่านตรงกับเลขเอกสารอื่นทั้งระบบ
     เดิมใช้ปี ค.ศ. สองหลัก (2609) ซึ่งคนอ่านเป็น "ปี 2609" (ผู้ใช้ทักท้วง 25 ก.ย. 2569) */
  const period = String(d.getFullYear() + 543).slice(-2) + String(d.getMonth() + 1).padStart(2, "0");
  /* หัวรหัสอะไรก็นับหมด (LEAD- / CUS- / ตัวนำหน้าที่ผู้ดูแลระบบเคยตั้งไว้) ขอแค่เดือนเดียวกัน */
  const used = new RegExp(`^[A-Za-z]+-${period}-(\\d+)$`);
  const max = customers
    .flatMap((c) => [c.code, c.leadCode ?? ""])
    .reduce((m, code) => {
      const hit = used.exec(code);
      return hit ? Math.max(m, Number(hit[1]) || 0) : m;
    }, 0);
  return `${settings().docs.lead}-${period}-${String(max + 1).padStart(3, "0")}`;
}

function newId(prefix: string) {
  return prefix + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
}

/** เปลี่ยนสถานะลูกค้าพร้อมบันทึกประวัติ — ทุกที่ต้องผ่านนี่ จะได้มีร่องรอยเสมอ */
function moveCustomer(
  s: CrmState,
  code: string,
  to: CustomerStatus,
  reason: string,
): CrmState {
  const current = s.customers.find((c) => c.code === code);
  if (!current || current.status === to) return s;
  const log: ChangeLog = {
    id: newId("CL"),
    kind: "status",
    at: today(),
    customerCode: code,
    from: current.status,
    to,
    reason,
    by: CURRENT_USER.name,
  };
  return {
    ...s,
    customers: s.customers.map((c) =>
      c.code === code
        ? { ...c, status: to, closedReason: to === "ปฏิเสธ" ? reason : "" }
        : c,
    ),
    changeLogs: [log, ...s.changeLogs],
  };
}

/**
 * รับช่วงดูแลผู้สนใจที่เป็นของคนอื่น — ผู้ที่กดกลายเป็นเจ้าของรายการนี้แทน
 *
 * เกิดตอนคนเดิมลาออก ย้ายทีม หรือลายาว งานที่ค้างต้องมีคนรับต่อ ไม่งั้นลูกค้าหลุด
 * บันทึกลงประวัติเดียวกับการเปลี่ยนสถานะ จะได้เห็นเรียงตามเวลาในที่เดียว
 */
export function takeOverLead(code: string, reason: string) {
  store.update((s) => {
    const current = s.customers.find((c) => c.code === code);
    if (!current || current.owner === CURRENT_USER.name) return s;
    const log: ChangeLog = {
      id: newId("CL"),
      kind: "owner",
      at: today(),
      customerCode: code,
      from: current.owner,
      to: CURRENT_USER.name,
      reason,
      by: CURRENT_USER.name,
    };
    return {
      ...s,
      customers: s.customers.map((c) =>
        c.code === code ? { ...c, owner: CURRENT_USER.name } : c,
      ),
      changeLogs: [log, ...s.changeLogs],
    };
  });
}

// ─── ผู้สนใจ ──────────────────────────────────────────────────────
export function addLead(input: {
  name: string;
  contact: string;
  phone: string;
  email: string;
  address: string;
  source: string;
  taxId: string;
  type: BuyerType;
  legalName: string;
  branch: string;
  activity: {
    date: string;
    channel: string;
    summary: string;
    nextAction: string;
    followUp: string;
  };
}) {
  let code = "";
  store.update((s) => {
    code = nextLeadCode(s.customers);
    const customer: Customer = {
      code,
      name: input.name,
      contact: input.contact,
      phone: input.phone,
      email: input.email,
      address: input.address,
      source: input.source,
      taxId: input.taxId,
      /* นิติบุคคลต้องมีชื่อตามหนังสือรับรองกับสำนักงานใหญ่/สาขา ไม่งั้นบัญชีออกใบกำกับภาษีไม่ได้ */
      type: input.type,
      legalName: input.type === "juristic" ? input.legalName : "",
      branch: input.type === "juristic" ? input.branch : "",
      status: "รอนัดหมาย",
      closedReason: "",
      owner: CURRENT_USER.name,
    };
    const activity: Activity = {
      id: newId("AC"),
      customerCode: code,
      ...input.activity,
    };
    return {
      ...s,
      customers: [customer, ...s.customers],
      activities: [activity, ...s.activities],
    };
  });
  return code;
}

export function logActivity(input: {
  customerCode: string;
  date: string;
  channel: string;
  summary: string;
  nextAction: string;
  followUp: string;
}) {
  store.update((s) => ({
    ...s,
    activities: [{ id: newId("AC"), ...input }, ...s.activities],
  }));
}

export function closeLead(code: string, reason: string) {
  store.update((s) => moveCustomer(s, code, "ปฏิเสธ", reason));
}

export function reopenLead(code: string) {
  store.update((s) => moveCustomer(s, code, "รอนัดหมาย", "เปิดรับพิจารณาใหม่"));
}

/** เปลี่ยนเป็นปิดงานเองจากดรอปดาวน์สถานะ — ปกติเกิดเองเมื่อลูกค้าตอบรับใบเสนอราคา */
export function markLeadWon(code: string, reason: string) {
  store.update((s) => moveCustomer(s, code, "ปิดงาน", reason));
}

// ─── คำขอก่อนการขาย ───────────────────────────────────────────────
export function addPresalesRequest(input: {
  customerCode: string;
  kind: "BD" | "SA";
  problem: string;
  due: string;
  urgency: Urgency;
  urgentReason: string;
  budget: number;
  attachments: string[];
  /** ผู้รับงานที่เลือกจากพนักงานในบริษัท (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  assignee?: string;
}) {
  let no = "";
  store.update((s) => {
    no = nextNo(settings().docs.presales, s.presales.map((p) => p.no));
    const request: PresalesRequest = {
      id: newId("PS"),
      no,
      customerCode: input.customerCode,
      kind: input.kind,
      problem: input.problem,
      /* ผู้รับผิดชอบตั้งต้นตามคิวของแต่ละประเภท (ต้นแบบ presales.html) — คนที่กดรับงานจะถูกบันทึกแทน */
      assignee: input.assignee || (input.kind === "SA" ? "ปิยะวัฒน์ (SA)" : "ธนดล (BD)"),
      due: input.due,
      urgency: input.urgency,
      urgentReason: input.urgentReason,
      budget: input.budget,
      attachments: input.attachments,
      status: "รอรับงาน",
      createdAt: today(),
      hours: 0,
    };
    return { ...s, presales: [request, ...s.presales] };
  });
  return no;
}

/*
 * ฝั่งผู้รับคำขอ — ทีมก่อนการขาย (บทบาท ps หน้า /presales-work)
 *   รอรับงาน → รับงาน → กำลังทำ → ส่งข้อเสนอ → ส่งกลับแล้ว (ฝ่ายขายออกใบเสนอราคาต่อ)
 *                        ↘ ขอข้อมูลเพิ่ม → รอข้อมูลเพิ่ม → ฝ่ายขายตอบ → กำลังทำ
 */
function editPresales(no: string, fn: (p: PresalesRequest) => PresalesRequest) {
  store.update((s) => ({ ...s, presales: s.presales.map((p) => (p.no === no ? fn(p) : p)) }));
}

/** รับงาน — by = ชื่อในคิวของคนที่กดรับ (เช่น "ปิยะวัฒน์ (SA)") ไม่ส่งมาคงผู้รับผิดชอบเดิม */
export function acceptPresales(no: string, by?: string) {
  editPresales(no, (p) =>
    p.status === "รอรับงาน" ? { ...p, status: "กำลังทำ", ...(by ? { assignee: by } : {}) } : p,
  );
}

export function askPresalesInfo(no: string, ask: string) {
  editPresales(no, (p) =>
    p.status === "กำลังทำ" || p.status === "รอรับงาน" || p.status === "รอข้อมูลเพิ่ม"
      ? { ...p, status: "รอข้อมูลเพิ่ม", ask }
      : p,
  );
}

/** ฝ่ายขายตอบข้อมูลที่ขอ — งานกลับไปที่ผู้รับคำขอ */
export function replyPresalesInfo(no: string, reply: string) {
  editPresales(no, (p) => (p.status === "รอข้อมูลเพิ่ม" ? { ...p, status: "กำลังทำ", reply } : p));
}

/**
 * ส่งข้อเสนอกลับ — เป็นรอบใหม่ต่อจากรอบเดิมเสมอ ไม่ทับรอบก่อน
 * ชั่วโมงของรอบนี้บวกเข้าชั่วโมงรวมของคำขอ · ส่งได้ระหว่างรอข้อมูลเพิ่มด้วย (ต้นแบบ presales-work.html)
 */
export function submitPresalesRound(
  no: string,
  input: {
    by: string;
    hours: number;
    note: string;
    file: string;
    kind: "pdf" | "canva";
    url?: string;
    files?: { name: string; url?: string }[];
  },
) {
  store.update((s) => {
    const req = s.presales.find((p) => p.no === no);
    if (!req || (req.status !== "กำลังทำ" && req.status !== "รอข้อมูลเพิ่ม" && req.status !== "ส่งกลับแล้ว")) return s;
    const round = s.presalesRounds.filter((r) => r.requestNo === no).reduce((m, r) => Math.max(m, r.round), 0) + 1;
    const r: PresalesRound = { id: newId("PR"), requestNo: no, round, at: today(), ...input };
    return {
      ...s,
      presalesRounds: [r, ...s.presalesRounds],
      presales: s.presales.map((p) =>
        p.no === no ? { ...p, status: "ส่งกลับแล้ว" as const, hours: (p.hours ?? 0) + input.hours } : p,
      ),
    };
  });
}

export function closePresales(no: string) {
  store.update((s) => ({
    ...s,
    presales: s.presales.map((p) =>
      p.no === no ? { ...p, status: "ปิดคำขอ" as const } : p,
    ),
  }));
}

// ─── ใบเสนอราคา ───────────────────────────────────────────────────
/*
 * วงจรตามต้นแบบ quotations.html — ใบเสนอราคาไม่มีช่องสถานะให้กดเปลี่ยน ระบบอนุมานจากข้อมูลเอง
 *   ออกเลขที่เอกสาร (ได้เลขทันทีตอนสร้าง) → ฝ่ายขายส่งไฟล์ให้ลูกค้าเอง
 *   แล้วกด "บันทึกว่าส่งแล้ว" (วันมีผลเริ่มนับจากวันนี้)
 *   → ลูกค้าตกลง = "ส่งไปวางบิล" (เกิดดีล) · ลูกค้าไม่เอา = "ลูกค้าปฏิเสธ" พร้อมเหตุผล
 * ไม่มีร่าง (ผู้ใช้สั่ง 5 ต.ค. 2569: ไม่มีร่าง ออกแล้วแก้ไม่ได้ ต้องออกใบใหม่)
 *   ออกแล้วแก้ไม่ได้ ต้อง "ออกใบใหม่" เลขใหม่ ใบเดิมเก็บไว้เป็นประวัติและจำว่าถูกแทนด้วยใบไหน (replacedBy)
 * เลขที่ลำดับเดินหน้าอย่างเดียว ไม่มีเลขข้ามและไม่นำกลับมาใช้ซ้ำ
 * ช่อง status ยังเก็บไว้ให้หน้าของฝ่ายอื่นที่อ่านอยู่ (ส่งแล้ว/ตอบรับ/ปฏิเสธ/หมดอายุ · ค่า "ร่าง" ยังอยู่ในชนิดข้อมูลแต่ไม่มีใบใดใช้แล้ว)
 */
export type QuotationInput = {
  customerCode: string;
  issuer: IssuerCode;
  buyer: BuyerType;
  service: ServiceKey;
  validDays: number;
  amount: number;
  discount: number;
  wht: boolean;
  body: string;
  terms: string;
  /** อ้างอิงคำขอก่อนการขาย — เอกสารของคำขอจะตามไปถึง PM */
  ps?: string;
  /** ออกแทนใบเดิม — ใบเดิมจะถูกบันทึกว่าออกใบใหม่แทนแล้ว */
  replaces?: string;
};

/** บันทึกใบเสนอราคาใหม่พร้อมออกเลขที่เอกสารทันที (ไม่มีร่าง) — คืนเลขที่ที่ออก */
export function addQuotation(input: QuotationInput) {
  let no = "";
  store.update((s) => {
    /* ตัวนำหน้าเลขใบเสนอราคาแยกตามผู้ออกเอกสาร (/admin/company) */
    no = nextNo(issuerOf(input.issuer).prefix, s.quotations.map((q) => q.no));
    const issued = today();
    const { replaces, ps, ...rest } = input;
    const old = replaces ? s.quotations.find((q) => q.no === replaces && !q.replacedBy) : undefined;
    const quotation: Quotation = {
      id: newId("Q"),
      no,
      ...rest,
      issued,
      validUntil: addDays(issued, input.validDays),
      status: "ส่งแล้ว",
      revision: 1,
      createdAt: issued,
      ...(ps ? { ps } : {}),
      ...(old ? { replaces: old.no } : {}),
    };
    return {
      ...s,
      quotations: [
        quotation,
        ...s.quotations.map((q) =>
          old && q.id === old.id ? { ...q, replacedBy: no, status: "หมดอายุ" as const } : q,
        ),
      ],
    };
  });
  return no;
}

/**
 * บันทึกว่าส่งให้ลูกค้าแล้ว — ส่งกันนอกระบบ (อีเมลหรือไลน์) ฝ่ายขายจึงกดบันทึกเอง
 * วันมีผลเริ่มนับจากวันนี้ ไม่ใช่วันที่ออกเอกสาร
 */
export function markQuotationSent(id: string) {
  store.update((s) => ({
    ...s,
    quotations: s.quotations.map((q) =>
      q.id === id && q.no && !q.sentAt && !q.replacedBy
        ? { ...q, sentAt: today(), validUntil: addDays(today(), q.validDays) }
        : q,
    ),
  }));
}

/** ผู้สนใจที่ปิดการขายได้กลายเป็นลูกค้า — รหัส LEAD- เปลี่ยนเป็น CUS- ทุกที่ที่อ้างถึงในสายงานขาย */
function renameCustomer(s: CrmState, from: string, to: string): CrmState {
  if (from === to || s.customers.some((c) => c.code === to)) return s;
  const fix = <T extends { customerCode: string }>(x: T): T =>
    x.customerCode === from ? { ...x, customerCode: to } : x;
  return {
    ...s,
    /* เก็บรหัสผู้สนใจเดิมไว้ด้วย — ลำดับจะได้ไม่ถูกนำกลับมาใช้ซ้ำ และลิงก์เก่ายังเปิดไปถูกราย */
    customers: s.customers.map((c) =>
      c.code === from ? { ...c, code: to, leadCode: c.leadCode ?? from } : c,
    ),
    activities: s.activities.map(fix),
    changeLogs: s.changeLogs.map((l) => (l.customerCode === from ? ({ ...l, customerCode: to } as ChangeLog) : l)),
    presales: s.presales.map(fix),
    quotations: s.quotations.map(fix),
    deals: s.deals.map(fix),
  };
}

/** รหัสลูกค้าของผู้สนใจรายนี้เมื่อปิดการขายได้ — LEAD-6908-030 → CUS-6908-030 */
export function customerCodeOf(code: string) {
  const head = settings().docs.lead + "-";
  return code.startsWith(head) ? "CUS-" + code.slice(head.length) : code;
}

/**
 * ส่งใบเสนอราคาไปวางบิล = ลูกค้าตกลง → เกิดดีลปิดการขายและใบงานตั้งต้นทันที
 * ผู้สนใจกลายเป็นลูกค้า (เปลี่ยนรหัสเป็น CUS-) · เรียกผ่าน acceptQuotationFlow (flow.ts) เท่านั้น
 */
export function acceptQuotation(id: string) {
  /* คืนเลขที่ดีลที่เพิ่งเกิด เพื่อให้ชั้นส่งงานข้ามฝ่ายหยิบไปเปิดงานฝั่งบัญชีต่อได้ */
  let created = "";
  store.update((s0) => {
    const q0 = s0.quotations.find((x) => x.id === id);
    if (!q0 || !canBillQuotation(q0, s0.deals.some((d) => d.quotationNo === q0.no), today())) return s0;

    const s = renameCustomer(s0, q0.customerCode, customerCodeOf(q0.customerCode));
    const q = s.quotations.find((x) => x.id === id)!;
    const dealNo = nextNo(settings().docs.deal, s.deals.map((d) => d.no));
    created = dealNo;
    const scope = firstLine(q.body);
    const delivery = addDays(today(), 45);
    const deal: Deal = {
      id: newId("D"),
      no: dealNo,
      customerCode: q.customerCode,
      quotationNo: q.no,
      total: quotationTotals(q).grand,
      status: "ปิดการขาย",
      poRef: "",
      start: today(),
      delivery,
      scope,
      closedAt: today(),
      lostReason: "",
      seller: s.customers.find((c) => c.code === q.customerCode)?.owner,
    };
    const job: JobOrder = {
      id: newId("J"),
      dealNo,
      no: nextNo(settings().docs.jobOrder, s.jobOrders.map((j) => j.no)),
      owner: "ศิริกร (AE)",
      item: scope,
      due: delivery,
      status: "สร้างแล้ว",
    };

    const next: CrmState = {
      ...s,
      quotations: s.quotations.map((x) =>
        x.id === id ? { ...x, status: "ตอบรับ" as const } : x,
      ),
      deals: [deal, ...s.deals],
      jobOrders: [job, ...s.jobOrders],
    };
    return moveCustomer(next, q.customerCode, "ปิดงาน", "ปิดการขายจากใบเสนอราคา " + q.no);
  });
  return created;
}

/**
 * ยกเลิกดีลหลังปิดการขาย — เรียกผ่าน cancelDealFlow (flow.ts) เท่านั้น
 * ฝ่ายบัญชีกับ PM ต้องหยุดตามไปด้วย ถ้าเรียกตรงจะเหลือใบแจ้งหนี้และโปรเจคค้างอยู่
 */
/** ฝ่ายขายแนบสัญญาเข้าดีล — แนบเพิ่มได้ตลอด ไม่มีการลบ */
export function attachContract(dealNo: string, c: DealContract) {
  store.update((s) => ({
    ...s,
    deals: s.deals.map((d) => (d.no === dealNo ? { ...d, contracts: [...(d.contracts ?? []), c] } : d)),
  }));
}

export function cancelDeal(no: string, c: DealCancel) {
  store.update((s) => {
    const deal = s.deals.find((d) => d.no === no && d.status === "ปิดการขาย");
    if (!deal) return s;
    const next: CrmState = {
      ...s,
      deals: s.deals.map((d) =>
        d.no === no ? { ...d, status: "ยกเลิก" as const, lostReason: c.why, cancelled: c } : d,
      ),
    };
    /*
     * สถานะลูกค้าต้องมาจากดีลจริง ไม่ใช่ค้างค่าเดิมไว้ (เจ้าของสั่ง 24 ก.ย. 2569)
     * ลูกค้าที่ดีลถูกยกเลิกและไม่มีดีลอื่นที่ยังเดินอยู่ ต้องไม่ขึ้นว่า "ปิดงาน"
     * ไม่งั้นฝ่ายขายเลิกตามงานต่อ และรายงานนับยอดปิดเกินจริง
     * ย้ายกลับเป็น "รอนัดหมาย" เพราะลูกค้ายังอยู่ แค่งานนี้ไม่ได้ไปต่อ — ไม่ใช่ "ปฏิเสธ"
     */
    const live = next.deals.some(
      (d) => d.customerCode === deal.customerCode && d.status === "ปิดการขาย",
    );
    return live
      ? next
      : moveCustomer(next, deal.customerCode, "รอนัดหมาย", `ดีล ${no} ถูกยกเลิก · ${c.why}`);
  });
}

/**
 * งานฝั่ง PM ส่งมอบครบแล้ว — ปิดใบงานของดีลนั้นทั้งหมด
 * ฝ่ายขายจะได้เห็นว่างานที่ตัวเองปิดการขายไว้เดินไปถึงไหนโดยไม่ต้องไปถาม PM
 */
export function markJobsDelivered(dealNo: string) {
  store.update((s) => ({
    ...s,
    jobOrders: s.jobOrders.map((j) =>
      j.dealNo === dealNo ? { ...j, status: "ส่งมอบ" as const } : j,
    ),
  }));
}

/**
 * ลูกค้าปฏิเสธ — บันทึกวันที่และเหตุผล (ต้นแบบ quotations.html) ไม่เกิดดีล
 * เหตุผลไปขึ้นในรายงาน "เหตุผลที่ไม่ตกลง" คู่กับดีลที่ถูกยกเลิก
 */
export function rejectQuotation(id: string, reason: string) {
  store.update((s) => {
    const q = s.quotations.find((x) => x.id === id);
    if (!q || !canRejectQuotation(q, s.deals.some((d) => d.quotationNo === q.no))) return s;
    return {
      ...s,
      quotations: s.quotations.map((x) =>
        x.id === id
          ? { ...x, status: "ปฏิเสธ" as const, rejectedAt: today(), rejectReason: reason }
          : x,
      ),
    };
  });
}

/** แก้ข้อมูลติดต่อในการ์ดโปรไฟล์ — แก้ได้เฉพาะช่องข้อมูล ไม่แตะสถานะ */
/*
 * ลบผู้สนใจที่กรอกผิด — ลบได้เฉพาะรายที่ยังไม่มีอะไรผูกอยู่
 * ถ้ามีคำขอก่อนการขาย ใบเสนอราคา ดีล หรือใบงานแล้ว ลบไม่ได้ เพราะเอกสารพวกนั้นอ้างชื่อลูกค้าอยู่
 * ลบไปยอดในแดชบอร์ดกับรายงานจะเพี้ยน ให้เปลี่ยนสถานะเป็นปฏิเสธหรือปิดงานแทน
 */
export function leadDeleteBlock(s: CrmState, code: string) {
  const c = s.customers.find((x) => x.code === code);
  const codes = [code, c?.leadCode ?? ""].filter(Boolean);
  const hit = (v: string) => codes.includes(v);
  if (s.presales.some((r) => hit(r.customerCode))) return "มีคำขอก่อนการขายของลูกค้ารายนี้แล้ว";
  if (s.quotations.some((q) => hit(q.customerCode))) return "มีใบเสนอราคาของลูกค้ารายนี้แล้ว";
  /* ใบงานผูกกับดีล ไม่ได้ผูกกับลูกค้าตรง ๆ เช็คที่ดีลก็ครอบคลุมแล้ว */
  if (s.deals.some((d) => hit(d.customerCode))) return "มีดีลของลูกค้ารายนี้แล้ว";
  return "";
}

/** ลบผู้สนใจพร้อมบันทึกการติดต่อและประวัติการเปลี่ยนแปลงของรายนั้น — คืน true เมื่อลบจริง */
export function removeLead(code: string) {
  let done = false;
  store.update((s) => {
    if (leadDeleteBlock(s, code)) return s;
    if (!s.customers.some((c) => c.code === code)) return s;
    done = true;
    return {
      ...s,
      customers: s.customers.filter((c) => c.code !== code),
      activities: s.activities.filter((a) => a.customerCode !== code),
      changeLogs: s.changeLogs.filter((l) => l.customerCode !== code),
    };
  });
  return done;
}

/*
 * บันทึกแผนงานของข้อเสนอ (Full Proposal · M2) — แก้ได้ตราบที่คำขอยังไม่เกิดดีล
 * เรียงตามสัปดาห์เริ่มให้เสมอ จะได้อ่านไล่ลำดับได้ และกันช่วงสัปดาห์กลับหัว
 */
export function savePresalesPlan(no: string, plan: ProposalPlanPhase[]) {
  const clean = plan
    .filter((p) => p.name.trim())
    .map((p) => ({
      ...p,
      name: p.name.trim(),
      fromWeek: Math.max(1, Math.round(p.fromWeek)),
      toWeek: Math.max(Math.max(1, Math.round(p.fromWeek)), Math.round(p.toWeek)),
      tasks: p.tasks.map((t) => t.trim()).filter(Boolean),
    }))
    .sort((a, b) => a.fromWeek - b.fromWeek || a.toWeek - b.toWeek);
  store.update((s) => ({
    ...s,
    presales: s.presales.map((r) => (r.no === no ? { ...r, plan: clean } : r)),
  }));
}

export function updateCustomer(
  code: string,
  patch: Partial<
    Pick<
      Customer,
      | "contact" | "phone" | "email" | "source" | "taxId" | "address"
      | "legalName" | "legalAddress" | "branch"
    >
  >,
) {
  store.update((s) => ({
    ...s,
    customers: s.customers.map((c) => (c.code === code ? { ...c, ...patch } : c)),
  }));
}
