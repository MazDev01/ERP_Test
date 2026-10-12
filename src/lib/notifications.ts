/*
 * รวมเรื่องที่ต้องรู้จากทุกโมดูลมาไว้ที่กระดิ่งเดียว
 * ทุกรายการคำนวณจากข้อมูลจริง ไม่ได้เก็บแยก — งานเสร็จเมื่อไร แจ้งเตือนหายเอง
 */

import { dayKey, recordsOfDay, toSessions, type PunchRecord } from "./attendance";
import {
  EXPIRING_DAYS,
  PRESALES_OPEN,
  canBillQuotation,
  quotationTotals,
  quotationValidUntil,
  STALE_DAYS,
} from "./crm-data";
import type { CrmState } from "./crm-store";
import { claimTotal, isLocked, type ExpenseClaim } from "./expense-data";
import { baht, daysBetween, thaiDate, thaiMonth, toIsoDate } from "./format";
import {
  GROUP_LABEL,
  HR_LEAVE_LABEL,
  closedIn,
  empOf,
  hrDocs,
  inPeriod,
  inRange,
  isDaily,
  payApproval,
  payKeyLabel,
  isDailyRoundKey,
  probEnd,
  rangeLabel,
  type PayGroup,
} from "./hr-data";
import type { HrState } from "./hr-store";
import type { LeaveRecord } from "./leave-data";
import type { EmpRequest } from "./emp-requests";
import type { NotifyEventKey } from "./notify-settings";
import type { OtRecord } from "./ot-data";
import { canBill, invoiceDue, invoiceStatus, type AccState } from "./acc-store";
import { isRef, lastSub, projectHref, type ProjectTask } from "./pm-data";
import { memberName, openNudge } from "./pm-store";
import { eventChangeNotices, eventNotices, type PmEvent } from "./pm-schedule-data";
import type { PmState } from "./pm-store";
import type { ReviewRound } from "./client-review-store";
import { ROLES, approvesFor, type Role } from "./role";
import type { LogArea, LogEntry } from "./admin-log";
import { findLink } from "./deep-link";
import { PS_UNTAKEN_DAYS, psMine, psOwner, psUntakenDays } from "./presales-work";

/** ทดลองงานเหลืออีกกี่วันถึงจะขึ้นเตือนฝ่ายบุคคล — ตรงกับแดชบอร์ด */
const PROBATION_WARN_DAYS = 30;

/** เรื่องที่เกิดขึ้นที่ฝ่ายอื่นแจ้งกี่วันย้อนหลัง (ชำระเงิน ส่งมอบงาน) */
const RECENT_DAYS = 7;

/** งานของทีมงานเหลืออีกกี่วันถึงจะขึ้นเตือน */
const SOON_TASK_DAYS = 3;

/*
 * กติกากลาง (ผู้ใช้กำหนด 23 ก.ย. 2569)
 * อะไรที่คนหนึ่ง "ยื่นหรือส่งไป" แล้วสถานะเปลี่ยน คนนั้นต้องรู้เสมอ ไม่ต้องไปเปิดหน้าดูเอง
 * ตีกลับสำคัญกว่าอนุมัติ เพราะมีคนต้องลงมือแก้ — ไม่ผ่านให้ระดับ late ผ่านให้ระดับ info
 * และทุกเรื่องต้องลิงก์ไปหน้าที่ลงมือต่อได้จริง แล้วหายเองเมื่อเรื่องนั้นเดินต่อไปแล้ว
 */

/** ผลการตัดสินแจ้งย้อนหลังกี่วัน — เกินนี้ถือว่ารู้แล้ว ไม่ต้องค้างในกระดิ่ง */
const DECIDED_DAYS = 7;

/*
 * สองช่องนี้ฝั่ง PM เป็นคนเขียนลงใบงาน (pm-data) — ระบบนี้แค่อ่าน
 * ใบงานเก่ายังไม่มี จึงอ่านแบบเผื่อไม่มีเสมอ ไม่ใช่บังคับให้ทุกใบต้องมี
 */
type TaskChange = { at: string; what: "assign" | "due" | "owner"; by: string };
type TaskMeta = ProjectTask & { assignedAt?: string; lastChange?: TaskChange };

/** ใบงานนี้เพิ่งถูกมอบหมายหรือเพิ่งถูกแก้อะไร — ไม่มีข้อมูลคืน null */
function taskChange(t: ProjectTask): TaskChange | null {
  const meta = t as TaskMeta;
  if (meta.lastChange?.at) return meta.lastChange;
  return meta.assignedAt ? { at: meta.assignedAt, what: "assign", by: "" } : null;
}

/** ข้อความของการเปลี่ยนแปลงแต่ละแบบ */
const CHANGE_TEXT: Record<TaskChange["what"], { group: string; detail: (t: ProjectTask) => string }> = {
  assign: { group: "มีงานใหม่มอบหมายให้คุณ", detail: (t) => `กำหนดส่ง ${thaiDate(t.due)}` },
  due: { group: "กำหนดส่งงานเปลี่ยน", detail: (t) => `กำหนดส่งใหม่ ${thaiDate(t.due)}` },
  owner: { group: "ผู้รับผิดชอบงานเปลี่ยน", detail: (t) => `ตอนนี้ ${t.whos.map(memberName).join(", ")} เป็นผู้รับผิดชอบ` },
};

/** เรื่องด่วนขึ้นก่อนเสมอ ภายในระดับเดียวกันเรียงตามวันที่ */
export type Level = "late" | "soon" | "info";

const LEVEL_ORDER: Record<Level, number> = { late: 0, soon: 1, info: 2 };

export const LEVEL_STYLE: Record<Level, { tag: string; dot: string }> = {
  late: { tag: "t-late", dot: "var(--destructive)" },
  soon: { tag: "t-early", dot: "var(--warning)" },
  info: { tag: "t-info", dot: "var(--info)" },
};

export type Notice = {
  id: string;
  level: Level;
  group: string;
  /** เรื่องที่ปิด/เปิดได้ในหน้าตั้งค่าแจ้งเตือน — ไม่ระบุ = ปิดไม่ได้ */
  event?: NotifyEventKey;
  title: string;
  detail: string;
  href: string;
  /** วันที่ที่เรื่องนี้อ้างถึง ใช้เรียงลำดับ */
  date: string;
};

export function buildNotices(input: {
  crm: CrmState;
  leaves: LeaveRecord[];
  ot: OtRecord[];
  punches: PunchRecord[];
  claims: ExpenseClaim[];
  /** เวลาไทยตอนนี้ (bkkNow()) — เป็นหน้าปัดไทยแล้ว ห้ามส่ง new Date() ของเครื่อง */
  now: Date;
  pm: PmState;
  acc: AccState;
  /** งานของแต่ละบทบาทคนละเรื่อง — ฝั่งขายไม่ต้องเห็นโปรเจค ฝั่ง PM ไม่ต้องเห็นดีล */
  role: Role;
  /** จำนวนคำขอของลูกน้องที่รอเราอนุมัติ — นับมาจากหน้าเรียก ไม่ให้ไฟล์นี้รู้จักสโตร์ */
  approvals?: number;
  /** รหัสพนักงานที่ล็อกอินอยู่ — ทีมงานต้องเห็นเฉพาะงานของตัวเอง */
  meId?: string;
  /** สถานะฝ่ายบุคคล — มีเฉพาะตอนบทบาทเป็นฝ่ายบุคคล ไฟล์นี้ไม่ได้เรียกสโตร์เอง */
  hr?: HrState;
  /** ประวัติการตั้งค่าของผู้ดูแลระบบ — แจ้งบทบาทที่ได้รับผลว่ากติกาเปลี่ยน */
  adminLog?: LogEntry[];
  /** ทุกบทบาทที่คนนี้ถืออยู่ (บัญชีเดียวควบได้) — คิวอนุมัติตามคน ไม่ใช่ตามบทบาทที่เลือกอยู่ */
  myRoles?: Role[];
  /** คำขอที่ยื่นผ่านคิวของทีม (emp-requests) — ผลการตัดสินของใบที่เป็นของเราต้องถึงเราด้วย */
  empReqs?: EmpRequest[];
  /** นัดหมายทั้งหมด — ผู้ถูกเชิญต้องรู้ว่ามีนัด และรู้เมื่อนัดถูกยกเลิก (สร้างนัดได้เฉพาะ PM/GM) */
  events?: PmEvent[];
  /** รอบที่ลูกค้าตรวจผ่านลิงก์ (client-review-store) — PM ต้องรู้เมื่อลูกค้าส่งความเห็นกลับมา */
  reviews?: ReviewRound[];
}): Notice[] {
  const { crm, pm, acc, leaves, ot, punches, claims, now, role } = input;
  const today = toIsoDate(now);
  const out: Notice[] = [];
  const nameOf = new Map(crm.customers.map((c) => [c.code, c.name]));

  // ═══ คำขอที่รอเราอนุมัติ — ขึ้นก่อนเรื่องอื่นเพราะมีคนรอเราอยู่ ═══
  /* เฉพาะบทบาทที่เป็นผู้อนุมัติจริง ไม่งั้นกดแล้วไปเจอหน้าที่บทบาทนั้นเข้าไม่ได้
     (กติกาอยู่ที่นี่ ไม่ฝากไว้กับหน้าจอที่เรียก)
     คนหนึ่งถือได้หลายบทบาท (เช่น บัญชีกับบุคคลเป็นคนเดียวกัน) — ใบที่รอเขาในอีกบทบาทก็ต้องนับ
     ไม่งั้นสลับบทบาทแล้วกระดิ่งเงียบทั้งที่มีคนรออยู่ */
  const myRoles = input.myRoles?.length ? input.myRoles : [role];
  if (input.approvals && input.approvals > 0 && myRoles.some((r) => approvesFor(r).length > 0)) {
    out.push({
      id: "approvals-pending",
      level: "soon",
      group: "รออนุมัติ",
      title: `มีคำขอรอคุณอนุมัติ ${input.approvals} รายการ`,
      detail: "ใบลา โอที และใบเบิกของทีมที่คุณดูแล",
      /* ผู้บริหารตัดสินที่หน้าคำขออนุมัติของตัวเอง ไม่มีเมนู /approvals กลาง */
      href: role === "ceo" ? "/ceo/approvals" : "/approvals",
      date: today,
    });
  }

  // ═══ เรื่องของผู้บริหาร ══════════════════════════════════════════
  /* ยอดเงินเดือนที่ฝ่ายบุคคลส่งมารออนุมัติ — ฝ่ายบุคคลปิดรอบไม่ได้จนกว่า CEO จะตัดสิน */
  if (role === "ceo" && input.hr) {
    for (const [key, a] of Object.entries(input.hr.payApprove)) {
      if (a.status !== "waiting") continue;
      const [month, group] = key.split("|") as [string, PayGroup];
      out.push({
        id: `ceopay-${key}-${a.sentAt ?? ""}`,
        level: "soon",
        group: "ยอดเงินเดือนรออนุมัติ",
        title: `รอบ ${payKeyLabel(month, thaiMonth)} · ${GROUP_LABEL[group]}`,
        detail: `${a.people ?? 0} คน · ยอดจ่ายสุทธิ ${baht(a.net ?? 0)} บาท`,
        href: "/ceo/approvals?k=pay",
        date: (a.sentAt ?? today).slice(0, 10),
      });
    }
  }

  // ═══ เรื่องของฝั่งขาย ═══════════════════════════════════════════
  if (role === "sales") {
  // ── นัดติดตามลูกค้าที่ถึงกำหนดหรือเลยแล้ว ──
  for (const a of crm.activities) {
    if (!a.followUp || a.followUp > today) continue;
    const late = daysBetween(a.followUp, today);
    out.push({
      id: `follow-${a.id}`,
      level: late > 0 ? "late" : "soon",
      group: "นัดติดตาม",
      title: nameOf.get(a.customerCode) ?? a.customerCode,
      detail:
        (a.nextAction || a.summary) +
        (late > 0 ? ` · เลยกำหนด ${late} วัน` : " · ถึงกำหนดวันนี้"),
      href: `/leads/${a.customerCode}`,
      date: a.followUp,
    });
  }

  // ── ผู้สนใจที่ไม่ได้ติดต่อนานเกินกำหนด ──
  const lastTouch = new Map<string, string>();
  for (const a of crm.activities) {
    const current = lastTouch.get(a.customerCode);
    if (!current || a.date > current) lastTouch.set(a.customerCode, a.date);
  }
  for (const c of crm.customers) {
    if (c.status !== "รอนัดหมาย") continue;
    const last = lastTouch.get(c.code);
    const idle = daysBetween(last ?? "2000-01-01", today);
    if (idle <= STALE_DAYS) continue;
    out.push({
      id: `stale-${c.code}`,
      level: "info",
      group: "ค้างติดตาม",
      title: c.name,
      detail: `ไม่ได้ติดต่อมา ${idle} วัน${last ? ` · ล่าสุด ${thaiDate(last)}` : ""}`,
      href: `/leads/${c.code}`,
      date: last ?? today,
    });
  }

  // ── ใบเสนอราคาที่ส่งไปแล้วและใกล้หมดอายุ — วันมีผลนับจากวันที่ส่งให้ลูกค้า (quotationValidUntil) ──
  for (const q of crm.quotations) {
    if (!canBillQuotation(q, crm.deals.some((d) => d.quotationNo === q.no), today)) continue;
    const left = daysBetween(today, quotationValidUntil(q));
    if (left < 0 || left > EXPIRING_DAYS) continue;
    out.push({
      id: `quote-${q.id}`,
      level: left <= 2 ? "late" : "soon",
      group: "ใบเสนอราคาใกล้หมดอายุ",
      event: "quotexp",
      title: `${q.no} · ${nameOf.get(q.customerCode) ?? q.customerCode}`,
      detail: `${baht(quotationTotals(q).grand)} บาท · ${left === 0 ? "หมดอายุวันนี้" : `เหลืออีก ${left} วัน`}`,
      href: `/quotations/${encodeURIComponent(q.no)}`,
      date: quotationValidUntil(q),
    });
  }

  // ── คำขอก่อนการขายที่เลยกำหนดส่ง ──
  for (const p of crm.presales) {
    if (!PRESALES_OPEN.includes(p.status)) continue;
    const late = daysBetween(p.due, today);
    if (late < 0) continue;
    out.push({
      id: `presale-${p.id}`,
      level: late > 0 ? "late" : "soon",
      group: "คำขอก่อนการขาย",
      event: "presales",
      title: `${p.no} · ${nameOf.get(p.customerCode) ?? p.customerCode}`,
      detail: `${p.assignee} · ${late > 0 ? `เลยกำหนดส่ง ${late} วัน` : "ครบกำหนดส่งวันนี้"}`,
      href: findLink("/presales", p.no),
      date: p.due,
    });
  }

  // ── ผู้รับคำขอ (PM) ขอข้อมูลเพิ่ม — งานหยุดรอเราอยู่ ──
  for (const p of crm.presales) {
    if (p.status !== "รอข้อมูลเพิ่ม" || !p.ask) continue;
    out.push({
      id: `presaleask-${p.id}-${p.ask.length}`,
      level: "soon",
      group: "ทีมขอข้อมูลเพิ่ม",
      event: "presales",
      title: `${p.no} · ${nameOf.get(p.customerCode) ?? p.customerCode}`,
      detail: p.ask,
      href: findLink("/presales", p.no),
      date: today,
    });
  }

  // ── ข้อเสนอที่ส่งกลับมาแล้ว รอเราออกใบเสนอราคา ──
  for (const p of crm.presales) {
    if (p.status !== "ส่งกลับแล้ว") continue;
    const hasQuote = crm.quotations.some((q) => q.customerCode === p.customerCode);
    if (hasQuote) continue;
    out.push({
      id: `ready-${p.id}`,
      level: "info",
      group: "พร้อมออกใบเสนอราคา",
      title: `${p.no} · ${nameOf.get(p.customerCode) ?? p.customerCode}`,
      detail: "ทีมส่งข้อเสนอกลับมาแล้ว ยังไม่ได้ออกใบเสนอราคา",
      href: `/quotations/new?ps=${encodeURIComponent(p.no)}`,
      date: p.due,
    });
  }

  /* ── งานที่ปิดการขายไว้เดินต่อที่ฝ่ายอื่น — ลูกค้าจ่ายงวดแรก (งานเข้า PM) และ PM ส่งมอบครบ
     แสดงเฉพาะเรื่องที่เพิ่งเกิดในไม่กี่วัน ไม่ต้องให้ฝ่ายขายไปถามเอง ── */
  for (const d of crm.deals) {
    if (d.status !== "ปิดการขาย") continue;
    const cus = nameOf.get(d.customerCode) ?? d.customerCode;
    const first = acc.receipts.find((r) => r.deal === d.no && r.seq === 1);
    if (first && daysBetween(first.date, today) <= RECENT_DAYS) {
      out.push({
        id: `dealpaid-${d.no}`,
        level: "info",
        group: "ลูกค้าชำระงวดแรกแล้ว",
        title: `${d.no} · ${cus}`,
        detail: `ชำระ ${baht(first.total)} บาท · ส่งงานให้ PM เริ่มโปรเจคแล้ว`,
        href: `/deals?find=${encodeURIComponent(d.no)}`,
        date: first.date,
      });
    }
    const proj = pm.projects.find((p) => p.deal === d.no && p.status === "done");
    if (proj && daysBetween(proj.updated, today) <= RECENT_DAYS) {
      out.push({
        id: `dealdone-${d.no}`,
        level: "info",
        group: "ส่งมอบงานครบแล้ว",
        title: `${d.no} · ${cus}`,
        detail: "PM ตรวจงานสุดท้ายผ่านแล้ว ใบงานขึ้น \"ส่งมอบ\"",
        href: `/deals?find=${encodeURIComponent(d.no)}`,
        date: proj.updated,
      });
    }
  }

  }

  // ═══ เรื่องของทีมก่อนการขาย (SA/BD) — ต้นแบบ presales-work.html ═══════════
  if (role === "ps") {
    for (const p of crm.presales) {
      /* กล่องเดียวรับทั้ง SA และ BD — คำขอต้องมีคนเห็นเสมอ (ดู psMine) */
      if (!psMine(p)) continue;
      const cus = nameOf.get(p.customerCode) ?? p.customerCode;
      /* คำขอใหม่ที่ยังไม่มีใครรับ */
      if (p.status === "รอรับงาน") {
        out.push({
          id: `psnew-${p.id}`,
          level: daysBetween(p.due, today) > 0 ? "late" : "soon",
          group: "มีคำขอใหม่รอรับงาน",
          title: `${p.no} · ${cus}`,
          detail: `ต้องการวันที่ ${thaiDate(p.due)}`,
          href: findLink("/presales-work", p.no),
          date: p.createdAt,
        });
      }
      /* ฝ่ายขายตอบข้อมูลที่ขอแล้ว งานกลับมาที่เรา */
      if (p.status === "กำลังทำ" && p.reply) {
        out.push({
          id: `psreply-${p.id}-${p.reply.length}`,
          level: "info",
          group: "ฝ่ายขายส่งข้อมูลเพิ่มแล้ว",
          title: `${p.no} · ${cus}`,
          detail: p.reply,
          href: findLink("/presales-work", p.no),
          date: today,
        });
      }
    }
  }

  // ═══ เรื่องของผู้จัดการทั่วไป (GM) ═══════════════════════════════
  /*
   * คำขอก่อนการขายที่ไม่มีใครรับเกิน 1 วัน ต้องเด้งถึง GM (ผู้ใช้กำหนด 23 ก.ย. 2569)
   * ไม่ใช่รอให้ใครสังเกตเอง — GM เปิดหน้างานก่อนการขายไม่ได้ จึงพากลับไปที่แดชบอร์ดของตัวเอง
   */
  if (role === "gm") {
    for (const p of crm.presales) {
      const days = psUntakenDays(p, today);
      if (days <= PS_UNTAKEN_DAYS) continue;
      const cus = nameOf.get(p.customerCode) ?? p.customerCode;
      out.push({
        id: `gmps-${p.id}`,
        level: "late",
        group: "คำขอก่อนการขายยังไม่มีใครรับ",
        title: `${p.no} · ${cus}`,
        detail: `ประเภท ${p.kind} · ${psOwner(p)} · ค้างมา ${days} วัน · ต้องส่งงาน ${thaiDate(p.due)}`,
        href: `/presales-work?find=${encodeURIComponent(p.no)}`,
        date: p.createdAt,
      });
    }
  }

  // ═══ เรื่องของฝั่ง PM ══════════════════════════════════════════
  if (role === "pm") {
    /* ลูกค้าชำระงวดถัดไปของโปรเจคที่กำลังทำ — PM ต้องรู้ว่างานงวดไหนได้เงินแล้ว (งวดแรกขึ้นเป็นงานเข้าใหม่อยู่แล้ว) */
    for (const r of acc.receipts) {
      if (r.seq <= 1 || daysBetween(r.date, today) > RECENT_DAYS) continue;
      /* โปรเจคผูกกับวางบิลงวดแรก — ใบเสร็จงวดถัดไปของรายการวางบิลเดียวกันคือของโปรเจคนี้ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
      const proj = pm.projects.find(
        (p) => (acc.invoices.find((v) => v.no === p.bill)?.deal ?? p.deal) === r.deal,
      );
      if (!proj) continue;
      out.push({
        id: `pmpaid-${r.no}`,
        level: "info",
        group: "ลูกค้าชำระงวดถัดไปแล้ว",
        title: `${proj.cus} · งวดที่ ${r.seq}`,
        detail: `${r.no} · ${baht(r.total)} บาท`,
        href: projectHref(proj.pj),
        date: r.date,
      });
    }

    /* งานที่บัญชีส่งมาแล้วยังไม่ได้ตรวจ ต้องขึ้นก่อน เพราะทั้งโปรเจคยังไม่เริ่ม */
    for (const j of pm.inbox) {
      const waiting = daysBetween(j.sentAt, today);
      out.push({
        id: `pmin-${j.pj}`,
        level: j.stage === "new" ? (waiting > 2 ? "late" : "soon") : "info",
        group: j.stage === "new" ? "งานเข้าใหม่รอตรวจ" : "งานรอวางแผน",
        title: j.cus,
        detail:
          j.scope +
          (j.stage === "new"
            ? ` · เข้ามา ${waiting > 0 ? `${waiting} วันแล้ว` : "วันนี้"}`
            : " · ตรวจเอกสารแล้ว รอจัดแผนงาน"),
        href: j.stage === "new" ? "/pm/inbox" : "/pm/plan",
        date: j.sentAt,
      });
    }
    /*
     * ดีลที่ถูกยกเลิก — งานที่ PM วางไว้ต้องหยุด และ PM ต้องรู้ทันทีว่าทำไม
     * (เจ้าของสั่ง 24 ก.ย. 2569 — เดิมโปรเจคหายจากหน้าไปเงียบ ๆ ไม่มีใครบอกอะไร
     * ทั้งที่ PM อาจกำลังจัดคนและนัดลูกค้าของงานนั้นอยู่)
     * ขึ้นเฉพาะใบที่เพิ่งถูกยกเลิก จะได้ไม่ค้างในกระดิ่งตลอดไป
     */
    for (const p of pm.projects) {
      if (p.status !== "cancelled" || !p.cancelled) continue;
      const day = p.cancelled.at.slice(0, 10);
      if (daysBetween(day, today) > DECIDED_DAYS) continue;
      out.push({
        id: `pmcancel-${p.pj}`,
        level: "late",
        group: "ดีลถูกยกเลิก งานหยุด",
        title: `${p.cus} · ${p.name || p.scope}`,
        detail: `${p.cancelled.by}ยกเลิกเมื่อ ${thaiDate(day)} · ${p.cancelled.why} — แผนที่วางไว้ยังเปิดดูได้`,
        href: projectHref(p.pj),
        date: day,
      });
    }

    /* ทีมส่งมาแล้วรอเราตัดสิน — ค้างที่นี่คือทั้งทีมหยุดรอ จึงขึ้นก่อนงานเลยกำหนด
       ดีลที่ยกเลิกแล้วไม่นับ — หน้างานรอตรวจก็กรองทิ้ง (pm-reviews-page.tsx) ถ้านับที่นี่ด้วย
       กระดิ่งจะบอกจำนวนไม่ตรงกับหน้า แล้วกดเข้าไปก็ไม่เจอใบนั้น */
    for (const p of pm.projects) {
      if (p.status === "cancelled") continue;
      for (const [i, t] of p.tasks.entries()) {
        if (t.status !== "sent") continue;
        const sub = lastSub(t);
        const waited = sub ? daysBetween(sub.at.split(" ")[0], today) : 0;
        out.push({
          id: `pmrev-${p.pj}-${i}`,
          level: waited >= 3 ? "late" : "soon",
          group: "งานรอตรวจ",
          title: `${p.cus} · ${t.name}`,
          detail: `${memberName(sub?.by ?? t.whos[0] ?? "")} ส่งมา${
            waited > 0 ? `เมื่อ ${waited} วันก่อน` : "วันนี้"
          }`,
          href: "/pm/reviews",
          date: sub?.at.split(" ")[0] ?? t.due,
        });
      }
    }
    /* ลูกค้าส่งความเห็น/อนุมัติผ่านลิงก์ตรวจงานแล้ว — ค้างจนกว่า PM จะส่งให้ทีมแก้หรือปิดงาน */
    for (const r of input.reviews ?? []) {
      if ((r.status !== "submitted" && r.status !== "approved") || r.forwardedAt || r.closedAt) continue;
      const proj = pm.projects.find((p) => isRef(p, r.pj));
      if (!proj || proj.status === "cancelled") continue;
      out.push({
        id: `pmclient-${r.token}`,
        level: "soon",
        group: "ลูกค้าส่งความเห็นแล้ว",
        title: `${proj.cus} · ${r.taskName}`,
        detail:
          r.status === "approved"
            ? `ลูกค้าอนุมัติรอบที่ ${r.round} แล้ว · ปิดงานได้`
            : `ลูกค้าคอมเมนต์ ${r.comments.length} จุด ในรอบที่ ${r.round}`,
        href: `${projectHref(proj.pj)}&review=${r.token}`,
        date: (r.submittedAt ?? r.createdAt).slice(0, 10),
      });
    }
    /*
     * งานย่อยเลยกำหนดที่ยังอยู่ในมือทีม — กติกาเดียวกับการ์ด "งานย่อยล่าช้า" บนแดชบอร์ด PM
     * เดิมนับเฉพาะโปรเจคที่ status = "running" ทำให้งานค้างในโปรเจคที่ปิดว่าส่งมอบแล้วหายไป
     * (แดชบอร์ดนับ กระดิ่งไม่นับ จึงได้ 5 กับ 4) — งานที่ยังไม่เสร็จก็ยังเป็นงานของใครสักคน
     * ไม่ว่าโปรเจคจะถูกปิดไปแล้วหรือไม่ นับทุกโปรเจคที่ไม่ได้ยกเลิก
     * งานที่ส่งมารอเราตรวจ (sent) ไม่นับตรงนี้ เพราะลูกบอลอยู่ที่ PM — อยู่ในกลุ่ม "งานรอตรวจ" ข้างบนแล้ว
     */
    for (const p of pm.projects) {
      if (p.status === "cancelled") continue;
      for (const [i, t] of p.tasks.entries()) {
        /* รอลูกค้าตรวจ (wait) — ลูกบอลอยู่ที่ลูกค้า ไม่ใช่ทีม */
        if (t.status === "done" || t.status === "sent" || t.status === "wait") continue;
        const over = daysBetween(t.due, today);
        if (over <= 0) continue;
        out.push({
          id: `pmtask-${p.pj}-${i}`,
          level: "late",
          group: "งานย่อยเลยกำหนด",
          title: `${p.cus} · ${t.name}`,
          detail:
            `${t.whos.map(memberName).join(", ") || "ยังไม่มีผู้รับผิดชอบ"} · เลยกำหนด ${over} วัน` +
            (p.status === "done" ? " · โปรเจคปิดว่าส่งมอบแล้ว" : ""),
          href: projectHref(p.pj),
          date: t.due,
        });
      }
    }
  }

  // ═══ เรื่องของทีมงาน ═══════════════════════════════════════════
  /*
   * ทีมงานสนใจสองเรื่องเท่านั้น — งานที่ PM ตีกลับมา กับงานที่ใกล้หรือเลยกำหนดแล้ว
   * งานที่ส่งไปแล้วไม่ต้องเตือน เพราะลูกบอลอยู่ที่ PM ไม่ได้อยู่ที่เรา
   */
  if (role === "staff" && input.meId) {
    const meId = input.meId;
    for (const p of pm.projects) {
      /*
       * ดีลถูกยกเลิก งานหยุด — แต่คนที่ถือใบงานอยู่ต้องรู้ ไม่ใช่ทำต่อไปเรื่อย ๆ แล้วมารู้ทีหลัง
       * (เจ้าของสั่ง 24 ก.ย. 2569) ขึ้นใบเดียวต่อโปรเจค ไม่ใช่ใบละงาน และหายเองเมื่อพ้นช่วงแจ้ง
       */
      if (p.status === "cancelled") {
        if (!p.cancelled || !p.tasks.some((t) => t.whos.includes(meId))) continue;
        const day = p.cancelled.at.slice(0, 10);
        if (daysBetween(day, today) > DECIDED_DAYS) continue;
        out.push({
          id: `mycancel-${p.pj}`,
          level: "late",
          group: "งานถูกยกเลิก",
          title: `${p.cus} · ${p.name || p.scope}`,
          detail: `ดีลถูกยกเลิกโดย${p.cancelled.by} · ${p.cancelled.why} — หยุดงานของโปรเจคนี้ได้เลย`,
          href: "/my-tasks",
          date: day,
        });
        continue;
      }
      for (const [i, t] of p.tasks.entries()) {
        if (!t.whos.includes(meId)) continue;

        /* ── งานที่เพิ่งมอบหมาย เพิ่งเลื่อนกำหนดส่ง หรือเพิ่งเปลี่ยนผู้รับผิดชอบ ──
           เดิมทีมงานรู้ตัวก็ตอนใกล้ครบกำหนดแล้ว งานที่กำหนดส่งอีกไกลจึงเงียบสนิท
           นับจากเวลาที่ PM แก้ (lastChange/assignedAt) และหายเองเมื่อทำงานเสร็จหรือเกินช่วงแจ้ง */
        const ch = taskChange(t);
        if (ch && t.status !== "done" && daysBetween(ch.at.slice(0, 10), today) <= RECENT_DAYS) {
          const text = CHANGE_TEXT[ch.what] ?? CHANGE_TEXT.assign;
          out.push({
            id: `mytask-${ch.what}-${p.pj}-${i}-${ch.at}`,
            level: "info",
            group: text.group,
            title: `${p.cus} · ${t.name}`,
            detail: text.detail(t),
            href: `${findLink("/my-tasks", t.name)}&stage=recv`,
            date: ch.at.slice(0, 10),
          });
        }

        /* ── PM ตรวจผ่านแล้ว (กติกากลาง) ──
           เดิมมีแต่ทางตีกลับ งานที่ผ่านจึงเงียบสนิท ทั้งที่เป็นสัญญาณให้ไปเริ่มงานชิ้นถัดไป
           นับจากเวลาที่ PM กดผ่าน (doneAt) งานเก่าที่ปิดไปนานแล้วจึงไม่ย้อนกลับมาเด้ง */
        if (t.status === "done" && t.doneAt && daysBetween(t.doneAt.slice(0, 10), today) <= DECIDED_DAYS) {
          out.push({
            id: `mytask-ok-${p.pj}-${i}`,
            level: "info",
            group: "งานตรวจผ่านแล้ว",
            title: `${p.cus} · ${t.name}`,
            detail: `PM ตรวจผ่านเมื่อ ${thaiDate(t.doneAt.slice(0, 10))} · เริ่มงานชิ้นถัดไปได้เลย`,
            /* งานที่ผ่านแล้วอยู่แท็บ "ผ่านแล้ว" ต้องบอกหน้าให้สลับให้ ไม่งั้นกดไปแล้วไม่เจอใบนั้น */
            href: `${findLink("/my-tasks", t.name)}&stage=done`,
            date: t.doneAt.slice(0, 10),
          });
          continue;
        }

        /* ── PM ทวงงานใบนี้ (กติกากลาง: สิ่งที่คนหนึ่งต้องลงมือ ต้องถึงตัวเขา) ──
           ก่อนหน้านี้ PM พิมพ์ทวงในแชทโปรเจค ซึ่งทีมงานเปิดไม่ได้ ข้อความจึงไม่เคยถึงใคร
           ขึ้นเฉพาะตอนที่ข้อความล่าสุดของงานนั้นยังเป็นการทวงที่ยังไม่ตอบ ตอบแล้วหายเอง */
        const nudge = openNudge(pm, p.pj, t.name);
        if (nudge) {
          out.push({
            id: `mytask-nudge-${p.pj}-${i}`,
            level: "late",
            group: "PM ทวงงาน",
            title: `${p.cus} · ${t.name}`,
            detail: nudge.tx,
            href: `${findLink("/my-tasks", t.name)}&stage=${t.status === "revise" ? "revise" : "recv"}`,
            date: nudge.at.slice(0, 10),
          });
        }

        if (t.status === "revise" && t.back) {
          out.push({
            id: `mytask-back-${p.pj}-${i}`,
            level: "late",
            group: "งานที่ต้องแก้ไข",
            title: `${p.cus} · ${t.name}`,
            detail: t.back.why,
            /* งานที่ถูกตีกลับอยู่แท็บ "ต้องแก้ไข" ไม่ใช่แท็บแรก ต้องบอกหน้าให้สลับให้ */
            href: `${findLink("/my-tasks", t.name)}&stage=revise`,
            date: t.back.at.split(" ")[0],
          });
          continue;
        }

        if (t.status === "todo" || t.status === "doing") {
          const over = daysBetween(t.due, today);
          if (over < -SOON_TASK_DAYS) continue;
          out.push({
            id: `mytask-due-${p.pj}-${i}`,
            level: over > 0 ? "late" : "soon",
            group: over > 0 ? "งานเลยกำหนดส่ง" : "งานใกล้ถึงกำหนด",
            title: `${p.cus} · ${t.name}`,
            detail:
              over > 0
                ? `เลยกำหนด ${over} วัน ยังไม่ได้ส่งให้ PM ตรวจ`
                : `เหลืออีก ${-over} วัน · กำหนดส่ง ${thaiDate(t.due)}`,
            href: `${findLink("/my-tasks", t.name)}&stage=recv`,
            date: t.due,
          });
        }
      }
    }
  }

  // ═══ เรื่องของฝ่ายบุคคล ═══════════════════════════════════════
  /*
   * เอาของชุดเดียวกับตาราง "งานที่ต้องดำเนินการ" บนแดชบอร์ดฝ่ายบุคคลมาขึ้นกระดิ่ง
   * เพราะเดิมฝ่ายบุคคลเป็นบทบาทเดียวที่กระดิ่งไม่มีเรื่องของฝ่ายตัวเองเลย
   * ต้องเปิดแดชบอร์ดเองถึงจะรู้ว่ามีอะไรค้าง ซึ่งต่างจากอีกสี่บทบาท
   */
  if (role === "hr" && input.hr) {
    const hr = input.hr;
    const active = hr.emp.filter((e) => e.status === "active");
    const need = hrDocs().filter((d) => d.req);

    for (const e of active) {
      const missing = need.filter((d) => !e.docs.includes(d.v));
      if (missing.length === 0) continue;
      out.push({
        id: `hrdoc-${e.id}`,
        level: "info",
        group: "เอกสารพนักงานยังไม่ครบ",
        title: e.name,
        detail: `ขาด ${missing.length} รายการ · ${missing.map((d) => d.label).join(" · ")}`,
        href: `/hr/employees?find=${encodeURIComponent(e.name)}`,
        date: e.startedAt,
      });
    }

    /* ทดลองงานต้องตัดสินใจก่อนถึงวันครบกำหนด เลยวันแล้วคือค้างจริง */
    for (const e of active) {
      if (e.type !== "probat") continue;
      const end = toIsoDate(probEnd(e.startedAt));
      const left = daysBetween(today, end);
      if (left > PROBATION_WARN_DAYS) continue;
      out.push({
        id: `hrprob-${e.id}`,
        level: left < 0 ? "late" : "soon",
        group: "ครบกำหนดทดลองงาน",
        title: e.name,
        detail:
          left < 0
            ? `เลยกำหนดมา ${Math.abs(left)} วัน ยังไม่ได้ตัดสิน`
            : `อีก ${left} วันครบกำหนด · ${thaiDate(end)}`,
        href: `/hr/employees?find=${encodeURIComponent(e.name)}`,
        date: end,
      });
    }

    /* ใบลาของนักศึกษาฝึกงาน ฝ่ายบุคคลเป็นผู้อนุมัติเอง (ERD HR-BR-14) */
    for (const r of hr.internLeave) {
      if (r.status !== "pending") continue;
      out.push({
        id: `hrintern-${r.id}`,
        level: "soon",
        group: "ใบลานักศึกษาฝึกงานรออนุมัติ",
        title: `${empOf(hr.emp, r.emp)?.name ?? r.emp} · ${HR_LEAVE_LABEL[r.lt]}`,
        detail: `${thaiDate(r.from)}${r.from !== r.to ? ` – ${thaiDate(r.to)}` : ""} · ${r.days} วัน`,
        href: "/hr/dashboard",
        date: r.at.slice(0, 10),
      });
    }

    /*
     * CEO ตีกลับยอดเงินเดือน — ดูทุกรอบและทุกกลุ่ม ไม่ใช่เฉพาะรอบล่าสุด
     * (เดิมสายเงินเดือนข้างล่างอ่านแค่ hr.periods ตัวท้าย รอบก่อนหน้าหรือกลุ่มรายวันที่ถูกตีกลับจึงเงียบสนิท)
     * ยอดที่ถูกตีกลับต้องมีคนแก้เสมอ จึงเป็นระดับ late และหายเองเมื่อส่งใหม่หรือรอบนั้นปิดแล้ว
     */
    for (const [key, ap] of Object.entries(hr.payApprove)) {
      if (ap.status !== "rejected") continue;
      const [m, g] = key.split("|") as [string, PayGroup];
      if (closedIn(hr.payruns.find((p) => p.month === m), g)) continue;
      out.push({
        id: `hrpayrej-${key}-${ap.at ?? ""}`,
        level: "late",
        group: "CEO ตีกลับยอดเงินเดือน",
        title: `รอบ ${payKeyLabel(m, thaiMonth)} · ${GROUP_LABEL[g]}`,
        detail: `เหตุผล: ${ap.reason || "—"} · แก้แล้วส่งใหม่`,
        /* เปิดตรงเมนูย่อยของกลุ่มที่ถูกตีกลับ พร้อมรอบนั้น (ผู้ใช้สั่ง 5 ต.ค. 2569) */
        href: isDailyRoundKey(m) ? `/hr/payroll?g=daily&r=${m}` : `/hr/payroll?g=${g === "day" ? "daily" : "month"}&m=${m}`,
        date: (ap.at ?? today).slice(0, 10),
      });
    }

    /* สายเงินเดือนเดินเป็นขั้น — ขึ้นทีละเรื่องตามขั้นที่ค้างอยู่จริง ไม่ขึ้นพร้อมกันทุกขั้น */
    const month = hr.periods[hr.periods.length - 1]?.month;
    if (month) {
      const timeClosed = hr.periods.some((p) => p.month === month && p.closed);
      const payClosed = hr.payruns.some((p) => p.month === month && p.closed);
      const slip = hr.slips.find((sp) => sp.month === month);

      if (!timeClosed)
        out.push({
          id: `hrtime-${month}`,
          level: "soon",
          group: "รอบเวลาทำงานยังไม่ปิด",
          title: `รอบ ${thaiMonth(month)}`,
          detail: "ปิดรอบก่อน จึงจะคำนวณเงินเดือนได้",
          href: "/hr/timesheet?g=month",
          date: today,
        });
      else if (!payClosed) {
        /* ขั้นนี้ขึ้นกับ CEO — บอกตามสถานะการอนุมัติจริง ไม่ใช่บอกให้ปิดรอบทั้งที่ยังปิดไม่ได้
           ยอดที่ถูกตีกลับขึ้นครบทุกรอบไปแล้วด้านบน ตรงนี้จึงข้าม ไม่ให้เรื่องเดียวขึ้นสองใบ */
        const ap = payApproval(hr.payApprove, month, "month");
        const step =
          ap.status === "waiting"
            ? { level: "info" as const, group: "รอ CEO อนุมัติยอดเงินเดือน", detail: "ส่งยอดแล้ว รอผู้บริหารตัดสิน" }
            : ap.status === "approved"
              ? { level: "soon" as const, group: "CEO อนุมัติยอดเงินเดือนแล้ว", detail: "ปิดรอบเงินเดือนได้เลย" }
              : { level: "soon" as const, group: "รอบเงินเดือนยังไม่ปิด", detail: "ส่งยอดให้ CEO อนุมัติก่อน จึงจะปิดรอบได้" };
        if (ap.status !== "rejected")
          out.push({
            id: `hrpay-${month}-${ap.status}-${ap.at ?? ap.sentAt ?? ""}`,
            level: step.level,
            group: step.group,
            title: `รอบ ${thaiMonth(month)}`,
            detail: step.detail,
            href: "/hr/payroll?g=month",
            date: today,
          });
      }
      else if (!slip?.madeAt)
        out.push({
          id: `hrslip-${month}`,
          level: "soon",
          group: "ยังไม่ได้สร้างสลิป",
          title: `รอบ ${thaiMonth(month)}`,
          detail: "รอบเงินเดือนปิดแล้ว สร้างสลิปได้เลย",
          href: "/hr/payslip?g=month",
          date: today,
        });
      else if (!slip.published)
        out.push({
          id: `hrpub-${month}`,
          level: "soon",
          group: "สลิปยังไม่เผยแพร่",
          title: `รอบ ${thaiMonth(month)}`,
          detail: "สร้างสลิปแล้วแต่พนักงานยังเปิดดูไม่ได้",
          href: "/hr/payslip?g=month",
          date: slip.madeAt,
        });
    }
  }

  // ═══ เรื่องของฝั่งบัญชี ════════════════════════════
  if (role === "acc") {
    for (const v of acc.invoices) {
      /* เงื่อนไขเดียวกับ awaitingReceipt ในสโตร์ — กระดิ่งกับหน้าวางบิลจึงนับใบชุดเดียวกัน */
      if (invoiceStatus(acc, v) === "cancelled" || invoiceDue(v) <= 0) continue;
      const over = daysBetween(v.due, today);
      /* ใกล้ครบกำหนดก็ต้องรู้ ไม่ใช่รอให้เลยแล้วค่อยตามเก็บ */
      if (over < -EXPIRING_DAYS) continue;
      out.push({
        id: `inv-${v.no}`,
        level: over > 0 ? "late" : "soon",
        group: over > 0 ? "ใบแจ้งหนี้เกินกำหนด" : "ใบแจ้งหนี้ใกล้ครบกำหนด",
        title: `${v.cus} · ${v.no}`,
        detail:
          `${baht(invoiceDue(v))} บาท · ` +
          (over > 0 ? `เกินกำหนด ${over} วัน` : over === 0 ? "ครบกำหนดวันนี้" : `เหลืออีก ${-over} วัน`),
        href: findLink("/acc/billing", v.no),
        date: v.due,
      });
    }
    /* งวดที่ออกใบแจ้งหนี้ได้แล้วแต่ยังไม่ได้ออก — เงินยังไม่เริ่มเดินจนกว่าจะวางบิล */
    for (const d of acc.deals) {
      const ready = d.plan.filter((_, i) => canBill(acc, d, i));
      if (!d.plan.length) {
        out.push({
          id: `plan-${d.no}`,
          level: "soon",
          group: "ดีลรอแบ่งงวด",
          title: d.cus,
          detail: `${d.no} · ${baht(d.net)} บาท · ยังไม่ได้แบ่งงวดชำระ`,
          href: findLink("/acc/billing", d.no),
          date: d.quoDate,
        });
        continue;
      }
      for (const p of ready) {
        out.push({
          id: `bill-${d.no}-${p.seq}`,
          level: "info",
          group: "งวดรอวางบิล",
          title: d.cus,
          detail: `${d.no} · งวดที่ ${p.seq} · ${baht(p.amount)} บาท`,
          href: findLink("/acc/billing", d.no),
          date: p.due || d.quoDate,
        });
      }
    }
    /* ไม่มีเรื่อง "รับเงินแล้วรอออกใบเสร็จ" อีก — ออกใบเสร็จคือการบันทึกรับชำระ (AC-BR-05)
       ใบที่ยังไม่ชำระขึ้นเป็นใบแจ้งหนี้ใกล้/เกินกำหนดด้านบนแล้ว */
    for (const w of acc.wht) {
      if (w.no) continue;
      out.push({
        id: `wht-${w.id}`,
        level: "info",
        group: "ยังไม่ออกหนังสือรับรอง",
        title: w.name,
        detail: `จ่ายเมื่อ ${thaiDate(w.date)} · ผู้รับเงินต้องได้เอกสาร`,
        href: "/acc/wht",
        date: w.date,
      });
    }
  }

  // ── ใบลาและโอทีของเราที่ยังรอหัวหน้าอนุมัติ ──
  for (const l of leaves) {
    if (l.status !== "รอการอนุมัติ") continue;
    out.push({
      id: `leave-${l.id}`,
      level: "info",
      group: "รออนุมัติ",
      title: `ใบลา${l.type}`,
      detail: `${thaiDate(l.date)} · ${l.days} วัน · รอหัวหน้าอนุมัติ`,
      href: "/leave",
      date: l.date,
    });
  }
  for (const o of ot) {
    if (o.status !== "รออนุมัติ") continue;
    out.push({
      id: `ot-${o.id}`,
      level: "info",
      group: "รออนุมัติ",
      title: `คำขอโอที ${o.id}`,
      detail: `${thaiDate(o.date)} · ${o.hours.toFixed(2)} ชม. · รอหัวหน้าอนุมัติ`,
      href: "/ot",
      date: o.date,
    });
  }

  /* ── ผลการตัดสินใบลาและใบโอทีของเรา (กติกากลาง) ──
     ตีกลับต้องรู้ทันทีเพราะต้องแก้แล้วยื่นใหม่ · อนุมัติแล้วก็ต้องรู้ จะได้วางแผนงานถูก
     นับจากเวลาที่ผู้อนุมัติตัดสิน (decidedAt) ใบเก่าก่อนมีช่องนี้จึงไม่เด้งย้อนหลังทั้งปี */
  for (const l of leaves) {
    if (!l.decidedAt || daysBetween(l.decidedAt.slice(0, 10), today) > DECIDED_DAYS) continue;
    const range = l.date === l.toDate ? thaiDate(l.date) : `${thaiDate(l.date)} – ${thaiDate(l.toDate)}`;
    if (l.status === "ไม่อนุมัติ")
      out.push({
        id: `leave-rej-${l.id}`,
        level: "late",
        group: "ใบลาไม่ผ่าน",
        title: `ใบลา${l.type} ${l.id}`,
        detail: `${range} · ${l.comment || "ผู้อนุมัติตีกลับ — ยื่นใหม่ได้"}`,
        href: "/leave",
        date: l.decidedAt.slice(0, 10),
      });
    else if (l.status === "อนุมัติแล้ว")
      out.push({
        id: `leave-ok-${l.id}`,
        level: "info",
        group: "ใบลาอนุมัติแล้ว",
        title: `ใบลา${l.type} ${l.id}`,
        detail: `${range} · ${l.days} วัน · หัวหน้าอนุมัติแล้ว`,
        href: "/leave",
        date: l.decidedAt.slice(0, 10),
      });
  }
  for (const o of ot) {
    if (!o.decidedAt || daysBetween(o.decidedAt.slice(0, 10), today) > DECIDED_DAYS) continue;
    if (o.status === "ไม่อนุมัติ")
      out.push({
        id: `ot-rej-${o.id}`,
        level: "late",
        group: "คำขอโอทีไม่ผ่าน",
        title: `คำขอโอที ${o.id}`,
        detail: `${thaiDate(o.date)} · ${o.comment || "ผู้อนุมัติตีกลับ — ยื่นใหม่ได้"}`,
        href: "/ot",
        date: o.decidedAt.slice(0, 10),
      });
    else if (o.status === "อนุมัติแล้ว") {
      /* อนุมัติไม่เท่าที่ขอต้องบอกด้วย ไม่งั้นพนักงานคิดเงินโอทีผิด */
      const paid = o.approvedHours ?? o.hours;
      out.push({
        id: `ot-ok-${o.id}`,
        level: "info",
        group: "คำขอโอทีอนุมัติแล้ว",
        title: `คำขอโอที ${o.id}`,
        detail:
          `${thaiDate(o.date)} · อนุมัติ ${paid.toFixed(2)} ชม.` +
          (paid !== o.hours ? ` (ขอ ${o.hours.toFixed(2)} ชม.)` : ""),
        href: "/ot",
        date: o.decidedAt.slice(0, 10),
      });
    }
  }

  /* ── นัดหมายที่เราถูกเชิญ ──
     คนที่ถูกเชิญไม่ได้เป็นคนสร้างนัด ถ้าไม่บอกก็ต้องไปเปิดปฏิทินเอง
     ยกเลิกแล้วยิ่งต้องบอก เพราะเขากันเวลาไว้แล้ว (ใบที่จบไปแล้วไม่ต้องเตือน) */
  if (input.events && input.meId) {
    const meId = input.meId;
    const backTo =
      role === "staff" ? "/my-schedule"
      : role === "ps" ? "/presales-schedule"
      : role === "gm" ? "/gm/calendar"
      : "/pm/schedule";
    for (const n of eventNotices(input.events, today)) {
      if (!n.who.includes(meId)) continue;
      const e = n.event;
      const when = `${thaiDate(e.date)}${e.dateEnd && e.dateEnd !== e.date ? ` – ${thaiDate(e.dateEnd)}` : ""}`;
      const time = e.from ? `${e.from} – ${e.to} น.` : "ทั้งวัน";
      out.push(
        n.kind === "cancel"
          ? {
              id: `ev-cancel-${e.id}`,
              level: "late",
              group: "นัดหมายถูกยกเลิก",
              title: e.title,
              detail: `${when} · ${e.cancel?.why || "ไม่ได้ระบุเหตุผล"}`,
              href: backTo,
              date: e.cancel?.at.slice(0, 10) ?? e.date,
            }
          : {
              id: `ev-invite-${e.id}`,
              level: "info",
              group: "นัดหมายที่คุณต้องเข้าร่วม",
              title: e.title,
              detail: `${when} · ${time}${e.place ? ` · ${e.place}` : ""}`,
              href: backTo,
              date: e.date,
            },
      );
    }

    /* วัน เวลา หรือรายชื่อผู้เข้าร่วมเปลี่ยน — คนที่กันเวลาไว้แล้วต้องรู้
       และคนที่ถูกถอดออกต้องรู้ด้วย ไม่งั้นไปรอเก้อ (เขาไม่อยู่ใน who แล้ว จึงส่งแยก) */
    for (const n of eventChangeNotices(input.events, today)) {
      if (!n.who.includes(meId)) continue;
      const e = n.event;
      const c = n.change;
      const when = `${thaiDate(e.date)}${e.dateEnd && e.dateEnd !== e.date ? ` – ${thaiDate(e.dateEnd)}` : ""}`;
      if (n.kind === "dropped") {
        out.push({
          id: `ev-drop-${e.id}`,
          level: "late",
          group: "คุณถูกถอดออกจากนัดหมาย",
          title: e.title,
          detail: `${when} · ${e.from} – ${e.to} น. · ไม่ต้องเข้าร่วมแล้ว · ${c.by} เป็นผู้แก้`,
          href: backTo,
          date: c.at.slice(0, 10),
        });
        continue;
      }
      const parts: string[] = [];
      if (c.date) parts.push(`เลื่อนเป็น ${when}`);
      if (c.time) parts.push(`เวลาใหม่ ${e.from} – ${e.to} น.`);
      if (c.added.length) parts.push(`เพิ่มผู้เข้าร่วม ${c.added.map(memberName).join(" · ")}`);
      if (c.removed.length) parts.push(`ถอดออก ${c.removed.map(memberName).join(" · ")}`);
      out.push({
        id: `ev-change-${e.id}`,
        level: "info",
        group: "นัดหมายถูกเปลี่ยนแปลง",
        title: e.title,
        detail: `${parts.join(" · ")} · ${c.by} เป็นผู้แก้`,
        href: backTo,
        date: c.at.slice(0, 10),
      });
    }

  }

  // ── ใบเบิกค่าใช้จ่ายที่ยังค้าง ──
  for (const c of claims) {
    const total = claimTotal(c);
    if (c.status === "รออนุมัติ") {
      out.push({
        id: `claim-${c.month}`,
        level: "info",
        group: "รออนุมัติ",
        title: `ใบเบิกค่าใช้จ่าย ${thaiMonth(c.month)}`,
        detail: `ค่าน้ำมัน ${baht(total)} บาท · รอหัวหน้าอนุมัติ`,
        href: "/expense",
        date: c.month + "-01",
      });
    } else if (c.status === "ไม่อนุมัติ") {
      out.push({
        id: `claim-rej-${c.month}`,
        level: "late",
        group: "ใบเบิกไม่ผ่าน",
        title: `ใบเบิกค่าใช้จ่าย ${thaiMonth(c.month)}`,
        detail: c.comment || "ผู้อนุมัติตีกลับ — แก้ไขแล้วยื่นใหม่ได้",
        href: "/expense",
        date: c.month + "-01",
      });
    } else if (
      /* อนุมัติแล้วก็ต้องรู้ (กติกากลาง) — เดิมมีแต่ทางตีกลับ ฝั่งผ่านจึงเงียบ
         นับจากเวลาที่ผู้อนุมัติตัดสิน ใบเก่าก่อนมีช่องนี้จึงไม่เด้งย้อนหลัง */
      c.status === "อนุมัติแล้ว" &&
      c.decidedAt &&
      daysBetween(c.decidedAt.slice(0, 10), today) <= DECIDED_DAYS
    ) {
      out.push({
        id: `claim-ok-${c.month}`,
        level: "info",
        group: "ใบเบิกอนุมัติแล้ว",
        title: `ใบเบิกค่าใช้จ่าย ${thaiMonth(c.month)}`,
        detail: `${baht(total)} บาท · ${c.comment || "หัวหน้าอนุมัติแล้ว รอจ่ายพร้อมรอบเงินเดือน"}`,
        href: "/expense",
        date: c.decidedAt.slice(0, 10),
      });
    } else if (!isLocked(c.status) && total > 0) {
      out.push({
        id: `claim-draft-${c.month}`,
        level: "info",
        group: "ใบเบิกยังไม่ได้ยื่น",
        title: `ใบเบิกค่าใช้จ่าย ${thaiMonth(c.month)}`,
        detail: `กรอกค่าน้ำมันไว้ ${baht(total)} บาท แต่ยังไม่ได้ส่งขออนุมัติ`,
        href: "/expense",
        date: c.month + "-01",
      });
    }
  }

  /* ── ผลการตัดสินของคำขอที่อยู่ในคิวของทีม (emp-requests) ──
     ใบลา/โอที/ใบเบิกของคนที่ยังไม่มีบัญชีเก็บแยกจาก leave-store · ot-store · expense-store
     แต่เจ้าของใบหลายคนล็อกอินได้จริง (E01 = ทีมก่อนการขาย · E05 = ทีมงาน)
     ถ้าไม่อ่านชุดนี้ด้วย คนเดียวกันจะรู้ผลเฉพาะใบที่ยื่นจากหน้าตัวเอง — ผิดกติกากลาง
     คนละใบกับสองสโตร์ข้างบน (คนละเลขที่) จึงไม่มีทางขึ้นซ้ำกัน */
  for (const r of input.empReqs ?? []) {
    if (!input.meId || r.emp !== input.meId || !r.decidedAt) continue;
    if (daysBetween(r.decidedAt.slice(0, 10), today) > DECIDED_DAYS) continue;
    const ok = r.status === "approved";
    if (!ok && r.status !== "rejected") continue;
    const what =
      r.kind === "leave"
        ? {
            page: "/leave",
            group: ok ? "ใบลาอนุมัติแล้ว" : "ใบลาไม่ผ่าน",
            title: `ใบลา${r.leaveType ?? ""} ${r.id}`,
            detail:
              (r.from === r.toDate ? thaiDate(r.from ?? "") : `${thaiDate(r.from ?? "")} – ${thaiDate(r.toDate ?? "")}`) +
              ` · ${r.days ?? 0} วัน`,
          }
        : r.kind === "ot"
          ? {
              page: "/ot",
              group: ok ? "คำขอโอทีอนุมัติแล้ว" : "คำขอโอทีไม่ผ่าน",
              title: `คำขอโอที ${r.id}`,
              /* อนุมัติไม่เท่าที่ขอต้องบอกด้วย ไม่งั้นเจ้าของใบคิดเงินโอทีผิด */
              detail:
                `${thaiDate(r.date ?? "")} · ${ok ? `อนุมัติ ${(r.approvedHours ?? r.hours ?? 0).toFixed(2)} ชม.` : `ขอไว้ ${(r.hours ?? 0).toFixed(2)} ชม.`}` +
                (ok && r.approvedHours !== undefined && r.approvedHours !== r.hours
                  ? ` (ขอ ${(r.hours ?? 0).toFixed(2)} ชม.)`
                  : ""),
            }
          : {
              page: "/expense",
              group: ok ? "ใบเบิกอนุมัติแล้ว" : "ใบเบิกไม่ผ่าน",
              title: `ใบเบิกค่าใช้จ่าย ${r.month ? thaiMonth(r.month) : r.id}`,
              detail: `${(r.fuel ?? []).length} รายการ · ${r.plate ?? ""}`.trim(),
            };
    out.push({
      id: `empreq-${r.id}`,
      level: ok ? "info" : "late",
      group: what.group,
      title: what.title,
      detail: `${what.detail} · ${ok ? r.reason || "หัวหน้าอนุมัติแล้ว" : r.reason || "ผู้อนุมัติตีกลับ — ยื่นใหม่ได้"}`,
      href: what.page,
      date: r.decidedAt.slice(0, 10),
    });
  }

  // ── วันที่ตอกเข้าแล้วลืมตอกออก (ไม่นับวันนี้ที่ยังทำงานอยู่) ──
  const punchDays = new Set(punches.map((r) => dayKey(new Date(r.at))));
  for (const day of punchDays) {
    if (day >= today) continue;
    const sessions = toSessions(recordsOfDay(punches, day));
    if (!sessions.some((s) => !s.out)) continue;
    out.push({
      id: `punch-${day}`,
      level: "late",
      group: "ลืมตอกบัตรออก",
      event: "forgot",
      title: thaiDate(day),
      detail: "มีเวลาเข้างานแต่ไม่มีเวลาออกงาน — ติดต่อฝ่ายบุคคลเพื่อแก้ไข",
      href: "/records",
      date: day,
    });
  }

  /* ═══ สลิปเงินเดือนของเรา (กติกากลาง) ═══════════════════════════
     เดิมเงียบทั้งสองทาง — ฝ่ายบุคคลเผยแพร่ก็ไม่รู้ ยกเลิกการเผยแพร่ก็ไม่รู้
     คนที่เปิดสลิปไว้แล้วจึงเจอว่าหายไปเฉย ๆ โดยไม่มีใครบอกว่าทำไม
     อ่านกลุ่มจ่ายของตัวเอง (รายเดือน/รายวัน) เหมือนหน้าสลิปของฉัน ไม่งั้นเด้งผิดกลุ่ม */
  if (input.hr && input.meId) {
    const me = input.hr.emp.find((e) => e.id === input.meId);
    if (me && me.type !== "intern") {
      const day = isDaily(me);
      /* ทดลองงานรับสลิปตามรอบจ่ายรายช่วง (ผู้ใช้สั่ง 6 ต.ค. 2569) */
      for (const r of day ? input.hr.dailyRounds : []) {
        if (!inRange(me, r)) continue;
        const title = `รอบ ${rangeLabel(r)}`;
        if (r.published && r.publishedAt && daysBetween(r.publishedAt.slice(0, 10), today) <= RECENT_DAYS) {
          out.push({
            id: `slip-${r.id}-day`,
            level: "info",
            group: "สลิปเงินเดือนออกแล้ว",
            title,
            detail: "ฝ่ายบุคคลเผยแพร่สลิปแล้ว เปิดดูและดาวน์โหลดได้",
            href: "/payslip",
            date: r.publishedAt.slice(0, 10),
          });
          continue;
        }
        const back = r.unpublished[r.unpublished.length - 1];
        if (!r.published && back && daysBetween(back.at.slice(0, 10), today) <= RECENT_DAYS)
          out.push({
            id: `slipoff-${r.id}-day-${back.at}`,
            level: "soon",
            group: "สลิปเงินเดือนถูกถอนกลับ",
            title,
            detail: `${back.why || "ฝ่ายบุคคลยกเลิกการเผยแพร่เพื่อแก้ไข"} · รอเผยแพร่ใหม่`,
            href: "/payslip",
            date: back.at.slice(0, 10),
          });
      }
      for (const sp of day ? [] : input.hr.slips) {
        if (!inPeriod(me, sp.month)) continue;
        const published = day ? sp.dayPublished : sp.published;
        const at = day ? sp.dayPublishedAt : sp.publishedAt;
        /* เผยแพร่แล้วกับถูกถอนกลับเป็นคนละขั้ว ขึ้นได้ทีละอย่างเท่านั้น ไม่มีทางซ้อนกัน */
        if (published && at && daysBetween(at.slice(0, 10), today) <= RECENT_DAYS) {
          out.push({
            id: `slip-${sp.month}-${day ? "day" : "month"}`,
            level: "info",
            group: "สลิปเงินเดือนออกแล้ว",
            title: `รอบ ${thaiMonth(sp.month)}`,
            detail: "ฝ่ายบุคคลเผยแพร่สลิปแล้ว เปิดดูและดาวน์โหลดได้",
            href: "/payslip",
            date: at.slice(0, 10),
          });
          continue;
        }
        const pulled = (day ? sp.dayUnpublished : sp.unpublished) ?? [];
        const back = pulled[pulled.length - 1];
        if (!published && back && daysBetween(back.at.slice(0, 10), today) <= RECENT_DAYS)
          out.push({
            id: `slipoff-${sp.month}-${day ? "day" : "month"}-${back.at}`,
            level: "soon",
            group: "สลิปเงินเดือนถูกถอนกลับ",
            title: `รอบ ${thaiMonth(sp.month)}`,
            detail: `${back.why || "ฝ่ายบุคคลยกเลิกการเผยแพร่เพื่อแก้ไข"} · รอเผยแพร่ใหม่`,
            href: "/payslip",
            date: back.at.slice(0, 10),
          });
      }
    }
  }

  // ═══ ประกาศจากผู้ดูแลระบบ — การตั้งค่าที่เปลี่ยนแล้วมีผลกับบทบาทนี้ ═══
  for (const n of adminNotices(role, input.adminLog ?? [], today)) out.push(n);

  return out.sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.date.localeCompare(b.date),
  );
}

// ─── ประกาศจากผู้ดูแลระบบ ─────────────────────────────────────────

/** แจ้งย้อนหลังกี่วัน — เกินนี้ถือว่าทุกคนรู้แล้ว ไม่ต้องค้างในกระดิ่ง */
const ADMIN_NOTICE_DAYS = 7;

/*
 * หมวดการตั้งค่าไหนมีผลกับบทบาทไหน และกดแล้วควรพาไปหน้าไหนของบทบาทนั้น
 * null = เรื่องภายในของผู้ดูแลระบบ ไม่ต้องแจ้งใคร
 * หน้าที่บทบาทนั้นเปิดไม่ได้ (เมนูถูกปิด) กระดิ่งกรองทิ้งให้เองอยู่แล้ว
 */
const ADMIN_AUDIENCE: Record<LogArea, ((role: Role) => string | null) | null> = {
  บัญชีผู้ใช้: null,
  ข้อมูลตัวอย่าง: null,
  การเชื่อมต่อ: null,
  /* เพิ่ม/แก้ตัวเลือกในดรอปดาวน์ — เรื่องเล็ก ไม่ต้องเด้งกระดิ่งทุกคน */
  ตัวเลือกในรายการ: null,
  บทบาทและสิทธิ์: () => "/",
  /* เปลี่ยนผู้อนุมัติรายตำแหน่ง มีผลกับใบที่ทุกคนยื่น จึงพาไปหน้าการลา */
  ตำแหน่งและสายอนุมัติ: () => "/leave",
  เวลาทำงาน: () => "/records",
  วันหยุดบริษัท: () => "/leave",
  การลา: () => "/leave",
  พื้นที่เข้างาน: () => "/",
  ข้อมูลบริษัท: (r) => (r === "sales" ? "/quotations" : r === "acc" ? "/acc/billing" : null),
  เลขที่เอกสาร: (r) => (r === "sales" ? "/quotations" : r === "acc" ? "/acc/billing" : null),
  /* อัตราโอที ประกันสังคม และหักมาสายกระทบสลิปของทุกคน ส่วน VAT กับค่าคอมกระทบงานของขายและบัญชี */
  อัตราและภาษี: (r) =>
    r === "sales" ? "/quotations" : r === "acc" ? "/acc/billing" : r === "hr" ? "/hr/payroll" : "/payslip",
};

function adminNotices(role: Role, log: LogEntry[], today: string): Notice[] {
  const out: Notice[] = [];
  const label = ROLES.find((r) => r.key === role)?.label ?? "";
  const others = ROLES.filter((r) => r.key !== role).map((r) => r.label);
  for (const e of log) {
    const day = e.at.slice(0, 10);
    if (daysBetween(day, today) > ADMIN_NOTICE_DAYS) continue;
    const hrefOf = ADMIN_AUDIENCE[e.area];
    const href = hrefOf?.(role);
    if (!href) continue;
    /* เรื่องสิทธิ์ที่ระบุบทบาทไว้ในข้อความ (เช่น "ปิดเมนู โอที ของพนักงานขาย") แจ้งเฉพาะบทบาทนั้น */
    if (e.area === "บทบาทและสิทธิ์" && !e.detail.includes(label) && others.some((o) => e.detail.includes(o))) continue;
    out.push({
      id: `admin-${e.id}`,
      level: "info",
      group: "ประกาศจากผู้ดูแลระบบ",
      title: `ผู้ดูแลระบบปรับ${e.area}`,
      detail: e.detail,
      href,
      date: day,
    });
  }
  return out;
}
