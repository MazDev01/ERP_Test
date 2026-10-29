/*
 * รวมเรื่องที่ต้องรู้จากทุกโมดูลมาไว้ที่กระดิ่งเดียว
 * ทุกรายการคำนวณจากข้อมูลจริง ไม่ได้เก็บแยก — งานเสร็จเมื่อไร แจ้งเตือนหายเอง
 */

import type { PunchRecord } from "./attendance";
import { scheduleFor } from "./work-schedule";
import {
  EXPIRING_DAYS,
  PRESALES_OPEN,
  canBillQuotation,
  quotationTotals,
  quotationValidUntil,
  STALE_DAYS,
} from "./crm-data";
import type { CrmState } from "./crm-store";
import type { ContractDoc } from "./contract-data";
import { claimTotal, isLocked, type ExpenseClaim } from "./expense-data";
import { baht, daysBetween, thaiDate, thaiMonth, toIsoDate } from "./format";
import {
  HR_LEAVE_LABEL,
  empOf,
  hrCycle,
  hrDocs,
  openIssues,
  recInRange,
  type TimeRec,
  inPeriod,
  inRange,
  isDaily,
  probEnd,
  rangeLabel,
  payApproval,
  probRoundLabel,
  isDailyRoundKey,
  dailyRoundRange,
  GROUP_LABEL,
  type PayGroup,
  posFullName,
} from "./hr-data";
import type { HrState } from "./hr-store";
import type { HolidayReq } from "./system-settings";
import { fmtLeave, fmtLeaveHours, leaveHoursOf, type LeaveRecord } from "./leave-data"; // ลาแสดงเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569)
import { empReqLeaveText, type EmpRequest } from "./emp-requests";
import type { NotifyEventKey } from "./notify-settings";
import type { OtRecord } from "./ot-data";
import { canBill, dealPaid, invoiceDue, invoiceNotYet, invoiceStatus, type AccState } from "./acc-store";
import { isAssignedJob, isJobOf, isRef, lastSub, planHref, projectHref, type ProjectTask } from "./pm-data";
import { memberName, openNudge, reviewerOf, taskHomes } from "./pm-store";
import { askWaiting, isLoose, LOOSE_NAME } from "./task-ask";
import { WAIT_KIND_LABEL, blockers, manualWaitDays, readySince } from "./task-deps";
import { eventChangeNotices, eventNotices, type PmEvent } from "./pm-schedule-data";
import type { PmState } from "./pm-store";
import type { ReviewRound } from "./client-review-store";
import { ROLES, approvesFor, type Role } from "./role";
import type { LogArea, LogEntry } from "./admin-log";
import { findLink } from "./deep-link";
import { clashDays } from "./hr-clash";
import type { PunchDay } from "./hr-link";
import { USERS } from "./mock-data";
import { displayName, nameOf as empNameOf } from "./emp-name";
import { PS_UNTAKEN_DAYS, psMine, psOwner, psUntakenDays } from "./presales-work";

/** ทดลองงานเหลืออีกกี่วันถึงจะขึ้นเตือนฝ่ายบุคคล — ตรงกับแดชบอร์ด */
const PROBATION_WARN_DAYS = 30;

/** เรื่องที่เกิดขึ้นที่ฝ่ายอื่นแจ้งกี่วันย้อนหลัง (ชำระเงิน ส่งมอบงาน) */
const RECENT_DAYS = 7;

/** งานของทีมงานเหลืออีกกี่วันถึงจะขึ้นเตือน — ล่วงหน้า 2 วันแทนพรุ่งนี้ (แผนที่ระบบ 20 ต.ค. 2569 หัวข้อ 8 · PM ขอ) */
const SOON_TASK_DAYS = 2;

/** กำหนดนำส่งภาษีหัก ณ ที่จ่าย (ภ.ง.ด.3/53) — ภายในวันที่ 7 ของเดือนถัดไป ตรงกับหน้า /acc/wht */
const WHT_FILE_DAY = 7;

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

/*
 * ระดับในกระดิ่งเทียบกับตารางแจ้งเตือน (notify-settings.ts — ผู้ใช้สั่ง 16 ต.ค. 2569)
 *   🔴 act  → late (เลยกำหนด/ตีกลับ) หรือ soon (ต้องทำ)
 *   ⚪ info → info
 */
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
  /** ไม่ได้ใช้แล้วหลังเลิกแจ้งลืมเช็คเอาท์ (ผู้ใช้สั่ง 16 ต.ค. 2569) — คงไว้ให้หน้าที่เรียกไม่ต้องแก้ */
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
  /** คำขอแก้วันหยุดบริษัทที่ส่ง CEO (system-settings) — ผู้ใช้สั่ง 13 ต.ค. 2569 */
  holidayReq?: HolidayReq | null;
  /** ใบสัญญาที่ออกแล้วทุกฉบับ (contract-store) — แจ้งพนักงานขายเจ้าของดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  contracts?: ContractDoc[];
  /** ชื่อพนักงานขายที่ล็อกอินอยู่ — ชื่อเดียวกับที่เก็บใน Customer.owner / Deal.seller */
  meName?: string;
  /** เวลาทำงานของทุกคน (useHrTime) — ฝ่ายบุคคลใช้หารายการที่ต้องตรวจ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  hrTime?: Record<string, TimeRec>;
  /** เวลาตอกบัตรจริง (usePunchTimes) — ใช้หาวันที่ลาแล้วแต่มีเช็คอิน */
  punchTimes?: Record<string, Record<string, PunchDay>>;
}): Notice[] {
  const { crm, pm, acc, leaves, ot, claims, now, role } = input;
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
      event: role === "ceo" ? "ceoapprove" : "gmapprove",
      title: `มีคำขอรอคุณอนุมัติ ${input.approvals} รายการ`,
      /* ชุดของ CEO ตามตารางแจ้งเตือน (ผู้ใช้สั่ง 16 ต.ค. 2569) */
      detail:
        role === "ceo"
          ? "ลาของ General Manager และบัญชีและบุคคล · โอทีของ System Analysis/Developer — อนุมัติหรือไม่อนุมัติ"
          : "ใบลา โอที และใบเบิกของทีมที่คุณดูแล — อนุมัติหรือไม่อนุมัติ",
      /* ผู้บริหารตัดสินที่หน้าคำขออนุมัติของตัวเอง ไม่มีเมนู /approvals กลาง */
      href: role === "ceo" ? "/ceo/approvals" : "/approvals",
      date: today,
    });
  }

  // ═══ เรื่องของผู้บริหาร ══════════════════════════════════════════
  /* ยอดเงินเดือนรออนุมัติ — CEO อนุมัติก่อนฝ่ายบุคคลปิดรอบ กลับมาใช้ (ผู้ใช้สั่ง 19 ต.ค. 2569) */
  if (role === "ceo" && input.hr)
    for (const [key, ap] of Object.entries(input.hr.payApprove)) {
      if (ap.status !== "waiting") continue;
      const [run, g] = key.split("|") as [string, PayGroup];
      const day = isDailyRoundKey(run);
      const runName = day ? probRoundLabel(dailyRoundRange(run)) : thaiMonth(run);
      /* HR แก้ยอดหลังส่ง ระบบส่งใหม่ให้เอง — บอกว่าเป็นยอดแก้ไขและแก้ไปกี่คน (ผู้ใช้สั่ง 19 ต.ค. 2569) */
      const ver = ap.ver ?? 0;
      const moved = new Set((ap.changes ?? []).map((c) => c.emp)).size;
      const amount = ap.net !== undefined ? `${ap.people ?? 0} คน · ยอดจ่ายสุทธิ ${baht(ap.net)} บาท` : "";
      out.push({
        id: `ceopaywait-${key}-${ver}-${ap.sentAt ?? ""}`,
        level: "soon",
        group: ver > 0 ? "ยอดเงินเดือนแก้ไขแล้ว รออนุมัติใหม่" : "ยอดเงินเดือนรออนุมัติ",
        event: "ceopaywait",
        title:
          ver > 0
            ? `ยอดเงินเดือน ${runName} แก้ไขแล้ว รออนุมัติใหม่`
            : `รอบ ${runName} · ${GROUP_LABEL[g]}`,
        detail:
          ver > 0
            ? `${GROUP_LABEL[g]} · ส่งใหม่ครั้งที่ ${ver}${moved > 0 ? ` · เปลี่ยน ${moved} คน` : ""}${amount ? ` · ${amount}` : ""} — ดูสิ่งที่เปลี่ยนแล้วอนุมัติ`
            : amount ? `${amount} — อนุมัติหรือไม่อนุมัติ` : "อนุมัติหรือไม่อนุมัติ",
        href: "/ceo/approvals",
        date: (ap.sentAt || today).slice(0, 10),
      });
    }
  /* ฝ่ายบุคคลปิดรอบเงินเดือนแล้ว — CEO เปิดดูยอดเพื่อโอนเงินเดือน (ดูอย่างเดียว ไม่มีอนุมัติ)
     เดิมเป็นเรื่องแจ้งให้ทราบ (14 ต.ค.) ตารางแจ้งเตือนให้เป็นเรื่องต้องทำ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  if (role === "ceo" && input.hr)
    for (const p of input.hr.payruns)
      if (p.closed && p.closedAt && daysBetween(p.closedAt.slice(0, 10), today) <= RECENT_DAYS)
        out.push({
          id: `ceopay-${p.month}`,
          level: "soon",
          group: "ยอดเงินเดือน",
          event: "ceopayroll",
          title: `ปิดรอบเงินเดือน ${thaiMonth(p.month)} แล้ว — เปิดดูยอดเพื่อโอนเงินเดือน`,
          detail: p.sum ? `${p.sum.n} คน · ยอดจ่ายสุทธิ ${baht(p.sum.net)} บาท` : "ดูยอดของรอบนี้ได้ที่หน้ายอดเงินเดือน",
          href: `/ceo/hr/payroll?m=${p.month}`,
          date: p.closedAt.slice(0, 10),
        });

  /* วันหยุดบริษัทที่ฝ่ายบุคคลส่งมารออนุมัติ — ทั้งระบบยังใช้ชุดเดิมจนกว่า CEO จะตัดสิน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const hq = input.holidayReq;
  if (role === "ceo" && hq?.status === "pending") {
    out.push({
      id: `ceohol-${hq.sentAt}`,
      level: "soon",
      group: "วันหยุดรออนุมัติ",
      event: "ceoholiday",
      title: "ฝ่ายบุคคลส่งวันหยุดบริษัทมาให้อนุมัติ",
      detail: `ส่งโดย ${hq.sentBy} · ยังไม่มีผลจนกว่าจะอนุมัติ`,
      href: "/ceo/approvals",
      date: hq.sentAt.slice(0, 10),
    });
  }
  /* ผลการตัดสินถึงฝ่ายบุคคล — ตีกลับค้างจนกว่าจะแก้ส่งใหม่หรือทิ้งคำขอ · อนุมัติแจ้งย้อนหลัง DECIDED_DAYS วัน */
  if (role === "hr" && hq?.at && hq.status !== "pending") {
    const rej = hq.status === "rejected";
    if (rej || daysBetween(hq.at.slice(0, 10), today) <= DECIDED_DAYS)
      out.push({
        id: `hrhol-${hq.status}-${hq.at}`,
        level: rej ? "late" : "info",
        group: rej ? "Chief Executive Officer ตีกลับวันหยุด" : "Chief Executive Officer อนุมัติวันหยุดแล้ว",
        event: rej ? "holidayback" : "holidayok",
        title: "วันหยุดบริษัท",
        detail: rej ? `เหตุผล: ${hq.reason || "—"} · แก้แล้วส่งใหม่` : "วันหยุดชุดใหม่มีผลกับทุกหน้าแล้ว",
        href: "/admin/settings?s=staff&t=holidays",
        date: hq.at.slice(0, 10),
      });
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
      event: "followup",
      title: nameOf.get(a.customerCode) ?? "—",
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
      title: `${q.no} · ${nameOf.get(q.customerCode) ?? "—"}`,
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
      title: nameOf.get(p.customerCode) ?? "—",
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
      title: nameOf.get(p.customerCode) ?? "—",
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
      /* BD/SA ส่ง proposal กลับมา → ทำใบเสนอราคา เป็นเรื่องต้องทำ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
      level: "soon",
      group: "พร้อมออกใบเสนอราคา",
      event: "presales",
      title: nameOf.get(p.customerCode) ?? "—",
      detail: "ทีมส่ง proposal กลับมาแล้ว — ทำใบเสนอราคา",
      href: `/quotations/new?ps=${encodeURIComponent(p.no)}`,
      date: p.due,
    });
  }

  /* ── งานที่ปิดการขายไว้เดินต่อที่ฝ่ายอื่น — ลูกค้าจ่ายงวดแรก (งานเข้า PM) และ PM ส่งมอบครบ
     แสดงเฉพาะเรื่องที่เพิ่งเกิดในไม่กี่วัน ไม่ต้องให้ฝ่ายขายไปถามเอง ── */
  for (const d of crm.deals) {
    /* บัญชียกเลิกดีลที่ลูกค้าจ่ายไปแล้ว — แจ้งให้ทราบ (ผู้ใช้สั่ง 16 ต.ค. 2569)
       ยกเลิกหลังรับเงินทำได้เฉพาะฝ่ายบัญชี (dealPaid) */
    if (d.cancelled && dealPaid(acc, d.no) && daysBetween(d.cancelled.at.slice(0, 10), today) <= DECIDED_DAYS) {
      out.push({
        id: `dealcancel-${d.no}`,
        level: "info",
        group: "บัญชียกเลิกดีล",
        event: "dealcancelacc",
        title: nameOf.get(d.customerCode) ?? "—",
        detail: `ยกเลิกโดย ${empNameOf(d.cancelled.by)} · ${d.cancelled.why}`,
        href: `/deals?find=${encodeURIComponent(d.no)}`,
        date: d.cancelled.at.slice(0, 10),
      });
    }
    if (d.status !== "ปิดการขาย") continue;
    const cus = nameOf.get(d.customerCode) ?? "—";
    /* ลูกค้าชำระงวดแล้ว — ทุกงวด ไม่ใช่เฉพาะงวดแรก (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    for (const r of acc.receipts) {
      if (r.deal !== d.no || daysBetween(r.date, today) > RECENT_DAYS) continue;
      out.push({
        id: r.seq === 1 ? `dealpaid-${d.no}` : `dealpaid-${d.no}-${r.seq}`,
        level: "info",
        group: r.seq === 1 ? "ลูกค้าชำระงวดแรกแล้ว" : "ลูกค้าชำระงวดแล้ว",
        event: "dealpaid",
        title: cus,
        detail:
          r.seq === 1
            ? `ชำระ ${baht(r.total)} บาท · ส่งงานให้ Project Manager เริ่มโปรเจคแล้ว`
            : `งวดที่ ${r.seq} · ชำระ ${baht(r.total)} บาท`,
        href: `/deals?find=${encodeURIComponent(d.no)}`,
        date: r.date,
      });
    }
    const proj = pm.projects.find((p) => p.deal === d.no && p.status === "done");
    if (proj && daysBetween(proj.updated, today) <= RECENT_DAYS) {
      out.push({
        id: `dealdone-${d.no}`,
        level: "info",
        group: "ส่งมอบงานครบแล้ว",
        title: cus,
        detail: "Project Manager ตรวจงานสุดท้ายผ่านแล้ว ใบงานขึ้น \"ส่งมอบ\"",
        href: `/deals?find=${encodeURIComponent(d.no)}`,
        date: proj.updated,
      });
    }
  }

  /* ── ออกใบสัญญาฉบับใหม่ — แจ้งพนักงานขายที่ดูแลดีลนั้น (ผู้ใช้สั่ง 15 ต.ค. 2569)
     ผู้ดูแลดีล = ผู้ขายที่ปิดดีล (Deal.seller) · ดีลเก่าไม่มี ใช้ผู้ดูแลลูกค้า (Customer.owner) ── */
  for (const c of input.contracts ?? []) {
    const day = (c.at || c.date).slice(0, 10);
    if (daysBetween(day, today) > RECENT_DAYS) continue;
    const d = crm.deals.find((x) => x.no === c.dealNo);
    if (!d) continue;
    const seller = d.seller || crm.customers.find((x) => x.code === d.customerCode)?.owner || "";
    if (!seller || seller !== input.meName) continue;
    out.push({
      id: `contract-${c.id}`,
      level: "info",
      group: "ออกใบสัญญาแล้ว",
      event: "contract",
      title: `ออกใบสัญญา ${c.no} ฉบับที่ ${c.version} · ${nameOf.get(d.customerCode) ?? "—"}`,
      detail: `บันทึกโดย ${empNameOf(c.by) || "—"}`,
      href: `/deals/${encodeURIComponent(d.no)}/contract`,
      date: day,
    });
  }

  }

  // ═══ เรื่องของทีมก่อนการขาย (SA/BD) — ต้นแบบ presales-work.html ═══════════
  if (role === "ps") {
    for (const p of crm.presales) {
      /* กล่องเดียวรับทั้ง SA และ BD — คำขอต้องมีคนเห็นเสมอ (ดู psMine) */
      if (!psMine(p)) continue;
      const cus = nameOf.get(p.customerCode) ?? "—";
      /* คำขอใหม่ที่ยังไม่มีใครรับ */
      if (p.status === "รอรับงาน") {
        out.push({
          id: `psnew-${p.id}`,
          level: daysBetween(p.due, today) > 0 ? "late" : "soon",
          group: "มีคำขอใหม่รอรับงาน",
          event: "psreq",
          title: cus,
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
          event: "psmore",
          title: cus,
          detail: p.reply,
          href: findLink("/presales-work", p.no),
          date: today,
        });
      }
    }
  }

  /*
   * คำขอทำข้อเสนอที่ส่งถึงตัวคนนอกทีมก่อนการขาย (toEmp) — คนนั้นต้องรู้ที่กระดิ่ง (ผู้ใช้สั่ง 15 ต.ค. 2569)
   * เรื่องเดียวกับที่ทีมก่อนการขายได้: คำขอใหม่ และฝ่ายขายส่งข้อมูลเพิ่มแล้ว · ไม่เปลี่ยนว่าใครอื่นได้แจ้งเตือน
   * id ขึ้นต้น "psto-" — กระดิ่งปล่อยผ่านตัวกรองเมนูให้เฉพาะเจ้าของคำขอ (notification-menu)
   */
  const meEmp = input.meId;
  if (role !== "ps" && meEmp && !myRoles.includes("ps")) {
    for (const p of crm.presales) {
      if (p.toEmp !== meEmp) continue;
      const cus = nameOf.get(p.customerCode) ?? "—";
      const seller = empNameOf(crm.customers.find((c) => c.code === p.customerCode)?.owner) || "ฝ่ายขาย";
      if (p.status === "รอรับงาน") {
        out.push({
          id: `psto-new-${p.id}`,
          level: daysBetween(p.due, today) > 0 ? "late" : "soon",
          group: "คำขอทำข้อเสนอใหม่",
          event: "psreq",
          title: `คำขอทำข้อเสนอใหม่จาก ${seller} · ${cus}`,
          detail: `ต้องการวันที่ ${thaiDate(p.due)}`,
          href: findLink("/presales-work", p.no),
          date: p.createdAt,
        });
      }
      if (p.status === "กำลังทำ" && p.reply) {
        out.push({
          id: `psto-reply-${p.id}-${p.reply.length}`,
          level: "info",
          group: "ฝ่ายขายส่งข้อมูลเพิ่มแล้ว",
          event: "psmore",
          title: `${seller} · ${cus}`,
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
      const cus = nameOf.get(p.customerCode) ?? "—";
      out.push({
        id: `gmps-${p.id}`,
        level: "late",
        group: "คำขอก่อนการขายยังไม่มีใครรับ",
        title: cus,
        detail: `ประเภท ${posFullName(p.kind)} · ${psOwner(p)} · ค้างมา ${days} วัน · ต้องส่งงาน ${thaiDate(p.due)}`,
        href: `/presales-work?find=${encodeURIComponent(p.no)}`,
        date: p.createdAt,
      });
    }
  }

  // ═══ เรื่องของฝั่ง PM ══════════════════════════════════════════
  /* GM ได้ชุดของ PM ทั้งหมดด้วย (ผู้ใช้สั่ง 16 ต.ค. 2569) — หน้าที่ GM เปิดไม่ได้ (/pm/reviews /pm/plan) พาไปหน้าโปรเจค/งานเข้าใหม่แทน */
  if (role === "pm" || role === "gm") {
    const gm = role === "gm";
    /* ชื่อของ PM/GM ที่ล็อกอินอยู่ — ชื่อเดียวกับที่เก็บใน Project.pm */
    const myName = USERS[role].name;
    /* PM อีกคนโอนโปรเจคมาให้ → รับโปรเจค (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    for (const p of pm.projects) {
      const t = p.transfers?.[p.transfers.length - 1];
      if (!t || t.to !== myName || p.pm !== myName || p.status === "cancelled") continue;
      const day = t.at.slice(0, 10);
      if (daysBetween(day, today) > RECENT_DAYS) continue;
      out.push({
        id: `pmxfer-${p.pj}-${t.at}`,
        level: "soon",
        group: "มีโปรเจคโอนมาให้คุณ",
        event: "pmtransfer",
        title: `${p.cus} · ${p.name || p.scope}`,
        detail: `${t.from} โอนให้ · ${t.why} — รับโปรเจค`,
        href: projectHref(p.pj),
        date: day,
      });
    }
    /* ใกล้ถึงเวลานัดหมายของตัวเอง (นัดที่ตัวเองสร้าง วันนี้หรือพรุ่งนี้) → เข้าร่วม (ผู้ใช้สั่ง 16 ต.ค. 2569)
       นัดที่มีชื่อเราเป็นผู้เข้าร่วมขึ้นเป็น "นัดหมายที่คุณต้องเข้าร่วม" อยู่แล้ว ไม่ซ้ำ */
    for (const e of input.events ?? []) {
      if (e.cancel || e.ps || (e.by ?? "pm") !== role) continue;
      if (input.meId && e.who.includes(input.meId)) continue;
      const until = daysBetween(today, e.date);
      if (until < 0 || until > 1) continue;
      out.push({
        id: `pmev-${e.id}`,
        level: "soon",
        group: "นัดหมายใกล้ถึงเวลา",
        event: "pmevent",
        title: e.title,
        detail: `${until === 0 ? "วันนี้" : "พรุ่งนี้"} · ${e.from ? `${e.from} – ${e.to} น.` : "ทั้งวัน"}${e.place ? ` · ${e.place}` : ""}`,
        href: gm ? "/gm/calendar" : "/pm/schedule",
        date: e.date,
      });
    }

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

    /*
     * งานเข้าใหม่ — GM มอบหมายให้ PM ทีละงาน PM กดรับเองไม่ได้แล้ว (ผู้ใช้สั่ง 27 ต.ค. 2569)
     *   GM: งานที่ยังไม่มอบหมาย → "งานเข้าใหม่รอมอบหมาย PM" (ค้างเกิน 2 วันขึ้นเลยกำหนด) · มอบหมายแล้วรอวางแผน = แจ้งให้ทราบ
     *   PM: เฉพาะงานที่ GM มอบหมายให้ตัวเอง → "GM มอบหมายงานใหม่ให้คุณ" จนกว่าจะยืนยันแผน
     *       งานของตัวเองที่ไม่มีผู้มอบหมาย (รับเองไว้ก่อนเปลี่ยนกติกา / เพิ่มโปรเจคเอง) = "งานรอวางแผน" เหมือนเดิม
     *   งานที่ยังไม่มอบหมายไม่ขึ้นที่กระดิ่งของ PM
     */
    for (const j of pm.inbox) {
      const waiting = daysBetween(j.sentAt, today);
      if (!isAssignedJob(j)) {
        if (!gm) continue;
        out.push({
          id: `pmin-${j.pj}`,
          level: waiting > 2 ? "late" : "soon",
          group: "งานเข้าใหม่รอมอบหมาย Project Manager",
          event: "pmjob",
          title: j.cus,
          detail: `${j.scope} · เข้ามา ${waiting > 0 ? `${waiting} วันแล้ว` : "วันนี้"}`,
          href: "/pm/inbox",
          date: j.sentAt,
        });
        continue;
      }
      const mine = isJobOf(j, myName);
      if (!gm && !mine) continue;
      if (mine && j.assignedBy) {
        out.push({
          id: `pmas-${j.pj}-${j.assignedAt ?? ""}`,
          level: "soon",
          group: "General Manager มอบหมายงานใหม่ให้คุณ",
          event: "pmassigned",
          title: j.cus,
          detail: `${j.scope}${j.assignNote ? ` · ${j.assignNote}` : ""}`,
          href: planHref(j.pj),
          date: j.assignedAt || j.takenAt || j.sentAt,
        });
        continue;
      }
      out.push({
        id: `pmin-${j.pj}`,
        level: "info",
        group: "งานรอวางแผน",
        title: j.cus,
        detail: `${j.scope} · ${mine ? "รอจัดแผนงาน" : `${empNameOf(j.takenBy)} รอจัดแผนงาน`}`,
        href: gm ? "/pm/inbox" : planHref(j.pj),
        date: j.takenAt || j.sentAt,
      });
    }
    /* ทีมเสนองานของตัวเอง — รอ PM อนุมัติก่อนเริ่ม (เจ้าของอนุมัติ 20 ต.ค. 2569) */
    for (const a of pm.asks ?? []) {
      if (!askWaiting(a)) continue;
      const home = a.pj ? pm.projects.find((p) => p.pj === a.pj) : undefined;
      out.push({
        id: `pmask-${a.id}`,
        level: "soon",
        group: "ทีมเสนองาน",
        title: `${empNameOf(a.by)} เสนองาน ${a.name}`,
        detail: `${home ? home.name || home.cus : LOOSE_NAME} · กำหนดส่ง ${thaiDate(a.due)}`,
        href: "/pm/inbox",
        date: a.at.slice(0, 10),
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
        /* ตารางแจ้งเตือนให้เป็นเรื่องแจ้งให้ทราบ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
        level: "info",
        group: "ดีลถูกยกเลิก งานหยุด",
        event: "pmcancel",
        title: `${p.cus} · ${p.name || p.scope}`,
        detail: `${empNameOf(p.cancelled.by)}ยกเลิกเมื่อ ${thaiDate(day)} · ${p.cancelled.why} — แผนที่วางไว้ยังเปิดดูได้`,
        href: projectHref(p.pj),
        date: day,
      });
    }

    /* ทีมส่งมาแล้วรอเราตัดสิน — ค้างที่นี่คือทั้งทีมหยุดรอ จึงขึ้นก่อนงานเลยกำหนด
       ดีลที่ยกเลิกแล้วไม่นับ — หน้างานรอตรวจก็กรองทิ้ง (pm-reviews-page.tsx) ถ้านับที่นี่ด้วย
       กระดิ่งจะบอกจำนวนไม่ตรงกับหน้า แล้วกดเข้าไปก็ไม่เจอใบนั้น
       งานนอกโปรเจคที่ส่งมาก็ตรวจที่หน้าเดียวกัน (taskHomes) */
    /* ผู้ตรวจ = ผู้สั่งเสมอ (ผู้ใช้สั่ง 27 ต.ค. 2569) — PM ได้เฉพาะงานที่ตัวเองสั่ง · GM เห็นทั้งหมดเหมือนเดิม
       งานที่ทีมงานสั่งเองไปขึ้นกระดิ่งของคนสั่ง (ส่วนของทีมงานข้างล่าง) */
    const myReviewId = input.meId || USERS[role].employeeId;
    for (const p of taskHomes(pm)) {
      if (p.status === "cancelled") continue;
      for (const [i, t] of p.tasks.entries()) {
        if (t.status !== "sent") continue;
        if (!gm && reviewerOf(t, p) !== myReviewId) continue;
        const sub = lastSub(t);
        const waited = sub ? daysBetween(sub.at.split(" ")[0], today) : 0;
        out.push({
          id: `pmrev-${p.pj}-${i}`,
          level: waited >= 3 ? "late" : "soon",
          group: "งานรอตรวจ",
          event: "pmreview",
          title: `${p.cus} · ${t.name}`,
          detail: `${memberName(sub?.by ?? t.whos[0] ?? "")} ส่งมา${
            waited > 0 ? `เมื่อ ${waited} วันก่อน` : "วันนี้"
          }`,
          href: gm && !isLoose(p.pj) ? projectHref(p.pj) : "/pm/reviews",
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
          event: "pmlate",
          title: `${p.cus} · ${t.name}`,
          detail:
            `${t.whos.map(memberName).join(", ") || "ยังไม่มีผู้รับผิดชอบ"} · เลยกำหนด ${over} วัน` +
            (p.status === "done" ? " · โปรเจคปิดว่าส่งมอบแล้ว" : ""),
          href: projectHref(p.pj),
          date: t.due,
        });
      }
    }
    /*
     * งานเลยกำหนดที่มีงานอื่นรออยู่ (แผนที่ระบบ 20 ต.ค. 2569 หัวข้อ 8) — ใบละงานก่อนหน้า ไม่ใช่ใบละคนที่รอ
     * ระบบไม่เลื่อนกำหนดส่งของงานที่รอให้เอง PM เป็นคนตัดสินใจ จึงต้องบอกว่าใครรออยู่บ้าง
     */
    for (const p of pm.projects) {
      if (p.status === "cancelled") continue;
      for (const [i, prev] of p.tasks.entries()) {
        const over = daysBetween(prev.due, today);
        if (over <= 0) continue;
        const waiting = p.tasks.filter((t) => blockers(p.tasks, t).includes(prev));
        if (!waiting.length) continue;
        out.push({
          id: `pmprevlate-${p.pj}-${i}`,
          level: "late",
          group: "งานเลยกำหนด มีงานอื่นรออยู่",
          event: "pmprevlate",
          title: `${p.cus} · ${prev.name}`,
          detail: `เลยกำหนด ${over} วัน · รออยู่ ${waiting.length} งาน: ${waiting
            .map((t) => `${t.name} (${t.whos.map(memberName).join(", ") || "ยังไม่มีคนทำ"})`)
            .join(", ")}`,
          href: projectHref(p.pj),
          date: prev.due,
        });
      }
    }
    /*
     * งานที่คนทำกด "รอข้อมูล" เอง (รอนอกแผน — ผู้ใช้สั่ง 21 ต.ค. 2569)
     * PM ต้องรู้ว่าใครรออะไรมากี่วัน จะได้ไปตามลูกค้า/ไฟล์ให้ · หายเองเมื่อคนทำกด "ได้ข้อมูลแล้ว" หรือส่งงาน
     */
    for (const p of pm.projects) {
      if (p.status === "cancelled") continue;
      for (const [i, t] of p.tasks.entries()) {
        const w = t.waitingOn;
        if (!w || t.status === "done") continue;
        const days = manualWaitDays(t, today);
        out.push({
          id: `pmwaiting-${p.pj}-${i}-${w.since}`,
          level: "info",
          group: "งานรอข้อมูล",
          title: `${p.cus} · ${t.name}`,
          detail:
            `${t.whos.map(memberName).join(", ") || "ยังไม่มีคนทำ"} · ${WAIT_KIND_LABEL[w.kind]}` +
            (w.note ? ` — ${w.note}` : "") +
            ` · รอมา ${days} วัน`,
          href: projectHref(p.pj),
          date: w.since.slice(0, 10),
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
    /* งานที่เสนอแล้ว PM ไม่อนุมัติ — ต้องรู้เหตุผล หายเองเมื่อกดรับทราบหรือพ้นช่วงแจ้ง */
    for (const a of pm.asks ?? []) {
      if (a.by !== meId || !a.no || a.gone) continue;
      const day = a.no.at.slice(0, 10);
      if (daysBetween(day, today) > DECIDED_DAYS) continue;
      out.push({
        id: `myask-no-${a.id}`,
        level: "info",
        group: "งานที่เสนอไม่ได้รับอนุมัติ",
        title: a.name,
        detail: a.no.why,
        href: `${findLink("/my-tasks", a.name)}&stage=ask`,
        date: day,
      });
    }
    /* งานนอกโปรเจคที่อนุมัติแล้วเดินทางเดียวกับงานในโปรเจค (taskHomes) */
    for (const p of taskHomes(pm)) {
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
          detail: `ดีลถูกยกเลิกโดย${empNameOf(p.cancelled.by)} · ${p.cancelled.why} — หยุดงานของโปรเจคนี้ได้เลย`,
          href: "/my-tasks",
          date: day,
        });
        continue;
      }
      for (const [i, t] of p.tasks.entries()) {
        /* ── งานของคนอื่นที่เราสั่ง (ผู้ตรวจ = ผู้สั่ง — ผู้ใช้สั่ง 27 ต.ค. 2569) ส่งมาแล้วรอเรา (ผู้ใช้สั่ง 21 ต.ค. 2569) ──
           ทีมงานไม่มีหน้างานรอตรวจของ PM จึงพาไปแท็บ "รอฉันตรวจ" ในหน้างานที่ได้รับ */
        if (t.status === "sent" && !t.whos.includes(meId) && reviewerOf(t, p) === meId) {
          const sub = lastSub(t);
          const waited = sub ? daysBetween(sub.at.split(" ")[0], today) : 0;
          out.push({
            id: `myreview-${p.pj}-${i}`,
            level: waited >= 3 ? "late" : "soon",
            group: "งานรอคุณตรวจ",
            event: "taskreview",
            title: `${p.cus} · ${t.name}`,
            detail: `${memberName(sub?.by ?? t.whos[0] ?? "")} ส่งมา${waited > 0 ? `เมื่อ ${waited} วันก่อน` : "วันนี้"}`,
            href: `${findLink("/my-tasks", t.name)}&stage=review`,
            date: sub?.at.split(" ")[0] ?? t.due,
          });
          continue;
        }
        if (!t.whos.includes(meId)) continue;

        /* ── งานที่เพิ่งมอบหมาย เพิ่งเลื่อนกำหนดส่ง หรือเพิ่งเปลี่ยนผู้รับผิดชอบ ──
           เดิมทีมงานรู้ตัวก็ตอนใกล้ครบกำหนดแล้ว งานที่กำหนดส่งอีกไกลจึงเงียบสนิท
           นับจากเวลาที่ PM แก้ (lastChange/assignedAt) และหายเองเมื่อทำงานเสร็จหรือเกินช่วงแจ้ง */
        const ch = taskChange(t);
        if (ch && t.status !== "done" && daysBetween(ch.at.slice(0, 10), today) <= RECENT_DAYS) {
          const text = CHANGE_TEXT[ch.what] ?? CHANGE_TEXT.assign;
          out.push({
            id: `mytask-${ch.what}-${p.pj}-${i}-${ch.at}`,
            /* งานใหม่ที่ PM มอบหมาย → เริ่มทำ เป็นเรื่องต้องทำ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
            level: ch.what === "assign" && t.status === "todo" ? "soon" : "info",
            group: text.group,
            event: ch.what === "assign" ? "tasknew" : undefined,
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
            event: "taskok",
            title: `${p.cus} · ${t.name}`,
            /* ชื่อผู้ตรวจจริง (= ผู้สั่ง) ไม่ใช่ "PM" เสมอ (ผู้ใช้สั่ง 21 · 27 ต.ค. 2569) */
            detail: t.noReview
              ? `ปิดงานเมื่อ ${thaiDate(t.doneAt.slice(0, 10))} (ไม่ต้องตรวจ) · เริ่มงานชิ้นถัดไปได้เลย`
              : `${memberName(reviewerOf(t, p))} ตรวจผ่านเมื่อ ${thaiDate(t.doneAt.slice(0, 10))} · เริ่มงานชิ้นถัดไปได้เลย`,
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
            group: "Project Manager ทวงงาน",
            title: `${p.cus} · ${t.name}`,
            detail: nudge.tx,
            href: `${findLink("/my-tasks", t.name)}&stage=${t.status === "revise" ? "revise" : "recv"}`,
            date: nudge.at.slice(0, 10),
          });
        }

        /* ── งานต่อกัน (แผนที่ระบบ 20 ต.ค. 2569 หัวข้อ 8) ──
           รอข้อมูลอยู่ = ยังส่งไม่ได้ จึงไม่เตือนให้ "ส่งงาน" · บอกเฉพาะตอนงานที่รออยู่เลยกำหนด ให้รู้ว่างานตัวเองจะเลื่อน
           งานก่อนหน้าผ่านครบแล้ว → เริ่มงานได้ แทนการรอให้คนทำงานก่อนหน้ามาบอกในไลน์ */
        const wait = blockers(p.tasks, t);
        if (wait.length) {
          const late = wait.filter((w) => daysBetween(w.due, today) > 0);
          if (late.length) {
            const worst = late.reduce((a, b) => (a.due < b.due ? a : b));
            out.push({
              id: `mytask-prevlate-${p.pj}-${i}`,
              level: "info",
              group: "งานก่อนหน้าเลยกำหนด",
              event: "taskprevlate",
              title: `${p.cus} · ${t.name}`,
              detail: `รอ ${late.map((w) => w.name).join(", ")} · เลยกำหนด ${daysBetween(worst.due, today)} วัน — แจ้ง Project Manager แล้ว`,
              href: `${findLink("/my-tasks", t.name)}&stage=recv`,
              date: worst.due,
            });
          }
          continue;
        }
        const ready = readySince(p.tasks, t);
        if (ready && daysBetween(ready.slice(0, 10), today) <= RECENT_DAYS) {
          out.push({
            id: `mytask-ready-${p.pj}-${i}`,
            level: "soon",
            group: "งานก่อนหน้าผ่านแล้ว เริ่มงานได้",
            event: "taskready",
            title: `${p.cus} · ${t.name}`,
            detail: `${(t.after ?? []).join(", ")} ผ่านครบแล้ว · กำหนดส่ง ${thaiDate(t.due)}`,
            href: `${findLink("/my-tasks", t.name)}&stage=recv`,
            date: ready.slice(0, 10),
          });
        }

        if (t.status === "revise" && t.back) {
          out.push({
            id: `mytask-back-${p.pj}-${i}`,
            level: "late",
            group: "งานที่ต้องแก้ไข",
            event: "taskback",
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
            group:
              over > 0 ? "งานเลยกำหนดส่ง"
              : over === 0 ? "งานครบกำหนดวันนี้"
              : over === -1 ? "งานครบกำหนดพรุ่งนี้"
              : `งานจะครบกำหนดใน ${-over} วัน`,
            event: over > 0 ? "taskoverdue" : "taskduesoon",
            title: `${p.cus} · ${t.name}`,
            detail:
              over > 0
                ? `เลยกำหนด ${over} วัน ยังไม่ได้ส่งตรวจ`
                : `ยังไม่ได้ส่ง · กำหนดส่ง ${thaiDate(t.due)}`,
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
        title: displayName(e),
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
        event: "probation",
        title: displayName(e),
        detail:
          left < 0
            ? `เลยกำหนดมา ${Math.abs(left)} วัน ยังไม่ได้ตัดสิน`
            : `อีก ${left} วันครบกำหนด · ${thaiDate(end)} — ประเมิน แล้วเปลี่ยนเป็นพนักงานประจำ`,
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
        event: "internleave",
        title: `${empOf(hr.emp, r.emp) ? displayName(empOf(hr.emp, r.emp)) : r.emp} · ${HR_LEAVE_LABEL[r.lt]}`,
        detail: `${thaiDate(r.from)}${r.from !== r.to ? ` – ${thaiDate(r.to)}` : ""} · ${fmtLeave(r.days)}`, /* แสดงเป็นชั่วโมง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
        href: "/hr/dashboard",
        date: r.at.slice(0, 10),
      });
    }

    /*
     * ผลการอนุมัติยอดเงินเดือนของ CEO (กลับมาใช้ ผู้ใช้สั่ง 19 ต.ค. 2569) — ดูทุกรอบและทุกกลุ่ม
     *   ไม่อนุมัติ → แก้ไขแล้วส่งใหม่ (late) · อนุมัติแล้ว → ปิดรอบ แล้วสร้างและเผยแพร่สลิป
     * หายเองเมื่อส่งใหม่ หรือรอบนั้นปิดเงินเดือนแล้ว (ต่อด้วยเรื่อง "ปิดรอบเงินเดือนแล้ว — สร้างและเผยแพร่สลิป")
     */
    for (const [key, ap] of Object.entries(hr.payApprove)) {
      if (ap.status !== "rejected" && ap.status !== "approved") continue;
      const [run, g] = key.split("|") as [string, PayGroup];
      const day = isDailyRoundKey(run);
      const closed = day
        ? Boolean(hr.dailyRounds.find((r) => r.id === run)?.payClosedAt)
        : hr.payruns.some((p) => p.month === run && (g === "day" ? p.dayClosed : p.closed));
      if (closed) continue;
      /* รอบเดือนกลุ่มรายวันแบบเก่าไม่ใช้แล้ว */
      if (!day && g === "day") continue;
      const label = `รอบ ${day ? probRoundLabel(dailyRoundRange(run)) : thaiMonth(run)} · ${GROUP_LABEL[g]}`;
      const href = day ? `/hr/payroll?g=daily&r=${run}` : `/hr/payroll?g=month&m=${run}`;
      const rej = ap.status === "rejected";
      out.push({
        id: `hrpay${rej ? "rej" : "ok"}-${key}-${ap.at ?? ""}`,
        level: rej ? "late" : "soon",
        group: rej ? "Chief Executive Officer ไม่อนุมัติเงินเดือน" : "Chief Executive Officer อนุมัติเงินเดือนแล้ว",
        event: rej ? "payback" : "payok",
        title: label,
        detail: rej
          ? `${ap.reason || "ไม่ระบุเหตุผล"} — แก้ไขแล้วส่งใหม่`
          : "ปิดรอบเงินเดือน แล้วสร้างและเผยแพร่สลิป",
        href,
        date: (ap.at || today).slice(0, 10),
      });
    }

    /*
     * ขั้นของรอบเงินเดือนตามตารางแจ้งเตือน (ผู้ใช้สั่ง 16 ต.ค. 2569)
     *   ถึงวันตัดรอบแล้ว รอบเวลายังเปิด → ปิดรอบเวลาทำงาน แล้วคำนวณเงินเดือน
     *   ปิดรอบเวลาแล้ว รอบเงินเดือนยังไม่ปิด → คำนวณและปิดรอบเงินเดือน
     *   ปิดรอบเงินเดือนแล้ว สลิปยังไม่สร้าง/ไม่เผยแพร่ → สร้างและเผยแพร่สลิป
     * รอบที่ยังไม่ถึงวันตัดรอบเป็นรอบที่กำลังเดินอยู่ ไม่ต้องเตือน
     */
    for (const per of hr.periods) {
      const month = per.month;
      const cut = hrCycle(month).to;
      const payClosed = hr.payruns.some((p) => p.month === month && p.closed);
      const slip = hr.slips.find((sp) => sp.month === month);
      const label = `รอบ ${thaiMonth(month)}`;
      if (!per.closed) {
        if (today < cut) continue;
        out.push({
          id: `hrcut-${month}`,
          level: today > cut ? "late" : "soon",
          group: "ถึงวันตัดรอบ",
          event: "cutoff",
          title: label,
          detail: `ตัดรอบ ${thaiDate(cut)} — ปิดรอบเวลาทำงาน แล้วคำนวณเงินเดือน`,
          href: `/hr/timesheet?g=month&m=${month}`,
          date: cut,
        });
      } else if (!payClosed) {
        /* ต้องส่งยอดให้ CEO อนุมัติก่อนปิดรอบ (ผู้ใช้สั่ง 19 ต.ค. 2569) — รอ/อนุมัติ/ไม่อนุมัติ ขึ้นเป็นเรื่องของตัวเองด้านบน */
        const st = payApproval(hr.payApprove, month, "month").status;
        if (st === "approved" || st === "rejected") continue;
        out.push({
          id: `hrpay-${month}`,
          level: "soon",
          group: "รอบเงินเดือนยังไม่ปิด",
          title: label,
          detail:
            st === "waiting"
              ? (payApproval(hr.payApprove, month, "month").ver ?? 0) > 0
                ? "แก้ไขแล้ว ส่งให้ Chief Executive Officer อนุมัติใหม่ให้เอง — รอ Chief Executive Officer อนุมัติ"
                : "ส่งยอดให้ Chief Executive Officer แล้ว — รอ Chief Executive Officer อนุมัติ"
              : "ปิดรอบเวลาทำงานแล้ว — คำนวณเงินเดือน แล้วส่งให้ Chief Executive Officer อนุมัติ",
          href: `/hr/payroll?g=month&m=${month}`,
          date: per.closedAt || today,
        });
      } else if (!slip?.madeAt || !slip.published) {
        const closedAt = hr.payruns.find((p) => p.month === month)?.closedAt ?? "";
        out.push({
          id: `hrslip-${month}`,
          level: "soon",
          group: "ปิดรอบเงินเดือนแล้ว",
          event: "slipmake",
          title: label,
          detail: slip?.madeAt
            ? "สร้างสลิปแล้วแต่พนักงานยังเปิดดูไม่ได้ — เผยแพร่สลิป"
            : "สร้างและเผยแพร่สลิป",
          href: `/hr/payslip?g=month&m=${month}`,
          date: (closedAt || today).slice(0, 10),
        });
      }
    }
    /* รอบจ่ายรายวันของพนักงานทดลองงาน — ปิดรอบเงินเดือนแล้วแต่สลิปยังไม่เผยแพร่ */
    /* รอบรายสัปดาห์ของทดลองงานที่ปิดรอบเวลาแล้ว ยังไม่ปิดเงินเดือน — ส่ง CEO / รอ CEO (ผู้ใช้สั่ง 19 ต.ค. 2569) */
    for (const r of hr.dailyRounds) {
      if (!r.closedAt || r.payClosedAt) continue;
      const st = payApproval(hr.payApprove, r.id, "day").status;
      if (st === "approved" || st === "rejected") continue;
      out.push({
        id: `hrpayday-${r.id}`,
        level: "soon",
        group: "รอบเงินเดือนยังไม่ปิด",
        title: `รอบจ่าย ${probRoundLabel(r)}`,
        detail:
          st === "waiting"
            ? (payApproval(hr.payApprove, r.id, "day").ver ?? 0) > 0
              ? "แก้ไขแล้ว ส่งให้ Chief Executive Officer อนุมัติใหม่ให้เอง — รอ Chief Executive Officer อนุมัติ"
              : "ส่งยอดให้ Chief Executive Officer แล้ว — รอ Chief Executive Officer อนุมัติ"
            : "คำนวณเงินเดือน แล้วส่งให้ Chief Executive Officer อนุมัติ",
        href: `/hr/payroll?g=daily&r=${r.id}`,
        date: r.closedAt.slice(0, 10),
      });
    }
    for (const r of hr.dailyRounds) {
      if (!r.payClosedAt || r.published) continue;
      out.push({
        id: `hrslipday-${r.id}`,
        level: "soon",
        group: "ปิดรอบเงินเดือนแล้ว",
        event: "slipmake",
        title: `รอบจ่าย ${probRoundLabel(r)}`,
        detail: r.slipsMadeAt ? "สร้างสลิปแล้วแต่พนักงานยังเปิดดูไม่ได้ — เผยแพร่สลิป" : "สร้างและเผยแพร่สลิป",
        href: `/hr/payslip?g=daily&r=${r.from}~${r.to}`,
        date: r.payClosedAt.slice(0, 10),
      });
    }

    /*
     * ระบบพบรายการที่ต้องตรวจ (ไม่มีบันทึกเวลา / ไม่ได้เช็คเอาท์ / ลาแล้วแต่มีเช็คอิน) → ตรวจ แล้วบันทึกผล
     * นับแบบเดียวกับหน้าสรุปเวลาทำงาน (openIssues + clashDays) ของรอบเดือนที่ยังไม่ปิด (ผู้ใช้สั่ง 16 ต.ค. 2569)
     */
    if (input.hrTime) {
      for (const per of hr.periods) {
        if (per.closed) continue;
        const cycle = hrCycle(per.month);
        let issues = 0;
        let clashes = 0;
        for (const e of hr.emp) {
          if (e.startedAt > cycle.to || (e.leftAt && e.leftAt < cycle.from)) continue;
          const rec = recInRange(input.hrTime, e.id, cycle);
          issues += openIssues(rec).length;
          clashes += clashDays(e.id, rec, hr.time[e.id]?.fix ?? [], input.punchTimes?.[e.id], today, hr.clashOk, scheduleFor(e)).length;
        }
        if (issues + clashes === 0) continue;
        const parts = [
          issues ? `ไม่มีบันทึกเวลา/ไม่ได้เช็คเอาท์ ${issues} รายการ` : "",
          clashes ? `ลาแล้วแต่มีเช็คอิน ${clashes} วัน` : "",
        ].filter(Boolean);
        out.push({
          id: `hrreview-${per.month}-${issues}-${clashes}`,
          level: "soon",
          group: "รายการที่ต้องตรวจ",
          event: "timereview",
          title: `รอบ ${thaiMonth(per.month)}`,
          detail: `${parts.join(" · ")} — ตรวจ แล้วบันทึกผล`,
          href: `/hr/timesheet?g=month&m=${per.month}`,
          date: today,
        });
      }
    }
  }

  // ═══ เรื่องของฝั่งบัญชี ════════════════════════════
  if (role === "acc") {
    for (const v of acc.invoices) {
      /* เงื่อนไขเดียวกับ awaitingReceipt ในสโตร์ — กระดิ่งกับหน้าวางบิลจึงนับใบชุดเดียวกัน */
      if (invoiceStatus(acc, v) === "cancelled" || invoiceDue(v) <= 0) continue;
      /* ใบลงวันที่ล่วงหน้า — ยังไม่ถึงวันออก ลูกค้ายังไม่ได้รับ ไม่เตือน (ผู้ใช้สั่ง 13 ต.ค. 2569) */
      if (invoiceNotYet(v, today)) continue;
      const over = daysBetween(v.due, today);
      /* ใกล้ครบกำหนดก็ต้องรู้ ไม่ใช่รอให้เลยแล้วค่อยตามเก็บ */
      if (over < -EXPIRING_DAYS) continue;
      out.push({
        id: `inv-${v.no}`,
        level: over > 0 ? "late" : "soon",
        group: over > 0 ? "ใบแจ้งหนี้เกินกำหนด" : over === 0 ? "ใบแจ้งหนี้ถึงวันครบกำหนด" : "ใบแจ้งหนี้ใกล้ครบกำหนด",
        event: over > 0 ? "invlate" : over === 0 ? "invdue" : undefined,
        title: `${v.cus} · ${v.no}`,
        detail:
          `${baht(invoiceDue(v))} บาท · ` +
          (over > 0
            ? `เกินกำหนด ${over} วัน ยังไม่ออกใบเสร็จ — ทวงลูกค้า`
            : over === 0
              ? "ครบกำหนดวันนี้ — เช็คยอดเงินเข้า แล้วออกใบเสร็จ"
              : `เหลืออีก ${-over} วัน`),
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
          event: "billnew",
          title: d.cus,
          detail: `${baht(d.net)} บาท · Sales ปิดดีลส่งมาวางบิล — แบ่งงวด แล้วออกใบแจ้งหนี้งวด 1`,
          href: findLink("/acc/billing", d.no),
          date: d.quoDate,
        });
        continue;
      }
      for (const p of ready) {
        out.push({
          id: `bill-${d.no}-${p.seq}`,
          /* งวดถัดไปพร้อม → ออกใบแจ้งหนี้งวดถัดไป เป็นเรื่องต้องทำ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
          level: "soon",
          group: "งวดรอวางบิล",
          event: p.seq === 1 ? "billnew" : "billnext",
          title: d.cus,
          detail: `งวดที่ ${p.seq} · ${baht(p.amount)} บาท — ออกใบแจ้งหนี้`,
          href: findLink("/acc/billing", d.no),
          date: p.due || d.quoDate,
        });
      }
    }
    /* ไม่มีเรื่อง "รับเงินแล้วรอออกใบเสร็จ" อีก — ออกใบเสร็จคือการบันทึกรับชำระ (AC-BR-05)
       ใบที่ยังไม่ชำระขึ้นเป็นใบแจ้งหนี้ใกล้/เกินกำหนดด้านบนแล้ว */
    /*
     * ใกล้กำหนดนำส่งภาษีที่เราหักจากผู้ขาย (ภ.ง.ด.3/53 ภายในวันที่ 7 ของเดือนถัดไป)
     * → สรุปข้อมูลส่งสำนักงานบัญชี (ผู้ใช้สั่ง 16 ต.ค. 2569) — ขึ้นวันที่ 1–7 เมื่อเดือนก่อนมีรายการหัก
     */
    if (now.getDate() <= WHT_FILE_DAY) {
      const prev = toIsoDate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
      const rows = acc.wht.filter((w) => w.date.startsWith(prev));
      if (rows.length) {
        const due = `${today.slice(0, 7)}-0${WHT_FILE_DAY}`;
        const left = daysBetween(today, due);
        out.push({
          id: `whtdue-${prev}`,
          level: left <= 2 ? "late" : "soon",
          group: "ใกล้กำหนดนำส่งภาษีหัก ณ ที่จ่าย",
          event: "whtdue",
          title: `รอบ ${thaiMonth(prev)} · ${rows.length} รายการ`,
          detail: `นำส่งภายใน ${thaiDate(due)}${left === 0 ? " (วันนี้)" : ` (อีก ${left} วัน)`} — สรุปข้อมูลส่งสำนักงานบัญชี`,
          href: "/acc/wht",
          date: due,
        });
      }
    }
    /* Sales ยกเลิกดีลที่ลูกค้ายังไม่จ่าย — แจ้งให้ทราบ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
    for (const d of crm.deals) {
      if (!d.cancelled || dealPaid(acc, d.no)) continue;
      const day = d.cancelled.at.slice(0, 10);
      if (daysBetween(day, today) > DECIDED_DAYS) continue;
      out.push({
        id: `acccancel-${d.no}`,
        level: "info",
        group: "Sales ยกเลิกดีล",
        event: "dealcancelsales",
        title: nameOf.get(d.customerCode) ?? "—",
        detail: `ยกเลิกโดย ${empNameOf(d.cancelled.by)} · ${d.cancelled.why}`,
        href: findLink("/acc/billing", d.no),
        date: day,
      });
    }
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

  /* CEO ไม่อยู่ในชุด "พนักงานทุกคนที่ลงเวลา" — ไม่มีเรื่องใบลา/โอที/ใบเบิกของตัวเอง เช็คอิน/เช็คเอาท์ หรือสลิป (ผู้ใช้สั่ง 16 ต.ค. 2569) */
  const self = role !== "ceo";
  const myLeaves = self ? leaves : [];
  const myOt = self ? ot : [];
  const myClaims = self ? claims : [];

  // ── ใบลาและโอทีของเราที่ยังรอหัวหน้าอนุมัติ ──
  for (const l of myLeaves) {
    if (l.status !== "รอการอนุมัติ") continue;
    out.push({
      id: `leave-${l.id}`,
      level: "info",
      group: "รออนุมัติ",
      title: `ใบลา${l.type}`,
      detail: `${thaiDate(l.date)} · ${fmtLeaveHours(leaveHoursOf(l))} · รอหัวหน้าอนุมัติ`,
      href: "/leave",
      date: l.date,
    });
  }
  for (const o of myOt) {
    if (o.status !== "รออนุมัติ") continue;
    out.push({
      id: `ot-${o.id}`,
      level: "info",
      group: "รออนุมัติ",
      title: "คำขอโอที",
      detail: `${thaiDate(o.date)} · ${o.hours.toFixed(2)} ชม. · รอหัวหน้าอนุมัติ`,
      href: "/ot",
      date: o.date,
    });
  }

  /* ── ผลการตัดสินใบลาและใบโอทีของเรา (กติกากลาง) ──
     ตีกลับต้องรู้ทันทีเพราะต้องแก้แล้วยื่นใหม่ · อนุมัติแล้วก็ต้องรู้ จะได้วางแผนงานถูก
     นับจากเวลาที่ผู้อนุมัติตัดสิน (decidedAt) ใบเก่าก่อนมีช่องนี้จึงไม่เด้งย้อนหลังทั้งปี */
  for (const l of myLeaves) {
    if (!l.decidedAt || daysBetween(l.decidedAt.slice(0, 10), today) > DECIDED_DAYS) continue;
    const range = l.date === l.toDate ? thaiDate(l.date) : `${thaiDate(l.date)} – ${thaiDate(l.toDate)}`;
    if (l.status === "ไม่อนุมัติ")
      out.push({
        id: `leave-rej-${l.id}`,
        level: "late",
        group: "ใบลาไม่ผ่าน",
        event: "leave",
        title: `ใบลา${l.type}`,
        detail: `${range} · ${l.comment || "ผู้อนุมัติตีกลับ — ยื่นใหม่ได้"}`,
        href: "/leave",
        date: l.decidedAt.slice(0, 10),
      });
    else if (l.status === "อนุมัติแล้ว")
      out.push({
        id: `leave-ok-${l.id}`,
        level: "info",
        group: "ใบลาอนุมัติแล้ว",
        event: "leaveok",
        title: `ใบลา${l.type}`,
        detail: `${range} · ${fmtLeaveHours(leaveHoursOf(l))} · หัวหน้าอนุมัติแล้ว`,
        href: "/leave",
        date: l.decidedAt.slice(0, 10),
      });
  }
  for (const o of myOt) {
    if (!o.decidedAt || daysBetween(o.decidedAt.slice(0, 10), today) > DECIDED_DAYS) continue;
    if (o.status === "ไม่อนุมัติ")
      out.push({
        id: `ot-rej-${o.id}`,
        level: "late",
        group: "คำขอโอทีไม่ผ่าน",
        event: "leave",
        title: "คำขอโอที",
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
        event: "leaveok",
        title: "คำขอโอที",
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
              event: "eventchange",
              title: e.title,
              detail: `${when} · ${e.cancel?.why || "ไม่ได้ระบุเหตุผล"}`,
              href: backTo,
              date: e.cancel?.at.slice(0, 10) ?? e.date,
            }
          : {
              id: `ev-invite-${e.id}`,
              /* PM เพิ่มเข้านัดหมาย → เข้าร่วม เป็นเรื่องต้องทำ (ผู้ใช้สั่ง 16 ต.ค. 2569) */
              level: "soon",
              group: "นัดหมายที่คุณต้องเข้าร่วม",
              event: "eventinvite",
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
          event: "eventchange",
          title: e.title,
          detail: `${when} · ${e.from} – ${e.to} น. · ไม่ต้องเข้าร่วมแล้ว · ${empNameOf(c.by)} เป็นผู้แก้`,
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
        event: "eventchange",
        title: e.title,
        detail: `${parts.join(" · ")} · ${empNameOf(c.by)} เป็นผู้แก้`,
        href: backTo,
        date: c.at.slice(0, 10),
      });
    }

  }

  // ── ใบเบิกค่าใช้จ่ายที่ยังค้าง ──
  for (const c of myClaims) {
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
        event: "leave",
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
        event: "leaveok",
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
  for (const r of self ? (input.empReqs ?? []) : []) {
    if (!input.meId || r.emp !== input.meId || !r.decidedAt) continue;
    if (daysBetween(r.decidedAt.slice(0, 10), today) > DECIDED_DAYS) continue;
    const ok = r.status === "approved";
    if (!ok && r.status !== "rejected") continue;
    const what =
      r.kind === "leave"
        ? {
            page: "/leave",
            group: ok ? "ใบลาอนุมัติแล้ว" : "ใบลาไม่ผ่าน",
            title: `ใบลา${r.leaveType ?? ""}`,
            detail:
              (r.from === r.toDate ? thaiDate(r.from ?? "") : `${thaiDate(r.from ?? "")} – ${thaiDate(r.toDate ?? "")}`) +
              ` · ${empReqLeaveText(r)}`,
          }
        : r.kind === "ot"
          ? {
              page: "/ot",
              group: ok ? "คำขอโอทีอนุมัติแล้ว" : "คำขอโอทีไม่ผ่าน",
              title: "คำขอโอที",
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
              title: `ใบเบิกค่าใช้จ่าย${r.month ? ` ${thaiMonth(r.month)}` : ""}`,
              detail: `${(r.fuel ?? []).length} รายการ · ${r.plate ?? ""}`.trim(),
            };
    out.push({
      id: `empreq-${r.id}`,
      level: ok ? "info" : "late",
      group: what.group,
      event: ok ? "leaveok" : "leave",
      title: what.title,
      detail: `${what.detail} · ${ok ? r.reason || "หัวหน้าอนุมัติแล้ว" : r.reason || "ผู้อนุมัติตีกลับ — ยื่นใหม่ได้"}`,
      href: what.page,
      date: r.decidedAt.slice(0, 10),
    });
  }

  /* เลิกแจ้ง "ลืมเช็คเอาท์" แล้ว (ผู้ใช้สั่ง 16 ต.ค. 2569) — อย่าเพิ่มกลับ */

  /* ═══ สลิปเงินเดือนของเรา (กติกากลาง) ═══════════════════════════
     เดิมเงียบทั้งสองทาง — ฝ่ายบุคคลเผยแพร่ก็ไม่รู้ ยกเลิกการเผยแพร่ก็ไม่รู้
     คนที่เปิดสลิปไว้แล้วจึงเจอว่าหายไปเฉย ๆ โดยไม่มีใครบอกว่าทำไม
     อ่านกลุ่มจ่ายของตัวเอง (รายเดือน/รายวัน) เหมือนหน้าสลิปของฉัน ไม่งั้นเด้งผิดกลุ่ม */
  if (self && input.hr && input.meId) {
    const me = input.hr.emp.find((e) => e.id === input.meId);
    if (me && me.type !== "intern") {
      /* ทดลองงานรับสลิปตามรอบจ่ายรายช่วง (ผู้ใช้สั่ง 6 ต.ค. 2569)
         ผ่านทดลองงานกลางรอบได้ทั้งสลิปรายวัน (ถึงวันตัดรอบ) และรายเดือน (รอบถัดไป) (ผู้ใช้สั่ง 13 ต.ค. 2569) */
      for (const r of me.type === "probat" || me.probPass ? input.hr.dailyRounds : []) {
        if (!inRange(me, r) || !isDaily(me, r)) continue;
        const title = `รอบ ${probRoundLabel(r)}`;
        if (r.published && r.publishedAt && daysBetween(r.publishedAt.slice(0, 10), today) <= RECENT_DAYS) {
          out.push({
            id: `slip-${r.id}-day`,
            level: "info",
            group: "สลิปเงินเดือนออกแล้ว",
            event: "payslip",
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
      const day = false;
      for (const sp of me.type === "probat" ? [] : input.hr.slips) {
        if (!inPeriod(me, sp.month) || isDaily(me, hrCycle(sp.month))) continue;
        const published = day ? sp.dayPublished : sp.published;
        const at = day ? sp.dayPublishedAt : sp.publishedAt;
        /* เผยแพร่แล้วกับถูกถอนกลับเป็นคนละขั้ว ขึ้นได้ทีละอย่างเท่านั้น ไม่มีทางซ้อนกัน */
        if (published && at && daysBetween(at.slice(0, 10), today) <= RECENT_DAYS) {
          out.push({
            id: `slip-${sp.month}-${day ? "day" : "month"}`,
            level: "info",
            group: "สลิปเงินเดือนออกแล้ว",
            event: "payslip",
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
  /* เปลี่ยนตำแหน่งที่รับคำขอ — ฝ่ายขายกับทีมก่อนการขายควรรู้ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  ประเภทงานคำขอก่อนการขาย: (r) => (r === "sales" ? "/presales/new" : r === "ps" ? "/presales-work" : null),
  /* แม่แบบ Proposal เปลี่ยน — ฝ่ายขายควรรู้ ดาวน์โหลดได้ในหน้าผู้สนใจ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  "แม่แบบ Proposal": (r) => (r === "sales" ? "/leads" : null),
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
    /* ส่ง/ดึงกลับ/ตีกลับวันหยุดยังไม่มีผล — แจ้งทุกคนเฉพาะตอน CEO อนุมัติ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
    if (e.area === "วันหยุดบริษัท" && /^(ส่งให้ CEO|ดึงคำขอ|CEO ตีกลับ)/.test(e.detail)) continue;
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
