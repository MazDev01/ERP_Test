"use client";

/*
 * ดีล (ต้นแบบ dose-erp-maz/ceo-deals.html) — ใช้ทั้งฝ่ายขาย (/deals) และ CEO ดูอย่างเดียว (/ceo/deals)
 *
 * ใบงานย้ายไปเป็นโปรเจคในระบบ PM แล้ว หน้านี้จึงเหลือเหตุผลตอนยกเลิกดีล และเอกสารของดีล
 * กดแถว = กางเอกสารใต้แถว: ใบเสนอราคาทุกฉบับ + ข้อเสนอจากทีมก่อนการขาย (ดูอย่างเดียว)
 * ไม่แสดง/ไม่แนบสัญญาที่หน้านี้แล้ว ข้อมูลสัญญาเดิมยังอยู่ในสโตร์ (ผู้ใช้สั่ง 9 ต.ค. 2569)
 * ปุ่มท้ายแถว: ยกเลิกดีล (เฉพาะก่อนลูกค้าจ่ายเงิน) · มุมมอง CEO ซ่อนด้วย data-ceo-hide
 * และเลขใบเสนอราคาพาไปหน้าเอกสารของ CEO เอง
 */

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useFindParam } from "@/lib/deep-link";
import {
  DEAL_STATUS,
  quotationTotals,
  type Deal,
  type DealStatus,
  type PresalesRequest,
  type PresalesRound,
  type Quotation,
} from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { dealPaid, useAcc } from "@/lib/acc-store";
import { billingOf, dealTrack } from "@/lib/flow";
import { usePm } from "@/lib/pm-store";
import { baht, initials, thaiDate } from "@/lib/format";
import { BanIcon, CalendarIcon, EyeIcon, FileIcon, LinkIcon } from "./icons";
import { CancelDealDialog } from "./cancel-deal-dialog";
import { ProposalDialog, isCanva } from "./proposal-doc";
import { Pager, SearchBox, TabStrip, Who, usePaged } from "./sales-ui";
import "@/styles/mobile/deals.css";

const PER_PAGE = 7;

type TabKey = "all" | DealStatus;

const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "ปิดการขาย", label: "ปิดการขาย" },
  { key: "ยกเลิก", label: "ยกเลิก" },
];

export function DealsPage({ ceo = false }: { ceo?: boolean }) {
  const crm = useCrm();
  const acc = useAcc();
  const [tab, setTab] = useState<TabKey>("all");
  /* ลิงก์จากหน้าอื่นเจาะมาที่ดีลเดียวได้ด้วย ?find=<เลขที่> */
  const find = useFindParam();
  const [query, setQuery] = useState(find);
  const [open, setOpen] = useState<Record<string, boolean>>(() => (find ? { [find]: true } : {}));
  const [cancelling, setCancelling] = useState<string | null>(null);

  const nameOf = useMemo(() => new Map(crm.customers.map((c) => [c.code, c.name])), [crm.customers]);

  const scoped = useMemo(() => {
    const q = query.trim().toLowerCase();
    return crm.deals.filter((d) => {
      if (!q) return true;
      const name = nameOf.get(d.customerCode) ?? "";
      return `${d.no} ${name} ${d.customerCode} ${d.quotationNo}`.toLowerCase().includes(q);
    });
  }, [crm.deals, query, nameOf]);

  const rows = tab === "all" ? scoped : scoped.filter((d) => d.status === tab);
  const paged = usePaged(rows, PER_PAGE);

  const counts: Record<string, number> = { all: scoped.length };
  for (const t of TABS.slice(1)) counts[t.key] = scoped.filter((d) => d.status === t.key).length;

  /* ยอดท้ายตารางสรุปตามสิ่งที่กรองอยู่ตรงหน้า จะได้ตรงกับตัวเลขที่เห็นในตาราง */
  const filteredTotal = rows.reduce((sum, d) => sum + d.total, 0);

  /* ยกเลิกได้ที่หน้านี้เฉพาะดีลที่ยังไม่รับเงิน — รับเงินแล้วต้องให้ฝ่ายบัญชียกเลิกที่หน้าวางบิล */
  const canCancel = (d: Deal) => d.status === "ปิดการขาย" && !dealPaid(acc, d.no);
  /* กางได้เมื่อมีอะไรให้ดู — เหตุผลยกเลิก หรือเอกสารของดีล (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  const canOpen = (d: Deal) => d.status !== "ปิดการขาย" || Boolean(d.quotationNo);
  const quoHref = (no: string) =>
    ceo ? `/ceo/sales/quotations/${encodeURIComponent(no)}` : `/quotations/${encodeURIComponent(no)}`;

  const cancelRow = cancelling ? crm.deals.find((d) => d.no === cancelling) : undefined;

  return (
    <div className="deals-m space-y-4">
      <div className="bar">
        <div>
          <h1>ดีล</h1>
          <p>พบ {rows.length} ดีล</p>
        </div>
        <div className="tools w-full sm:w-auto">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              paged.setPage(1);
            }}
            placeholder="ค้นหาใบเสนอราคา หรือลูกค้า"
          />
        </div>
      </div>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <TabStrip
            tabs={TABS}
            value={tab}
            counts={counts}
            onChange={(k) => {
              setTab(k);
              paged.setPage(1);
            }}
          />
        </div>

        {/* มือถือ: การ์ดดีลแบบย่อ ปุ่มมีข้อความกำกับให้กดง่าย แทนตารางที่แปลงเป็นการ์ด */}
        <DealCards
          list={paged.list}
          nameOf={nameOf}
          open={open}
          canOpen={canOpen}
          canCancel={canCancel}
          quoHref={quoHref}
          ceo={ceo}
          onToggle={(no) => setOpen((o) => ({ ...o, [no]: !o[no] }))}
          onCancel={setCancelling}
        />

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[900px]">
            <thead>
              <tr>
                {/* แทนเลขที่ดีลด้วยลำดับ นับต่อเนื่องข้ามหน้า (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
                <th style={{ width: 64, textAlign: "center" }}>ลำดับ</th>
                <th style={{ width: "27%" }}>ลูกค้า</th>
                <th style={{ width: 138 }}>อ้างอิงใบเสนอราคา</th>
                <th style={{ width: "17%" }}>ส่งมอบ</th>
                {/* หน่วยอยู่ที่หัวคอลัมน์ ช่องตัวเลขจะได้ไม่ยาวจนตกบรรทัด */}
                <th className="r" style={{ width: "15%" }}>
                  มูลค่าดีล (บาท)
                </th>
                <th style={{ width: 112 }}>สถานะ</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {paged.list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-[50px] text-center text-muted-foreground">
                    ไม่พบดีลที่ตรงกับเงื่อนไข
                  </td>
                </tr>
              ) : (
                paged.list.map((d, i) => {
                  const isOpen = Boolean(open[d.no]) && canOpen(d);
                  return (
                    <Fragment key={d.id}>
                      <tr
                        className={isOpen ? "open" : ""}
                        style={{ cursor: canOpen(d) ? "pointer" : undefined }}
                        onClick={() => canOpen(d) && setOpen((o) => ({ ...o, [d.no]: !o[d.no] }))}
                      >
                        <td data-label="ลำดับ" className="num muted whitespace-nowrap" style={{ textAlign: "center" }}>
                          {paged.from + i + 1}
                        </td>
                        <td data-label="ลูกค้า">
                          <Who name={nameOf.get(d.customerCode) ?? d.customerCode} sub={d.customerCode} />
                        </td>
                        <td data-label="อ้างอิงใบเสนอราคา" className="num muted whitespace-nowrap">
                          {d.quotationNo ? (
                            <Link
                              href={quoHref(d.quotationNo)}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary hover:underline"
                            >
                              {d.quotationNo}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td data-label="ส่งมอบ" className="num muted">
                          {d.delivery ? thaiDate(d.delivery) : "—"}
                        </td>
                        <td data-label="มูลค่าดีล (บาท)" className="r money">
                          {baht(d.total)}
                        </td>
                        <td data-label="สถานะ">
                          <span className={`tag ${DEAL_STATUS[d.status]}`}>
                            <i />
                            {d.status}
                          </span>
                          {/* ฝ่ายขายไม่ต้องเห็นงวดเงิน/ความคืบหน้างาน — เหลือเฉพาะ CEO (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
                          {ceo && <WorkProgress deal={d} />}
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className="flex justify-end gap-1.5">
                            {canCancel(d) && (
                              <button
                                type="button"
                                className="iconbtn glass-thin hover:!border-destructive hover:!text-destructive"
                                data-ceo-hide
                                onClick={() => setCancelling(d.no)}
                                aria-label={`ยกเลิกดีล ${d.no}`}
                                title="ยกเลิกดีล"
                              >
                                <BanIcon className="size-3.5" strokeWidth={2.2} />
                              </button>
                            )}
                          </span>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="sub">
                          <td colSpan={7}>
                            <SubRow deal={d} cus={nameOf.get(d.customerCode) ?? d.customerCode} quoHref={quoHref} />
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
          <span>{paged.range("ดีล")}</span>
          <span className="sum">
            มูลค่ารวมที่กรอง<b>{baht(filteredTotal)}</b> บาท
          </span>
          {/* ไม่มีผลลัพธ์ก็ไม่ต้องแสดงปุ่มแบ่งหน้า ตาม mockup */}
          {paged.list.length > 0 && (
            <Pager page={paged.page} maxPage={paged.maxPage} onChange={paged.setPage} />
          )}
        </div>
      </section>

      {cancelRow && (
        <CancelDealDialog
          dealNo={cancelRow.no}
          cus={nameOf.get(cancelRow.customerCode) ?? cancelRow.customerCode}
          total={cancelRow.total}
          by="ฝ่ายขาย"
          onClose={() => {
            setOpen((o) => ({ ...o, [cancelRow.no]: true }));
            setCancelling(null);
          }}
        />
      )}
    </div>
  );
}

/*
 * ความคืบหน้าของงานใต้สถานะ (ผู้ใช้กำหนด 23 ก.ย. 2569)
 *
 * "ปิดการขาย" คือสถานะของดีล ไม่ใช่สถานะของงาน ฝ่ายขายเป็นคนที่ลูกค้าโทรหา
 * จึงต้องเห็นว่าเก็บเงินไปกี่งวดจากกี่งวด และงานอยู่ขั้นไหน โดยไม่ต้องไปถาม PM หรือบัญชี
 * คิดสดจากสโตร์ของบัญชีกับ PM ผ่าน lib/flow.ts ไม่เก็บสถานะซ้ำ
 * เป็นข้อความอย่างเดียว ไม่ทำเป็นลิงก์ เพราะหน้าปลายทางเป็นหน้าของฝ่ายอื่น
 */
function WorkProgress({ deal, className = "" }: { deal: Deal; className?: string }) {
  const acc = useAcc();
  const pm = usePm();
  /* ดีลที่ยังไม่ปิดการขายยังไม่มีงานให้ติดตาม — เหตุผลอยู่ในรายละเอียดที่กางอยู่แล้ว */
  if (deal.status !== "ปิดการขาย") return null;
  const track = dealTrack(deal.no, acc, pm);
  if (!track) return null;
  const bill = billingOf(deal.no, acc);
  const money = bill && bill.seqs > 0 ? `เก็บเงินแล้ว ${bill.paidSeqs} จาก ${bill.seqs} งวด` : "";
  return (
    <span className={`mt-1 block text-[11.5px] leading-snug text-muted-foreground ${className}`}>
      {[money, track.label].filter(Boolean).join(" · ")}
    </span>
  );
}

/**
 * รายการดีลบนมือถือ (ต้นแบบ deals.html จอ ≤760px) — การ์ดมนแยกใบ: วงกลมตัวย่อ · ชื่อลูกค้ากับมูลค่า
 * · สถานะ · ปุ่มใบเสนอราคา · เส้นประ · วันส่งมอบกับปุ่มไอคอน
 * กดการ์ด = กางเหตุผลยกเลิกและเอกสารของดีลใต้การ์ด (เหมือนกดแถวในตาราง)
 * หน้าตาอยู่ใน styles/mobile/deals.css
 */
function DealCards({
  list,
  nameOf,
  open,
  canOpen,
  canCancel,
  quoHref,
  ceo,
  onToggle,
  onCancel,
}: {
  list: Deal[];
  nameOf: Map<string, string>;
  open: Record<string, boolean>;
  canOpen: (d: Deal) => boolean;
  canCancel: (d: Deal) => boolean;
  quoHref: (no: string) => string;
  ceo: boolean;
  onToggle: (no: string) => void;
  onCancel: (no: string) => void;
}) {
  if (!list.length) {
    return <p className="px-5 py-12 text-center text-muted-foreground md:hidden">ไม่พบดีลที่ตรงกับเงื่อนไข</p>;
  }
  return (
    <ul className="dl-rows md:hidden">
      {list.map((d) => {
        const can = canOpen(d);
        const isOpen = Boolean(open[d.no]) && can;
        const name = nameOf.get(d.customerCode) ?? d.customerCode;
        return (
          <li
            key={d.id}
            className="dl-card"
            style={{ cursor: can ? "pointer" : undefined }}
            aria-expanded={can ? isOpen : undefined}
            onClick={() => can && onToggle(d.no)}
          >
            <span className="dl-av" aria-hidden>
              {initials(name)}
            </span>
            <b className="dl-cus">{name}</b>
            <span className="dl-amt num">{baht(d.total)} ฿</span>
            {/* ไม่แสดงเลขที่ดีลบนการ์ด (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
            <span className={`dl-st tag ${DEAL_STATUS[d.status]}`}>
              <i />
              {d.status}
            </span>
            {/* ฝ่ายขายไม่ต้องเห็นงวดเงิน/ความคืบหน้างาน — เหลือเฉพาะ CEO (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
            {ceo && (
              <span className="dl-pg">
                <WorkProgress deal={d} />
              </span>
            )}
            <span className="dl-quo">
              {d.quotationNo ? (
                <Link href={quoHref(d.quotationNo)} className="num" onClick={(e) => e.stopPropagation()}>
                  {d.quotationNo}
                </Link>
              ) : (
                <span>ไม่มีใบเสนอราคา</span>
              )}
            </span>
            <span className="dl-deli num">
              <CalendarIcon strokeWidth={2} />
              ส่งมอบ {d.delivery ? thaiDate(d.delivery) : "—"}
            </span>
            <span className="dl-act" onClick={(e) => e.stopPropagation()}>
              {canCancel(d) && (
                <button
                  type="button"
                  className="iconbtn glass-thin hover:!border-destructive hover:!text-destructive"
                  data-ceo-hide
                  onClick={() => onCancel(d.no)}
                  aria-label={`ยกเลิกดีล ${d.no}`}
                  title="ยกเลิกดีล"
                >
                  <BanIcon className="size-4" strokeWidth={2.2} />
                </button>
              )}
            </span>
            {isOpen && (
              <div className="dl-sub" onClick={(e) => e.stopPropagation()}>
                <SubCard deal={d} cus={name} quoHref={quoHref} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/*
 * เอกสารของดีล (ผู้ใช้สั่ง 9 ต.ค. 2569) — ดูอย่างเดียว
 * ใบเสนอราคาทุกฉบับในสายเดียวกัน (ใบที่ปิดดีล + ฉบับก่อนหน้าที่ถูกแทนที่ ตาม replaces)
 * และข้อเสนอจากทีมก่อนการขายของคำขอที่ใบเหล่านั้นอ้างถึง (ps) · ไม่แสดงสัญญาแล้ว
 */
type DealDocs = {
  /** ใหม่สุดก่อน · ver = ฉบับที่ */
  quos: { q: Quotation; ver: number }[];
  rounds: { req: PresalesRequest; r: PresalesRound }[];
};

function useDealDocs(d: Deal): DealDocs {
  const crm = useCrm();
  return useMemo(() => {
    const byNo = new Map(crm.quotations.map((q) => [q.no, q]));
    const chain: Quotation[] = [];
    let cur = d.quotationNo ? byNo.get(d.quotationNo) : undefined;
    while (cur && chain.length < 20) {
      chain.unshift(cur);
      cur = cur.replaces ? byNo.get(cur.replaces) : undefined;
    }
    const quos = chain.map((q, i) => ({ q, ver: i + 1 })).reverse();
    const psNos = [...new Set(chain.map((q) => q.ps).filter((x): x is string => Boolean(x)))];
    const rounds = psNos.flatMap((no) => {
      const req = crm.presales.find((r) => r.no === no);
      if (!req) return [];
      return crm.presalesRounds
        .filter((r) => r.requestNo === no)
        .sort((a, b) => b.round - a.round)
        .map((r) => ({ req, r }));
    });
    return { quos, rounds };
  }, [crm.quotations, crm.presales, crm.presalesRounds, d.quotationNo]);
}

/** ปุ่มเปิดข้อเสนอ — PDF เปิดกล่องเอกสาร · Canva เปิดลิงก์ในแท็บใหม่ */
function ProposalOpen({ r, onOpen }: { r: PresalesRound; onOpen: () => void }) {
  const cls = "inline-flex max-w-full items-center gap-1.5 font-semibold text-primary hover:underline";
  if (isCanva(r)) {
    return (
      <a href={r.url} target="_blank" rel="noopener noreferrer" className={cls}>
        <LinkIcon className="size-3.5 shrink-0" strokeWidth={2} />
        <span className="truncate">{r.file}</span>
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={onOpen}>
      <FileIcon className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="truncate">{r.file}</span>
    </button>
  );
}

/** เหตุผลที่ยกเลิก/ไม่ตกลง — ใช้ทั้งแถวในตารางและการ์ดมือถือ */
function CancelInfo({ deal: d, card = false }: { deal: Deal; card?: boolean }) {
  if (d.status === "ปิดการขาย") return null;
  return (
    <dl className={card ? "grid grid-cols-2 gap-x-4 gap-y-2.5" : "mt-1.5 mb-1 flex flex-wrap gap-x-7 gap-y-2.5"}>
      {d.status === "ยกเลิก" && (
        <>
          <Cx k="ยกเลิกเมื่อ" v={d.cancelled ? thaiDate(d.cancelled.at.slice(0, 10)) : "—"} />
          <Cx k="ยกเลิกโดย" v={d.cancelled?.by || "—"} />
        </>
      )}
      <div className={card ? "col-span-2" : ""}>
        <Cx k="เหตุผล" v={d.cancelled?.why || d.lostReason || "—"} />
      </div>
    </dl>
  );
}

/** รายละเอียดที่กางในการ์ดมือถือ — ข้อมูลเดียวกับ SubRow แต่เรียงลงเป็นแถว ไม่ต้องเลื่อนตารางด้านข้าง */
function SubCard({ deal: d, cus, quoHref }: { deal: Deal; cus: string; quoHref: (no: string) => string }) {
  const { quos, rounds } = useDealDocs(d);
  const [doc, setDoc] = useState<{ req: PresalesRequest; r: PresalesRound } | null>(null);
  return (
    <div className="mt-2 space-y-3 rounded-[10px] border border-border px-3.5 py-3">
      <CancelInfo deal={d} card />
      {quos.length > 0 && (
        <div>
          <p className="text-[11.5px] font-semibold text-muted-foreground">ใบเสนอราคา</p>
          <ul className="mt-1.5 divide-y divide-border">
            {quos.map(({ q, ver }) => (
              <li key={q.id} className="py-2 text-[12.5px]">
                <div className="flex items-start justify-between gap-2">
                  <Link href={quoHref(q.no)} className="num font-semibold text-primary hover:underline">
                    {q.no}
                  </Link>
                  <span className="num shrink-0 font-semibold">{baht(quotationTotals(q).grand)} ฿</span>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  ฉบับที่ {ver} · ออก {q.issued ? thaiDate(q.issued) : "—"}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rounds.length > 0 && (
        <div>
          <p className="text-[11.5px] font-semibold text-muted-foreground">ข้อเสนอ</p>
          <ul className="mt-1.5 divide-y divide-border">
            {rounds.map(({ req, r }) => (
              <li key={r.id} className="py-2 text-[12.5px]">
                <ProposalOpen r={r} onOpen={() => setDoc({ req, r })} />
                <p className="mt-0.5 text-muted-foreground">
                  {req.no} รอบ {r.round} · {thaiDate(r.at)} · {r.by}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
      {doc && <ProposalDialog request={doc.req} round={doc.r} customerName={cus} onClose={() => setDoc(null)} />}
    </div>
  );
}

/** รายละเอียดใต้แถว — เหตุผลที่ยกเลิก/ไม่ตกลง แล้วตามด้วยใบเสนอราคาทุกฉบับและข้อเสนอ */
function SubRow({ deal: d, cus, quoHref }: { deal: Deal; cus: string; quoHref: (no: string) => string }) {
  const { quos, rounds } = useDealDocs(d);
  const [doc, setDoc] = useState<{ req: PresalesRequest; r: PresalesRound } | null>(null);
  return (
    <div className="subwrap">
      <CancelInfo deal={d} />
      {quos.length > 0 && (
        <>
          <p className="subttl">ใบเสนอราคา</p>
          <table className="inner">
            <thead>
              <tr>
                <th>เลขที่</th>
                <th>ฉบับที่</th>
                <th>วันที่ออก</th>
                <th className="r">ยอดรวม (บาท)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {quos.map(({ q, ver }) => (
                <tr key={q.id}>
                  <td className="num font-semibold">{q.no}</td>
                  <td className="num">{ver}</td>
                  <td className="num whitespace-nowrap">{q.issued ? thaiDate(q.issued) : "—"}</td>
                  <td className="r money">{baht(quotationTotals(q).grand)}</td>
                  <td className="r">
                    <Link href={quoHref(q.no)} className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline">
                      <EyeIcon className="size-3.5" strokeWidth={2} />
                      ดู
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {rounds.length > 0 && (
        <>
          <p className="subttl">ข้อเสนอ</p>
          <table className="inner">
            <thead>
              <tr>
                <th>ไฟล์</th>
                <th>คำขอ</th>
                <th>รอบ</th>
                <th>วันที่</th>
                <th>ผู้จัดทำ</th>
              </tr>
            </thead>
            <tbody>
              {rounds.map(({ req, r }) => (
                <tr key={r.id}>
                  <td>
                    <ProposalOpen r={r} onOpen={() => setDoc({ req, r })} />
                  </td>
                  <td className="num whitespace-nowrap">{req.no}</td>
                  <td className="num">{r.round}</td>
                  <td className="num whitespace-nowrap">{thaiDate(r.at)}</td>
                  <td className="whitespace-nowrap">{r.by}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {doc && <ProposalDialog request={doc.req} round={doc.r} customerName={cus} onClose={() => setDoc(null)} />}
    </div>
  );
}

function Cx({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11.5px] font-semibold text-muted-foreground">{k}</dt>
      <dd className="mt-0.5 text-[13.5px]">{v}</dd>
    </div>
  );
}
