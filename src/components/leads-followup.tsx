"use client";

/*
 * มุมมอง "แผนติดตาม" ของพนักงานขาย (ผู้ใช้สั่ง 14 ต.ค. 2569)
 * กระดานอิสระ — คอลัมน์ตั้งเองต่อพนักงาน ลากการ์ดไปคอลัมน์ไหนก็ได้ ไม่เปิดงานจริง ไม่เปลี่ยนขั้นการขาย ไม่นับในรายงาน
 * การ์ด = ผู้สนใจชุดเดียวกับหน้ารายการ (ตัวค้นหา/ตัวกรอง/การเรียงเดียวกัน) · ย้ายทุกครั้งเก็บประวัติ
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Customer } from "@/lib/crm-data";
import type { CrmState } from "@/lib/crm-store";
import {
  COL_COLORS,
  FOLLOWUP_STALE_DAYS,
  UNSORTED,
  UNSORTED_NAME,
  addCol,
  colOf,
  enteredAt,
  entryStampOf,
  markSeen,
  moveCard,
  removeCol,
  shiftCol,
  updateCol,
  useBoard,
  type FCol,
} from "@/lib/followup-board";
import { daysBetween, thaiDate, thaiStamp } from "@/lib/format";
import { Field, Sheet } from "./lead-dialogs";
import { useNameOf } from "@/lib/emp-name";
import { ConfirmDialog } from "./confirm-dialog";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";

type Card = { c: Customer; col: string; last: string; nextFollow: string; days: number };
type Col = FCol & { fixed: boolean; list: Card[] };

export function LeadsFollowup({
  crm,
  rows,
  today,
  user,
  by,
}: {
  crm: CrmState;
  /** ผู้สนใจที่หน้ารายการแสดงอยู่ เรียงแล้ว (ไม่รวมรายที่ปิดงาน) */
  rows: Customer[];
  today: string;
  /** รหัสพนักงานที่ล็อกอิน — กระดานเป็นของคนนี้ */
  user: string;
  /** ชื่อผู้ย้าย ใช้ในประวัติ */
  by: string;
}) {
  const board = useBoard(user);
  const empName = useNameOf();

  /* การ์ดที่โผล่ครั้งแรก = จดวันเข้ายังไม่จัด ใช้นับวันในคอลัมน์ (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  useEffect(() => {
    markSeen(user, rows.map((c) => c.code));
  }, [rows, user]);

  const contact = useMemo(() => {
    const last: Record<string, string> = {};
    const next: Record<string, string> = {};
    const first: Record<string, string> = {};
    for (const a of crm.activities) {
      if (!last[a.customerCode] || a.date > last[a.customerCode]) last[a.customerCode] = a.date;
      if (!first[a.customerCode] || a.date < first[a.customerCode]) first[a.customerCode] = a.date;
      if (a.followUp && (!next[a.customerCode] || a.followUp > next[a.customerCode])) next[a.customerCode] = a.followUp;
    }
    return { last, next, first };
  }, [crm.activities]);

  /* วันที่เข้าระบบ: วันที่สร้าง → ติดต่อครั้งแรก → วันที่โผล่ในกระดาน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const entryOf = (c: Customer) => entryStampOf(c.createdAt, contact.first[c.code]);

  const cards: Card[] = rows.map((c) => {
    const at = enteredAt(board, c.code, entryOf(c));
    return {
      c,
      col: colOf(board, c.code),
      last: contact.last[c.code] ?? "",
      nextFollow: contact.next[c.code] ?? "",
      days: at ? Math.max(0, daysBetween(at.slice(0, 10), today)) : 0,
    };
  });

  const cols: Col[] = [{ id: UNSORTED, name: UNSORTED_NAME, cls: "t-miss" }, ...board.cols].map((col) => ({
    ...col,
    fixed: col.id === UNSORTED,
    list: cards.filter((k) => k.col === col.id),
  }));

  const [drag, setDrag] = useState<Card | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [mobileId, setMobileId] = useState<string>(UNSORTED);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<Customer | null>(null);
  const [colForm, setColForm] = useState<{ edit?: FCol } | null>(null);
  const [delCol, setDelCol] = useState<Col | null>(null);

  const moveTo = (k: Card, to: string) => {
    setMenuFor(null);
    if (k.col !== to) moveCard(user, k.c.code, to, by);
  };

  const mobileCol = cols.find((c) => c.id === mobileId) ?? cols[0];

  /** ปุ่มจัดการคอลัมน์ — เลื่อนซ้าย/ขวา แก้ชื่อ/สี ลบ · ยังไม่จัดแก้ไม่ได้ */
  const colTools = (col: Col) => {
    const i = board.cols.findIndex((c) => c.id === col.id);
    const btn =
      "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent";
    return (
      <div className="flex items-center gap-0.5">
        <button type="button" className={btn} disabled={i <= 0} onClick={() => shiftCol(user, col.id, -1)} aria-label={`เลื่อน ${col.name} ไปทางซ้าย`}>
          <ChevronLeftIcon className="size-4" />
        </button>
        <button type="button" className={btn} disabled={i >= board.cols.length - 1} onClick={() => shiftCol(user, col.id, 1)} aria-label={`เลื่อน ${col.name} ไปทางขวา`}>
          <ChevronRightIcon className="size-4" />
        </button>
        <button type="button" className={btn} onClick={() => setColForm({ edit: col })} aria-label={`แก้ไขคอลัมน์ ${col.name}`}>
          <PencilIcon className="size-[15px]" />
        </button>
        <button type="button" className={btn} onClick={() => setDelCol(col)} aria-label={`ลบคอลัมน์ ${col.name}`}>
          <TrashIcon className="size-[15px]" />
        </button>
      </div>
    );
  };

  const renderCard = (k: Card, mobile = false) => {
    const stale = k.days >= FOLLOWUP_STALE_DAYS;
    return (
      <li
        key={k.c.code}
        draggable={!mobile}
        onDragStart={(e) => {
          if (mobile) return;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", k.c.code);
          setDrag(k);
        }}
        onDragEnd={() => {
          setDrag(null);
          setOver(null);
        }}
        className={`rounded-xl border border-border bg-card shadow-sm transition-colors hover:border-primary/50 ${
          mobile ? "" : "cursor-grab active:cursor-grabbing"
        } ${drag?.c.code === k.c.code ? "opacity-50" : ""}`}
      >
        <Link href={`/leads/${k.c.code}`} draggable={false} className="block p-3 pb-2">
          <b className="line-clamp-2 text-[13.5px] leading-snug font-semibold">{k.c.name}</b>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {k.c.contact || "ยังไม่ได้กรอกผู้ติดต่อ"}
            {k.c.phone && <span className="num"> · {k.c.phone}</span>}
          </p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <dt>ติดต่อล่าสุด</dt>
            <dd className="num">{k.last ? thaiDate(k.last) : "—"}</dd>
            <dt>นัดถัดไป</dt>
            <dd className={`num ${k.nextFollow && k.nextFollow < today ? "font-semibold text-destructive" : ""}`}>
              {k.nextFollow ? thaiDate(k.nextFollow) : "—"}
            </dd>
          </dl>
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs">
          <span className={stale ? "font-semibold text-destructive" : "text-muted-foreground"}>
            {/* ค้างในคอลัมน์เดิมนานเกินเกณฑ์ = ขึ้นป้าย (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
            {stale && <ClockIcon className="mr-1 inline size-[12px] align-[-1px]" strokeWidth={2} />}
            อยู่ในคอลัมน์นี้ <span className="num">{k.days}</span> วัน
          </span>
          <span className="flex gap-1.5">
            <button type="button" className="btn glass-thin px-2.5 py-1 text-xs" onClick={() => setHistoryOf(k.c)}>
              ประวัติ
            </button>
            {mobile && (
              <button
                type="button"
                className="btn glass-thin px-2.5 py-1 text-xs"
                aria-haspopup="menu"
                aria-expanded={menuFor === k.c.code}
                onClick={() => setMenuFor((v) => (v === k.c.code ? null : k.c.code))}
              >
                ย้ายไป
              </button>
            )}
          </span>
        </div>
        {/* มือถือลากไม่ได้ — เมนู "ย้ายไป" แสดงทุกคอลัมน์ (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
        {mobile && menuFor === k.c.code && (
          <ul role="menu" className="overflow-hidden border-t border-border py-1">
            {cols.map((col) => (
              <li key={col.id} role="none">
                <button
                  type="button"
                  role="menuitem"
                  disabled={col.id === k.col}
                  onClick={() => moveTo(k, col.id)}
                  className={`block w-full px-3.5 py-2.5 text-left text-[13px] ${
                    col.id === k.col ? "text-muted-foreground" : "font-medium hover:bg-accent"
                  }`}
                >
                  {col.name}
                  {col.id === k.col && " · อยู่ที่นี่"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const history = historyOf ? [...(board.history[historyOf.code] ?? [])].reverse() : [];
  /* บรรทัดล่างสุดของประวัติ = วันที่เข้าระบบ ตรงกับที่ใช้นับวัน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
  const firstSeen = historyOf ? entryOf(historyOf) || board.seen[historyOf.code] || "" : "";

  return (
    <>
      {/* ยังไม่มีคอลัมน์ของตัวเอง = บอกวิธีเริ่ม (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      {board.cols.length === 0 && (
        <p className="rounded-xl border border-dashed border-border px-4 py-3 text-[13px] text-muted-foreground">
          เพิ่มคอลัมน์เพื่อวางแผนติดตามลูกค้า — กระดานนี้เป็นของคุณคนเดียว ย้ายการ์ดได้อิสระ ไม่กระทบขั้นการขายหรือรายงาน
        </p>
      )}

      {/* เดสก์ท็อป: ลากวางได้ทุกคอลัมน์ ไฮไลต์คอลัมน์ปลายทาง (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      {/* คอลัมน์กว้างคงที่ 264px เท่าไปป์ไลน์ ชิดซ้าย ไม่ยืดเต็มจอ ล้นแล้วเลื่อนแนวนอน (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      <div className="hidden gap-3 overflow-x-auto pb-2 md:flex">
        {cols.map((col) => {
          const hot = Boolean(drag) && over === col.id && drag!.col !== col.id;
          return (
            <section
              key={col.id}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (over !== col.id) setOver(col.id);
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver((v) => (v === col.id ? null : v));
              }}
              onDrop={(e) => {
                e.preventDefault();
                const k = drag;
                setDrag(null);
                setOver(null);
                if (k) moveTo(k, col.id);
              }}
              className={`panel glass flex w-[264px] min-w-[264px] flex-none flex-col transition-shadow ${hot ? "ring-2 ring-primary" : ""}`}
            >
              <header className="border-b border-border px-3.5 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className={`tag min-w-0 ${col.cls}`}>
                    <i />
                    <span className="truncate">{col.name}</span>
                  </span>
                  <span className="num shrink-0 text-[13px] font-semibold">{col.list.length}</span>
                </div>
                {col.fixed ? (
                  <p className="mt-1.5 text-xs text-muted-foreground">การ์ดที่ยังไม่ได้วางแผน</p>
                ) : (
                  <div className="mt-1.5 -mb-1 flex justify-end">{colTools(col)}</div>
                )}
              </header>
              <ul className="flex max-h-[calc(100vh-280px)] min-h-[120px] flex-col gap-2 overflow-y-auto p-2.5">
                {col.list.length ? (
                  col.list.map((k) => renderCard(k))
                ) : (
                  <li className="py-8 text-center text-xs text-muted-foreground">ลากการ์ดมาวางที่นี่</li>
                )}
              </ul>
            </section>
          );
        })}
        <button
          type="button"
          onClick={() => setColForm({})}
          className="flex min-h-[160px] w-[264px] min-w-[264px] flex-none flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-border text-[13px] font-medium text-muted-foreground hover:border-primary/50 hover:text-primary"
        >
          <PlusIcon className="size-5" />
          เพิ่มคอลัมน์
        </button>
      </div>

      {/* มือถือ: ชิปเลือกคอลัมน์ + รายการคอลัมน์เดียว (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      <div className="space-y-3 md:hidden">
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="คอลัมน์แผนติดตาม">
          {cols.map((col) => (
            <button
              key={col.id}
              type="button"
              aria-pressed={mobileCol.id === col.id}
              onClick={() => {
                setMobileId(col.id);
                setMenuFor(null);
              }}
              className={`btn shrink-0 whitespace-nowrap ${mobileCol.id === col.id ? "bg-accent font-semibold text-primary" : "glass-thin"}`}
            >
              {col.name}
              <span className="num">{col.list.length}</span>
            </button>
          ))}
          <button type="button" onClick={() => setColForm({})} className="btn glass-thin shrink-0 whitespace-nowrap">
            <PlusIcon className="size-[14px]" />
            เพิ่มคอลัมน์
          </button>
        </div>
        <section className="panel glass">
          <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
            <span className={`tag min-w-0 ${mobileCol.cls}`}>
              <i />
              <span className="truncate">{mobileCol.name}</span>
            </span>
            {!mobileCol.fixed && colTools(mobileCol)}
          </header>
          <ul className="flex flex-col gap-2 p-3">
            {mobileCol.list.length ? (
              mobileCol.list.map((k) => renderCard(k, true))
            ) : (
              <li className="py-10 text-center text-sm text-muted-foreground">ไม่มีรายการในคอลัมน์นี้</li>
            )}
          </ul>
        </section>
      </div>

      {/* ประวัติการย้ายของการ์ด ใหม่สุดอยู่บน (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      {historyOf && (
        <Sheet
          title={`ประวัติ · ${historyOf.name}`}
          onClose={() => setHistoryOf(null)}
          footer={
            <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={() => setHistoryOf(null)}>
              ปิด
            </button>
          }
        >
          {history.length || firstSeen ? (
            <ol className="divide-y divide-border text-[13px]">
              {history.map((m, i) => (
                <li key={i} className="py-2.5">
                  <p className="font-medium">
                    {m.from} → {m.to}
                  </p>
                  <p className="num mt-0.5 text-xs text-muted-foreground">
                    {thaiStamp(m.at)}
                    {m.by && ` · ${empName(m.by)}`}
                  </p>
                </li>
              ))}
              {firstSeen && (
                <li className="py-2.5">
                  <p className="font-medium">เข้ามาที่{UNSORTED_NAME}</p>
                  <p className="num mt-0.5 text-xs text-muted-foreground">{thaiStamp(firstSeen)}</p>
                </li>
              )}
            </ol>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่เคยย้าย</p>
          )}
        </Sheet>
      )}

      {colForm && (
        <ColDialog
          edit={colForm.edit}
          onClose={() => setColForm(null)}
          onSave={(v) => {
            if (colForm.edit) updateCol(user, colForm.edit.id, v);
            else addCol(user, v);
            setColForm(null);
          }}
        />
      )}
      <ConfirmDialog
        open={Boolean(delCol)}
        title="ลบคอลัมน์นี้"
        description={
          delCol
            ? `ลบ "${delCol.name}"${delCol.list.length ? ` — การ์ดในคอลัมน์นี้จะย้ายไปที่${UNSORTED_NAME}` : ""}`
            : undefined
        }
        confirmLabel="ลบคอลัมน์"
        tone="destructive"
        onCancel={() => setDelCol(null)}
        onConfirm={() => {
          if (delCol) {
            removeCol(user, delCol.id, by);
            if (mobileId === delCol.id) setMobileId(UNSORTED);
          }
          setDelCol(null);
        }}
      />
    </>
  );
}

/** กล่องเพิ่ม/แก้คอลัมน์ — ชื่อ · สี (ผู้ใช้สั่ง 14 ต.ค. 2569) */
function ColDialog({
  edit,
  onClose,
  onSave,
}: {
  edit?: FCol;
  onClose: () => void;
  onSave: (v: { name: string; cls: string }) => void;
}) {
  const [name, setName] = useState(edit?.name ?? "");
  const [cls, setCls] = useState(edit?.cls ?? COL_COLORS[1].cls);
  const [touched, setTouched] = useState(false);
  const submit = () => {
    setTouched(true);
    if (!name.trim()) return;
    onSave({ name: name.trim(), cls });
  };

  return (
    <Sheet
      title={edit ? "แก้ไขคอลัมน์" : "เพิ่มคอลัมน์"}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid flex-1 justify-center sm:flex-none" onClick={submit}>
            บันทึก
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="ชื่อคอลัมน์" required error={touched && !name.trim() ? "กรอกชื่อคอลัมน์" : undefined}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            maxLength={40}
            className="field-control"
            placeholder="เช่น โทรกลับสัปดาห์นี้"
          />
        </Field>
        <div>
          <p className="mb-2 text-[13px] font-medium">สี</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="สีคอลัมน์">
            {COL_COLORS.map((c) => (
              <button
                key={c.cls}
                type="button"
                role="radio"
                aria-checked={cls === c.cls}
                onClick={() => setCls(c.cls)}
                className={`tag ${c.cls} cursor-pointer ${cls === c.cls ? "ring-2 ring-primary ring-offset-1" : ""}`}
              >
                <i />
                {c.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
