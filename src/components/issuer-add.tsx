"use client";

/*
 * เพิ่มผู้ออกเอกสารจากกล่องสร้างใบเสนอราคา (ตัวเลือก "＋ เพิ่มผู้ออกเอกสารใหม่…" ในดรอปดาวน์ "ออกในนาม")
 * กรอกเฉพาะที่ต้องใช้พิมพ์หัวกระดาษ — ผู้ดูแลระบบแก้รายละเอียดที่เหลือได้ที่ /admin/company
 * ที่เก็บเดียวกับหน้าข้อมูลบริษัท (settings().issuers) และลงประวัติการตั้งค่า
 */

import { useState } from "react";
import { issuers } from "@/lib/crm-data";
import { logChange } from "@/lib/admin-log";
import { saveSection, type Issuer } from "@/lib/system-settings";
import { Field, Sheet } from "./lead-dialogs";

export function IssuerAddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (code: string) => void }) {
  const list = issuers();
  const base = list[0];
  const [code, setCode] = useState(() => {
    let n = list.length;
    let c = `B${n}`;
    while (list.some((x) => x.code === c)) c = `B${++n}`;
    return c;
  });
  const [name, setName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [address, setAddress] = useState("");
  const [vat, setVat] = useState(true);
  const [sameBank, setSameBank] = useState(true);
  const [bankName, setBankName] = useState("");
  const [bankAccountName, setBankAccountName] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [tried, setTried] = useState(false);

  const problem = !/^[A-Z0-9]{1,6}$/.test(code)
    ? "รหัสต้องเป็นอังกฤษตัวใหญ่หรือตัวเลข 1–6 ตัว"
    : list.some((x) => x.code === code)
      ? `มีรหัส ${code} อยู่แล้ว`
      : !name.trim()
        ? "ระบุชื่อบนเอกสาร"
        : taxId.trim() && !/^\d{13}$/.test(taxId.trim())
          ? "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก"
          : !sameBank && !bankAccountNo.trim()
            ? "ระบุเลขที่บัญชีรับเงิน"
            : "";

  function save() {
    setTried(true);
    if (problem) return;
    const issuer: Issuer = {
      code,
      label: `${name.trim()} (${code})`,
      name: name.trim(),
      taxId: taxId.trim(),
      address: address.trim(),
      phone: base?.phone ?? "",
      email: base?.email ?? "",
      bankName: sameBank ? (base?.bankName ?? "") : bankName.trim(),
      bankAccountName: sameBank ? (base?.bankAccountName ?? "") : bankAccountName.trim(),
      bankAccountNo: sameBank ? (base?.bankAccountNo ?? "") : bankAccountNo.trim(),
      vat,
      prefix: code,
    };
    saveSection("issuers", [...list, issuer]);
    logChange("ข้อมูลบริษัท", `เพิ่มผู้ออกเอกสาร ${code} ${issuer.name} (จากหน้างาน)`);
    onAdded(code);
  }

  return (
    <Sheet
      title="เพิ่มผู้ออกเอกสาร"
      mid
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            เพิ่มและเลือก
          </button>
        </>
      }
    >
      <div className="grid gap-x-4 sm:grid-cols-[120px_minmax(0,1fr)]">
        <Field label="รหัส" required hint="ใช้เป็นตัวนำหน้าเลขใบเสนอราคาด้วย">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
            className="field-control num"
          />
        </Field>
        <Field label="ชื่อบนเอกสาร" required>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" className="field-control" />
        </Field>
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <Field label="เลขประจำตัวผู้เสียภาษี">
          <input value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, "").slice(0, 13))} inputMode="numeric" className="field-control num" />
        </Field>
        <Field label="ภาษีมูลค่าเพิ่ม">
          <label className="flex h-10 cursor-pointer items-center gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={vat} onChange={(e) => setVat(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            จดทะเบียนภาษีมูลค่าเพิ่ม
          </label>
        </Field>
      </div>
      <Field label="ที่อยู่">
        <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className="field-control w-full py-2 leading-relaxed" />
      </Field>
      <label className="mb-3 flex cursor-pointer items-center gap-2.5 text-[13.5px]">
        <input type="checkbox" checked={sameBank} onChange={(e) => setSameBank(e.target.checked)} className="size-4 accent-[var(--primary)]" />
        ใช้บัญชีรับเงินเดียวกับ {base?.code ?? "บริษัทหลัก"}
      </label>
      {!sameBank && (
        <div className="grid gap-x-4 sm:grid-cols-3">
          <Field label="ธนาคาร">
            <input value={bankName} onChange={(e) => setBankName(e.target.value)} className="field-control" />
          </Field>
          <Field label="ชื่อบัญชี">
            <input value={bankAccountName} onChange={(e) => setBankAccountName(e.target.value)} className="field-control" />
          </Field>
          <Field label="เลขที่บัญชี" required>
            <input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} className="field-control num" />
          </Field>
        </div>
      )}
      {tried && problem && (
        <p className="mt-1 rounded-[11px] border border-[rgba(192,18,31,.2)] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] text-destructive">
          {problem}
        </p>
      )}
      <p className="mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        ผู้ดูแลระบบแก้รายละเอียดอื่น (โทร อีเมล เอกสารแนบ) ได้ที่หน้า “ข้อมูลบริษัท”
      </p>
    </Sheet>
  );
}
