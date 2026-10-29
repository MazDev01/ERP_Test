"use client";

/*
 * รูป + หมุดของลูกค้า (ลิงก์ตรวจงาน) — ใช้ร่วมกันระหว่างหน้าลูกค้า (ImageStage ใน client-review-page)
 * และหน้างานของทีม (ClientFixBoard ใน my-tasks) ให้หมุดหน้าตาและตำแหน่งตรงกันทุกที่
 *
 *   PinBoard       — รูปพร้อมหมุดตามพิกัด % · ไม่มีไฟล์ให้เปิด (blob อยู่แค่แท็บของ PM) = กรอบตัวแทนแล้ววาดหมุดบนกรอบนั้น
 *   ClientFixBoard — สิ่งที่ลูกค้าให้แก้ทีละไฟล์ (เฉพาะจุดที่ PM ยังไม่ติ๊กแก้แล้ว — กติกาเดียวกับ composeReason)
 *                    กดเลขในรายการ = หมุดบนรูปสว่างและเลื่อนมาให้เห็น · กดหมุด = รายการสว่าง
 */

import { useRef, useState, type ReactNode } from "react";
import { thaiStamp } from "@/lib/format";
import {
  commentWhere,
  liveUrl,
  type ReviewComment,
  type ReviewFile,
  type ReviewRound,
} from "@/lib/client-review-store";
import { FileIcon } from "./icons";
import "@/styles/review.css";

export function PinBoard({
  f,
  pins,
  active,
  onPin,
  onPick,
  pending,
  nextPin,
  fit,
  placeholder,
}: {
  f: ReviewFile;
  pins: ReviewComment[];
  active: string | null;
  onPin?: (c: ReviewComment) => void;
  /** มี = คลิกบนรูปเพื่อปักหมุดใหม่ (หน้าลูกค้า) · ไม่มี = ดูอย่างเดียว */
  onPick?: (p: { x: number; y: number }) => void;
  pending?: { x: number; y: number } | null;
  nextPin?: number;
  /** กว้างเต็มกล่องที่วางอยู่ (หน้างานของทีม) แทนขนาดของตัวดูไฟล์เต็มจอ */
  fit?: boolean;
  placeholder?: ReactNode;
}) {
  const url = liveUrl(f);
  function pick(e: React.MouseEvent<HTMLElement>) {
    if (!onPick) return;
    const b = e.currentTarget.getBoundingClientRect();
    if (!b.width || !b.height) return;
    const x = Math.round(((e.clientX - b.left) / b.width) * 1000) / 10;
    const y = Math.round(((e.clientY - b.top) / b.height) * 1000) / 10;
    onPick({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) });
  }
  return (
    <div className={`rvv-img ${onPick ? "" : "ro"} ${fit ? "fit" : ""}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={f.name} onClick={pick} draggable={false} />
      ) : (
        <div
          onClick={pick}
          className={`grid aspect-[3/2] place-items-center rounded-[8px] bg-card text-center text-[13px] leading-relaxed text-muted-foreground shadow-[var(--shadow-md)] ${
            fit ? "w-full" : "w-[min(640px,80vw)]"
          }`}
        >
          <span className="px-6">
            <FileIcon className="mx-auto mb-2 size-8 text-primary" />
            {placeholder ?? f.name}
          </span>
        </div>
      )}
      {pins.map((c) =>
        c.pin ? (
          <button
            key={c.id}
            type="button"
            data-pin={c.id}
            className={`rvv-pin ${active === c.id ? "on" : ""}`}
            style={{ left: `${c.pin.x}%`, top: `${c.pin.y}%` }}
            onClick={(e) => {
              e.stopPropagation();
              onPin?.(c);
            }}
            aria-label={`หมุดที่ ${c.pin.n}`}
            aria-pressed={active === c.id}
            title={c.text}
          >
            <span>{c.pin.n}</span>
          </button>
        ) : null,
      )}
      {pending && (
        <span className="rvv-pin pending" style={{ left: `${pending.x}%`, top: `${pending.y}%` }}>
          <span>{nextPin}</span>
        </span>
      )}
    </div>
  );
}

/** จุดที่ทีมยังต้องแก้ — PM ติ๊กแก้แล้วไม่นับ (ตรงกับ composeReason) */
export function openFixes(round: ReviewRound) {
  return round.comments.filter((c) => !c.done);
}

export function ClientFixBoard({ round }: { round: ReviewRound }) {
  const box = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const open = openFixes(round);
  const byFile = round.files
    .map((f) => ({
      f,
      list: open
        .filter((c) => c.fileId === f.id)
        .sort((a, b) => (a.t ?? -1) - (b.t ?? -1) || (a.pin?.n ?? 0) - (b.pin?.n ?? 0)),
    }))
    .filter((x) => x.list.length > 0);

  function show(id: string, target: "pin" | "item") {
    setActive(id);
    const el = box.current?.querySelector<HTMLElement>(`[data-${target}="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: target === "pin" ? "center" : "nearest" });
  }

  return (
    <div ref={box} className="flex flex-col gap-4">
      {byFile.map(({ f, list }) => {
        const pins = f.kind === "image" ? list.filter((c) => c.pin) : [];
        return (
          <section key={f.id} className="min-w-0">
            <h4 className="mb-2 flex items-center gap-2 text-[12.5px] font-bold text-foreground">
              <span className="min-w-0 truncate">{f.name}</span>
              <span className="num flex-none rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {list.length} จุด
              </span>
            </h4>
            {pins.length > 0 && (
              <div className="mb-2.5 flex justify-center">
                <PinBoard f={f} pins={pins} active={active} fit onPin={(c) => show(c.id, "item")} />
              </div>
            )}
            <ul className="flex flex-col gap-1.5">
              {list.map((c) => {
                const pinned = pins.includes(c);
                return (
                  <li
                    key={c.id}
                    data-item={c.id}
                    className={`rvc-item ${pinned ? "click" : ""} ${active === c.id ? "on" : ""}`}
                    onClick={pinned ? () => show(c.id, "pin") : undefined}
                  >
                    {c.frame ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.frame} alt="" className="rvc-frame lg" />
                    ) : c.pin ? (
                      pinned ? (
                        <button
                          type="button"
                          className="rvc-pin"
                          aria-label={`ดูหมุดที่ ${c.pin.n} บนรูป`}
                          onClick={(e) => {
                            e.stopPropagation();
                            show(c.id, "pin");
                          }}
                        >
                          {c.pin.n}
                        </button>
                      ) : (
                        <span className="rvc-pin">{c.pin.n}</span>
                      )
                    ) : null}
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[11.5px] text-muted-foreground">
                        <b className="num font-semibold text-primary">{commentWhere(c)}</b>
                        <b className="font-semibold text-foreground">{c.author || "ลูกค้า"}</b>
                        <span className="num">{thaiStamp(c.at)} น.</span>
                      </p>
                      <p className="mt-0.5 text-[13px] leading-relaxed break-words whitespace-pre-line text-foreground">
                        {c.text}
                      </p>
                      {c.attach && (
                        <p className="mt-1 flex items-center gap-2 text-[11.5px] text-muted-foreground">
                          {c.attach.data && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={c.attach.data} alt="" className="size-10 rounded-md object-cover" />
                          )}
                          แนบ {c.attach.name}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
