"use client";

import Link from "next/link";
import { useHydrated } from "@/lib/pwa";
import { useRole } from "@/lib/role";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BUYER_TYPE,
  canRejectQuotation,
  quotationValidUntil,
  issuerOf,
  issuers,
  quotationTotals,
  whtRate,
  WHT_PCTS,
  type BuyerType,
  type Customer,
  type IssuerCode,
  type Quotation,
} from "@/lib/crm-data";
import { NO_WHT_NOTE } from "@/lib/acc-data";
import { addQuotation, updateCustomer, useCrm, type CrmState } from "@/lib/crm-store";
import { services, type ServiceKey } from "@/lib/pm-data";
import { addDays, baht, commaInput, round2, thaiDate, todayIso } from "@/lib/format";
import { cleanHtml, htmlToText } from "@/lib/rich-text";
import { CustomerCombo } from "./customer-combo";
import { CheckIcon, ChevronRightIcon, CloseIcon, EyeIcon } from "./icons";
import { Field } from "./lead-dialogs";
import { IssueNumberDialog, RejectQuotationDialog } from "./quotation-dialogs";
import { QuotationPaper } from "./quotation-paper";
import { RichEditor } from "./rich-editor";
import { ADD_VALUE, useAddOption } from "./add-option";
import { IssuerAddDialog } from "./issuer-add";

/*
 * หน้าสร้างใบเสนอราคา — ตามต้นแบบ quotation-new.html (หน้าเต็ม ไม่ใช่กล่องเด้ง)
 *
 *   ?customer=<รหัส>  เปิดจากหน้าผู้สนใจ เลือกลูกค้าไว้ให้ (รับ ?cus= ของต้นแบบด้วย)
 *   ?ps=<เลขที่คำขอ>   ออกจากคำขอก่อนการขาย — ใบที่ออกผูกกับคำขอนั้น เอกสารของคำขอจึงตามไปถึง PM
 *   ?from=<เลขที่>     ออกใบใหม่จากใบเดิม คัดลอกเฉพาะเนื้อหา เลขที่ วันที่ และภาษีคิดใหม่เสมอ
 *
 * บันทึกทางเดียว — "ออกเลขที่เอกสาร" ออกเลขทันที ย้อนไม่ได้ จึงถามยืนยันก่อนเสมอ
 * ผู้ใช้สั่ง 5 ต.ค. 2569: ไม่มีร่าง ออกแล้วแก้ไม่ได้ ต้องออกใบใหม่ (?from= ออกใบใหม่แทนใบเดิม ใบเดิมเก็บเป็นประวัติ)
 */

type Mode = { kind: "new" } | { kind: "from"; src: Quotation };

/** ค่าตั้งต้นของฟอร์มตามโหมดที่เปิดมา */
function initialOf(crm: CrmState, mode: Mode, presetCustomer?: string, ps?: string) {
  const src = mode.kind === "new" ? undefined : mode.src;
  /* ออกจากคำขอ — หาลูกค้าจากคำขอ ไม่มีก็ดูจากใบเสนอราคาที่เคยอ้างคำขอนี้ */
  const psReq = ps ? crm.presales.find((p) => p.no === ps) : undefined;
  const code =
    src?.customerCode ??
    presetCustomer ??
    psReq?.customerCode ??
    (ps ? crm.quotations.find((q) => q.ps === ps)?.customerCode : undefined);
  const customer = crm.customers.find((c) => c.code === code) ?? null;
  return {
    customer,
    service: (src?.service ?? "") as ServiceKey | "",
    issuer: (src?.issuer ?? "") as IssuerCode | "",
    buyer: (src?.buyer ?? customer?.type ?? "juristic") as BuyerType,
    validDays: String(src?.validDays ?? 30),
    body: src?.body ?? "",
    amount: !src ? "" : commaInput(String(round2(src.amount - src.discount))),
    /* ต้นแบบคัดลอกยอดก่อนภาษีมาเป็นจำนวนเงิน ส่วนลดเริ่มว่าง */
    discount: "",
    terms: src?.terms ?? "",
    wht: src?.wht ?? false,
    /* อัตราของใบเดิม ถ้าเป็นใบใหม่ใช้อัตรามาตรฐานเป็นค่าตั้งต้น */
    whtPct: src?.whtPct ?? whtRate(),
  };
}

export function QuotationNewPage() {
  /* รอ hydrate ก่อน — ใบที่สร้างในเครื่องอยู่ใน localStorage ตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์ยังหาไม่เจอ
     แล้วโหมด/ค่าตั้งต้นของฟอร์มจะถูกจำเป็นค่าว่างไปตลอด */
  const hydrated = useHydrated();
  return hydrated ? <NewPageBody /> : null;
}

function NewPageBody() {
  const crm = useCrm();
  const params = useSearchParams();
  const router = useRouter();
  const today = todayIso();

  const fromNo = params.get("from") ?? "";
  const ps = params.get("ps") ?? "";
  const presetCustomer = params.get("customer") ?? params.get("cus") ?? undefined;

  const mode: Mode = useMemo(() => {
    const from = fromNo ? crm.quotations.find((q) => q.no === fromNo) : undefined;
    if (from) return { kind: "from", src: from };
    return { kind: "new" };
    /* โหมดตัดสินครั้งเดียวตอนเปิดหน้า — บันทึกแล้วรายการเปลี่ยนก็ไม่สลับโหมดกลางทาง */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* key ใหม่ = ล้างฟอร์มทั้งหมด (ช่องค้นหาลูกค้าจำข้อความของตัวเองไว้ ต้องสร้างใหม่) */
  const [formKey, setFormKey] = useState(0);
  const [fresh, setFresh] = useState(false);
  const [done, setDone] = useState<ReactNode>(null);

  const effective: Mode = fresh ? { kind: "new" } : mode;

  return (
    <div className="space-y-4">
      <div className="bar">
        <div className="min-w-0">
          {/* เส้นทางแทนปุ่มย้อนกลับ (ต้นแบบ quotation-new.html · ผู้ใช้สั่ง 5 ต.ค. 2569) */}
          <nav aria-label="เส้นทาง" className="mb-2 flex items-center gap-2 text-[14px] text-muted-foreground">
            <Link href="/quotations" className="hover:text-foreground hover:underline underline-offset-4">
              ใบเสนอราคา
            </Link>
            <ChevronRightIcon className="size-3.5" strokeWidth={2.2} />
            <span aria-current="page">สร้างใหม่</span>
          </nav>
          <h1>สร้างใบเสนอราคา</h1>
          <p>ออกเลขที่เอกสารแล้วแก้ไขไม่ได้ ถ้าต้องเปลี่ยนให้ออกใบเสนอราคาใหม่แทนใบเดิม</p>
          {!fresh && <FromLine mode={mode} ps={ps} />}
        </div>
      </div>

      {done && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] bg-[var(--success-soft)] px-4 py-3 text-[13.5px] font-semibold text-[var(--success)]"
        >
          <CheckIcon className="size-4 shrink-0" strokeWidth={2.4} />
          {done}
        </p>
      )}

      <QuotationForm
        key={formKey}
        crm={crm}
        today={today}
        mode={effective}
        ps={fresh ? "" : ps}
        presetCustomer={fresh ? undefined : presetCustomer}
        onSaved={(msg) => {
          setDone(msg);
          window.scrollTo({ top: 0, behavior: "smooth" });
          /* ออกเลขแล้วล้างฟอร์ม กันบันทึกซ้ำเป็นอีกเลขที่ */
          setFresh(true);
          setFormKey((k) => k + 1);
        }}
        /* ยกเลิก = ออกจากฟอร์ม กลับไปหน้ารายการใบเสนอราคา (เจ้าของแจ้ง 25 ก.ย. 2569)
           เดิมล้างฟอร์มให้ว่างเฉย ๆ ฟอร์มที่ยังไม่ได้กรอกอะไรกดแล้วจึงเหมือนปุ่มเสีย */
        onReset={() => router.push("/quotations")}
      />
    </div>
  );
}

/** บรรทัดบอกที่มาของฟอร์มใต้หัวเรื่อง ตามต้นแบบ (.qn-from) */
function FromLine({ mode, ps }: { mode: Mode; ps: string }) {
  const lines: string[] = [];
  if (mode.kind === "from")
    lines.push(
      `คัดลอกจากใบ ${mode.src.no} ลงวันที่ ${thaiDate(mode.src.issued)} ยอด ${baht(quotationTotals(mode.src).grand)} บาท`,
    );
  if (ps) lines.push(`ออกจากคำขอก่อนการขาย ${ps}`);
  return (
    <>
      {lines.map((l) => (
        <p key={l} className="mt-1 text-[12.5px] font-semibold text-primary">
          {l}
        </p>
      ))}
    </>
  );
}

function QuotationForm({
  crm,
  today,
  mode,
  ps,
  presetCustomer,
  onSaved,
  onReset,
}: {
  crm: CrmState;
  today: string;
  mode: Mode;
  ps: string;
  presetCustomer?: string;
  onSaved: (msg: ReactNode) => void;
  onReset: () => void;
}) {
  const init = useMemo(() => initialOf(crm, mode, presetCustomer, ps), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [customer, setCustomer] = useState<Customer | null>(init.customer);
  /* เลขประจำตัวผู้เสียภาษี — ย้ายมากรอกตอนสร้างใบเสนอราคา (ผู้ใช้สั่ง 5 ต.ค. 2569)
     เติมจากผู้สนใจที่เลือก · ออกเลขแล้วบันทึกกลับเข้าข้อมูลผู้สนใจ เอกสารทุกใบอ่านจากที่เดียวกัน */
  const [taxId, setTaxId] = useState(init.customer?.taxId ?? "");
  const [service, setService] = useState<ServiceKey | "">(init.service);
  const addService = useAddOption({ catalog: "services" }, setService);
  const [issuer, setIssuer] = useState<IssuerCode | "">(init.issuer);
  const [addingIssuer, setAddingIssuer] = useState(false);
  const role = useRole();
  const [buyer, setBuyer] = useState<BuyerType>(init.buyer);
  const [validDays, setValidDays] = useState(init.validDays);
  const [body, setBody] = useState(init.body);
  const [amount, setAmount] = useState(init.amount);
  const [discount, setDiscount] = useState(init.discount);
  const [terms, setTerms] = useState(init.terms);
  const [wht, setWht] = useState(init.wht);
  /* อัตราหัก ณ ที่จ่ายของใบนี้ — งานคนละประเภทคนละอัตรา ต้องเลือกไว้ในใบ ไม่ใช่ให้จอปลายทางเดา */
  const [whtPct, setWhtPct] = useState(init.whtPct);
  /* ออกแทนใบเดิม — "new" = ใบใหม่แยก · เลขที่ = ออกแทนใบนั้น · null = ยังไม่เลือก
     ออกใบใหม่จากใบเดิม (?from=) เลือกใบต้นทางไว้ให้ก่อน เปลี่ยนได้ */
  const [rep, setRep] = useState<string | null>(mode.kind === "from" ? mode.src.no : null);
  const [touched, setTouched] = useState(false);
  const [preview, setPreview] = useState(false);
  /* ยืนยันก่อนออกเลขที่ — ขั้นนี้ย้อนไม่ได้ */
  const [confirming, setConfirming] = useState(false);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  const days = Number(validDays.replace(/\D/g, "")) || 0;
  const num = (v: string) => Number(v.replace(/,/g, "")) || 0;

  /** คิดยอดสดขณะกรอก ใช้กติกาเดียวกับตอนบันทึกจริง */
  const totals = useMemo(() => {
    /* คิดด้วยกติกาเดียวกับตอนบันทึกจริง (quotationTotals) ตัวเลขที่เห็นตอนกรอกจะได้ตรงกับเอกสาร */
    const t = quotationTotals({
      amount: num(amount),
      discount: num(discount),
      issuer: issuer || "MAZ",
      buyer,
      wht,
      whtPct,
    });
    return { ...t, disc: t.discount };
  }, [amount, discount, issuer, buyer, wht, whtPct]);

  /*
   * ผู้ใช้สั่ง 5 ต.ค. 2569 — จะออกใบใหม่ให้ลูกค้ารายนี้ ต้องปฏิเสธใบเดิมที่ยังค้างก่อน
   * ไม่ว่าจะออกเป็นใบแก้ หรือลูกค้าไม่เอาจริง ๆ
   *   pending = ใบที่ยังไม่ได้ตัดสิน (รอดำเนินการ/หมดอายุ) → ต้องกดปฏิเสธก่อนถึงออกเลขได้
   *   waiting = ใบที่ปฏิเสธแล้ว ยังไม่มีใบใหม่แทน → เลือกได้ว่าออกเป็นใบแก้ของใบนั้น หรือใบใหม่แยก
   */
  const pending = useMemo(() => {
    if (!customer) return [];
    return crm.quotations.filter(
      (q) =>
        q.customerCode === customer.code &&
        canRejectQuotation(q, crm.deals.some((d) => d.quotationNo === q.no)),
    );
  }, [crm.quotations, crm.deals, customer]);
  const waiting = useMemo(() => {
    if (!customer) return [];
    return crm.quotations.filter(
      (q) =>
        q.customerCode === customer.code &&
        Boolean(q.no) &&
        Boolean(q.rejectedAt) &&
        !q.replacedBy &&
        !crm.deals.some((d) => d.quotationNo === q.no),
    );
  }, [crm.quotations, crm.deals, customer]);
  const [rejecting, setRejecting] = useState<Quotation | null>(null);
  const repValue = rep && (rep === "new" || waiting.some((q) => q.no === rep)) ? rep : null;

  const problems = {
    customer: !customer,
    service: !service,
    pending: pending.length > 0,
    rep: waiting.length > 0 && !repValue,
    issuer: !issuer,
    days: days <= 0,
    taxId: taxId.length > 0 && taxId.length !== 13,
    items: !htmlToText(body) || totals.gross <= 0,
  };
  const miss = [
    problems.customer && "ผู้สนใจ",
    problems.service && "บริการ",
    problems.pending && "ปฏิเสธใบเดิมที่ค้างอยู่",
    problems.rep && "ออกแทนใบเดิม",
    problems.issuer && "ออกในนาม",
    problems.days && "จำนวนวันยืนราคา",
    problems.taxId && "เลขประจำตัวผู้เสียภาษี",
    problems.items && "รายละเอียดและจำนวนเงิน",
  ].filter((x): x is string => Boolean(x));

  /** ค่าที่จะบันทึก — กติกาคิดยอดชุดเดียวกับที่เห็นบนจอ */
  function inputOf(c: Customer, iss: IssuerCode, svc: ServiceKey) {
    return {
      customerCode: c.code,
      issuer: iss,
      buyer,
      service: svc,
      validDays: days,
      amount: totals.gross,
      discount: totals.disc,
      wht,
      whtPct,
      body: cleanHtml(body),
      terms: terms.trim(),
      ps: ps || (mode.kind === "new" ? undefined : mode.src.ps),
      replaces: repValue && repValue !== "new" ? repValue : undefined,
    };
  }

  /** กรอกครบหรือยัง — ไม่ครบก็เลื่อนไปที่สรุปสิ่งที่ขาด ไม่ปล่อยให้กดแล้วเงียบ */
  function ready() {
    setTouched(true);
    if (!miss.length && customer && issuer && service) return { customer, issuer, service };
    window.setTimeout(() => summaryRef.current?.scrollIntoView({ block: "center", behavior: "smooth" }), 0);
    return null;
  }

  /* ออกเลขที่เอกสาร — ย้อนไม่ได้ ผ่านกล่องยืนยันมาแล้วเท่านั้น */
  function issueNow() {
    const ok = ready();
    if (!ok) return;
    setConfirming(false);
    const input = inputOf(ok.customer, ok.issuer, ok.service);
    if (taxId !== (ok.customer.taxId ?? "")) updateCustomer(ok.customer.code, { taxId });
    const no = addQuotation(input);
    onSaved(
      <>
        ออกเลขที่ <b className="num">{no}</b> แล้ว · รวมทั้งสิ้น {baht(totals.grand)} บาท · แก้ไขไม่ได้อีก
        <Link href={`/quotations/${encodeURIComponent(no)}`} className="font-semibold underline">
          เปิดเอกสารไปส่งลูกค้า
        </Link>
        <Link href="/quotations" className="font-semibold underline">
          กลับไปรายการใบเสนอราคา
        </Link>
      </>,
    );
  }

  /* กด Enter ในช่องกรอกไม่บันทึกอะไร — ออกเลขที่ย้อนไม่ได้ ต้องกดปุ่มและยืนยันเท่านั้น */
  function submit(e: React.FormEvent) {
    e.preventDefault();
  }

  /* มือถือ: การ์ดตามต้นแบบ — มน 20 ไม่มีขอบ (มาจาก .glass บนมือถือ) ระยะใน 14px */
  const card = "glass rounded-2xl px-4 py-5 sm:px-6 max-md:!p-[14px]";
  const h2 = "mb-4 border-b border-border pb-3 text-[15px] font-semibold";

  return (
    <form
      onSubmit={submit}
      noValidate
      /* มือถือ: ช่องกรอกสูง 46 มุม 12 ตามต้นแบบ — จอคอมคงเดิม */
      className="max-md:[&_.field-control]:!h-[46px] max-md:[&_.field-control]:!rounded-xl max-md:[&_.field-control]:!text-[15px]"
    >
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <section className={card}>
            <h2 className={h2}>ผู้สนใจ</h2>
            <Field label="ผู้สนใจ" required error={touched && problems.customer ? "เลือกลูกค้าก่อน" : undefined}>
              <CustomerCombo
                /* ต้นแบบ quotation-new ไม่มีรายที่ปฏิเสธแล้วในรายการ · เลือกแล้วแสดงแค่ชื่อ · มีป้ายไม่มีเลขภาษี */
                customers={crm.customers.filter((c) => c.status !== "ปฏิเสธ")}
                nameOnly
                taxFlag
                value={customer}
                onChange={(c) => {
                  setCustomer(c);
                  setRep(null);
                  setTaxId(c?.taxId ?? "");
                  if (c) setBuyer(c.type);
                }}
                invalid={touched && problems.customer}
              />
            </Field>

            <div className="grid gap-x-5 md:grid-cols-2">
              <Field
                label="เลขประจำตัวผู้เสียภาษี"
                error={touched && problems.taxId ? "กรอกให้ครบ 13 หลัก" : undefined}
                hint={
                  customer && !taxId
                    ? "ผู้สนใจรายนี้ยังไม่มีเลขประจำตัวผู้เสียภาษี · จำเป็นตอนออกเอกสารการเงิน"
                    : "13 หลัก · ออกเลขแล้วบันทึกไว้กับผู้สนใจรายนี้"
                }
              >
                <input
                  value={taxId}
                  inputMode="numeric"
                  onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))}
                  placeholder="13 หลัก"
                  aria-invalid={touched && problems.taxId}
                  className={`field-control num ${touched && problems.taxId ? "border-destructive" : ""}`}
                />
              </Field>
            </div>

            {pending.length > 0 && (
              <div
                className={`mb-[15px] rounded-xl border-[1.4px] bg-[var(--warning-soft)] px-3.5 py-3 ${
                  touched ? "border-destructive" : "border-transparent"
                }`}
              >
                <p className="text-[13px] font-semibold text-[var(--warning)]">
                  ลูกค้ารายนี้มีใบเสนอราคาที่ยังรอดำเนินการ ต้องกดปฏิเสธใบเดิมก่อนจึงออกใบใหม่ได้
                </p>
                <p className="mt-0.5 text-[12px] text-muted-foreground">
                  ทั้งกรณีออกใบแก้ และกรณีลูกค้าไม่ต้องการแล้ว · ใบที่ปฏิเสธเก็บไว้เป็นประวัติ
                </p>
                <ul className="mt-2.5 grid gap-2">
                  {pending.map((q) => (
                    <li
                      key={q.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2"
                    >
                      <span className="min-w-0">
                        <b className="num block text-[13.5px] font-semibold">{q.no}</b>
                        <em className="block text-[11.5px] text-muted-foreground not-italic">
                          {baht(quotationTotals(q).grand)} บาท · มีผลถึง {thaiDate(quotationValidUntil(q))}
                        </em>
                      </span>
                      <button type="button" className="lnk shrink-0" onClick={() => setRejecting(q)}>
                        ปฏิเสธ
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {rejecting && (
              <RejectQuotationDialog
                quotation={rejecting}
                customerName={customer?.name ?? rejecting.customerCode}
                onClose={() => {
                  /* ปฏิเสธแล้วเลือกใบนั้นเป็นใบที่จะออกแทนให้เลย (ใบแก้) เปลี่ยนเป็นใบใหม่แยกได้ */
                  if (crm.quotations.some((x) => x.id === rejecting.id)) setRep(rejecting.no);
                  setRejecting(null);
                }}
              />
            )}

            {pending.length === 0 && waiting.length > 0 && (
              <div className="mb-[15px]" role="radiogroup" aria-labelledby="rep-label">
                <p id="rep-label" className="mb-1.5 text-[12.5px] font-semibold text-muted-foreground">
                  ออกเป็นใบแก้ของใบที่ปฏิเสธไปแล้ว หรือใบใหม่แยก
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {waiting.map((q) => (
                    <RepOption
                      key={q.id}
                      checked={repValue === q.no}
                      onPick={() => setRep(q.no)}
                      title={`ใบแก้ของ ${q.no}`}
                      sub={`${baht(quotationTotals(q).grand)} บาท${q.rejectReason ? ` · ${q.rejectReason}` : ""}`}
                      bad={touched && problems.rep}
                    />
                  ))}
                  <RepOption
                    checked={repValue === "new"}
                    onPick={() => setRep("new")}
                    title="ออกเป็นใบใหม่แยก"
                    sub="ไม่ผูกกับใบเดิม"
                    bad={touched && problems.rep}
                  />
                </div>
                {touched && problems.rep && (
                  <p className="mt-1.5 text-[12.5px] text-destructive">เลือกว่าออกเป็นใบใหม่แยก หรือออกแทนใบเดิม</p>
                )}
              </div>
            )}

            <div className="grid gap-x-5 md:grid-cols-2">
              <Field
                label="บริการ"
                required
                error={touched && problems.service ? "เลือกบริการ" : undefined}
                hint="1 ใบเสนอราคา = 1 บริการ ถ้าลูกค้าซื้อหลายบริการให้ออกคนละใบ"
              >
                <select
                  value={service}
                  onChange={(e) => addService.pick(e.target.value) || setService(e.target.value as ServiceKey)}
                  className="field-control cursor-pointer"
                >
                  <option value="">— เลือกบริการ —</option>
                  {services().map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                  {addService.option}
                </select>
              </Field>

              <Field
                label="ออกในนาม"
                required
                error={touched && problems.issuer ? "เลือกผู้ออกเอกสาร" : undefined}
                hint={
                  issuer && !issuerOf(issuer).vat
                    ? "ผู้ออกรายนี้ไม่ได้จดทะเบียน VAT จึงไม่คิดภาษีมูลค่าเพิ่ม"
                    : undefined
                }
              >
                <select
                  value={issuer}
                  onChange={(e) =>
                    e.target.value === ADD_VALUE ? setAddingIssuer(true) : setIssuer(e.target.value as IssuerCode)
                  }
                  className="field-control cursor-pointer"
                >
                  <option value="">— เลือกผู้ออกเอกสาร —</option>
                  {issuers().map(({ code: k, label }) => (
                    <option key={k} value={k}>
                      {label}
                    </option>
                  ))}
                  {/* เพิ่มผู้ออกเอกสารได้เฉพาะฝ่ายบุคคล ซึ่งเป็นผู้ดูแลการตั้งค่า (Full Proposal · M5) */}
                  {role === "hr" && (
                    <option value={ADD_VALUE} className="font-semibold text-primary">
                      ＋ เพิ่มผู้ออกเอกสารใหม่…
                    </option>
                  )}
                </select>
              </Field>

              <Field label="ประเภทผู้ซื้อ">
                <select
                  value={buyer}
                  onChange={(e) => setBuyer(e.target.value as BuyerType)}
                  className="field-control cursor-pointer"
                >
                  {(Object.keys(BUYER_TYPE) as BuyerType[]).map((k) => (
                    <option key={k} value={k}>
                      {BUYER_TYPE[k]}
                    </option>
                  ))}
                </select>
              </Field>

              <Field
                label="ใบเสนอราคายืนราคา (วัน)"
                required
                hint={days > 0 ? `ครบกำหนด ${thaiDate(addDays(today, days))}` : undefined}
              >
                <input
                  value={validDays}
                  inputMode="numeric"
                  onChange={(e) => setValidDays(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  aria-invalid={touched && problems.days}
                  className={`field-control num ${touched && problems.days ? "border-destructive" : ""}`}
                />
              </Field>
            </div>
            {addingIssuer && (
              <IssuerAddDialog
                onClose={() => setAddingIssuer(false)}
                onAdded={(code) => {
                  setIssuer(code);
                  setAddingIssuer(false);
                }}
              />
            )}
            {addService.dialog}
          </section>

          <section className={card}>
            <h2 className={h2}>รายการ</h2>
            <label id="bodyLabel" className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
              รายละเอียด<em className="ml-0.5 text-primary not-italic">*</em>
            </label>
            <RichEditor
              value={body}
              onChange={setBody}
              labelId="bodyLabel"
              invalid={touched && !htmlToText(body)}
              placeholder="วางรายละเอียดจาก Word ได้เลย ตัวหนา ขีดเส้นใต้ จุดหัวข้อ และตัวแบ่งหน้าจะติดมาด้วย"
            />
            {touched && problems.items && (
              <p className="mt-2.5 text-[12.5px] text-destructive">กรอกรายละเอียดและจำนวนเงิน</p>
            )}
          </section>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-[88px]">
          <section className={card}>
            <h2 className={h2}>จำนวนเงินและการชำระเงิน</h2>
            <div className="grid grid-cols-2 gap-x-4 max-md:grid-cols-1">
              <Field label="จำนวนเงิน" required>
                <input
                  value={amount}
                  inputMode="decimal"
                  onChange={(e) => setAmount(commaInput(e.target.value))}
                  placeholder="0"
                  className="field-control num text-right"
                />
              </Field>
              <Field label="ส่วนลด">
                <input
                  value={discount}
                  inputMode="decimal"
                  onChange={(e) => setDiscount(commaInput(e.target.value))}
                  placeholder="0"
                  className="field-control num text-right"
                />
              </Field>
            </div>
            <Field label="เงื่อนไขการชำระเงิน">
              <input
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="เช่น มัดจำ 50% ก่อนเริ่มงาน ส่วนที่เหลือชำระเมื่อส่งมอบ"
                className="field-control"
              />
            </Field>
          </section>

          <section className={card}>
            <h2 className={h2}>สรุปยอด</h2>
            {/* เรียงและใช้คำให้ตรงกับกระดาษใบเสนอราคา รวมทั้งสิ้น = ฐาน + VAT − หัก ณ ที่จ่าย */}
            <dl className="text-[13.5px]">
              {totals.disc > 0 && (
                <>
                  <Row label="รวมเป็นเงิน" value={baht(totals.gross)} />
                  <Row label="หักส่วนลด" value={`-${baht(totals.disc)}`} minus />
                </>
              )}
              <Row label="รวมสุทธิก่อนภาษี" value={baht(totals.base)} />
              <Row
                label={totals.vatRate ? `ภาษีมูลค่าเพิ่ม ${totals.vatRate}%` : "ภาษีมูลค่าเพิ่ม (ไม่คิด)"}
                value={baht(totals.vat)}
              />
              {totals.whtPct > 0 ? (
                <Row label={`หัก ณ ที่จ่าย ${totals.whtPct}%`} value={`-${baht(totals.whtAmount)}`} minus />
              ) : (
                <Row label="หัก ณ ที่จ่าย" value={NO_WHT_NOTE} />
              )}
              <div className="mt-1 flex items-center justify-between gap-3 border-t-2 border-foreground pt-3.5">
                <dt className="font-semibold">รวมทั้งสิ้น</dt>
                <dd className="num text-xl font-bold">{baht(totals.grand)}</dd>
              </div>
            </dl>

            <div className="glass-thin mt-4 rounded-xl px-3.5 py-3 text-[13.5px]">
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={wht}
                  onChange={(e) => setWht(e.target.checked)}
                  className="mt-px size-[18px] shrink-0 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  หักภาษี ณ ที่จ่าย
                  <small className="mt-0.5 block text-[11.5px] text-muted-foreground">
                    {buyer === "individual"
                      ? "ลูกค้าบุคคลธรรมดาไม่มีหน้าที่หักภาษี ณ ที่จ่าย"
                      : "อัตราที่เลือกจะติดไปกับใบนี้ทุกหน้าจอ"}
                  </small>
                </span>
              </label>
              {/* อัตราติดอยู่กับใบเสนอราคา ไม่ใช่ค่าตั้งค่าของระบบ ใบเก่าจึงไม่เปลี่ยนตามทีหลัง */}
              {wht && buyer !== "individual" && (
                <div className="mt-2.5 flex items-center gap-2.5">
                  <span className="text-[12.5px] text-muted-foreground">อัตราที่ลูกค้าหัก</span>
                  <select
                    value={whtPct}
                    aria-label="อัตราหักภาษี ณ ที่จ่าย"
                    onChange={(e) => setWhtPct(Number(e.target.value))}
                    className="field-control h-9 max-w-[110px] cursor-pointer text-[13.5px]"
                  >
                    {WHT_PCTS.map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* มือถือ: ยกเลิก/ดูตัวอย่างคู่กันสูง 44 · ปุ่มบันทึกเต็มแถวสูง 48 มุม 14 ปุ่มหลักแดงทึบ */}
            <div className="mt-4 flex flex-wrap gap-2 max-md:grid max-md:grid-cols-2 max-md:gap-2.5">
              <button
                type="button"
                className="btn glass-thin flex-1 justify-center max-md:!h-11 max-md:!rounded-[14px]"
                onClick={onReset}
              >
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn glass-thin flex-1 justify-center max-md:!h-11 max-md:!rounded-[14px]"
                onClick={() => setPreview(true)}
              >
                <EyeIcon className="size-[15px]" strokeWidth={1.9} />
                ดูตัวอย่างเอกสาร
              </button>
              <button
                type="button"
                className="btn solid btn-solid w-full justify-center max-md:col-span-2 max-md:!h-12 max-md:!rounded-[14px] max-md:!bg-[#C8102E] max-md:!text-[15px]"
                onClick={() => {
                  if (ready()) setConfirming(true);
                }}
              >
                ออกเลขที่เอกสาร
              </button>
            </div>
            {touched && miss.length > 0 && (
              <p
                ref={summaryRef}
                role="alert"
                className="mt-2.5 flex flex-wrap justify-center gap-x-2 gap-y-1 text-center text-[12.5px] text-destructive"
              >
                ยังกรอกไม่ครบ
                {miss.map((m) => (
                  <span key={m} className="rounded-full bg-[var(--destructive-soft)] px-2 font-semibold">
                    {m}
                  </span>
                ))}
              </p>
            )}
            <p className="mt-3 text-center text-[11.5px] leading-relaxed text-muted-foreground">
              ออกเลขที่แล้วแก้ไขไม่ได้ ถ้าต้องเปลี่ยนให้ออกใบใหม่ · จากนั้นดาวน์โหลดไฟล์ไปส่งลูกค้าเอง
              แล้วกด “บันทึกว่าส่งแล้ว” ในหน้ารายการ
            </p>
          </section>
        </aside>
      </div>

      {/* มือถือ: แถบยอดรวมติดล่างจอเหนือแถบเมนู เห็นยอดตลอดขณะกรอก และกดบันทึกได้โดยไม่ต้องเลื่อนลงสุด
          ปุ่มบันทึกเดิมในการ์ดสรุปยอดยังอยู่ — ตัวนี้เปิดกล่องยืนยันเดียวกัน */}
      <div className="sticky bottom-[calc(var(--botbar)+10px)] z-10 mt-4 flex items-center gap-3 rounded-[20px] bg-card p-2.5 pl-4 shadow-[0_1px_2px_rgba(120,20,35,.05),0_12px_28px_-18px_rgba(120,20,35,.3),0_-6px_16px_-10px_rgb(0_0_0/0.18)] md:hidden">
        <span className="min-w-0 flex-1">
          <small className="block text-[11.5px] text-muted-foreground">รวมทั้งสิ้น</small>
          <b className="num block truncate text-[17px] font-bold">{baht(totals.grand)}</b>
        </span>
        {/* มือถือ: ปุ่มออกเลขที่ปุ่มเดียว ชุดเดียวกับในการ์ดสรุปยอด */}
        <button
          type="button"
          className="btn solid btn-solid !h-11 shrink-0 justify-center !rounded-[14px] !bg-[#C8102E] px-4"
          onClick={() => {
            if (ready()) setConfirming(true);
          }}
        >
          ออกเลขที่
        </button>
      </div>

      {confirming && customer && issuer && (
        <IssueNumberDialog
          customerName={customer.name}
          issuer={issuerOf(issuer).name}
          total={totals.grand}
          onGo={issueNow}
          onClose={() => setConfirming(false)}
        />
      )}

      {/* ตัวอย่างเอกสาร — ยิงออกไปที่ body เพราะกล่องที่มี backdrop-filter เป็นกรอบอ้างอิงของ position: fixed */}
      {preview &&
        createPortal(
          <div
            className="fixed inset-0 z-90 flex flex-col bg-black/50"
            role="dialog"
            aria-modal="true"
            aria-label="ตัวอย่างใบเสนอราคา"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setPreview(false);
            }}
          >
            {/* มือถือ: เป็นแผ่นเลื่อนขึ้นจากล่าง มุมบนมน 24 สูงไม่เกิน 92vh ตามต้นแบบ */}
            <div className="glass-solid mx-auto flex max-h-full w-full max-w-[900px] flex-col overflow-hidden sm:my-6 sm:rounded-[18px] max-md:!mt-auto max-md:!mb-0 max-md:max-h-[92vh] max-md:!rounded-t-[24px] max-md:!rounded-b-none max-md:bg-white">
              <div className="flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5 max-md:border-[#F2EAEC] max-md:!px-[18px] max-md:pt-4 max-md:pb-2.5">
                <b className="text-[15px] font-bold">ตัวอย่างใบเสนอราคา</b>
                <button type="button" className="iconbtn glass-thin" aria-label="ปิด" onClick={() => setPreview(false)}>
                  <CloseIcon className="size-[15px]" strokeWidth={2.2} />
                </button>
              </div>
              <div className="scroll-stable flex min-h-0 flex-1 flex-col items-center gap-5 overflow-auto bg-[#eef0f4] p-4 sm:p-6 max-md:!pb-[calc(16px+env(safe-area-inset-bottom))]">
                <QuotationPaper
                  doc={{
                    no: "",
                    issued: "",
                    validDays: days,
                    issuer: issuer || "MAZ",
                    body,
                    terms: terms.trim(),
                    totals: {
                      gross: totals.gross,
                      discount: totals.disc,
                      base: totals.base,
                      vatRate: totals.vatRate,
                      vat: totals.vat,
                      whtPct: totals.whtPct,
                      whtAmount: totals.whtAmount,
                      grand: totals.grand,
                    },
                    customer: customer
                      ? {
                          name: customer.name,
                          taxId: taxId || customer.taxId,
                          address: customer.address,
                          contact: customer.contact,
                          phone: customer.phone,
                          email: customer.email,
                        }
                      : null,
                  }}
                />
              </div>
            </div>
          </div>,
          document.body,
        )}
    </form>
  );
}

function RepOption({
  checked,
  onPick,
  title,
  sub,
  bad,
}: {
  checked: boolean;
  onPick: () => void;
  title: string;
  sub: string;
  bad?: boolean;
}) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-xl border-[1.4px] px-3 py-2.5 transition-colors ${
        checked ? "border-primary bg-accent" : bad ? "border-destructive" : "border-border bg-white"
      }`}
    >
      <input type="radio" name="rep" checked={checked} onChange={onPick} className="mt-1 accent-[var(--primary)]" />
      <span>
        <b className="block text-[13.5px] font-semibold">{title}</b>
        <em className="block text-[11.5px] text-muted-foreground not-italic">{sub}</em>
      </span>
    </label>
  );
}

function Row({ label, value, minus }: { label: string; value: string; minus?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`num ${minus ? "text-destructive" : ""}`}>{value}</dd>
    </div>
  );
}
