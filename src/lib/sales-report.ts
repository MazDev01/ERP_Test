/*
 * สรุปตัวเลขรายงานจากข้อมูลงานขายจริง — สูตรตามต้นแบบ dose-erp-maz/dashboard.html (buildSet)
 * ทุกตัวเลขที่หน้ารายงานแสดง คำนวณจากสโตร์เดียวกับหน้าอื่น
 * ปิดดีลเพิ่มหนึ่งใบ รายงานขยับทันที ไม่ต้องแก้ตัวเลขตามที่ไหนอีก
 */

import { quotationTotals, quotationValidUntil, type CustomerStatus } from "./crm-data";
import type { CrmState } from "./crm-store";
import { parseIsoDate, TH_MONTHS_FULL, TH_MONTHS_SHORT, toIsoDate } from "./format";

export type RangeKey = "m" | "q" | "y";

/* ป้ายปุ่มช่วงเวลาตามต้นแบบ — เดือนนี้ · ไตรมาส · ปีนี้ */
export const RANGE_LABEL: Record<RangeKey, string> = {
  m: "เดือนนี้",
  q: "ไตรมาส",
  y: "ปีนี้",
};

export type Slice = { label: string; value: number; color: string };

type Range = {
  from: string;
  to: string;
  /** คำอธิบายช่วงใต้หัวกราฟ เช่น "1 – 30 กันยายน 2569" */
  note: string;
  /** เดือน = แบ่งกราฟรายสัปดาห์ · ไตรมาส/ปี = รายเดือน */
  buckets: "week" | "month";
  y: number;
  m: number;
  n: number;
};

/** ช่วงวันที่ของตัวเลือก ถอยหลังได้ back ช่วง (1 = ช่วงก่อนหน้า ไว้เทียบว่าดีขึ้นหรือแย่ลง) */
export function rangeOf(key: RangeKey, today: Date, back = 0): Range {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (key === "m") {
    const first = new Date(y, m - back, 1);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    return {
      from: toIsoDate(first),
      to: toIsoDate(last),
      note: `1 – ${last.getDate()} ${TH_MONTHS_FULL[first.getMonth()]} ${first.getFullYear() + 543}`,
      buckets: "week",
      y: first.getFullYear(),
      m: first.getMonth(),
      n: 1,
    };
  }
  if (key === "q") {
    const first = new Date(y, Math.floor(m / 3) * 3 - back * 3, 1);
    const s = first.getMonth();
    const yy = first.getFullYear();
    return {
      from: toIsoDate(first),
      to: toIsoDate(new Date(yy, s + 3, 0)),
      note: `ไตรมาส ${s / 3 + 1} ${TH_MONTHS_FULL[s]} – ${TH_MONTHS_FULL[s + 2]} ${yy + 543}`,
      buckets: "month",
      y: yy,
      m: s,
      n: 3,
    };
  }
  const yy = y - back;
  return {
    from: `${yy}-01-01`,
    to: `${yy}-12-31`,
    note: `ปี ${yy + 543} มกราคม – ธันวาคม ${yy + 543}`,
    buckets: "month",
    y: yy,
    m: 0,
    n: 12,
  };
}

const inRange = (iso: string | undefined, from: string, to: string) =>
  Boolean(iso) && iso! >= from && iso! <= to;

/** รหัสผู้สนใจเก็บปีและเดือนที่เปิดไว้ในตัวเลขชุดกลาง เช่น LEAD-6909-001 คือ ก.ย. 2026 (เปลี่ยนเป็น CUS- แล้วเลขเดิม) */
function leadIso(code: string) {
  const m = /-(\d{2})(\d{2})-/.exec(code);
  return m ? `20${m[1]}-${m[2]}-01` : "";
}

/** เปอร์เซ็นต์การเปลี่ยนแปลงเทียบช่วงก่อน — ช่วงก่อนเป็นศูนย์: มีของตอนนี้ = +100% ไม่มีเลย = 0% (ต้นแบบ delta) */
function delta(now: number, before: number): number {
  return before ? Math.round(((now - before) / before) * 1000) / 10 : now ? 100 : 0;
}

/* สีตามต้นแบบ */
const STATUS_ORDER: [CustomerStatus, string][] = [
  ["รอนัดหมาย", "#1F6FD0"],
  ["ปฏิเสธ", "#8A919E"],
  ["ปิดงาน", "#14875A"],
];
const SOURCE_COLOR: Record<string, string> = {
  เว็บไซต์: "#1F6FD0",
  แนะนำต่อ: "#5B3FBF",
  ออกบูธ: "#B4630B",
  เฟซบุ๊ก: "#14875A",
  โทรเข้า: "#8A919E",
};
const LOST_COLORS = ["#C0121F", "#B4630B", "#8A919E", "#5B3FBF"];

function tally(items: string[]): { label: string; value: number }[] {
  const map = new Map<string, number>();
  for (const key of items) map.set(key, (map.get(key) ?? 0) + 1);
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** ตัวเลขของช่วงเดียว — เรียกสองครั้ง (ช่วงนี้ กับช่วงก่อน) เพื่อหาการเปลี่ยนแปลง */
function buildSet(crm: CrmState, r: Range) {
  const wonAll = crm.deals.filter((d) => d.status === "ปิดการขาย");
  const won = wonAll.filter((d) => inRange(d.closedAt, r.from, r.to));
  const wonValue = won.reduce((s, d) => s + d.total, 0);
  const issued = crm.quotations.filter((q) => inRange(q.issued, r.from, r.to));
  const leads = crm.customers.filter((c) => inRange(leadIso(c.code), r.from, r.to));

  /* อัตราปิด = ใบเสนอราคาที่ออกในช่วงนี้และปิดดีลได้แล้ว ÷ ใบที่ออกในช่วงนี้ (ต้นแบบ ceo-sales.html / dashboard.html)
     ไม่ใช้ดีลที่ปิดในช่วงนี้เป็นตัวตั้ง — ดีลนั้นอาจมาจากใบที่ออกก่อนช่วง ทำให้เกิน 100% */
  const wonQuote = new Set(wonAll.map((d) => d.quotationNo).filter(Boolean));
  const quoteWon = issued.filter((q) => wonQuote.has(q.no)).length;

  /*
   * ดีลที่ปิดได้ในช่วงนี้ แต่ใบเสนอราคาออกก่อนช่วง — ไม่เข้าตัวตั้งของอัตราปิด
   * ถ้าไม่บอกไว้ หน้าจอจะขึ้น "ปิดได้ 0 จาก 1 ฉบับ" คู่กับ "มูลค่าที่ปิดได้ 342,400 ฿ 1 ดีล"
   * ซึ่งอ่านแล้วเหมือนขัดกันเอง ทั้งที่เป็นคนละฐานการนับ
   */
  const wonBefore = won.filter((d) => {
    const q = crm.quotations.find((x) => x.no && x.no === d.quotationNo);
    return !q?.issued || !inRange(q.issued, r.from, r.to);
  }).length;

  /** วันเฉลี่ยจากออกใบเสนอราคาถึงปิดดีล */
  const gaps = won
    .map((d) => {
      const q = crm.quotations.find((x) => x.no && x.no === d.quotationNo);
      if (!q?.issued) return null;
      return Math.round((parseIsoDate(d.closedAt).getTime() - parseIsoDate(q.issued).getTime()) / 86_400_000);
    })
    .filter((n): n is number => n !== null && n >= 0);
  const avgDays = gaps.length ? Math.round(gaps.reduce((s, n) => s + n, 0) / gaps.length) : 0;

  /** ชั่วโมงที่ BD/SA ใช้ทำข้อเสนอที่ส่งกลับในช่วงนี้ */
  const hours = crm.presalesRounds.filter((x) => inRange(x.at, r.from, r.to)).reduce((s, x) => s + x.hours, 0);

  return { won, wonValue, issued, leads, quoteWon, wonBefore, avgDays, hours };
}

export function buildReport(crm: CrmState, key: RangeKey, today: Date) {
  const r = rangeOf(key, today);
  const now = buildSet(crm, r);
  const before = buildSet(crm, rangeOf(key, today, 1));

  /* ช่วงย่อยของกราฟ — ดูรายเดือนแบ่งทีละ 7 วัน · ไตรมาส/ปีแบ่งรายเดือน */
  const buckets: { label: string; from: string; to: string }[] = [];
  if (r.buckets === "week") {
    const last = parseIsoDate(r.to).getDate();
    for (let st = 1; st <= last; st += 7) {
      const en = Math.min(st + 6, last);
      buckets.push({
        label: `${st}–${en} ${TH_MONTHS_SHORT[r.m]}`,
        from: toIsoDate(new Date(r.y, r.m, st)),
        to: toIsoDate(new Date(r.y, r.m, en)),
      });
    }
  } else {
    for (let i = 0; i < r.n; i++) {
      const first = new Date(r.y, r.m + i, 1);
      buckets.push({
        label: TH_MONTHS_SHORT[first.getMonth()],
        from: toIsoDate(first),
        to: toIsoDate(new Date(first.getFullYear(), first.getMonth() + 1, 0)),
      });
    }
  }
  const series: [string, number][] = buckets.map((b) => [
    b.label,
    now.won.filter((d) => inRange(d.closedAt, b.from, b.to)).reduce((s, d) => s + d.total, 0),
  ]);
  const compare: [string, number, number][] = buckets.map((b) => [
    b.label,
    now.issued.filter((q) => inRange(q.issued, b.from, b.to)).length,
    now.won.filter((d) => inRange(d.closedAt, b.from, b.to)).length,
  ]);

  /* สัดส่วนผู้สนใจ — นับเฉพาะผู้สนใจที่เปิดในช่วงนี้ (ปีเดือนในรหัส) */
  const statusSlices: Slice[] = STATUS_ORDER.map(([label, color]) => ({
    label,
    value: now.leads.filter((c) => c.status === label).length,
    color,
  }));
  const sourceSlices: Slice[] = tally(now.leads.map((c) => c.source || "ไม่ระบุ")).map((x) => ({
    ...x,
    color: SOURCE_COLOR[x.label] ?? "#8A919E",
  }));

  /* เหตุผลที่ไม่ได้งาน — ใบที่ลูกค้าปฏิเสธในช่วงนี้ กับดีลที่ถูกยกเลิกในช่วงนี้ */
  const lostSlices: Slice[] = tally([
    ...crm.quotations
      .filter((q) => inRange(q.rejectedAt, r.from, r.to) && q.rejectReason)
      .map((q) => q.rejectReason!),
    ...crm.deals
      .filter((d) => d.cancelled && inRange(d.cancelled.at.slice(0, 10), r.from, r.to) && d.cancelled.why)
      .map((d) => d.cancelled!.why),
  ]).map((x, i) => ({ ...x, color: LOST_COLORS[i % LOST_COLORS.length] }));

  const byCustomer = new Map<string, number>();
  for (const d of now.won) byCustomer.set(d.customerCode, (byCustomer.get(d.customerCode) ?? 0) + d.total);
  const nameOf = new Map(crm.customers.map((c) => [c.code, c.name]));
  /* เก็บรหัสลูกค้าไว้ด้วย จะได้กดจากอันดับไปหน้าลูกค้าได้ */
  const rank: RankRow[] = [...byCustomer.entries()]
    .map(([code, value]) => ({ code, name: nameOf.get(code) ?? code, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 5);

  const rate = now.issued.length ? (now.quoteWon / now.issued.length) * 100 : 0;
  const ratePrev = before.issued.length ? (before.quoteWon / before.issued.length) * 100 : 0;

  return {
    from: r.from,
    to: r.to,
    note: r.note,
    won: now.wonValue,
    wonDeals: now.won.length,
    dWon: delta(now.wonValue, before.wonValue),
    leads: now.leads.length,
    dLead: delta(now.leads.length, before.leads.length),
    quotes: now.issued.length,
    quoteWon: now.quoteWon,
    /** ดีลที่ปิดในช่วงนี้จากใบที่ออกก่อนช่วง — นับในมูลค่าที่ปิดได้ แต่ไม่นับในอัตราปิด */
    wonBefore: now.wonBefore,
    /* มูลค่าที่เสนอ = ยอดรวมก่อนหัก ณ ที่จ่าย ตรงกับคอลัมน์ยอดรวมในหน้าใบเสนอราคา */
    quoted: now.issued.reduce((s, q) => s + quotationTotals(q).grand, 0),
    rate: Math.round(rate * 10) / 10,
    /** อัตราปิดเทียบช่วงก่อน เป็นจุดเปอร์เซ็นต์ (ต่างกันกี่ %) ไม่ใช่เปอร์เซ็นต์ของเปอร์เซ็นต์ */
    dRate: Math.round((rate - ratePrev) * 10) / 10,
    avgDays: now.avgDays,
    presalesHours: Math.round(now.hours * 10) / 10,
    series,
    compare,
    statusSlices,
    sourceSlices,
    lostSlices,
    rank,
  };
}

export type SalesReport = ReturnType<typeof buildReport>;

export type AgendaType = "follow" | "presale" | "quote";

export const AGENDA_LABEL: Record<AgendaType, string> = {
  follow: "นัดติดตาม",
  presale: "คำขอครบกำหนด",
  quote: "ใบเสนอราคาหมดอายุ",
};

export const AGENDA_COLOR: Record<AgendaType, string> = {
  follow: "var(--primary)",
  presale: "#1f6fd0",
  quote: "#b4630b",
};

export type RankRow = { code: string; name: string; value: number };

export type AgendaEvent = {
  id: string;
  date: string;
  type: AgendaType;
  title: string;
  detail: string;
  /** หน้าที่เรื่องนี้อยู่จริง — กดจากปฏิทินแล้วไปทำงานต่อได้เลย */
  href: string;
};

/** ปฏิทินรวมทุกอย่างที่มีวันกำหนด — นัดติดตาม คำขอครบกำหนด และใบเสนอราคาที่จะหมดอายุ (ต้นแบบ CAL_EVENTS) */
export function buildAgenda(crm: CrmState): AgendaEvent[] {
  const nameOf = new Map(crm.customers.map((c) => [c.code, c.name]));
  const events: AgendaEvent[] = [];

  for (const a of crm.activities) {
    if (!a.followUp) continue;
    events.push({
      id: `f-${a.id}`,
      date: a.followUp,
      type: "follow",
      title: `นัดติดตาม ${nameOf.get(a.customerCode) ?? a.customerCode}`,
      detail: a.nextAction || a.summary,
      href: `/leads/${a.customerCode}`,
    });
  }

  for (const p of crm.presales) {
    if (p.status === "ปิดคำขอ" || p.status === "ส่งกลับแล้ว") continue;
    events.push({
      id: `p-${p.id}`,
      date: p.due,
      type: "presale",
      title: `คำขอ ${p.no} ครบกำหนด`,
      /* "SA ปิยะวัฒน์" — ประเภทงานกับชื่อผู้รับผิดชอบ ไม่เอาวงเล็บตำแหน่งซ้ำ */
      detail: `${p.kind} ${p.assignee.replace(/\s*\(.*\)$/, "")}`,
      href: `/presales?find=${encodeURIComponent(p.no)}`,
    });
  }

  /* ใบที่ยังรอคำตอบ (ยังไม่มีดีล ไม่ถูกแทน ไม่ถูกปฏิเสธ) — รวมใบที่ออกเลขแล้วแต่ยังไม่ได้ส่ง */
  for (const q of crm.quotations) {
    if (!q.no || q.replacedBy || q.rejectedAt) continue;
    if (crm.deals.some((d) => d.quotationNo === q.no)) continue;
    events.push({
      id: `q-${q.id}`,
      date: quotationValidUntil(q),
      type: "quote",
      title: `ใบเสนอราคา ${q.no} หมดอายุ`,
      detail: `${nameOf.get(q.customerCode) ?? q.customerCode} ${quotationTotals(q).grand.toLocaleString("th-TH")} บาท`,
      href: `/quotations/${encodeURIComponent(q.no)}`,
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}
