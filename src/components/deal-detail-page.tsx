"use client";

/*
 * หน้ารายละเอียดดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) — /deals/<เลขที่ดีล> (ฝ่ายขาย) · /ceo/sales/deals/<เลขที่ดีล> (CEO ดูอย่างเดียว)
 *
 * แทนการกางใต้แถวในหน้ารายการดีล — กดแถวแล้วมาหน้านี้
 * หัวหน้า: ลูกค้า สถานะ มูลค่า วันส่งมอบ ผู้ขาย · ปุ่มออก/ดูใบสัญญา (กติกาเดิม) · ยกเลิกดีล (กติกาเดิม)
 * "เอกสารของดีล" เป็นแฟ้มจริงแบบตัวจัดการไฟล์ (ผู้ใช้สั่ง 15 ต.ค. 2569): กริดโฟลเดอร์ กดแล้วเห็นไฟล์ในแฟ้ม (?folder=)
 *   ใบเสนอราคา (ทุกฉบับในสาย + ฉบับก่อนแก้ไข) · ข้อเสนอ / Proposal (รอบของทีมก่อนการขาย + ไฟล์ที่แนบหน้า Lead)
 *   ใบแจ้งหนี้ · ใบเสร็จ · ใบสัญญา (ทุกฉบับ)
 *   หนังสือรับรองหัก ณ ที่จ่ายไม่มีแฟ้ม — รายการภาษีหัก ณ ที่จ่ายในระบบไม่ได้ผูกกับดีล
 * ทุกไฟล์: ดู (หน้าเอกสารในระบบ) · ดาวน์โหลด (?pdf=1 สำหรับเอกสารที่ระบบออก · ลิงก์เปิดลิงก์ · ไฟล์ที่เก็บแค่ชื่อกดไม่ได้)
 *   และ "รายละเอียด" เปิดแผงสรุปยอด/เนื้อหาใต้กริดไฟล์
 * ท้ายหน้า: ประวัติแผนติดตาม
 */

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  DEAL_STATUS,
  QUOTATION_STATUS,
  quotationTotals,
  type Deal,
  type PresalesRequest,
  type PresalesRound,
  type Quotation,
} from "@/lib/crm-data";
import { useCrm } from "@/lib/crm-store";
import { dealPaid, invoiceDue, invoiceStatus, useAcc } from "@/lib/acc-store";
import { INVOICE_STATUS, WHT_CERT_WAIT } from "@/lib/acc-data";
import { contractsOf, useContracts } from "@/lib/contract-store";
import { useLeadFiles } from "@/lib/lead-files";
import { useNameOf } from "@/lib/emp-name";
import { htmlToText } from "@/lib/rich-text";
import { useCrumb, type Crumb } from "@/lib/crumb";
import { baht, thaiDate, thaiStamp } from "@/lib/format";
import { BanIcon, ChevronLeftIcon, DownloadIcon, EyeIcon } from "./icons";
import { FOLDER_TONE, FolderArt } from "./folder-art";
import { AccInvoiceView, AccReceiptView, BackLink } from "./acc-doc";
import { CancelDealDialog } from "./cancel-deal-dialog";
import { FollowupTrail } from "./followup-trail";
import { ProposalDialog, isCanva } from "./proposal-doc";
import { fileSize } from "./file-drop";
import { ContractAction, ContractHint, WorkProgress, contractHref, dealHref, dealsHref } from "./deals-page";

const NOT_UPLOADED = "ไฟล์ยังไม่ได้อัปโหลดจริง";

/** ที่อยู่ใบแจ้งหนี้/ใบเสร็จที่เปิดจากหน้าดีล — อยู่ใต้หน้าดีลของแต่ละฝั่ง (ผู้ใช้สั่ง 15 ต.ค. 2569) */
const accDocHref = (dealNo: string, kind: "invoice" | "receipt", no: string, ceo: boolean) =>
  `${dealHref(dealNo, ceo)}/${kind}/${encodeURIComponent(no)}`;

const quoHref = (no: string, ceo: boolean) =>
  ceo ? `/ceo/sales/quotations/${encodeURIComponent(no)}` : `/quotations/${encodeURIComponent(no)}`;

/** ฉบับแก้ไขของเลขที่เดิม — ตรงกับที่พิมพ์บนเอกสาร (quotation-paper) ฉบับแรกคือ 1 */
const revLabel = (n: number) => (n > 1 ? `ฉบับแก้ไขที่ ${n}` : "ฉบับแรก");

/** ต่อ query ท้ายที่อยู่ — มี ? อยู่แล้วต่อด้วย & */
const withQ = (href: string, q: string) => `${href}${href.includes("?") ? "&" : "?"}${q}`;

/** เส้นทางบนแถบบนของหน้าดีล — CEO เข้าจาก "ดีลและใบงาน" ใต้งานขาย */
function useDealTrail(dealNo: string, ceo: boolean): Crumb[] {
  const crm = useCrm();
  const deal = crm.deals.find((d) => d.no === dealNo);
  const name = deal ? (crm.customers.find((c) => c.code === deal.customerCode)?.name ?? "ดีล") : "ดีล";
  return [
    ...(ceo ? [{ label: "ดีลและใบงาน", href: dealsHref(true) }] : []),
    { label: name, href: dealHref(dealNo, ceo) },
  ];
}

/* ─── หน้ารายละเอียดดีล ─────────────────────────────────────────── */

export function DealDetailPage({ no, ceo = false }: { no: string; ceo?: boolean }) {
  const crm = useCrm();
  const acc = useAcc();
  const deal = crm.deals.find((d) => d.no === no);
  const customer = deal ? crm.customers.find((c) => c.code === deal.customerCode) : undefined;
  const name = customer?.name ?? "—";
  const [cancelling, setCancelling] = useState(false);
  useCrumb(ceo && { label: "ดีลและใบงาน", href: dealsHref(true) }, deal ? name : "ไม่พบดีล");
  const empName = useNameOf();

  if (!deal) {
    return (
      <div className="panel glass px-6 py-16 text-center">
        <p className="text-lg font-semibold">ไม่พบดีลนี้</p>
        <Link href={dealsHref(ceo)} className="btn solid btn-solid mt-6 inline-flex">
          กลับไปหน้าดีล
        </Link>
      </div>
    );
  }

  /* กติกาเดิมของหน้ารายการ — ยกเลิกได้เฉพาะดีลที่ยังไม่รับเงิน · CEO ไม่เห็นปุ่ม */
  const canCancel = !ceo && deal.status === "ปิดการขาย" && !dealPaid(acc, deal.no);
  const seller = empName(deal.seller || customer?.owner) || "—";

  return (
    <div className="space-y-4">
      <div className="bar">
        <div className="flex min-w-0 items-start gap-3">
          <BackLink href={dealsHref(ceo)} label="กลับไปหน้าดีล" />
          <div className="min-w-0">
            <h1 className="break-words">{name}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className={`tag ${DEAL_STATUS[deal.status]}`}>
                <i />
                {deal.status}
              </span>
              {ceo && <WorkProgress deal={deal} className="!mt-0 !inline" />}
            </p>
          </div>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <ContractAction deal={deal} ceo={ceo} />
          {canCancel && (
            <button
              type="button"
              className="btn glass-thin btn-mini whitespace-nowrap hover:!border-destructive hover:!text-destructive"
              data-ceo-hide
              onClick={() => setCancelling(true)}
            >
              <BanIcon className="size-3.5" strokeWidth={2.2} />
              ยกเลิกดีล
            </button>
          )}
        </div>
      </div>

      <section className="panel glass space-y-3 px-4 py-4 md:px-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
          <Cx k="มูลค่าดีล" v={`${baht(deal.total)} บาท`} num />
          <Cx k="วันส่งมอบ" v={deal.delivery ? thaiDate(deal.delivery) : "—"} num />
          <Cx k="ผู้ขาย" v={seller} />
          <Cx k="ปิดการขายเมื่อ" v={deal.closedAt ? thaiDate(deal.closedAt.slice(0, 10)) : "—"} num />
          {deal.scope && (
            <div className="col-span-2 md:col-span-4">
              <Cx k="ขอบเขตงาน" v={deal.scope} />
            </div>
          )}
        </dl>
        <CancelInfo deal={deal} />
        <ContractHint deal={deal} ceo={ceo} />
      </section>

      {/* useSearchParams (?folder=) ต้องมี Suspense คร่อม */}
      <Suspense>
        <DealFolders deal={deal} cus={name} ceo={ceo} />
      </Suspense>

      <section className="panel glass px-4 py-4 md:px-5">
        <div className="max-w-[720px]">
          <FollowupTrail customerCode={deal.customerCode} until={deal.closedAt} />
        </div>
      </section>

      {cancelling && (
        <CancelDealDialog
          dealNo={deal.no}
          cus={name}
          total={deal.total}
          by="ฝ่ายขาย"
          onClose={() => setCancelling(false)}
        />
      )}
    </div>
  );
}

/** ใบแจ้งหนี้/ใบเสร็จของดีลที่เปิดจากหน้าดีล — เปิดได้เฉพาะเอกสารของดีลนั้น (ผู้ใช้สั่ง 15 ต.ค. 2569) */
export function DealAccDoc({
  dealNo,
  doc,
  kind,
  ceo = false,
  pdf = false,
}: {
  dealNo: string;
  doc: string;
  kind: "invoice" | "receipt";
  ceo?: boolean;
  pdf?: boolean;
}) {
  const trail = useDealTrail(dealNo, ceo);
  const from = { dealNo, back: dealHref(dealNo, ceo), backLabel: "กลับไปหน้าดีล", trail };
  return kind === "invoice" ? <AccInvoiceView no={doc} from={from} pdf={pdf} /> : <AccReceiptView no={doc} from={from} pdf={pdf} />;
}

/* ─── แฟ้มเอกสาร ────────────────────────────────────────────────── */

/** ปุ่มของแถว — ที่อยู่ในระบบ · ลิงก์ภายนอก · กดเอง · กดไม่ได้พร้อมเหตุผล */
type Act = { href: string } | { url: string } | { onClick: () => void } | { disabled: string };

type DocRow = {
  key: string;
  title: string;
  /** เลขที่เอกสาร — ใช้ตัวเลขแบบตาราง */
  num?: boolean;
  meta: string;
  amount?: number;
  tag?: { label: string; cls: string };
  view: Act;
  download: Act;
  detail?: React.ReactNode;
};

type Folder = { key: string; title: string; rows: DocRow[] };

function DealFolders({ deal: d, cus, ceo }: { deal: Deal; cus: string; ceo: boolean }) {
  const crm = useCrm();
  const acc = useAcc();
  const allContracts = useContracts();
  const leadFiles = useLeadFiles();
  const empName = useNameOf();
  const [doc, setDoc] = useState<{ req: PresalesRequest; r: PresalesRound } | null>(null);

  const folders = useMemo<Folder[]>(() => {
    /* ใบเสนอราคาทุกฉบับในสายเดียวกัน (ใบที่ปิดดีล + ฉบับก่อนหน้าตาม replaces) — ใหม่สุดก่อน */
    const byNo = new Map(crm.quotations.map((q) => [q.no, q]));
    const chain: Quotation[] = [];
    let cur = d.quotationNo ? byNo.get(d.quotationNo) : undefined;
    while (cur && chain.length < 20) {
      chain.unshift(cur);
      cur = cur.replaces ? byNo.get(cur.replaces) : undefined;
    }
    const quoRows: DocRow[] = chain
      .map((q, i) => ({ q, ver: i + 1 }))
      .reverse()
      .flatMap(({ q, ver }) => {
        const href = quoHref(q.no, ceo);
        /* ฉบับก่อนแก้ไขของใบเดียวกัน — เปิดได้เฉพาะฉบับที่มีสำเนาเก็บไว้ */
        const revs = crm.quotationRevisions
          .filter((r) => r.quotationId === q.id && r.revision !== q.revision)
          .sort((a, b) => b.revision - a.revision);
        const edited = revs.length > 0;
        const main: DocRow = {
          key: q.id,
          title: q.no,
          num: true,
          meta: `ฉบับที่ ${ver}${edited ? ` · ${revLabel(q.revision)}` : ""} · ออก ${q.issued ? thaiDate(q.issued) : "—"}`,
          amount: quotationTotals(q).grand,
          tag: { label: q.status, cls: QUOTATION_STATUS[q.status] },
          view: { href },
          download: { href: withQ(href, "pdf=1") },
          detail: <QuoDetail q={q} />,
        };
        const olds: DocRow[] = revs.map((r) => {
          const snap = r.snapshot;
          const at = withQ(href, `rev=${r.revision}`);
          return {
            key: r.id,
            title: q.no,
            num: true,
            meta: `ฉบับที่ ${ver} · ${revLabel(r.revision)} · ${thaiDate(r.at.slice(0, 10))}`,
            amount: snap ? quotationTotals(snap).grand : r.total,
            tag: { label: "ฉบับเก่า", cls: "t-miss" },
            view: snap ? { href: at } : { disabled: "ไม่มีสำเนาของฉบับนี้" },
            download: snap ? { href: withQ(at, "pdf=1") } : { disabled: "ไม่มีสำเนาของฉบับนี้" },
            detail: snap ? <QuoDetail q={snap} what={r.what} /> : r.what ? <p>{r.what}</p> : undefined,
          };
        });
        return [main, ...olds];
      });

    /* ข้อเสนอจากทีมก่อนการขายของคำขอที่ใบเสนอราคาอ้างถึง + ไฟล์ที่ฝ่ายขายแนบไว้หน้า Lead */
    const psNos = [...new Set(chain.map((q) => q.ps).filter((x): x is string => Boolean(x)))];
    const roundRows: DocRow[] = psNos.flatMap((psNo) => {
      const req = crm.presales.find((r) => r.no === psNo);
      if (!req) return [];
      return crm.presalesRounds
        .filter((r) => r.requestNo === psNo)
        .sort((a, b) => b.round - a.round)
        .flatMap((r) => {
          const meta = `รอบ ${r.round} · ${thaiDate(r.at)} · ${empName(r.by)}`;
          const first: DocRow = {
            key: r.id,
            title: r.file,
            meta,
            tag: { label: isCanva(r) ? "ลิงก์ Canva" : "ข้อเสนอ", cls: "t-info" },
            view: isCanva(r) ? { url: r.url! } : { onClick: () => setDoc({ req, r }) },
            download: isCanva(r) ? { url: r.url! } : { disabled: NOT_UPLOADED },
            detail: r.note ? <p className="leading-relaxed">{r.note}</p> : undefined,
          };
          /* ไฟล์อื่นที่แนบมาในรอบเดียวกัน — รายการแรกคือไฟล์หลักข้างบน */
          const more: DocRow[] = (r.files ?? []).slice(1).map((f, i) => ({
            key: `${r.id}-${i}`,
            title: f.name,
            meta,
            view: f.url ? { url: f.url } : { disabled: NOT_UPLOADED },
            download: f.url ? { url: f.url } : { disabled: NOT_UPLOADED },
          }));
          return [first, ...more];
        });
    });
    const customer = crm.customers.find((c) => c.code === d.customerCode);
    const codes = [d.customerCode, customer?.leadCode ?? ""].filter(Boolean);
    const fileRows: DocRow[] = leadFiles
      .filter((f) => codes.includes(f.lead))
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((f) => ({
        key: f.id,
        title: f.name,
        meta: `แนบที่หน้า Lead · ${empName(f.by)} · ${thaiStamp(f.at)}${!f.url && f.size > 0 ? ` · ${fileSize(f.size)}` : ""}`,
        tag: { label: f.url ? "ลิงก์" : "ไฟล์แนบ", cls: "t-miss" },
        view: f.url ? { url: f.url } : { disabled: NOT_UPLOADED },
        download: f.url ? { url: f.url } : { disabled: NOT_UPLOADED },
      }));

    /* ใบแจ้งหนี้และใบเสร็จของดีลจากสโตร์บัญชี — งวดล่าสุดก่อน */
    const seqs = acc.deals.find((x) => x.no === d.no)?.plan.length ?? 0;
    const seqLabel = (n: number) => `งวดที่ ${n}${seqs ? ` จาก ${seqs}` : ""}`;
    const invRows: DocRow[] = acc.invoices
      .filter((v) => v.deal === d.no)
      .sort((a, b) => b.seq - a.seq || b.issue.localeCompare(a.issue))
      .map((v) => {
        const href = accDocHref(d.no, "invoice", v.no, ceo);
        return {
          key: v.no,
          title: v.no,
          num: true,
          meta: `${seqLabel(v.seq)} · ออก ${thaiDate(v.issue)} · ครบกำหนด ${thaiDate(v.due)}`,
          amount: v.total,
          tag: INVOICE_STATUS[invoiceStatus(acc, v)],
          view: { href },
          download: { href: withQ(href, "pdf=1") },
          detail: (
            <Sums
              rows={[
                ["ราคาก่อนภาษี", v.base],
                ["ภาษีมูลค่าเพิ่ม", v.vat],
                ["หักภาษี ณ ที่จ่าย", -v.wht],
                ["ยอดชำระสุทธิ", v.total, true],
                ["ยอดค้างชำระ", invoiceDue(v)],
              ]}
            />
          ),
        };
      });
    const rcpRows: DocRow[] = acc.receipts
      .filter((r) => r.deal === d.no)
      .sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)
      .map((r) => {
        const href = accDocHref(d.no, "receipt", r.no, ceo);
        return {
          key: r.no,
          title: r.no,
          num: true,
          meta: `${seqLabel(r.seq)} · ${thaiDate(r.date)} · อ้างอิงใบแจ้งหนี้ ${r.inv}`,
          amount: r.total,
          tag: { label: "รับชำระแล้ว", cls: "t-ok" },
          view: { href },
          download: { href: withQ(href, "pdf=1") },
          detail: (
            <>
              <Sums
                rows={[
                  ["ราคาก่อนภาษี", r.base],
                  ["ภาษีมูลค่าเพิ่ม", r.vatAmount],
                  ["หักภาษี ณ ที่จ่าย", -r.wht],
                  ["ยอดเงินที่ได้รับ", r.total, true],
                ]}
              />
              {r.wht > 0 && !r.certReceived && <p className="mt-2 text-[var(--warning)]">{WHT_CERT_WAIT}</p>}
            </>
          ),
        };
      });

    /* ใบสัญญาที่ระบบออก ทุกฉบับ — ใหม่สุดก่อน */
    const cts = contractsOf(allContracts, d.no).reverse();
    const ctRows: DocRow[] = cts.map((c, i) => {
      const href = `${contractHref(d.no, ceo)}?v=${c.version}`;
      const text = htmlToText(c.body);
      return {
        key: c.id,
        title: c.no,
        num: true,
        meta: `ฉบับที่ ${c.version} · ${thaiDate(c.at.slice(0, 10))} · ${empName(c.by)}`,
        tag: i === 0 ? { label: "ล่าสุด", cls: "t-ok" } : { label: "ฉบับเก่า", cls: "t-miss" },
        view: { href },
        download: { href: withQ(href, "pdf=1") },
        detail: text ? (
          <p className="leading-relaxed whitespace-pre-line">{text.length > 600 ? `${text.slice(0, 600)}…` : text}</p>
        ) : undefined,
      };
    });

    return [
      { key: "quo", title: "ใบเสนอราคา", rows: quoRows },
      { key: "prop", title: "ข้อเสนอ / Proposal", rows: [...roundRows, ...fileRows] },
      /* ใบแจ้งหนี้และใบเสร็จเป็นงานบัญชี เซลล์ไม่ได้ทำ — ไม่แสดงในหน้าดีล (ผู้ใช้สั่ง 15 ต.ค. 2569) */
      { key: "ct", title: "ใบสัญญา", rows: ctRows },
    ];
  }, [crm.quotations, crm.quotationRevisions, crm.presales, crm.presalesRounds, crm.customers, acc, allContracts, leadFiles, d, ceo, empName]);

  /*
   * แฟ้มจริงแบบตัวจัดการไฟล์ (ผู้ใช้สั่ง 15 ต.ค. 2569) — แทนแถวพับ/กาง
   * หน้าแรกเป็นกริดโฟลเดอร์ กดแล้วสลับเป็นไฟล์ในแฟ้มนั้นในหน้าเดิม
   * จำแฟ้มที่เปิดไว้ใน ?folder= เพื่อให้ปุ่มย้อนกลับของเบราว์เซอร์/รีเฟรชพากลับมาแฟ้มเดิม
   */
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const current = folders.find((f) => f.key === params.get("folder"));
  const go = (k: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (k) sp.set("folder", k);
    else sp.delete("folder");
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <section className="panel glass px-4 py-4 md:px-5" aria-label="เอกสารของดีล">
      {current ? (
        <FolderView key={current.key} folder={current} onBack={() => go(null)} />
      ) : (
        <>
          <h2 className="text-[15px] font-bold">เอกสารของดีล</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {folders.map((f) => (
              <li key={f.key}>
                <FolderTile folder={f} onOpen={() => go(f.key)} />
              </li>
            ))}
          </ul>
        </>
      )}
      {doc && <ProposalDialog request={doc.req} round={doc.r} customerName={cus} onClose={() => setDoc(null)} />}
    </section>
  );
}

/* สีโฟลเดอร์แยกตามหมวดเอกสาร (ผู้ใช้สั่ง 15 ต.ค. 2569) */
const KIND_TONE: Record<string, { back: string; front: string }> = {
  quo: FOLDER_TONE.run,
  prop: { back: "#DDD3F5", front: "#A994E6" },
  inv: FOLDER_TONE.plan,
  rcp: FOLDER_TONE.done,
  ct: FOLDER_TONE.late,
};

/** โฟลเดอร์หนึ่งแฟ้ม — รูปโฟลเดอร์แบบเดียวกับหน้าโปรเจค ชื่ออยู่ใต้รูป แฟ้มว่างจางลงแต่ยังเปิดได้ */
function FolderTile({ folder: f, onOpen }: { folder: Folder; onOpen: () => void }) {
  const n = f.rows.length;
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`เปิดแฟ้ม ${f.title}`}
      className="flex w-full flex-col items-center gap-1 rounded-[14px] border border-transparent px-2.5 pt-4 pb-3.5 text-center transition-colors hover:border-border hover:bg-black/[.045] focus-visible:border-primary max-sm:border-border max-sm:bg-card"
    >
      <span className={n ? "" : "opacity-60"}>
        <FolderArt tone={KIND_TONE[f.key] ?? FOLDER_TONE.run} />
      </span>
      <span className="mt-1 max-w-full truncate text-[13.5px] font-semibold">{f.title}</span>
      <span className="num text-[11.5px] text-muted-foreground">{n ? `${n} ไฟล์` : "ว่าง"}</span>
    </button>
  );
}

/** ไฟล์ในแฟ้ม — หัวมีปุ่มกลับและเส้นทาง · ไฟล์เป็นการ์ดเรียงกริด · รายละเอียดเปิดเป็นแผงใต้กริด */
function FolderView({ folder: f, onBack }: { folder: Folder; onBack: () => void }) {
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" className="btn glass-thin btn-mini whitespace-nowrap" onClick={onBack}>
          <ChevronLeftIcon className="size-3.5" strokeWidth={2.2} />
          เอกสารของดีล
        </button>
        <h2 className="flex min-w-0 flex-wrap items-center gap-1.5 text-[15px] font-bold">
          <button type="button" className="font-semibold text-muted-foreground hover:text-primary" onClick={onBack}>
            เอกสารของดีล
          </button>
          <span className="text-muted-foreground" aria-hidden="true">
            /
          </span>
          <span className="min-w-0 truncate">{f.title}</span>
          <span className="num rounded-full bg-muted px-2 py-0.5 text-[11.5px] font-semibold text-muted-foreground">
            {f.rows.length ? `${f.rows.length} ไฟล์` : "ว่าง"}
          </span>
        </h2>
      </div>

      {f.rows.length === 0 ? (
        <div className="mt-3 flex flex-col items-center gap-2 rounded-[12px] border border-dashed border-border px-4 py-10 text-center">
          <span className="opacity-60">
            <FolderArt tone={FOLDER_TONE.cancelled} width={56} height={46} />
          </span>
          <p className="text-[13px] text-muted-foreground">ยังไม่มีเอกสารในแฟ้มนี้</p>
        </div>
      ) : (
        <ul className="mt-3 grid grid-cols-1 gap-2.5 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {f.rows.map((r) => (
            <FileTile key={r.key} row={r} />
          ))}
        </ul>
      )}

    </div>
  );
}

/** ชนิดไฟล์บนป้ายไอคอน — เอกสารที่ระบบออกเป็น PDF · รูป · ลิงก์ · อื่นๆ ใช้นามสกุลไฟล์ */
function fileKind(r: DocRow): string {
  if ("href" in r.download) return "PDF";
  const dot = r.title.lastIndexOf(".");
  const ext = dot > 0 ? r.title.slice(dot + 1).toLowerCase() : "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext)) return "รูป";
  if (ext === "pdf") return "PDF";
  if ("url" in r.view) return "ลิงก์";
  return ext && ext.length <= 4 ? ext.toUpperCase() : "ไฟล์";
}

/* สีป้ายชนิดไฟล์ — ตัวอักษรขาวบนพื้นเข้ม ผ่าน 4.5:1 ทุกสี */
const KIND_BG: Record<string, string> = { PDF: "#B42318", รูป: "#1F7A4D", ลิงก์: "#2F55C4" };

function FileArt({ kind }: { kind: string }) {
  return (
    <span className="relative inline-block shrink-0" aria-hidden="true">
      <svg viewBox="0 0 40 48" width="40" height="48" className="block">
        <path d="M4 4a4 4 0 0 1 4-4h18l10 10v34a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z" fill="#F4F6F9" stroke="#C3C8D0" strokeWidth="1.5" />
        <path d="M26 0v6a4 4 0 0 0 4 4h6" fill="#E3E5E9" stroke="#C3C8D0" strokeWidth="1.5" />
        <path d="M11 22h18M11 28h18M11 34h12" stroke="#C3C8D0" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span
        className="absolute bottom-1 left-0 rounded-[4px] px-1 text-[9.5px] leading-[15px] font-bold text-white"
        style={{ background: KIND_BG[kind] ?? "#5B6472" }}
      >
        {kind}
      </span>
    </span>
  );
}

/* การ์ดไฟล์มีแค่ "ดู" กับ "ดาวน์โหลด" — เอาปุ่มรายละเอียดออก (ผู้ใช้สั่ง 15 ต.ค. 2569) */
function FileTile({ row: r }: { row: DocRow }) {
  const kind = fileKind(r);
  return (
    <li
      className="flex flex-col rounded-[12px] border border-border bg-card p-3"
    >
      <div className="flex items-start gap-2.5">
        <FileArt kind={kind} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[13.5px] font-semibold ${r.num ? "num" : ""}`} title={r.title}>
            {r.title}
          </p>
          <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">{r.meta}</p>
        </div>
      </div>
      <div className="mt-2 mb-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        {r.tag ? (
          <span className={`tag ${r.tag.cls}`}>
            <i />
            {r.tag.label}
          </span>
        ) : (
          <span />
        )}
        {r.amount != null && <span className="num text-[13.5px] font-semibold whitespace-nowrap">{baht(r.amount)} ฿</span>}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5">
        <ActBtn act={r.view} label="ดู" title={r.title} icon={<EyeIcon className="size-3.5" strokeWidth={2} />} />
        <ActBtn act={r.download} label="ดาวน์โหลด" title={r.title} icon={<DownloadIcon className="size-3.5" strokeWidth={2} />} />
      </div>
    </li>
  );
}

/**
 * ปุ่ม ดู/ดาวน์โหลด — ลิงก์ภายนอกเปิดด้วย window.open
 * เพราะหน้าของ CEO (CeoView) กันลิงก์ที่ไม่ขึ้นต้นด้วย /ceo ไว้ทั้งหมด
 */
function ActBtn({ act, label, title, icon }: { act: Act; label: string; title: string; icon: React.ReactNode }) {
  const cls = "btn glass-thin btn-mini whitespace-nowrap";
  const aria = `${label} ${title}`;
  if ("href" in act) {
    return (
      <Link href={act.href} className={cls} aria-label={aria}>
        {icon}
        {label}
      </Link>
    );
  }
  if ("url" in act) {
    return (
      <button type="button" className={cls} aria-label={aria} onClick={() => window.open(act.url, "_blank", "noopener,noreferrer")}>
        {icon}
        {label}
      </button>
    );
  }
  if ("onClick" in act) {
    return (
      <button type="button" className={cls} aria-label={aria} onClick={act.onClick}>
        {icon}
        {label}
      </button>
    );
  }
  /* ปุ่มที่กดไม่ได้ไม่ขึ้นคำอธิบายในบางเบราว์เซอร์ — ใส่ title ที่กรอบนอกด้วย */
  return (
    <span title={act.disabled} className="inline-flex">
      <button type="button" className={`${cls} opacity-50`} disabled aria-label={`${aria} — ${act.disabled}`}>
        {icon}
        {label}
      </button>
    </span>
  );
}

/** สรุปยอดใต้แถว — ตัวเลขชิดขวา บรรทัดเน้นเป็นตัวหนา */
function Sums({ rows }: { rows: [string, number, boolean?][] }) {
  return (
    <dl className="grid max-w-[360px] grid-cols-[1fr_auto] gap-x-6 gap-y-1">
      {rows.map(([k, v, strong]) => (
        <div key={k} className="contents">
          <dt className={strong ? "font-semibold" : "text-muted-foreground"}>{k}</dt>
          <dd className={`num text-right ${strong ? "font-semibold" : ""}`}>{baht(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** สรุปใบเสนอราคาใต้แถว — ยอดทุกบรรทัด วันยืนราคา และรายละเอียดงานแบบย่อ */
function QuoDetail({ q, what }: { q: Quotation; what?: string }) {
  const t = quotationTotals(q);
  const body = htmlToText(q.body);
  return (
    <div className="space-y-2.5">
      {what && <p className="text-muted-foreground">บันทึกการแก้ไข: {what}</p>}
      <Sums
        rows={[
          ["ราคารวม", t.gross],
          ...(t.discount ? ([["ส่วนลด", -t.discount]] as [string, number][]) : []),
          ["ราคาก่อนภาษี", t.base],
          ["ภาษีมูลค่าเพิ่ม", t.vat],
          ["หักภาษี ณ ที่จ่าย", -t.whtAmount],
          ["ยอดสุทธิ", t.grand, true],
        ]}
      />
      {q.validUntil && <p className="text-muted-foreground">ยืนราคาถึง {thaiDate(q.validUntil)}</p>}
      {body && <p className="leading-relaxed whitespace-pre-line">{body.length > 500 ? `${body.slice(0, 500)}…` : body}</p>}
    </div>
  );
}

/** เหตุผลที่ยกเลิก/ไม่ตกลง */
function CancelInfo({ deal: d }: { deal: Deal }) {
  const empName = useNameOf();
  if (d.status === "ปิดการขาย") return null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-3 md:grid-cols-4">
      {d.status === "ยกเลิก" && (
        <>
          <Cx k="ยกเลิกเมื่อ" v={d.cancelled ? thaiDate(d.cancelled.at.slice(0, 10)) : "—"} num />
          <Cx k="ยกเลิกโดย" v={empName(d.cancelled?.by) || "—"} />
        </>
      )}
      <div className="col-span-2">
        <Cx k="เหตุผล" v={d.cancelled?.why || d.lostReason || "—"} />
      </div>
    </dl>
  );
}

function Cx({ k, v, num = false }: { k: string; v: string; num?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold text-muted-foreground">{k}</dt>
      <dd className={`mt-0.5 text-[13.5px] break-words ${num ? "num" : ""}`}>{v}</dd>
    </div>
  );
}
