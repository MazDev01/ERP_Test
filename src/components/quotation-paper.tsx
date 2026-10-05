"use client";

import { issuerOf, issuers, type IssuerCode } from "@/lib/crm-data";
import { NO_WHT_NOTE } from "@/lib/acc-data";
import { baht, bahtText, thaiDateLong, todayIso } from "@/lib/format";
import { splitPages } from "@/lib/rich-text";

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
    /* เอกสารแนบที่ตั้งให้แนบอัตโนมัติและยังไม่หมดอายุ (ตั้งที่ /admin/company · ต้นแบบ HR-18) */
    attachments: (c.docs ?? [])
      .filter((f) => f.attach && !(f.expires && f.expires < todayIso()))
      .map((f) => f.title || f.name),
  };
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

export function QuotationPaper({ doc }: { doc: PaperDoc }) {
  const pages = splitPages(doc.body);
  const t = doc.totals;

  return (
    <>
      {pages.map((page, i) => (
        <article key={i} className="paper">
          {i === 0 && <PaperHead doc={doc} />}

          <table className="items mt-[22px]">
            <colgroup>
              <col style={{ width: 64 }} />
              <col />
              <col style={{ width: 130 }} />
            </colgroup>
            {i === 0 && (
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
                <td className="c num">{i === 0 ? "1" : ""}</td>
                <td
                  className="rich-out leading-[1.68]"
                  /* เนื้อหาผ่านการล้างแท็กแล้วตอนวางและตอนบันทึก */
                  dangerouslySetInnerHTML={{ __html: page }}
                />
                <td className="r num">{i === 0 ? baht(t.gross) : ""}</td>
              </tr>
            </tbody>
          </table>

          {i === pages.length - 1 && <PaperFoot doc={doc} />}
          {pages.length > 1 && (
            <span className="sheet-no">
              หน้า {i + 1} / {pages.length}
            </span>
          )}
        </article>
      ))}
    </>
  );
}

function PaperHead({ doc }: { doc: PaperDoc }) {
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
  const t = doc.totals;
  const info = issuerInfo(doc.issuer);

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
          <div className="text-center">
            <b className="mb-[34px] block text-xs font-semibold">ผู้เสนอราคา</b>
            <span className="block h-px bg-[#8a9099]" />
          </div>
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

