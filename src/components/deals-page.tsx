"use client";

/*
 * ดีล (ต้นแบบ dose-erp-maz/ceo-deals.html) — ใช้ทั้งฝ่ายขาย (/deals) และ CEO ดูอย่างเดียว (/ceo/deals)
 *
 * ใบงานย้ายไปเป็นโปรเจคในระบบ PM แล้ว หน้านี้จึงเหลือเฉพาะเหตุผลตอนยกเลิกดีล และสัญญาที่แนบไว้
 * กดแถวที่ยกเลิกหรือมีสัญญา = กางรายละเอียดใต้แถว · กดเลขใบเสนอราคา = เปิดเอกสาร
 * ปุ่มท้ายแถว: แนบสัญญา (ฝ่ายขายแนบ แนบเพิ่มได้ตลอด ลบไม่ได้) · ยกเลิกดีล (เฉพาะก่อนลูกค้าจ่ายเงิน)
 * มุมมอง CEO ซ่อนเฉพาะปุ่มยกเลิกดีลด้วย data-ceo-hide — ปุ่มแนบสัญญายังอยู่ตามต้นแบบ ceo-deals.html
 * (ซ่อนแค่ data-cxl) และเลขใบเสนอราคาพาไปหน้าเอกสารของ CEO เอง
 */

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import { useFindParam } from "@/lib/deep-link";
import { DEAL_STATUS, type Deal, type DealStatus } from "@/lib/crm-data";
import { attachContract, useCrm } from "@/lib/crm-store";
import { dealPaid, useAcc } from "@/lib/acc-store";
import { billingOf, dealTrack } from "@/lib/flow";
import { usePm } from "@/lib/pm-store";
import { baht, initials, thaiDate, todayIso } from "@/lib/format";
import { USERS } from "@/lib/mock-data";
import { useRole } from "@/lib/role";
import { BanIcon, CalendarIcon, PaperclipIcon } from "./icons";
import { CancelDealDialog } from "./cancel-deal-dialog";
import { Sheet } from "./lead-dialogs";
import { Pager, SearchBox, TabStrip, Who, usePaged } from "./sales-ui";
import { ThaiDatePicker } from "./thai-date-picker";
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
  const [attaching, setAttaching] = useState<string | null>(null);

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
  /* กางได้เฉพาะแถวที่มีอะไรให้ดู — ยกเลิก/ไม่ตกลง (เหตุผล) หรือมีสัญญา */
  const canOpen = (d: Deal) => d.status !== "ปิดการขาย" || (d.contracts?.length ?? 0) > 0;
  const quoHref = (no: string) =>
    ceo ? `/ceo/sales/quotations/${encodeURIComponent(no)}` : `/quotations/${encodeURIComponent(no)}`;

  const cancelRow = cancelling ? crm.deals.find((d) => d.no === cancelling) : undefined;
  const attachRow = attaching ? crm.deals.find((d) => d.no === attaching) : undefined;

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
            placeholder="ค้นหาเลขที่ดีล ใบเสนอราคา หรือลูกค้า"
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
          onToggle={(no) => setOpen((o) => ({ ...o, [no]: !o[no] }))}
          onAttach={setAttaching}
          onCancel={setCancelling}
        />

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[900px]">
            <thead>
              <tr>
                <th style={{ width: 140 }}>เลขที่ดีล</th>
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
                paged.list.map((d) => {
                  const cons = d.contracts ?? [];
                  const isOpen = Boolean(open[d.no]) && canOpen(d);
                  return (
                    <Fragment key={d.id}>
                      <tr
                        className={isOpen ? "open" : ""}
                        style={{ cursor: canOpen(d) ? "pointer" : undefined }}
                        onClick={() => canOpen(d) && setOpen((o) => ({ ...o, [d.no]: !o[d.no] }))}
                      >
                        <td data-label="เลขที่ดีล" className="num muted whitespace-nowrap">
                          {d.no}
                          {cons.length > 0 && (
                            <span className="mt-[3px] block text-[11.5px] text-muted-foreground">
                              มีสัญญา {cons.length} ฉบับ
                            </span>
                          )}
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
                          <WorkProgress deal={d} />
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <span className="flex justify-end gap-1.5">
                            {/* ตามต้นแบบ deals.html — แนบสัญญาได้ทุกแถว รวมดีลที่ยกเลิกแล้ว (เก็บเป็นหลักฐาน) */}
                            <button
                              type="button"
                              className="iconbtn glass-thin"
                              onClick={() => setAttaching(d.no)}
                              aria-label={`แนบสัญญา ${d.no}`}
                              title="แนบสัญญา"
                            >
                              <PaperclipIcon className="size-3.5" strokeWidth={2} />
                            </button>
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
                            <SubRow deal={d} />
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
      {attachRow && (
        <ContractDialog
          deal={attachRow}
          cus={nameOf.get(attachRow.customerCode) ?? attachRow.customerCode}
          onClose={() => setAttaching(null)}
          onDone={() => {
            setOpen((o) => ({ ...o, [attachRow.no]: true }));
            setAttaching(null);
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
 * · เลขที่ดีลกับสถานะ · ปุ่มใบเสนอราคา · เส้นประ · วันส่งมอบกับปุ่มไอคอน
 * กดการ์ดที่ยกเลิกหรือมีสัญญา = กางรายละเอียดใต้การ์ด (เหมือนกดแถวในตาราง)
 * หน้าตาอยู่ใน styles/mobile/deals.css
 */
function DealCards({
  list,
  nameOf,
  open,
  canOpen,
  canCancel,
  quoHref,
  onToggle,
  onAttach,
  onCancel,
}: {
  list: Deal[];
  nameOf: Map<string, string>;
  open: Record<string, boolean>;
  canOpen: (d: Deal) => boolean;
  canCancel: (d: Deal) => boolean;
  quoHref: (no: string) => string;
  onToggle: (no: string) => void;
  onAttach: (no: string) => void;
  onCancel: (no: string) => void;
}) {
  if (!list.length) {
    return <p className="px-5 py-12 text-center text-muted-foreground md:hidden">ไม่พบดีลที่ตรงกับเงื่อนไข</p>;
  }
  return (
    <ul className="dl-rows md:hidden">
      {list.map((d) => {
        const cons = d.contracts ?? [];
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
            <span className="dl-no num">
              {d.no}
              {cons.length > 0 && <span className="dl-has">มีสัญญา {cons.length} ฉบับ</span>}
            </span>
            <span className={`dl-st tag ${DEAL_STATUS[d.status]}`}>
              <i />
              {d.status}
            </span>
            <span className="dl-pg">
              <WorkProgress deal={d} />
            </span>
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
              {/* แนบสัญญาได้ทุกดีล รวมดีลที่ยกเลิกแล้ว (เก็บเป็นหลักฐาน) */}
              <button
                type="button"
                className="iconbtn glass-thin"
                onClick={() => onAttach(d.no)}
                aria-label={`แนบสัญญา ${d.no}`}
                title="แนบสัญญา"
              >
                <PaperclipIcon className="size-4" strokeWidth={2} />
              </button>
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
                <SubCard deal={d} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** รายละเอียดที่กางในการ์ดมือถือ — ข้อมูลเดียวกับ SubRow แต่เรียงลงเป็นแถว ไม่ต้องเลื่อนตารางด้านข้าง */
function SubCard({ deal: d }: { deal: Deal }) {
  const cons = d.contracts ?? [];
  return (
    <div className="mt-2 space-y-3 rounded-[10px] border border-border px-3.5 py-3">
      {d.status !== "ปิดการขาย" && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
          {d.status === "ยกเลิก" && (
            <>
              <Cx k="ยกเลิกเมื่อ" v={d.cancelled ? thaiDate(d.cancelled.at.slice(0, 10)) : "—"} />
              <Cx k="ยกเลิกโดย" v={d.cancelled?.by || "—"} />
            </>
          )}
          <div className="col-span-2">
            <Cx k="เหตุผล" v={d.cancelled?.why || d.lostReason || "—"} />
          </div>
        </dl>
      )}
      {cons.length > 0 && (
        <div>
          <p className="text-[11.5px] font-semibold text-muted-foreground">สัญญา</p>
          <ul className="mt-1.5 divide-y divide-border">
            {cons.map((c, i) => (
              <li key={i} className="py-2 text-[12.5px]">
                <div className="flex items-start justify-between gap-2">
                  <b className="min-w-0 font-semibold break-all">{c.name}</b>
                  <span className="inline-flex h-[22px] shrink-0 items-center rounded-full bg-[#f1f2f5] px-[9px] text-[11.5px] font-semibold text-[#6b7280]">
                    {c.kind === "link" ? "ลิงก์" : "ไฟล์ PDF"}
                  </span>
                </div>
                <p className="mt-0.5 text-muted-foreground">
                  {c.no || "ไม่ได้ระบุเลขที่"} · เซ็น {c.signed ? thaiDate(c.signed) : "—"}
                </p>
                <p className="text-muted-foreground">
                  แนบโดย {c.by} {thaiDate(c.at)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** รายละเอียดใต้แถว — เหตุผลที่ยกเลิก/ไม่ตกลง แล้วตามด้วยสัญญาที่แนบไว้ */
function SubRow({ deal: d }: { deal: Deal }) {
  const cons = d.contracts ?? [];
  return (
    <div className="subwrap">
      {d.status !== "ปิดการขาย" && (
        <dl className="mt-1.5 mb-1 flex flex-wrap gap-x-7 gap-y-2.5">
          {d.status === "ยกเลิก" && (
            <>
              <Cx k="ยกเลิกเมื่อ" v={d.cancelled ? thaiDate(d.cancelled.at.slice(0, 10)) : "—"} />
              <Cx k="ยกเลิกโดย" v={d.cancelled?.by || "—"} />
            </>
          )}
          <Cx k="เหตุผล" v={d.cancelled?.why || d.lostReason || "—"} />
        </dl>
      )}
      {cons.length > 0 && (
        <>
          <p className="subttl">สัญญา</p>
          <table className="inner">
            <tbody>
              {cons.map((c, i) => (
                <tr key={i}>
                  <td>
                    <b className="block font-semibold">{c.name}</b>
                    <span className="block text-[11.5px] text-muted-foreground">
                      {c.no || "ไม่ได้ระบุเลขที่"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap">เซ็น {c.signed ? thaiDate(c.signed) : "—"}</td>
                  <td className="whitespace-nowrap">
                    แนบโดย {c.by} {thaiDate(c.at)}
                  </td>
                  <td className="c">
                    <span className="inline-flex h-[22px] items-center rounded-full bg-[#f1f2f5] px-[9px] text-[11.5px] font-semibold text-[#6b7280]">
                      {c.kind === "link" ? "ลิงก์" : "ไฟล์ PDF"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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

/** แนบสัญญา — ต้องมีชื่อไฟล์หรือลิงก์อย่างใดอย่างหนึ่ง เลขที่และวันที่เซ็นไม่บังคับ */
function ContractDialog({
  deal,
  cus,
  onClose,
  onDone,
}: {
  deal: Deal;
  cus: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const role = useRole();
  const [no, setNo] = useState("");
  const [signed, setSigned] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [pick, setPick] = useState(false);
  const [warn, setWarn] = useState(false);
  const today = todayIso();

  function save() {
    const n = name.trim();
    const u = url.trim();
    if (!n && !u) return setWarn(true);
    attachContract(deal.no, {
      no: no.trim(),
      signed,
      kind: u ? "link" : "pdf",
      name: u || n,
      url: u,
      by: USERS[role].name,
      at: today,
    });
    onDone();
  }

  const input = "field-control h-[38px] w-full rounded-[10px] px-3 text-[13.5px]";
  const lb = "mt-3.5 mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";

  return (
    <Sheet
      title="แนบสัญญา"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            แนบสัญญา
          </button>
        </>
      }
    >
      <dl className="grid gap-2 text-[13.5px] sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-x-4">
        <dt className="text-[12.5px] font-semibold text-muted-foreground">ลูกค้า</dt>
        <dd className="font-semibold">{cus}</dd>
        <dt className="text-[12.5px] font-semibold text-muted-foreground">ใบเสนอราคา</dt>
        <dd className="num font-semibold">{deal.quotationNo || "—"}</dd>
      </dl>
      <label className={lb} htmlFor="con-no">
        เลขที่สัญญาของคู่สัญญา
      </label>
      <input
        id="con-no"
        className={input}
        value={no}
        onChange={(e) => setNo(e.target.value)}
        placeholder="เช่น CT-2569-0014"
      />
      <span className={lb}>วันที่เซ็น</span>
      <ThaiDatePicker
        value={signed}
        max={today}
        open={pick}
        label="วันที่เซ็น"
        clearable
        onToggle={() => setPick((v) => !v)}
        onPick={(iso) => {
          setSigned(iso);
          setPick(false);
        }}
      />
      <label className={lb} htmlFor="con-name">
        ชื่อไฟล์สัญญา
      </label>
      <input
        id="con-name"
        className={input}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setWarn(false);
        }}
        placeholder="เช่น contract-siamplastic.pdf"
      />
      <label className={lb} htmlFor="con-url">
        หรือลิงก์สัญญา
      </label>
      <input
        id="con-url"
        type="url"
        className={input}
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setWarn(false);
        }}
        placeholder="https://"
      />
      {warn && <p className="mt-1.5 text-[12.5px] text-destructive">ใส่ชื่อไฟล์หรือลิงก์อย่างใดอย่างหนึ่ง</p>}
    </Sheet>
  );
}
