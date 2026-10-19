"use client";

import { issuerOf, issuers, type IssuerCode } from "@/lib/crm-data";
import { NO_WHT_NOTE } from "@/lib/acc-data";
import { baht, bahtText, thaiDateLong, todayIso } from "@/lib/format";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildPage, pageModel, splitPages } from "@/lib/rich-text";
import { CopyMark, CopyRow, type CopyKind } from "./doc-copy";
import { useLiveSettings, type IssuerDoc } from "@/lib/system-settings";

/*
 * กระดาษ A4 ของใบเสนอราคา — ใช้ทั้งหน้าเอกสารจริงและตัวอย่างก่อนบันทึก
 * ที่เดียวกันเสมอ ตัวอย่างที่เห็นจึงตรงกับที่พิมพ์ออกมาแน่นอน
 */

/** หัวกระดาษของผู้ออกเอกสาร — ผู้ดูแลระบบแก้ได้ที่ /admin/company อ่านใหม่ทุกครั้ง */
export function issuerInfo(code?: IssuerCode) {
  const c = code ? issuerOf(code) : issuers()[0];
  return {
    name: c.name,
    taxId: c.taxId,
    phone: c.phone,
    lines: [
      ...c.address.split("\n").filter(Boolean),
      c.phone && `โทร. ${c.phone}`,
      c.email && `Email : ${c.email}`,
      c.callCenter && `Call Center : ${c.callCenter}`,
    ].filter((x): x is string => Boolean(x)),
    bank: [`ชื่อบัญชี: ${c.bankAccountName}`, c.bankName, `เลขที่บัญชี ${c.bankAccountNo}`],
    /* เอกสารแนบที่ตั้งให้แนบอัตโนมัติและยังไม่หมดอายุ (ตั้งที่ /admin/company · ต้นแบบ HR-18)
       เหลือเฉพาะรายการที่มีรูปเก็บไว้ — ไฟล์เดิมที่เก็บแค่ชื่อไม่แสดงบนเอกสาร (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    attachments: attachedImages(c.docs).map((f) => f.title),
    /* รูปที่ต่อท้ายใบเสนอราคา แผ่นละรูป พร้อมลายน้ำ (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    images: attachedImages(c.docs),
    /* ลายเซ็นผู้มีอำนาจลงนามและตราประทับ (ตั้งที่ /admin/company · ผู้ใช้สั่ง 16 ต.ค. 2569) — ไม่มี = ช่องลงนามว่างเหมือนเดิม */
    signer: c.sign || c.stamp ? { sign: c.sign?.src ?? "", stamp: c.stamp?.src ?? "", name: c.signName?.trim() ?? "", title: c.signTitle?.trim() ?? "" } : null,
  };
}

export type AttachedImage = { id: string; title: string; src: string; w: number; h: number };

function attachedImages(docs: IssuerDoc[] | undefined): AttachedImage[] {
  return (docs ?? [])
    .filter((f) => f.attach && f.src && !(f.expires && f.expires < todayIso()))
    .map((f) => ({ id: f.id, title: f.title || f.name, src: f.src!, w: f.w || 1000, h: f.h || 1414 }));
}

export type PaperParty = {
  name: string;
  taxId: string;
  address: string;
  contact: string;
  phone: string;
  email: string;
};

export type PaperDoc = {
  /** ว่าง = ตัวอย่างก่อนออกเลขที่เอกสาร (หน้าสร้างใบเสนอราคา) */
  no: string;
  issued: string;
  /** ฉบับที่เท่าไร — มากกว่า 1 แปลว่าเป็นฉบับแก้ไขของเลขที่เดิม */
  revision?: number;
  validDays: number;
  issuer: IssuerCode;
  customer: PaperParty | null;
  /** รายละเอียดงานเป็น HTML · <hr> คือจุดขึ้นหน้าใหม่ */
  body: string;
  terms: string;
  totals: {
    gross: number;
    discount: number;
    base: number;
    vatRate: number;
    vat: number;
    /** อัตราหักภาษี ณ ที่จ่ายของใบนี้ — 0 = ไม่หัก */
    whtPct: number;
    whtAmount: number;
    grand: number;
  };
};

/** A4 ที่ 96dpi — สัดส่วนสูง/กว้างใช้คิดความสูงแผ่นตอนจอแคบด้วย */
const A4_W = 794;
const A4_H = 1123;
/** เผื่อไว้ให้ตอนพิมพ์ (ขอบ @page 14mm พื้นที่สูงน้อยกว่าบนจอราว 10px) และฟอนต์ปัดเศษ */
const SLACK = 24;
/** แผ่นแคบกว่านี้ (มือถือ) ไม่ตัดตามสัดส่วน A4 — หัวกระดาษกินเกือบทั้งแผ่น ให้แผ่นยืดตามเนื้อหาแทน */
const MIN_AUTO_W = 600;

type Sheet = { html: string; footOnly?: boolean };

/**
 * copy = ป้าย "ต้นฉบับ"/"สำเนา" มุมขวาบนทุกแผ่น (ค่าเริ่มต้นต้นฉบับ)
 * breakFirst = แผ่นแรกขึ้นกระดาษใหม่ตอนพิมพ์ — ใช้กับชุดสำเนาที่ต่อท้ายชุดต้นฉบับ (ผู้ใช้สั่ง 15 ต.ค. 2569)
 */
export function QuotationPaper({
  doc,
  copy = "original",
  breakFirst = false,
}: {
  doc: PaperDoc;
  copy?: CopyKind;
  breakFirst?: boolean;
}) {
  const t = doc.totals;
  /*
   * ตัดหน้าอัตโนมัติ (ผู้ใช้สั่ง 14 ต.ค. 2569)
   * เดิมแบ่งหน้าเฉพาะจุดที่ผู้ใช้กด "แบ่งหน้า" เนื้อหายาวจึงล้นกระดาษลงพื้นเทา
   * ตอนนี้วางเนื้อหาทั้งหมดในแผ่นซ่อนเพื่อวัดความสูงทีละก้อน (ย่อหน้า/ข้อ/แถวตาราง)
   * แล้วจัดลงแผ่น A4 ทีละแผ่น — จุดแบ่งหน้าที่ผู้ใช้แทรกยังบังคับขึ้นแผ่นใหม่เหมือนเดิม
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const model = useMemo(() => (mounted ? pageModel(doc.body) : null), [mounted, doc.body]);
  const allHtml = useMemo(
    () => (model ? buildPage(model.units, model.units.map((_, i) => i)) : ""),
    [model],
  );

  const firstRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [fontTick, setFontTick] = useState(0);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);

  /* ความกว้างจริงของแผ่นบนจอ — จอแคบแผ่นหดตาม ตัวหนังสือตัดบรรทัดมากขึ้น ต้องวัดใหม่ */
  useEffect(() => {
    const el = firstRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    document.fonts?.ready.then(() => setFontTick((n) => n + 1));
    return () => ro.disconnect();
  }, [mounted]);

  const docKey = JSON.stringify({ ...doc, body: "" });

  useLayoutEffect(() => {
    const art = measureRef.current;
    if (width > 0 && width < MIN_AUTO_W) {
      setSheets(null);
      return;
    }
    if (!model || !art || width <= 0) return;
    const rect = (el: Element | null | undefined) => el?.getBoundingClientRect();
    const px = (v: string) => parseFloat(v) || 0;
    const q = (sel: string) => art.querySelector(sel);

    const cs = getComputedStyle(art);
    const padT = px(cs.paddingTop);
    const pageH = Math.round((width * A4_H) / A4_W);
    const inner = pageH - padT - px(cs.paddingBottom);
    const top0 = (rect(art)?.top ?? 0) + padT;

    const table = q("table.items") as HTMLTableElement | null;
    const td = q("td.rich-out") as HTMLElement | null;
    const sheetNo = q(".sheet-no") as HTMLElement | null;
    if (!table || !td || !sheetNo) return;
    const tableTop = (rect(table)?.top ?? 0) - top0; // หัวกระดาษ + ระยะก่อนตาราง (แผ่นแรก)
    const tableGap = px(getComputedStyle(table).marginTop);
    const theadH = rect(table.tHead)?.height ?? 0;
    const tdCs = getComputedStyle(td);
    const tdPad = px(tdCs.paddingTop) + px(tdCs.paddingBottom);
    const footH = rect(q("[data-foot]"))?.height ?? 0;
    const noH = (rect(sheetNo)?.height ?? 0) + px(getComputedStyle(sheetNo).marginTop);
    /* แถวป้ายต้นฉบับ/สำเนาบนแผ่นที่สองเป็นต้นไป (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    const row = q(".copy-row") as HTMLElement | null;
    const rowH = row ? (rect(row)?.height ?? 0) + px(getComputedStyle(row).marginBottom) : 0;

    const budgetFirst = inner - tableTop - theadH - tdPad - noH - SLACK;
    const budgetRest = inner - tableGap - tdPad - noH - rowH - SLACK;

    /* ตำแหน่งบน/ล่างของแต่ละก้อน รวมระยะขอบ */
    const start: number[] = [];
    const end: number[] = [];
    model.units.forEach((_, i) => {
      const el = td.querySelector(`[data-u="${i}"]`);
      const r = rect(el);
      if (!el || !r) {
        start[i] = end[i] = start[i - 1] ?? 0;
        return;
      }
      const ecs = getComputedStyle(el);
      start[i] = r.top - px(ecs.marginTop);
      end[i] = r.bottom + px(ecs.marginBottom);
    });
    /* รายการ/ตารางที่ถูกตัดข้ามหน้า ต้องเผื่อขอบของแท็กแม่ และหัวตารางที่พิมพ์ซ้ำ */
    const headOf = (key: number) => rect(td.querySelector(`table[data-g="${key}"] > thead`))?.height ?? 0;
    const lead = (i: number) => {
      const g = model.units[i]?.group;
      return !g ? 0 : g.tag === "table" ? 6 + headOf(g.key) : 4;
    };
    const tail = (i: number) => (model.units[i]?.group ? 10 : 0);
    const span = (a: number, b: number) => end[b] - start[a] + lead(a) + tail(b);

    const out: { idx: number[]; footOnly?: boolean }[] = [];
    const budget = () => (out.length === 0 ? budgetFirst : budgetRest);
    for (const sec of model.sections) {
      let cur: number[] = [];
      for (const u of sec) {
        if (cur.length && span(cur[0], u) > budget()) {
          out.push({ idx: cur });
          cur = [];
        }
        cur.push(u);
      }
      out.push({ idx: cur });
    }
    /* ท้ายกระดาษ (ยอดรวม/ลายเซ็น) ไม่พอที่ในแผ่นสุดท้าย → ขึ้นแผ่นใหม่ */
    const last = out[out.length - 1];
    const used = last.idx.length ? span(last.idx[0], last.idx[last.idx.length - 1]) : 0;
    if (used + footH > (out.length === 1 ? budgetFirst : budgetRest)) out.push({ idx: [], footOnly: true });

    const next: Sheet[] = out.map((p) => ({ html: buildPage(model.units, p.idx), footOnly: p.footOnly }));
    setSheets((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, allHtml, width, docKey, fontTick]);

  /* ก่อนวัดเสร็จ (เรนเดอร์แรก) ใช้การแบ่งตามจุดที่ผู้ใช้แทรกไปก่อน */
  const pages: Sheet[] = sheets ?? splitPages(doc.body).map((html) => ({ html }));
  const pageH = width >= MIN_AUTO_W ? Math.round((width * A4_H) / A4_W) : undefined;
  const att = issuerInfo(doc.issuer);

  return (
    <>
      {pages.map((page, i) => (
        <article
          key={i}
          ref={i === 0 ? firstRef : undefined}
          className={`paper q-sheet flex shrink-0 flex-col ${i === 0 && breakFirst ? "pg-break" : ""}`}
          /* ทุกแผ่นสูงเท่า A4 พื้นขาวรองหลังเนื้อหาเสมอ */
          style={pageH ? { minHeight: pageH } : undefined}
        >
          {i === 0 ? <PaperHead doc={doc} copy={copy} /> : <CopyRow kind={copy} />}
          {!page.footOnly && <ItemsTable first={i === 0} gross={t.gross} html={page.html} />}
          {i === pages.length - 1 && <PaperFoot doc={doc} />}
          {pages.length > 1 && (
            <>
              <div className="flex-1" />
              <span className="sheet-no">
                หน้า {i + 1} / {pages.length}
              </span>
            </>
          )}
        </article>
      ))}

      {/* รูปเอกสารแนบของผู้ออกเอกสาร — ต่อท้ายใบเสนอราคา แผ่นละรูป มีลายน้ำ (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
      {mounted &&
        att.images.map((img, n, all) => (
          <AttachSheet
            key={img.id}
            img={img}
            n={n + 1}
            total={all.length}
            issuerName={att.name}
            quoteNo={doc.no}
            copy={copy}
            pageH={pageH}
          />
        ))}

      {/* แผ่นซ่อนไว้วัดความสูง — ไม่แสดง ไม่พิมพ์ */}
      {mounted && width >= MIN_AUTO_W && (
        <div
          aria-hidden="true"
          className="no-print pointer-events-none"
          style={{ position: "absolute", left: -10000, top: 0, visibility: "hidden" }}
        >
          <article
            ref={measureRef}
            className="paper flex flex-col"
            style={{ width, maxWidth: "none", minHeight: 0 }}
          >
            <PaperHead doc={doc} copy={copy} />
            <ItemsTable first gross={t.gross} html={allHtml} />
            <div data-foot="">
              <PaperFoot doc={doc} />
            </div>
            <span className="sheet-no">หน้า 1 / 2</span>
            <CopyRow kind={copy} />
          </article>
        </div>
      )}
    </>
  );
}

function ItemsTable({ first, gross, html }: { first: boolean; gross: number; html: string }) {
  return (
    <table className="items mt-[22px]">
      <colgroup>
        <col style={{ width: 64 }} />
        <col />
        <col style={{ width: 130 }} />
      </colgroup>
      {first && (
        <thead>
          <tr>
            <th className="c">ลำดับที่</th>
            <th>รายการ</th>
            <th className="r">รวม</th>
          </tr>
        </thead>
      )}
      <tbody>
        <tr>
          <td className="c num">{first ? "1" : ""}</td>
          <td
            className="rich-out leading-[1.68]"
            /* เนื้อหาผ่านการล้างแท็กแล้วตอนวางและตอนบันทึก */
            dangerouslySetInnerHTML={{ __html: html }}
          />
          <td className="r num">{first ? baht(gross) : ""}</td>
        </tr>
      </tbody>
    </table>
  );
}

function PaperHead({ doc, copy }: { doc: PaperDoc; copy: CopyKind }) {
  const c = doc.customer;
  /* หัวกระดาษตามผู้ออกเอกสารของใบนี้ — เดิมพิมพ์ข้อมูล MAZ ทุกใบแม้ออกในนาม B1 */
  const info = issuerInfo(doc.issuer);
  /* โลโก้ใช้เฉพาะเอกสารที่ออกในนาม MAZ — ใบที่ออกในนามบริษัทอื่นต้องขึ้นชื่อบริษัทนั้น
     ไม่ใช่ตราของ MAZ (เดิมพิมพ์ MAZ ทุกใบแม้ออกในนาม B1) */
  const maz = !doc.issuer || doc.issuer === "MAZ";
  return (
    <>
      <header className="flex flex-col justify-between gap-7 sm:flex-row sm:items-start">
        <div className="max-w-[52%]">
          {maz ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/maz-logo.png" alt="MAZ" className="h-[34px] w-auto" />
          ) : (
            <p className="text-[22px] leading-tight font-extrabold text-primary">{info.name}</p>
          )}
          <p className="mt-1 text-[10px] font-semibold tracking-[0.13em] text-[#5a6069]">
            DIGITAL BUSINESS SOLUTION
          </p>
        </div>
        <div className="sm:text-right">
          <div className="mb-2 flex sm:justify-end">
            <CopyMark kind={copy} />
          </div>
          <h2 className="text-[23px] font-bold text-[#25292f]">ใบเสนอราคา / QUOTATION</h2>
          <p className="num mt-1 text-[13px] font-bold text-primary">
            {doc.no || "ยังไม่ออกเลขที่"}
            {(doc.revision ?? 1) > 1 && (
              <span className="ml-2 text-[11.5px] font-semibold text-[#4a5058]">
                ฉบับแก้ไขที่ {doc.revision}
              </span>
            )}
          </p>
          <p className="mt-2 text-xs text-[#4a5058]">
            <span>{doc.issued ? thaiDateLong(doc.issued) : "ยังไม่ได้ออกเอกสาร"}</span>
            <em className="ml-[18px] text-[#5a6069] not-italic">
              กำหนดยืนเวลา {doc.validDays} วัน
            </em>
          </p>
        </div>
      </header>

      <div className="mt-[18px] grid gap-7 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-[13.5px] font-bold">{info.name}</p>
          <p className="num text-[11.5px] leading-[1.72] text-[#4a5058]">
            เลขประจำตัวผู้เสียภาษี : {info.taxId}
          </p>
          {info.lines.map((l) => (
            <p key={l} className="text-[11.5px] leading-[1.72] text-[#4a5058]">
              {l}
            </p>
          ))}
        </div>
        <div>
          <p className="mb-1 text-[13.5px] font-bold">
            {c?.name || "— ยังไม่ได้เลือกลูกค้า —"}
          </p>
          {c?.taxId && (
            <p className="num text-[11.5px] leading-[1.72] text-[#4a5058]">
              เลขประจำตัวผู้เสียภาษี : {c.taxId}
            </p>
          )}
          {c?.address && (
            <p className="text-[11.5px] leading-[1.72] text-[#4a5058]">{c.address}</p>
          )}
          {/* ลำดับตาม mockup: โทรศัพท์ · Email · ชื่อลูกค้า (ผู้ติดต่อ)
              ช่องที่ยังไม่ได้กรอกไม่พิมพ์ขีดคั่น ลูกค้าอ่านแล้วนึกว่าเราทำเอกสารตกหล่น */}
          {c?.phone && (
            <p className="num text-[11.5px] leading-[1.72] text-[#4a5058]">โทรศัพท์ : {c.phone}</p>
          )}
          {c?.email && (
            <p className="text-[11.5px] leading-[1.72] text-[#4a5058]">Email : {c.email}</p>
          )}
          {c?.contact && (
            <p className="text-[11.5px] leading-[1.72] text-[#4a5058]">ชื่อลูกค้า : {c.contact}</p>
          )}
        </div>
      </div>

      {/* เอกสารแนบของผู้ออกเอกสาร — ลูกค้าเห็นรายการไฟล์ที่แนบมาพร้อมใบเสนอราคา */}
      {info.attachments.length > 0 && (
        <div className="mt-5 border-t border-[#e3e6ea] pt-3">
          <h3 className="mb-1 text-xs font-semibold text-[#4a5058]">เอกสารแนบ</h3>
          <p className="text-xs leading-[1.75] text-[#4a5058]">{info.attachments.join(" · ")}</p>
        </div>
      )}
    </>
  );
}

function PaperFoot({ doc }: { doc: PaperDoc }) {
  /* อ่านการตั้งค่าแบบติดตาม — แก้ลายเซ็นแล้วกระดาษวาดใหม่ทันที (issuers ไม่อยู่ใน key ของเปลือกแอป) */
  useLiveSettings();
  const t = doc.totals;
  const info = issuerInfo(doc.issuer);
  const sg = info.signer;

  return (
    <>
      <div className="mt-[18px] grid gap-7 border-y-2 border-primary py-3.5 sm:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex items-center gap-3.5 sm:pt-[22px]">
          <span className="shrink-0 text-xs text-[#5a6069]">ตัวอักษร</span>
          <span className="flex-1 rounded bg-[#edeef1] px-3.5 py-2 text-center text-[12.5px]">
            {bahtText(t.grand)}
          </span>
        </div>
        <dl className="text-[12.5px]">
          {t.discount > 0 && (
            <>
              <Row label="รวมเป็นเงิน" value={baht(t.gross)} />
              <Row label="หักส่วนลด" value={`-${baht(t.discount)}`} />
            </>
          )}
          <Row label="รวมสุทธิก่อนภาษี" value={baht(t.base)} />
          <Row
            label={
              t.vatRate
                ? `ภาษีมูลค่าเพิ่ม ${t.vatRate}%`
                : "ภาษีมูลค่าเพิ่ม (ไม่คิด)"
            }
            value={baht(t.vat)}
          />
          {t.whtPct > 0 ? (
            <Row label={`ภาษี ณ ที่จ่าย ${t.whtPct}%`} value={`-${baht(t.whtAmount)}`} />
          ) : (
            <Row label="ภาษี ณ ที่จ่าย" value={NO_WHT_NOTE} />
          )}
          <div className="mt-1.5 flex items-center justify-between gap-3.5 border-t border-[#b9bfc8] pt-2.5">
            <dt className="text-[13.5px] font-bold text-[#25292f]">รวมทั้งสิ้น</dt>
            <dd className="num text-[16.5px] font-bold">{baht(t.grand)}</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 grid gap-7 sm:grid-cols-2">
        <div>
          {/* ตาม mockup: มีเงื่อนไขการชำระเงินก็ขึ้นเงื่อนไข ไม่มีก็ขึ้นบัญชีธนาคาร ใต้หัวข้อเดียวกัน */}
          <h3 className="mb-1.5 text-xs font-semibold text-[#4a5058]">
            เงื่อนไขการชำระเงิน
          </h3>
          {doc.terms.trim() ? (
            <p className="text-xs leading-[1.75] text-[#4a5058]">{doc.terms}</p>
          ) : (
            info.bank.map((l) => (
              <p key={l} className="text-xs leading-[1.75] text-[#4a5058]">
                {l}
              </p>
            ))
          )}
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div className="text-center">
            <b className="mb-[34px] block text-xs font-semibold text-primary">
              ตอบรับใบเสนอราคานี้
            </b>
            <span className="block h-px bg-[#8a9099]" />
          </div>
          {/* ช่องฝั่งบริษัท — มีลายเซ็นในตั้งค่า: รูปลายเซ็นเหนือเส้น ตราประทับซ้อนด้านข้าง ชื่อ/ตำแหน่งใต้เส้น
              ใช้ <img> ให้พิมพ์ติด (พื้นหลัง CSS มักไม่พิมพ์) · ช่องตอบรับของลูกค้าว่างเสมอ (ผู้ใช้สั่ง 16 ต.ค. 2569) */}
          {sg ? (
            <div className="text-center">
              <b className="block text-xs font-semibold">ผู้เสนอราคา</b>
              <div className="relative h-[52px]">
                {sg.stamp && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={sg.stamp}
                    alt="ตราประทับบริษัท"
                    className="absolute right-[-6px] bottom-[-22px] h-[70px] w-[70px] object-contain opacity-90 mix-blend-multiply"
                  />
                )}
                {sg.sign && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={sg.sign}
                    alt="ลายเซ็นผู้มีอำนาจลงนาม"
                    className="absolute bottom-0 left-1/2 h-[48px] max-w-[90%] -translate-x-1/2 object-contain mix-blend-multiply"
                  />
                )}
              </div>
              <span className="block h-px bg-[#8a9099]" />
              {sg.name && <p className="mt-1 text-[11px] text-[#25292f]">({sg.name})</p>}
              {sg.title && <p className="text-[10.5px] text-[#5a6069]">{sg.title}</p>}
            </div>
          ) : (
            <div className="text-center">
              <b className="mb-[34px] block text-xs font-semibold">ผู้เสนอราคา</b>
              <span className="block h-px bg-[#8a9099]" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3.5 py-[7px]">
      <dt className="text-[#5a6069]">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}


/*
 * แผ่นรูปเอกสารแนบ (ผู้ใช้สั่ง 15 ต.ค. 2569) — หนังสือรับรองบริษัท หน้าสมุดบัญชี ฯลฯ
 * รูปย่อให้พอดีในขอบกระดาษ (.att-box คุมสัดส่วนจาก w/h ที่เก็บไว้) แล้ววางลายน้ำทับด้วย SVG
 * ลายน้ำเป็นตัวอักษรใน SVG ไม่ใช่ background-image — เบราว์เซอร์พิมพ์ออกมาเสมอ ไม่ถูกตัดทิ้งเหมือนภาพพื้นหลัง
 */
function AttachSheet({
  img,
  n,
  total,
  issuerName,
  quoteNo,
  copy,
  pageH,
}: {
  img: AttachedImage;
  n: number;
  total: number;
  issuerName: string;
  quoteNo: string;
  copy: CopyKind;
  pageH?: number;
}) {
  /* พื้นที่สูงที่เหลือบนจอ = แผ่น A4 − ขอบบน/ล่างของ .paper − แถวหัวแผ่น */
  const boxH = pageH ? pageH - 52 - 44 - 64 : 0;
  return (
    <article
      className="paper q-sheet q-att pg-break flex shrink-0 flex-col"
      style={pageH ? { minHeight: pageH } : undefined}
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] leading-[1.6] text-[#4a5058]">
          <b className="font-semibold text-[#25292f]">
            เอกสารแนบ {n} / {total}
          </b>{" "}
          · {img.title}
          <span className="block">{quoteNo ? `ประกอบใบเสนอราคาเลขที่ ${quoteNo}` : "ประกอบใบเสนอราคา"}</span>
        </p>
        <CopyMark kind={copy} />
      </div>
      <div className="flex flex-1 items-center justify-center pt-3">
        <div
          className="att-box relative overflow-hidden"
          style={{ "--ar": img.w / img.h, ...(boxH > 0 ? { "--att-h": `${boxH}px` } : {}) } as React.CSSProperties}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={img.src} alt={img.title} className="block size-full object-contain" />
          <Watermark w={img.w} h={img.h} text={`${issuerName} · ใช้สำหรับใบเสนอราคาเท่านั้น`} />
        </div>
      </div>
    </article>
  );
}

/** ลายน้ำเฉียงซ้ำทั้งรูป — พิกัดตามขนาดรูปจริง ตัวอักษรจึงไม่ยืดตามสัดส่วนกล่อง */
function Watermark({ w, h, text }: { w: number; h: number; text: string }) {
  const fs = Math.max(w, h) / 30;
  const gap = fs * 3.4;
  const d = Math.hypot(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const rows = Math.ceil(d / gap) + 1;
  const line = Array.from({ length: 5 }, () => text).join("     ");
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
      style={{ overflow: "hidden" }}
    >
      <g transform={`rotate(-30 ${cx} ${cy})`} fill="#b0001e" fillOpacity={0.24} fontSize={fs} fontWeight={700}>
        {Array.from({ length: rows }, (_, r) => (
          <text key={r} x={cx - d + (r % 2) * fs * 6} y={cy - d / 2 + r * gap}>
            {line}
          </text>
        ))}
      </g>
    </svg>
  );
}
