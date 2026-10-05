"use client";

/*
 * เอกสารข้อเสนอที่ทีมก่อนการขายส่งกลับ (ตามต้นแบบ presales.html · กล่อง "เอกสารข้อเสนอ")
 *
 * ยังไม่มี storage ไฟล์จริง จึงสร้างหน้าเอกสารจากข้อมูลคำขอกับรอบนั้นแทน
 * ปุ่มดาวน์โหลดสั่งพิมพ์เฉพาะแผ่นเอกสาร (.print-doc ใน globals.css) ให้บันทึกเป็น PDF
 * TODO: ต่อ backend แล้วให้ดาวน์โหลดไฟล์จริงจาก presales_attachment.file_path
 */

import type { PresalesRequest, PresalesRound } from "@/lib/crm-data";
import { thaiDate } from "@/lib/format";
import { DownloadIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

/** ข้อเสนอแบบ Canva เปิดลิงก์ไปเลย ไม่มีหน้าเอกสารในระบบ */
export function isCanva(r: PresalesRound) {
  return r.kind === "canva" && Boolean(r.url);
}

export function ProposalDialog({
  request,
  round,
  customerName,
  onClose,
}: {
  request: PresalesRequest;
  round: PresalesRound;
  customerName: string;
  onClose: () => void;
}) {
  return (
    <Sheet
      title={`ข้อเสนอ ${request.no} รอบ ${round.round}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn solid btn-solid" onClick={printDoc}>
            <DownloadIcon className="size-[15px]" strokeWidth={2.1} />
            ดาวน์โหลด PDF
          </button>
        </>
      }
    >
      <article className="paper-lite">
        <header className="flex justify-between gap-5 border-b-2 border-primary pb-3.5">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/maz-logo.png" alt="MAZ" className="h-[28px] w-auto" />
            <p className="mt-1 text-[8.5px] font-semibold tracking-[0.12em] text-muted-foreground">
              DIGITAL BUSINESS SOLUTION
            </p>
          </div>
          <div className="text-right">
            <h3 className="text-[16px] font-extrabold tracking-[0.04em]">ข้อเสนอโครงการ / PROPOSAL</h3>
            <p className="num mt-0.5 text-[12.5px] font-bold text-primary">{request.no}</p>
            <p className="mt-0.5 text-[12.5px] font-bold text-primary">รอบที่ {round.round}</p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">จัดทำเมื่อ {thaiDate(round.at)}</p>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-2 gap-5">
          <div>
            <Label>จัดทำโดย</Label>
            <p className="mt-1 text-[13px] font-semibold">{round.by}</p>
          </div>
          <div>
            <Label>เสนอต่อ</Label>
            <p className="mt-1 text-[13px] font-semibold">{customerName}</p>
            <p className="text-[11.5px] text-muted-foreground">{request.customerCode}</p>
          </div>
        </div>

        <div className="mt-4">
          <Label>โจทย์จากลูกค้า</Label>
          <p className="mt-1 text-[13px] leading-[1.75]">{request.problem}</p>
        </div>
        <div className="mt-4">
          <Label>สรุปข้อเสนอรอบนี้</Label>
          <p className="mt-1 text-[13px] leading-[1.75]">{round.note}</p>
        </div>

        <div className="mt-[18px] grid gap-4 border-t border-border pt-3.5 sm:grid-cols-3">
          <div>
            <Label>งบประมาณโดยประมาณ</Label>
            <p className="num mt-1 text-[15px] font-semibold">
              {request.budget ? `${request.budget.toLocaleString("en-US")} บาท` : "ยังไม่ระบุ"}
            </p>
          </div>
          <div>
            <Label>ชั่วโมงที่ใช้จัดทำ</Label>
            <p className="num mt-1 text-[15px] font-semibold">{round.hours} ชม.</p>
          </div>
          <div>
            <Label>เอกสารแนบ</Label>
            <p className="mt-1 text-[13px] font-semibold break-all">
              {round.file}
              <KindTag kind={round.kind === "canva" ? "canva" : "pdf"} className="ml-1.5" />
            </p>
          </div>
        </div>

        <p className="mt-[18px] rounded-[10px] bg-muted px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground">
          เอกสารนี้ใช้ประกอบการนำเสนอลูกค้า ราคาสุดท้ายให้ยึดตามใบเสนอราคาที่ออกจากระบบ
        </p>

        {/* เอกสารทั้งชุดของคำขอใบนี้ติดไปกับงานเองเมื่อฝ่ายบัญชีออกใบเสร็จงวดแรก ไม่ต้องเลือกทีละรายการ */}
        <div className="mt-4">
          <Label>เอกสารที่ติดไปกับงานเมื่อรับชำระงวดแรก</Label>
          <ul className="mt-1.5 grid gap-2">
            {[
              { name: round.file, from: `ข้อเสนอรอบที่ ${round.round}`, kind: (round.kind === "canva" ? "canva" : "pdf") as DocKind },
              /* ลิงก์จากลูกค้าขึ้นเป็นชื่อ "เว็บไซต์เดิมของลูกค้า" ตาม mockup (เหมือนหน้าโครงการของ PM) */
              ...request.attachments.map((a) => ({
                name: kindOf(a) === "link" ? "เว็บไซต์เดิมของลูกค้า" : a,
                from: "ไฟล์จากลูกค้า",
                kind: kindOf(a),
              })),
            ].map((d, i) => (
              <li
                key={`${d.name}-${i}`}
                className="flex items-center gap-3 rounded-xl border border-border bg-white px-3.5 py-[11px]"
              >
                <span className="min-w-0 flex-1">
                  <b className="block truncate text-[13.5px] font-semibold">{d.name}</b>
                  <em className="mt-px block text-xs text-muted-foreground not-italic">{d.from}</em>
                </span>
                <KindTag kind={d.kind} />
              </li>
            ))}
          </ul>
        </div>
      </article>
    </Sheet>
  );
}

type DocKind = "canva" | "link" | "img" | "xlsx" | "pdf";

/** ชนิดของไฟล์ที่ลูกค้าแนบมา — เดาจากนามสกุล ลิงก์ขึ้นต้นด้วย http */
function kindOf(name: string): DocKind {
  if (/^https?:\/\//i.test(name)) return "link";
  if (/\.(png|jpe?g|gif|webp)$/i.test(name)) return "img";
  if (/\.(xlsx?|csv)$/i.test(name)) return "xlsx";
  return "pdf";
}

const KIND_LABEL: Record<DocKind, string> = {
  canva: "ลิงก์ Canva",
  link: "ลิงก์",
  img: "รูปภาพ",
  xlsx: "ไฟล์ Excel",
  pdf: "ไฟล์ PDF",
};

function KindTag({ kind, className = "" }: { kind: DocKind; className?: string }) {
  const link = kind === "canva" || kind === "link";
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-px text-[10.5px] font-bold ${
        /* สีตามต้นแบบ .kindtag.cv / .pd */
        link ? "bg-[#e7fbfc] text-[#0b8f95]" : "bg-[var(--destructive-soft)] text-destructive"
      } ${className}`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] font-bold tracking-[0.02em] text-muted-foreground">{children}</p>;
}

function printDoc() {
  document.body.classList.add("print-doc");
  window.print();
  window.setTimeout(() => document.body.classList.remove("print-doc"), 400);
}
