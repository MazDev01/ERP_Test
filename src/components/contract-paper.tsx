"use client";

/*
 * กระดาษ A4 ของใบสัญญา (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * ตัดหน้าแบบเดียวกับใบเสนอราคา (quotation-paper.tsx) — แตกเนื้อหาเป็นก้อนด้วย pageModel แล้ววัดความสูงจริง
 * หัวสัญญาอยู่แผ่นแรก ช่องลงนามอยู่แผ่นสุดท้าย · จุดแบ่งหน้า (<hr>) ที่ผู้ใช้แทรกบังคับขึ้นแผ่นใหม่
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { buildPage, pageModel, splitPages } from "@/lib/rich-text";
import { issuerOf, type IssuerCode } from "@/lib/crm-data";
import { thaiDateLong } from "@/lib/format";
import "@/styles/contract.css";
import { CopyMark, CopyRow, type CopyKind } from "./doc-copy";

export type ContractPaperDoc = {
  no: string;
  version: number;
  date: string;
  issuer: IssuerCode;
  /** ชื่อผู้ว่าจ้างตามหนังสือรับรอง */
  customer: string;
  body: string;
};

const A4_W = 794;
const A4_H = 1123;
const SLACK = 24;
const MIN_AUTO_W = 600;

type Sheet = { html: string; footOnly?: boolean };

/**
 * copy = ป้าย "ต้นฉบับ"/"สำเนา" มุมขวาบนทุกแผ่น · breakFirst = ชุดที่สองขึ้นกระดาษใหม่ตอนพิมพ์ (ผู้ใช้สั่ง 15 ต.ค. 2569)
 */
export function ContractPaper({
  doc,
  copy = "original",
  breakFirst = false,
}: {
  doc: ContractPaperDoc;
  copy?: CopyKind;
  breakFirst?: boolean;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const model = useMemo(() => (mounted ? pageModel(doc.body) : null), [mounted, doc.body]);
  const allHtml = useMemo(() => (model ? buildPage(model.units, model.units.map((_, i) => i)) : ""), [model]);

  const firstRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(0);
  const [fontTick, setFontTick] = useState(0);
  const [sheets, setSheets] = useState<Sheet[] | null>(null);

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
    const cs = getComputedStyle(art);
    const padT = px(cs.paddingTop);
    const pageH = Math.round((width * A4_H) / A4_W);
    const inner = pageH - padT - px(cs.paddingBottom);
    const top0 = (rect(art)?.top ?? 0) + padT;

    const body = art.querySelector("[data-body]") as HTMLElement | null;
    const sheetNo = art.querySelector(".sheet-no") as HTMLElement | null;
    if (!body || !sheetNo) return;
    const bodyTop = (rect(body)?.top ?? 0) - top0;
    const bodyGap = px(getComputedStyle(body).marginTop);
    const footH = rect(art.querySelector("[data-foot]"))?.height ?? 0;
    const noH = (rect(sheetNo)?.height ?? 0) + px(getComputedStyle(sheetNo).marginTop);
    const budgetFirst = inner - bodyTop - noH - SLACK;
    /* แถวป้ายต้นฉบับ/สำเนาบนแผ่นที่สองเป็นต้นไป (ผู้ใช้สั่ง 15 ต.ค. 2569) */
    const row = art.querySelector(".copy-row") as HTMLElement | null;
    const rowH = row ? (rect(row)?.height ?? 0) + px(getComputedStyle(row).marginBottom) : 0;
    const budgetRest = inner - bodyGap - noH - rowH - SLACK;

    const start: number[] = [];
    const end: number[] = [];
    model.units.forEach((_, i) => {
      const el = body.querySelector(`[data-u="${i}"]`);
      const r = rect(el);
      if (!el || !r) {
        start[i] = end[i] = start[i - 1] ?? 0;
        return;
      }
      const ecs = getComputedStyle(el);
      start[i] = r.top - px(ecs.marginTop);
      end[i] = r.bottom + px(ecs.marginBottom);
    });
    const headOf = (key: number) => rect(body.querySelector(`table[data-g="${key}"] > thead`))?.height ?? 0;
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
    const last = out[out.length - 1];
    const used = last.idx.length ? span(last.idx[0], last.idx[last.idx.length - 1]) : 0;
    if (used + footH > (out.length === 1 ? budgetFirst : budgetRest)) out.push({ idx: [], footOnly: true });

    const next: Sheet[] = out.map((pg) => ({ html: buildPage(model.units, pg.idx), footOnly: pg.footOnly }));
    setSheets((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, allHtml, width, docKey, fontTick]);

  const pages: Sheet[] = sheets ?? [{ html: splitPages(doc.body).join("") }];
  const pageH = width >= MIN_AUTO_W ? Math.round((width * A4_H) / A4_W) : undefined;

  return (
    <>
      {pages.map((page, i) => (
        <article
          key={i}
          ref={i === 0 ? firstRef : undefined}
          className={`paper q-sheet flex shrink-0 flex-col ${i === 0 && breakFirst ? "pg-break" : ""}`}
          style={pageH ? { minHeight: pageH } : undefined}
        >
          {i === 0 ? <ContractHead doc={doc} copy={copy} /> : <CopyRow kind={copy} />}
          {!page.footOnly && (
            <div
              className="rich-out ct-body"
              /* เนื้อหาผ่านการล้างแท็กแล้วตอนบันทึก */
              dangerouslySetInnerHTML={{ __html: page.html }}
            />
          )}
          {i === pages.length - 1 && <ContractFoot doc={doc} />}
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

      {mounted && width >= MIN_AUTO_W && (
        <div
          aria-hidden="true"
          className="no-print pointer-events-none"
          style={{ position: "absolute", left: -10000, top: 0, visibility: "hidden" }}
        >
          <article ref={measureRef} className="paper flex flex-col" style={{ width, maxWidth: "none", minHeight: 0 }}>
            <ContractHead doc={doc} copy={copy} />
            <div data-body="" className="rich-out ct-body" dangerouslySetInnerHTML={{ __html: allHtml }} />
            <div data-foot="">
              <ContractFoot doc={doc} />
            </div>
            <span className="sheet-no">หน้า 1 / 2</span>
            <CopyRow kind={copy} />
          </article>
        </div>
      )}
    </>
  );
}

function ContractHead({ doc, copy }: { doc: ContractPaperDoc; copy: CopyKind }) {
  const me = issuerOf(doc.issuer);
  const maz = !doc.issuer || doc.issuer === "MAZ";
  return (
    <>
      <header className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
        <div className="max-w-[52%]">
          {maz ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src="/maz-logo.png" alt="MAZ" className="h-[34px] w-auto" />
          ) : (
            <p className="text-[22px] leading-tight font-extrabold text-primary">{me.name}</p>
          )}
          <p className="mt-1 text-[10px] font-semibold tracking-[0.13em] text-[#5a6069]">DIGITAL BUSINESS SOLUTION</p>
        </div>
        <div className="sm:text-right">
          <div className="mb-2 flex sm:justify-end">
            <CopyMark kind={copy} />
          </div>
          <h2 className="text-[23px] font-bold text-[#25292f]">สัญญาจ้างบริการ / SERVICE AGREEMENT</h2>
          <p className="num mt-1 text-[13px] font-bold text-primary">
            เลขที่สัญญา {doc.no || "ยังไม่ออกเลขที่"}
            {doc.version > 1 && (
              <span className="ml-2 text-[11.5px] font-semibold text-[#4a5058]">ฉบับที่ {doc.version}</span>
            )}
          </p>
          <p className="mt-2 text-xs text-[#4a5058]">{doc.date ? thaiDateLong(doc.date) : ""}</p>
        </div>
      </header>
      <div className="rule mt-4" />
    </>
  );
}

function ContractFoot({ doc }: { doc: ContractPaperDoc }) {
  const me = issuerOf(doc.issuer);
  const box = (role: string, name: string) => (
    <div className="text-center text-[12px] text-[#4a5058]">
      <p className="mt-10">ลงชื่อ ...................................................... {role}</p>
      <p className="mt-2">( ...................................................... )</p>
      {name && <p className="mt-1 font-semibold text-[#25292f]">{name}</p>}
    </div>
  );
  return (
    <div className="ct-sign mt-6 grid gap-x-8 gap-y-2 sm:grid-cols-2">
      {box("ผู้ว่าจ้าง", doc.customer)}
      {box("ผู้รับจ้าง", me.name)}
      {box("พยาน", "")}
      {box("พยาน", "")}
    </div>
  );
}
