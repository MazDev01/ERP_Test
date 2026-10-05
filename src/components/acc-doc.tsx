"use client";

/*
 * เอกสารฝั่งบัญชีแบบเต็มหน้า — ต้นแบบ dose-erp-maz/invoice-view.html และ receipt-view.html
 *   ใบแจ้งหนี้   /acc/billing/invoice/<เลขที่>  (เปิดจากแท็บใบแจ้งหนี้ หน้าวางบิล)
 *   ใบเสร็จรับเงิน /acc/receipts/<เลขที่>        (เปิดจากแท็บออกแล้ว หน้าใบเสร็จ)
 *
 * ยอดทุกบรรทัดอ่านจากเอกสารที่บันทึกไว้ ไม่คิดใหม่ — เอกสารออกเลขแล้วห้ามเปลี่ยน
 * ใบแจ้งหนี้และใบเสร็จต้องขึ้นภาษีครบสี่บรรทัด (ราคาก่อนภาษี · VAT · หัก ณ ที่จ่าย · ยอดชำระสุทธิ)
 * เพราะใบกำกับภาษีที่ไม่มีฐานภาษีกับยอด VAT ใช้เป็นหลักฐานทางภาษีไม่ได้ และผู้รับก็ตรวจไม่ได้ว่าถูกหักเท่าไร
 * ตัวเลขทั้งสี่บรรทัดมาจากใบแจ้งหนี้ที่แบ่งตามสัดส่วนงวดไว้แล้วตั้งแต่ตอนออกเลข (invoiceAmounts, AC-BR-02)
 * หัวกระดาษตามผู้ออกใบเสนอราคาของดีล (issuerInfo) · ข้อมูลผู้ซื้อตามลูกค้าของดีลฝั่งขาย
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  creditKind,
  debitKind,
  INVOICE_STATUS,
  NO_WHT_NOTE,
  seqText,
  WHT_CERT_WAIT,
  type AccDeal,
} from "@/lib/acc-data";
import { debitsOfCredit, invoiceStatus, useAcc } from "@/lib/acc-store";
import { taxInvoiceBuyer, type TaxInvoiceBuyer } from "@/lib/crm-data";
import { customerOfDeal, useCrm, type CrmState } from "@/lib/crm-store";
import { baht, bahtText, thaiDateLong, thaiStamp } from "@/lib/format";
import { ChevronLeftIcon, DownloadIcon, PrintIcon } from "./icons";
import { issuerInfo } from "./quotation-paper";

/**
 * สามบรรทัดภาษีที่อยู่เหนือยอดชำระสุทธิ — ราคาก่อนภาษี · VAT · หักภาษี ณ ที่จ่าย
 *
 * อัตราคิดกลับจากตัวเลขที่บันทึกไว้ในใบแจ้งหนี้ ไม่ใช่อัตราปัจจุบัน เอกสารเก่าจะได้ไม่เปลี่ยนตามค่าตั้งค่า
 * งวดที่ไม่มี VAT หรือลูกค้าไม่ได้หักภาษี ต้องเขียนว่า "ไม่มี" ไม่ใช่ซ่อนบรรทัดทิ้ง
 */
function taxRows(m: { base: number; vat: number; wht: number }) {
  /* ปัดทศนิยมหนึ่งตำแหน่ง เศษจากการแบ่งงวดจะได้ไม่ทำให้ขึ้น 6.9997% */
  const pct = (part: number) => (m.base > 0 ? Math.round((part / m.base) * 1000) / 10 : 0);
  const vatPct = m.vat > 0 ? pct(m.vat) : 0;
  const whtPct = m.wht > 0 ? pct(m.wht) : 0;
  return [
    { label: "ราคาก่อนภาษี", value: baht(m.base) },
    {
      label: vatPct ? `ภาษีมูลค่าเพิ่ม ${vatPct}%` : "ภาษีมูลค่าเพิ่ม",
      value: vatPct ? baht(m.vat) : "ไม่มี",
    },
    {
      label: whtPct ? `หักภาษี ณ ที่จ่าย ${whtPct}%` : "หักภาษี ณ ที่จ่าย",
      value: whtPct ? `-${baht(m.wht)}` : NO_WHT_NOTE,
    },
  ];
}

/** "วันที่ 2 กันยายน 2569" → "2 กันยายน 2569" */
function longDate(iso: string) {
  return thaiDateLong(iso).replace(/^วันที่ /, "");
}

/**
 * ผู้ออกเอกสารและผู้ซื้อของดีลหนึ่ง — อ่านจากฝั่งขายเพราะบัญชีเก็บแค่ชื่อลูกค้า
 * ผู้ซื้อออกมาเป็นชุดที่ใบกำกับภาษีต้องใช้ พร้อมรายการช่องที่ยังขาด (ถ้ามี)
 */
function parties(crm: CrmState, deal: AccDeal | undefined, cusName: string) {
  const quotation = crm.quotations.find((q) => q.no === deal?.quo);
  const customer = customerOfDeal(crm, deal?.no ?? "", deal?.quo ?? "", cusName);
  return { info: issuerInfo(quotation?.issuer), buyer: taxInvoiceBuyer(customer) };
}

export function AccInvoiceView({ no }: { no: string }) {
  const acc = useAcc();
  const crm = useCrm();
  const v = acc.invoices.find((x) => x.no === no);

  if (!v) return <NotFound back="/acc/billing" backLabel="กลับไปหน้าวางบิล" no={no} what="ไม่พบใบแจ้งหนี้นี้" />;

  const deal = acc.deals.find((d) => d.no === v.deal);
  const seqs = deal?.plan.length ?? 0;
  const item = deal?.plan.find((p) => p.seq === v.seq);
  const { info, buyer } = parties(crm, deal, v.cus);
  /* สถานะคิดจากยอดค้างและใบเสร็จจริงเสมอ ไม่อ่านค่าที่ค้างอยู่ในตัวเอกสาร */
  const status = INVOICE_STATUS[invoiceStatus(acc, v)];

  return (
    <DocShell
      back="/acc/billing"
      backLabel="กลับไปหน้าวางบิล"
      no={v.no}
      cus={v.cus}
      reference={`${v.deal} งวดที่ ${v.seq}${seqs ? ` จาก ${seqs}` : ""}`}
      tag={status}
    >
      <Paper
        title="ใบแจ้งหนี้ / INVOICE"
        no={v.no}
        date={`วันที่ ${longDate(v.issue)}`}
        note={`ครบกำหนดชำระ ${longDate(v.due)}`}
        info={info}
        buyer={buyer}
        fallbackName={v.cus}
        lines={[
          `ค่าบริการตามใบเสนอราคา ${deal?.quo}`,
          `งวดที่ ${v.seq}${seqs ? ` จาก ${seqs} งวด` : ""}${
            item?.pct && deal ? ` (${item.pct}% ของยอดดีล ${baht(deal.net)} บาท)` : ""
          }`,
        ]}
        /* ช่อง "รวม" ของรายการคือราคาก่อนภาษี ภาษีไปอยู่บรรทัดของมันเองด้านล่าง ยอดจะได้บวกกันครบ */
        amount={v.base}
        totals={taxRows(v)}
        grand={{ label: "ยอดชำระสุทธิ", value: v.total }}
        /* ใบที่ยกเลิกไปพร้อมดีล — พิมพ์ไว้บนเอกสารว่าใครยกเลิก เมื่อไร และตกลงอะไรกับลูกค้าไว้ */
        notes={
          v.cancelled
            ? [
                `ยกเลิกเมื่อ ${thaiStamp(v.cancelled.at)} โดย${v.cancelled.by} · ${v.cancelled.why}`,
                ...(v.cancelled.note ? [v.cancelled.note] : []),
              ]
            : []
        }
        payTitle="เงื่อนไขการชำระเงิน"
        signs={["ผู้รับวางบิล", "ผู้วางบิล"]}
      />
    </DocShell>
  );
}

export function AccReceiptView({ no }: { no: string }) {
  const acc = useAcc();
  const crm = useCrm();
  const r = acc.receipts.find((x) => x.no === no);

  if (!r) return <NotFound back="/acc/receipts" backLabel="กลับไปหน้าใบเสร็จ" no={no} what="ไม่พบใบเสร็จนี้" />;

  const deal = acc.deals.find((d) => d.no === r.deal);
  const seq = seqText(r.seq, deal?.plan.length ?? 0);
  const { info, buyer } = parties(crm, deal, r.cus);
  /* ยอดทุกบรรทัดมาจากใบเสร็จเอง ไม่ใช่จากใบแจ้งหนี้ — ใบเสร็จบันทึกเงินที่ได้รับจริงไว้แล้ว */
  const money = { base: r.base, vat: r.vatAmount, wht: r.wht, total: r.total };

  return (
    <DocShell
      back="/acc/receipts"
      backLabel="กลับไปหน้าใบเสร็จ"
      no={r.no}
      cus={r.cus}
      reference={`อ้างอิงใบแจ้งหนี้ ${r.inv} · ${seq}`}
      tag={{ label: "รับชำระแล้ว", cls: "t-ok" }}
    >
      <Paper
        /* ผู้ออกเอกสารจดทะเบียนภาษีมูลค่าเพิ่ม ใบเสร็จจึงเป็นใบกำกับภาษีด้วย */
        title={r.vat ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน / RECEIPT"}
        no={r.no}
        date={`วันที่ ${longDate(r.date)}`}
        note={`อ้างอิงใบแจ้งหนี้ ${r.inv}`}
        info={info}
        buyer={buyer}
        fallbackName={r.cus}
        lines={[`รับชำระค่าบริการตามใบเสนอราคา ${deal?.quo}`, seq]}
        amount={money.base}
        totals={taxRows(money)}
        /* ใบเสร็จบอกเงินที่ได้รับจริง ไม่ใช่ยอดเต็มของงวด — ส่วนที่ลูกค้าหักไว้อยู่บรรทัดภาษีด้านบน */
        grand={{ label: "ยอดเงินที่ได้รับ", value: money.total }}
        notes={
          r.wht > 0 && !r.certReceived
            ? [`${WHT_CERT_WAIT} จำนวน ${baht(r.wht)} บาท`]
            : []
        }
        payTitle="ชำระโดยโอนเข้าบัญชี"
        signs={["ผู้รับเงิน", "ผู้ชำระเงิน"]}
      />
    </DocShell>
  );
}

/*
 * ★ สามคอมโพเนนต์ข้างล่างนี้ "พักไว้" ไม่มี route ไหนเรียกแล้ว
 *   เจ้าของระบบสั่งพักใบลดหนี้ ใบเพิ่มหนี้ และการคืนเงิน (24 ก.ย. 2569)
 *   เก็บโค้ดไว้เผื่อเปิดใช้ใหม่ — วิธีเปิดคืนอยู่ที่หัวข้อเอกสารพักไว้ใน acc-data.ts
 *   ตอนนั้นต้องสร้าง src/app/acc/credits/[no]/page.tsx คืนให้เรียก AccCreditDocView
 *
 * ใบลดหนี้และใบเพิ่มหนี้ — /acc/credits/<เลขที่>
 *
 * ใช้กระดาษชุดเดียวกับใบแจ้งหนี้และใบเสร็จ จึงได้กติกาเดียวกันทั้งหมด
 * ผู้ซื้อต้องครบทั้งชื่อตามหนังสือรับรอง ที่อยู่ เลขประจำตัวผู้เสียภาษี และสำนักงานใหญ่/สาขา
 * ช่องที่ขาดไม่พิมพ์ขีดคั่นแทน · หัวเอกสารเป็นไทยคู่อังกฤษ และขึ้นกับการจดทะเบียน VAT ของผู้ออก
 * ยอดทุกบรรทัดอ่านจากเอกสารที่บันทึกไว้ ไม่คิดใหม่ เอกสารออกเลขแล้วห้ามเปลี่ยน (ข้อ 2)
 */
export function AccCreditNoteView({ no }: { no: string }) {
  const acc = useAcc();
  const crm = useCrm();
  const c = acc.credits.find((x) => x.no === no && x.status === "issued");

  if (!c)
    return (
      <NotFound
        back="/acc/credits"
        backLabel="กลับไปหน้าใบลดหนี้"
        no={no}
        what="ไม่พบใบลดหนี้นี้ — ใบที่ยังไม่ผ่านการอนุมัติยังไม่มีเลขที่"
      />
    );

  const deal = acc.deals.find((d) => d.no === c.deal);
  const inv = acc.invoices.find((v) => v.no === c.inv);
  const seqs = deal?.plan.length ?? 0;
  const { info, buyer } = parties(crm, deal, c.cus);
  /* ใบเพิ่มหนี้ที่ออกมาแก้ใบนี้ ต้องอ้างกลับถึงกันทั้งสองทาง ไม่งั้นคนถือเอกสารใบเดียวไม่รู้ว่ามีอีกใบ */
  const fixes = debitsOfCredit(acc, c.no);

  return (
    <DocShell
      back="/acc/credits"
      backLabel="กลับไปหน้าใบลดหนี้"
      no={c.no}
      cus={c.cus}
      reference={`อ้างอิงใบแจ้งหนี้ ${c.inv}${inv ? ` งวดที่ ${inv.seq}${seqs ? ` จาก ${seqs}` : ""}` : ""}${
        c.receipt ? ` · ใบเสร็จ ${c.receipt}` : ""
      }`}
      tag={{ label: "ออกเอกสารแล้ว", cls: "t-ok" }}
    >
      <Paper
        title={`${creditKind(c.vatDoc)} / CREDIT NOTE`}
        no={c.no}
        date={`วันที่ ${longDate(c.issue)}`}
        note={`อ้างอิงใบแจ้งหนี้ ${c.inv}`}
        info={info}
        buyer={buyer}
        fallbackName={c.cus}
        lines={[
          `ลดหนี้ตามใบแจ้งหนี้ ${c.inv}${inv ? ` งวดที่ ${inv.seq}` : ""}`,
          ...(deal ? [`ค่าบริการตามใบเสนอราคา ${deal.quo}`] : []),
          `เหตุผล : ${c.reason}`,
        ]}
        amount={c.base}
        totals={taxRows(c)}
        grand={{ label: "ยอดลดหนี้สุทธิ", value: c.total }}
        notes={[
          `ยอดตามใบแจ้งหนี้เดิม ${baht(inv?.total ?? 0)} บาท — ใบแจ้งหนี้และใบเสร็จเดิมยังมีผลตามเลขที่เดิมทุกประการ`,
          ...fixes.map(
            (d) => `แก้ไขด้วยใบเพิ่มหนี้ ${d.no} จำนวน ${baht(d.total)} บาท เมื่อ ${longDate(d.issue)}`,
          ),
        ]}
        payTitle="ติดต่อฝ่ายบัญชี"
        signs={["ผู้รับใบลดหนี้", "ผู้ออกใบลดหนี้"]}
      />
    </DocShell>
  );
}

export function AccDebitNoteView({ no }: { no: string }) {
  const acc = useAcc();
  const crm = useCrm();
  /* ใบที่ยังรอผู้บริหารยังไม่มีเลขที่และยังไม่ใช่เอกสาร — เปิดหน้าเอกสารไม่ได้ */
  const d = acc.debits.find((x) => x.no === no && x.status === "issued");

  if (!d)
    return <NotFound back="/acc/credits" backLabel="กลับไปหน้าใบลดหนี้" no={no} what="ไม่พบใบเพิ่มหนี้นี้" />;

  const deal = acc.deals.find((x) => x.no === d.deal);
  const { info, buyer } = parties(crm, deal, d.cus);
  const credit = acc.credits.find((c) => c.no === d.credit);

  return (
    <DocShell
      back="/acc/credits"
      backLabel="กลับไปหน้าใบลดหนี้"
      no={d.no}
      cus={d.cus}
      reference={`แก้ไขใบลดหนี้ ${d.credit} · อ้างอิงใบแจ้งหนี้ ${d.inv}`}
      tag={{ label: "ออกเอกสารแล้ว", cls: "t-ok" }}
    >
      <Paper
        title={`${debitKind(d.vatDoc)} / DEBIT NOTE`}
        no={d.no}
        date={`วันที่ ${longDate(d.issue)}`}
        note={`แก้ไขใบลดหนี้ ${d.credit}`}
        info={info}
        buyer={buyer}
        fallbackName={d.cus}
        lines={[
          `เพิ่มหนี้เพื่อแก้ไขใบลดหนี้ ${d.credit}`,
          `อ้างอิงใบแจ้งหนี้ ${d.inv}`,
          `เหตุผล : ${d.reason}`,
        ]}
        amount={d.base}
        totals={taxRows(d)}
        grand={{ label: "ยอดเพิ่มหนี้สุทธิ", value: d.total }}
        notes={[
          `ใบลดหนี้ ${d.credit}${credit ? ` ลงวันที่ ${longDate(credit.issue)} จำนวน ${baht(credit.total)} บาท` : ""} ยังมีผลตามเลขที่เดิม เอกสารที่ออกเลขแล้วยกเลิกย้อนหลังไม่ได้ ใบนี้จึงเป็นการแก้ด้วยเอกสารใหม่`,
        ]}
        payTitle="เงื่อนไขการชำระเงิน"
        signs={["ผู้รับใบเพิ่มหนี้", "ผู้ออกใบเพิ่มหนี้"]}
      />
    </DocShell>
  );
}

/** หน้าเอกสารเดียวที่แยกตามชนิดจากเลขที่ — ใบลดหนี้กับใบเพิ่มหนี้อยู่ใต้เมนูเดียวกัน */
export function AccCreditDocView({ no }: { no: string }) {
  const acc = useAcc();
  return acc.debits.some((d) => d.no === no && d.status === "issued") ? (
    <AccDebitNoteView no={no} />
  ) : (
    <AccCreditNoteView no={no} />
  );
}

// ─── ส่วนประกอบร่วม ────────────────────────────────────────────────

/**
 * กรอบกระดาษ — บนจอกว้างวางกระดาษตามเดิมทุกอย่าง
 * บนมือถือ (กว้างไม่ถึง 640px) กระดาษยังเป็นหน้า A4 เต็มแผ่นแบบเดียวกับที่พิมพ์ออกมา
 * แล้วย่อทั้งแผ่นให้พอดีความกว้างจอ (zoom) ไม่เรียงเนื้อหาใหม่เป็นแถวเดียว
 * ตอนสั่งพิมพ์ปิดโหมดย่อ ให้กระดาษกลับไปใช้สไตล์พิมพ์ตามปกติ
 */
function PaperFit({ children }: { children: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const phone = window.matchMedia("(max-width: 639px)");
    let printing = false;
    const fit = () => setZoom(!printing && phone.matches ? Math.min(1, el.clientWidth / 794) : 0);
    const before = () => {
      printing = true;
      fit();
    };
    const after = () => {
      printing = false;
      fit();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    phone.addEventListener("change", fit);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      ro.disconnect();
      phone.removeEventListener("change", fit);
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return (
    <div ref={box} className="w-full">
      <div
        data-a4={zoom ? "" : undefined}
        className="group/doc flex flex-col items-center gap-5"
        style={zoom ? { zoom, width: 794 } : undefined}
      >
        {children}
      </div>
      {zoom > 0 && (
        <p className="no-print mt-2 text-center text-[11.5px] text-muted-foreground sm:hidden">
          ย่อกระดาษ A4 ให้พอดีจอ · ถ่างสองนิ้วเพื่อขยายอ่าน
        </p>
      )}
    </div>
  );
}
function NotFound({ back, backLabel, no, what }: { back: string; backLabel: string; no: string; what: string }) {
  return (
    <div className="space-y-4">
      <div className="bar">
        <div className="flex min-w-0 items-start gap-3">
          <BackLink href={back} label={backLabel} />
          <div className="min-w-0">
            <h1 className="num">{no}</h1>
            <p>{what}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BackLink({ href, label }: { href: string; label: string }) {
  return (
    /* ปุ่มไอคอนล้วน — ต้องมีทั้งชื่อให้โปรแกรมอ่านหน้าจอและคำอธิบายตอนชี้ ไม่งั้นไม่มีใครเดาออกว่ากดแล้วไปไหน */
    <Link href={href} aria-label={label} title={label} className="mt-0.5 grid size-9 flex-none place-items-center rounded-[10px] border border-border bg-card text-foreground hover:border-primary hover:text-primary">
      <ChevronLeftIcon className="size-[17px]" strokeWidth={2.2} />
    </Link>
  );
}

function DocShell({
  back,
  backLabel,
  no,
  cus,
  reference,
  tag,
  actions,
  children,
}: {
  back: string;
  backLabel: string;
  no: string;
  cus: string;
  reference: string;
  tag: { label: string; cls: string };
  /** ปุ่มงานของเอกสารใบนี้ วางก่อนปุ่มพิมพ์ — เช่น ออกใบลดหนี้จากใบแจ้งหนี้ที่เรียกเก็บเกิน */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="bar no-print">
        <div className="flex min-w-0 flex-wrap items-start gap-3">
          <BackLink href={back} label={backLabel} />
          <div className="min-w-0">
            <h1 className="num">{no}</h1>
            <p>{cus}</p>
            <p className="num text-[12.5px]">{reference}</p>
          </div>
          <span className={`tag ${tag.cls} mt-1`}>
            <i />
            {tag.label}
          </span>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          {actions}
          <button type="button" className="btn glass-thin" onClick={() => window.print()}>
            <PrintIcon className="size-[15px]" strokeWidth={1.9} />
            พิมพ์
          </button>
          <button
            type="button"
            className="btn solid btn-solid btn-block-mobile shrink-0"
            onClick={() => window.print()}
          >
            <DownloadIcon className="size-[15px]" strokeWidth={2} />
            ดาวน์โหลด PDF
          </button>
        </div>
      </div>
      <PaperFit>{children}</PaperFit>
    </div>
  );
}

const SUB = "text-[11.5px] leading-[1.72] text-[#4a5058]";

function Paper({
  title,
  no,
  date,
  note,
  info,
  buyer,
  fallbackName,
  lines,
  amount,
  totals,
  grand,
  payTitle,
  notes = [],
  signs,
}: {
  title: string;
  no: string;
  date: string;
  note: string;
  info: ReturnType<typeof issuerInfo>;
  buyer: TaxInvoiceBuyer;
  /** ชื่อที่บันทึกไว้ในเอกสาร ใช้เมื่อยังไม่มีชื่อตามหนังสือรับรอง */
  fallbackName: string;
  lines: string[];
  amount: number;
  totals: { label: string; value: string }[];
  grand: { label: string; value: number };
  payTitle: string;
  /** หมายเหตุท้ายเอกสาร เช่น ยังรอหนังสือรับรองการหักภาษี ณ ที่จ่าย */
  notes?: string[];
  /** [ฝั่งลูกค้า (สีแบรนด์), ฝั่งบริษัท] */
  signs: [string, string];
}) {
  return (
    <article
      className="paper flex flex-col group-data-[a4]/doc:min-h-[1123px]! group-data-[a4]/doc:w-[794px]! group-data-[a4]/doc:max-w-none! group-data-[a4]/doc:px-14! group-data-[a4]/doc:pt-[52px]! group-data-[a4]/doc:pb-11!"
    >
      <header className="flex flex-col justify-between gap-7 sm:flex-row sm:items-start group-data-[a4]/doc:flex-row group-data-[a4]/doc:items-start">
        <div className="max-w-[52%]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/maz-logo.png" alt="MAZ" className="h-[34px] w-auto" />
          <p className="mt-1 text-[10px] font-semibold tracking-[0.13em] text-[#5a6069]">
            DIGITAL BUSINESS SOLUTION
          </p>
        </div>
        <div className="sm:text-right group-data-[a4]/doc:text-right">
          <h2 className="text-[21px] font-bold text-[#25292f]">{title}</h2>
          <p className="num mt-1 text-[13px] font-bold text-primary">{no}</p>
          <p className="mt-2 text-xs text-[#4a5058]">
            <span>{date}</span>
            <em className="ml-[18px] text-[#5a6069] not-italic">{note}</em>
          </p>
        </div>
      </header>

      <div className="mt-[18px] grid gap-7 sm:grid-cols-2 group-data-[a4]/doc:grid-cols-2">
        <div>
          <p className="mb-1 text-[13.5px] font-bold">{info.name}</p>
          <p className={`num ${SUB}`}>เลขประจำตัวผู้เสียภาษี : {info.taxId}</p>
          {info.lines.map((l) => (
            <p key={l} className={SUB}>
              {l}
            </p>
          ))}
        </div>
        <div>
          {/*
           * ผู้ซื้อบนใบกำกับภาษีต้องครบทั้งชื่อตามหนังสือรับรอง ที่อยู่ เลขประจำตัวผู้เสียภาษี
           * และสำนักงานใหญ่/สาขา — ช่องที่ยังไม่มีไม่พิมพ์ขีดคั่นแทน เพราะขีดไม่ได้บอกใครว่าขาดอะไร
           * เอกสารเก่าที่ออกไปก่อนมีช่องเหล่านี้ ขึ้นกรอบบอกให้ชัดว่าต้องตามเก็บข้อมูลอะไร
           */}
          <p className="mb-1 text-[13.5px] font-bold">{buyer.name || fallbackName}</p>
          {buyer.taxId && <p className={`num ${SUB}`}>เลขประจำตัวผู้เสียภาษี : {buyer.taxId}</p>}
          {buyer.address && <p className={SUB}>ที่อยู่ : {buyer.address}</p>}
          {buyer.branch && <p className={SUB}>{buyer.branch}</p>}
          {buyer.missing.length > 0 && (
            <p className="mt-1.5 rounded border border-[#c03] px-2 py-1.5 text-[11px] leading-[1.6] text-[#c03]">
              ข้อมูลผู้ซื้อไม่ครบ ({buyer.missing.join(" · ")}) — ใช้เป็นใบกำกับภาษีไม่ได้จนกว่าจะแก้ไข
            </p>
          )}
        </div>
      </div>

      <table className="items mt-[22px]">
        <colgroup>
          <col style={{ width: 64 }} />
          <col />
          <col style={{ width: 130 }} />
        </colgroup>
        <thead>
          <tr>
            <th className="c">ลำดับที่</th>
            <th>รายการ</th>
            <th className="r">รวม</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="c num">1</td>
            <td className="leading-[1.68]">
              {lines.map((l) => (
                <span key={l} className="block">
                  {l}
                </span>
              ))}
            </td>
            <td className="r num">{baht(amount)}</td>
          </tr>
        </tbody>
      </table>

      {/* ยอดรวม ช่องทางชำระ และลายเซ็นอยู่ท้ายกระดาษเสมอ */}
      <div className="mt-auto pt-6">
        <div className="grid gap-7 border-y-2 border-primary py-3.5 sm:grid-cols-[minmax(0,1fr)_300px] group-data-[a4]/doc:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex items-center gap-3.5">
            <span className="shrink-0 text-xs text-[#5a6069]">ตัวอักษร</span>
            <span className="flex-1 rounded bg-[#edeef1] px-3.5 py-2 text-center text-[12.5px]">
              {bahtText(grand.value)}
            </span>
          </div>
          <dl className="text-[12.5px]">
            {totals.map((t) => (
              <div key={t.label} className="flex justify-between gap-3.5 py-[7px]">
                <dt className="text-[#4a5058]">{t.label}</dt>
                <dd className="num font-semibold">{t.value}</dd>
              </div>
            ))}
            <div className="mt-1.5 flex items-center justify-between gap-3.5 border-t border-[#b9bfc8] pt-2.5">
              <dt className="text-[13.5px] font-bold text-[#25292f]">{grand.label}</dt>
              <dd className="num text-[16.5px] font-bold">{baht(grand.value)}</dd>
            </div>
          </dl>
        </div>

        {notes.map((n) => (
          <p key={n} className="mt-3 text-xs leading-[1.75] font-semibold text-[#25292f]">
            หมายเหตุ : {n}
          </p>
        ))}

        <div className="mt-5 grid gap-7 sm:grid-cols-2 group-data-[a4]/doc:grid-cols-2">
          <div>
            <h3 className="mb-1.5 text-xs font-semibold text-[#4a5058]">{payTitle}</h3>
            {info.bank.map((l) => (
              <p key={l} className="text-xs leading-[1.75] text-[#4a5058]">
                {l}
              </p>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-6">
            {signs.map((s, i) => (
              <div key={s} className="text-center">
                <b className={`mb-[34px] block text-xs font-semibold ${i === 0 ? "text-primary" : ""}`}>{s}</b>
                <span className="block h-px bg-[#8a9099]" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}
