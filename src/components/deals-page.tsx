"use client";

/*
 * ดีล (ต้นแบบ dose-erp-maz/ceo-deals.html) — ใช้ทั้งฝ่ายขาย (/deals) และ CEO ดูอย่างเดียว (/ceo/deals)
 *
 * ใบงานย้ายไปเป็นโปรเจคในระบบ PM แล้ว หน้านี้จึงเหลือเหตุผลตอนยกเลิกดีล และเอกสารของดีล
 * กดแถว/การ์ด = ไปหน้ารายละเอียดดีล (deal-detail-page) ไม่กางใต้แถวแล้ว (ผู้ใช้สั่ง 15 ต.ค. 2569)
 *   ฝ่ายขาย /deals/<เลขที่ดีล> · CEO /ceo/sales/deals/<เลขที่ดีล> (อยู่ใต้ /ceo/sales จึงเป็นหน้าของ CEO เอง)
 * ไม่แสดง/ไม่แนบสัญญาที่หน้านี้แล้ว ข้อมูลสัญญาเดิมยังอยู่ในสโตร์ (ผู้ใช้สั่ง 9 ต.ค. 2569)
 * ใบสัญญากลับมาแล้ว แต่เป็นสัญญาที่ระบบออกให้เท่านั้น (contract-store) ไม่ใช่ไฟล์ที่เคยแนบ
 * ปุ่ม "ออกใบสัญญา" เฉพาะฝ่ายขาย หลังลูกค้าชำระงวดแรก · คนอื่นเห็น "ดูใบสัญญา" (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * ปุ่มท้ายแถว: ยกเลิกดีล (เฉพาะก่อนลูกค้าจ่ายเงิน) · มุมมอง CEO ซ่อนด้วย data-ceo-hide
 * และเลขใบเสนอราคาพาไปหน้าเอกสารของ CEO เอง
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFindParam } from "@/lib/deep-link";
import { DEAL_STATUS, type Deal, type DealStatus } from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { dealPaid, useAcc } from "@/lib/acc-store";
import { billingOf, dealTrack } from "@/lib/flow";
import { usePm } from "@/lib/pm-store";
import { baht, initials, thaiDate } from "@/lib/format";
import { BanIcon, CalendarIcon, ChevronRightIcon, FileIcon } from "./icons";
import { CancelDealDialog } from "./cancel-deal-dialog";
import { Pager, SearchBox, TabStrip, Who, usePaged } from "./sales-ui";
import { stackNo } from "@/lib/stack-no";
import { contractsOf, useContracts } from "@/lib/contract-store";
import { useRole } from "@/lib/role";
import "@/styles/mobile/deals.css";

/** ที่อยู่หน้ารายการดีลและหน้ารายละเอียดดีลของแต่ละฝั่ง (ผู้ใช้สั่ง 15 ต.ค. 2569) */
export const dealsHref = (ceo: boolean) => (ceo ? "/ceo/deals" : "/deals");
export const dealHref = (no: string, ceo: boolean) =>
  ceo ? `/ceo/sales/deals/${encodeURIComponent(no)}` : `/deals/${encodeURIComponent(no)}`;

/** ที่อยู่หน้าใบสัญญาของแต่ละฝั่ง — CEO อยู่ใต้ /ceo/sales (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export const contractHref = (no: string, ceo: boolean) =>
  ceo ? `/ceo/sales/contracts/${encodeURIComponent(no)}` : `/deals/${encodeURIComponent(no)}/contract`;

/**
 * ปุ่มใบสัญญาท้ายแถว/การ์ด (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * มีสัญญาแล้ว → ดูใบสัญญา (ทุกคนที่เปิดหน้านี้ได้) · ยังไม่มี → ออกใบสัญญา เฉพาะฝ่ายขาย
 * ลูกค้ายังไม่ชำระงวดแรก → ปุ่มกดไม่ได้ บอกเหตุผลว่ายังไม่ได้รับเงินงวดแรก
 */
export function ContractAction({ deal: d, ceo }: { deal: Deal; ceo: boolean }) {
  const all = useContracts();
  const acc = useAcc();
  const role = useRole();
  const has = contractsOf(all, d.no).length > 0;
  const cls = "btn glass-thin btn-mini whitespace-nowrap";
  if (has) {
    return (
      <Link href={contractHref(d.no, ceo)} className={cls}>
        <FileIcon className="size-3.5" strokeWidth={2} />
        ดูใบสัญญา
      </Link>
    );
  }
  if (ceo || role !== "sales" || d.status !== "ปิดการขาย") return null;
  if (!dealPaid(acc, d.no)) {
    return (
      <button type="button" className={cls} disabled title="ยังไม่ได้รับเงินงวดแรก" aria-label="ออกใบสัญญา — ยังไม่ได้รับเงินงวดแรก">
        <FileIcon className="size-3.5" strokeWidth={2} />
        ออกใบสัญญา
      </button>
    );
  }
  return (
    <Link href={contractHref(d.no, ceo)} className={cls}>
      <FileIcon className="size-3.5" strokeWidth={2} />
      ออกใบสัญญา
    </Link>
  );
}

/** บอกฝ่ายขายว่าทำไมยังออกใบสัญญาไม่ได้ — ลูกค้ายังไม่ชำระงวดแรก (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function ContractHint({ deal: d, ceo }: { deal: Deal; ceo: boolean }) {
  const all = useContracts();
  const acc = useAcc();
  const role = useRole();
  if (ceo || role !== "sales" || d.status !== "ปิดการขาย" || dealPaid(acc, d.no)) return null;
  if (contractsOf(all, d.no).length) return null;
  return <p className="text-[12.5px] text-[var(--warning)]">ยังไม่ได้รับเงินงวดแรก — ออกใบสัญญาได้หลังลูกค้าชำระงวดแรก</p>;
}

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
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("all");
  /* ลิงก์จากหน้าอื่นเจาะมาที่ดีลเดียวได้ด้วย ?find=<เลขที่> */
  const find = useFindParam();
  /* เลขที่ดีลจากลิงก์ใช้กรองเงียบ ๆ ไม่ใส่ลงช่องค้นหา — ห้ามโชว์รหัสบนจอ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const [pin, setPin] = useState(find);
  const [query, setQuery] = useState("");
  /* ลิงก์เดิมที่เจาะดีลเดียว (?find=<เลขที่ดีล> เช่นจากการแจ้งเตือน) เคยกางแถวนั้น — ตอนนี้พาไปหน้ารายละเอียดดีลแทน
     ?find=<รหัสลูกค้า> ยังกรองรายการเหมือนเดิม (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const exact = Boolean(find) && crm.deals.some((d) => d.no === find);
  useEffect(() => {
    if (exact) router.replace(dealHref(find, ceo));
  }, [exact, find, ceo, router]);
  const [cancelling, setCancelling] = useState<string | null>(null);

  const nameOf = useMemo(() => new Map(crm.customers.map((c) => [c.code, c.name])), [crm.customers]);

  /* ลำดับแบบกองซ้อน — นับจากดีลทั้งหมดตามวันปิดการขาย ใหม่สุดเลขมากสุดอยู่บน (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  const noOf = useMemo(() => stackNo(crm.deals, (d) => d.closedAt, (d) => d.no), [crm.deals]);

  const scoped = useMemo(() => {
    const q = (query.trim() || pin).toLowerCase();
    return crm.deals
      .filter((d) => {
        if (!q) return true;
        const name = nameOf.get(d.customerCode) ?? "";
        return `${d.no} ${name} ${d.customerCode} ${d.quotationNo}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (noOf.get(b.no) ?? 0) - (noOf.get(a.no) ?? 0));
  }, [crm.deals, query, pin, nameOf, noOf]);

  const rows = tab === "all" ? scoped : scoped.filter((d) => d.status === tab);
  const paged = usePaged(rows, PER_PAGE);

  const counts: Record<string, number> = { all: scoped.length };
  for (const t of TABS.slice(1)) counts[t.key] = scoped.filter((d) => d.status === t.key).length;

  /* ยอดท้ายตารางสรุปตามสิ่งที่กรองอยู่ตรงหน้า จะได้ตรงกับตัวเลขที่เห็นในตาราง */
  const filteredTotal = rows.reduce((sum, d) => sum + d.total, 0);

  /* ยกเลิกได้ที่หน้านี้เฉพาะดีลที่ยังไม่รับเงิน — รับเงินแล้วต้องให้ฝ่ายบัญชียกเลิกที่หน้าวางบิล */
  const canCancel = (d: Deal) => d.status === "ปิดการขาย" && !dealPaid(acc, d.no);
  /* กดแถว/การ์ด = ไปหน้ารายละเอียดดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const openDeal = (no: string) => router.push(dealHref(no, ceo));
  const quoHref = (no: string) =>
    ceo ? `/ceo/sales/quotations/${encodeURIComponent(no)}` : `/quotations/${encodeURIComponent(no)}`;

  const cancelRow = cancelling ? crm.deals.find((d) => d.no === cancelling) : undefined;

  return (
    <div className="deals-m space-y-4">
      <div className="bar">
        <div>
          <h1>ดีล</h1>
          <p>
            พบ {rows.length} ดีล
            {pin && !query && (
              <button type="button" className="ml-2 font-semibold text-primary hover:underline" onClick={() => setPin("")}>
                ดูทั้งหมด
              </button>
            )}
          </p>
        </div>
        <div className="tools w-full sm:w-auto">
          <SearchBox
            value={query}
            onChange={(v) => {
              setQuery(v);
              setPin("");
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
          canCancel={canCancel}
          quoHref={quoHref}
          ceo={ceo}
          onOpen={openDeal}
          onCancel={setCancelling}
        />

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-md:hidden">
          <table className="data-table cards-sm min-w-[900px]">
            <thead>
              <tr>
                {/* แทนเลขที่ดีลด้วยลำดับ (ผู้ใช้สั่ง 9 ต.ค. 2569) · เปลี่ยนเป็นเลขแบบกองซ้อน ใหม่สุดเลขมากสุด (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
                <th style={{ width: 64, textAlign: "center" }}>ลำดับ</th>
                <th style={{ width: "27%" }}>ลูกค้า</th>
                <th style={{ width: 138 }}>อ้างอิงใบเสนอราคา</th>
                <th style={{ width: "17%" }}>ส่งมอบ</th>
                {/* หน่วยอยู่ที่หัวคอลัมน์ ช่องตัวเลขจะได้ไม่ยาวจนตกบรรทัด */}
                <th className="r" style={{ width: "15%" }}>
                  มูลค่าดีล (บาท)
                </th>
                <th style={{ width: 112 }}>สถานะ</th>
                <th style={{ width: 150 }} />
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
                  return (
                      <tr key={d.id} style={{ cursor: "pointer" }} onClick={() => openDeal(d.no)}>
                        <td data-label="ลำดับ" className="num muted whitespace-nowrap" style={{ textAlign: "center" }}>
                          {noOf.get(d.no)}
                        </td>
                        <td data-label="ลูกค้า">
                          <Who name={nameOf.get(d.customerCode) ?? "—"} />
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
                            {/* ปุ่มใบสัญญา (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
                            <ContractAction deal={d} ceo={ceo} />
                            {canCancel(d) && (
                              <button
                                type="button"
                                className="iconbtn glass-thin hover:!border-destructive hover:!text-destructive"
                                data-ceo-hide
                                onClick={() => setCancelling(d.no)}
                                aria-label={`ยกเลิกดีล ${nameOf.get(d.customerCode) ?? ""}`}
                                title="ยกเลิกดีล"
                              >
                                <BanIcon className="size-3.5" strokeWidth={2.2} />
                              </button>
                            )}
                            {/* ปุ่มเปิดหน้ารายละเอียดดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
                            <Link
                              href={dealHref(d.no, ceo)}
                              className="iconbtn glass-thin"
                              aria-label={`เปิดดีล ${nameOf.get(d.customerCode) ?? ""}`}
                              title="เปิดดีล"
                            >
                              <ChevronRightIcon className="size-3.5" strokeWidth={2.2} />
                            </Link>
                          </span>
                        </td>
                      </tr>
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
          cus={nameOf.get(cancelRow.customerCode) ?? "—"}
          total={cancelRow.total}
          by="ฝ่ายขาย"
          onClose={() => setCancelling(null)}
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
export function WorkProgress({ deal, className = "" }: { deal: Deal; className?: string }) {
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
 * กดการ์ด = ไปหน้ารายละเอียดดีล เหมือนกดแถวในตาราง (ผู้ใช้สั่ง 15 ต.ค. 2569)
 * หน้าตาอยู่ใน styles/mobile/deals.css
 */
function DealCards({
  list,
  nameOf,
  canCancel,
  quoHref,
  ceo,
  onOpen,
  onCancel,
}: {
  list: Deal[];
  nameOf: Map<string, string>;
  canCancel: (d: Deal) => boolean;
  quoHref: (no: string) => string;
  ceo: boolean;
  onOpen: (no: string) => void;
  onCancel: (no: string) => void;
}) {
  if (!list.length) {
    return <p className="px-5 py-12 text-center text-muted-foreground md:hidden">ไม่พบดีลที่ตรงกับเงื่อนไข</p>;
  }
  return (
    <ul className="dl-rows md:hidden">
      {list.map((d) => {
        const name = nameOf.get(d.customerCode) ?? "—";
        return (
          <li
            key={d.id}
            className="dl-card"
            style={{ cursor: "pointer" }}
            role="link"
            tabIndex={0}
            aria-label={`เปิดดีล ${name}`}
            onClick={() => onOpen(d.no)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target === e.currentTarget) onOpen(d.no);
            }}
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
              <ContractAction deal={d} ceo={ceo} />
              {canCancel(d) && (
                <button
                  type="button"
                  className="iconbtn glass-thin hover:!border-destructive hover:!text-destructive"
                  data-ceo-hide
                  onClick={() => onCancel(d.no)}
                  aria-label={`ยกเลิกดีล ${name}`}
                  title="ยกเลิกดีล"
                >
                  <BanIcon className="size-4" strokeWidth={2.2} />
                </button>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
