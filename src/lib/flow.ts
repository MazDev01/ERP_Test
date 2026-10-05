"use client";

/*
 * เส้นทางเดินของงานข้ามฝ่าย
 *
 *   ฝ่ายขาย            ฝ่ายบัญชี                     ผู้จัดการโครงการ
 *   ลูกค้าตอบรับ  →   ดีลรอวางบิล → ออกใบแจ้งหนี้
 *                     → ใบเสร็จงวดแรก        →      งานเข้าใหม่ → วางแผน → โปรเจค
 *                                                          ↓
 *   ใบงานขึ้นสถานะ "ส่งมอบ"                    ←    งานย่อยเสร็จครบทุกใบ
 *
 * ฝ่ายขายกับบัญชีอ้างถึงงานด้วย "เลขที่ดีล" (DL-xxxx-xxxx) · ฝั่ง PM อ้างด้วย "เลขที่โปรเจค" (PJ-xxxx-xxxx)
 * โปรเจคเกิดจากวางบิลงวดแรก ไม่ใช่จากดีล (ผู้ใช้สั่ง 5 ต.ค. 2569) — มาได้สองทาง
 *   ก. ดีลฝ่ายขายที่ส่งใบเสนอราคาไปวางบิล   ข. ลูกค้าเก่าที่ฝ่ายบัญชีออกใบเสนอราคาเอง
 * ทั้งสองทางมาบรรจบที่ใบแจ้งหนี้งวดแรก โปรเจคเก็บเลขใบนั้น (bill) และเลขดีลเฉพาะเมื่อมี
 * ไฟล์นี้เป็นที่เดียวที่รู้จักสโตร์ของทั้งสามฝ่าย ตัวสโตร์เองไม่อ้างถึงกัน
 * จะได้ไม่เกิดการอ้างวนและยังแยกทดสอบทีละฝ่ายได้
 *
 * หน้าจอต้องเรียกฟังก์ชันในไฟล์นี้แทนการเรียกสโตร์ตรง ๆ ในสามจังหวะนี้
 * ไม่งั้นงานจะค้างอยู่ที่ฝ่ายเดียวแล้วอีกฝ่ายไม่รู้เรื่อง
 */

import {
  cancelDealBilling,
  dealPaid,
  invoiceStatus,
  openDealForBilling,
  issueReceipt,
  accSnapshot,
  type AccState,
} from "./acc-store";
import type { AccDeal, Invoice } from "./acc-data";
import { acceptQuotation, cancelDeal, crmSnapshot, markJobsDelivered } from "./crm-store";
import { issuerOf, quotationTotals, type Customer, type Deal } from "./crm-data";
import { addDays, bkkStamp, daysBetween, round2, todayIso } from "./format";
import {
  addInboxJob,
  cancelDealWork,
  approveWork,
  pmSnapshot,
  setTaskProgress,
  setTaskStatus,
  type PmState,
} from "./pm-store";
import { isRef, planHref, projectHref, type InboxJob, type Phase, type Proposal, type Project, type TeamRole } from "./pm-data";
import type { TaskStatus } from "./pm-data";
import { firstLine } from "./rich-text";
import { closePayrun } from "./hr-store";
import type { CycleSum, PayGroup } from "./hr-data";
import { markReimbursed } from "./expense-store";
import type { Role } from "./role";

// ═══ ฝ่ายบุคคลปิดรอบเงินเดือน → ใบเบิกที่จ่ายคืนในรอบนี้ ═══════════════
/**
 * ปิดรอบเงินเดือนของกลุ่มหนึ่ง แล้วบันทึกที่ใบเบิกว่าจ่ายคืนไปกับรอบนี้ (ERD expense_claim.payroll_line_id)
 * หน้าคำนวณเงินเดือนต้องเรียกตัวนี้ ไม่เรียก closePayrun ตรง ๆ ไม่งั้นใบเบิกจะถูกนับซ้ำในรอบถัดไป
 */
export function closePayrunFlow(
  month: string,
  today: string,
  group: PayGroup,
  sum: CycleSum,
  reimbursed: { role: Role; month: string }[],
) {
  closePayrun(month, today, group, sum);
  markReimbursed(reimbursed, month);
}

// ═══ ยกเลิกดีลหลังปิดการขาย ═══════════════════════════════════════
/*
 * กติกา (ผู้ใช้กำหนด 21 ก.ย. 2569)
 *   ยังไม่รับเงิน → ฝ่ายขายยกเลิกที่หน้าดีล · รับเงินแล้ว → ฝ่ายบัญชียกเลิกที่หน้าวางบิล
 *   ต้องระบุเหตุผลเสมอ · โปรเจคของ PM เปลี่ยนเป็นยกเลิก งานหยุด
 *
 * ใบแจ้งหนี้ที่ยังไม่ได้รับชำระถูกยกเลิกไปด้วย พร้อมบันทึกว่าใครยกเลิกและเมื่อไร
 * ใบเสร็จที่ออกไปแล้วยังอยู่ตามเดิม และระบบไม่คืนเงินให้เอง
 *
 * note = บันทึกเพิ่มเติมว่าตกลงอะไรกับลูกค้าไว้ ไม่บังคับ (เจ้าของระบบสั่งเพิ่ม 24 ก.ย. 2569)
 * เช่นออกเอกสารอะไรในโปรแกรมบัญชีของฝ่ายบัญชี หรือแจ้งลูกค้าไปว่าอย่างไร
 * เก็บไว้ที่ฝั่งบัญชีที่เดียว เพราะเป็นเรื่องที่ฝ่ายบัญชีบันทึกตอนปิดเรื่อง
 */
export type CancelBy = "ฝ่ายขาย" | "ฝ่ายบัญชี";

/** ใครยกเลิกดีลนี้ได้ตอนนี้ — ตัดสินจากว่ารับเงินจากลูกค้าไปแล้วหรือยัง */
export function dealCanceller(acc: AccState, dealNo: string): CancelBy {
  return dealPaid(acc, dealNo) ? "ฝ่ายบัญชี" : "ฝ่ายขาย";
}

export function cancelDealFlow(dealNo: string, why: string, by: CancelBy, note = "") {
  const reason = why.trim();
  const deal = crmSnapshot().deals.find((d) => d.no === dealNo);
  if (!reason || !deal || deal.status !== "ปิดการขาย") return false;
  /* กันอีกชั้น — กดจากหน้าของฝ่ายที่ไม่มีสิทธิ์ตามกติกาไม่ได้ */
  if (dealCanceller(accSnapshot(), dealNo) !== by) return false;
  const c = { at: bkkStamp(), by, why: reason };
  cancelDeal(dealNo, c);
  cancelDealBilling(dealNo, { ...c, note: note.trim() });
  cancelDealWork(dealNo, c);
  return true;
}

// ═══ ขาย → บัญชี ═══════════════════════════════════════════════
/**
 * ลูกค้าตอบรับใบเสนอราคา → เกิดดีลฝั่งขาย แล้วส่งต่อให้บัญชีวางบิล
 * คืนเลขที่ดีลให้หน้าจอเอาไปแสดงผลต่อ
 */
export function acceptQuotationFlow(quotationId: string) {
  const dealNo = acceptQuotation(quotationId);
  if (!dealNo) return "";

  const crm = crmSnapshot();
  const deal = crm.deals.find((d) => d.no === dealNo);
  const quotation = crm.quotations.find((q) => q.id === quotationId);
  if (!deal || !quotation) return dealNo;

  const money = quotationTotals(quotation);
  const accDeal: AccDeal = {
    no: deal.no,
    cus: crm.customers.find((c) => c.code === deal.customerCode)?.name ?? deal.customerCode,
    quo: quotation.no,
    quoDate: quotation.issued,
    base: money.base,
    vat: issuerOf(quotation.issuer).vat,
    /* ยอดและอัตราหักภาษี ณ ที่จ่ายยกมาจากใบเสนอราคาที่ลูกค้าตอบรับ ฝั่งบัญชีไม่คิดใหม่ */
    wht: money.whtAmount,
    whtPct: money.whtPct,
    net: money.grand,
    scope: deal.scope,
    plan: [],
  };
  openDealForBilling(accDeal);
  return dealNo;
}

// ═══ บัญชี → PM ════════════════════════════════════════════════
/**
 * ออกใบเสร็จ (= บันทึกว่าลูกค้าชำระงวดนั้นแล้ว AC-BR-05) แล้วถ้าเป็นงวดแรกของดีลและชำระครบ ให้เปิดงานในกล่องของ PM (AC-BR-06)
 *
 * ใช้งวดแรกเป็นเงื่อนไข เพราะกติกาบริษัทคือเริ่มลงมือทำงานได้เมื่อลูกค้าจ่ายมัดจำแล้ว
 * คืนเลขที่ใบเสร็จ หรือค่าว่างถ้าออกไม่ได้
 */
export function issueReceiptFlow(invoiceNo: string, date: string, received: number, wht: number) {
  const before = accSnapshot();
  const invoice = before.invoices.find((v) => v.no === invoiceNo);
  const no = issueReceipt(invoiceNo, date, received, wht);
  if (!no || !invoice || invoice.seq !== 1) return no;
  /* ชำระบางส่วนยังไม่ใช่มัดจำครบ งานยังไม่เข้าคิว PM */
  const after = accSnapshot();
  const settled = after.invoices.find((v) => v.no === invoiceNo);
  if (!settled || invoiceStatus(after, settled) !== "paid") return no;

  /* โปรเจคเกิดตรงนี้ — ผูกกับใบแจ้งหนี้งวดแรกใบนี้ ได้เลขที่โปรเจคของตัวเอง (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const deal = before.deals.find((d) => d.no === invoice.deal);
  if (deal) addInboxJob(buildInboxJob(deal, date, invoice.no));
  return no;
}

/** จำนวนวันมาตรฐานของโครงการเมื่อฝ่ายขายไม่ได้ระบุกำหนดส่ง */
const DEFAULT_SPAN_DAYS = 90;

/** โครงเฟสตั้งต้น — PM แก้ชื่อ วันที่ และผู้รับผิดชอบได้ในหน้าวางแผนงาน */
const PHASE_TEMPLATE: { name: string; role: TeamRole; weight: number; tasks: string[] }[] = [
  { name: "วิเคราะห์และสรุปขอบเขต", role: "ba", weight: 15, tasks: ["เก็บความต้องการจากลูกค้า", "สรุปขอบเขตงานให้ลูกค้ายืนยัน"] },
  { name: "ออกแบบหน้าจอ", role: "design", weight: 20, tasks: ["ออกแบบโครงหน้าจอ", "ออกแบบงานกราฟิก"] },
  { name: "พัฒนาระบบ", role: "backend", weight: 45, tasks: ["พัฒนาส่วนหลังบ้าน", "พัฒนาหน้าจอผู้ใช้"] },
  { name: "ทดสอบและส่งมอบ", role: "qa", weight: 20, tasks: ["ทดสอบระบบทั้งหมด", "อบรมผู้ใช้และส่งมอบ"] },
];

/*
 * เอกสารข้อเสนอต้องเดินไปกับงาน (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * PM ต้องเห็นสิ่งที่ลูกค้าตกลงไว้ ไม่ใช่แค่ขอบเขตย่อในใบเสนอราคา
 * การเชื่อมจึงต้องไม่พึ่งว่าใบเสนอราคาอ้างคำขอก่อนการขายไว้หรือไม่ เพราะคนกรอกลืมได้เสมอ
 * ไล่หาตามลำดับนี้ แล้วเอารอบข้อเสนอล่าสุดของคำขอที่เจอมาเป็นเอกสารของงาน
 *   1. คำขอที่ใบเสนอราคาของดีลนี้อ้างไว้ (quotation.ps)
 *   2. คำขอของลูกค้ารายเดียวกัน — ผูกที่ระดับลูกค้า
 *   3. คำขอที่ใบเสนอราคาใบอื่นของลูกค้ารายนี้อ้างไว้ — ผูกที่ระดับดีล
 */
const NO_PROPOSAL_NOTE = "ไม่พบเอกสารข้อเสนอของงานนี้ — ดีลนี้ไม่ได้อ้างคำขอก่อนการขาย และลูกค้ารายนี้ยังไม่มีข้อเสนอที่ส่งแล้ว";

/*
 * คำขอก่อนการขายที่ผูกกับดีลนี้ — ใช้หาแผนงานที่ BD/SA วางไว้เป็นช่วงสัปดาห์ (Full Proposal · M2)
 * ใช้ลำดับการค้นเดียวกับ proposalOf เพื่อให้ได้ใบเดียวกันเสมอ
 */
function requestOf(crm: ReturnType<typeof crmSnapshot>, deal: AccDeal, salesDeal?: Deal) {
  const code = salesDeal?.customerCode ?? "";
  const quotation = crm.quotations.find((q) => q.no === deal.quo);
  const byNo = (no?: string) => (no ? crm.presales.find((r) => r.no === no) : undefined);
  return (
    byNo(quotation?.ps) ??
    (code ? crm.presales.find((r) => r.customerCode === code && r.plan?.length) : undefined) ??
    (code ? crm.presales.find((r) => r.customerCode === code) : undefined)
  );
}

function proposalOf(crm: ReturnType<typeof crmSnapshot>, deal: AccDeal, salesDeal?: Deal): Proposal | null {
  const code = salesDeal?.customerCode ?? "";
  const quotation = crm.quotations.find((q) => q.no === deal.quo);
  const byNo = (no?: string) => (no ? crm.presales.find((r) => r.no === no) : undefined);
  const order = [
    byNo(quotation?.ps),
    ...(code ? crm.presales.filter((r) => r.customerCode === code) : []),
    ...(code ? crm.quotations.filter((q) => q.customerCode === code).map((q) => byNo(q.ps)) : []),
  ];

  const seen = new Set<string>();
  for (const r of order) {
    if (!r || seen.has(r.no)) continue;
    seen.add(r.no);
    /* รอบล่าสุดคือสิ่งที่ลูกค้าตกลง รอบก่อนหน้าเป็นฉบับที่ถูกแก้ไปแล้ว */
    const last = crm.presalesRounds
      .filter((x) => x.requestNo === r.no)
      .sort((a, b) => b.round - a.round)[0];
    if (!last) continue;
    return {
      no: r.no,
      round: last.round,
      at: last.at,
      by: last.by,
      hours: last.hours,
      note: last.note,
      kind: last.kind ?? "pdf",
      file: last.file,
      url: last.url ?? "",
    };
  }
  return null;
}

/**
 * ปั้นงานเข้าใหม่จากดีลของบัญชี
 *
 * เฟสกับงานย่อยเป็นโครงตั้งต้นตามสัดส่วนเวลา ไม่ใช่แผนจริง
 * PM ต้องเข้าไปจัดวันและเลือกผู้รับผิดชอบในหน้าวางแผนงานก่อนยืนยัน
 */
function buildInboxJob(deal: AccDeal, paidAt: string, bill: string): Omit<InboxJob, "pj"> {
  const crm = crmSnapshot();
  const salesDeal = crm.deals.find((d) => d.no === deal.no);
  const customer: Customer | undefined = crm.customers.find(
    (c) => c.code === salesDeal?.customerCode,
  );

  const start = salesDeal?.start || addDays(paidAt, 1);
  const end = salesDeal?.delivery || addDays(start, DEFAULT_SPAN_DAYS);
  const span = Math.max(PHASE_TEMPLATE.length, daysBetween(start, end) + 1);

  /*
   * แผนที่ BD/SA วางไว้เป็นช่วงสัปดาห์มาก่อนแม่แบบเสมอ — แปลงสัปดาห์เป็นวันที่จริงจากวันเริ่มโครงการ
   * สัปดาห์ที่ 1 คือเจ็ดวันแรกนับจากวันเริ่ม · เฟสสุดท้ายไม่เกินวันส่งมอบตามใบเสนอราคา
   */
  const planned = requestOf(crm, deal, salesDeal)?.plan ?? [];
  const phases: Phase[] = planned.length
    ? planned.map((t) => {
        const from = addDays(start, (t.fromWeek - 1) * 7);
        const to = addDays(start, t.toWeek * 7 - 1);
        return {
          name: t.name,
          role: t.role as Phase["role"],
          start: from,
          end: to > end ? end : to,
          tasks: [...t.tasks],
        };
      })
    : (() => {
        let cursor = start;
        return PHASE_TEMPLATE.map((t, i) => {
          const days = Math.max(1, Math.round((span * t.weight) / 100));
          const phaseStart = cursor;
          const phaseEnd = i === PHASE_TEMPLATE.length - 1 ? end : addDays(phaseStart, days - 1);
          cursor = addDays(phaseEnd, 1);
          return { name: t.name, role: t.role, start: phaseStart, end: phaseEnd, tasks: [...t.tasks] };
        });
      })();

  return {
    bill,
    /* เลขดีลติดไปเฉพาะงานที่มาจากดีลฝ่ายขายจริง — ใบเสนอราคาที่บัญชีออกเองไม่มีดีล */
    deal: salesDeal?.no,
    /* ประเภทบริการมาจากใบเสนอราคาที่ฝ่ายขายเลือกไว้ · ใบเก่าที่ยังไม่มีช่องนี้ถือเป็น "ระบบ" */
    service: crm.quotations.find((q) => q.no === deal.quo)?.service ?? "website",
    cus: deal.cus,
    quo: deal.quo,
    quoDate: deal.quoDate,
    net: deal.net,
    seqs: Math.max(1, deal.plan.length),
    paidAt,
    sentAt: todayIso(),
    scope: deal.scope,
    items: [firstLine(deal.scope) || deal.scope],
    due: end,
    stage: "new",
    planStart: start,
    planEnd: end,
    durationDays: daysBetween(start, end) + 1,
    phases,
    /* ไม่มีจริง ๆ ก็บอกไปตรง ๆ ที่หมายเหตุ ไม่ปล่อยให้ PM เปิดมาเจอเอกสารเปล่า */
    proposal: proposalOf(crm, deal, salesDeal) ?? {
      no: "",
      round: 0,
      at: deal.quoDate,
      by: salesDeal ? "ฝ่ายขาย" : "",
      hours: 0,
      note: NO_PROPOSAL_NOTE,
      kind: "pdf",
      file: "",
      url: "",
    },
    contact: customer?.contact ?? "",
    phone: customer?.phone ?? "",
    taxId: customer?.taxId ?? "",
    address: customer?.address ?? "",
    terms: "",
    validDays: 30,
  };
}

// ═══ PM → ขาย ══════════════════════════════════════════════════
/** โปรเจคปิดครบทุกงานแล้วหรือยัง ถ้าใช่ให้ใบงานฝั่งขายขึ้น "ส่งมอบ" ตาม — โปรเจคที่ไม่มีดีลไม่มีใบงานฝั่งขายให้ปิด */
function closeJobIfDone(pj: string) {
  const project = pmSnapshot().projects.find((p) => isRef(p, pj));
  if (project?.status === "done" && project.deal) markJobsDelivered(project.deal);
}

/**
 * PM ตรวจงานที่ทีมส่งมาแล้วผ่าน — งานย่อยใบนั้นจบ
 * ถ้าเป็นใบสุดท้ายของโปรเจค แปลว่างานทั้งก้อนส่งมอบได้ ใบงานฝั่งขายต้องปิดตาม
 *
 * หน้างานรอตรวจต้องเรียกตัวนี้ ไม่ใช่ approveWork ตรง ๆ
 * ไม่งั้นฝ่ายขายจะเห็นใบงานค้างอยู่ทั้งที่ทีมทำเสร็จและส่งมอบไปแล้ว
 */
export function approveWorkFlow(pj: string, taskName: string, stamp: string) {
  approveWork(pj, taskName, stamp);
  closeJobIfDone(pj);
}

/**
 * เลื่อนสถานะงานย่อย แล้วถ้าโปรเจคเสร็จครบทุกใบ ให้ปิดใบงานฝั่งขายด้วย
 */
export function setTaskStatusFlow(pj: string, taskIndex: number, status: TaskStatus) {
  setTaskStatus(pj, taskIndex, status);
  closeJobIfDone(pj);
}

/**
 * ปรับความคืบหน้าของงานย่อย — ลากถึง 100% ก็คืองานเสร็จ
 * จึงต้องเช็คการส่งมอบแบบเดียวกับการเลื่อนสถานะ
 * ไม่งั้นโปรเจคที่ปิดด้วยการลากแถบ จะไม่ไปปิดใบงานฝั่งขายให้
 */
export function setTaskProgressFlow(pj: string, taskIndex: number, pct: number) {
  setTaskProgress(pj, taskIndex, pct);
  closeJobIfDone(pj);
}

// ═══ สถานะรวมของงานหนึ่งชิ้น ════════════════════════════════════
/*
 * ทั้งสามฝ่ายเห็นงานเดียวกันคนละมุม ตัวช่วยชุดนี้จึงคำนวณ "งานนี้ไปถึงไหนแล้ว"
 * จากสโตร์ของอีกฝ่าย เพื่อเอาไปแสดงข้าม ๆ กันโดยไม่ต้องคัดลอกสถานะไปเก็บซ้ำ
 */

export type DealTrack = {
  label: string;
  /** คลาสป้ายสีในชุด .t-* ของ globals.css */
  cls: string;
  detail: string;
  /** หน้าที่งานใบนี้กำลังอยู่จริง — ฝั่งขายกดจากป้ายสถานะไปดูได้เลย */
  href: string;
};

/** งานเดินไปถึงขั้นไหนแล้วในสายบัญชี → PM */
export function dealTrack(dealNo: string, acc: AccState, pm: PmState): DealTrack | null {
  /* ดีลที่ยกเลิกแล้ว — ทุกฝ่ายหยุดงาน บอกว่าใครยกเลิก ไม่ต้องบอกขั้นที่ค้างอยู่ */
  const cancelled = acc.deals.find((d) => d.no === dealNo)?.cancelled;
  if (cancelled) return { label: "ยกเลิกแล้ว", cls: "t-miss", detail: `โดย${cancelled.by} · งานหยุด`, href: "" };
  const project = pm.projects.find((p) => p.deal === dealNo);
  if (project) {
    const href = projectHref(project.pj);
    const done = project.tasks.filter((t) => t.status === "done").length;
    const pct = project.tasks.length
      ? Math.round((done / project.tasks.length) * 100)
      : 0;
    if (project.status === "cancelled")
      return { label: "ยกเลิกแล้ว", cls: "t-miss", detail: `งานหยุด · ${project.cancelled?.why ?? ""}`, href };
    return project.status === "done"
      ? { label: "ส่งมอบแล้ว", cls: "t-ok", detail: `งานย่อยครบ ${project.tasks.length} ใบ`, href }
      : { label: `กำลังดำเนินงาน ${pct}%`, cls: "t-job", detail: `เสร็จ ${done}/${project.tasks.length} ใบ · PM ${project.pm}`, href };
  }

  const job = pm.inbox.find((j) => j.deal === dealNo);
  if (job) {
    return job.stage === "plan"
      ? {
          label: "กำลังวางแผนงาน",
          cls: "t-info",
          detail: "PM กำลังจัดงานย่อยและผู้รับผิดชอบ",
          href: planHref(job.pj),
        }
      : {
          label: "รอ PM รับงาน",
          cls: "t-early",
          detail: `ชำระงวดแรกเมื่อ ${job.paidAt}`,
          href: `/pm/inbox?find=${encodeURIComponent(job.pj)}`,
        };
  }

  const deal = acc.deals.find((d) => d.no === dealNo);
  if (!deal) return null;
  const bill = `/acc/billing?find=${encodeURIComponent(dealNo)}`;
  if (deal.plan.length === 0) {
    return { label: "รอบัญชีวางแผนงวด", cls: "t-miss", detail: "ยังไม่ได้แบ่งงวดชำระ", href: bill };
  }
  /* ชำระแล้ว = งวดที่รับเงินครบแล้ว (งวดที่จ่ายมาบางส่วนยังไม่นับ) */
  const paid = acc.invoices.filter((v) => v.deal === dealNo && invoiceStatus(acc, v) === "paid").length;
  return paid > 0
    ? { label: `ชำระแล้ว ${paid}/${deal.plan.length} งวด`, cls: "t-info", detail: "รอชำระงวดถัดไป", href: bill }
    : { label: "รอชำระงวดแรก", cls: "t-early", detail: "งานยังไม่เข้าคิวของ PM", href: bill };
}

/** ยอดที่เก็บได้แล้วของดีลหนึ่ง — ฝั่ง PM ใช้ดูว่างานนี้เก็บเงินไปถึงไหน */
export function billingOf(dealNo: string, acc: AccState) {
  const deal = acc.deals.find((d) => d.no === dealNo);
  if (!deal) return null;
  /* ชำระแล้ว = มีใบเสร็จ (AC-BR-05) — ใบแจ้งหนี้ที่ยกเลิกตามดีลไม่นับเป็นเงินเข้า */
  const receipts = acc.receipts.filter((r) => r.deal === dealNo);
  const received = receipts.reduce((sum, r) => sum + r.total, 0);
  /* ยอดค้างเทียบกันที่มูลค่าก่อนหักภาษี ณ ที่จ่าย — ภาษีที่ลูกค้าหักไว้ถือว่าจ่ายแล้ว ไม่ใช่ยอดค้าง */
  const settled = receipts.reduce((sum, r) => sum + r.total + r.wht, 0);
  return {
    seqs: deal.plan.length,
    /* งวดหนึ่งอาจมีใบเสร็จหลายใบตอนลูกค้าทยอยจ่าย นับงวดที่ปิดแล้วจากใบแจ้งหนี้ */
    paidSeqs: acc.invoices.filter((v) => v.deal === dealNo && invoiceStatus(acc, v) === "paid").length,
    received,
    outstanding: Math.max(0, round2(deal.net + deal.wht - settled)),
  };
}

// ═══ โปรเจค → วางบิลงวดแรก → ใบเสนอราคา ═══════════════════════════
/*
 * โปรเจคผูกกับใบแจ้งหนี้งวดแรก (ผู้ใช้สั่ง 5 ต.ค. 2569) — หาใบเสนอราคาและลูกค้าผ่านใบนั้นเสมอ ไม่ผ่านดีล
 * ข้อมูลรุ่นก่อนที่ยังไม่รู้เลขใบแจ้งหนี้ (bill ว่าง) หาใบงวดแรกจากเลขดีลแทนหนึ่งครั้ง
 */
export function firstBillOf(p: Pick<Project, "bill" | "deal">, acc: AccState): Invoice | null {
  return (
    (p.bill ? acc.invoices.find((v) => v.no === p.bill) : undefined) ??
    (p.deal ? acc.invoices.find((v) => v.deal === p.deal && v.seq === 1) : undefined) ??
    null
  );
}

/** เลขที่ใบเสนอราคาของโปรเจค — ใบแจ้งหนี้งวดแรก → รายการวางบิล → ใบเสนอราคา · หาไม่เจอใช้ที่จำไว้ในโปรเจค */
export function quotationNoOf(p: Pick<Project, "bill" | "deal" | "quo">, acc: AccState) {
  const bill = firstBillOf(p, acc);
  return (bill && acc.deals.find((d) => d.no === bill.deal)?.quo) || p.quo;
}
