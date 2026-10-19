"use client";

/*
 * ตั้งค่าระบบ › งานขาย › แม่แบบ Proposal (ผู้ใช้สั่ง 14 ต.ค. 2569)
 *
 * ผู้ดูแล/CEO อัปโหลดกรอบ Proposal ให้ฝ่ายขายใช้เป็นโครง — ไฟล์หรือลิงก์ (Google Drive, Canva)
 * ฝ่ายขายเปิด/ดาวน์โหลดจากการ์ด "ไฟล์ Proposal และเอกสาร" ในหน้าผู้สนใจ
 * เพิ่ม · แก้ไข/แทนไฟล์ · ลบ (ยืนยันก่อน) บันทึกทันทีและลงประวัติการตั้งค่า
 */

import { useNameOf } from "@/lib/emp-name";
import { useState } from "react";
import { logChange } from "@/lib/admin-log";
import { thaiDate } from "@/lib/format";
import { useProfile } from "@/lib/profile-data";
import {
  addProposalTemplate,
  removeProposalTemplate,
  updateProposalTemplate,
  useProposalTemplates,
  type ProposalTemplate,
} from "@/lib/proposal-templates";
import { AdminHead, IconBtn, thCls, trCls } from "./admin-ui";
import { ConfirmDialog } from "./confirm-dialog";
import { FileDrop, fileSize, type PickedFile } from "./file-drop";
import { PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

const COLS = "grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_150px_76px]";

/** ป้ายชนิด — ลิงก์ หรือนามสกุลไฟล์ */
export function TplBadge({ t }: { t: Pick<ProposalTemplate, "file" | "url"> }) {
  const dot = t.file.lastIndexOf(".");
  const ext = t.url ? "LINK" : dot < 0 ? "FILE" : t.file.slice(dot + 1).toUpperCase().slice(0, 4);
  return (
    <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-muted text-[10px] font-bold text-muted-foreground">
      {ext}
    </span>
  );
}

export function AdminProposalTemplatesPage() {
  const list = useProposalTemplates();
  const nameOf = useNameOf();
  const [editing, setEditing] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProposalTemplate | null>(null);
  const current = editing && editing !== "new" ? list.find((t) => t.id === editing) : undefined;

  const fileOf = (t: ProposalTemplate) => (t.url ? "ลิงก์" : `${t.file}${t.size ? ` · ${fileSize(t.size)}` : ""}`);
  const actions = (t: ProposalTemplate) => (
    <span className="flex justify-end gap-1.5">
      <IconBtn label={`แก้ไข ${t.name}`} title="แก้ไข / แทนไฟล์" onClick={() => setEditing(t.id)}>
        <PencilIcon className="size-[15px]" strokeWidth={2} />
      </IconBtn>
      <IconBtn label={`ลบ ${t.name}`} title="ลบ" danger onClick={() => setRemoving(t)}>
        <TrashIcon className="size-[15px]" strokeWidth={1.9} />
      </IconBtn>
    </span>
  );

  return (
    <div className="space-y-4">
      <AdminHead title="แม่แบบ Proposal" desc="กรอบ Proposal ที่ฝ่ายขายดาวน์โหลดไปใช้ได้จากหน้าผู้สนใจ">
        <button type="button" className="btn solid btn-solid shrink-0" onClick={() => setEditing("new")}>
          <PlusIcon className="size-[15px]" strokeWidth={2.2} />
          เพิ่มแม่แบบ
        </button>
      </AdminHead>

      <section className="glass overflow-hidden rounded-[18px]">
        {list.length === 0 ? (
          <p className="px-4 py-7 text-center text-[13.5px] text-muted-foreground">
            ยังไม่มีแม่แบบ Proposal — กด &quot;เพิ่มแม่แบบ&quot; เพื่ออัปโหลด
          </p>
        ) : (
          <>
            {/* มือถือ: แถวละแม่แบบ ปุ่มอยู่ขวา */}
            <ul className="divide-y divide-border sm:hidden">
              {list.map((t) => (
                <li key={t.id} className="flex items-start gap-3 px-3.5 py-3">
                  <TplBadge t={t} />
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px] font-semibold break-words">{t.name}</b>
                    {t.desc && <span className="block text-[12.5px] text-muted-foreground">{t.desc}</span>}
                    <span className="num block text-[12px] text-muted-foreground">
                      {fileOf(t)} · {nameOf(t.by)} · {thaiDate(t.at.slice(0, 10))}
                    </span>
                  </span>
                  {actions(t)}
                </li>
              ))}
            </ul>
            <div className="hidden px-4 pt-3.5 pb-4 sm:block sm:px-5">
              <div className={`grid ${COLS} ${thCls}`}>
                <span className="text-center">#</span>
                <span>ชื่อแม่แบบ</span>
                <span>ไฟล์หรือลิงก์</span>
                <span>แก้ล่าสุด</span>
                <span />
              </div>
              {list.map((t, n) => (
                <div key={t.id} className={`grid ${COLS} ${trCls}`}>
                  <span className="num text-center text-[12px] text-muted-foreground">{n + 1}</span>
                  <span className="min-w-0">
                    <b className="block truncate text-[13.5px] font-semibold">{t.name}</b>
                    {t.desc && <span className="block truncate text-[12px] text-muted-foreground">{t.desc}</span>}
                  </span>
                  <span className="min-w-0 truncate text-[13px] text-muted-foreground">
                    {t.url ? (
                      <a href={t.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        {t.url}
                      </a>
                    ) : (
                      fileOf(t)
                    )}
                  </span>
                  <span className="flex flex-col text-[12.5px]">
                    <span className="num">{thaiDate(t.at.slice(0, 10))}</span>
                    <span className="truncate text-muted-foreground">{nameOf(t.by)}</span>
                  </span>
                  {actions(t)}
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {editing && <TemplateSheet key={editing} template={current} onClose={() => setEditing(null)} />}

      <ConfirmDialog
        open={Boolean(removing)}
        title="ลบแม่แบบนี้?"
        description="ฝ่ายขายจะดาวน์โหลดแม่แบบนี้จากหน้าผู้สนใจไม่ได้อีก"
        detail={removing?.name}
        confirmLabel="ลบ"
        tone="destructive"
        onConfirm={() => {
          if (removing) {
            removeProposalTemplate(removing.id);
            logChange("แม่แบบ Proposal", `ลบแม่แบบ "${removing.name}"`);
          }
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}

/** เพิ่ม/แก้ไขแม่แบบ — ไฟล์หรือลิงก์ได้ทีละหนึ่งรายการ แนบใหม่ = แทนของเดิม */
function TemplateSheet({ template: t, onClose }: { template?: ProposalTemplate; onClose: () => void }) {
  const me = useProfile().name;
  const [name, setName] = useState(t?.name ?? "");
  const [desc, setDesc] = useState(t?.desc ?? "");
  const [files, setFiles] = useState<PickedFile[]>(() =>
    t ? [{ id: `cur-${t.id}`, name: t.url ?? t.file, size: t.size ?? 0, url: t.url }] : [],
  );
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const problems = { name: !name.trim(), file: files.length === 0 };

  function save() {
    setTouched(true);
    if (problems.name || problems.file || busy) return;
    const f = files[0];
    const input = {
      name: name.trim(),
      desc: desc.trim(),
      file: f.name,
      url: f.url,
      size: f.url ? undefined : f.size,
    };
    if (t) {
      updateProposalTemplate(t.id, input, me);
      const replaced = (t.url ?? t.file) !== f.name;
      logChange("แม่แบบ Proposal", `แก้ไขแม่แบบ "${input.name}"${replaced ? ` แทนไฟล์ ${t.file} → ${f.name}` : ""}`);
    } else {
      addProposalTemplate(input, me);
      logChange("แม่แบบ Proposal", `เพิ่มแม่แบบ "${input.name}" (${f.name})`);
    }
    onClose();
  }

  const err = "mt-1.5 text-[12.5px] text-destructive";
  const lb = "mb-1.5 block text-[12.5px] font-semibold text-muted-foreground";

  return (
    <Sheet
      title={t ? "แก้ไขแม่แบบ Proposal" : "เพิ่มแม่แบบ Proposal"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            disabled={busy}
            onClick={save}
          >
            {t ? "บันทึก" : "เพิ่มแม่แบบ"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="ptpl-name" className={lb}>
            ชื่อแม่แบบ <span className="text-destructive">*</span>
          </label>
          <input
            id="ptpl-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น Proposal Framework (CEO)"
            className="field-control"
            aria-invalid={touched && problems.name}
          />
          {touched && problems.name && <p className={err}>ตั้งชื่อแม่แบบ</p>}
        </div>
        <div>
          <label htmlFor="ptpl-desc" className={lb}>
            คำอธิบาย
          </label>
          <textarea
            id="ptpl-desc"
            rows={2}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="ใช้เมื่อไร ต้องแก้ส่วนไหนก่อนส่งลูกค้า (ไม่บังคับ)"
            className="field-control resize-y py-2.5 leading-relaxed"
          />
        </div>
        <div>
          <p className={lb}>
            ไฟล์หรือลิงก์ <span className="text-destructive">*</span>
          </p>
          <FileDrop
            files={files}
            onChange={(next) => setFiles(next.slice(-1))}
            onBusy={setBusy}
            title="ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์"
            hint="ไฟล์เดียว (PDF, PowerPoint, Word) แนบใหม่จะแทนไฟล์เดิม"
            label="เลือกไฟล์แม่แบบ"
            links
            linkPlaceholder="หรือวางลิงก์ เช่น Google Drive, Canva"
          />
          {touched && problems.file && <p className={err}>แนบไฟล์หรือลิงก์ของแม่แบบ</p>}
        </div>
      </div>
    </Sheet>
  );
}
