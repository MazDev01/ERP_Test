"use client";

/*
 * เลขที่เอกสาร — ตัวนำหน้าของเลขที่เอกสารแต่ละชนิด (crm-store.ts / acc-store.ts)
 *
 * แก้ได้เฉพาะตัวนำหน้า ส่วนปีและลำดับระบบออกให้เอง กันเลขซ้ำ
 * เปลี่ยนตัวนำหน้าแล้วเลขลำดับเริ่มนับ 1 ใหม่ของตัวนำหน้าใหม่ · เอกสารที่ออกเลขไปแล้วไม่เปลี่ยนเลข
 */

import { bkkNow } from "@/lib/format";
import type { DocPrefixes } from "@/lib/system-settings";
import { AdminHead, Card, SaveBar, useSectionDraft } from "./admin-ui";

type Row = { key: keyof DocPrefixes; label: string; sample: (p: string) => string; who: string };

function rows(): Row[] {
  const d = bkkNow();
  const be = d.getFullYear() + 543;
  /* ต้องตรงกับเลขที่ระบบออกจริง — รหัสผู้สนใจใช้ปีไทยสองหลัก (nextLeadCode)
     ส่วนเอกสารที่เหลือใช้ปีไทยเต็มสี่หลัก (nextDocNo) ตัวอย่างที่นี่เคยเขียนเป็นปี ค.ศ. ไม่ตรงกับของจริง */
  const be2 = String(be).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return [
    { key: "lead", label: "รหัสผู้สนใจ", who: "ฝ่ายขาย", sample: (p) => `${p}-${be2}${mm}-001` },
    { key: "presales", label: "คำขอก่อนการขาย", who: "ฝ่ายขาย", sample: (p) => `${p}-${be}-0001` },
    { key: "deal", label: "ดีล", who: "ฝ่ายขาย · บัญชี", sample: (p) => `${p}-${be}-0001` },
    { key: "jobOrder", label: "ใบงาน", who: "ฝ่ายขาย", sample: (p) => `${p}-${be}-0001` },
    { key: "invoice", label: "ใบแจ้งหนี้", who: "บัญชี", sample: (p) => `${p}-${be}-0001` },
    { key: "receipt", label: "ใบเสร็จ", who: "บัญชี", sample: (p) => `${p}-${be}-0001` },
    /* โปรเจคมีเลขของตัวเอง ผูกกับวางบิลงวดแรก ไม่ใช่เลขดีล (ผู้ใช้สั่ง 5 ต.ค. 2569) */
    { key: "project", label: "โปรเจค", who: "PM", sample: (p) => `${p}-${be}-0001` },
    /* ไม่มีใบลดหนี้ ใบเพิ่มหนี้ และคืนเงิน — เอกสารสามชนิดนี้พักไว้ (เจ้าของระบบสั่ง 24 ก.ย. 2569) */
  ];
}

const LABELS = Object.fromEntries(rows().map((r) => [r.key, r.label])) as Record<keyof DocPrefixes, string>;

function describe(a: DocPrefixes, b: DocPrefixes) {
  return (Object.keys(LABELS) as (keyof DocPrefixes)[])
    .filter((k) => a[k] !== b[k])
    .map((k) => `${LABELS[k]} ${a[k]} → ${b[k]}`);
}

function problem(p: DocPrefixes) {
  const values = Object.values(p);
  if (values.some((v) => !/^[A-Z0-9]{1,6}$/.test(v))) return "ตัวนำหน้าใช้ตัวอักษรภาษาอังกฤษพิมพ์ใหญ่หรือตัวเลข 1–6 ตัว";
  const seen = new Set<string>();
  for (const v of values) {
    if (seen.has(v)) return `ตัวนำหน้า ${v} ซ้ำกัน — เลขเอกสารคนละชนิดจะแยกไม่ออก`;
    seen.add(v);
  }
  return "";
}

export function AdminDocNumbersPage() {
  const d = useSectionDraft("docs", "เลขที่เอกสาร", describe);
  const list = rows();
  const prefixInput = (r: (typeof list)[number], cls: string) => (
    <input
      value={d.draft[r.key]}
      aria-label={`ตัวนำหน้า${r.label}`}
      maxLength={6}
      onChange={(e) => d.setDraft({ ...d.draft, [r.key]: e.target.value.toUpperCase().trim() })}
      className={`field-control num w-full uppercase ${cls} ${d.draft[r.key] !== d.saved[r.key] ? "border-primary" : ""}`}
    />
  );

  return (
    <div className="space-y-4">
      <AdminHead title="เลขที่เอกสาร" desc="ตัวนำหน้าของเลขที่เอกสารแต่ละชนิด ปีและลำดับระบบออกให้เองเพื่อกันเลขซ้ำ" />

      <Card title="ตัวนำหน้า" note="เปลี่ยนแล้วเลขลำดับของตัวนำหน้าใหม่เริ่มนับ 1 · เอกสารที่ออกเลขไปแล้วคงเลขเดิม · เลขใบเสนอราคาตั้งแยกตามผู้ออกเอกสารที่หน้าข้อมูลบริษัท">
        {/* มือถือ: แถวละเอกสาร ชื่อกับตัวอย่างเลขอยู่ซ้าย ช่องตัวนำหน้าอยู่ขวา */}
        <ul className="divide-y divide-border rounded-[14px] border border-border bg-card sm:hidden">
          {list.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-3.5 py-3">
              <span className="min-w-0 flex-1">
                <b className="block text-[14px] font-semibold">{r.label}</b>
                <span className="block text-[12px] text-muted-foreground">{r.who}</span>
                <span className="num mt-0.5 block text-[12.5px] text-muted-foreground">
                  ถัดไป {r.sample(d.draft[r.key] || "—")}
                </span>
              </span>
              <span className="w-[104px] flex-none">{prefixInput(r, "!h-11 !text-[16px] text-center")}</span>
            </li>
          ))}
        </ul>
        <div className="hidden overflow-x-auto sm:block">
          <table className="data-table cards-sm min-w-[640px]">
            <thead>
              <tr>
                <th>เอกสาร</th>
                <th style={{ width: 150 }}>ตัวนำหน้า</th>
                <th style={{ width: 210 }}>ตัวอย่างเลขถัดไป</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.key}>
                  <td data-label="เอกสาร">
                    <b className="font-semibold">{r.label}</b>
                    <span className="why">{r.who}</span>
                  </td>
                  <td data-label="ตัวนำหน้า">
                    {prefixInput(r, "h-9 text-[14px]")}
                  </td>
                  <td data-label="ตัวอย่างเลขถัดไป" className="num muted">
                    {r.sample(d.draft[r.key] || "—")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <SaveBar dirty={d.dirty} isDefault={d.isDefault} invalid={problem(d.draft)} onSave={d.save} onCancel={d.cancel} onDefault={d.toDefault} />
    </div>
  );
}
