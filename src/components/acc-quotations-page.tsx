"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useMemo, useState } from "react";
import "@/styles/quotations.css";
import {
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
import { ChevronDownIcon, ClockIcon, EyeIcon, PlusIcon, RotateIcon } from "./icons";
import { PhoneCard, PhoneList } from "./acchr-phone";
import { Pager, SearchBox, Who, usePaged } from "./sales-ui";

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

/** ลูกค้าจริง = ปิดการขายแล้ว (รหัสเปลี่ยนจากผู้สนใจเป็นลูกค้า เก็บรหัสเดิมไว้ที่ leadCode) */
const isRealCustomer = (c: Customer | undefined) => Boolean(c && (c.status === "ปิดงาน" || c.leadCode));

export function AccQuotationsPage() {
  const crm = useCrm();
  const router = useRouter();
  const canCreate = useRole() === "acc";
  const [query, setQuery] = useState(useFindParam());
  const [soonOnly, setSoonOnly] = useState(false);
  const [tab, setTab] = useState<RowStatus | "all">("all");
  /* แถวที่กางสายฉบับอยู่ */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
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

  const nameOf = (q: Quotation) => custOf.get(q.customerCode)?.name ?? q.customerCode;
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

  const rows = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return mine
      .filter((q) => !q.replacedBy)
      .filter((q) => {
        if (soonOnly && !isSoon(q)) return false;
        if (!qq) return true;
        return `${q.no} ${nameOf(q)} ${q.customerCode}`.toLowerCase().includes(qq);
      })
      .sort((a, b) => (b.issued || b.createdAt).localeCompare(a.issued || a.createdAt) || b.no.localeCompare(a.no));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mine, query, soonOnly, custOf, hasDeal, today]);
  const tabRows = tab === "all" ? rows : rows.filter((q) => rowStatus(q) === tab);
  const countOf = (t: RowStatus | "all") => (t === "all" ? rows.length : rows.filter((q) => rowStatus(q) === t).length);
  const paged = usePaged(tabRows, PER_PAGE);
  const total = tabRows.reduce((sum, q) => sum + quotationTotals(q).grand, 0);

  const docHref = (q: Quotation) => `${BASE}/${encodeURIComponent(q.no)}`;
  const replaceHref = (q: Quotation) => `${BASE}/new?from=${encodeURIComponent(q.no)}`;
  /* ออกใบใหม่แทนได้เฉพาะฉบับล่าสุดที่ยังไม่ถูกแทนและยังไม่ตอบรับ */
  const canReplace = (q: Quotation) => canCreate && !q.replacedBy && !hasDeal.has(q.no);
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

  return (
    <div className="space-y-4">
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
          <table className="data-table qt-table min-w-[980px]">
            <thead>
              <tr>
                <th style={{ width: 170 }}>เลขที่เอกสาร</th>
                <th style={{ width: "22%" }}>ลูกค้า</th>
                <th className="qt-hide" style={{ width: "11%" }}>วันที่ออก</th>
                <th style={{ width: "15%" }}>มีผลถึง</th>
                <th className="qt-hide" style={{ width: "13%" }}>ออกในนาม</th>
                <th className="r" style={{ width: "13%" }}>ยอดรวม</th>
                <th style={{ width: "12%" }}>สถานะ</th>
                <th style={{ width: 118 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {paged.list.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-[54px] text-center text-[14px] text-muted-foreground">
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
                            {canReplace(q) && (
                              <Link
                                href={replaceHref(q)}
                                className="qt-act"
                                aria-label={`ออกใบใหม่แทน ${q.no}`}
                                title="ออกใบใหม่แทนใบนี้"
                              >
                                <RotateIcon className="size-3.5" strokeWidth={2} />
                              </Link>
                            )}
                            <Link href={docHref(q)} className="qt-act" aria-label="ดูรายละเอียด" title="ดูรายละเอียด">
                              <EyeIcon className="size-3.5" strokeWidth={2} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr className="sub">
                          <td colSpan={8}>
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

        {/* มือถือ: การ์ดตามแบบหน้าบัญชีอื่น แตะการ์ดเพื่อเปิดเอกสาร */}
        <PhoneList empty={paged.list.length === 0 ? "ไม่พบใบเสนอราคาที่ตรงกับเงื่อนไข" : undefined}>
          {paged.list.map((q) => {
            const past = pastOf(q);
            return (
              <PhoneCard
                key={q.id}
                title={nameOf(q)}
                sub={
                  <span className="num">
                    {q.no}
                    {past.length > 1 && ` · ฉบับที่ ${past.length}`}
                  </span>
                }
                amount={baht(quotationTotals(q).grand)}
                amountNote="ยอดรวม (บาท)"
                onOpen={() => router.push(docHref(q))}
                openLabel={`เปิดใบเสนอราคา ${q.no}`}
                badge={tag(q)}
                stats={[
                  { label: "วันที่ออก", value: q.issued ? thaiDate(q.issued) : "—" },
                  { label: "มีผลถึง", value: validCell(q) },
                  { label: "ออกในนาม", value: issuerName(q) },
                  ...(q.replacedBy ? [{ label: "ถูกแทนที่ด้วย", value: q.replacedBy }] : []),
                ]}
                actions={
                  canReplace(q) ? (
                    <Link href={replaceHref(q)} className="btn glass-thin h-10 w-full justify-center">
                      <RotateIcon className="size-4" strokeWidth={2} />
                      ออกใบใหม่แทนใบนี้
                    </Link>
                  ) : undefined
                }
              />
            );
          })}
        </PhoneList>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>{paged.range("ฉบับ")}</span>
          <span className="sum">
            ยอดรวมที่กรอง<b>{baht(total)}</b> บาท
          </span>
          {paged.list.length > 0 && <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />}
        </div>
      </section>
    </div>
  );
}
