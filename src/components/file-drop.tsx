"use client";

/*
 * กล่องแนบไฟล์ — ลากมาวางหรือคลิกเลือกก็ได้ แล้วขึ้นรายการไฟล์ให้ลบทีละอัน
 *
 * ยังไม่มีที่เก็บไฟล์จริง จึงเก็บแค่ชื่อกับขนาดไว้โชว์ ไม่ได้ส่งตัวไฟล์ไปไหน
 * แถบความคืบหน้าเป็นการจำลองเวลาอัปโหลดตามดีไซน์ ไม่ใช่ความคืบหน้าจริง
 * (ดู UPLOAD_MS ข้างล่าง) พอต่อ backend แล้วให้แทนที่ด้วยเลขจริงจาก XHR/fetch
 *
 * ใช้ร่วมกันสามหน้า — คำขอก่อนการขาย · โปรไฟล์ · ส่งงานของทีมงาน
 */

import { useEffect, useRef, useState } from "react";
import { CloseIcon, TrashIcon, UploadIcon } from "./icons";

/** ไฟล์ที่แนบไว้ — id ไว้จับคู่กับความคืบหน้า เพราะชื่อซ้ำกันได้ · url = แนบเป็นลิงก์ (ขนาด 0) */
export type PickedFile = { id: string; name: string; size: number; url?: string };

/** อัปโหลดจำลองนานเท่าไร และขยับทุกกี่มิลลิวินาที */
const UPLOAD_MS = 1200;
const TICK_MS = 120;

export function fileSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/** ชนิดไฟล์จากนามสกุล — ขึ้นเป็นป้ายหน้าแถว ตามดีไซน์ */
function extOf(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return "FILE";
  return name.slice(dot + 1).toUpperCase().slice(0, 4);
}

let seq = 0;
function newId() {
  seq += 1;
  return `f${seq}-${Date.now()}`;
}

export function FileDrop({
  files,
  onChange,
  title = "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก",
  hint,
  accept,
  label = "เลือกไฟล์แนบ",
  links = false,
  linkPlaceholder = "หรือวางลิงก์ เช่น Google Drive, Canva หรือเว็บไซต์เดิมของลูกค้า",
  onBusy,
}: {
  files: PickedFile[];
  onChange: (next: PickedFile[]) => void;
  /** ข้อความกลางกล่อง */
  title?: string;
  /** บรรทัดเล็กใต้ข้อความ บอกว่าควรแนบอะไร */
  hint?: string;
  accept?: string;
  label?: string;
  /** แนบลิงก์ได้ด้วย (ต้นแบบ presales-new.html) — เก็บเป็นรายการเดียวกับไฟล์ */
  links?: boolean;
  /** ข้อความในช่องแนบลิงก์ — แต่ละหน้าบอกตัวอย่างลิงก์ต่างกันตามต้นแบบ */
  linkPlaceholder?: string;
  /** ยังมีไฟล์อัปโหลดไม่เสร็จอยู่หรือไม่ — หน้าที่ส่งใบได้ต้องรู้ เพื่อไม่ให้ส่งไฟล์ที่ยังไม่ครบ */
  onBusy?: (busy: boolean) => void;
}) {
  const pickerRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState("");
  const [linkErr, setLinkErr] = useState(false);

  function addLink() {
    const v = link.trim();
    if (!v) return;
    if (!/^https?:\/\//i.test(v)) return setLinkErr(true);
    setLinkErr(false);
    onChange([...files, { id: newId(), name: v, size: 0, url: v }]);
    setLink("");
  }
  const [over, setOver] = useState(false);
  /** ไบต์ที่ "อัปโหลด" ไปแล้วของแต่ละไฟล์ — ครบขนาดคือเสร็จ
      ไฟล์ที่ติดมาตั้งแต่เปิด (เช่นหน้าต่างแก้ไข) นับว่าอัปโหลดเสร็จแล้ว ไม่ต้องวิ่งแถบใหม่ */
  const [done, setDone] = useState<Record<string, number>>(() =>
    Object.fromEntries(files.map((f) => [f.id, f.size])),
  );

  const pending = files.filter((f) => (done[f.id] ?? 0) < f.size);

  /*
   * เดินแถบความคืบหน้าให้ไฟล์ที่ยังไม่ครบ
   * ผูกกับจำนวนไฟล์ที่ค้าง ไม่ใช่กับ done เพื่อไม่ให้ตั้ง interval ใหม่ทุกครั้งที่ขยับ
   */
  useEffect(() => {
    if (pending.length === 0) return;
    const id = window.setInterval(() => {
      setDone((prev) => {
        const next = { ...prev };
        let moved = false;
        for (const f of files) {
          const at = next[f.id] ?? 0;
          if (at >= f.size) continue;
          next[f.id] = Math.min(f.size, at + (f.size * TICK_MS) / UPLOAD_MS);
          moved = true;
        }
        return moved ? next : prev;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.length, files.length]);

  /* บอกหน้าที่ใช้กล่องนี้ว่ายังอัปโหลดค้างอยู่ — ปุ่มส่งจะได้รอจนไฟล์ครบ */
  const busy = pending.length > 0;
  useEffect(() => {
    onBusy?.(busy);
  }, [busy, onBusy]);

  function add(list: FileList | null) {
    if (!list) return;
    const added = Array.from(list).map((f) => ({
      id: newId(),
      name: f.name,
      size: f.size,
    }));
    setDone((prev) => {
      const next = { ...prev };
      for (const f of added) next[f.id] = 0;
      return next;
    });
    onChange([...files, ...added]);
  }

  function drop(id: string) {
    onChange(files.filter((f) => f.id !== id));
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        aria-label={label}
        onClick={() => pickerRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pickerRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
        className={`cursor-pointer rounded-[14px] border-[1.6px] border-dashed p-6 text-center transition-colors ${
          over ? "border-primary bg-[#fef7f8]" : "border-border hover:border-primary"
        }`}
      >
        <span className="mx-auto grid size-12 place-items-center rounded-[13px] bg-card">
          <UploadIcon className="size-6 text-foreground" strokeWidth={1.8} />
        </span>
        <p className="mt-2.5 text-[13.5px] font-medium">{title}</p>
        {hint && <small className="mt-1 block text-xs text-muted-foreground">{hint}</small>}
      </div>
      <input
        ref={pickerRef}
        type="file"
        accept={accept}
        multiple
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = "";
        }}
      />

      {links && (
        <>
          <div className="mt-3 flex gap-2">
            <input
              type="url"
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setLinkErr(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addLink();
                }
              }}
              aria-label="แนบลิงก์"
              placeholder={linkPlaceholder}
              className="field-control min-w-0 flex-1"
            />
            <button type="button" className="btn glass-thin shrink-0" onClick={addLink}>
              แนบลิงก์
            </button>
          </div>
          {linkErr && (
            <p className="mt-1.5 text-[12.5px] text-destructive">ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://</p>
          )}
        </>
      )}

      {files.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {files.map((f) => {
            const at = done[f.id] ?? 0;
            const busy = at < f.size;
            return (
              <li
                key={f.id}
                className="rounded-xl border border-border bg-card px-3 py-2.5"
              >
                <div className="flex items-center gap-[11px]">
                  <span className="grid size-[34px] shrink-0 place-items-center rounded-[9px] bg-muted text-[10px] font-bold text-muted-foreground">
                    {f.url ? "LINK" : extOf(f.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] font-medium">{f.name}</b>
                    <span className="num block text-[11.5px] text-muted-foreground">
                      {f.url ? "ลิงก์" : busy ? `${fileSize(at)} จาก ${fileSize(f.size)}` : fileSize(f.size)}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => drop(f.id)}
                    aria-label={busy ? `ยกเลิกการอัปโหลด ${f.name}` : `ลบไฟล์ ${f.name}`}
                    className="grid size-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:text-destructive"
                  >
                    {busy ? (
                      <CloseIcon className="size-4" strokeWidth={2.2} />
                    ) : (
                      <TrashIcon className="size-4" strokeWidth={1.9} />
                    )}
                  </button>
                </div>

                {busy && (
                  <span
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round((at * 100) / f.size)}
                    aria-label={`กำลังอัปโหลด ${f.name}`}
                    className="mt-2 block h-1 overflow-hidden rounded-full bg-muted"
                  >
                    <i
                      className="block h-full rounded-full bg-foreground transition-[width] duration-100 ease-linear"
                      style={{ width: `${(at * 100) / f.size}%` }}
                    />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
