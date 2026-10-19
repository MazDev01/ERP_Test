"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import "@/styles/quotations.css";
import "@/styles/mobile/acc-quotations.css";
import { BillQuotationDialog } from "./quotation-dialogs";
import {
  canBillQuotation,
  EXPIRING_DAYS,
  issuerOf,
  quotationTotals,
  quotationValidUntil,
  type Customer,
  type Quotation,
} from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { useFindParam } from "@/lib/deep-link";
import { baht, daysBetween, thaiDate, todayIso } from "@/lib/format";
import { useRole } from "@/lib/role";
import { mobileHomeOf } from "@/lib/nav";
import { serviceLabel } from "@/lib/pm-data";
import { ChevronDownIcon, ClockIcon, EyeIcon, PlusIcon, RotateIcon } from "./icons";
import { Pager, SearchBox, Who, usePaged } from "./sales-ui";
import { stackNo } from "@/lib/stack-no";

const PER_PAGE = 7;
const BASE = "/acc/quotations";

/*
 * ใบเสนอราคาของฝ่ายบัญชี — ต้นแบบ acc-quotations.html (ผู้ใช้สั่ง 9 ต.ค. 2569)
 * ใช้ข้อมูลชุดเดียวกับฝ่ายขาย (useCrm().quotations) ไม่มีที่เก็บแยก
 * เห็นเฉพาะใบของลูกค้าจริง (ปิดการขายแล้ว) ไม่เห็นใบของผู้สนใจ · ไม่มีร่าง
 * สถานะอนุมานจากข้อมูลของใบ: มีดีล = ตอบรับ · ถูกออกใบใหม่แทน = แทนที่แล้ว · ปฏิเสธ · เลยวันมีผล = หมดอายุ · ที่เหลือ = ส่งแล้ว
 */
/* สถานะชุดเดียวกับฝ่ายขาย: รอวางบิล · วางบิลแล้ว · ปฏิเสธ · หมดอายุ (ผู้ใช้สั่ง 9 ต.ค. 2569)
   ใบที่ถูกออกใบใหม่แทนไม่ขึ้นเป็นแถวของตัวเอง ดูได้จากสายฉบับของใบล่าสุด */
type RowStatus = "sent" | "accepted" | "rejected" | "expired";
const ROW_STATUS: Record<RowStatus, { label: string; cls: string }> = {
  sent: { label: "รอวางบิล", cls: "t-info" },
  accepted: { label: "วางบิลแล้ว", cls: "t-ok" },
  rejected: { label: "ปฏิเสธ", cls: "t-late" },
  expired: { label: "หมดอายุ", cls: "t-early" },
};
const TABS: [RowStatus | "all", string][] = [
  ["all", "ทั้งหมด"],
  ["sent", "รอวางบิล"],
  ["accepted", "วางบิลแล้ว"],
  ["rejected", "ปฏิเสธ"],
  ["expired", "หมดอายุ"],
];

/* มือถือ — สีป้ายตัวย่อวนตามลำดับ · สีชิปตามสถานะ · ข้อความเมื่อแท็บว่าง (ผู้ใช้สั่ง 13 ต.ค. 2569) */
const M_TABS: RowStatus[] = ["sent", "accepted", "rejected", "expired"];
const M_TINT = ["c-rose", "c-sky", "c-mint", "c-peach", "c-lilac"];
const M_CHIP: Record<RowStatus, { label: string; cls: string }> = {
  sent: { label: ROW_STATUS.sent.label, cls: "ch-peach" },
  accepted: { label: ROW_STATUS.accepted.label, cls: "ch-mint" },
  rejected: { label: ROW_STATUS.rejected.label, cls: "ch-rose" },
  expired: { label: ROW_STATUS.expired.label, cls: "ch-grey" },
};
const M_EMPTY: Record<RowStatus, string> = {
  sent: "ไม่มีใบเสนอราคาที่รอวางบิล",
  accepted: "ยังไม่มีใบเสนอราคาที่วางบิลแล้ว",
  rejected: "ยังไม่มีใบเสนอราคาที่ลูกค้าปฏิเสธ",
  expired: "ยังไม่มีใบเสนอราคาที่หมดอายุ",
};
/** ตัวย่อชื่อ — ตัดคำนำหน้า บริษัท/ห้าง/ร้าน และช่องว่าง แล้วเอา 2 ตัวแรก (เหมือนต้นแบบ) */
const initials = (name: string) => name.replace(/^(บริษัท|ห้าง|ร้าน)\s*/, "").replace(/\s/g, "").slice(0, 2);

/** ลูกค้าจริง = ปิดการขายแล้ว (รหัสเปลี่ยนจากผู้สนใจเป็นลูกค้า เก็บรหัสเดิมไว้ที่ leadCode) */
const isRealCustomer = (c: Customer | undefined) => Boolean(c && (c.status === "ปิดงาน" || c.leadCode));

export function AccQuotationsPage() {
  const crm = useCrm();
  const router = useRouter();
  const role = useRole();
  const canCreate = role === "acc";
  const [query, setQuery] = useState(useFindParam());
  const [soonOnly, setSoonOnly] = useState(false);
  const [tab, setTab] = useState<RowStatus | "all">("all");
  /* แถวที่กางสายฉบับอยู่ */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  /* ใบที่กำลังส่งไปวางบิลจากการ์ดบนมือถือ (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  const [billing, setBilling] = useState<Quotation | null>(null);
  const today = todayIso();

  const custOf = useMemo(() => new Map(crm.customers.map((c) => [c.code, c])), [crm.customers]);
  const hasDeal = useMemo(
    () => new Set(crm.deals.filter((d) => d.quotationNo).map((d) => d.quotationNo)),
    [crm.deals],
  );
  /* ใบที่ออกเลขแล้วของลูกค้าจริงเท่านั้น */
  const mine = useMemo(
    () =>
      crm.quotations.filter((q) => q.no && q.status !== "ร่าง" && isRealCustomer(custOf.get(q.customerCode))),
    [crm.quotations, custOf],
  );
  const byNo = useMemo(() => new Map(mine.map((q) => [q.no, q])), [mine]);

  const nameOf = (q: Quotation) => custOf.get(q.customerCode)?.name ?? "—";
  /* ตั้งค่าผู้ออกเอกสารอาจว่าง — ไม่เจอก็ขึ้นรหัสเดิม */
  const issuerName = (q: Quotation) => (issuerOf(q.issuer) as { label: string } | undefined)?.label ?? q.issuer;
  const validOf = (q: Quotation) => quotationValidUntil(q);
  const daysLeft = (q: Quotation) => daysBetween(today, validOf(q));
  const rowStatus = (q: Quotation): RowStatus =>
    hasDeal.has(q.no) ? "accepted" : q.rejectedAt ? "rejected" : daysLeft(q) < 0 ? "expired" : "sent";
  /** ส่งแล้วและเหลือไม่เกิน 7 วัน */
  const isSoon = (q: Quotation) => rowStatus(q) === "sent" && daysLeft(q) <= EXPIRING_DAYS;

  /** ฉบับก่อนหน้าของใบนี้ — เก่าสุดก่อน จบที่ใบนี้ */
  const pastOf = (q: Quotation) => {
    const out: Quotation[] = [q];
    let cur = q;
    while (cur.replaces && byNo.get(cur.replaces) && out.length < 20) {
      cur = byNo.get(cur.replaces)!;
      out.unshift(cur);
    }
    return out;
  };
  /** สายฉบับทั้งหมด — ต่อจากใบนี้ไปจนถึงฉบับที่ใช้อยู่ */
  const chainOf = (q: Quotation) => {
    const out = pastOf(q);
    let cur = q;
    while (cur.replacedBy && byNo.get(cur.replacedBy) && out.length < 40) {
      cur = byNo.get(cur.replacedBy)!;
      out.push(cur);
    }
    return out;
  };

  /*
   * ลำดับแบบกองซ้อน — นับจากใบทั้งหมดก่อนกรองแท็บ/ค้นหา ใหม่สุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569)
   * ฉบับแก้ไขใช้วันที่ของฉบับแรกในสาย เลขจะได้ไม่กระโดดเมื่อออกฉบับใหม่
   */
  const noOf = useMemo(() => {
    const first = (q: Quotation) => {
      let cur = q;
      for (let i = 0; i < 20 && cur.replaces && byNo.get(cur.replaces); i++) cur = byNo.get(cur.replaces)!;
      return cur;
    };
    return stackNo(
      mine.filter((q) => !q.replacedBy),
      (q) => first(q).issued || first(q).createdAt,
      (q) => q.no,
    );
  }, [mine, byNo]);

  const rows = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return mine
      .filter((q) => !q.replacedBy)
      .filter((q) => {
        if (soonOnly && !isSoon(q)) return false;
        if (!qq) return true;
        return `${q.no} ${nameOf(q)} ${q.customerCode}`.toLowerCase().includes(qq);
      })
      /* เรียงตามลำดับกองซ้อน ใหม่สุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
      .sort((a, b) => (noOf.get(b.no) ?? 0) - (noOf.get(a.no) ?? 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, query, soonOnly, custOf, hasDeal, today, noOf]);
  const tabRows = tab === "all" ? rows : rows.filter((q) => rowStatus(q) === tab);
  const countOf = (t: RowStatus | "all") => (t === "all" ? rows.length : rows.filter((q) => rowStatus(q) === t).length);
  const paged = usePaged(tabRows, PER_PAGE);
  const total = tabRows.reduce((sum, q) => sum + quotationTotals(q).grand, 0);

  const docHref = (q: Quotation) => `${BASE}/${encodeURIComponent(q.no)}`;
  const replaceHref = (q: Quotation) => `${BASE}/new?from=${encodeURIComponent(q.no)}`;
  /* ออกใบใหม่แทนได้เฉพาะฉบับล่าสุดที่ยังไม่ถูกแทนและยังไม่ตอบรับ */
  const canReplace = (q: Quotation) => canCreate && !q.replacedBy && !hasDeal.has(q.no);
  const canBill = (q: Quotation) => canBillQuotation(q, hasDeal.has(q.no), today);
  const reset = () => paged.setPage(1);

  const validCell = (q: Quotation) => (
    <>
      {thaiDate(validOf(q))}
      {isSoon(q) && <span className="qt-soon">อีก {daysLeft(q)} วัน</span>}
    </>
  );
  const tag = (q: Quotation) => {
    const st = ROW_STATUS[rowStatus(q)];
    return (
      <span className={`tag ${st.cls}`}>
        <i />
        {st.label}
      </span>
    );
  };

  /*
   * มือถือ (แคบกว่า 768px) — หน้าตาตามต้นแบบ quotations-mobile-ref.html ทุกค่า ข้อมูล/สถานะ/ลิงก์เป็นของบัญชี (ผู้ใช้สั่ง 13 ต.ค. 2569)
   * แท็บ 4 สถานะของบัญชี (ไม่มี "ทั้งหมด") เริ่มที่รอวางบิล · ค้นหาชื่อลูกค้า ผู้ติดต่อ เบอร์โทร เลขที่ บริการ
   */
  const [mTab, setMTab] = useState<RowStatus>("sent");
  const norm = (t: string) => t.toLowerCase().replace(/[\s-]/g, "");
  const mAll = useMemo(
    () => mine.filter((q) => !q.replacedBy).sort((a, b) => (noOf.get(b.no) ?? 0) - (noOf.get(a.no) ?? 0)),
    [mine, noOf],
  );
  const mText = (q: Quotation) => {
    const c = custOf.get(q.customerCode);
    return norm(`${nameOf(q)} ${c?.contact ?? ""} ${c?.phone ?? ""} ${q.no} ${q.service ? serviceLabel(q.service) : ""}`);
  };
  const mTabRows = mAll.map((q, i) => ({ q, i })).filter((r) => rowStatus(r.q) === mTab);
  const mKey = norm(query);
  const mShown = mKey ? mTabRows.filter((r) => mText(r.q).includes(mKey)) : mTabRows;
  const mCount = (t: RowStatus) => mAll.filter((q) => rowStatus(q) === t).length;
  /* รอวางบิลที่ใกล้หมดอายุ ขึ้นจำนวนวันที่เหลือ แบบ "รอตอบ เหลือ N วัน" ของต้นแบบ */
  const mChip = (q: Quotation) => {
    const st = rowStatus(q);
    return isSoon(q) ? `${M_CHIP[st].label} เหลือ ${daysLeft(q)} วัน` : M_CHIP[st].label;
  };

  return (
    <>
    <div className="aq-m">
      <header className="aq-head">
        <div className="aq-bar">
          <Link className="aq-icb" href={mobileHomeOf(role)} aria-label="กลับหน้าหลัก">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
          </Link>
          <h1>ใบเสนอราคา</h1>
          {canCreate ? (
            <Link className="aq-icb add" href={`${BASE}/new`} aria-label="สร้างใบเสนอราคา">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
            </Link>
          ) : (
            <span aria-hidden="true" />
          )}
        </div>
        <label className={`aq-find${query ? " has" : ""}`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8A7E81" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อลูกค้า ผู้ติดต่อ หรือเบอร์โทร"
            aria-label="ค้นหาใบเสนอราคา"
          />
          <button type="button" aria-label="ล้างคำค้น" onClick={() => setQuery("")}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </label>
        <nav className="aq-tabs" role="tablist" aria-label="สถานะใบเสนอราคา">
          {M_TABS.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={mTab === t}
              className={mTab === t ? "on" : undefined}
              onClick={() => {
                setMTab(t);
                window.scrollTo(0, 0);
              }}
            >
              {ROW_STATUS[t].label}
              <span className="n">{mCount(t)}</span>
            </button>
          ))}
        </nav>
      </header>
      <div className="aq-list" role="tabpanel">
        {mTabRows.length === 0 ? (
          <p className="aq-empty">
            <span className="aq-clay c-mint">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8.5 12.2 2.4 2.4 4.6-4.8" /></svg>
            </span>
            {M_EMPTY[mTab]}
          </p>
        ) : mShown.length === 0 ? (
          <p className="aq-none">ไม่พบรายการที่ค้นหา</p>
        ) : (
          mShown.map(({ q, i }) => {
            const c = custOf.get(q.customerCode);
            const who = [c?.contact, c?.phone].filter(Boolean).join(" · ");
            return (
              <article key={q.id} className="aq-qc">
                {/* แตะส่วนบนของการ์ด = เปิดเอกสาร (บัญชีไม่มีหน้าผู้สนใจ) */}
                <div
                  className="aq-qtop"
                  role="link"
                  tabIndex={0}
                  onClick={() => router.push(docHref(q))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") router.push(docHref(q));
                  }}
                >
                  <span className={`aq-clay aq-ini ${M_TINT[i % M_TINT.length]}`}>{initials(nameOf(q))}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="aq-qh">
                      <b>{nameOf(q)}</b>
                      <span className="aq-amt">
                        {Math.round(quotationTotals(q).grand).toLocaleString("th-TH")} ฿<small>ยอดรวม</small>
                      </span>
                    </div>
                    <p className="aq-meta">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></svg>
                      <span>{q.no}</span>
                      <i />
                      <span>{q.service ? serviceLabel(q.service) : "—"}</span>
                    </p>
                    {who && (
                      <p className="aq-meta">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.6" /><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6" /></svg>
                        <span>{who}</span>
                      </p>
                    )}
                    <span className={`aq-chip ${M_CHIP[rowStatus(q)].cls}`}>{mChip(q)}</span>
                  </div>
                  <svg className="aq-qgo" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
                </div>
                <div className="aq-acts">
                  <Link className="sec" href={docHref(q)}>
                    ดูรายละเอียด
                  </Link>
                  {/* ปุ่มหลักบนมือถือคือส่งไปวางบิล ไม่ใช่ออกใบใหม่ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
                  {canCreate && canBill(q) && (
                    <button type="button" className="pri" onClick={() => setBilling(q)}>
                      ส่งไปวางบิล
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
    {billing && (
      <BillQuotationDialog
        quotation={billing}
        customerName={nameOf(billing)}
        onClose={() => setBilling(null)}
      />
    )}
    {/* จอคอมเหมือนเดิมทุกอย่าง (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
    <div className="space-y-4 max-md:hidden">
      <div className="bar">
        <div>
          <h1>ใบเสนอราคา</h1>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              reset();
            }}
            placeholder="ค้นหาเลขที่เอกสารหรือชื่อลูกค้า"
          />
          {canCreate && (
            <Link href={`${BASE}/new`} className="btn solid btn-solid btn-block-mobile shrink-0">
              <PlusIcon className="size-[15px]" strokeWidth={2.2} />
              สร้างใบเสนอราคา
            </Link>
          )}
        </div>
      </div>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs" role="tablist" aria-label="สถานะใบเสนอราคา">
            {TABS.map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={tab === k ? "on" : undefined}
                onClick={() => {
                  setTab(k);
                  reset();
                }}
              >
                {label} <b className="num">{countOf(k)}</b>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSoonOnly((v) => !v);
              reset();
            }}
            aria-pressed={soonOnly}
            className={`btn my-2 ${soonOnly ? "bg-accent font-semibold text-primary" : "glass-thin"}`}
          >
            <ClockIcon className="size-[13px]" strokeWidth={2} />
            ใกล้หมดอายุ
          </button>
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          <table className="data-table qt-table min-w-[1040px]">
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th style={{ width: 170 }}>เลขที่เอกสาร</th>
                <th style={{ width: "22%" }}>ลูกค้า</th>
                <th className="qt-hide" style={{ width: "11%" }}>วันที่ออก</th>
                <th style={{ width: "15%" }}>มีผลถึง</th>
                <th className="qt-hide" style={{ width: "13%" }}>ออกในนาม</th>
                <th className="r" style={{ width: "13%" }}>ยอดรวม</th>
                <th style={{ width: "12%" }}>สถานะ</th>
                <th style={{ width: 160 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {paged.list.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-[54px] text-center text-[14px] text-muted-foreground">
                    ไม่พบใบเสนอราคาที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                paged.list.map((q) => {
                  const past = pastOf(q);
                  const hasRev = past.length > 1;
                  const open = Boolean(opened[q.id]);
                  const chain = open ? chainOf(q) : [];
                  return (
                    <Fragment key={q.id}>
                      <tr
                        className={`${hasRev ? "hasrev" : ""} ${open ? "open" : ""}`}
                        aria-expanded={hasRev ? open : undefined}
                        /* มีฉบับก่อนหน้า → กดแถวเพื่อกาง · ไม่มี → เปิดเอกสาร (ต้นแบบ) */
                        onClick={() =>
                          hasRev ? setOpened((o) => ({ ...o, [q.id]: !o[q.id] })) : router.push(docHref(q))
                        }
                        style={{ cursor: "pointer" }}
                      >
                        <td data-label="ลำดับ" className="c num muted">{noOf.get(q.no)}</td>
                        <td data-label="เลขที่เอกสาร" className="muted num">
                          {q.no}
                          {hasRev && (
                            <span className="qt-rev">
                              ฉบับที่ {past.length}
                              <ChevronDownIcon className="size-2.5" strokeWidth={3} />
                            </span>
                          )}
                        </td>
                        <td data-label="ลูกค้า">
                          <Who name={nameOf(q)} />
                        </td>
                        <td data-label="วันที่ออก" className="qt-hide muted num">
                          {q.issued ? thaiDate(q.issued) : "—"}
                        </td>
                        <td data-label="มีผลถึง" className="muted num">
                          {validCell(q)}
                        </td>
                        <td data-label="ออกในนาม" className="qt-hide muted">
                          <span className="clip">{issuerName(q)}</span>
                        </td>
                        <td data-label="ยอดรวม" className="r money">
                          {baht(quotationTotals(q).grand)}
                        </td>
                        <td data-label="สถานะ">{tag(q)}</td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="qt-acts">
                            {/* ปุ่มเดียวดูรายละเอียด — เปิดเอกสารซ้ำกับปุ่มนี้ (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
                            {/* ส่งไปวางบิลจากตาราง แทนปุ่มออกใบใหม่ (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
                            {canCreate && canBill(q) && (
                              <button type="button" className="lnk qt-rej" style={{ color: "var(--primary)" }} onClick={() => setBilling(q)}>
                                ส่งไปวางบิล
                              </button>
                            )}
                            <Link href={docHref(q)} className="qt-act" aria-label="ดูรายละเอียด" title="ดูรายละเอียด">
                              <EyeIcon className="size-3.5" strokeWidth={2} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="sub">
                          <td colSpan={9}>
                            <div className="qt-revwrap">
                              <table className="qt-revs">
                                <thead>
                                  <tr>
                                    <th style={{ width: 70 }}>ฉบับที่</th>
                                    <th style={{ width: 140 }}>เลขที่เอกสาร</th>
                                    <th style={{ width: 110 }}>วันที่ออก</th>
                                    <th>สถานะ</th>
                                    <th className="r" style={{ width: 120 }}>ยอดรวม</th>
                                    <th className="r" style={{ width: 110 }}>ส่วนต่าง</th>
                                    <th style={{ width: 90 }} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {chain.map((h, i) => {
                                    const prev = chain[i - 1];
                                    const amt = quotationTotals(h).grand;
                                    const delta = prev ? amt - quotationTotals(prev).grand : null;
                                    const live = !h.replacedBy;
                                    return (
                                      <tr key={h.id} className={h.id === q.id ? "cur" : undefined}>
                                        <td>
                                          <span className="qt-revno num">{i + 1}</span>
                                        </td>
                                        <td className="num">{h.no}</td>
                                        <td className="muted num">{thaiDate(h.issued || h.createdAt)}</td>
                                        <td>
                                          {live ? <b>ฉบับที่ใช้อยู่</b> : <span className="muted">ถูกแทนที่ด้วย {h.replacedBy}</span>}
                                        </td>
                                        <td className="r num font-semibold">{baht(amt)}</td>
                                        <td className="r">
                                          {delta === null ? (
                                            <span className="muted">—</span>
                                          ) : (
                                            <span className={`qt-delta ${delta > 0 ? "up" : "down"}`}>
                                              {delta > 0 ? "+" : ""}
                                              {baht(delta)}
                                            </span>
                                          )}
                                        </td>
                                        <td className="r">
                                          <Link href={docHref(h)} className="qt-link">
                                            ดูเอกสาร
                                          </Link>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>{paged.range("ฉบับ")}</span>
          <span className="sum">
            ยอดรวมที่กรอง<b>{baht(total)}</b> บาท
          </span>
          {paged.list.length > 0 && <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />}
        </div>
      </section>
    </div>
    </>
  );
}
