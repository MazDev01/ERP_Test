"use client";

/*
 * ใบเสร็จ / ใบกำกับภาษี — ต้นแบบ dose-erp-maz/receipts.html
 *
 * รอออกใบเสร็จ: ใบแจ้งหนี้ที่ยังไม่ชำระทุกใบ — ออกใบเสร็จคือการบันทึกว่าลูกค้าชำระแล้ว ไม่มีขั้นรับเงินแยก (AC-BR-05)
 * ออกแล้ว: ใบเสร็จจัดกลุ่มตามลูกค้า กดแถวลูกค้าเพื่อกางใบเสร็จ กดใบเสร็จเพื่อเปิดเอกสาร
 */

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ISSUER_VAT,
  NO_WHT_NOTE,
  receiptKind,
  seqText,
  WHT_CERT_WAIT,
  type Invoice,
  type Receipt,
} from "@/lib/acc-data";
import { awaitingReceipt, invoiceDue, receiptsOf, useAcc, type AccState } from "@/lib/acc-store";
import { taxInvoiceBuyer, type TaxInvoiceBuyer } from "@/lib/crm-data";
import { customerOfDeal, useCrm } from "@/lib/crm-store";
import { issueReceiptFlow } from "@/lib/flow";
import { baht, commaInput, round2, thaiDate, todayIso } from "@/lib/format";
import { Sheet } from "./lead-dialogs";
import { AccFilters, useAccFilter } from "./acc-ui";
import { Field } from "./ui";
import { PhoneCard, PhoneList } from "./acchr-phone";

import { DateField } from "./thai-date-picker";

/** ที่อยู่หน้าเอกสารใบเสร็จ — อยู่ใต้เมนูใบเสร็จ สิทธิ์เข้าหน้าจึงตามเมนูนี้ */
export function receiptHref(no: string) {
  return `/acc/receipts/${encodeURIComponent(no)}`;
}

/** จำนวนงวดของดีล — ใช้บอก "งวดสุดท้าย" หรือ "ชำระครั้งเดียว" */
function seqsOf(acc: AccState, deal: string) {
  return acc.deals.find((d) => d.no === deal)?.plan.length ?? 0;
}

export function AccReceiptsPage() {
  const acc = useAcc();
  const crm = useCrm();
  const router = useRouter();
  const [tab, setTab] = useState<"todo" | "done">("todo");
  const [issuing, setIssuing] = useState<Invoice | null>(null);
  const [openCus, setOpenCus] = useState<Record<string, boolean>>({});
  const today = todayIso();
  /* ตัวกรอง: รอออกใบเสร็จเทียบวันครบกำหนด · ออกแล้วเทียบวันที่ออกใบเสร็จ */
  const filter = useAccFilter();
  const { hit, inRange } = filter;

  /* ครบกำหนดก่อนขึ้นก่อน */
  const todo = awaitingReceipt(acc)
    .filter((v) => hit(v.no, v.cus, v.deal) && inRange(v.due))
    .sort((a, b) => a.due.localeCompare(b.due));

  const done = acc.receipts.filter((r) => hit(r.no, r.inv, r.cus) && inRange(r.date));
  /* จัดกลุ่มตามลูกค้า ลูกค้าที่ออกใบล่าสุดขึ้นก่อน ใบในกลุ่มเรียงใหม่ไปเก่า */
  const groups: { cus: string; list: Receipt[]; total: number; last: string }[] = [];
  for (const r of done) {
    let g = groups.find((x) => x.cus === r.cus);
    if (!g) groups.push((g = { cus: r.cus, list: [], total: 0, last: "" }));
    g.list.push(r);
    g.total = round2(g.total + r.total);
    if (r.date > g.last) g.last = r.date;
  }
  for (const g of groups) g.list.sort((a, b) => b.date.localeCompare(a.date));
  groups.sort((a, b) => b.last.localeCompare(a.last));

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>ใบเสร็จ / ใบกำกับภาษี</h1>
        </div>
      </div>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            <button type="button" className={tab === "todo" ? "on" : ""} onClick={() => setTab("todo")}>
              รอออกใบเสร็จ <b>{todo.length}</b>
            </button>
            <button type="button" className={tab === "done" ? "on" : ""} onClick={() => setTab("done")}>
              ออกแล้ว <b>{done.length}</b>
            </button>
          </div>
          <AccFilters filter={filter} />
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          {tab === "todo" ? (
            <table className="data-table cards-sm min-w-[800px]">
              <thead>
                <tr>
                  <th style={{ width: 160 }}>เลขที่ใบแจ้งหนี้</th>
                  <th style={{ width: 170 }}>ลูกค้า</th>
                  <th style={{ width: 150 }}>ครบกำหนดชำระ</th>
                  <th className="r" style={{ width: 170 }}>ยอดที่ต้องรับชำระ</th>
                  <th className="c" style={{ width: 140 }}>จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {todo.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      ไม่มีใบแจ้งหนี้ที่รอออกใบเสร็จ
                    </td>
                  </tr>
                ) : (
                  todo.map((v) => (
                    <tr key={v.no}>
                      <td data-label="เลขที่ใบแจ้งหนี้" className="num">
                        <b className="font-semibold">{v.no}</b>
                        <span className="why">{seqText(v.seq, seqsOf(acc, v.deal))}</span>
                      </td>
                      <td data-label="ลูกค้า">{v.cus}</td>
                      <td data-label="ครบกำหนดชำระ" className="num muted">{thaiDate(v.due)}</td>
                      {/* ยอดที่ต้องรับ คือส่วนที่ยังไม่ได้รับ ไม่ใช่ยอดเต็มของงวด — อ่านค่าเดียวกับหน้าวางบิล */}
                      <td data-label="ยอดที่ต้องรับชำระ" className="r num font-semibold">{baht(invoiceDue(v))}</td>
                      <td data-label="จัดการ" className="c">
                        <button type="button" className="lnk" data-ceo-hide onClick={() => setIssuing(v)}>
                          ออกใบเสร็จ
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="data-table cards-sm min-w-[800px]">
              <thead>
                <tr>
                  <th style={{ width: 220 }}>ลูกค้า</th>
                  <th style={{ width: 160 }}>ใบเสร็จ</th>
                  <th style={{ width: 170 }}>ออกล่าสุด</th>
                  <th className="r" style={{ width: 190 }}>ยอดรวม (บาท)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {groups.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-muted-foreground">
                      ยังไม่มีใบเสร็จ
                    </td>
                  </tr>
                ) : (
                  groups.map((g) => {
                    const isOpen = Boolean(openCus[g.cus]);
                    return (
                      <Fragment key={g.cus}>
                        <tr
                          className={isOpen ? "open" : ""}
                          style={{ cursor: "pointer" }}
                          onClick={() => setOpenCus((o) => ({ ...o, [g.cus]: !o[g.cus] }))}
                        >
                          <td data-label="ลูกค้า" className="font-semibold">{g.cus}</td>
                          <td data-label="ใบเสร็จ" className="muted">{g.list.length} ใบ</td>
                          <td data-label="ออกล่าสุด" className="num muted">{thaiDate(g.last)}</td>
                          <td data-label="ยอดรวม (บาท)" className="r num font-semibold">{baht(g.total)}</td>
                          <td>
                            <span className="why">{isOpen ? "กดแถวเพื่อย่อ" : "กดแถวเพื่อดูใบเสร็จ"}</span>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="sub">
                            <td colSpan={5}>
                              <div className="subwrap">
                                <table className="inner">
                                  <colgroup>
                                    <col style={{ width: 220 }} />
                                    <col style={{ width: 230 }} />
                                    <col style={{ width: 170 }} />
                                    <col style={{ width: 190 }} />
                                  </colgroup>
                                  <tbody>
                                    {g.list.map((r) => (
                                      <tr
                                        key={r.no}
                                        tabIndex={0}
                                        title="เปิดใบเสร็จ"
                                        style={{ cursor: "pointer" }}
                                        onClick={() => router.push(receiptHref(r.no))}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            router.push(receiptHref(r.no));
                                          }
                                        }}
                                      >
                                        <td data-label="เลขที่ใบเสร็จ" className="num">
                                          <b className="font-semibold">{r.no}</b>
                                          <span className="why">{r.inv}</span>
                                          <span className="why">{seqText(r.seq, seqsOf(acc, r.deal))}</span>
                                        </td>
                                        <td data-label="ประเภทเอกสาร" className="muted">{receiptKind(r.vat)}</td>
                                        <td data-label="วันที่ออก" className="num muted">{thaiDate(r.date)}</td>
                                        <td data-label="ยอดรวม" className="r num">{baht(r.total)}</td>
                                      </tr>
                                    ))}
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
          )}
        </div>

        {/* มือถือ: รอออกใบเสร็จเป็นการ์ดพร้อมปุ่มออกใบเสร็จเต็มความกว้าง
            ออกแล้วเป็นการ์ดต่อลูกค้า ใบเสร็จของลูกค้ากางไว้ในการ์ด แตะใบไหนเปิดใบนั้น */}
        {tab === "todo" ? (
          <PhoneList empty={todo.length === 0 ? "ไม่มีใบแจ้งหนี้ที่รอออกใบเสร็จ" : undefined}>
            {todo.map((v) => (
              <PhoneCard
                key={v.no}
                title={v.cus}
                sub={
                  <>
                    <span className="num">{v.no}</span> · {seqText(v.seq, seqsOf(acc, v.deal))}
                  </>
                }
                amount={baht(invoiceDue(v))}
                amountNote="ยอดที่ต้องรับชำระ"
                badge={
                  <span className="num text-[12px] text-muted-foreground">ครบกำหนดชำระ {thaiDate(v.due)}</span>
                }
                actions={
                  <button type="button" className="btn solid btn-solid" data-ceo-hide onClick={() => setIssuing(v)}>
                    ออกใบเสร็จ
                  </button>
                }
              />
            ))}
          </PhoneList>
        ) : (
          <PhoneList empty={groups.length === 0 ? "ยังไม่มีใบเสร็จ" : undefined}>
            {groups.map((g) => (
              <PhoneCard
                key={g.cus}
                title={g.cus}
                sub={`${g.list.length} ใบ · ออกล่าสุด ${thaiDate(g.last)}`}
                amount={baht(g.total)}
                amountNote="ยอดรวม (บาท)"
              >
                <ul className="mt-2.5 divide-y divide-border rounded-[10px] border border-border">
                  {g.list.map((r) => (
                    <li key={r.no}>
                      <button
                        type="button"
                        className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2.5 text-left"
                        onClick={() => router.push(receiptHref(r.no))}
                        aria-label={`เปิดใบเสร็จ ${r.no}`}
                      >
                        <span className="min-w-0 flex-1">
                          <b className="num block text-[13px] font-semibold">{r.no}</b>
                          <span className="block text-[11.5px] leading-snug text-muted-foreground">
                            <span className="num">{r.inv}</span> · {seqText(r.seq, seqsOf(acc, r.deal))}
                          </span>
                          <span className="block text-[11.5px] leading-snug text-muted-foreground">
                            {receiptKind(r.vat)} · {thaiDate(r.date)}
                          </span>
                        </span>
                        <span className="num flex-none text-[13px] font-semibold">{baht(r.total)}</span>
                        <span aria-hidden className="flex-none text-muted-foreground">›</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </PhoneCard>
            ))}
          </PhoneList>
        )}

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          {tab === "todo" ? (
            <>
              <span>แสดง {todo.length} งวด</span>
              <span className="sum sm:ml-auto">
                ยอดรวมที่รอออกใบเสร็จ<b>{baht(todo.reduce((a, v) => a + invoiceDue(v), 0))}</b> บาท
              </span>
            </>
          ) : (
            <>
              <span>
                แสดง {groups.length} ลูกค้า {done.length} ใบเสร็จ
              </span>
              <span className="sum sm:ml-auto">
                ยอดรวมตามใบเสร็จ<b>{baht(done.reduce((a, r) => a + r.total, 0))}</b> บาท
              </span>
            </>
          )}
        </div>
      </section>

      {issuing && (
        <IssueDialog
          invoice={issuing}
          seqs={seqsOf(acc, issuing.deal)}
          /* ใบนี้เคยรับชำระบางส่วนมาแล้วหรือยัง — ใบแรกเท่านั้นที่ใช้ยอดหักตามใบเสนอราคาเป็นค่าตั้งต้น */
          first={receiptsOf(acc, issuing.no).length === 0}
          buyer={taxInvoiceBuyer(
            customerOfDeal(
              crm,
              issuing.deal,
              acc.deals.find((d) => d.no === issuing.deal)?.quo ?? "",
              issuing.cus,
            ),
          )}
          today={today}
          onClose={() => setIssuing(null)}
          onDone={() => {
            setIssuing(null);
            setTab("done");
          }}
        />
      )}
    </div>
  );
}

/**
 * ออกใบเสร็จ = รับชำระ — ใบเสร็จต้องบอก "เงินที่ได้รับจริง" ไม่ใช่ยอดเต็มของงวดเสมอไป
 *
 * ลูกค้านิติบุคคลหักภาษี ณ ที่จ่ายไว้ โอนมาน้อยกว่ายอดงวด ใบเสร็จต้องเขียนยอดที่โอนจริง
 * พร้อมบรรทัดภาษีที่ถูกหักและหมายเหตุว่ายังรอหนังสือรับรอง ไม่งั้นใบเสร็จระบุเงินเกินที่ได้รับจริง
 * ยอดไม่ตรงกับที่ตกลงไว้เมื่อไร ต้องให้คนกดยืนยันก่อน จะได้ไม่พลาดเพราะพิมพ์ผิด
 */
function IssueDialog({
  invoice,
  seqs,
  first,
  buyer,
  today,
  onClose,
  onDone,
}: {
  invoice: Invoice;
  seqs: number;
  first: boolean;
  buyer: TaxInvoiceBuyer;
  today: string;
  onClose: () => void;
  onDone: () => void;
}) {
  /* มูลค่างวดที่ยังไม่ได้รับ คิดก่อนหักภาษี ณ ที่จ่าย */
  const due = invoiceDue(invoice);
  /* ยอดหักที่คาดไว้ยกมาจากใบเสนอราคาของดีล — ไม่มีค่ามาก็คือไม่หัก ไม่คิดอัตราให้เอง */
  const expectWht = first ? invoice.wht : 0;
  const expectGot = round2(due - expectWht);
  const [date, setDate] = useState(today);
  const [got, setGot] = useState(commaInput(String(expectGot)));
  const [wht, setWht] = useState(commaInput(String(expectWht)));
  const [agreed, setAgreed] = useState(false);

  const num = (v: string) => round2(Number(v.replace(/,/g, "")) || 0);
  const gotNum = num(got);
  const whtNum = num(wht);
  const left = round2(due - gotNum - whtNum);
  /* ออกใบกำกับภาษีให้ลูกค้าที่ข้อมูลไม่ครบไม่ได้ — ลูกค้าเอาไปขอคืนภาษีซื้อไม่ได้ */
  const blocked = ISSUER_VAT && buyer.missing.length > 0;
  const bad =
    gotNum <= 0
      ? "ยอดเงินที่ได้รับจริงต้องมากกว่า 0"
      : whtNum < 0
        ? "ยอดภาษีหัก ณ ที่จ่ายติดลบไม่ได้"
        : left < 0
          ? `รับชำระเกินมูลค่างวดที่ค้างอยู่ (${baht(due)} บาท)`
          : "";
  /* ต่างจากที่ตกลงไว้เมื่อไรต้องเตือนและให้ยืนยัน ไม่ใช่บันทึกเงียบ ๆ */
  const warn = bad
    ? []
    : [
        whtNum !== expectWht
          ? `ภาษีหัก ณ ที่จ่ายที่กรอก ${baht(whtNum)} บาท ต่างจากใบเสนอราคาที่ระบุไว้ ${
              expectWht > 0 ? `${baht(expectWht)} บาท` : `(${NO_WHT_NOTE})`
            }`
          : "",
        left > 0
          ? `ได้รับไม่ครบมูลค่างวด ยังค้างอีก ${baht(left)} บาท — ใบแจ้งหนี้จะขึ้นสถานะ "ชำระบางส่วน"`
          : "",
      ].filter(Boolean);
  const ok = Boolean(date) && !bad && !blocked && (warn.length === 0 || agreed);

  return (
    <Sheet
      title="ออกใบเสร็จรับเงิน"
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
              /* งวดแรกที่ชำระครบ → งานเข้าคิว PM ต่อโดยอัตโนมัติ ทำงานเบื้องหลัง (AC-BR-06) */
              if (issueReceiptFlow(invoice.no, date, gotNum, whtNum)) onDone();
            }}
          >
            ออกใบเสร็จ
          </button>
        </>
      }
    >
      {/* เลขที่ ลูกค้า และงวด อยู่คนละบรรทัดตามต้นแบบ (rcWho) */}
      <p className="text-[13.5px] leading-relaxed">
        <b className="num font-semibold">{invoice.no}</b>
        <br />
        {invoice.cus}
        <br />
        <span className="text-[12.5px] text-muted-foreground">{seqText(invoice.seq, seqs)}</span>
      </p>

      {blocked && (
        <div className="mt-3.5 rounded-[11px] border border-destructive/40 bg-destructive/10 px-3.5 py-3 text-[12.5px] leading-relaxed">
          <b className="block text-[13px] font-bold text-destructive">
            ออก{receiptKind(ISSUER_VAT)}ไม่ได้ — ข้อมูลผู้ซื้อไม่ครบ
          </b>
          <span className="mt-1 block">ยังขาด {buyer.missing.join(" · ")}</span>
          <span className="mt-1 block text-muted-foreground">
            ใบกำกับภาษีที่ข้อมูลผู้ซื้อไม่ครบ ลูกค้าใช้ขอคืนภาษีซื้อไม่ได้ ให้ฝ่ายขายกรอกที่หน้าลูกค้า{" "}
            {invoice.cus} → การ์ด &quot;ข้อมูลติดต่อ&quot; แล้วกลับมาออกใหม่
          </span>
        </div>
      )}

      <h3 className="mt-4 mb-2 text-[12.5px] font-bold text-muted-foreground">รายละเอียดการรับชำระ</h3>
      <table className="sheet">
        <thead>
          <tr>
            <th className="c" style={{ width: 70 }}>งวดที่</th>
            <th style={{ width: 160 }}>เลขที่ใบแจ้งหนี้</th>
            <th className="r" style={{ width: 180 }}>มูลค่างวดที่ค้าง</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="งวดที่" className="c num">{invoice.seq}</td>
            <td data-label="เลขที่ใบแจ้งหนี้">{invoice.no}</td>
            <td data-label="มูลค่างวดที่ค้าง" className="r num">{baht(due)}</td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="r tsum">
              {expectWht > 0
                ? `ควรได้รับ (หลังหักภาษี ณ ที่จ่าย ${baht(expectWht)} บาท)`
                : `ควรได้รับ (${NO_WHT_NOTE})`}
            </td>
            <td className="r tsum num">{baht(expectGot)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="ยอดเงินที่ได้รับจริง (บาท)">
          <input
            value={got}
            inputMode="decimal"
            aria-label="ยอดเงินที่ได้รับจริง"
            onChange={(e) => setGot(commaInput(e.target.value))}
            className="field-control num h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Field>
        <Field label="ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้ (บาท)">
          <input
            value={wht}
            inputMode="decimal"
            aria-label="ภาษีหัก ณ ที่จ่ายที่ลูกค้าหักไว้"
            onChange={(e) => setWht(commaInput(e.target.value))}
            className="field-control num h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Field>
        <Field label="วันที่รับชำระและออกใบเสร็จ" className="sm:col-span-2">
          <DateField
            value={date}
            onChange={(iso) => setDate(iso)}
            label="วันที่รับชำระและออกใบเสร็จ"
            placeholder="เลือกวันที่"
            className="h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Field>
      </div>

      {bad && (
        <p className="mt-3 rounded-[11px] border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-[12.5px] font-semibold text-destructive">
          {bad}
        </p>
      )}

      {warn.length > 0 && (
        <div className="mt-3 rounded-[11px] border border-border bg-accent px-3.5 py-3 text-[12.5px] leading-relaxed">
          <b className="block text-[13px] font-bold">ยอดไม่ตรงกับที่ตกลงไว้</b>
          {warn.map((w) => (
            <span key={w} className="mt-1 block">
              {w}
            </span>
          ))}
          <label className="mt-2.5 flex cursor-pointer items-start gap-2.5 font-semibold">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-px size-[18px] shrink-0 accent-[var(--primary)]"
            />
            <span>ตรวจกับรายการเดินบัญชีแล้ว ยืนยันออกใบเสร็จตามยอดนี้</span>
          </label>
        </div>
      )}

      {whtNum > 0 && !bad && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
          ใบเสร็จจะขึ้นหมายเหตุ &quot;{WHT_CERT_WAIT}&quot; จนกว่าลูกค้าจะส่งหนังสือรับรองมา
        </p>
      )}

      <p className="mt-3.5">
        <span className="inline-block rounded-[20px] bg-[var(--success-soft)] px-3.5 py-1.5 text-[13px] font-bold text-[var(--success)]">
          {receiptKind(ISSUER_VAT)}
        </span>
      </p>
    </Sheet>
  );
}
