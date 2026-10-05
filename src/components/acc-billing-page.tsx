"use client";

/*
 * วางบิล — ต้นแบบ dose-erp-maz/billing.html
 *
 * รอวางบิล: ดีลที่ยังมีงวดไม่ได้ออกใบแจ้งหนี้ (หรือยังไม่แบ่งงวด) · กดแถวเพื่อกางงวดที่รอออกใบ
 * ใบแจ้งหนี้: เฉพาะใบที่ยังไม่ชำระ (ชำระ = ออกใบเสร็จแล้วที่หน้าใบเสร็จ AC-BR-05) · กดแถวเปิดเอกสาร
 * ค้างชำระ: ใบที่เลยวันครบกำหนด พร้อมบันทึกการติดตามหนี้
 */

import { ADD_VALUE, useAddOption } from "./add-option";
import { optionsOf } from "@/lib/options";
import { Fragment, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { AccDeal, Installment, Invoice } from "@/lib/acc-data";
import { INVOICE_STATUS, ISSUER_VAT, parseTermsPct, planFromPct } from "@/lib/acc-data";
import { customerOfDeal, useCrm } from "@/lib/crm-store";
import { taxInvoiceBuyer } from "@/lib/crm-data";
import {
  canBill,
  dealPaid,
  invoiceDue,
  invoiceOf,
  invoiceStatus,
  issueInvoice,
  logCollection,
  markDealsSeen,
  receiptOf,
  receiptsOf,
  savePlan,
  seqLocked,
  seqStatus,
  unseenDeals,
  useAcc,
  type AccState,
} from "@/lib/acc-store";
import { issueReceiptFlow } from "@/lib/flow";
import { lockScroll } from "@/lib/scroll-lock";
import {
  TH_MONTHS_FULL,
  baht,
  bkkNow,
  daysBetween,
  round2,
  thaiDate,
  toIsoDate,
  todayIso,
  commaInput,
} from "@/lib/format";
import { useRouter, useSearchParams } from "next/navigation";
import { useFindParam } from "@/lib/deep-link";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "./icons";
import { Sheet } from "./lead-dialogs";
import { AccFilters, MonthNav, NewDot, useAccFilter } from "./acc-ui";
import { Field, Textarea } from "./ui";
import { receiptHref } from "./acc-receipts-page";

import { DateField } from "./thai-date-picker";
import { CancelDealDialog } from "./cancel-deal-dialog";
type TabKey = "todo" | "inv" | "due";

/** ที่อยู่หน้าเอกสารใบแจ้งหนี้ — อยู่ใต้เมนูวางบิล สิทธิ์เข้าหน้าจึงตามเมนูนี้ */
export function invoiceHref(no: string) {
  return `/acc/billing/invoice/${encodeURIComponent(no)}`;
}

export function AccBillingPage() {
  const acc = useAcc();
  /* เงื่อนไขชำระเงินเป็นของใบเสนอราคาฝ่ายขาย อ่านสดทุกครั้งจากเลขที่ใบในดีล
     ไม่คัดลอกมาเก็บไว้ในสโตร์บัญชี จะได้ไม่ค้างเป็นข้อความเก่าเมื่อฝ่ายขายแก้ใบ */
  const crm = useCrm();
  const termsOf = (quo: string) => (quo ? crm.quotations.find((q) => q.no === quo)?.terms ?? "" : "");
  const router = useRouter();
  /* หน้าอื่นลิงก์มาหาเอกสารใบเดียวด้วย ?find= ใช้ช่องค้นหาเป็นตัวกรอง */
  const find = useFindParam();
  const filter = useAccFilter(find);
  const { hit, inRange } = filter;
  /* ?tab= ให้การ์ดตัวเลขบนแดชบอร์ดพามาลงแท็บที่ตรงกับตัวเลขที่กด
     ?find= สำคัญกว่า เพราะเจาะจงถึงใบเดียวอยู่แล้ว */
  const wanted = useSearchParams().get("tab");
  const [tab, setTab] = useState<TabKey>(() => {
    /* ถูกลิงก์มาหาเอกสารใบเดียว — เปิดแท็บที่มีใบนั้นจริง
       ไม่งั้นคนกดมาจะเจอตารางว่างแล้วนึกว่าของหาย */
    if (find) {
      const inv = acc.invoices.some(
        (v) => v.status !== "paid" && v.status !== "cancelled" && `${v.no} ${v.cus} ${v.deal}`.includes(find),
      );
      return inv ? "inv" : "todo";
    }
    return wanted === "inv" || wanted === "due" ? wanted : "todo";
  });
  const [view, setView] = useState(() => bkkNow());
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [planning, setPlanning] = useState<AccDeal | null>(null);
  /* มือถือ: กดดินสอที่งวดไหน เปิดกล่องแบ่งงวดแล้วเลื่อนไปที่งวดนั้น */
  const [planFocus, setPlanFocus] = useState<number | null>(null);
  const phone = useIsPhone();
  const [billing, setBilling] = useState<{ deal: AccDeal; item: Installment } | null>(null);
  /* ดีลที่รับเงินแล้ว ฝ่ายบัญชีเป็นคนยกเลิก (ก่อนรับเงินฝ่ายขายยกเลิกที่หน้าดีล) */
  const [cancelling, setCancelling] = useState<AccDeal | null>(null);
  const [collecting, setCollecting] = useState<Invoice | null>(null);
  /* จุดแดงที่แท็บใบแจ้งหนี้หลังออกใบใหม่ — หายเมื่อเปิดแท็บนั้น */
  const [invDot, setInvDot] = useState(false);
  const today = todayIso();

  const canCancel = (dealNo: string) => {
    const d = acc.deals.find((x) => x.no === dealNo);
    return Boolean(d && !d.cancelled && dealPaid(acc, dealNo));
  };

  /* ดีลอยู่ในแท็บนี้จนทุกงวดออกใบแจ้งหนี้ครบ งวดที่ยังออกไม่ได้แสดงว่ารอชำระงวดก่อนหน้า
     กรองด้วยวันที่ส่งใบเสนอราคา */
  const todo = acc.deals.filter(
    (d) =>
      !d.cancelled &&
      hit(d.cus, d.quo, d.no) &&
      inRange(d.quoDate) &&
      (d.plan.length === 0 || d.plan.some((p) => seqStatus(acc, d.no, p.seq) === "pending")),
  );
  /* ใบแจ้งหนี้ที่ยังต้องเก็บเงิน — เงื่อนไขชุดเดียวกับ awaitingReceipt ในสโตร์ กรองด้วยวันที่วางบิล */
  const invoices = acc.invoices
    .filter((v) => invoiceStatus(acc, v) !== "cancelled" && invoiceDue(v) > 0)
    .filter((v) => hit(v.no, v.cus, v.deal) && inRange(v.issue))
    .sort((a, b) => b.issue.localeCompare(a.issue));
  /* เลยวันครบกำหนดแล้ว — กรองด้วยวันครบกำหนด */
  const overdue = acc.invoices.filter(
    (v) =>
      invoiceDue(v) > 0 &&
      invoiceStatus(acc, v) !== "cancelled" &&
      daysBetween(v.due, today) > 0 &&
      hit(v.no, v.cus, v.deal) &&
      inRange(v.due),
  );

  /* ดีลใหม่ที่ยังไม่ได้เปิดดู (AC-BR-01) — เปิดแท็บรอวางบิลอยู่ ให้จุดแดงค้างไว้ครู่หนึ่งพอให้เห็น แล้วถือว่าเปิดดูแล้ว */
  const newDeals = unseenDeals(acc).filter((d) => todo.some((t) => t.no === d.no)).length;
  const hasUnseen = unseenDeals(acc).length > 0;
  /* มือถือมีแต่รายการรอวางบิล ไม่มีแท็บ — เปิดหน้าก็ถือว่าเห็นดีลใหม่แล้ว */
  useEffect(() => {
    if ((tab !== "todo" && !phone) || !hasUnseen) return;
    const t = window.setTimeout(markDealsSeen, 1500);
    return () => window.clearTimeout(t);
  }, [tab, hasUnseen, phone]);

  /*
   * มือถือ "วางบิลจบในหน้าเดียว" — ไม่มีแท็บ ดีลอยู่ในรายการจนทุกงวดชำระครบ
   * งวดที่ออกใบแจ้งหนี้แล้วอยู่ในการ์ดดีลเดิม (ดาวน์โหลดใบแจ้งหนี้ / ออกใบเสร็จได้จากตรงนั้น)
   * ดีลที่ชำระครบแล้วยังอยู่ต่อจนสิ้นเดือนที่ออกใบเสร็จใบสุดท้าย จะได้ดาวน์โหลดใบเสร็จได้
   * คำค้นตรงกับเลขที่ใบแจ้งหนี้ของดีลก็นับ (ลิงก์ ?find= จากหน้าอื่นมักส่งเลขที่ใบแจ้งหนี้มา)
   */
  const month = today.slice(0, 7);
  const phoneHit = (d: AccDeal) =>
    hit(d.cus, d.quo, d.no, ...acc.invoices.filter((v) => v.deal === d.no).map((v) => v.no));
  const phoneBase = acc.deals.filter((d) => {
    if (d.cancelled || !phoneHit(d)) return false;
    if (d.plan.length === 0 || d.plan.some((p) => seqStatus(acc, d.no, p.seq) !== "paid")) return true;
    const last = acc.receipts
      .filter((r) => r.deal === d.no)
      .reduce((a, r) => (r.date > a ? r.date : a), "");
    return last.startsWith(month);
  });
  /* ไม่มีวันปิดดีลในข้อมูลบัญชี ใช้วันส่งใบเสนอราคาเหมือนแท็บรอวางบิลบนจอคอม */
  const phoneTodo = phoneBase.filter((d) => inRange(d.quoDate));
  const phoneDays = new Set(phoneBase.map((d) => d.quoDate));
  const [calOpen, setCalOpen] = useState(false);

  function pickTab(k: TabKey) {
    setTab(k);
    if (k === "inv") setInvDot(false);
    if (k === "todo") markDealsSeen();
  }

  function openCancel(dealNo: string) {
    const d = acc.deals.find((x) => x.no === dealNo);
    if (d && canCancel(dealNo)) setCancelling(d);
  }

  /*
   * มือถือ: ออกใบเสร็จจากการ์ดดีลเลย ด้วยค่าตั้งต้นชุดเดียวกับกล่องออกใบเสร็จที่หน้าใบเสร็จ
   * (รับเต็มยอดค้าง หักภาษี ณ ที่จ่ายตามใบเสนอราคาเฉพาะใบเสร็จใบแรกของใบแจ้งหนี้)
   * ข้อมูลผู้ซื้อไม่ครบออกใบกำกับภาษีไม่ได้ — บอกแล้วไม่ออก ให้ไปแก้ข้อมูลลูกค้าก่อน
   * รับเงินไม่ครบหรือยอดหักต่างจากที่ตกลง ต้องไปออกที่หน้าใบเสร็จซึ่งกรอกยอดเองได้
   */
  function quickReceipt(v: Invoice, d: AccDeal) {
    const buyer = taxInvoiceBuyer(customerOfDeal(crm, d.no, d.quo, v.cus));
    if (ISSUER_VAT && buyer.missing.length > 0) {
      window.alert(`ออกใบเสร็จไม่ได้ — ข้อมูลผู้ซื้อไม่ครบ: ${buyer.missing.join(", ")}`);
      return;
    }
    const due = invoiceDue(v);
    const wht = receiptsOf(acc, v.no).length === 0 ? v.wht : 0;
    const got = round2(due - wht);
    const msg =
      `ออกใบเสร็จของใบแจ้งหนี้ ${v.no}\nรับชำระ ${baht(got)} บาท` +
      (wht > 0 ? `\nภาษีหัก ณ ที่จ่าย ${baht(wht)} บาท` : "") +
      `\n\nยืนยันออกใบเสร็จ?`;
    if (!window.confirm(msg)) return;
    issueReceiptFlow(v.no, today, got, wht);
  }

  return (
    <div className="space-y-4">
      {/* จอคอม (md ขึ้นไป) — แท็บสามแท็บ ตาราง และยอดรวมท้ายตาราง · มือถือใช้รายการเดียวด้านล่างแทน */}
      <div className="bar max-md:hidden!">
        <div>
          <h1>วางบิล</h1>
        </div>
        <div className="tools w-full sm:w-auto">
          <MonthNav view={view} onChange={setView} />
        </div>
      </div>

      <section className="panel glass flex flex-col max-md:hidden!">
        <div className="strip">
          <div className="tabs">
            <Tab on={tab === "todo"} onClick={() => pickTab("todo")} count={todo.length} dot={newDeals > 0 ? "มีดีลใหม่รอวางบิล" : ""}>
              รอวางบิล
            </Tab>
            <Tab on={tab === "inv"} onClick={() => pickTab("inv")} count={invoices.length} dot={invDot ? "มีใบแจ้งหนี้ใหม่" : ""}>
              ใบแจ้งหนี้
            </Tab>
            <Tab on={tab === "due"} onClick={() => pickTab("due")} count={overdue.length}>
              ค้างชำระ
            </Tab>
          </div>
          <AccFilters filter={filter} />
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          {tab === "todo" && (
            <table className="data-table cards-sm min-w-[980px]">
              <thead>
                <tr>
                  <th style={{ width: 190 }}>ลูกค้า</th>
                  <th style={{ width: 170 }}>ใบเสนอราคาล่าสุด</th>
                  <th className="r" style={{ width: 190 }}>ยอดสุทธิตามใบเสนอราคา (บาท)</th>
                  <th style={{ width: 270 }}>งวดชำระ</th>
                  <th className="c">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {todo.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      ไม่มีดีลที่รอวางบิล
                    </td>
                  </tr>
                ) : (
                  todo.map((d) => {
                    const has = d.plan.length > 0;
                    const isOpen = Boolean(open[d.no]);
                    const waiting = d.plan.filter((p) => seqStatus(acc, d.no, p.seq) === "pending").length;
                    return (
                      <Fragment key={d.no}>
                        <tr
                          className={isOpen ? "open" : ""}
                          style={{ cursor: has ? "pointer" : "default" }}
                          onClick={() => has && setOpen((o) => ({ ...o, [d.no]: !o[d.no] }))}
                        >
                          <td data-label="ลูกค้า" className="font-semibold">{d.cus}</td>
                          <td data-label="ใบเสนอราคาล่าสุด" className="muted">
                            <span className="num">{d.quo}</span>
                            <span className="why">ส่ง {thaiDate(d.quoDate)}</span>
                          </td>
                          <td data-label="ยอดสุทธิตามใบเสนอราคา (บาท)" className="r num font-semibold">{baht(d.net)}</td>
                          <td data-label="งวดชำระ" className="muted">
                            {has ? (
                              <>
                                <span className="clip">รอออกใบแจ้งหนี้ {waiting} งวด</span>
                                <span className="why">
                                  {isOpen ? "กดแถวเพื่อย่อ" : "กดแถวเพื่อดูงวดและออกใบแจ้งหนี้"}
                                </span>
                              </>
                            ) : (
                              <span className="why">ยังไม่ได้แบ่งงวด</span>
                            )}
                          </td>
                          <td data-label="จัดการ" className="c">
                            <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                              <button
                                type="button"
                                className="lnk"
                                data-ceo-hide
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPlanning(d);
                                }}
                              >
                                {has ? "แก้งวด" : "แบ่งงวด"}
                              </button>
                              {canCancel(d.no) && (
                                <button
                                  type="button"
                                  className="lnk quiet text-destructive"
                                  data-ceo-hide
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openCancel(d.no);
                                  }}
                                >
                                  ยกเลิกดีล
                                </button>
                              )}
                            </span>
                          </td>
                        </tr>
                        {isOpen && has && (
                          <tr className="sub">
                            <td colSpan={5}>
                              <PlanRows
                                acc={acc}
                                deal={d}
                                onBill={(item) => setBilling({ deal: d, item })}
                              />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          )}

          {tab === "inv" && (
            <table className="data-table cards-sm min-w-[1110px]">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>เลขที่ใบแจ้งหนี้</th>
                  <th style={{ width: 170 }}>ลูกค้า</th>
                  <th style={{ width: 118 }}>วันที่วางบิล</th>
                  <th style={{ width: 170 }}>ครบกำหนดชำระ</th>
                  <th className="c" style={{ width: 130 }}>ยอดที่ต้องชำระ (บาท)</th>
                  <th className="c" style={{ width: 130 }}>ยอดคงเหลือ (บาท)</th>
                  <th style={{ width: 120 }}>สถานะ</th>
                  <th className="c" style={{ width: 120 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-muted-foreground">
                      ไม่มีใบแจ้งหนี้ที่รอชำระ
                    </td>
                  </tr>
                ) : (
                  invoices.map((v) => (
                    <tr
                      key={v.no}
                      tabIndex={0}
                      style={{ cursor: "pointer" }}
                      title="เปิดใบแจ้งหนี้"
                      onClick={() => router.push(invoiceHref(v.no))}
                      onKeyDown={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          router.push(invoiceHref(v.no));
                        }
                      }}
                    >
                      <td data-label="เลขที่ใบแจ้งหนี้" className="num">
                        <b className="font-semibold">{v.no}</b>
                        <span className="why">งวดที่ {v.seq}</span>
                      </td>
                      <td data-label="ลูกค้า">{v.cus}</td>
                      <td data-label="วันที่วางบิล" className="num muted">{thaiDate(v.issue)}</td>
                      <td data-label="ครบกำหนดชำระ" className="num muted">
                        {thaiDate(v.due)}
                        <DueBadge invoice={v} today={today} />
                      </td>
                      <td data-label="ยอดที่ต้องชำระ (บาท)" className="c num">{baht(v.total)}</td>
                      <td data-label="ยอดคงเหลือ (บาท)" className="c num font-semibold">{baht(invoiceDue(v))}</td>
                      <td data-label="สถานะ">
                        <InvoiceTag acc={acc} invoice={v} />
                      </td>
                      <td data-label="จัดการ" className="c">
                        <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                          {invoiceDue(v) > 0 && canCancel(v.deal) && (
                            <button
                              type="button"
                              className="lnk quiet text-destructive"
                              data-ceo-hide
                              onClick={(e) => {
                                e.stopPropagation();
                                openCancel(v.deal);
                              }}
                            >
                              ยกเลิกดีล
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "due" && (
            <table className="data-table cards-sm min-w-[1040px]">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>เลขที่ใบแจ้งหนี้</th>
                  <th>ลูกค้า</th>
                  <th style={{ width: 130 }}>ครบกำหนด</th>
                  <th className="c" style={{ width: 100 }}>เกินกำหนด</th>
                  <th className="c" style={{ width: 130 }}>ยอดคงเหลือ (บาท)</th>
                  <th>ติดตามล่าสุด</th>
                  <th className="c" style={{ width: 130 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {overdue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      ไม่มีใบแจ้งหนี้ที่เกินกำหนด
                    </td>
                  </tr>
                ) : (
                  overdue.map((v) => {
                    const last = v.col[v.col.length - 1];
                    return (
                      <tr key={v.no}>
                        <td data-label="เลขที่ใบแจ้งหนี้" className="num">
                          <b className="font-semibold">{v.no}</b>
                        </td>
                        <td data-label="ลูกค้า">{v.cus}</td>
                        <td data-label="ครบกำหนด" className="num muted">{thaiDate(v.due)}</td>
                        <td data-label="เกินกำหนด" className="c">
                          <span className="late">{daysBetween(v.due, today)} วัน</span>
                        </td>
                        <td data-label="ยอดคงเหลือ (บาท)" className="c num font-semibold">{baht(invoiceDue(v))}</td>
                        <td data-label="ติดตามล่าสุด" className="muted">
                          {last ? (
                            <>
                              <span className="clip">{last.result}</span>
                              {/* ต้นแบบแยกวันที่ ช่องทาง และวันนัดคนละบรรทัด ไม่ใช้เครื่องหมายคั่น */}
                              <span className="why">{thaiDate(last.date)}</span>
                              <span className="why">{last.channel}</span>
                              {last.next && (
                                <span className="why">นัดอีกครั้ง {thaiDate(last.next)}</span>
                              )}
                            </>
                          ) : (
                            <span className="why">ยังไม่เคยติดตาม</span>
                          )}
                        </td>
                        <td data-label="จัดการ" className="c">
                          <button type="button" className="lnk" data-ceo-hide onClick={() => setCollecting(v)}>
                            บันทึกติดตาม
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <Foot tab={tab} acc={acc} invoices={invoices} todo={todo} overdue={overdue} />
        </div>
      </section>

      {/* มือถือ — วางบิลจบในหน้าเดียว: ไม่มีแท็บและยอดรวมท้ายตาราง ทุกงวดของดีลอยู่ในการ์ดดีล */}
      <div className="md:hidden">
        <div className="flex items-center gap-2.5">
          <label className="flex h-[46px] min-w-0 flex-1 items-center gap-2.5 rounded-[14px] bg-white px-3.5 text-[#8A7E81] shadow-[0_1px_2px_rgba(120,20,35,.05),0_12px_28px_-18px_rgba(120,20,35,.3)]">
            <SearchIcon className="size-[17px] flex-none" strokeWidth={2} />
            <input
              type="search"
              value={filter.f.q}
              onChange={(e) => filter.setF((x) => ({ ...x, q: e.target.value }))}
              placeholder="ค้นหาเลขที่เอกสารหรือลูกค้า"
              aria-label="ค้นหาเลขที่เอกสารหรือลูกค้า"
              className="h-full min-w-0 flex-1 bg-transparent text-[14.5px] text-[#2A1F22] outline-none placeholder:text-[#9A8E91]"
            />
          </label>
          <button
            type="button"
            aria-label="เลือกวันที่"
            onClick={() => setCalOpen(true)}
            className="grid size-[42px] flex-none place-items-center rounded-full border border-[#EFE3E5] bg-white text-[#2A1F22] active:bg-[#F7EFF1]"
          >
            <CalendarIcon className="size-[19px]" strokeWidth={2} />
          </button>
        </div>

        {(filter.f.from || filter.f.to) && (
          <div className="mt-2.5 flex">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#C8102E] pr-1 pl-3.5 text-[13px] font-semibold text-white">
              <span className="num">
                {filter.f.from === filter.f.to || !filter.f.to || !filter.f.from
                  ? thaiDate(filter.f.from || filter.f.to)
                  : `${thaiDate(filter.f.from)} – ${thaiDate(filter.f.to)}`}
              </span>
              <button
                type="button"
                aria-label="ล้างวันที่"
                onClick={() => filter.setF((x) => ({ ...x, from: "", to: "" }))}
                className="grid size-6 place-items-center rounded-full bg-white/20"
              >
                <CloseIcon className="size-3.5" strokeWidth={2.6} />
              </button>
            </span>
          </div>
        )}

        <div className="flex flex-col gap-3 pt-3">
          {phoneTodo.length === 0 ? (
            <div className="rounded-[22px] bg-white px-4 py-10 text-center text-[13.5px] text-[#6E6164] shadow-[0_1px_2px_rgba(40,20,25,.04)]">
              ไม่มีดีลที่รอวางบิล
            </div>
          ) : (
            phoneTodo.map((d) => (
              <PhoneDeal
                key={d.no}
                acc={acc}
                deal={d}
                today={today}
                open={Boolean(open[d.no])}
                onToggle={() => setOpen((o) => ({ ...o, [d.no]: !o[d.no] }))}
                onPlan={(seq) => {
                  setPlanFocus(seq ?? null);
                  setPlanning(d);
                }}
                onBill={(item) => setBilling({ deal: d, item })}
                onCancel={canCancel(d.no) ? () => openCancel(d.no) : undefined}
                onReceipt={(v) => quickReceipt(v, d)}
              />
            ))
          )}
        </div>
      </div>

      {calOpen && (
        <DayPickSheet
          days={phoneDays}
          selected={filter.f.from && filter.f.from === filter.f.to ? filter.f.from : ""}
          onPick={(iso) => {
            filter.setF((x) => ({ ...x, from: iso, to: iso }));
            setCalOpen(false);
          }}
          onAll={() => {
            filter.setF((x) => ({ ...x, from: "", to: "" }));
            setCalOpen(false);
          }}
          onClose={() => setCalOpen(false)}
        />
      )}

      {planning && (
        <PlanDialog
          deal={planning}
          acc={acc}
          terms={termsOf(planning.quo)}
          focusSeq={planFocus}
          onClose={() => {
            setPlanning(null);
            setPlanFocus(null);
          }}
          onSaved={() => {
            /* กางงวดให้เลย ผู้ใช้จะได้เห็นปุ่มออกใบแจ้งหนี้ของงวดแรกทันที */
            setOpen((o) => ({ ...o, [planning.no]: true }));
            setPlanning(null);
            setPlanFocus(null);
          }}
        />
      )}
      {billing && (
        <BillDialog
          deal={billing.deal}
          item={billing.item}
          phone={phone}
          onClose={() => setBilling(null)}
          onDone={() => {
            setOpen((o) => ({ ...o, [billing.deal.no]: true }));
            if (tab !== "inv") setInvDot(true);
            setBilling(null);
          }}
        />
      )}
      {collecting && (
        <CollectDialog invoice={collecting} today={today} onClose={() => setCollecting(null)} />
      )}

      {cancelling && (
        <CancelDealDialog
          dealNo={cancelling.no}
          cus={cancelling.cus}
          total={cancelling.net}
          by="ฝ่ายบัญชี"
          rows={cancelRows(acc, cancelling)}
          onClose={() => setCancelling(null)}
        />
      )}
    </div>
  );
}

/**
 * ข้อมูลในกล่องยกเลิกดีล — ลูกค้า · รับชำระแล้ว · ใบแจ้งหนี้ที่จะถูกยกเลิกไปด้วย
 * ต้องบอกจำนวนใบและยอดให้เห็นก่อนกด ไม่ใช่ให้ไปเจอเอาทีหลังว่าใบไหนหายไปบ้าง
 */
function cancelRows(acc: AccState, d: AccDeal) {
  const invs = acc.invoices.filter((v) => v.deal === d.no);
  const got = invs.reduce((a, v) => a + (v.total - invoiceDue(v)), 0);
  /* ใบที่ยังไม่ได้รับชำระเท่านั้นที่จะถูกยกเลิก — ใบที่รับเงินครบแล้วยังอยู่ตามเดิม */
  const open = invs.filter((v) => invoiceStatus(acc, v) !== "cancelled" && invoiceDue(v) > 0);
  const sum = open.reduce((a, v) => a + invoiceDue(v), 0);
  return [
    { label: "ลูกค้า", value: d.cus },
    { label: "รับชำระแล้ว (ไม่คืนอัตโนมัติ)", value: `${baht(got)} บาท` },
    ...(open.length
      ? [
          {
            label: "ใบแจ้งหนี้ที่จะถูกยกเลิก",
            value: `${open.length} ใบ · ${baht(sum)} บาท`,
          },
        ]
      : []),
  ];
}

function Tab({
  on,
  count,
  dot = "",
  onClick,
  children,
}: {
  on: boolean;
  count: number;
  /** ข้อความของจุดแดง — ว่าง = ไม่มีจุด */
  dot?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`relative ${on ? "on" : ""}`} onClick={onClick}>
      {children} <b>{count}</b>
      {/* บนมือถือแท็บเป็นเม็ดยา จุดที่ลอยอยู่มุมบนจะหลุดออกนอกขอบโค้ง จึงย้ายมาต่อท้ายในบรรทัดเดียวกัน
         และแท็บที่เลือกอยู่พื้นแดง จุดแดงจะจมหาย ต้องเปลี่ยนเป็นขาว */}
      {dot && (
        <NewDot
          label={dot}
          className={`absolute top-2 right-1 max-sm:static max-sm:ml-1.5 max-sm:shadow-none ${
            on ? "max-sm:bg-white" : ""
          }`}
        />
      )}
    </button>
  );
}

function Foot({
  tab,
  acc,
  invoices,
  todo,
  overdue,
}: {
  tab: TabKey;
  acc: AccState;
  invoices: Invoice[];
  todo: AccDeal[];
  overdue: Invoice[];
}) {
  if (tab === "todo") {
    /*
     * "ออกใบแจ้งหนี้ได้ตอนนี้" = เฉพาะงวดที่กดออกใบได้จริงในวันนี้
     * ดีลที่ยังไม่ได้แบ่งงวดกดออกใบไม่ได้เลย จึงไม่ใช่ยอดของบรรทัดนี้ — แยกไปบอกอีกบรรทัด
     * (เคยรวมยอดเต็มของดีลที่ยังไม่แบ่งงวดเข้ามาด้วย ทำให้ยอดสูงเกินจริง · ผู้ใช้ทักท้วง 24 ก.ย. 2569)
     * งวดที่ต้องรอใบเสร็จของงวดก่อนก็ไม่นับ เพราะยังวางบิลวันนี้ไม่ได้เหมือนกัน
     */
    const ready = todo.filter((d) => d.plan.length > 0);
    const waiting = ready.reduce(
      (sum, d) => sum + d.plan.reduce((a, p, i) => a + (canBill(acc, d, i) ? p.amount : 0), 0),
      0,
    );
    const unsplit = todo.filter((d) => d.plan.length === 0);
    const unsplitSum = unsplit.reduce((a, d) => a + d.net, 0);
    return (
      <>
        <span>แสดง {todo.length} ดีล</span>
        {unsplit.length > 0 && (
          <span className="text-muted-foreground">
            ยังไม่ได้แบ่งงวด {unsplit.length} ดีล · <span className="num">{baht(unsplitSum)}</span> บาท
          </span>
        )}
        <span className="sum sm:ml-auto">
          ยอดที่ออกใบแจ้งหนี้ได้ตอนนี้<b>{baht(waiting)}</b> บาท
        </span>
      </>
    );
  }
  if (tab === "inv") {
    const left = invoices.reduce((a, v) => a + invoiceDue(v), 0);
    return (
      <>
        <span>แสดง {invoices.length} ใบแจ้งหนี้</span>
        <span className="sum sm:ml-auto">
          ยอดคงเหลือรวม<b>{baht(left)}</b> บาท
        </span>
      </>
    );
  }
  const late = overdue.reduce((a, v) => a + invoiceDue(v), 0);
  return (
    <>
      <span>แสดง {overdue.length} ใบแจ้งหนี้</span>
      <span className="sum sm:ml-auto">
        ยอดเกินกำหนดรวม<b>{baht(late)}</b> บาท
      </span>
    </>
  );
}

/**
 * ป้ายสถานะใบแจ้งหนี้ — ชำระ = มีใบเสร็จ (AC-BR-05)
 * อ่านสถานะที่คิดจากยอดค้างและใบเสร็จจริง ไม่ใช่ค่าที่ค้างอยู่ในตัวเอกสาร
 */
export function InvoiceTag({ acc, invoice }: { acc: AccState; invoice: Invoice }) {
  const s = INVOICE_STATUS[invoiceStatus(acc, invoice)];
  return (
    <span className={`tag ${s.cls}`}>
      <i />
      {s.label}
    </span>
  );
}

/* บัญชีต้องรู้ว่าต้องไล่ตามใบไหนก่อน จึงบอกจำนวนวันเทียบกับวันครบกำหนด */
function DueBadge({ invoice, today }: { invoice: Invoice; today: string }) {
  if (invoiceDue(invoice) <= 0) return <span className="why">ชำระแล้ว</span>;
  const n = daysBetween(invoice.due, today);
  if (n > 0) return <span className="late">เกินกำหนด {n} วัน</span>;
  if (n === 0) return <span className="soon">ครบกำหนดวันนี้</span>;
  if (n >= -7) return <span className="soon">เหลืออีก {-n} วัน</span>;
  return <span className="why">เหลืออีก {-n} วัน</span>;
}

/**
 * งวดชำระใต้แถวดีล — ออกใบแจ้งหนี้ได้เฉพาะงวดที่งวดก่อนหน้าออกใบเสร็จแล้ว (AC-BR-04)
 * งวดที่ออกใบแล้วยังอยู่ในรายการเสมอ ขึ้นสถานะและเลขที่ใบให้กดเปิดดูได้ ไม่หายไปจนไม่เหลือร่องรอย
 */
function PlanRows({
  acc,
  deal,
  onBill,
}: {
  acc: AccState;
  deal: AccDeal;
  onBill: (item: Installment) => void;
}) {
  return (
    <div className="subwrap">
      <table className="inner">
        <colgroup>
          <col style={{ width: 90 }} />
          <col style={{ width: 80 }} />
          <col style={{ width: 130 }} />
          <col style={{ width: 190 }} />
        </colgroup>
        <tbody>
          {deal.plan.map((p, i) => {
            const inv = invoiceOf(acc, deal.no, p.seq);
            return (
              <tr key={p.seq}>
                <td data-label="งวดที่" className="c num">งวดที่ {p.seq}</td>
                <td data-label="สัดส่วน" className="c num">{p.pct}%</td>
                <td data-label="จำนวนเงิน" className="r num">{baht(p.amount)}</td>
                <td data-label="จัดการ" className="c">
                  {seqStatus(acc, deal.no, p.seq) === "pending" ? (
                    canBill(acc, deal, i) ? (
                      <button type="button" className="lnk" data-ceo-hide onClick={() => onBill(p)}>
                        ออกใบแจ้งหนี้
                      </button>
                    ) : (
                      <span className="why">ต้องออกใบเสร็จงวดก่อนหน้าก่อน</span>
                    )
                  ) : (
                    <SeqBilled acc={acc} deal={deal.no} seq={p.seq} no={inv?.no ?? ""} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * งวดที่ออกใบแจ้งหนี้ไปแล้ว — บอกสถานะพร้อมเลขที่ใบซึ่งกดเปิดเอกสารได้
 * ออกใบเสร็จแล้วถือว่าลูกค้าชำระงวดนั้นแล้ว (AC-BR-05) จึงแยกข้อความคนละคำ
 */
function SeqBilled({ acc, deal, seq, no }: { acc: AccState; deal: string; seq: number; no: string }) {
  const paid = seqStatus(acc, deal, seq) === "paid";
  return (
    <span className="inline-flex flex-col items-center gap-0.5">
      <span className={`tag ${paid ? "t-ok" : "t-early"}`}>
        <i />
        {paid ? "ชำระแล้ว" : "วางบิลแล้ว"}
      </span>
      {no && (
        <Link className="lnk num" href={invoiceHref(no)} title="เปิดใบแจ้งหนี้">
          {no}
        </Link>
      )}
    </span>
  );
}

// ─── มือถือ (ต่ำกว่า md) — วางบิลจบในหน้าเดียว ────────────────────────
const PHONE_MQ = "(max-width: 767.98px)";

/** จอมือถือหรือไม่ — ใช้เลือกข้อความ/หน้าตาในกล่องที่ใช้ร่วมกับจอคอม (ฝั่งเซิร์ฟเวอร์ถือว่าไม่ใช่) */
function useIsPhone() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(PHONE_MQ);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(PHONE_MQ).matches,
    () => false,
  );
}

/* ปุ่มท้ายกล่องบนมือถือ — กว้างเต็มแถวแบ่งกัน สูง 48 (.btn ตั้งค่าไว้นอก layer จึงต้องใช้ !) */
const PHONE_FOOT = "max-md:h-12! max-md:justify-center! max-md:rounded-[14px]! max-md:text-[14px]!";

const CARD_SHADOW ="shadow-[0_1px_2px_rgba(120,20,35,.05),0_12px_28px_-18px_rgba(120,20,35,.3)]";

/**
 * การ์ดดีลบนมือถือ — กดการ์ด (หรือปุ่มออกใบแจ้งหนี้) เพื่อกางงวดทั้งหมดของดีล
 * กางแล้วปุ่มของการ์ดซ่อน ยกเลิกดีลย้ายไปท้ายส่วนที่กาง การ์ดกับงวดดูเป็นการ์ดใบเดียวกัน
 */
function PhoneDeal({
  acc,
  deal: d,
  today,
  open,
  onToggle,
  onPlan,
  onBill,
  onCancel,
  onReceipt,
}: {
  acc: AccState;
  deal: AccDeal;
  today: string;
  open: boolean;
  onToggle: () => void;
  /** seq = งวดที่ต้องการเลื่อนไปหาในกล่องแบ่งงวด */
  onPlan: (seq?: number) => void;
  onBill: (item: Installment) => void;
  onCancel?: () => void;
  onReceipt: (v: Invoice) => void;
}) {
  const has = d.plan.length > 0;
  const isOpen = open && has;
  const status = d.plan.map((p) => seqStatus(acc, d.no, p.seq));
  const waiting = status.filter((s) => s === "pending").length;
  const unpaid = status.filter((s) => s === "invoiced").length;
  const btn = "h-9 rounded-[11px] text-[13px] font-semibold";
  const cancelBtn = onCancel && (
    <button
      type="button"
      data-ceo-hide
      className="col-span-2 h-8 text-[12.5px] font-semibold text-[#C0121F]"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      ยกเลิกดีล
    </button>
  );

  return (
    <div className={`rounded-[22px] bg-white ${CARD_SHADOW}`}>
      <div
        role={has ? "button" : undefined}
        tabIndex={has ? 0 : undefined}
        aria-expanded={has ? isOpen : undefined}
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2.5 p-3.5 text-[#2A1F22]"
        style={{ gridTemplateAreas: '"cus amt" "quo quo" "plan plan" "act act"' }}
        onClick={() => has && onToggle()}
        onKeyDown={(e) => {
          if (!has || e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        <p className="text-[19px] leading-[1.3] font-bold [grid-area:cus]">{d.cus}</p>
        <p className="num pt-0.5 text-right text-[15px] font-semibold whitespace-nowrap [grid-area:amt]">
          {baht(d.net)} ฿
        </p>
        <p className="flex flex-wrap items-baseline gap-x-2 [grid-area:quo]">
          <span className="num font-semibold">{d.quo}</span>
          <span className="text-[12.5px] text-[#6E6164]">ส่ง {thaiDate(d.quoDate)}</span>
        </p>
        <div className="rounded-[14px] bg-[#FBF7F7] px-[11px] pt-[9px] pb-[13px] text-[13.5px] [grid-area:plan]">
          {has ? (
            <>
              <p className="font-semibold">
                แบ่ง {d.plan.length} งวด
                {waiting > 0 && <span className="text-[#C8102E]"> · รอออกใบแจ้งหนี้ {waiting} งวด</span>}
              </p>
              <p className="mt-0.5 text-[12.5px] text-[#6E6164]">
                {unpaid > 0
                  ? `รอชำระ ${unpaid} งวด`
                  : waiting > 0
                    ? `ชำระแล้ว ${d.plan.length - waiting} งวด`
                    : "ชำระครบทุกงวดแล้ว"}
              </p>
            </>
          ) : (
            /* ข้อความเดียวในกล่อง จึงแสดงคำแนะนำ */
            <p className="text-[#6E6164]">ยังไม่ได้แบ่งงวด · กดแบ่งงวดเพื่อเริ่มวางบิล</p>
          )}
        </div>
        {!isOpen && (
          <div className="grid grid-cols-2 gap-2 [grid-area:act]">
            {has ? (
              <>
                <button
                  type="button"
                  data-ceo-hide
                  className={`${btn} bg-[#F7EFF1] text-[#2A1F22]`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlan();
                  }}
                >
                  แก้งวด
                </button>
                <button
                  type="button"
                  className={`${btn} bg-[#C8102E] text-white`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle();
                  }}
                >
                  ออกใบแจ้งหนี้
                </button>
              </>
            ) : (
              <button
                type="button"
                data-ceo-hide
                className={`${btn} col-span-2 bg-[#C8102E] text-white`}
                onClick={(e) => {
                  e.stopPropagation();
                  onPlan();
                }}
              >
                แบ่งงวด
              </button>
            )}
            {cancelBtn}
          </div>
        )}
      </div>

      {isOpen && (
        <div className="px-3.5 pt-1 pb-3.5">
          <div className="flex flex-col gap-2 border-t-[1.5px] border-dashed border-[#ECE3E5] pt-3">
            {d.plan.map((p, i) => (
              <PhoneSeq
                key={p.seq}
                acc={acc}
                deal={d}
                item={p}
                index={i}
                today={today}
                onEdit={() => onPlan(p.seq)}
                onBill={() => onBill(p)}
                onReceipt={onReceipt}
              />
            ))}
            {cancelBtn && <div className="grid grid-cols-2 justify-items-center">{cancelBtn}</div>}
          </div>
        </div>
      )}
    </div>
  );
}

/** งวดหนึ่งในการ์ดดีลมือถือ — ยังไม่ออกใบ: ปุ่มออกใบแจ้งหนี้ · ออกแล้ว: เลขที่ใบ สถานะ และปุ่มเอกสาร */
function PhoneSeq({
  acc,
  deal,
  item: p,
  index,
  today,
  onEdit,
  onBill,
  onReceipt,
}: {
  acc: AccState;
  deal: AccDeal;
  item: Installment;
  index: number;
  today: string;
  onEdit: () => void;
  onBill: () => void;
  onReceipt: (v: Invoice) => void;
}) {
  const router = useRouter();
  const pending = seqStatus(acc, deal.no, p.seq) === "pending";
  const inv = pending ? null : invoiceOf(acc, deal.no, p.seq);
  const rc = inv ? receiptOf(acc, inv.no) : null;
  const owed = inv ? invoiceDue(inv) > 0 && invoiceStatus(acc, inv) !== "cancelled" : false;
  const docBtn =
    "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] text-[12.5px] font-semibold";

  return (
    <div className="grid grid-cols-[auto_auto_1fr_auto] items-center gap-x-2.5 gap-y-1 rounded-[14px] bg-[#FAF6F7] px-3 py-2.5 text-[#2A1F22]">
      <b className="col-span-3 text-[14px] font-bold">งวดที่ {p.seq}</b>
      <button
        type="button"
        data-ceo-hide
        aria-label={`แก้งวดที่ ${p.seq}`}
        className="row-span-2 grid size-[34px] place-items-center rounded-full text-[#8A7E81] hover:text-[#C8102E] active:text-[#C8102E]"
        onClick={onEdit}
      >
        <PencilIcon className="size-[17px]" strokeWidth={2} />
      </button>
      <span className="num text-[13px] text-[#6E6164]">{p.pct}%</span>
      <span className="num col-span-2 text-[14px] font-bold">{baht(p.amount)} ฿</span>

      {pending ? (
        canBill(acc, deal, index) ? (
          <button
            type="button"
            data-ceo-hide
            className="col-span-4 mt-1.5 h-9 rounded-[11px] bg-[#C8102E] text-[13px] font-semibold text-white"
            onClick={onBill}
          >
            ออกใบแจ้งหนี้
          </button>
        ) : (
          <p className="col-span-4 mt-1 text-center text-[12.5px] text-[#8A7E81]">รอชำระงวดก่อนหน้า</p>
        )
      ) : (
        inv && (
          <div className="col-span-4 mt-1.5 border-t-[1.5px] border-dashed border-[#ECE3E5] pt-2.5">
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="num text-[12.5px] font-bold">{inv.no}</span>
              <PhoneDueBadge invoice={inv} today={today} />
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`${docBtn} border border-[#E6DADD] bg-white text-[#2A1F22]`}
                onClick={() => router.push(invoiceHref(inv.no))}
              >
                <DownloadIcon className="size-[15px]" strokeWidth={2.2} />
                ใบแจ้งหนี้
              </button>
              {owed ? (
                <button
                  type="button"
                  data-ceo-hide
                  className={`${docBtn} bg-[#C8102E] text-white`}
                  onClick={() => onReceipt(inv)}
                >
                  ออกใบเสร็จ
                </button>
              ) : rc ? (
                <button
                  type="button"
                  className={`${docBtn} border border-[#E6DADD] bg-white text-[#2A1F22]`}
                  onClick={() => router.push(receiptHref(rc.no))}
                >
                  <DownloadIcon className="size-[15px]" strokeWidth={2.2} />
                  ใบเสร็จ
                </button>
              ) : null}
            </div>
          </div>
        )
      )}
    </div>
  );
}

/** ป้ายวันครบกำหนดบนมือถือ — ข้อความชุดเดียวกับ DueBadge */
function PhoneDueBadge({ invoice, today }: { invoice: Invoice; today: string }) {
  const pill = "inline-flex h-[22px] items-center rounded-full px-2 text-[11.5px] font-semibold";
  if (invoiceDue(invoice) <= 0) return <span className={`${pill} bg-[#E7F5EC] text-[#1C7A43]`}>ชำระแล้ว</span>;
  const n = daysBetween(invoice.due, today);
  if (n > 0) return <span className={`${pill} bg-[#FDE8EB] text-[#C0121F]`}>เกินกำหนด {n} วัน</span>;
  if (n === 0) return <span className={`${pill} bg-[#FFF1DC] text-[#9A5B00]`}>ครบกำหนดวันนี้</span>;
  if (n >= -7) return <span className={`${pill} bg-[#FFF1DC] text-[#9A5B00]`}>เหลืออีก {-n} วัน</span>;
  return <span className={`${pill} bg-[#F2EAEC] text-[#6E6164]`}>เหลืออีก {-n} วัน</span>;
}

const DW = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/**
 * ปฏิทินเดือนเดียวของมือถือ — ใช้ทั้งในแผ่นเลือกวันกรองรายการ และในกล่องออกใบแจ้งหนี้
 * days = วันที่มีข้อมูล (จุดแดงใต้เลข) · minIso = วันก่อนหน้านี้กดไม่ได้ · lockPast = ย้อนไปเดือนก่อนเดือนนี้ไม่ได้
 */
function MonthCal({
  month,
  onMonth,
  selected,
  onPick,
  today,
  days,
  minIso = "",
  lockPast = false,
  cell = 46,
}: {
  month: Date;
  onMonth: (d: Date) => void;
  selected: string;
  onPick: (iso: string) => void;
  today: string;
  days?: Set<string>;
  minIso?: string;
  lockPast?: boolean;
  cell?: number;
}) {
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = new Date(y, m, 1).getDay();
  const count = new Date(y, m + 1, 0).getDate();
  const atNow = `${y}-${String(m + 1).padStart(2, "0")}` <= today.slice(0, 7);
  const nav = "grid size-9 place-items-center rounded-full bg-[#F7EFF1] text-[#2A1F22] disabled:opacity-35";

  return (
    <div>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className={nav}
          aria-label="เดือนก่อนหน้า"
          disabled={lockPast && atNow}
          onClick={() => onMonth(new Date(y, m - 1, 1))}
        >
          <ChevronLeftIcon className="size-4" strokeWidth={2.4} />
        </button>
        <p className="text-[15px] font-bold text-[#2A1F22]">
          {TH_MONTHS_FULL[m]} {y + 543}
        </p>
        <button
          type="button"
          className={nav}
          aria-label="เดือนถัดไป"
          onClick={() => onMonth(new Date(y, m + 1, 1))}
        >
          <ChevronRightIcon className="size-4" strokeWidth={2.4} />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-7 text-center text-[12px] font-semibold text-[#8A7E81]">
        {DW.map((w) => (
          <span key={w} className="py-1">
            {w}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`b${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const iso = toIsoDate(new Date(y, m, i + 1));
          const on = iso === selected;
          const off = Boolean(minIso) && iso < minIso;
          const isToday = iso === today;
          return (
            <button
              key={iso}
              type="button"
              disabled={off}
              aria-pressed={on}
              aria-label={thaiDate(iso)}
              onClick={() => onPick(iso)}
              className="relative grid place-items-center disabled:cursor-default"
              style={{ height: cell }}
            >
              <span
                className={`num grid size-9 place-items-center rounded-full text-[14.5px] ${
                  on
                    ? "bg-[#C8102E] font-bold text-white"
                    : off
                      ? "text-[#CFC5C8]"
                      : isToday
                        ? "font-bold text-[#C8102E]"
                        : "text-[#2A1F22]"
                }`}
              >
                {i + 1}
              </span>
              {days?.has(iso) && !on && (
                <span className="absolute bottom-[3px] left-1/2 size-[5px] -translate-x-1/2 rounded-full bg-[#C8102E]" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** แผ่นเลือกวันจากด้านล่างจอ (มือถือ) — เลือกวันแล้วกรองรายการเหลือวันนั้น · ดูทั้งหมด = ล้างวันที่ */
function DayPickSheet({
  days,
  selected,
  onPick,
  onAll,
  onClose,
}: {
  days: Set<string>;
  selected: string;
  onPick: (iso: string) => void;
  onAll: () => void;
  onClose: () => void;
}) {
  const today = todayIso();
  const [month, setMonth] = useState(() => {
    const base = selected ? new Date(`${selected}T00:00:00`) : bkkNow();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-80 flex items-end bg-black/50 md:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="เลือกวันที่"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full overflow-auto rounded-t-[24px] bg-white px-[18px] pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3.5 h-[5px] w-10 rounded-full bg-[#E3D8DB]" aria-hidden="true" />
        <MonthCal month={month} onMonth={setMonth} selected={selected} onPick={onPick} today={today} days={days} />
        <button
          type="button"
          className="mt-3 h-12 w-full rounded-[14px] bg-[#F7EFF1] text-[14px] font-semibold text-[#2A1F22]"
          onClick={onAll}
        >
          ดูทั้งหมด
        </button>
      </div>
    </div>,
    document.body,
  );
}

/**
 * แบ่งงวดชำระเงิน — ยอดรวมทุกงวดต้องเท่ากับยอดสุทธิพอดีจึงบันทึกได้ (AC-BR-03)
 * งวดที่ออกใบแจ้งหนี้แล้วแก้และลบไม่ได้ เพราะเอกสารออกเลขแล้ว
 *
 * ตั้งต้นตามเงื่อนไขชำระเงินในใบเสนอราคาที่ฝ่ายขายตกลงกับลูกค้า ไม่ใช่ครึ่ง-ครึ่งลอย ๆ
 * อ่านเป็นสัดส่วนไม่ได้ก็ปล่อยช่องว่างไว้ให้กรอกเอง (parseTermsPct) — เดาผิดอันตรายกว่าไม่เดา
 */
function PlanDialog({
  deal,
  acc,
  terms,
  focusSeq = null,
  onClose,
  onSaved,
}: {
  deal: AccDeal;
  acc: AccState;
  /** ข้อความเงื่อนไขชำระเงินตามใบเสนอราคา ดิบ ๆ อย่างที่ฝ่ายขายพิมพ์ */
  terms: string;
  /** มือถือ: งวดที่กดดินสอมา — เลื่อนไปหา ไฮไลต์ครู่หนึ่ง แล้วโฟกัสช่องสัดส่วน */
  focusSeq?: number | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const phoneRows = useRef<HTMLDivElement>(null);
  /* กล่องสร้างใหม่ทุกครั้งที่เปิด ไฮไลต์จึงเริ่มจากงวดที่กดมาเลย แล้วดับเองใน 1.6 วินาที */
  const [flash, setFlash] = useState<number | null>(focusSeq);
  useEffect(() => {
    if (focusSeq == null) return;
    const row = phoneRows.current?.querySelector<HTMLElement>(`[data-seq="${focusSeq}"]`);
    if (row && row.offsetParent) {
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      row.querySelector<HTMLInputElement>("input[data-pct]")?.focus({ preventScroll: true });
    }
    const t = window.setTimeout(() => setFlash(null), 1600);
    return () => window.clearTimeout(t);
  }, [focusSeq]);
  const pcts = parseTermsPct(terms);
  /* เติมตัวเลขให้เฉพาะดีลที่ยังไม่เคยแบ่งงวด และเงื่อนไขอ่านออกชัดเจนเท่านั้น */
  const prefilled = deal.plan.length === 0 && Boolean(pcts);
  const [rows, setRows] = useState<Installment[]>(() =>
    deal.plan.length
      ? deal.plan.map((p) => ({ ...p }))
      : pcts
        ? planFromPct(deal.net, pcts)
        : /* ไม่เดา — งวดเปล่าหนึ่งแถวไว้ให้เริ่มพิมพ์ */
          [{ seq: 1, pct: 0, amount: 0, due: "" }],
  );
  const locked = (i: number) => seqLocked(acc, deal.no, rows[i].seq);

  const total = round2(rows.reduce((a, r) => a + r.amount, 0));
  const diff = round2(deal.net - total);

  function edit(i: number, patch: Partial<Installment>) {
    setRows((list) => list.map((r, x) => (x === i ? { ...r, ...patch } : r)));
  }
  /* ช่องที่กำลังพิมพ์อยู่เก็บเป็นข้อความดิบ ไม่จัดรูปทุกครั้งที่กดแป้น
     (ไม่งั้นพิมพ์เลขหลายหลักหรือจุดทศนิยมไม่ได้) ออกจากช่องแล้วค่อยจัดรูป */
  const [draft, setDraft] = useState<{ i: number; f: "pct" | "amt"; v: string } | null>(null);
  const shown = (i: number, f: "pct" | "amt", fmt: string) =>
    draft && draft.i === i && draft.f === f ? draft.v : fmt;

  return (
    <Sheet
      title="แบ่งงวดชำระเงิน"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`btn glass-thin ${PHONE_FOOT} max-md:flex-1!`} onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={`btn solid btn-solid disabled:opacity-45 ${PHONE_FOOT} max-md:flex-[1.4]!`}
            disabled={diff !== 0}
            onClick={() => {
              savePlan(
                deal.no,
                rows.map((r, i) => ({ ...r, seq: i + 1 })),
              );
              onSaved();
            }}
          >
            บันทึกงวด
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        <b className="font-semibold">{deal.cus}</b>
        <br />
        <span className="text-[12.5px] text-muted-foreground">
          อ้างอิงใบเสนอราคา {deal.quo} ส่งเมื่อ {thaiDate(deal.quoDate)}
          <br />
          ยอดสุทธิ {baht(deal.net)} บาท
        </span>
      </p>

      {/* เงื่อนไขที่ตกลงกับลูกค้าไว้ ต้องเห็นข้อความเดิมเต็ม ๆ ก่อนตั้งงวดเสมอ */}
      <div className="mt-3 rounded-[10px] bg-muted/50 px-3 py-2.5 text-[12.5px] leading-relaxed">
        <p className="text-[11px] text-muted-foreground">
          เงื่อนไขชำระเงินตามใบเสนอราคา <span className="num">{deal.quo}</span>
        </p>
        {terms.trim() ? (
          <p className="mt-0.5 font-semibold whitespace-pre-line">{terms.trim()}</p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">ใบเสนอราคาไม่ได้ระบุเงื่อนไขชำระเงิน</p>
        )}
        {deal.plan.length === 0 && (
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {prefilled
              ? "ตั้งงวดตามเงื่อนไขนี้ให้แล้ว แก้ได้ถ้าตกลงกับลูกค้าเป็นอย่างอื่น"
              : "อ่านเป็นสัดส่วนงวดไม่ได้แน่ชัด จึงไม่เดาตัวเลขให้ กรุณากรอกตามเงื่อนไขข้างบน"}
          </p>
        )}
      </div>

      {/* มือถือ: งวดละการ์ด ช่องใหญ่พอให้นิ้วกด · งวดที่ออกใบแล้วล็อกไว้ */}
      <div ref={phoneRows} className="mt-3 flex flex-col gap-2 md:hidden">
        {rows.map((r, i) => {
          const lock = locked(i);
          const cap = "mb-1 block text-[11px] text-[#8A7E81]";
          const box = `field-control h-[42px] w-full rounded-[10px] px-2.5 text-[15px] ${
            lock ? "bg-muted text-muted-foreground" : ""
          }`;
          return (
            <div
              key={i}
              data-seq={i + 1}
              className={`grid grid-cols-[62px_minmax(0,1fr)_minmax(0,1.5fr)_36px] items-end gap-2 rounded-[14px] border border-[#EFE6E8] px-3 py-2.5 transition-shadow ${
                lock ? "bg-[#FAF6F7]" : "bg-white"
              } ${flash === i + 1 ? "shadow-[inset_0_0_0_2px_#C8102E]" : ""}`}
            >
              <div>
                {lock && <span className={cap}>ออกใบแล้ว</span>}
                <p className="flex h-[42px] items-center text-[14px] font-bold text-[#2A1F22]">
                  <span className="mr-1 font-semibold text-[#6E6164]">งวดที่</span>
                  {i + 1}
                </p>
              </div>
              <label className="min-w-0">
                <span className={cap}>สัดส่วน (%)</span>
                {lock ? (
                  <input data-pct className={`${box} text-center`} value={r.pct} readOnly tabIndex={-1} />
                ) : (
                  <input
                    data-pct
                    className={`${box} text-center`}
                    inputMode="decimal"
                    value={shown(i, "pct", r.pct ? String(r.pct) : "")}
                    placeholder="0"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setDraft({ i, f: "pct", v });
                      const pct = parseFloat(v) || 0;
                      edit(i, { pct, amount: round2((deal.net * pct) / 100) });
                    }}
                    onBlur={() => setDraft(null)}
                  />
                )}
              </label>
              <label className="min-w-0">
                <span className={cap}>จำนวนเงิน (บาท)</span>
                {lock ? (
                  <input className={`${box} num text-right`} value={baht(r.amount)} readOnly tabIndex={-1} />
                ) : (
                  <input
                    className={`${box} num text-right`}
                    inputMode="decimal"
                    value={shown(i, "amt", r.amount ? baht(r.amount) : "")}
                    placeholder="0.00"
                    onChange={(e) => {
                      const v = commaInput(e.target.value);
                      setDraft({ i, f: "amt", v });
                      const amount = parseFloat(v.replace(/,/g, "")) || 0;
                      edit(i, {
                        amount: round2(amount),
                        pct: deal.net ? Math.round((amount * 10000) / deal.net) / 100 : 0,
                      });
                    }}
                    onBlur={() => setDraft(null)}
                  />
                )}
              </label>
              {lock ? (
                <span />
              ) : (
                <button
                  type="button"
                  className="grid h-[42px] w-9 place-items-center rounded-[10px] text-[#8A7E81] active:bg-[#F7EFF1] active:text-[#C8102E]"
                  aria-label={`ลบงวดที่ ${i + 1}`}
                  onClick={() => {
                    setDraft(null);
                    setRows((l) => l.filter((_, x) => x !== i));
                  }}
                >
                  <TrashIcon className="size-4" strokeWidth={2} />
                </button>
              )}
            </div>
          );
        })}
        <div className="flex items-center justify-between rounded-[14px] bg-[#FAF4F5] px-3.5 py-3 text-[14px] text-[#2A1F22]">
          <span className="font-semibold">รวมทุกงวด</span>
          <b className="num font-bold">{baht(total)}</b>
        </div>
        <button
          type="button"
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[14px] border-[1.5px] border-dashed border-[#E3D3D7] text-[14px] font-semibold text-[#2A1F22]"
          onClick={() => setRows((l) => [...l, { seq: l.length + 1, pct: 0, amount: 0, due: "" }])}
        >
          <PlusIcon className="size-[15px]" strokeWidth={2.2} />
          เพิ่มงวด
        </button>
        <p className="text-center text-[12.5px] font-semibold">
          {diff === 0 ? (
            <span className="text-[var(--success)]">ตรงกับยอดสุทธิ</span>
          ) : (
            <span className="text-destructive">ต่างจากยอดสุทธิ {baht(Math.abs(diff))} บาท</span>
          )}
        </p>
      </div>

      <table className="sheet mt-3 max-md:hidden!">
        <thead>
          <tr>
            <th className="c" style={{ width: 70 }}>งวดที่</th>
            <th className="c" style={{ width: 110 }}>สัดส่วน (%)</th>
            <th className="r" style={{ width: 170 }}>จำนวนเงิน (บาท)</th>
            <th className="c" style={{ width: 46 }} />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) =>
            locked(i) ? (
              <tr key={i}>
                <td data-label="งวดที่" className="c num">{i + 1}</td>
                <td data-label="สัดส่วน (%)">
                  <input className="c bg-muted text-muted-foreground" value={r.pct} readOnly tabIndex={-1} aria-label={`สัดส่วนงวดที่ ${i + 1}`} />
                </td>
                <td data-label="จำนวนเงิน (บาท)">
                  <input className="r num bg-muted text-muted-foreground" value={baht(r.amount)} readOnly tabIndex={-1} aria-label={`จำนวนเงินงวดที่ ${i + 1}`} />
                </td>
                <td className="c">
                  <span className="why whitespace-nowrap">ออกใบแล้ว</span>
                </td>
              </tr>
            ) : (
              <tr key={i}>
                <td data-label="งวดที่" className="c num">{i + 1}</td>
                <td data-label="สัดส่วน (%)">
                  <input
                    className="c"
                    inputMode="decimal"
                    value={shown(i, "pct", r.pct ? String(r.pct) : "")}
                    placeholder="0"
                    aria-label={`สัดส่วนงวดที่ ${i + 1}`}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, "");
                      setDraft({ i, f: "pct", v });
                      const pct = parseFloat(v) || 0;
                      edit(i, { pct, amount: round2((deal.net * pct) / 100) });
                    }}
                    onBlur={() => setDraft(null)}
                  />
                </td>
                <td data-label="จำนวนเงิน (บาท)">
                  <input
                    className="r num"
                    inputMode="decimal"
                    value={shown(i, "amt", r.amount ? baht(r.amount) : "")}
                    placeholder="0.00"
                    aria-label={`จำนวนเงินงวดที่ ${i + 1}`}
                    onChange={(e) => {
                      const v = commaInput(e.target.value);
                      setDraft({ i, f: "amt", v });
                      const amount = parseFloat(v.replace(/,/g, "")) || 0;
                      edit(i, {
                        amount: round2(amount),
                        pct: deal.net ? Math.round((amount * 10000) / deal.net) / 100 : 0,
                      });
                    }}
                    onBlur={() => setDraft(null)}
                  />
                </td>
                <td className="c">
                  <button
                    type="button"
                    className="del"
                    aria-label={`ลบงวดที่ ${i + 1}`}
                    onClick={() => {
                      setDraft(null);
                      setRows((l) => l.filter((_, x) => x !== i));
                    }}
                  >
                    <TrashIcon className="size-3.5" strokeWidth={2} />
                  </button>
                </td>
              </tr>
            ),
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="r tsum">รวมทุกงวด</td>
            <td className="r tsum num">{baht(total)}</td>
            <td className="tsum" />
          </tr>
        </tfoot>
      </table>

      <div className="mt-3 flex flex-wrap items-center gap-3.5 max-md:hidden!">
        <button
          type="button"
          className="btn glass-thin"
          onClick={() =>
            setRows((l) => [...l, { seq: l.length + 1, pct: 0, amount: 0, due: "" }])
          }
        >
          <PlusIcon className="size-[15px]" strokeWidth={2.2} />
          เพิ่มงวด
        </button>
        <p className="ml-auto text-right">
          {diff === 0 ? (
            <span className="text-[12.5px] font-semibold text-[var(--success)]">
              ตรงกับยอดสุทธิ
            </span>
          ) : (
            <span className="text-[12.5px] font-semibold text-destructive">
              ต่างจากยอดสุทธิ {baht(Math.abs(diff))} บาท
            </span>
          )}
        </p>
      </div>
    </Sheet>
  );
}

/** ออกใบแจ้งหนี้ — ต้องเลือกวันครบกำหนดก่อน (เริ่มว่างทุกครั้ง) เพราะเอกสารออกเลขแล้วแก้วันไม่ได้ง่าย ๆ */
function BillDialog({
  deal,
  item,
  phone = false,
  onClose,
  onDone,
}: {
  deal: AccDeal;
  item: Installment;
  /** มือถือ: หัวกล่องเป็นชื่อลูกค้า */
  phone?: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [due, setDue] = useState("");
  /* มือถือ: ปฏิทินในกล่องเริ่มที่เดือนนี้และยังไม่เลือกวันทุกครั้งที่เปิด (กล่องสร้างใหม่ทุกครั้ง) */
  const today = todayIso();
  const [calMonth, setCalMonth] = useState(() => {
    const n = bkkNow();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });

  return (
    <Sheet
      title={phone ? deal.cus : "ออกใบแจ้งหนี้"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className={`btn glass-thin ${PHONE_FOOT} max-md:flex-1!`} onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className={`btn solid btn-solid disabled:opacity-45 ${PHONE_FOOT} max-md:flex-[1.4]!`}
            disabled={!due}
            onClick={() => {
              issueInvoice(deal.no, item.seq, due);
              onDone();
            }}
          >
            ออกใบแจ้งหนี้
          </button>
        </>
      }
    >
      {/* มือถือ: ชื่อลูกค้าอยู่หัวกล่องแล้ว · งวดกับยอดในกล่องเดียว แล้วเลือกวันจากปฏิทินในกล่องเลย */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-[#FAF4F5] px-3.5 py-3 text-[#2A1F22]">
          <span className="text-[13.5px] text-[#6E6164]">
            งวดที่ {item.seq} จาก {deal.plan.length}
          </span>
          <b className="num text-[16px] font-bold">{baht(item.amount)} ฿</b>
        </div>
        <p className="mt-4 mb-1.5 text-[13px] font-semibold text-[#2A1F22]">วันครบกำหนดชำระ</p>
        <input
          readOnly
          tabIndex={-1}
          aria-label="วันครบกำหนดชำระ"
          value={due ? thaiDate(due) : ""}
          placeholder="เลือกวันที่จากปฏิทินด้านล่าง"
          className="field-control h-[46px] w-full rounded-[12px] px-3.5 text-[15px] font-bold placeholder:font-normal"
        />
        <div className="mt-3 rounded-[14px] border border-[#EFE6E8] px-2.5 py-3">
          <MonthCal
            month={calMonth}
            onMonth={setCalMonth}
            selected={due}
            onPick={setDue}
            today={today}
            minIso={today}
            lockPast
            cell={42}
          />
        </div>
      </div>

      {/* ลูกค้า งวด และยอด อยู่คนละบรรทัดตามต้นแบบ (dueWho) */}
      <p className="text-[13.5px] leading-relaxed max-md:hidden">
        <b className="font-semibold">{deal.cus}</b>
        <br />
        <span className="text-[12.5px] text-muted-foreground">
          งวดที่ {item.seq} จาก {deal.plan.length}
          <br />
          ยอด {baht(item.amount)} บาท
        </span>
      </p>

      <div className="mt-4 max-md:hidden">
        <Field label="วันครบกำหนดชำระ">
          <DateField
            value={due}
            onChange={(iso) => setDue(iso)}
            label="วันครบกำหนดชำระ"
            placeholder="เลือกวันที่"
            className="h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Field>
      </div>

      <p className="mt-3 text-[11.5px] leading-relaxed text-muted-foreground">
        เอกสารออกเลขแล้วห้ามลบและห้ามยกเลิกเพื่อออกใหม่ หากผิดต้องแก้ในใบเดิม
      </p>
    </Sheet>
  );
}

/** บันทึกการติดตามหนี้ — ช่องทางเป็นปุ่มแบ่งช่อง ตัวเลือกมาจากที่ผู้ดูแลระบบตั้งไว้ (collectChannel) */
function CollectDialog({
  invoice,
  today,
  onClose,
}: {
  invoice: Invoice;
  today: string;
  onClose: () => void;
}) {
  const channels = optionsOf("collectChannel");
  const [channel, setChannel] = useState(() => channels[0] ?? "");
  /* เพิ่มช่องทางใหม่ได้จากหน้างาน (เจ้าของสั่ง 28 ก.ย. 2569) — เพิ่มแล้วเลือกให้เลย */
  const addChannel = useAddOption({ list: "collectChannel" }, setChannel);
  const [result, setResult] = useState("");
  const [next, setNext] = useState("");
  const resultBox = useRef<HTMLDivElement>(null);

  return (
    <Sheet
      title="บันทึกการติดตามหนี้"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => {
              /* ต้องมีผลการติดตาม — ว่างอยู่ให้กลับไปที่ช่องนั้น */
              if (!result.trim()) return resultBox.current?.querySelector("textarea")?.focus();
              logCollection(invoice.no, { date: today, channel, result: result.trim(), next });
              onClose();
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      {/* เลขที่ · ลูกค้า · ยอดคงเหลือ แยกเป็นสามบรรทัดตาม mockup (colWho) */}
      <p className="flex flex-col gap-2.5 text-[13.5px] leading-normal">
        <span>{invoice.no}</span>
        <span>{invoice.cus}</span>
        <span>คงเหลือ {baht(invoiceDue(invoice))} บาท</span>
      </p>

      <div className="mt-4 grid gap-4">
        <Field label="วันที่ติดตาม">
          <input
            value={thaiDate(today)}
            readOnly
            className="field-control h-[38px] w-full rounded-[10px] px-3 text-[13.5px]"
          />
        </Field>
        <Field label="ช่องทาง">
          <div className="seg" role="radiogroup" aria-label="ช่องทาง">
            {channels.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={channel === c}
                className={channel === c ? "on" : ""}
                onClick={() => setChannel(c)}
              >
                {c}
              </button>
            ))}
            {addChannel.canAdd && (
              <button type="button" onClick={() => addChannel.pick(ADD_VALUE)}>
                ＋ เพิ่ม
              </button>
            )}
          </div>
        </Field>
        {addChannel.dialog}
        <Field label="ผลการติดตาม">
          <div ref={resultBox}>
          <Textarea
            value={result}
            onChange={(e) => setResult(e.target.value)}
            placeholder="ลูกค้าตอบว่าอย่างไร"
          />
          </div>
        </Field>
        <Field label="วันนัดติดตามครั้งถัดไป">
          <DateField
            value={next}
            onChange={(iso) => setNext(iso)}
            label="วันนัดติดตามครั้งถัดไป"
            placeholder="เลือกวันที่"
            clearable
            className="h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Field>
      </div>
    </Sheet>
  );
}
