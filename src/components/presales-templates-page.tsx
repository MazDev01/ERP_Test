"use client";

/*
 * คลังเทมเพลต — ทีมก่อนการขาย (บทบาท ps) · หน้า /presales-templates
 *
 * ยังไม่มีไฟล์ต้นแบบของหน้านี้ ผู้ใช้สั่งให้ทำก่อน จึงยึดหน้าตาตามหน้าพี่น้อง
 * (งานก่อนการขาย · แดชบอร์ด) — แถบหัวหน้า · แผงกระจก · แท็บ · ตารางที่คลี่เป็นการ์ดบนมือถือ
 *
 *   กรองด้วยดรอปดาวน์ประเภทบริการ + ช่องค้นหา · แท็บแยกชนิด (ไฟล์ PDF · Canva · ลิงก์)
 *   เพิ่ม/แก้ไขในหน้าต่างเดียวกัน · ลบต้องยืนยันสั้น ๆ ก่อน
 *   เทมเพลตถูกเลือกไปแนบในหน้าส่งงาน (presales-work) แล้วนับจำนวนครั้งที่ใช้ให้เอง
 */

import { useState } from "react";
import { thaiDate } from "@/lib/format";
import { serviceLabel, services } from "@/lib/pm-data";
import { PS_ME as ME } from "@/lib/presales-work";
import {
  addTemplate,
  linkKind,
  removeTemplate,
  updateTemplate,
  useTemplates,
  type PresalesTemplate,
  type TemplateKind,
} from "@/lib/presales-templates";
import { ConfirmDialog } from "./confirm-dialog";
import { FileDrop, type PickedFile } from "./file-drop";
import { PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { SearchBox } from "./sales-ui";

type Tab = "all" | TemplateKind;

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "pdf", label: "ไฟล์ PDF" },
  { key: "canva", label: "Canva" },
  { key: "link", label: "ลิงก์" },
];

const KIND_LABEL: Record<TemplateKind, string> = { pdf: "ไฟล์ PDF", canva: "ลิงก์ Canva", link: "ลิงก์" };

/** ป้ายชนิด — สีเดียวกับป้ายเอกสารในหน้าข้อเสนอ (proposal-doc: ลิงก์สีเขียวน้ำทะเล · ไฟล์สีแดง) */
export function TemplateKindTag({ kind }: { kind: TemplateKind }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-px text-[10.5px] font-bold whitespace-nowrap ${
        kind === "pdf" ? "bg-[var(--destructive-soft)] text-destructive" : "bg-[#e7fbfc] text-[#0b8f95]"
      }`}
    >
      {KIND_LABEL[kind]}
    </span>
  );
}

export function PresalesTemplatesPage() {
  const list = useTemplates();
  const [query, setQuery] = useState("");
  const [service, setService] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  /* หน้าต่างเพิ่ม/แก้ไข — "new" = เพิ่มใหม่ · อื่น ๆ = รหัสเทมเพลตที่แก้ */
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<PresalesTemplate | null>(null);

  /* กรองด้วยบริการกับคำค้นก่อน แล้วค่อยแบ่งแท็บ ตัวเลขบนแท็บจะได้ตรงกับที่กรองอยู่ */
  const q = query.trim().toLowerCase();
  const filtered = list
    .filter((t) => !service || t.service === service)
    .filter((t) => !q || `${t.name} ${t.note} ${t.file} ${serviceLabel(t.service)}`.toLowerCase().includes(q))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const countOf = (k: Tab) => (k === "all" ? filtered.length : filtered.filter((t) => t.kind === k).length);
  const rows = tab === "all" ? filtered : filtered.filter((t) => t.kind === tab);
  const current = editing && editing !== "new" ? list.find((t) => t.id === editing) : undefined;

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>คลังเทมเพลต</h1>
          <p>เทมเพลตข้อเสนอที่ใช้ซ้ำได้ {list.length} รายการ</p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto sm:flex-nowrap">
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            aria-label="กรองตามบริการ"
            className="field-control h-10 w-full cursor-pointer text-[13.5px] sm:!w-[190px]"
          >
            <option value="">ทุกบริการ</option>
            {services().map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาชื่อเทมเพลตหรือหมายเหตุ" />
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="btn solid btn-solid btn-block-mobile shrink-0"
          >
            <PlusIcon className="size-[15px]" strokeWidth={2.2} />
            เพิ่มเทมเพลต
          </button>
        </div>
      </div>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={tab === t.key ? "on" : ""}
                onClick={() => setTab(t.key)}
              >
                {t.label} <b>{countOf(t.key)}</b>
              </button>
            ))}
          </div>
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto">
          <table className="data-table cards-sm">
            <thead>
              <tr>
                <th className="min-w-[240px]">ชื่อเทมเพลต</th>
                <th style={{ width: 150 }}>บริการ</th>
                <th style={{ width: 110 }}>ชนิด</th>
                <th className="max-[1000px]:hidden" style={{ width: 80 }}>
                  ใช้แล้ว
                </th>
                <th style={{ width: 150 }}>แก้ล่าสุด</th>
                <th style={{ width: 196 }} aria-label="จัดการ" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-7 text-center text-muted-foreground">
                    {list.length === 0 ? "ยังไม่มีเทมเพลต กด “เพิ่มเทมเพลต” เพื่อเริ่ม" : "ไม่พบเทมเพลตที่ตรงกับที่ค้นหา"}
                  </td>
                </tr>
              ) : (
                rows.map((t) => (
                  <tr key={t.id}>
                    <td className="min-w-[240px] max-sm:!block max-sm:!text-left max-sm:[&>*]:!text-left">
                      <b className="font-semibold break-words">{t.name}</b>
                      <span className="why">{t.note || (t.url ? t.url : t.file)}</span>
                    </td>
                    <td data-label="บริการ">
                      <span>{serviceLabel(t.service)}</span>
                    </td>
                    <td data-label="ชนิด">
                      <span>
                        <TemplateKindTag kind={t.kind} />
                      </span>
                    </td>
                    <td data-label="ใช้แล้ว" className="num max-[1000px]:hidden">
                      <span>{t.uses} ครั้ง</span>
                    </td>
                    <td data-label="แก้ล่าสุด">
                      <span className="flex flex-col">
                        <span className="num">{thaiDate(t.updatedAt)}</span>
                        <span className="text-[12px] text-muted-foreground">{t.uploadedBy}</span>
                      </span>
                    </td>
                    <td className="max-sm:!justify-end">
                      {/* มือถือ — ปุ่มสามปุ่มแบ่งเต็มแถวของการ์ด สูงพอให้นิ้วกด */}
                      <span className="flex flex-wrap justify-end gap-1.5 max-sm:grid max-sm:w-full max-sm:grid-cols-3 max-sm:gap-2 max-sm:[&>*]:h-10! max-sm:[&>*]:justify-center max-sm:[&>*]:text-[13px]!">
                        {t.url ? (
                          <a
                            href={t.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn glass-thin btn-mini"
                          >
                            เปิด
                          </a>
                        ) : (
                          /* ยังไม่มีที่เก็บไฟล์จริง — เปิดไฟล์ได้เมื่อต่อ backend แล้ว */
                          <button
                            type="button"
                            className="btn glass-thin btn-mini opacity-50"
                            disabled
                            title="ยังเปิดไฟล์ไม่ได้ จนกว่าจะต่อที่เก็บไฟล์"
                          >
                            เปิด
                          </button>
                        )}
                        <button type="button" className="btn glass-thin btn-mini" onClick={() => setEditing(t.id)}>
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="btn glass-thin btn-mini hover:!border-destructive hover:!text-destructive"
                          onClick={() => setRemoving(t)}
                        >
                          ลบ
                        </button>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {editing && (
        <TemplateDialog key={editing} template={current} onClose={() => setEditing(null)} />
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title="ลบเทมเพลตนี้?"
        description="ลบแล้วเลือกไปแนบในข้อเสนอไม่ได้อีก ข้อเสนอที่ส่งไปแล้วไม่เปลี่ยน"
        detail={removing?.name}
        confirmLabel="ลบ"
        tone="destructive"
        onConfirm={() => {
          if (removing) removeTemplate(removing.id);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/** หน้าต่างเพิ่ม/แก้ไขเทมเพลต — ไฟล์หรือลิงก์ได้ทีละหนึ่งรายการ แนบใหม่แทนของเดิมเลย */
function TemplateDialog({ template: t, onClose }: { template?: PresalesTemplate; onClose: () => void }) {
  const [name, setName] = useState(t?.name ?? "");
  const [service, setService] = useState(t?.service ?? "");
  const [files, setFiles] = useState<PickedFile[]>(() =>
    t ? [{ id: `cur-${t.id}`, name: t.url ?? t.file, size: t.size ?? 0, url: t.url }] : [],
  );
  const [note, setNote] = useState(t?.note ?? "");
  /* ขึ้นข้อความเตือนหลังกดบันทึกครั้งแรก ไม่ใช่ตั้งแต่เปิดหน้าต่าง */
  const [touched, setTouched] = useState(false);

  const problems = {
    name: !name.trim(),
    service: !service,
    file: files.length === 0,
  };

  function save() {
    setTouched(true);
    if (problems.name || problems.service || problems.file) return;
    const f = files[0];
    const input = {
      name: name.trim(),
      service,
      kind: f.url ? linkKind(f.url) : ("pdf" as const),
      file: f.name,
      url: f.url,
      size: f.url ? undefined : f.size,
      note: note.trim(),
    };
    if (t) updateTemplate(t.id, input);
    else addTemplate(input, ME.name);
    onClose();
  }

  const err = "mt-1.5 text-[12.5px] text-destructive";
  const lb = "mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";

  return (
    <Sheet
      title={t ? "แก้ไขเทมเพลต" : "เพิ่มเทมเพลต"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid flex-1 justify-center sm:flex-none" onClick={save}>
            {t ? "บันทึก" : "เพิ่มเทมเพลต"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="tpl-name" className={lb}>
            ชื่อเทมเพลต <span className="text-destructive">*</span>
          </label>
          <input
            id="tpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น ข้อเสนอแผนธุรกิจ SME ฉบับมาตรฐาน"
            className="field-control"
            aria-invalid={touched && problems.name}
          />
          {touched && problems.name && <p className={err}>ตั้งชื่อเทมเพลต</p>}
        </div>

        <div>
          <label htmlFor="tpl-service" className={lb}>
            บริการ <span className="text-destructive">*</span>
          </label>
          <select
            id="tpl-service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="field-control cursor-pointer"
            aria-invalid={touched && problems.service}
          >
            <option value="">— เลือกบริการ —</option>
            {services().map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
          {touched && problems.service && <p className={err}>เลือกบริการที่ใช้เทมเพลตนี้</p>}
        </div>

        <div>
          <p className={lb}>
            ไฟล์หรือลิงก์ <span className="text-destructive">*</span>
          </p>
          <FileDrop
            files={files}
            /* เก็บรายการล่าสุดรายการเดียว — แนบใหม่ = แทนของเดิม */
            onChange={(next) => setFiles(next.slice(-1))}
            title="ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์"
            hint="ไฟล์ PDF หนึ่งไฟล์ หรือวางลิงก์ Canva แทนก็ได้"
            label="เลือกไฟล์เทมเพลต"
            accept=".pdf,application/pdf"
            links
            linkPlaceholder="หรือวางลิงก์ เช่น Canva, Google Slides"
          />
          {touched && problems.file && <p className={err}>แนบไฟล์หรือลิงก์ของเทมเพลต</p>}
        </div>

        <div>
          <label htmlFor="tpl-note" className={lb}>
            หมายเหตุ
          </label>
          <textarea
            id="tpl-note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ใช้กับลูกค้าแบบไหน ต้องแก้ส่วนใดก่อนส่ง (ไม่บังคับ)"
            className="field-control resize-y py-2.5 leading-relaxed"
          />
        </div>
      </div>
    </Sheet>
  );
}
