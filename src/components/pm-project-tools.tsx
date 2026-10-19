"use client";

/*
 * เครื่องมือของโปรเจคที่ใช้ร่วมกันระหว่างหน้าจัดคิวงาน (pm-plan-page) กับหน้าโปรเจค (pm-project-page)
 * (ผู้ใช้สั่ง 5 ต.ค. 2569)
 *   - แก้ชื่อโปรเจค — โปรเจคใหม่ขึ้นแค่ชื่อลูกค้า PM แก้ชื่อหลังเปิดโฟลเดอร์ได้ทั้งตอนวางแผนและตอนเดินงาน
 *   - แนบเอกสารอื่นให้โปรเจค (ปุ่ม "+") — ทีมเห็นในหน้าโปรเจคและหน้างานที่ได้รับ
 */

import { useState } from "react";
import { bkkStamp, thaiStamp } from "@/lib/format";
import type { ProjectDoc } from "@/lib/pm-data";
import { addProjectDocs, removeProjectDoc, renameProject } from "@/lib/pm-store";
import { useProfile } from "@/lib/profile-data";
import { nameOf } from "@/lib/emp-name";
import { ConfirmDialog } from "./confirm-dialog";
import { FileDrop, fileSize, type PickedFile } from "./file-drop";
import { CloseIcon, FileIcon, LinkIcon, PencilIcon, PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

/** ของที่ต้องใช้ตอนแก้ชื่อ — ได้ทั้งใบงานที่ยังวางแผนอยู่และโปรเจคที่เดินแล้ว */
export type RenameTarget = { pj: string; name?: string; cus: string; scope: string };

// ─── แก้ชื่อโปรเจค ─────────────────────────────────────────────────

export function RenameDialog({ project, onClose }: { project: RenameTarget; onClose: () => void }) {
  const [value, setValue] = useState(project.name ?? "");
  const [err, setErr] = useState(false);
  function save() {
    const v = value.trim();
    if (!v) {
      setErr(true);
      return;
    }
    renameProject(project.pj, v);
    onClose();
  }
  return (
    <Sheet
      title="แก้ชื่อโปรเจค"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button type="button" className="btn solid btn-solid" onClick={save}>
            บันทึกชื่อ
          </button>
        </>
      }
    >
      <label htmlFor="nmIn" className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        ชื่อโปรเจค
      </label>
      <input
        id="nmIn"
        autoFocus
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setErr(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
        }}
        placeholder="เช่น เว็บไซต์องค์กร เอ็มเทค"
        autoComplete="off"
        className="field-control w-full rounded-[11px] text-[13.5px]"
        style={{ height: 40 }}
      />
      {err && <p className="mt-1.5 text-[12px] font-semibold text-destructive">ใส่ชื่อโปรเจคก่อนบันทึก</p>}
      <p className="mt-2.5 text-[12px] text-muted-foreground">
        ลูกค้า {project.cus} · ขอบเขตงาน {project.scope}
      </p>
    </Sheet>
  );
}

/** ปุ่มเล็ก "แก้ชื่อโปรเจค" — หน้าตาเดียวกันทั้งสองหน้า */
export function RenameButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      data-ceo-hide
      onClick={onClick}
      title="แก้ชื่อโปรเจค"
      aria-label="แก้ชื่อโปรเจค"
      /* ไอคอนปากกาเปล่า ไม่มีกรอบ (ผู้ใช้สั่ง 5 ต.ค. 2569) */
      className="inline-grid size-8 flex-none place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-primary"
    >
      <PencilIcon className="size-4" strokeWidth={2} />
    </button>
  );
}

// ─── เอกสารแนบของโปรเจค ───────────────────────────────────────────

/** ปุ่ม "+" ข้างเอกสาร — เปิดกล่องแนบเอกสาร */
export function AddDocButton({ onClick, className = "", label }: { onClick: () => void; className?: string; label?: string }) {
  return (
    <button
      type="button"
      data-ceo-hide
      onClick={onClick}
      title="แนบเอกสารอื่นให้โปรเจค"
      aria-label="แนบเอกสารอื่นให้โปรเจค"
      className={`btn glass-thin ${className}`}
    >
      <PlusIcon className="size-[15px]" strokeWidth={2.2} />
      {label}
    </button>
  );
}

/*
 * ยังไม่มีที่เก็บไฟล์จริง — เก็บแค่ชื่อกับขนาดเหมือนไฟล์แนบอื่นในระบบ (ดู file-drop.tsx)
 * ลิงก์ http(s) เก็บ url ไว้เปิดได้จริง
 */
export function AddDocsDialog({ pj, onClose }: { pj: string; onClose: () => void }) {
  const me = useProfile();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  function save() {
    const at = bkkStamp();
    const docs: ProjectDoc[] = files.map((f) => {
      const url = f.url && /^https?:\/\//i.test(f.url) ? f.url : undefined;
      return { n: f.name, sz: url ? "ลิงก์" : fileSize(f.size), by: me.name, at, url };
    });
    addProjectDocs(pj, docs);
    onClose();
  }
  return (
    <Sheet
      title="แนบเอกสารให้โปรเจค"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:cursor-not-allowed disabled:opacity-50"
            disabled={files.length === 0 || busy}
            onClick={save}
          >
            แนบเอกสาร
          </button>
        </>
      }
    >
      <FileDrop
        files={files}
        onChange={setFiles}
        onBusy={setBusy}
        links
        hint="เอกสารที่ทีมควรเห็น เช่น บรีฟ คู่มือแบรนด์ ไฟล์จากลูกค้า"
        linkPlaceholder="หรือวางลิงก์ เช่น Google Drive, Canva, Figma"
      />
    </Sheet>
  );
}

/** กล่องยืนยันก่อนเอาเอกสารออก */
export function RemoveDocDialog({
  pj,
  name,
  onClose,
}: {
  pj: string;
  name: string | null;
  onClose: () => void;
}) {
  return (
    <ConfirmDialog
      open={name !== null}
      title="เอาเอกสารออก"
      description={name ?? ""}
      detail="ทีมจะไม่เห็นเอกสารนี้ในโปรเจคอีก"
      confirmLabel="เอาออก"
      tone="destructive"
      onConfirm={() => {
        if (name) removeProjectDoc(pj, name);
        onClose();
      }}
      onCancel={onClose}
    />
  );
}

/** คำอธิบายใต้ชื่อเอกสาร — ขนาด · ใครแนบ · เมื่อไร */
export function docSub(d: ProjectDoc) {
  return `${d.sz} · แนบโดย ${d.by ? nameOf(d.by) : "—"} · ${thaiStamp(d.at)} น.`;
}

/*
 * ชิปเอกสารแนบ วางต่อจากปุ่มใบเสนอราคา/Proposal ในหน้าจัดคิวงาน
 * ลิงก์เปิดได้จริง · ไฟล์ยังไม่มีที่เก็บ จึงโชว์แค่ชื่อกับรายละเอียดใน title
 */
export function DocChips({
  pj,
  docs,
  canEdit,
}: {
  pj: string;
  docs: ProjectDoc[];
  canEdit: boolean;
}) {
  const [removing, setRemoving] = useState<string | null>(null);
  if (!docs.length) return null;
  return (
    <>
      {docs.map((d) => {
        const inner = (
          <>
            {d.url ? (
              <LinkIcon className="size-[15px] flex-none" strokeWidth={2} />
            ) : (
              <FileIcon className="size-[15px] flex-none" strokeWidth={2} />
            )}
            <span className="max-w-[180px] truncate">{d.url ? d.n.replace(/^https?:\/\//i, "") : d.n}</span>
          </>
        );
        return (
          <span key={d.n} className="inline-flex items-center">
            {d.url ? (
              <a href={d.url} target="_blank" rel="noreferrer" title={docSub(d)} className="btn glass-thin pl-docbtn">
                {inner}
              </a>
            ) : (
              <span title={docSub(d)} className="btn glass-thin pl-docbtn cursor-default">
                {inner}
              </span>
            )}
            {canEdit && (
              <button
                type="button"
                data-ceo-hide
                onClick={() => setRemoving(d.n)}
                title="เอาเอกสารนี้ออก"
                aria-label={`เอา ${d.n} ออก`}
                className="-ml-1 grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
              >
                <CloseIcon className="size-3.5" strokeWidth={2.2} />
              </button>
            )}
          </span>
        );
      })}
      <RemoveDocDialog pj={pj} name={removing} onClose={() => setRemoving(null)} />
    </>
  );
}
