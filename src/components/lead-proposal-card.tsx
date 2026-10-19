"use client";

/*
 * การ์ด "ไฟล์ Proposal และเอกสาร" ในหน้าผู้สนใจ (ผู้ใช้สั่ง 14 ต.ค. 2569)
 *
 * ฝ่ายขายทำ Proposal เอง แล้วแนบไว้ที่นี่ — ไฟล์หรือลิงก์ (Google Drive, Canva)
 * เรียงใหม่สุดก่อน บอกคนแนบและวันที่ · ลิงก์กดเปิดได้ · คนแนบเท่านั้นที่ลบได้ (ยืนยันก่อน)
 * ปุ่ม "แม่แบบ Proposal" เปิดรายการกรอบ Proposal ของ CEO (ตั้งที่ ตั้งค่าระบบ › งานขาย › แม่แบบ Proposal)
 * ยังไม่มีที่เก็บไฟล์จริง — ไฟล์เก็บแค่ชื่อ ขนาด วันที่ จึงยังเปิด/ดาวน์โหลดได้เฉพาะลิงก์
 */

import { useMemo, useState } from "react";
import { thaiDate } from "@/lib/format";
import { addLeadFiles, removeLeadFile, useLeadFiles, type LeadFile } from "@/lib/lead-files";
import { useProfile } from "@/lib/profile-data";
import { useNameOf } from "@/lib/emp-name";
import { useProposalTemplates } from "@/lib/proposal-templates";
import { TplBadge } from "./admin-proposal-templates-page";
import { ConfirmDialog } from "./confirm-dialog";
import { FileDrop, fileSize, type PickedFile } from "./file-drop";
import { DownloadIcon, FileIcon, LinkIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";

const CARD = "ld-card glass rounded-2xl px-4 py-5 sm:px-[22px] md:rounded-[20px] md:p-7";
const HEAD = "flex flex-wrap items-center gap-2 text-[15px] font-semibold md:gap-2.5 md:text-[20px]";
const HEAD_ICON = "size-4 shrink-0 text-primary md:size-5";
const LINK_BTN = "text-[12.5px] font-semibold text-primary hover:underline md:text-[14px]";
const MINI = "iconbtn glass-thin grid shrink-0 place-items-center text-muted-foreground max-sm:!size-[38px]";

/** ปุ่มเปิดลิงก์ / ดาวน์โหลด — ไฟล์ที่ยังไม่มีที่เก็บจริงกดไม่ได้ */
function OpenBtn({ name, url }: { name: string; url?: string }) {
  if (url)
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`เปิด ${name}`}
        title="เปิดลิงก์"
        className={`${MINI} hover:text-primary`}
        style={{ width: 30, height: 30 }}
      >
        <LinkIcon className="size-[15px]" strokeWidth={2} />
      </a>
    );
  return (
    <button
      type="button"
      disabled
      aria-label={`ดาวน์โหลด ${name}`}
      title="ยังดาวน์โหลดไม่ได้ จนกว่าจะต่อที่เก็บไฟล์"
      className={`${MINI} opacity-40`}
      style={{ width: 30, height: 30 }}
    >
      <DownloadIcon className="size-[15px]" strokeWidth={2} />
    </button>
  );
}

function ExtBadge({ f }: { f: Pick<LeadFile, "name" | "url"> }) {
  return <TplBadge t={{ file: f.name, url: f.url }} />;
}

export function LeadProposalCard({ code }: { code: string }) {
  const all = useLeadFiles();
  const me = useProfile().name;
  const empName = useNameOf();
  const files = useMemo(
    () => all.filter((f) => f.lead === code).sort((a, b) => b.at.localeCompare(a.at)),
    [all, code],
  );
  const [adding, setAdding] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [removing, setRemoving] = useState<LeadFile | null>(null);

  return (
    <section className={CARD}>
      <h2 className={HEAD}>
        <FileIcon className={HEAD_ICON} strokeWidth={2} />
        <span className="min-w-0">ไฟล์ Proposal และเอกสาร</span>
        <span className="ml-auto flex items-center gap-3">
          <button type="button" className={LINK_BTN} onClick={() => setAdding(true)}>
            แนบไฟล์
          </button>
        </span>
      </h2>

      {files.length === 0 ? (
        <p className="py-5 text-center text-[13px] text-muted-foreground md:py-7 md:text-[14px]">
          ยังไม่มีไฟล์ Proposal หรือเอกสารของรายนี้
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border md:mt-2">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-3 py-2.5 md:py-3">
              <ExtBadge f={f} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[13.5px] font-medium md:text-[15px]" title={f.name}>
                  {f.name}
                </b>
                <span className="num block text-[11.5px] text-muted-foreground md:text-[13px]">
                  {empName(f.by)} · {thaiDate(f.at.slice(0, 10))} {f.at.slice(11)}
                  {!f.url && f.size > 0 && ` · ${fileSize(f.size)}`}
                </span>
              </span>
              <OpenBtn name={f.name} url={f.url} />
              {f.by === me && (
                <button
                  type="button"
                  aria-label={`ลบ ${f.name}`}
                  title="ลบ"
                  onClick={() => setRemoving(f)}
                  className={`${MINI} hover:text-destructive`}
                  style={{ width: 30, height: 30 }}
                >
                  <TrashIcon className="size-[15px]" strokeWidth={1.9} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding && (
        <AddFilesSheet
          onClose={() => setAdding(false)}
          onSave={(picked) => {
            addLeadFiles(code, picked.map(({ name, size, url }) => ({ name, size, url })), me);
            setAdding(false);
          }}
        />
      )}
      {tplOpen && <TemplatesSheet onClose={() => setTplOpen(false)} />}

      <ConfirmDialog
        open={Boolean(removing)}
        tone="destructive"
        title="ลบไฟล์นี้?"
        description="ลบแล้วเรียกคืนไม่ได้"
        detail={removing?.name}
        confirmLabel="ลบไฟล์"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeLeadFile(removing.id);
          setRemoving(null);
        }}
      />
    </section>
  );
}

function AddFilesSheet({ onClose, onSave }: { onClose: () => void; onSave: (files: PickedFile[]) => void }) {
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title="แนบไฟล์ Proposal และเอกสาร"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            disabled={busy || files.length === 0}
            onClick={() => onSave(files)}
          >
            แนบ {files.length > 0 ? `${files.length} รายการ` : ""}
          </button>
        </>
      }
    >
      <FileDrop
        files={files}
        onChange={setFiles}
        onBusy={setBusy}
        title="ลากไฟล์มาวาง หรือกดเพื่อเลือกไฟล์"
        hint="Proposal ที่ทำเอง หรือเอกสารประกอบ (PDF, PowerPoint, Word, รูปภาพ)"
        label="เลือกไฟล์ Proposal"
        links
        linkPlaceholder="หรือวางลิงก์ เช่น Google Drive, Canva"
      />
    </Sheet>
  );
}

function TemplatesSheet({ onClose }: { onClose: () => void }) {
  const list = useProposalTemplates();
  return (
    <Sheet title="แม่แบบ Proposal" onClose={onClose} footer={null}>
      {list.length === 0 ? (
        <p className="py-6 text-center text-[13.5px] text-muted-foreground">ยังไม่มีแม่แบบ Proposal</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((t) => (
            <li key={t.id} className="flex items-start gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
              <TplBadge t={t} />
              <span className="min-w-0 flex-1">
                <b className="block text-[14px] font-semibold break-words">{t.name}</b>
                {t.desc && <span className="block text-[12.5px] text-muted-foreground">{t.desc}</span>}
                <span className="num block text-[12px] text-muted-foreground">
                  {t.url ? "ลิงก์" : t.file}
                  {!t.url && t.size ? ` · ${fileSize(t.size)}` : ""} · แก้ล่าสุด {thaiDate(t.at.slice(0, 10))}
                </span>
              </span>
              {t.url ? (
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn glass-thin btn-mini shrink-0 max-sm:!h-10"
                >
                  เปิด
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  title="ยังดาวน์โหลดไม่ได้ จนกว่าจะต่อที่เก็บไฟล์"
                  className="btn glass-thin btn-mini shrink-0 opacity-50 max-sm:!h-10"
                >
                  ดาวน์โหลด
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
