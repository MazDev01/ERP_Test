"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useFindParam } from "@/lib/deep-link";
import { Fragment, type ReactNode, useEffect, useMemo, useState } from "react";
import "@/styles/quotations.css";
import {
  EXPIRING_DAYS,
  canBillQuotation,
  canRejectQuotation,
  quotationTotals,
  quotationValidUntil,
  type Quotation,
} from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { serviceLabel } from "@/lib/pm-data";
import { baht, daysBetween, thaiDate, todayIso } from "@/lib/format";
import { ChevronDownIcon, ClockIcon, DownloadIcon, EyeIcon, FileIcon, PlusIcon } from "./icons";
import { BillQuotationDialog, RejectQuotationDialog } from "./quotation-dialogs";
import { Pager, SearchBox, Who, usePaged } from "./sales-ui";
import { stackNo } from "@/lib/stack-no";

const PER_PAGE = 7;

/*
 * รายการใบเสนอราคา — ตารางจอคอมตามต้นแบบ quotations (1).html ทุกคอลัมน์ (ผู้ใช้สั่ง 5 ต.ค. 2569)
 * แท็บสถานะ ทั้งหมด · รอดำเนินการ · วางบิลแล้ว · ปฏิเสธ · หมดอายุ + ตัวกรอง "ใกล้หมดอายุ" ด้านขวา
 * สถานะอนุมานจากข้อมูลจริงของใบ (rowStatus) ไม่ได้เก็บแยก
 * ผู้ใช้สั่ง 5 ต.ค. 2569: ไม่มีร่าง ไม่มีขั้นบันทึกว่าส่งแล้ว — ออกเลขแล้ว = รอดำเนินการ
 * จนกว่าจะกดปฏิเสธหรือส่งไปวางบิล · จะออกใบใหม่ให้ลูกค้ารายเดิมต้องปฏิเสธใบที่ค้างก่อน
 * ใบที่ถูกออกใบใหม่แทน ไม่ขึ้นเป็นแถวของตัวเอง แต่อยู่ในประวัติการแก้ไข (rev) ของใบล่าสุด กดแถวเพื่อกาง
 */
type RowStatus = "pending" | "billed" | "rejected" | "expired";
const ROW_STATUS: Record<RowStatus, { label: string; cls: string }> = {
  pending: { label: "รอดำเนินการ", cls: "t-info" },
  billed: { label: "วางบิลแล้ว", cls: "t-ok" },
  rejected: { label: "ปฏิเสธ", cls: "t-late" },
  expired: { label: "หมดอายุ", cls: "t-early" },
};
const TABS: [RowStatus | "all", string][] = [
  ["all", "ทั้งหมด"],
  ["pending", "รอดำเนินการ"],
  ["billed", "วางบิลแล้ว"],
  ["rejected", "ปฏิเสธ"],
  ["expired", "หมดอายุ"],
];
export function QuotationsPage() {
  const crm = useCrm();
  const router = useRouter();
  const params = useSearchParams();
  /* ลิงก์จากหน้าอื่นเจาะมาที่ฉบับเดียวได้ด้วย ?find=<เลขที่> — เอามาใส่ช่องค้นหาเลย */
  const find = useFindParam();
  const [query, setQuery] = useState(find);
  const [soonOnly, setSoonOnly] = useState(false);
  const [tab, setTab] = useState<RowStatus | "all">("all");
  /* แถวที่กางประวัติการแก้ไขอยู่ */
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState<Quotation | null>(null);
  const [billing, setBilling] = useState<Quotation | null>(null);
  const today = todayIso();

  /* ลิงก์เดิม ?new=1&customer=&from=<คำขอ> — ฟอร์มย้ายไปเป็นหน้าเต็ม /quotations/new แล้ว */
  useEffect(() => {
    if (!params.get("new")) return;
    const q = new URLSearchParams();
    const customer = params.get("customer");
    const ps = params.get("from") ?? params.get("ps");
    if (customer) q.set("customer", customer);
    if (ps) q.set("ps", ps);
    router.replace(`/quotations/new${q.size ? `?${q}` : ""}`);
  }, [params, router]);

  const nameOf = useMemo(
    () => new Map(crm.customers.map((c) => [c.code, c.name])),
    [crm.customers],
  );
  const hasDeal = useMemo(
    () => new Set(crm.deals.filter((d) => d.quotationNo).map((d) => d.quotationNo)),
    [crm.deals],
  );

  const validOf = (q: Quotation) => quotationValidUntil(q);
  const daysLeft = (q: Quotation) => daysBetween(today, validOf(q));
  /** ยังไม่มีดีล ยังไม่ถูกแทน และเหลือไม่เกิน 7 วัน = ต้องรีบตาม */
  const isSoon = (q: Quotation) =>
    !q.rejectedAt && !hasDeal.has(q.no) && !q.replacedBy && daysLeft(q) >= 0 && daysLeft(q) <= EXPIRING_DAYS;
  const canBill = (q: Quotation) => canBillQuotation(q, hasDeal.has(q.no), today);
  /* ใบที่หมดอายุแล้วไม่ต้องปฏิเสธ (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  const canReject = (q: Quotation) => canRejectQuotation(q, hasDeal.has(q.no)) && daysLeft(q) >= 0;
  const rowStatus = (q: Quotation): RowStatus =>
    hasDeal.has(q.no) ? "billed" : q.rejectedAt ? "rejected" : daysLeft(q) < 0 ? "expired" : "pending";
  const byNo = useMemo(
    () => new Map(crm.quotations.filter((q) => q.no).map((q) => [q.no, q])),
    [crm.quotations],
  );
  /** ประวัติการแก้ไขของใบ — ใบนี้ก่อน แล้วไล่ใบที่ถูกแทนย้อนไป */
  const historyOf = (q: Quotation) => {
    const out: Quotation[] = [q];
    let cur = q;
    while (cur.replaces && byNo.get(cur.replaces) && out.length < 20) {
      cur = byNo.get(cur.replaces)!;
      out.push(cur);
    }
    return out;
  };

  /*
   * ลำดับแบบกองซ้อน — นับจากใบทั้งหมดก่อนกรองแท็บ/ค้นหา ใหม่สุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569)
   * ใบที่แก้ไขแล้ว (rev) ใช้วันที่ของใบแรกในสาย เลขจะได้ไม่กระโดดเมื่อออกฉบับแก้ไข
   */
  const noOf = useMemo(() => {
    const root = (q: Quotation) => {
      let cur = q;
      for (let i = 0; i < 20 && cur.replaces && byNo.get(cur.replaces); i++) cur = byNo.get(cur.replaces)!;
      return cur;
    };
    return stackNo(
      crm.quotations.filter((q) => !q.replacedBy),
      (q) => root(q).issued,
      (q) => q.id,
    );
  }, [crm.quotations, byNo]);

  const rows = useMemo(() => {
    const qq = query.trim().toLowerCase();
    return crm.quotations.filter((q) => {
      if (q.replacedBy) return false;
      if (soonOnly && !isSoon(q)) return false;
      if (!qq) return true;
      const name = nameOf.get(q.customerCode) ?? "";
      return `${q.no} ${name} ${q.customerCode}`.toLowerCase().includes(qq);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crm.quotations, query, soonOnly, nameOf, hasDeal, today]).sort(
    /* ใหม่สุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
    (a, b) => (noOf.get(b.id) ?? 0) - (noOf.get(a.id) ?? 0),
  );
  const tabRows = tab === "all" ? rows : rows.filter((q) => rowStatus(q) === tab);
  const countOf = (t: RowStatus | "all") =>
    t === "all" ? rows.length : rows.filter((q) => rowStatus(q) === t).length;
  const paged = usePaged(tabRows, PER_PAGE);
  const total = tabRows.reduce((sum, q) => sum + quotationTotals(q).grand, 0);

  const docHref = (q: Quotation) => `/quotations/${encodeURIComponent(q.no)}`;
  const replaceHref = (q: Quotation) => `/quotations/new?from=${encodeURIComponent(q.no)}`;
  const openDoc = (q: Quotation) => router.push(docHref(q));
  /* ดาวน์โหลด PDF — เปิดเอกสารแท็บใหม่แล้วขึ้นหน้าต่างบันทึกเป็น PDF ทันที (ผู้ใช้สั่ง 5 ต.ค. 2569) */
  const pdfHref = (q: Quotation) => `${docHref(q)}?pdf=1`;

  /** ปุ่มจัดการตามต้นแบบ — ขึ้นตามข้อมูลของใบ ไม่ใช่ตามสถานะที่กดเลือก */
  const actions = (q: Quotation) => (
    <>
      {canBill(q) && (
        <button type="button" className="lnk" onClick={() => setBilling(q)}>
          ส่งไปวางบิล
        </button>
      )}
      {canReject(q) && (
        <button type="button" className="lnk" onClick={() => setRejecting(q)}>
          ปฏิเสธ
        </button>
      )}
      <Link href={replaceHref(q)} className="lnk quiet">
        ออกใบใหม่
      </Link>
    </>
  );

  /**
   * ปุ่มจัดการบนมือถือ — ชุดเดียวกับ actions() แต่เป็นปุ่มสูง 40px วางกริดสองช่อง
   * งานหลักของใบนั้นเป็นปุ่มทึบ ปุ่มเอกสารกับปุ่มดูรายละเอียดไปที่เดียวกัน จึงรวมเป็นปุ่ม "เปิดเอกสาร" ปุ่มเดียว
   */
  const phoneActions = (q: Quotation) => {
    const base = "btn h-10 justify-center px-2";
    const plain = `${base} glass-thin`;
    const main = `${base} solid btn-solid`;
    const danger = `${plain} !text-destructive`;
    const items: ReactNode[] = [];
    if (canBill(q)) {
      items.push(
        <button key="bill" type="button" className={main} onClick={() => setBilling(q)}>
          ส่งไปวางบิล
        </button>,
      );
    }
    if (canReject(q)) {
      items.push(
        <button key="rej" type="button" className={danger} onClick={() => setRejecting(q)}>
          ปฏิเสธ
        </button>,
      );
    }
    items.push(
      <Link key="re" href={replaceHref(q)} className={plain}>
        ออกใบใหม่
      </Link>,
    );
    items.push(
      <Link key="doc" href={docHref(q)} className={plain}>
        <FileIcon className="size-4" strokeWidth={2} />
        เปิดเอกสาร
      </Link>,
    );
    return (
      <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
        {items.map((it, i) => (
          /* จำนวนปุ่มเป็นเลขคี่ ปุ่มสุดท้ายกินเต็มแถว */
          <div key={i} className={`grid ${items.length % 2 && i === items.length - 1 ? "col-span-2" : ""}`}>
            {it}
          </div>
        ))}
      </div>
    );
  };

  /** บรรทัดความสัมพันธ์ใต้เลขที่ — ใบใหม่แทน · แทนใบ · อ้างอิงคำขอ · ลูกค้าปฏิเสธ */
  const relations = (q: Quotation) => (
    <>
      {q.replacedBy && <span className="why">ออกใบใหม่แทน {q.replacedBy}</span>}
      {q.replaces && <span className="why">แทนใบ {q.replaces}</span>}
      {q.ps && <span className="why">อ้างอิงคำขอทำข้อเสนอ</span>}
      {q.rejectedAt && <span className="why text-destructive">ผู้สนใจปฏิเสธ {thaiDate(q.rejectedAt)}</span>}
    </>
  );

  const validCell = (q: Quotation) => (
    <>
      {thaiDate(validOf(q))}
      {isSoon(q) && <span className="diff early">อีก {daysLeft(q)} วัน</span>}
    </>
  );

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>ใบเสนอราคา</h1>
          <p>พบ {tabRows.length} ฉบับ</p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              paged.setPage(1);
            }}
            placeholder="ค้นหาเลขที่เอกสารหรือชื่อผู้สนใจ"
          />
          <Link href="/quotations/new" className="btn solid btn-solid btn-block-mobile shrink-0">
            <PlusIcon className="size-[15px]" strokeWidth={2.2} />
            สร้างใบเสนอราคา
          </Link>
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
                  paged.setPage(1);
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
              paged.setPage(1);
            }}
            aria-pressed={soonOnly}
            className={`btn my-2 ${soonOnly ? "bg-accent font-semibold text-primary" : "glass-thin"}`}
          >
            {/* ไอคอนนาฬิกาหน้าป้ายตัวกรอง ตามต้นแบบ quotations.html */}
            <ClockIcon className="size-[13px]" strokeWidth={2} />
            ใกล้หมดอายุ
          </button>
        </div>

        <div className="scroll-stable hidden min-h-0 flex-1 overflow-auto md:block">
          <table className="data-table qt-table" style={{ minWidth: 1040 }}>
            <thead>
              <tr>
                <th className="c" style={{ width: 60 }}>ลำดับ</th>
                <th style={{ width: 150 }}>เลขที่เอกสาร</th>
                <th style={{ width: "21%" }}>ผู้สนใจ</th>
                <th className="qt-hide" style={{ width: "12%" }}>วันที่ออก</th>
                <th style={{ width: "13%" }}>มีผลถึง</th>
                <th className="qt-hide" style={{ width: "9%" }}>ออกในนาม</th>
                <th className="r" style={{ width: "12%" }}>ยอดรวม</th>
                {/* คอลัมน์จัดการกว้างพอให้ส่งไปวางบิล+ปฏิเสธ ไม่ทับสถานะ (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
                <th style={{ width: 120 }}>สถานะ</th>
                <th style={{ width: 290 }} aria-label="จัดการ" />
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
                  const st = ROW_STATUS[rowStatus(q)];
                  const hist = historyOf(q);
                  const hasRev = hist.length > 1;
                  const open = Boolean(opened[q.id]);
                  return (
                    <Fragment key={q.id}>
                      <tr
                        className={`${hasRev ? "hasrev" : ""} ${open ? "open" : ""}`}
                        aria-expanded={hasRev ? open : undefined}
                        /* มีประวัติแก้ไข → กดแถวเพื่อกาง · ไม่มี → เปิดเอกสาร (ต้นแบบ) */
                        onClick={() => (hasRev ? setOpened((o) => ({ ...o, [q.id]: !o[q.id] })) : openDoc(q))}
                        style={{ cursor: "pointer" }}
                      >
                        <td className="c num muted">{noOf.get(q.id)}</td>
                        <td className="muted num">
                          {q.no}
                          {hasRev && (
                            <span className="qt-rev">
                              rev {hist.length}
                              <ChevronDownIcon className="size-2.5" strokeWidth={3} />
                            </span>
                          )}
                        </td>
                        <td>
                          <Who name={nameOf.get(q.customerCode) ?? "—"} />
                        </td>
                        <td className="qt-hide muted num">{q.issued ? thaiDate(q.issued) : "—"}</td>
                        <td className="muted num">
                          {thaiDate(validOf(q))}
                          {isSoon(q) && <span className="qt-soon">อีก {daysLeft(q)} วัน</span>}
                        </td>
                        <td className="qt-hide muted">{q.issuer}</td>
                        <td className="r money">{baht(quotationTotals(q).grand)}</td>
                        <td>
                          <span className={`tag ${st.cls}`}>
                            <i />
                            {st.label}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="qt-acts">
                            {/* ส่งไปวางบิลจากตารางได้เลย ไม่ต้องเปิดเอกสาร (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
                            {canBill(q) && (
                              <button type="button" className="lnk qt-rej" style={{ color: "var(--primary)" }} onClick={() => setBilling(q)}>
                                ส่งไปวางบิล
                              </button>
                            )}
                            {/* ปฏิเสธ — ใบที่ยังไม่ได้ตัดสิน (รอดำเนินการหรือหมดอายุ) · ต้องปฏิเสธก่อนออกใบใหม่ */}
                            {canReject(q) && (
                              <button type="button" className="lnk qt-rej" onClick={() => setRejecting(q)}>
                                ปฏิเสธ
                              </button>
                            )}
                            <a
                              href={pdfHref(q)}
                              target="_blank"
                              rel="noopener"
                              className="qt-act"
                              aria-label={`ดาวน์โหลด PDF ${q.no}`}
                              title="ดาวน์โหลด PDF"
                            >
                              <DownloadIcon className="size-3.5" strokeWidth={2} />
                            </a>
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
                              <h4>ประวัติการแก้ไข {hist.length} ครั้ง</h4>
                              <table className="qt-revs">
                                <thead>
                                  <tr>
                                    <th style={{ width: 64 }}>ครั้งที่</th>
                                    <th style={{ width: 110 }}>วันที่</th>
                                    <th>สิ่งที่แก้ไข</th>
                                    <th className="r" style={{ width: 120 }}>ยอดรวม</th>
                                    <th className="r" style={{ width: 110 }}>ส่วนต่าง</th>
                                    <th style={{ width: 150 }} />
                                  </tr>
                                </thead>
                                <tbody>
                                  {hist.map((h, i) => {
                                    const cur = i === 0;
                                    const prev = hist[i + 1];
                                    const amt = quotationTotals(h).grand;
                                    const delta = prev ? amt - quotationTotals(prev).grand : null;
                                    const what = !prev
                                      ? "ฉบับแรกที่ส่งให้ผู้สนใจ"
                                      : prev.rejectReason
                                        ? `ออกใหม่แทน ${prev.no} · ${prev.rejectReason}`
                                        : `ออกใหม่แทน ${prev.no}`;
                                    return (
                                      <tr key={h.id} className={cur ? "cur" : undefined}>
                                        <td>
                                          <span className="qt-revno num">{hist.length - i}</span>
                                        </td>
                                        <td className="muted num">{thaiDate(h.issued || h.createdAt)}</td>
                                        <td>
                                          {cur && <b>ฉบับปัจจุบัน · </b>}
                                          {what}
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
                                          <span className="qt-revacts">
                                            {cur ? (
                                              <span className="muted">กำลังใช้</span>
                                            ) : (
                                              <Link href={docHref(h)} className="qt-link">
                                                ดูฉบับนี้
                                              </Link>
                                            )}
                                            <a
                                              href={pdfHref(h)}
                                              target="_blank"
                                              rel="noopener"
                                              className="qt-act"
                                              aria-label={`ดาวน์โหลด PDF ${h.no}`}
                                              title="ดาวน์โหลด PDF"
                                            >
                                              <DownloadIcon className="size-3.5" strokeWidth={2} />
                                            </a>
                                          </span>
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

        <ul className="divide-y divide-border md:hidden">
          {paged.list.length === 0 ? (
            <li className="px-5 py-12 text-center text-muted-foreground">
              ไม่พบใบเสนอราคาที่ตรงกับเงื่อนไข
            </li>
          ) : (
            paged.list.map((q) => (
              <li key={q.id} className="px-5 py-4 max-sm:px-4">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/leads/${q.customerCode}`} className="min-w-0">
                    <Who
                      name={nameOf.get(q.customerCode) ?? "—"}
                      sub={`#${noOf.get(q.id)} · ${q.no}`}
                    />
                  </Link>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <b className="money num text-[15px]">{baht(quotationTotals(q).grand)}</b>
                    <span className={`tag ${ROW_STATUS[rowStatus(q)].cls}`}>
                      <i />
                      {ROW_STATUS[rowStatus(q)].label}
                    </span>
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {q.service ? serviceLabel(q.service) : "—"} · ออกในนาม {q.issuer}
                  {q.issued && ` · ออก ${thaiDate(q.issued)}`}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">มีผลถึง {validCell(q)}</p>
                {relations(q)}
                <div className="mt-2.5 flex flex-wrap gap-2 max-sm:hidden">{actions(q)}</div>
                {phoneActions(q)}
              </li>
            ))
          )}
        </ul>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>{paged.range("ฉบับ")}</span>
          <span className="sum">
            ยอดรวมที่กรอง<b>{baht(total)}</b> บาท
          </span>
          {/* ไม่มีผลลัพธ์ก็ไม่ต้องแสดงปุ่มแบ่งหน้า ตาม mockup */}
          {paged.list.length > 0 && (
            <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />
          )}
        </div>
      </section>

      {rejecting && (
        <RejectQuotationDialog
          quotation={rejecting}
          customerName={nameOf.get(rejecting.customerCode) ?? "—"}
          onClose={() => setRejecting(null)}
        />
      )}
      {billing && (
        <BillQuotationDialog
          quotation={billing}
          customerName={nameOf.get(billing.customerCode) ?? "—"}
          onClose={() => setBilling(null)}
        />
      )}
    </div>
  );
}
