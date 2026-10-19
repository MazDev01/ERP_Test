/*
 * ใบสัญญาจ้างบริการที่ระบบออกให้ฝ่ายขาย (ผู้ใช้สั่ง 14 ต.ค. 2569)
 *
 * ผูกกับดีล — ออกได้หลังลูกค้าตกลงและชำระงวดแรกแล้ว (มีใบเสร็จของดีลอย่างน้อยหนึ่งใบ · dealPaid)
 * ร่างแรกสร้างจากแม่แบบสัญญาจ้างบริการมาตรฐาน + ข้อมูลใบเสนอราคา ดีล และงวดเงินของบัญชี
 * ฝ่ายขายแก้ร่างในช่องรายละเอียด (rich-editor) ก่อนบันทึก · บันทึกทุกครั้ง = ฉบับใหม่ ฉบับเก่าเก็บไว้
 * เลขที่สัญญาออกครั้งเดียวต่อดีล (ฉบับแรก) ฉบับถัดไปใช้เลขเดิม
 *
 * TODO: เมื่อมี backend ให้ endpoint ร่างสัญญาด้วย AI แทน draftContractHtml ได้เลย
 *       (รับข้อมูลชุดเดียวกับ ContractInput คืน HTML ที่ผ่าน cleanHtml) — ตอนนี้ต้นแบบออฟไลน์จึงใช้แม่แบบ
 * ⚠️ ยังไม่มีตาราง deal_contract ใน ERD (deal_no, contract_no, version, body_html, created_by, created_at)
 */

import { issuerOf, issuers, type Customer, type Deal, type IssuerCode, type Quotation } from "./crm-data";
import type { Installment, Invoice } from "./acc-data";
import { baht, bahtText, nextDocNo, thaiDateLong } from "./format";
import { escapeHtml } from "./rich-text";

export type ContractDoc = {
  id: string;
  dealNo: string;
  /** เลขที่สัญญา — เลขเอกสารจริง แสดงบนจอได้ */
  no: string;
  /** ฉบับที่ — เริ่ม 1 สร้างร่างใหม่หรือแก้ไขแล้วบันทึกได้ฉบับถัดไป */
  version: number;
  issuer: IssuerCode;
  /** เนื้อหาสัญญาเป็น HTML (แท็กชุดเดียวกับรายละเอียดใบเสนอราคา) */
  body: string;
  /** วันที่ของสัญญา yyyy-mm-dd */
  date: string;
  /** วันเวลาที่บันทึก "yyyy-mm-dd HH:mm" */
  at: string;
  by: string;
  /** draft = สร้างจากแม่แบบใหม่ · edit = แก้จากฉบับก่อน */
  from: "draft" | "edit";
};

/**
 * เลขที่สัญญาตามผู้ออกเอกสาร — ยังไม่มีรูปแบบเลขสัญญาในตั้งค่าเลขที่เอกสาร จึงใช้ CT-<ปี>-####
 * ผู้ออกรายอื่นที่ไม่ใช่รายแรก (เช่น B1) ใส่รหัสผู้ออกต่อท้าย CT ลำดับจะได้ไม่ชนกัน
 */
export function contractPrefix(issuer: IssuerCode) {
  const first = issuers()[0]?.code;
  return !issuer || issuer === first ? "CT" : `CT-${issuer}`;
}

export function nextContractNo(issuer: IssuerCode, existing: string[]) {
  return nextDocNo(contractPrefix(issuer), existing);
}

export type ContractInput = {
  no: string;
  date: string;
  deal: Deal;
  customer?: Customer;
  quotation?: Quotation;
  totals?: { gross: number; discount: number; base: number; vatRate: number; vat: number; whtPct: number; whtAmount: number; grand: number };
  /** งวดเงินของดีลจากฝ่ายบัญชี */
  plan: Installment[];
  /** ใบแจ้งหนี้ที่ออกแล้วของดีล — ใช้วันครบกำหนดจริงแทนวันในแผน */
  invoices: Invoice[];
};

const e = escapeHtml;
const p = (html: string) => `<p>${html}</p>`;
const head = (n: number, title: string) => p(`<b>ข้อ ${n} ${e(title)}</b>`);

function branchLabel(b?: string) {
  if (!b) return "";
  return b === "00000" ? "สำนักงานใหญ่" : `สาขาที่ ${b}`;
}

/** ร่างสัญญาจากแม่แบบ — ข้อความทั้งหมดผ่าน escapeHtml ยกเว้นรายละเอียดงานที่ล้างแท็กแล้วตอนบันทึกใบเสนอราคา */
export function draftContractHtml(x: ContractInput): string {
  const { deal, customer: c, quotation: q, totals: t } = x;
  const me = issuerOf(q?.issuer ?? issuers()[0]?.code ?? "");
  const cusName = c?.legalName || c?.name || "—";
  const cusAddr = (c?.legalAddress || c?.address || "").replace(/\n/g, " ");
  const branch = branchLabel(c?.branch);

  const out: string[] = [];
  out.push(
    p(`สัญญาฉบับนี้ทำขึ้นเมื่อวันที่ ${e(thaiDateLong(x.date))} ระหว่าง`),
    p(
      `<b>${e(me.name)}</b> เลขประจำตัวผู้เสียภาษี ${e(me.taxId)} สำนักงานตั้งอยู่เลขที่ ${e(me.address.replace(/\n/g, " "))} ` +
        `ซึ่งต่อไปในสัญญานี้เรียกว่า “ผู้รับจ้าง” ฝ่ายหนึ่ง กับ`,
    ),
    p(
      `<b>${e(cusName)}</b>` +
        (c?.taxId ? ` เลขประจำตัวผู้เสียภาษี ${e(c.taxId)}${branch ? ` (${e(branch)})` : ""}` : "") +
        (cusAddr ? ` ที่อยู่ ${e(cusAddr)}` : "") +
        ` ซึ่งต่อไปในสัญญานี้เรียกว่า “ผู้ว่าจ้าง” อีกฝ่ายหนึ่ง`,
    ),
    p("ทั้งสองฝ่ายตกลงทำสัญญากันโดยมีข้อความดังต่อไปนี้"),
  );

  /* ข้อ 1 ขอบเขตงาน — ยึดใบเสนอราคาเสมอ */
  out.push(
    head(1, "ขอบเขตงาน"),
    p(
      `ผู้ว่าจ้างตกลงจ้าง และผู้รับจ้างตกลงรับจ้างดำเนินงาน ${e(deal.scope || "ตามใบเสนอราคา")}` +
        (q ? ` ตามใบเสนอราคาเลขที่ ${e(q.no)} ลงวันที่ ${e(thaiDateLong(q.issued))} ซึ่งถือเป็นส่วนหนึ่งของสัญญานี้` : "") +
        " โดยมีรายละเอียดดังนี้",
    ),
  );
  /* จุดแบ่งหน้าของใบเสนอราคาไม่ใช้ในสัญญา */
  const scope = (q?.body ?? "").replace(/<hr\s*\/?>/gi, "").trim();
  out.push(scope || p("— ระบุรายละเอียดงาน —"));

  /* ข้อ 2 ค่าจ้างและภาษี */
  out.push(head(2, "ค่าจ้างและภาษี"));
  if (t) {
    const rows: [string, string][] = [];
    if (t.discount > 0) {
      rows.push(["รวมเป็นเงิน", baht(t.gross)], ["หักส่วนลด", `-${baht(t.discount)}`]);
    }
    rows.push(["มูลค่างานก่อนภาษี", baht(t.base)]);
    rows.push([t.vatRate ? `ภาษีมูลค่าเพิ่ม ${t.vatRate}%` : "ภาษีมูลค่าเพิ่ม (ไม่คิด)", baht(t.vat)]);
    rows.push(["รวมค่าจ้างทั้งสิ้น", baht(t.base + t.vat)]);
    if (t.whtPct > 0) rows.push([`หักภาษี ณ ที่จ่าย ${t.whtPct}%`, `-${baht(t.whtAmount)}`]);
    rows.push(["ยอดชำระสุทธิ", baht(t.grand)]);
    out.push(
      p(`ผู้ว่าจ้างตกลงชำระค่าจ้างให้แก่ผู้รับจ้างเป็นเงินทั้งสิ้น ${e(baht(t.base + t.vat))} บาท (${e(bahtText(t.base + t.vat))}) รายละเอียดดังนี้`),
      `<table><thead><tr><th>รายการ</th><th>จำนวนเงิน (บาท)</th></tr></thead><tbody>${rows
        .map(([k, v]) => `<tr><td>${e(k)}</td><td>${e(v)}</td></tr>`)
        .join("")}</tbody></table>`,
      t.whtPct > 0
        ? p(`ผู้ว่าจ้างเป็นผู้หักภาษี ณ ที่จ่ายในอัตราร้อยละ ${t.whtPct} และส่งหนังสือรับรองการหักภาษี ณ ที่จ่ายให้ผู้รับจ้างทุกครั้งที่ชำระ`)
        : p("ค่าจ้างนี้ไม่มีการหักภาษี ณ ที่จ่าย"),
    );
  } else {
    out.push(p(`ผู้ว่าจ้างตกลงชำระค่าจ้างเป็นเงินทั้งสิ้น ${e(baht(deal.total))} บาท (${e(bahtText(deal.total))})`));
  }

  /* ข้อ 3 การชำระเงิน — งวดจากแผนของฝ่ายบัญชี ใช้วันครบกำหนดจากใบแจ้งหนี้ที่ออกแล้ว */
  out.push(head(3, "การชำระเงิน"));
  if (x.plan.length) {
    const rows = x.plan
      .slice()
      .sort((a, b) => a.seq - b.seq)
      .map((i) => {
        const inv = x.invoices.find((v) => v.seq === i.seq && !v.cancelled);
        const due = inv?.due || i.due;
        return `<tr><td>งวดที่ ${i.seq}</td><td>${e(String(i.pct))}%</td><td>${e(baht(inv?.total ?? i.amount))}</td><td>${due ? e(thaiDateLong(due)) : "ตามที่ตกลง"}</td></tr>`;
      })
      .join("");
    out.push(
      p("ผู้ว่าจ้างตกลงชำระค่าจ้างเป็นงวด ดังนี้"),
      `<table><thead><tr><th>งวด</th><th>สัดส่วน</th><th>ยอดชำระ (บาท)</th><th>กำหนดชำระ</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  } else {
    out.push(p("ผู้ว่าจ้างตกลงชำระค่าจ้างตามงวดที่ระบุในใบเสนอราคา"));
  }
  out.push(
    p(
      `โดยโอนเข้าบัญชี ${e(me.bankAccountName)} ${e(me.bankName)} เลขที่บัญชี ${e(me.bankAccountNo)} ` +
        "ภายในกำหนดชำระของแต่ละงวด ผู้รับจ้างจะออกใบเสร็จรับเงิน/ใบกำกับภาษีให้เมื่อได้รับชำระ",
    ),
  );

  /* ข้อ 4 ระยะเวลา */
  out.push(
    head(4, "ระยะเวลาดำเนินงาน"),
    p(
      `ผู้รับจ้างจะเริ่มดำเนินงานในวันที่ ${deal.start ? e(thaiDateLong(deal.start)) : "ตามที่ตกลง"} ` +
        `และส่งมอบงานภายในวันที่ ${deal.delivery ? e(thaiDateLong(deal.delivery)) : "ตามที่ตกลง"} ` +
        "ทั้งนี้หากความล่าช้าเกิดจากผู้ว่าจ้างส่งข้อมูลหรือให้ความเห็นล่าช้า ระยะเวลาส่งมอบขยายออกไปเท่ากับเวลาที่ล่าช้านั้น",
    ),
  );

  /* ข้อ 5 ส่งมอบและตรวจรับ */
  out.push(
    head(5, "การส่งมอบงานและการตรวจรับ"),
    `<ol><li>ผู้รับจ้างส่งมอบงานตามขอบเขตในข้อ 1 พร้อมบัญชีผู้ใช้ ไฟล์งาน และคู่มือการใช้งานที่เกี่ยวข้อง</li>` +
      `<li>ผู้ว่าจ้างตรวจรับงานภายใน 7 วันนับจากวันที่ได้รับมอบ หากพบข้อบกพร่องให้แจ้งเป็นลายลักษณ์อักษร ผู้รับจ้างจะแก้ไขแล้วส่งมอบใหม่</li>` +
      `<li>หากผู้ว่าจ้างไม่แจ้งผลการตรวจรับภายในกำหนด หรือนำงานไปใช้งานจริงแล้ว ให้ถือว่าผู้ว่าจ้างตรวจรับงานแล้ว</li></ol>`,
  );

  /* ข้อ 6 รับประกัน */
  out.push(
    head(6, "การรับประกันผลงาน"),
    p(
      "ผู้รับจ้างรับประกันผลงานเป็นเวลา 90 วันนับจากวันตรวจรับงาน หากพบข้อผิดพลาดที่เกิดจากการทำงานของผู้รับจ้าง " +
        "ผู้รับจ้างจะแก้ไขให้โดยไม่คิดค่าใช้จ่าย ไม่รวมความเสียหายที่เกิดจากการแก้ไขโดยบุคคลอื่น การใช้งานผิดวัตถุประสงค์ หรือบริการของผู้ให้บริการภายนอก",
    ),
  );

  /* ข้อ 7 เปลี่ยนแปลงขอบเขต */
  out.push(
    head(7, "การเปลี่ยนแปลงขอบเขตงาน"),
    p("งานที่อยู่นอกขอบเขตในข้อ 1 ให้ทั้งสองฝ่ายตกลงค่าจ้างและระยะเวลาเพิ่มเติมเป็นลายลักษณ์อักษรก่อนเริ่มดำเนินการ"),
  );

  /* ข้อ 8 ทรัพย์สินทางปัญญาและความลับ */
  out.push(
    head(8, "ทรัพย์สินทางปัญญาและการรักษาความลับ"),
    p(
      "เมื่อผู้ว่าจ้างชำระค่าจ้างครบถ้วนแล้ว สิทธิในผลงานที่ทำขึ้นเฉพาะสำหรับผู้ว่าจ้างตกเป็นของผู้ว่าจ้าง " +
        "ส่วนเครื่องมือ ไลบรารี และส่วนประกอบที่ผู้รับจ้างพัฒนาไว้ก่อนยังเป็นของผู้รับจ้าง ทั้งสองฝ่ายตกลงเก็บรักษาข้อมูลของอีกฝ่ายเป็นความลับ",
    ),
  );

  /* ข้อ 9 เลิกสัญญา */
  out.push(
    head(9, "การบอกเลิกสัญญา"),
    `<ol><li>หากฝ่ายใดผิดสัญญาข้อหนึ่งข้อใด และไม่แก้ไขภายใน 15 วันนับจากได้รับแจ้งเป็นลายลักษณ์อักษร อีกฝ่ายมีสิทธิบอกเลิกสัญญาได้</li>` +
      `<li>เมื่อเลิกสัญญา ผู้ว่าจ้างชำระค่าจ้างตามงานที่ผู้รับจ้างทำแล้วจนถึงวันเลิกสัญญา ค่าจ้างที่ชำระแล้วไม่คืน เว้นแต่ตกลงกันเป็นอย่างอื่น</li></ol>`,
  );

  /* ข้อ 10 อื่น ๆ */
  out.push(
    head(10, "ข้อตกลงอื่น"),
    p(
      "สัญญานี้ทำขึ้นเป็นสองฉบับมีข้อความถูกต้องตรงกัน ทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยตลอดแล้ว " +
        "จึงลงลายมือชื่อไว้เป็นสำคัญต่อหน้าพยาน และต่างยึดถือไว้ฝ่ายละหนึ่งฉบับ",
    ),
  );

  return out.join("");
}
