"use client";

/*
 * เอกสารที่ PM เปิดดูก่อนวางแผน — ใบเสนอราคาและ Proposal
 * เป็นสำเนาอ่านอย่างเดียว ไม่ใช่ตัวจริงที่ฝ่ายขายแก้ได้ จึงคิดยอดจากยอดสุทธิย้อนกลับ
 */

import { quotationTotals } from "@/lib/crm-data";
import { NO_WHT_NOTE } from "@/lib/acc-data";
import { issuerInfo } from "./quotation-paper";
import { useCrm } from "@/lib/crm-store";
import { baht, thaiDate } from "@/lib/format";
import { roleLabel, type InboxJob } from "@/lib/pm-data";


export function QuotationPreview({ job }: { job: InboxJob }) {
  /* หัวกระดาษและยอดทุกบรรทัดมาจากใบเสนอราคาตัวจริงของงานนี้ */
  const crm = useCrm();
  const quotation = crm.quotations.find((q) => q.no === job.quo);
  const info = issuerInfo(quotation?.issuer);
  /*
   * ห้ามคิดภาษีย้อนกลับจากยอดสุทธิเอง — ลูกค้าบางรายไม่ถูกหักภาษี ณ ที่จ่าย
   * และงานบางประเภทใช้อัตราอื่น เดาแล้วยอดจะไม่ตรงกับใบแจ้งหนี้ของฝ่ายบัญชี
   * หาใบเสนอราคาไม่เจอ (ข้อมูลเก่า) ให้ขึ้นแต่ยอดรวมที่บัญชีส่งมา ไม่แตกบรรทัดภาษีเดา ๆ
   */
  const t = quotation ? quotationTotals(quotation) : null;
  return (
    <article className="paper-lite">
      <header className="flex items-start justify-between gap-5 border-b-2 border-primary pb-4">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maz-logo.png" alt="MAZ" className="h-[30px] w-auto" />
          <p className="mt-1 text-[9px] font-semibold tracking-[0.12em] text-muted-foreground">
            DIGITAL BUSINESS SOLUTION
          </p>
        </div>
        <div className="text-right">
          <h3 className="text-[17px] font-extrabold tracking-[0.04em]">ใบเสนอราคา / QUOTATION</h3>
          <p className="num mt-0.5 text-[13px] font-bold text-primary">{job.quo}</p>
          <p className="mt-1 flex justify-end gap-3.5 text-xs text-muted-foreground">
            <span>วันที่ {thaiDate(job.quoDate)}</span>
            <span>กำหนดยืนเวลา {job.validDays} วัน</span>
          </p>
        </div>
      </header>

      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[13px] font-bold">{info.name}</p>
          <p className="text-xs leading-[1.75] text-muted-foreground">
            เลขประจำตัวผู้เสียภาษี : {info.taxId}
            <br />
            โทร. {info.phone}
          </p>
        </div>
        <div>
          <p className="text-[13px] font-bold">{job.cus}</p>
          <p className="text-xs leading-[1.75] text-muted-foreground">
            เลขประจำตัวผู้เสียภาษี : {job.taxId}
            <br />
            ผู้ติดต่อ : {job.contact} · {job.phone}
            <br />
            {job.address}
          </p>
        </div>
      </div>

      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr>
            <th className="w-16 border-b border-border px-1.5 py-2 text-center text-xs font-semibold text-muted-foreground">
              ลำดับที่
            </th>
            <th className="border-b border-border px-1.5 py-2 text-left text-xs font-semibold text-muted-foreground">
              รายการ
            </th>
            <th className="w-[130px] border-b border-border px-1.5 py-2 text-right text-xs font-semibold text-muted-foreground">
              รวม
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="num px-1.5 py-3 text-center align-top text-[13px]">1</td>
            <td className="px-1.5 py-3 align-top text-[13px]">
              <b className="font-bold">{job.scope}</b>
              <ul className="mt-1.5 list-disc pl-[18px] text-[12.5px] leading-[1.8] text-muted-foreground">
                {job.items.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </td>
            {/* ช่องรวมของรายการคือราคาก่อนภาษี ภาษีอยู่บรรทัดของมันเองด้านล่าง */}
            <td className="num px-1.5 py-3 text-right align-top text-[13px]">{baht(t ? t.base : job.net)}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3.5 flex justify-end">
        <div className="w-[290px]">
          {t && (
            <>
              <Line label="รวมสุทธิก่อนภาษี" value={baht(t.base)} />
              <Line
                label={t.vatRate ? `ภาษีมูลค่าเพิ่ม ${t.vatRate}%` : "ภาษีมูลค่าเพิ่ม (ไม่คิด)"}
                value={baht(t.vat)}
              />
            </>
          )}
          {/* ไม่หักก็ต้องเขียนว่าไม่หัก ไม่ใช่ซ่อนบรรทัดแล้วปล่อยให้เดาเอง */}
          {t && t.whtPct > 0 ? (
            <Line label={`ภาษี ณ ที่จ่าย ${t.whtPct}%`} value={`-${baht(t.whtAmount)}`} minus />
          ) : (
            <Line label="ภาษี ณ ที่จ่าย" value={NO_WHT_NOTE} />
          )}
          <div className="mt-1.5 flex justify-between gap-3.5 border-t-2 border-primary pt-2.5 text-sm font-bold">
            <span>รวมทั้งสิ้น</span>
            <b className="num text-base text-primary">{baht(t ? t.grand : job.net)}</b>
          </div>
        </div>
      </div>

      <div className="mt-4 border-t border-border pt-3.5">
        <h4 className="text-xs font-bold text-muted-foreground">เงื่อนไขการชำระเงิน</h4>
        <p className="mt-1 text-[12.5px]">{job.terms}</p>
      </div>

      <p className="mt-3.5 rounded-[11px] bg-[var(--success-soft)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--success)]">
        ลูกค้าชำระงวดแรกแล้วเมื่อ {thaiDate(job.paidAt)} · แบ่งชำระ {job.seqs} งวด
      </p>
    </article>
  );
}

/**
 * ข้อเสนอสองแบบตามต้นแบบของแต่ละหน้า
 *   inbox  ตามต้นแบบ pm-inbox.html — "โดย …" อยู่ที่หัวเอกสาร ท้ายเป็นระยะเวลารวม จำนวนวัน เอกสารแนบ
 *          (หมายเหตุของข้อเสนอ หน้ากล่องงานเข้าแสดงต่อท้ายเอง)
 *   plan   ตามต้นแบบ pm-plan.html — มีช่องจัดทำโดย/เสนอต่อ ท้ายเป็นมูลค่างาน ชั่วโมงที่ใช้จัดทำ เอกสารแนบ
 */
export function ProposalPreview({ job, variant = "plan" }: { job: InboxJob; variant?: "inbox" | "plan" }) {
  /* งานเดี่ยวไม่มีข้อเสนอ จึงไม่มีเอกสารให้เปิด (ดู isSolo ใน pm-data) */
  const pr = job.proposal;
  if (!pr) return null;
  const inbox = variant === "inbox";
  return (
    <article className="paper-lite">
      <header className="flex items-start justify-between gap-5 border-b-2 border-primary pb-3.5">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maz-logo.png" alt="MAZ" className="h-[28px] w-auto" />
          <p className="mt-1 text-[8.5px] font-semibold tracking-[0.12em] text-muted-foreground">
            DIGITAL BUSINESS SOLUTION
          </p>
        </div>
        <div className="text-right">
          <h3 className="text-base font-extrabold tracking-[0.04em]">ข้อเสนอโครงการ / PROPOSAL</h3>
          <p className="num mt-0.5 text-[12.5px] font-bold text-primary">
            {pr.no} · รอบที่ {pr.round}
          </p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            จัดทำเมื่อ {thaiDate(pr.at)}
            {inbox && <em className="ml-2 not-italic">โดย {pr.by}</em>}
          </p>
        </div>
      </header>

      {!inbox && (
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[10.5px] font-bold text-muted-foreground">จัดทำโดย</p>
          <p className="text-[13px] font-bold">{pr.by}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold text-muted-foreground">เสนอต่อ</p>
          <p className="text-[13px] font-bold">{job.cus}</p>
        </div>
      </div>
      )}

      <p className="mt-4 text-[10.5px] font-bold text-muted-foreground">
        {inbox ? "แผนงานตามข้อเสนอที่ลูกค้าตกลงแล้ว" : "แผนงานตามข้อเสนอ"}
      </p>
      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr>
            <th className="border-b border-border px-1.5 py-2 text-left text-xs font-semibold text-muted-foreground">
              เฟส
            </th>
            <th className="w-[110px] border-b border-border px-1.5 py-2 text-left text-xs font-semibold text-muted-foreground">
              ตำแหน่ง
            </th>
            <th className="w-[190px] border-b border-border px-1.5 py-2 text-left text-xs font-semibold text-muted-foreground">
              ช่วงเวลา
            </th>
            <th className="w-[70px] border-b border-border px-1.5 py-2 text-center text-xs font-semibold text-muted-foreground">
              งานย่อย
            </th>
          </tr>
        </thead>
        <tbody>
          {job.phases.map((ph) => (
            <tr key={ph.name}>
              <td className="px-1.5 py-2.5 align-top text-[12.5px]">{ph.name}</td>
              <td className="px-1.5 py-2.5 align-top text-[12.5px]">{roleLabel(ph.role)}</td>
              <td className="num px-1.5 py-2.5 align-top text-[12.5px]">
                {thaiDate(ph.start)} – {thaiDate(ph.end)}
              </td>
              <td className="num px-1.5 py-2.5 text-center align-top text-[12.5px]">
                {ph.tasks.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {inbox ? (
        <>
          <div className="mt-4 grid gap-4 border-t border-border pt-3.5 sm:grid-cols-3">
            <Fact label="ระยะเวลารวม" value={`${thaiDate(job.planStart)} – ${thaiDate(job.planEnd)}`} />
            <Fact label="จำนวนวัน" value={`${job.durationDays} วัน`} />
            <Fact
              label="เอกสารแนบ"
              value={pr.file}
              tag={pr.kind === "canva" ? "ลิงก์ Canva" : "ไฟล์ PDF"}
            />
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-4 border-t border-border pt-3.5 sm:grid-cols-3">
            <Fact label="มูลค่างาน" value={`${baht(job.net)} บาท`} />
            <Fact label="ชั่วโมงที่ใช้จัดทำ" value={`${pr.hours} ชม.`} />
            <Fact
              label="เอกสารแนบ"
              value={pr.file}
              tag={pr.kind === "canva" ? "ลิงก์ Canva" : "ไฟล์ PDF"}
            />
          </div>

          <p className="mt-4 rounded-[11px] bg-[var(--success-soft)] px-3.5 py-2.5 text-[12.5px] font-semibold text-[var(--success)]">
            ระยะเวลารวม {thaiDate(job.planStart)} – {thaiDate(job.planEnd)} · {job.durationDays} วัน
          </p>
        </>
      )}
    </article>
  );
}

function Line({ label, value, minus }: { label: string; value: string; minus?: boolean }) {
  return (
    <div className="flex justify-between gap-3.5 py-1 text-[12.5px] text-muted-foreground">
      <span>{label}</span>
      <b className={`num font-semibold ${minus ? "text-destructive" : "text-foreground"}`}>
        {value}
      </b>
    </div>
  );
}

function Fact({ label, value, tag }: { label: string; value: string; tag?: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-[13.5px] font-semibold break-words">
        {value}
        {tag && (
          <span className="ml-2 inline-block rounded-[20px] bg-accent px-2 py-px text-[10.5px] font-bold text-primary">
            {tag}
          </span>
        )}
      </p>
    </div>
  );
}
