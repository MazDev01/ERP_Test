"use client";

import { useState } from "react";
import { canBillQuotation, quotationTotals, type Quotation } from "@/lib/crm-data";
import { rejectQuotation, useCrm } from "@/lib/crm-store";
import { acceptQuotationFlow } from "@/lib/flow";
import { baht, todayIso } from "@/lib/format";
import { Sheet } from "./lead-dialogs";

/*
 * กล่องยืนยันของหน้าใบเสนอราคา ตามต้นแบบ quotations.html / quotation-view.html (.sxd-*)
 * หัวเรื่อง · รายการ "หัวข้อ — ค่า" · ปุ่มปิด กับปุ่มทำงาน
 */
function KvSheet({
  title,
  rows,
  go,
  onGo,
  onClose,
  children,
}: {
  title: string;
  rows: [string, React.ReactNode][];
  go: string;
  onGo: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  /*
   * ปุ่มยืนยันกดได้ครั้งเดียว (เจ้าของแจ้ง 25 ก.ย. 2569)
   * งานในกล่องพวกนี้ย้อนไม่ได้ เช่นออกเลขที่เอกสาร กดซ้ำระหว่างกล่องกำลังปิดจะได้เลขสองเลข
   */
  const [went, setWent] = useState(false);
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ปิด
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            disabled={went}
            onClick={() => {
              if (went) return;
              setWent(true);
              onGo();
            }}
          >
            {go}
          </button>
        </>
      }
    >
      <dl className="grid gap-2.5 text-[13.5px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="font-semibold break-words">{v}</dd>
          </div>
        ))}
      </dl>
      {children}
    </Sheet>
  );
}

/**
 * ยืนยันออกเลขที่เอกสาร — ขั้นที่ย้อนไม่ได้ จึงต้องเตือนก่อนเสมอ
 * ออกแล้วเลขนั้นเป็นของใบนี้ตลอด แก้ไขและลบไม่ได้อีก ต้องออกใบใหม่เลขใหม่แทน
 * ใช้จากหน้าสร้างใบเสนอราคา — ไม่มีร่าง (ผู้ใช้สั่ง 5 ต.ค. 2569: ไม่มีร่าง ออกแล้วแก้ไม่ได้ ต้องออกใบใหม่)
 */
export function IssueNumberDialog({
  customerName,
  issuer,
  total,
  onGo,
  onClose,
}: {
  customerName: string;
  issuer: string;
  /** ยอดรวมทั้งสิ้น (บาท) */
  total: number;
  onGo: () => void;
  onClose: () => void;
}) {
  return (
    <KvSheet
      title="ออกเลขที่เอกสาร"
      rows={[
        ["ผู้สนใจ", customerName],
        ["ออกในนาม", issuer],
        ["ยอดรวม", `${baht(total)} บาท`],
      ]}
      go="ออกเลขที่เอกสาร"
      onGo={onGo}
      onClose={onClose}
    >
      <p className="mt-4 rounded-[11px] bg-[var(--destructive-soft)] px-3.5 py-3 text-[12.5px] leading-relaxed font-semibold text-destructive">
        ออกเลขที่แล้วย้อนกลับไม่ได้ ใบนี้จะแก้ไขหรือลบไม่ได้อีก ถ้าต้องแก้ต้องออกใบใหม่เป็นเลขใหม่
        <span className="mt-1 block font-normal">
          ยังไม่พร้อมก็กดปิดเพื่อกลับไปแก้ในฟอร์มต่อ ใบนี้ยังไม่ถูกบันทึก
        </span>
      </p>
    </KvSheet>
  );
}

/**
 * ลูกค้าปฏิเสธ — กดบันทึกได้อย่างเดียว ที่เหลือระบบอนุมานเอง
 * เหตุผลเป็นข้อความอิสระตามต้นแบบ ไปขึ้นในรายงาน "เหตุผลที่ไม่ตกลง"
 */
export function RejectQuotationDialog({
  quotation,
  customerName,
  onClose,
}: {
  quotation: Quotation;
  customerName: string;
  onClose: () => void;
}) {
  const [why, setWhy] = useState("");
  const [err, setErr] = useState(false);
  return (
    <KvSheet
      title="บันทึกว่าลูกค้าปฏิเสธ"
      rows={[
        ["ใบเสนอราคา", quotation.no],
        ["ผู้สนใจ", customerName],
      ]}
      go="บันทึก"
      onGo={() => {
        if (!why.trim()) return setErr(true);
        rejectQuotation(quotation.id, why.trim());
        onClose();
      }}
      onClose={onClose}
    >
      <label htmlFor="qr-why" className="mt-4 mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        เหตุผลที่ลูกค้าไม่เอา
      </label>
      <textarea
        id="qr-why"
        autoFocus
        value={why}
        onChange={(e) => {
          setWhy(e.target.value);
          setErr(false);
        }}
        placeholder="เช่น ราคาสูงกว่าคู่แข่ง หรือเลื่อนโครงการออกไป"
        className="field-control h-[88px] resize-y py-2.5 leading-relaxed"
      />
      {err && <p className="mt-1.5 text-[12.5px] text-destructive">ใส่เหตุผลก่อนบันทึก</p>}
    </KvSheet>
  );
}

/**
 * ส่งใบเสนอราคาไปวางบิล = หลักฐานว่าลูกค้าตกลง ระบบสร้างดีลให้ตอนนั้น (acceptQuotationFlow)
 * list = จากหน้ารายการ (เตือนใบอื่นของลูกค้ารายเดียวกันที่ยังไม่ได้ส่ง) · view = จากหน้าเอกสาร
 */
export function BillQuotationDialog({
  quotation,
  customerName,
  variant = "list",
  onClose,
  onDone,
}: {
  quotation: Quotation;
  customerName: string;
  variant?: "list" | "view";
  onClose: () => void;
  onDone?: (dealNo: string) => void;
}) {
  const crm = useCrm();
  const today = todayIso();
  const total = `${baht(quotationTotals(quotation).grand)} บาท`;
  /* ลูกค้ารายเดียวกันอาจมีใบที่ยังไม่ได้ส่งหลายใบ เตือนให้เช็กก่อนว่าส่งถูกใบ */
  const others = crm.quotations.filter(
    (x) =>
      x.customerCode === quotation.customerCode &&
      x.id !== quotation.id &&
      canBillQuotation(x, crm.deals.some((d) => d.quotationNo === x.no), today),
  );
  const rows: [string, React.ReactNode][] =
    variant === "view"
      ? [
          ["ใบเสนอราคา", quotation.no],
          ["ลูกค้า", customerName],
          ["มูลค่า", total],
        ]
      : [
          ["ใบเสนอราคา", quotation.no],
          ["ผู้สนใจ", customerName],
          ["ยอดรวม", total],
        ];
  if (variant === "list" && others.length)
    rows.push([
      "ใบอื่นของลูกค้ารายนี้ที่ยังไม่ได้ส่ง",
      <>
        {others.map((x) => (
          <span key={x.id} className="block">
            {x.no} ยอด {baht(quotationTotals(x).grand)} บาท
          </span>
        ))}
      </>,
    ]);
  return (
    <KvSheet
      title={variant === "view" ? "ส่งใบเสนอราคานี้ไปวางบิล" : "ส่งใบเสนอราคาไปวางบิล"}
      rows={rows}
      go="ส่งไปวางบิล"
      onGo={() => {
        const dealNo = acceptQuotationFlow(quotation.id);
        onClose();
        if (dealNo) onDone?.(dealNo);
      }}
      onClose={onClose}
    />
  );
}
