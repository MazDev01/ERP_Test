"use client";

/*
 * ★ หน้านี้ "พักไว้" ทั้งหน้า — ไม่มี route เรียกแล้ว และไม่มีเมนูไหนพามาถึง
 *   เจ้าของระบบสั่ง 24 ก.ย. 2569 ว่าบริษัทไม่ได้ทำงานแบบนี้ เอกสารสามชนิดนี้
 *   ออกจากโปรแกรมบัญชีของฝ่ายบัญชีเอง ไม่ใช่จากระบบนี้ · เก็บโค้ดไว้เผื่อต้องเปิดใช้ใหม่
 *   รายการสิ่งที่ต้องทำตอนเปิดคืนอยู่ที่หัวข้อเอกสารพักไว้ใน src/lib/acc-data.ts
 *
 * ใบลดหนี้ · ใบเพิ่มหนี้ · คืนเงินลูกค้า — /acc/credits (เดิม)
 *
 * สี่ข้อที่เจ้าของระบบตัดสินไว้ (24 ก.ย. 2569) อยู่ในหน้านี้ทั้งหมด
 *   1. ลดหนี้บางส่วนได้ แต่รวมทุกใบของใบแจ้งหนี้หนึ่งใบต้องไม่เกินยอดตามใบนั้น — ปุ่มบันทึกดับและสโตร์ไม่รับ
 *   2. ออกใบลดหนี้ผิด แก้ด้วยใบเพิ่มหนี้เท่านั้น ไม่มีปุ่มลบและไม่มีปุ่มแก้ยอดของใบที่ออกเลขแล้ว
 *   3. คืนเงินเป็นคนละแท็บและคนละระเบียน ลดหนี้แล้วไม่คืนเงินก็ได้ คืนทีหลังก็ได้
 *      ลำดับคือ ขอ → ผู้บริหารอนุมัติ → โอน → บันทึกหลักฐาน (เจ้าของระบบสั่งแก้ 24 ก.ย. 2569)
 *      กล่องขอจึงกรอกได้แค่ใบลดหนี้ ยอด เหตุผล และบัญชีปลายทาง วันที่โอนกับหลักฐานอยู่ที่กล่อง "บันทึกการโอน"
 *   4. ผู้บริหารอนุมัติทั้งใบลดหนี้ ใบเพิ่มหนี้ และการคืนเงิน เลขที่ออกตอนอนุมัติ ไม่ใช่ตอนกดขอ
 *      (ข้อ 4 ขยายให้ครอบคลุมใบเพิ่มหนี้เมื่อ 24 ก.ย. 2569 — แก้เอกสารภาษีหรือแตะเงินที่ออกไปแล้ว ต้องผ่านผู้บริหาร)
 *
 * ออกได้เฉพาะฝ่ายบัญชี (AC-BR-16) ผู้บริหารและผู้จัดการทั่วไปเปิดหน้านี้ได้แบบดูอย่างเดียว
 */

import { Fragment, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CREDIT_REASON,
  DOC_APPROVAL,
  ISSUER_VAT,
  REFUND_STATUS,
  creditKind,
  debitKind,
  type CreditNote,
  type CreditReason,
  type DebitNote,
  type Invoice,
  type Refund,
} from "@/lib/acc-data";
import {
  creditNet,
  creditRoom,
  creditedTotal,
  debitRoom,
  debitsOfCredit,
  recordRefundTransfer,
  refundRoom,
  refundsToPay,
  requestCreditNote,
  requestDebitNote,
  requestRefund,
  resubmitCreditNote,
  resubmitDebitNote,
  resubmitRefund,
  useAcc,
  type AccState,
} from "@/lib/acc-store";
import { taxInvoiceBuyer, type TaxInvoiceBuyer } from "@/lib/crm-data";
import { customerOfDeal, useCrm, type CrmState } from "@/lib/crm-store";
import { baht, commaInput, round2, thaiDate, thaiStamp, todayIso } from "@/lib/format";
import { useRole } from "@/lib/role";
import { useFindParam } from "@/lib/deep-link";
import { AccFilters, NewDot, useAccFilter } from "./acc-ui";
import { PhoneCard, PhoneList } from "./acchr-phone";
import { Sheet } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";
import { Field } from "./ui";

type TabKey = "credit" | "debit" | "refund";

/** ที่อยู่หน้าเอกสารใบลดหนี้และใบเพิ่มหนี้ — อยู่ใต้เมนูใบลดหนี้ สิทธิ์เข้าหน้าจึงตามเมนูนี้ */
export function creditHref(no: string) {
  return `/acc/credits/${encodeURIComponent(no)}`;
}

/** ข้อมูลผู้ซื้อของใบแจ้งหนี้ใบหนึ่ง — เอกสารภาษีออกไม่ได้ถ้ายังไม่ครบ */
function buyerOf(crm: CrmState, acc: AccState, inv: Invoice): TaxInvoiceBuyer {
  const quo = acc.deals.find((d) => d.no === inv.deal)?.quo ?? "";
  return taxInvoiceBuyer(customerOfDeal(crm, inv.deal, quo, inv.cus));
}

/**
 * ช่องข้อมูลผู้ซื้อที่ยังขาดของใบแจ้งหนี้ใบหนึ่ง — ว่าง = ครบ ออกเอกสารภาษีได้
 * ใช้ทั้งตอนฝ่ายบัญชีขอออกใบลดหนี้ และตอนผู้บริหารจะอนุมัติ
 * เพราะคำขอที่ระบบตั้งให้เองตอนยกเลิกดีลไม่ได้ผ่านกล่องของฝ่ายบัญชี
 */
export function buyerGapsOf(crm: CrmState, acc: AccState, invoiceNo: string) {
  const inv = acc.invoices.find((v) => v.no === invoiceNo);
  if (!inv || !ISSUER_VAT) return [];
  return buyerOf(crm, acc, inv).missing;
}

export function AccCreditsPage() {
  const acc = useAcc();
  const crm = useCrm();
  const router = useRouter();
  const params = useSearchParams();
  /* ?inv= จากหน้าวางบิล — เปิดกล่องขอใบลดหนี้ของใบนั้นให้เลย ไม่ต้องไล่หาในรายการ */
  const wantInv = params.get("inv") ?? "";
  const wantTab = params.get("tab");
  const find = useFindParam();
  const filter = useAccFilter(find);
  const { hit, inRange } = filter;
  /* ดูอย่างเดียวสำหรับผู้บริหารและผู้จัดการทั่วไป — ปุ่มที่เปลี่ยนข้อมูลไม่แสดง (AC-BR-16) */
  const readOnly = useRole() !== "acc";

  const [tab, setTab] = useState<TabKey>(() =>
    wantTab === "debit" || wantTab === "refund" ? wantTab : "credit",
  );
  const [asking, setAsking] = useState<string | null>(wantInv || null);
  const [fixing, setFixing] = useState<CreditNote | null>(null);
  const [fixingAgain, setFixingAgain] = useState<DebitNote | null>(null);
  const [refunding, setRefunding] = useState<CreditNote | null>(null);
  /* คำขอคืนเงินที่ถูกตีกลับ (แก้แล้วส่งใหม่) และรายการที่อนุมัติแล้วรอบันทึกการโอน */
  const [refixing, setRefixing] = useState<Refund | null>(null);
  const [paying, setPaying] = useState<Refund | null>(null);
  const [editing, setEditing] = useState<CreditNote | null>(null);

  /* ใบลดหนี้ใหม่สุดก่อน · ใบที่ยังไม่ออกเลขเรียงตามวันที่ขอ */
  const credits = acc.credits
    .filter((c) => hit(c.no, c.inv, c.cus, c.deal) && inRange(c.issue || c.reqAt.slice(0, 10)))
    .sort((a, b) => (b.issue || b.reqAt).localeCompare(a.issue || a.reqAt));
  /* ใบเพิ่มหนี้ที่ยังไม่ออกเลขเรียงตามวันที่ขอ เหมือนใบลดหนี้ */
  const debits = acc.debits
    .filter((d) => hit(d.no, d.credit, d.cus, d.inv) && inRange(d.issue || d.reqAt.slice(0, 10)))
    .sort((a, b) => (b.issue || b.reqAt).localeCompare(a.issue || a.reqAt));
  /* รายการที่ยังไม่ได้โอนยังไม่มีวันที่โอน เรียงและกรองด้วยวันที่ขอแทน เหมือนใบลดหนี้ที่ยังไม่ออกเลข */
  const refunds = acc.refunds
    .filter((r) => hit(r.no, r.credit, r.cus, r.inv) && inRange(r.paidDate || r.reqAt.slice(0, 10)))
    .sort((a, b) => (b.paidDate || b.reqAt).localeCompare(a.paidDate || a.reqAt));
  /* อนุมัติแล้วแต่ยังไม่ได้บันทึกการโอน — จุดแดงบนแท็บ ห้ามให้เงียบหายหลังผู้บริหารอนุมัติ */
  const toPay = refundsToPay(acc).length;

  /* ใบแจ้งหนี้ที่ยังลดหนี้ได้ — ใบที่ลดเต็มยอดแล้วไม่อยู่ในรายการ */
  const openInvoices = acc.invoices.filter((v) => creditRoom(acc, v.no) > 0);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>ใบลดหนี้ / คืนเงิน</h1>
          <p>
            ใบลดหนี้ลดยอดวางบิลและยอดค้างชำระ · การคืนเงินคือเงินที่ออกจากบริษัทจริง แยกกันคนละรายการ
          </p>
        </div>
        {!readOnly && (
          <div className="tools w-full sm:w-auto">
            <button
              type="button"
              className="btn solid btn-solid btn-block-mobile"
              data-ceo-hide
              onClick={() => setAsking("")}
            >
              ขอออกใบลดหนี้
            </button>
          </div>
        )}
      </div>

      {readOnly && (
        <p className="rounded-[10px] bg-muted px-3.5 py-[9px] text-[12.5px] font-semibold text-muted-foreground">
          ดูอย่างเดียว · ฝ่ายบัญชีเป็นผู้ออกใบลดหนี้ ใบเพิ่มหนี้ และบันทึกการคืนเงิน
        </p>
      )}

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            <button type="button" className={tab === "credit" ? "on" : ""} onClick={() => setTab("credit")}>
              ใบลดหนี้ <b>{credits.length}</b>
            </button>
            <button type="button" className={tab === "debit" ? "on" : ""} onClick={() => setTab("debit")}>
              ใบเพิ่มหนี้ <b>{debits.length}</b>
            </button>
            <button type="button" className={tab === "refund" ? "on" : ""} onClick={() => setTab("refund")}>
              คืนเงินลูกค้า <b>{refunds.length}</b>
              {/* แท็บที่เลือกอยู่บนมือถือพื้นแดง จุดแดงจะจมหาย */}
              {toPay > 0 && (
                <NewDot
                  label={`คืนเงิน ${toPay} รายการรอบันทึกการโอน`}
                  className={`ml-1.5 ${tab === "refund" ? "max-sm:bg-white max-sm:shadow-none" : ""}`}
                />
              )}
            </button>
          </div>
          <AccFilters filter={filter} />
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          {tab === "credit" && (
            <table className="data-table cards-sm min-w-[1080px]">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>เลขที่ใบลดหนี้</th>
                  <th style={{ width: 160 }}>ลูกค้า</th>
                  <th style={{ width: 150 }}>อ้างอิงใบแจ้งหนี้</th>
                  <th style={{ width: 120 }}>วันที่ออก</th>
                  <th className="c" style={{ width: 130 }}>ยอดลดหนี้ (บาท)</th>
                  <th style={{ width: 150 }}>สถานะ</th>
                  <th className="c" style={{ width: 180 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {credits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      ยังไม่มีใบลดหนี้
                    </td>
                  </tr>
                ) : (
                  credits.map((c) => {
                    const fixed = debitsOfCredit(acc, c.no);
                    return (
                      <Fragment key={c.id}>
                        <tr
                          style={{ cursor: c.no ? "pointer" : "default" }}
                          onClick={() => c.no && router.push(creditHref(c.no))}
                        >
                          <td data-label="เลขที่ใบลดหนี้" className="num">
                            {c.no ? (
                              <b className="font-semibold">{c.no}</b>
                            ) : (
                              <span className="why">ออกเลขเมื่ออนุมัติ</span>
                            )}
                            <span className="why">{CREDIT_REASON[c.reasonCode]}</span>
                          </td>
                          <td data-label="ลูกค้า">{c.cus}</td>
                          <td data-label="อ้างอิงใบแจ้งหนี้" className="num muted">
                            {c.inv}
                            {c.receipt && <span className="why">ใบเสร็จ {c.receipt}</span>}
                          </td>
                          <td data-label="วันที่ออก" className="num muted">
                            {c.issue ? thaiDate(c.issue) : <span className="why">ยังไม่ออก</span>}
                          </td>
                          <td data-label="ยอดลดหนี้ (บาท)" className="c num font-semibold">
                            {baht(c.total)}
                            {fixed.length > 0 && (
                              <span className="why">เหลือสุทธิ {baht(creditNet(acc, c))}</span>
                            )}
                          </td>
                          <td data-label="สถานะ">
                            <span className={`tag ${DOC_APPROVAL[c.status].cls}`}>
                              <i />
                              {DOC_APPROVAL[c.status].label}
                            </span>
                            {c.status === "returned" && <span className="why">{c.comment}</span>}
                          </td>
                          <td data-label="จัดการ" className="c">
                            <span className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                              <CreditActions
                                acc={acc}
                                c={c}
                                readOnly={readOnly}
                                onFix={() => setFixing(c)}
                                onRefund={() => setRefunding(c)}
                                onEdit={() => setEditing(c)}
                              />
                            </span>
                          </td>
                        </tr>
                        {fixed.length > 0 && (
                          <tr className="sub">
                            <td colSpan={7}>
                              <p className="px-1 py-1.5 text-[12.5px] text-muted-foreground">
                                แก้ไขด้วยใบเพิ่มหนี้{" "}
                                {fixed.map((d) => `${d.no} (${baht(d.total)} บาท)`).join(" · ")}
                              </p>
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

          {tab === "debit" && (
            <table className="data-table cards-sm min-w-[1120px]">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>เลขที่ใบเพิ่มหนี้</th>
                  <th style={{ width: 160 }}>ลูกค้า</th>
                  <th style={{ width: 150 }}>แก้ไขใบลดหนี้</th>
                  <th style={{ width: 120 }}>วันที่ออก</th>
                  <th className="c" style={{ width: 130 }}>ยอดเพิ่มหนี้ (บาท)</th>
                  <th style={{ width: 150 }}>สถานะ</th>
                  <th className="c" style={{ width: 150 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {debits.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      ยังไม่มีใบเพิ่มหนี้
                    </td>
                  </tr>
                ) : (
                  debits.map((d) => (
                    <tr
                      key={d.id}
                      style={{ cursor: d.no ? "pointer" : "default" }}
                      onClick={() => d.no && router.push(creditHref(d.no))}
                    >
                      <td data-label="เลขที่ใบเพิ่มหนี้" className="num">
                        {d.no ? (
                          <b className="font-semibold">{d.no}</b>
                        ) : (
                          <span className="why">ออกเลขเมื่ออนุมัติ</span>
                        )}
                        <span className="why">อ้างอิงใบแจ้งหนี้ {d.inv}</span>
                      </td>
                      <td data-label="ลูกค้า">{d.cus}</td>
                      <td data-label="แก้ไขใบลดหนี้" className="num muted">{d.credit}</td>
                      <td data-label="วันที่ออก" className="num muted">
                        {d.issue ? thaiDate(d.issue) : <span className="why">ยังไม่ออก</span>}
                      </td>
                      <td data-label="ยอดเพิ่มหนี้ (บาท)" className="c num font-semibold">{baht(d.total)}</td>
                      <td data-label="สถานะ">
                        <span className={`tag ${DOC_APPROVAL[d.status].cls}`}>
                          <i />
                          {DOC_APPROVAL[d.status].label}
                        </span>
                        {d.status === "returned" && <span className="why">{d.comment}</span>}
                      </td>
                      <td data-label="จัดการ" className="c">
                        <DebitActions d={d} readOnly={readOnly} onEdit={() => setFixingAgain(d)} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}

          {tab === "refund" && (
            <table className="data-table cards-sm min-w-[1020px]">
              <thead>
                <tr>
                  <th style={{ width: 150 }}>เลขที่รายการ</th>
                  <th style={{ width: 160 }}>ลูกค้า</th>
                  <th style={{ width: 150 }}>ตามใบลดหนี้</th>
                  <th style={{ width: 130 }}>วันที่โอนคืน</th>
                  <th className="c" style={{ width: 130 }}>ยอดที่คืน (บาท)</th>
                  <th style={{ width: 180 }}>สถานะ</th>
                  <th className="c" style={{ width: 160 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {refunds.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-muted-foreground">
                      ยังไม่มีการคืนเงินลูกค้า
                    </td>
                  </tr>
                ) : (
                  refunds.map((r) => (
                    <tr key={r.id}>
                      <td data-label="เลขที่รายการ" className="num">
                        {r.no ? (
                          <b className="font-semibold">{r.no}</b>
                        ) : (
                          <span className="why">ออกเลขเมื่ออนุมัติ</span>
                        )}
                        <span className="why">{r.bank}</span>
                      </td>
                      <td data-label="ลูกค้า">{r.cus}</td>
                      <td data-label="ตามใบลดหนี้" className="num muted">
                        {r.credit}
                        <span className="why">ใบแจ้งหนี้ {r.inv}</span>
                      </td>
                      {/* ยังไม่โอนก็ยังไม่มีวันที่ ช่องนี้จึงว่างจนกว่าจะบันทึกการโอน */}
                      <td data-label="วันที่โอนคืน" className="num muted">
                        {r.paidDate ? (
                          <>
                            {thaiDate(r.paidDate)}
                            <span className="why">{r.method}</span>
                          </>
                        ) : (
                          <span className="why">ยังไม่ได้โอน</span>
                        )}
                      </td>
                      <td data-label="ยอดที่คืน (บาท)" className="c num font-semibold">{baht(r.amount)}</td>
                      <td data-label="สถานะ">
                        <span className={`tag ${REFUND_STATUS[r.status].cls}`}>
                          <i />
                          {REFUND_STATUS[r.status].label}
                        </span>
                        {r.status === "returned" && <span className="why">{r.comment}</span>}
                        {r.status === "paid" && <span className="why">หลักฐาน {r.evidence}</span>}
                        <RefundOverNote acc={acc} r={r} />
                      </td>
                      <td data-label="จัดการ" className="c">
                        <RefundActions
                          r={r}
                          readOnly={readOnly}
                          onPay={() => setPaying(r)}
                          onEdit={() => setRefixing(r)}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* มือถือ: ลูกค้า + ยอดขึ้นก่อน สถานะเป็นป้าย ปุ่มงานหลักเป็นปุ่มใหญ่ท้ายการ์ด */}
        {tab === "credit" && (
          <PhoneList empty={credits.length === 0 ? "ยังไม่มีใบลดหนี้" : undefined}>
            {credits.map((c) => (
              <PhoneCard
                key={c.id}
                title={c.cus}
                sub={
                  <>
                    <span className="num">{c.no || "ยังไม่ออกเลขที่"}</span> · ใบแจ้งหนี้{" "}
                    <span className="num">{c.inv}</span>
                  </>
                }
                amount={baht(c.total)}
                amountNote="ยอดลดหนี้ (บาท)"
                onOpen={c.no ? () => router.push(creditHref(c.no)) : undefined}
                openLabel={c.no ? `เปิดใบลดหนี้ ${c.no}` : undefined}
                badge={
                  <span className={`tag ${DOC_APPROVAL[c.status].cls}`}>
                    <i />
                    {DOC_APPROVAL[c.status].label}
                  </span>
                }
                stats={[
                  { label: "สาเหตุ", value: CREDIT_REASON[c.reasonCode] },
                  { label: "วันที่ออก", value: c.issue ? thaiDate(c.issue) : "ยังไม่ออก" },
                  /* ใบที่ถูกใบเพิ่มหนี้แก้แล้วต้องบอกยอดที่เหลือจริงบนจอเล็กด้วย ไม่ใช่เห็นแต่ยอดหน้าใบ */
                  ...(debitsOfCredit(acc, c.no).length > 0
                    ? [{ label: "เหลือสุทธิ", value: baht(creditNet(acc, c)) }]
                    : []),
                ]}
                actions={
                  <CreditActions
                    acc={acc}
                    c={c}
                    phone
                    readOnly={readOnly}
                    onFix={() => setFixing(c)}
                    onRefund={() => setRefunding(c)}
                    onEdit={() => setEditing(c)}
                  />
                }
              >
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{c.reason}</p>
                {debitsOfCredit(acc, c.no).length > 0 && (
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                    แก้ไขด้วยใบเพิ่มหนี้{" "}
                    {debitsOfCredit(acc, c.no)
                      .map((d) => `${d.no} (${baht(d.total)} บาท)`)
                      .join(" · ")}
                  </p>
                )}
                {c.status === "returned" && (
                  <p className="mt-1 text-[12.5px] font-semibold text-destructive">{c.comment}</p>
                )}
              </PhoneCard>
            ))}
          </PhoneList>
        )}
        {tab === "debit" && (
          <PhoneList empty={debits.length === 0 ? "ยังไม่มีใบเพิ่มหนี้" : undefined}>
            {debits.map((d) => (
              <PhoneCard
                key={d.id}
                title={d.cus}
                sub={
                  <>
                    <span className="num">{d.no || "ยังไม่ออกเลขที่"}</span> · แก้ไข{" "}
                    <span className="num">{d.credit}</span>
                  </>
                }
                amount={baht(d.total)}
                amountNote="ยอดเพิ่มหนี้ (บาท)"
                onOpen={d.no ? () => router.push(creditHref(d.no)) : undefined}
                openLabel={d.no ? `เปิดใบเพิ่มหนี้ ${d.no}` : undefined}
                badge={
                  <span className={`tag ${DOC_APPROVAL[d.status].cls}`}>
                    <i />
                    {DOC_APPROVAL[d.status].label}
                  </span>
                }
                stats={[{ label: "วันที่ออก", value: d.issue ? thaiDate(d.issue) : "ยังไม่ออก" }]}
                actions={<DebitActions d={d} phone readOnly={readOnly} onEdit={() => setFixingAgain(d)} />}
              >
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{d.reason}</p>
                {d.status === "returned" && (
                  <p className="mt-1 text-[12.5px] font-semibold text-destructive">{d.comment}</p>
                )}
              </PhoneCard>
            ))}
          </PhoneList>
        )}
        {tab === "refund" && (
          <PhoneList empty={refunds.length === 0 ? "ยังไม่มีการคืนเงินลูกค้า" : undefined}>
            {refunds.map((r) => (
              <PhoneCard
                key={r.id}
                title={r.cus}
                sub={
                  <>
                    <span className="num">{r.no || "ยังไม่ออกเลขที่"}</span> · ใบลดหนี้{" "}
                    <span className="num">{r.credit}</span>
                  </>
                }
                amount={baht(r.amount)}
                amountNote="ยอดที่คืน (บาท)"
                badge={
                  <span className={`tag ${REFUND_STATUS[r.status].cls}`}>
                    <i />
                    {REFUND_STATUS[r.status].label}
                  </span>
                }
                stats={[
                  { label: "วันที่โอนคืน", value: r.paidDate ? thaiDate(r.paidDate) : "ยังไม่ได้โอน" },
                  { label: "บัญชีปลายทาง", value: r.bank },
                ]}
                actions={
                  <RefundActions
                    r={r}
                    phone
                    readOnly={readOnly}
                    onPay={() => setPaying(r)}
                    onEdit={() => setRefixing(r)}
                  />
                }
              >
                <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">{r.reason}</p>
                <RefundOverNote acc={acc} r={r} />
                {r.status === "returned" && (
                  <p className="mt-1 text-[12.5px] font-semibold text-destructive">{r.comment}</p>
                )}
                {r.status === "paid" && (
                  <p className="mt-1 text-[12.5px] text-muted-foreground">หลักฐาน : {r.evidence}</p>
                )}
              </PhoneCard>
            ))}
          </PhoneList>
        )}

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          {tab === "credit" ? (
            <>
              <span>แสดง {credits.length} ใบลดหนี้</span>
              <span className="sum sm:ml-auto">
                ยอดลดหนี้ที่ออกแล้วรวม
                <b>{baht(credits.filter((c) => c.status === "issued").reduce((a, c) => a + creditNet(acc, c), 0))}</b>
                บาท
              </span>
            </>
          ) : tab === "debit" ? (
            <>
              <span>แสดง {debits.length} ใบเพิ่มหนี้</span>
              <span className="sum sm:ml-auto">
                ยอดเพิ่มหนี้ที่ออกแล้วรวม
                <b>{baht(debits.filter((d) => d.status === "issued").reduce((a, d) => a + d.total, 0))}</b> บาท
              </span>
            </>
          ) : (
            <>
              <span>แสดง {refunds.length} รายการ</span>
              {/* เงินที่ออกไปแล้วกับเงินที่อนุมัติแล้วแต่ยังไม่ออก เป็นคนละยอด ต้องอ่านแยกกันได้ */}
              <span className="sum sm:ml-auto">
                โอนคืนแล้ว
                <b>{baht(refunds.filter((r) => r.status === "paid").reduce((a, r) => a + r.amount, 0))}</b> บาท
              </span>
              <span className="sum">
                รอบันทึกการโอน
                <b>{baht(refunds.filter((r) => r.status === "approved").reduce((a, r) => a + r.amount, 0))}</b> บาท
              </span>
            </>
          )}
        </div>
      </section>

      {asking !== null && !readOnly && (
        <CreditDialog
          acc={acc}
          crm={crm}
          invoices={openInvoices}
          preset={asking}
          onClose={() => setAsking(null)}
          onDone={() => {
            setAsking(null);
            setTab("credit");
          }}
        />
      )}
      {editing && !readOnly && (
        <ResubmitDialog acc={acc} credit={editing} onClose={() => setEditing(null)} />
      )}
      {fixing && !readOnly && (
        <DebitDialog
          acc={acc}
          credit={fixing}
          onClose={() => setFixing(null)}
          onDone={() => {
            setFixing(null);
            setTab("debit");
          }}
        />
      )}
      {fixingAgain && !readOnly && (
        <DebitResubmitDialog acc={acc} debit={fixingAgain} onClose={() => setFixingAgain(null)} />
      )}
      {refunding && !readOnly && (
        <RefundDialog
          acc={acc}
          credit={refunding}
          onClose={() => setRefunding(null)}
          onDone={() => {
            setRefunding(null);
            setTab("refund");
          }}
        />
      )}
      {refixing && !readOnly && (
        <RefundResubmitDialog acc={acc} refund={refixing} onClose={() => setRefixing(null)} />
      )}
      {paying && !readOnly && <RefundTransferDialog refund={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

/**
 * ปุ่มของใบลดหนี้แต่ละใบ
 * ใบที่ออกเลขแล้วไม่มีปุ่มลบและไม่มีปุ่มแก้ยอด — แก้ได้ทางเดียวคือออกใบเพิ่มหนี้ (ข้อ 2)
 * ใบที่ถูกตีกลับยังไม่เคยมีเลข จึงแก้แล้วส่งใหม่ได้
 */
function CreditActions({
  acc,
  c,
  readOnly,
  phone = false,
  onFix,
  onRefund,
  onEdit,
}: {
  acc: AccState;
  c: CreditNote;
  readOnly: boolean;
  phone?: boolean;
  onFix: () => void;
  onRefund: () => void;
  onEdit: () => void;
}) {
  if (readOnly) return <span className="why">ดูอย่างเดียว</span>;
  const cls = phone ? "btn glass-thin" : "lnk";
  if (c.status === "returned")
    return (
      <button
        type="button"
        className={cls}
        data-ceo-hide
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
      >
        แก้แล้วส่งใหม่
      </button>
    );
  if (c.status === "waiting") return <span className="why">รอผู้บริหารตัดสิน</span>;
  /* คืนเงินได้เฉพาะใบที่รับเงินมาแล้วจริง — ไม่มีใบเสร็จก็ไม่มีเงินให้คืน (ข้อ 3) */
  const paid = acc.receipts.some((r) => r.inv === c.inv);
  const left = refundRoom(acc, c.no);
  /* เพิ่มหนี้จนเต็มยอดที่ลดไว้แล้ว หรือมีใบที่ยังรอผู้บริหารกันยอดไว้ — ไม่มีอะไรให้ขออีก */
  const room = debitRoom(acc, c);
  return (
    <>
      {room > 0 && (
        <button
          type="button"
          className={cls}
          data-ceo-hide
          onClick={(e) => {
            e.stopPropagation();
            onFix();
          }}
        >
          ขอออกใบเพิ่มหนี้
        </button>
      )}
      {paid && left > 0 && (
        <button
          type="button"
          className={cls}
          data-ceo-hide
          onClick={(e) => {
            e.stopPropagation();
            onRefund();
          }}
        >
          ขอคืนเงิน
        </button>
      )}
    </>
  );
}

/**
 * ปุ่มของใบเพิ่มหนี้แต่ละใบ — สายเดียวกับใบลดหนี้
 * ใบที่ออกเลขแล้วไม่มีปุ่มลบและไม่มีปุ่มแก้ยอด · ใบที่ถูกตีกลับยังไม่เคยมีเลข จึงแก้แล้วส่งใหม่ได้
 */
function DebitActions({
  d,
  readOnly,
  phone = false,
  onEdit,
}: {
  d: DebitNote;
  readOnly: boolean;
  phone?: boolean;
  onEdit: () => void;
}) {
  if (readOnly) return <span className="why">ดูอย่างเดียว</span>;
  if (d.status === "waiting") return <span className="why">รอผู้บริหารตัดสิน</span>;
  if (d.status === "issued") return <span className="why">ออกเลขแล้ว แก้ไม่ได้</span>;
  return (
    <button
      type="button"
      className={phone ? "btn glass-thin" : "lnk"}
      data-ceo-hide
      onClick={(e) => {
        e.stopPropagation();
        onEdit();
      }}
    >
      แก้แล้วส่งใหม่
    </button>
  );
}

/**
 * เตือนรายการคืนเงินที่ยอดเกินสิ่งที่ใบลดหนี้เหลืออยู่ตอนนี้
 *
 * เกิดได้เมื่อใบเพิ่มหนี้ออกมาหลังวันที่ขอคืนเงิน ยอดที่ลดไว้จึงถูกดึงกลับไปบางส่วน
 * สโตร์กันไม่ให้อนุมัติและไม่ให้บันทึกการโอนแล้ว แต่ต้องเห็นบนหน้าจอด้วยว่าติดตรงไหน
 * ทางออกคือให้ผู้บริหารตีกลับ แล้วฝ่ายบัญชีแก้ยอดส่งใหม่ — ใบที่ออกเลขแล้วแก้เองไม่ได้
 */
function RefundOverNote({ acc, r }: { acc: AccState; r: Refund }) {
  if (r.status === "returned" || r.status === "paid") return null;
  const room = refundRoom(acc, r.credit, r.id);
  if (r.amount <= room) return null;
  return (
    <span className="why text-destructive!">
      เกินยอดที่ใบลดหนี้เหลืออยู่ {baht(room)} บาท — ต้องตีกลับแล้วแก้ยอดก่อน
    </span>
  );
}

/**
 * ปุ่มของการคืนเงินแต่ละรายการ — ขั้นที่ค้างอยู่บอกว่าใครต้องลงมือต่อ
 * อนุมัติแล้วแต่ยังไม่บันทึกการโอน = งานของฝ่ายบัญชี ปุ่มจึงเป็น "บันทึกการโอน"
 * ไม่ใช่รายการที่นิ่งไปเฉย ๆ หลังผู้บริหารกดอนุมัติ
 */
function RefundActions({
  r,
  readOnly,
  phone = false,
  onPay,
  onEdit,
}: {
  r: Refund;
  readOnly: boolean;
  phone?: boolean;
  onPay: () => void;
  onEdit: () => void;
}) {
  if (readOnly) return <span className="why">ดูอย่างเดียว</span>;
  const cls = phone ? "btn glass-thin" : "lnk";
  if (r.status === "waiting") return <span className="why">รอผู้บริหารตัดสิน</span>;
  if (r.status === "paid") return <span className="why">คืนเงินแล้ว แก้ไม่ได้</span>;
  return (
    <button
      type="button"
      className={r.status === "approved" && !phone ? "lnk font-semibold" : cls}
      data-ceo-hide
      onClick={(e) => {
        e.stopPropagation();
        if (r.status === "approved") onPay();
        else onEdit();
      }}
    >
      {r.status === "approved" ? "บันทึกการโอน" : "แก้แล้วส่งใหม่"}
    </button>
  );
}

/** ยอดที่พิมพ์ในช่องเงิน — อ่านเป็นตัวเลขสองตำแหน่ง */
const money = (v: string) => round2(Number(v.replace(/,/g, "")) || 0);

/**
 * ขอออกใบลดหนี้ (ข้อ 1 + ข้อ 4)
 *
 * เพดานคือ "ยอดที่ยังลดได้" ของใบแจ้งหนี้ใบนั้น = ยอดตามใบ − ใบลดหนี้ที่ออกแล้ว − ใบที่รออนุมัติ
 * เกินเพดานคือบันทึกไม่ได้ ไม่ใช่เตือนแล้วปล่อยผ่าน ปุ่มดับและสโตร์ก็ไม่รับซ้ำอีกชั้น
 * ข้อมูลผู้ซื้อไม่ครบก็ออกไม่ได้ เพราะใบลดหนี้เป็นเอกสารภาษีชุดเดียวกับใบกำกับภาษี
 */
function CreditDialog({
  acc,
  crm,
  invoices,
  preset,
  onClose,
  onDone,
}: {
  acc: AccState;
  crm: CrmState;
  invoices: Invoice[];
  /** เลขที่ใบแจ้งหนี้ที่ถูกเลือกมาให้แล้ว — ว่าง = ให้เลือกเอง */
  preset: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [inv, setInv] = useState(preset || invoices[0]?.no || "");
  const invoice = acc.invoices.find((v) => v.no === inv) ?? null;
  const room = invoice ? creditRoom(acc, invoice.no) : 0;
  const [amount, setAmount] = useState(() => commaInput(String(room)));
  const [reasonCode, setReasonCode] = useState<CreditReason>("price_adjust");
  const [reason, setReason] = useState("");

  /* เปลี่ยนใบแจ้งหนี้แล้วยอดตั้งต้นต้องตามใบใหม่ ไม่ใช่ค้างยอดของใบก่อน */
  function pickInvoice(no: string) {
    setInv(no);
    setAmount(commaInput(String(creditRoom(acc, no))));
  }

  const value = money(amount);
  const buyer = invoice ? buyerOf(crm, acc, invoice) : null;
  const blocked = ISSUER_VAT && (buyer?.missing.length ?? 0) > 0;
  const bad = !invoice
    ? "เลือกใบแจ้งหนี้ก่อน"
    : value <= 0
      ? "ยอดลดหนี้ต้องมากกว่า 0"
      : value > room
        ? `ลดหนี้ได้ไม่เกิน ${baht(room)} บาท — ยอดรวมใบลดหนี้ทุกใบต้องไม่เกินยอดตามใบแจ้งหนี้`
        : !reason.trim()
          ? "ใส่เหตุผลก่อนส่งให้ผู้บริหาร"
          : "";
  const ok = !bad && !blocked;

  return (
    <Sheet
      title="ขอออกใบลดหนี้"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={!ok}
            onClick={() => {
              if (
                requestCreditNote({
                  inv,
                  amount: value,
                  reasonCode,
                  reason,
                  by: "ฝ่ายบัญชี",
                })
              )
                onDone();
            }}
          >
            ส่งให้ผู้บริหารอนุมัติ
          </button>
        </>
      }
    >
      <Field label="ใบแจ้งหนี้ที่ลดหนี้" required>
        <select
          value={inv}
          onChange={(e) => pickInvoice(e.target.value)}
          className="field-control h-11 w-full rounded-[11px] px-3 text-[14px]"
        >
          {invoices.length === 0 && <option value="">ไม่มีใบแจ้งหนี้ที่ยังลดหนี้ได้</option>}
          {invoices.map((v) => (
            <option key={v.no} value={v.no}>
              {v.no} · {v.cus} · {baht(v.total)} บาท
            </option>
          ))}
        </select>
      </Field>

      {invoice && (
        <dl className="mt-3 grid gap-2 rounded-[11px] bg-muted px-3.5 py-3 text-[13px] sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="text-muted-foreground">ยอดตามใบแจ้งหนี้</dt>
          <dd className="num font-semibold">{baht(invoice.total)} บาท</dd>
          <dt className="text-muted-foreground">ลดหนี้ไปแล้ว</dt>
          <dd className="num font-semibold">{baht(creditedTotal(acc, invoice.no))} บาท</dd>
          <dt className="text-muted-foreground">ยอดที่ยังลดได้</dt>
          <dd className="num font-semibold">{baht(room)} บาท</dd>
        </dl>
      )}

      <Field label="ยอดที่ลด (บาท)" required className="mt-3">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
          className="field-control num h-11 w-full rounded-[11px] px-3 text-[16px]"
        />
      </Field>

      <Field label="สาเหตุ" required className="mt-3">
        <select
          value={reasonCode}
          onChange={(e) => setReasonCode(e.target.value as CreditReason)}
          className="field-control h-11 w-full rounded-[11px] px-3 text-[14px]"
        >
          {(Object.keys(CREDIT_REASON) as CreditReason[]).map((k) => (
            <option key={k} value={k}>
              {CREDIT_REASON[k]}
            </option>
          ))}
        </select>
      </Field>

      <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="credit-why">
        เหตุผล <span className="text-destructive">*</span>
      </label>
      <textarea
        id="credit-why"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เช่น เรียกเก็บเกินจากขอบเขตงานที่ตัดออก"
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />

      {blocked && buyer && (
        <p className="mt-3 rounded-[11px] border border-destructive/30 bg-[var(--destructive-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-destructive">
          ข้อมูลผู้ซื้อไม่ครบ ({buyer.missing.join(" · ")}) — ใบลดหนี้เป็นเอกสารภาษี ออกไม่ได้จนกว่าฝ่ายขายจะแก้ข้อมูลลูกค้า
        </p>
      )}
      {bad && !blocked && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
      <p className="mt-3 rounded-[11px] border border-[rgba(180,99,11,.25)] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--warning)]">
        ผู้บริหารอนุมัติก่อนจึงจะออกเลขที่ {creditKind(ISSUER_VAT)} ได้ · ออกแล้วยกเลิกไม่ได้และแก้ยอดไม่ได้
        ถ้าออกผิดต้องออก{debitKind(ISSUER_VAT)}มาแก้
      </p>
    </Sheet>
  );
}

/** ใบที่ผู้บริหารตีกลับ — แก้ยอดและเหตุผลแล้วส่งใหม่ได้ เพราะยังไม่เคยมีเลขที่เอกสาร */
function ResubmitDialog({
  acc,
  credit,
  onClose,
}: {
  acc: AccState;
  credit: CreditNote;
  onClose: () => void;
}) {
  const room = creditRoom(acc, credit.inv);
  const [amount, setAmount] = useState(commaInput(String(credit.total)));
  const [reason, setReason] = useState(credit.reason);
  const value = money(amount);
  const bad =
    value <= 0
      ? "ยอดลดหนี้ต้องมากกว่า 0"
      : value > room
        ? `ลดหนี้ได้ไม่เกิน ${baht(room)} บาท`
        : !reason.trim()
          ? "ใส่เหตุผลก่อนส่งใหม่"
          : "";

  return (
    <Sheet
      title="แก้ใบลดหนี้แล้วส่งใหม่"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => {
              if (resubmitCreditNote(credit.id, value, reason, "ฝ่ายบัญชี")) onClose();
            }}
          >
            ส่งใหม่
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        ใบแจ้งหนี้ <b className="num">{credit.inv}</b> · {credit.cus}
      </p>
      <p className="mt-1 rounded-[11px] bg-muted px-3.5 py-2.5 text-[12.5px] leading-relaxed">
        ผู้บริหารตีกลับเมื่อ {thaiStamp(credit.decidedAt)} — {credit.comment}
      </p>
      <Field label="ยอดที่ลด (บาท)" required className="mt-3">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
          className="field-control num h-11 w-full rounded-[11px] px-3 text-[16px]"
        />
      </Field>
      <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="credit-why2">
        เหตุผล <span className="text-destructive">*</span>
      </label>
      <textarea
        id="credit-why2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />
      {bad && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
    </Sheet>
  );
}

/**
 * ขอออกใบเพิ่มหนี้แก้ใบลดหนี้ที่ออกผิด (ข้อ 2 + ข้อ 4)
 * ใบลดหนี้ใบเดิมยังอยู่ครบพร้อมเลขที่เดิม เอกสารสองใบอ้างถึงกันทั้งสองทาง
 * ใบเพิ่มหนี้เรียกเก็บลูกค้าเพิ่ม ผู้บริหารจึงต้องเห็นก่อน เลขที่ออกตอนอนุมัติเท่านั้น
 */
function DebitDialog({
  acc,
  credit,
  onClose,
  onDone,
}: {
  acc: AccState;
  credit: CreditNote;
  onClose: () => void;
  onDone: () => void;
}) {
  const left = debitRoom(acc, credit);
  const [amount, setAmount] = useState(commaInput(String(left)));
  const [reason, setReason] = useState("");
  const value = money(amount);
  const bad =
    value <= 0
      ? "ยอดเพิ่มหนี้ต้องมากกว่า 0"
      : value > left
        ? `เพิ่มหนี้ได้ไม่เกิน ${baht(left)} บาท — เกินกว่านี้คือสร้างหนี้ใหม่ ไม่ใช่การแก้ใบลดหนี้`
        : !reason.trim()
          ? "ใส่เหตุผลที่ต้องแก้ก่อน"
          : "";

  return (
    <Sheet
      title={`ขอออก${debitKind(ISSUER_VAT)}`}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => {
              if (requestDebitNote({ credit: credit.no, amount: value, reason, by: "ฝ่ายบัญชี" }))
                onDone();
            }}
          >
            ส่งให้ผู้บริหารอนุมัติ
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        แก้ไขใบลดหนี้ <b className="num">{credit.no}</b> · {credit.cus}
        <br />
        อ้างอิงใบแจ้งหนี้ <span className="num">{credit.inv}</span> · ยอดที่ลดไว้{" "}
        <span className="num">{baht(credit.total)}</span> บาท
      </p>
      <Field label="ยอดที่เพิ่มหนี้กลับ (บาท)" required className="mt-3">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
          className="field-control num h-11 w-full rounded-[11px] px-3 text-[16px]"
        />
      </Field>
      <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="debit-why">
        เหตุผลที่ต้องแก้ <span className="text-destructive">*</span>
      </label>
      <textarea
        id="debit-why"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เช่น ใบลดหนี้ระบุยอดเกินไป 5,000 บาท"
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />
      {bad && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
      <p className="mt-3 rounded-[11px] border border-[rgba(180,99,11,.25)] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--warning)]">
        ผู้บริหารอนุมัติก่อนจึงจะออกเลขที่ {debitKind(ISSUER_VAT)} ได้ — ใบนี้เรียกเก็บลูกค้าเพิ่ม
        หลังเอกสารภาษีออกไปแล้ว · ใบลดหนี้ {credit.no} ยังอยู่ครบพร้อมเลขที่เดิม
        เอกสารที่ออกเลขแล้วยกเลิกย้อนหลังไม่ได้
      </p>
    </Sheet>
  );
}

/** ใบเพิ่มหนี้ที่ผู้บริหารตีกลับ — แก้ยอดและเหตุผลแล้วส่งใหม่ได้ เพราะยังไม่เคยมีเลขที่เอกสาร */
function DebitResubmitDialog({
  acc,
  debit,
  onClose,
}: {
  acc: AccState;
  debit: DebitNote;
  onClose: () => void;
}) {
  const credit = acc.credits.find((c) => c.no === debit.credit) ?? null;
  const left = credit ? debitRoom(acc, credit) : 0;
  const [amount, setAmount] = useState(commaInput(String(debit.total)));
  const [reason, setReason] = useState(debit.reason);
  const value = money(amount);
  const bad =
    value <= 0
      ? "ยอดเพิ่มหนี้ต้องมากกว่า 0"
      : value > left
        ? `เพิ่มหนี้ได้ไม่เกิน ${baht(left)} บาท`
        : !reason.trim()
          ? "ใส่เหตุผลก่อนส่งใหม่"
          : "";

  return (
    <Sheet
      title="แก้ใบเพิ่มหนี้แล้วส่งใหม่"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => {
              if (resubmitDebitNote(debit.id, value, reason, "ฝ่ายบัญชี")) onClose();
            }}
          >
            ส่งใหม่
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        แก้ไขใบลดหนี้ <b className="num">{debit.credit}</b> · {debit.cus}
        <br />
        อ้างอิงใบแจ้งหนี้ <span className="num">{debit.inv}</span>
      </p>
      <p className="mt-1 rounded-[11px] bg-muted px-3.5 py-2.5 text-[12.5px] leading-relaxed">
        ผู้บริหารตีกลับเมื่อ {thaiStamp(debit.decidedAt)} — {debit.comment}
      </p>
      <Field label="ยอดที่เพิ่มหนี้กลับ (บาท)" required className="mt-3">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
          className="field-control num h-11 w-full rounded-[11px] px-3 text-[16px]"
        />
      </Field>
      <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="debit-why2">
        เหตุผลที่ต้องแก้ <span className="text-destructive">*</span>
      </label>
      <textarea
        id="debit-why2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />
      {bad && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
    </Sheet>
  );
}

/**
 * ขอคืนเงินลูกค้า (ข้อ 3 + ข้อ 4)
 *
 * ขั้นนี้คือ "ขอ" ยังไม่ใช่ "โอน" — กรอกได้แค่ใบลดหนี้ที่อ้าง ยอด เหตุผล และบัญชีปลายทาง
 * วันที่โอนและหลักฐานไม่มีในกล่องนี้ เพราะเงินยังไม่ได้ออกจนกว่าผู้บริหารจะอนุมัติ
 * (เจ้าของระบบสั่งแก้ 24 ก.ย. 2569 — ถามวันที่โอนตั้งแต่ตอนขอ เท่ากับอนุมัติย้อนหลังให้เงินที่ออกไปแล้ว)
 */
function RefundDialog({
  acc,
  credit,
  onClose,
  onDone,
}: {
  acc: AccState;
  credit: CreditNote;
  onClose: () => void;
  onDone: () => void;
}) {
  const left = refundRoom(acc, credit.no);
  const [amount, setAmount] = useState(commaInput(String(left)));
  const [reason, setReason] = useState("");
  const [bank, setBank] = useState("");
  const value = money(amount);
  const bad =
    value <= 0
      ? "ยอดคืนเงินต้องมากกว่า 0"
      : value > left
        ? `คืนได้ไม่เกิน ${baht(left)} บาท ตามยอดที่ลดหนี้ไว้`
        : !reason.trim()
          ? "ใส่เหตุผลที่ต้องคืนเป็นเงิน"
          : !bank.trim()
            ? "ใส่บัญชีปลายทางที่จะโอนคืน"
            : "";

  return (
    <Sheet
      title="ขอคืนเงินลูกค้า"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => {
              if (requestRefund({ credit: credit.no, amount: value, reason, bank, by: "ฝ่ายบัญชี" }))
                onDone();
            }}
          >
            ส่งให้ผู้บริหารอนุมัติ
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        ตามใบลดหนี้ <b className="num">{credit.no}</b> · {credit.cus}
        <br />
        ใบเสร็จ <span className="num">{credit.receipt || "—"}</span> · คืนได้อีก{" "}
        <span className="num">{baht(left)}</span> บาท
      </p>
      <Field label="ยอดที่ขอคืน (บาท)" required className="mt-3">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
          className="field-control num h-11 w-full rounded-[11px] px-3 text-[16px]"
        />
      </Field>
      <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="refund-why">
        เหตุผลที่ต้องคืนเป็นเงิน <span className="text-destructive">*</span>
      </label>
      <textarea
        id="refund-why"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="เช่น ลูกค้าไม่มีงวดถัดไปให้หักกลบ ขอรับเงินคืนเข้าบัญชี"
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />
      <Field label="บัญชีปลายทางที่จะโอนคืน" required className="mt-3">
        <input
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          placeholder="ธนาคาร · ชื่อบัญชี · เลขที่บัญชี"
          className="field-control h-11 w-full rounded-[11px] px-3 text-[14px]"
        />
      </Field>
      {bad && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
      <p className="mt-3 rounded-[11px] bg-muted px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        ยังไม่ต้องโอนตอนนี้ · ผู้บริหารอนุมัติก่อน ระบบจึงออกเลขที่รายการ แล้วคนที่โอนจริงกลับมาบันทึก
        วันที่โอนและหลักฐานที่ปุ่ม &ldquo;บันทึกการโอน&rdquo; · ใบเสร็จและเงินที่รับมาแล้วไม่ถูกแก้ (AC-BR-18)
      </p>
    </Sheet>
  );
}

/** คำขอคืนเงินที่ผู้บริหารตีกลับ — แก้ยอด เหตุผล และบัญชีแล้วส่งใหม่ได้ เพราะยังไม่เคยมีเลขที่ */
function RefundResubmitDialog({
  acc,
  refund,
  onClose,
}: {
  acc: AccState;
  refund: Refund;
  onClose: () => void;
}) {
  const credit = acc.credits.find((c) => c.no === refund.credit) ?? null;
  /* ใบที่ถูกตีกลับไม่กันยอดไว้แล้ว เพดานจึงเป็นยอดที่ใบลดหนี้ยังเหลือให้คืนตอนนี้ */
  const left = credit ? refundRoom(acc, credit.no, refund.id) : 0;
  const [amount, setAmount] = useState(commaInput(String(refund.amount)));
  const [reason, setReason] = useState(refund.reason);
  const [bank, setBank] = useState(refund.bank);
  const value = money(amount);
  const bad =
    value <= 0
      ? "ยอดคืนเงินต้องมากกว่า 0"
      : value > left
        ? `คืนได้ไม่เกิน ${baht(left)} บาท ตามยอดที่ลดหนี้ไว้`
        : !reason.trim()
          ? "ใส่เหตุผลก่อนส่งใหม่"
          : !bank.trim()
            ? "ใส่บัญชีปลายทางที่จะโอนคืน"
            : "";

  return (
    <Sheet
      title="แก้คำขอคืนเงินแล้วส่งใหม่"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => {
              if (resubmitRefund(refund.id, value, reason, bank, "ฝ่ายบัญชี")) onClose();
            }}
          >
            ส่งใหม่
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        ตามใบลดหนี้ <b className="num">{refund.credit}</b> · {refund.cus}
        <br />
        ใบแจ้งหนี้ <span className="num">{refund.inv}</span> · คืนได้อีก{" "}
        <span className="num">{baht(left)}</span> บาท
      </p>
      <p className="mt-1 rounded-[11px] bg-muted px-3.5 py-2.5 text-[12.5px] leading-relaxed">
        ผู้บริหารตีกลับเมื่อ {thaiStamp(refund.decidedAt)} — {refund.comment}
      </p>
      <Field label="ยอดที่ขอคืน (บาท)" required className="mt-3">
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(commaInput(e.target.value))}
          className="field-control num h-11 w-full rounded-[11px] px-3 text-[16px]"
        />
      </Field>
      <label className="mt-3 block text-[12.5px] font-semibold text-muted-foreground" htmlFor="refund-why2">
        เหตุผลที่ต้องคืนเป็นเงิน <span className="text-destructive">*</span>
      </label>
      <textarea
        id="refund-why2"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
        className="field-control mt-1.5 w-full rounded-[11px] px-3 py-2.5 text-[13.5px]"
      />
      <Field label="บัญชีปลายทางที่จะโอนคืน" required className="mt-3">
        <input
          value={bank}
          onChange={(e) => setBank(e.target.value)}
          className="field-control h-11 w-full rounded-[11px] px-3 text-[14px]"
        />
      </Field>
      {bad && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
    </Sheet>
  );
}

/**
 * บันทึกการโอน — ขั้นสุดท้ายของสายคืนเงิน ทำหลังโอนจริงแล้วเท่านั้น
 * คนที่กรอกคือคนที่โอน อาจคนละคนกับผู้ขอ · บันทึกแล้วสถานะเป็น "คืนเงินแล้ว" และแก้ไม่ได้อีก
 */
function RefundTransferDialog({ refund, onClose }: { refund: Refund; onClose: () => void }) {
  const [paidDate, setPaidDate] = useState(todayIso());
  const [method, setMethod] = useState("โอนเงินเข้าบัญชีลูกค้า");
  const [evidence, setEvidence] = useState("");
  const bad = !paidDate
    ? "เลือกวันที่โอนเงินคืน"
    : !evidence.trim()
      ? "ใส่หลักฐานการโอน เช่น เลขที่รายการโอนหรือชื่อไฟล์สลิป"
      : "";

  return (
    <Sheet
      title="บันทึกการโอนเงินคืน"
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={Boolean(bad)}
            onClick={() => {
              if (recordRefundTransfer(refund.id, { paidDate, method, evidence, by: "ฝ่ายบัญชี" }))
                onClose();
            }}
          >
            บันทึกการโอน
          </button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed">
        รายการ <b className="num">{refund.no}</b> · {refund.cus}
        <br />
        ตามใบลดหนี้ <span className="num">{refund.credit}</span> · ยอด{" "}
        <span className="num">{baht(refund.amount)}</span> บาท
        <br />
        บัญชีปลายทาง {refund.bank}
      </p>
      <p className="mt-1 rounded-[11px] bg-muted px-3.5 py-2.5 text-[12.5px] leading-relaxed">
        ผู้บริหารอนุมัติเมื่อ {thaiStamp(refund.decidedAt)} โดย{refund.decidedBy}
      </p>
      <Field label="วันที่โอนเงินคืน" required className="mt-3">
        <DateField value={paidDate} onChange={setPaidDate} label="วันที่โอนเงินคืน" />
      </Field>
      <Field label="ช่องทางที่โอน" className="mt-3">
        <input
          value={method}
          onChange={(e) => setMethod(e.target.value)}
          className="field-control h-11 w-full rounded-[11px] px-3 text-[14px]"
        />
      </Field>
      <Field label="หลักฐานการโอน" required className="mt-3">
        <input
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          placeholder="เลขที่รายการโอน หรือชื่อไฟล์สลิป"
          className="field-control h-11 w-full rounded-[11px] px-3 text-[14px]"
        />
      </Field>
      {bad && <p className="mt-3 text-[12.5px] font-semibold text-destructive">{bad}</p>}
      <p className="mt-3 rounded-[11px] border border-[rgba(180,99,11,.25)] bg-[var(--warning-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed text-[var(--warning)]">
        บันทึกแล้วรายการนี้ปิด แก้ไม่ได้อีก — บันทึกหลังโอนจริงเท่านั้น
      </p>
    </Sheet>
  );
}
