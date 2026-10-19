"use client";

/*
 * ใบสัญญาของดีล (ผู้ใช้สั่ง 14 ต.ค. 2569) — /deals/<เลขที่ดีล>/contract (ฝ่ายขาย) · /ceo/sales/contracts/<เลขที่ดีล> (CEO ดูอย่างเดียว)
 *
 * ระบบร่างสัญญาจากแม่แบบ + ใบเสนอราคา + งวดเงินของดีล ฝ่ายขายแก้ในช่องรายละเอียดก่อนบันทึก
 * ออกได้เฉพาะฝ่ายขาย และเฉพาะดีลที่ยังเดินอยู่และลูกค้าชำระงวดแรกแล้ว (มีใบเสร็จของดีล — dealPaid)
 * บันทึกทุกครั้งเป็นฉบับใหม่ ฉบับเก่าเปิดดูได้ด้วย ?v=<ฉบับที่> · ?pdf=1 เปิดหน้าต่างบันทึก PDF ทันที (แบบเดียวกับใบเสนอราคา)
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { quotationTotals } from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { dealPaid, useAcc } from "@/lib/acc-store";
import { draftContractHtml, type ContractDoc } from "@/lib/contract-data";
import { contractsOf, saveContractVersion, useContracts } from "@/lib/contract-store";
import { useRole } from "@/lib/role";
import { CURRENT_USER } from "@/lib/mock-data";
import { useNameOf } from "@/lib/emp-name";
import { cleanHtml, htmlToText } from "@/lib/rich-text";
import { thaiDate, todayIso } from "@/lib/format";
import { useCrumb } from "@/lib/crumb";
import { ChevronLeftIcon, DownloadIcon, EditIcon, PrintIcon, RotateIcon } from "./icons";
import { RichEditor } from "./rich-editor";
import { ContractPaper } from "./contract-paper";
import { CopyPicker, copySets, useCopyMode, type CopyKind } from "./doc-copy";

export function ContractPage({
  dealNo,
  v,
  pdf = false,
  ceo = false,
}: {
  dealNo: string;
  /** ฉบับที่ต้องการดู — ว่าง = ฉบับล่าสุด */
  v?: number;
  pdf?: boolean;
  ceo?: boolean;
}) {
  const crm = useCrm();
  const acc = useAcc();
  const all = useContracts();
  const role = useRole();
  const router = useRouter();
  const deal = crm.deals.find((d) => d.no === dealNo);
  const customer = deal ? crm.customers.find((c) => c.code === deal.customerCode) : undefined;
  const quotation = deal?.quotationNo ? crm.quotations.find((q) => q.no === deal.quotationNo) : undefined;
  const versions = useMemo(() => contractsOf(all, dealNo), [all, dealNo]);
  const latest = versions[versions.length - 1];
  const shown = (v ? versions.find((c) => c.version === v) : undefined) ?? latest;
  const old = Boolean(shown && latest && shown.version !== latest.version);

  const paid = deal ? dealPaid(acc, deal.no) : false;
  /* ออกได้เฉพาะฝ่ายขาย · ดีลที่ยังเดินอยู่ · ลูกค้าชำระงวดแรกแล้ว */
  const canIssue = !ceo && role === "sales" && deal?.status === "ปิดการขาย" && paid;

  const back = ceo ? "/ceo/deals" : "/deals";
  /* ช่วงชื่อลูกค้าบนแถบบนพากลับหน้ารายละเอียดดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const dealHref = ceo ? `/ceo/sales/deals/${encodeURIComponent(dealNo)}` : `/deals/${encodeURIComponent(dealNo)}`;
  const selfHref = ceo ? `/ceo/sales/contracts/${encodeURIComponent(dealNo)}` : `/deals/${encodeURIComponent(dealNo)}/contract`;
  const cusName = customer?.legalName || customer?.name || "—";
  useCrumb(ceo && { label: "ดีลและใบงาน", href: back }, { label: customer?.name ?? "ดีล", href: dealHref }, "ใบสัญญา");
  const empName = useNameOf();

  /* ร่างที่กำลังแก้ — null = โหมดดู */
  const [draft, setDraft] = useState<{ body: string; from: ContractDoc["from"] } | null>(null);
  const [tried, setTried] = useState(false);

  const generate = () => {
    if (!deal) return "";
    const accDeal = acc.deals.find((d) => d.no === deal.no);
    return draftContractHtml({
      no: latest?.no ?? "",
      date: todayIso(),
      deal,
      customer,
      quotation,
      totals: quotation ? quotationTotals(quotation) : undefined,
      plan: accDeal?.plan ?? [],
      invoices: acc.invoices.filter((x) => x.deal === deal.no),
    });
  };

  /* พิมพ์ต้นฉบับ/สำเนา — ?copy= ตั้งค่าเริ่มได้ ?pdf=1 พิมพ์ตามค่านี้ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const [copyMode, setCopyMode] = useCopyMode();
  const printed = useRef(false);
  useEffect(() => {
    if (!pdf || !shown || printed.current) return;
    printed.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("pdf");
    window.history.replaceState(null, "", url);
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [pdf, shown]);

  if (!deal) {
    return (
      <div className="panel glass px-6 py-16 text-center">
        <p className="text-lg font-semibold">ไม่พบดีลนี้</p>
        <Link href={back} className="btn solid btn-solid mt-6 inline-flex">
          กลับไปหน้าดีล
        </Link>
      </div>
    );
  }

  const save = () => {
    setTried(true);
    if (!draft || !htmlToText(draft.body)) return;
    saveContractVersion(
      {
        dealNo: deal.no,
        issuer: quotation?.issuer ?? "",
        body: cleanHtml(draft.body),
        date: todayIso(),
        by: CURRENT_USER.name,
        from: draft.from,
      },
      /* ไฟล์สัญญาที่เคยแนบไว้ในดีล — กันเลขที่ซ้ำ */
      crm.deals.flatMap((d) => (d.contracts ?? []).map((c) => c.no)),
    );
    setDraft(null);
    setTried(false);
    /* กลับไปดูฉบับล่าสุดที่เพิ่งบันทึก */
    if (v) router.replace(selfHref);
  };

  const paperOf = (body: string, c?: ContractDoc, copy: CopyKind = "original", breakFirst = false) => (
    <ContractPaper
      key={copy}
      copy={copy}
      breakFirst={breakFirst}
      doc={{
        no: c?.no ?? latest?.no ?? "",
        version: c?.version ?? (latest ? latest.version + 1 : 1),
        date: c?.date ?? todayIso(),
        issuer: c?.issuer ?? quotation?.issuer ?? "",
        customer: cusName,
        body,
      }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="bar no-print">
        <div className="min-w-0">
          <span className="md:hidden">
            <Link href={dealHref} className="btn glass-thin btn-mini mb-1.5">
              <ChevronLeftIcon className="size-3.5" strokeWidth={2.4} />
              ดีล
            </Link>
          </span>
          <h1>{draft ? "ร่างใบสัญญา" : "ใบสัญญา"}</h1>
          <p>
            {customer?.name ?? "—"}
            {shown && !draft && (
              <>
                {" · "}
                <span className="num">{shown.no}</span> ฉบับที่ {shown.version} · {thaiDate(shown.at.slice(0, 10))} · {empName(shown.by)}
              </>
            )}
            {old && !draft && (
              <>
                {" · "}
                <b className="font-semibold text-[var(--warning)]">ฉบับเก่า</b>{" "}
                <Link href={selfHref} className="lnk">
                  ดูฉบับล่าสุด
                </Link>
              </>
            )}
          </p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          {draft ? (
            <>
              <button type="button" className="btn glass-thin" onClick={() => {
                  setDraft(null);
                  setTried(false);
                }}>
                ยกเลิก
              </button>
              <button
                type="button"
                className="btn glass-thin"
                onClick={() => setDraft({ body: generate(), from: "draft" })}
                title="ทิ้งที่แก้ไว้ แล้วสร้างร่างจากข้อมูลดีลล่าสุด"
              >
                <RotateIcon className="size-[15px]" strokeWidth={2} />
                สร้างร่างใหม่จากข้อมูลดีล
              </button>
              <button type="button" className="btn solid btn-solid btn-block-mobile shrink-0" onClick={save}>
                บันทึกเป็นฉบับที่ {(latest?.version ?? 0) + 1}
              </button>
            </>
          ) : (
            <>
              {canIssue && shown && (
                <>
                  <button
                    type="button"
                    className="btn glass-thin"
                    onClick={() => setDraft({ body: shown.body, from: "edit" })}
                  >
                    <EditIcon className="size-[15px]" strokeWidth={2} />
                    แก้ไข
                  </button>
                  <button
                    type="button"
                    className="btn glass-thin"
                    onClick={() => setDraft({ body: generate(), from: "draft" })}
                  >
                    <RotateIcon className="size-[15px]" strokeWidth={2} />
                    สร้างร่างใหม่
                  </button>
                </>
              )}
              {shown && (
                <>
                  <CopyPicker value={copyMode} onChange={setCopyMode} />
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
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ฉบับทั้งหมดของสัญญานี้ — ฉบับเก่าเก็บไว้ดูย้อนหลัง */}
      {versions.length > 1 && !draft && (
        <div className="no-print flex flex-wrap items-center gap-1.5 text-[12.5px]">
          <span className="text-muted-foreground">ฉบับ:</span>
          {versions.map((c) => (
            <Link
              key={c.id}
              href={`${selfHref}?v=${c.version}`}
              className={`btn btn-mini ${c.version === shown?.version ? "solid btn-solid" : "glass-thin"}`}
            >
              ฉบับที่ {c.version}
            </Link>
          ))}
        </div>
      )}

      {draft ? (
        <div className="space-y-5">
          <section className="panel glass no-print px-4 py-4 sm:px-6 sm:py-5">
            <h2 id="ctBodyLabel" className="mb-1 text-[15px] font-bold">
              เนื้อหาสัญญา
            </h2>
            <p className="mb-3 text-[12.5px] text-muted-foreground">
              ระบบร่างจากใบเสนอราคา งวดเงิน และวันส่งมอบของดีลนี้ แก้ไขได้ตามที่ตกลงกับลูกค้า — ช่องลงนามท้ายสัญญาระบบใส่ให้เอง
            </p>
            <RichEditor
              value={draft.body}
              onChange={(body) => setDraft((d) => (d ? { ...d, body } : d))}
              labelId="ctBodyLabel"
              invalid={tried && !htmlToText(draft.body)}
              placeholder="เนื้อหาสัญญา"
            />
            {tried && !htmlToText(draft.body) && (
              <p className="mt-2.5 text-[12.5px] text-destructive">กรอกเนื้อหาสัญญาก่อนบันทึก</p>
            )}
          </section>
          <div className="flex flex-col items-center gap-5">{paperOf(draft.body)}</div>
        </div>
      ) : shown ? (
        <div className="flex flex-col items-center gap-5">
          {/* ต้นฉบับ + สำเนา = ทั้งชุดสองรอบ (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
          {copySets(copyMode).map((k, i) => paperOf(shown.body, shown, k, i > 0))}
        </div>
      ) : (
        <div className="panel glass px-6 py-14 text-center">
          <p className="text-lg font-semibold">ดีลนี้ยังไม่มีใบสัญญา</p>
          {deal.status !== "ปิดการขาย" ? (
            <p className="mt-2 text-muted-foreground">ดีลถูกยกเลิกแล้ว ออกใบสัญญาไม่ได้</p>
          ) : !paid ? (
            <p className="mt-2 text-[var(--warning)]">ยังไม่ได้รับเงินงวดแรก — ออกใบสัญญาได้หลังลูกค้าชำระงวดแรก</p>
          ) : canIssue ? (
            <>
              <p className="mt-2 text-muted-foreground">ระบบจะร่างสัญญาจากใบเสนอราคาและงวดเงินของดีลนี้ ตรวจและแก้ไขได้ก่อนบันทึก</p>
              <button
                type="button"
                className="btn solid btn-solid mt-6 inline-flex"
                onClick={() => setDraft({ body: generate(), from: "draft" })}
              >
                ออกใบสัญญา
              </button>
            </>
          ) : (
            <p className="mt-2 text-muted-foreground">ฝ่ายขายเป็นผู้ออกใบสัญญา</p>
          )}
        </div>
      )}
    </div>
  );
}
