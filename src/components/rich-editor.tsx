"use client";

import { useEffect, useRef, useState } from "react";
import { cleanHtml, textToHtml } from "@/lib/rich-text";

/*
 * ช่องรายละเอียดงานของใบเสนอราคา
 * ฝ่ายขายวางข้อความจาก Word มาทั้งก้อน จึงต้องรับตัวหนา ขีดเส้นใต้ บุลเล็ต
 * และจุดขึ้นหน้าใหม่ แล้วล้างสไตล์ที่ไม่ต้องการทิ้งก่อนเก็บ
 */

type Props = {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
  placeholder: string;
  invalid?: boolean;
  labelId: string;
};

export function RichEditor({ value, onChange, disabled, placeholder, invalid, labelId }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  /**
   * เขียนค่าลง DOM เองเฉพาะตอนที่ต่างจากที่พิมพ์อยู่จริง
   * ถ้าปล่อยให้ React คุมเนื้อหา เคอร์เซอร์จะเด้งกลับต้นช่องทุกตัวอักษร
   */
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);

  function emit() {
    onChange(ref.current?.innerHTML ?? "");
  }

  /* ตาราง (ผู้ใช้สั่ง 14 ต.ค. 2569) — ช่องที่เคอร์เซอร์อยู่ ใช้เพิ่ม/ลบแถว/คอลัมน์ */
  const [cell, setCell] = useState<HTMLTableCellElement | null>(null);
  const [tablePick, setTablePick] = useState(false);
  const [rows, setRows] = useState("3");
  const [cols, setCols] = useState("3");
  const [withHead, setWithHead] = useState(true);
  /** ตำแหน่งเคอร์เซอร์ก่อนเปิดกล่องเลือกขนาด — โฟกัสย้ายไปช่องตัวเลขแล้วต้องกลับมาแทรกที่เดิม */
  const saved = useRef<Range | null>(null);

  useEffect(() => {
    function onSel() {
      const el = ref.current;
      const node = window.getSelection()?.anchorNode ?? null;
      if (!el || !node || !el.contains(node)) {
        if (document.activeElement === el) setCell(null);
        return;
      }
      const base = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
      const c = base?.closest("td, th") as HTMLTableCellElement | null;
      setCell(c && el.contains(c) ? c : null);
    }
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, []);

  function caretInto(node: Node) {
    const sel = window.getSelection();
    if (!sel) return;
    const r = document.createRange();
    r.selectNodeContents(node);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
  }

  function openTablePick() {
    if (disabled) return;
    const sel = window.getSelection();
    const el = ref.current;
    saved.current = sel?.rangeCount && el?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null;
    setTablePick((v) => !v);
  }

  /** แทรกตารางหลังย่อหน้าที่เคอร์เซอร์อยู่ (ไม่ซ้อนในย่อหน้า/ตารางเดิม) แล้วเติมย่อหน้าว่างต่อท้ายให้พิมพ์ต่อ */
  function insertTable() {
    const el = ref.current;
    if (!el || disabled) return;
    const nr = Math.min(50, Math.max(1, Number(rows) || 3));
    const nc = Math.min(10, Math.max(1, Number(cols) || 3));
    const table = document.createElement("table");
    const mk = (tag: "td" | "th") => {
      const c = document.createElement(tag);
      c.appendChild(document.createElement("br"));
      return c;
    };
    let bodyRows = nr;
    if (withHead) {
      const tr = table.createTHead().insertRow();
      for (let j = 0; j < nc; j++) tr.appendChild(mk("th"));
      bodyRows = Math.max(1, nr - 1);
    }
    const tbody = table.createTBody();
    for (let i = 0; i < bodyRows; i++) {
      const tr = tbody.insertRow();
      for (let j = 0; j < nc; j++) tr.appendChild(mk("td"));
    }
    const after = document.createElement("p");
    after.appendChild(document.createElement("br"));

    /* หาก้อนชั้นบนสุดที่เคอร์เซอร์อยู่ */
    let top: Node | null = saved.current?.startContainer ?? null;
    if (top === el) top = el.childNodes[saved.current?.startOffset ?? 0] ?? null;
    while (top && top.parentNode !== el) top = top.parentNode;
    if (top) {
      const empty =
        top.nodeType === Node.ELEMENT_NODE &&
        (top as Element).tagName !== "TABLE" &&
        !(top.textContent ?? "").trim();
      el.insertBefore(table, top.nextSibling);
      if (empty) el.removeChild(top);
    } else {
      el.appendChild(table);
    }
    el.insertBefore(after, table.nextSibling);
    setTablePick(false);
    el.focus();
    caretInto(table.rows[0].cells[0]);
    emit();
  }

  /** เพิ่ม/ลบแถว คอลัมน์ หัวตาราง ของตารางที่เคอร์เซอร์อยู่ */
  function tableOp(op: "row+" | "row-" | "col+" | "col-" | "head" | "drop", at = cell) {
    const el = ref.current;
    if (!el || !at || disabled || !el.contains(at)) return;
    const tr = at.parentElement as HTMLTableRowElement;
    const table = at.closest("table") as HTMLTableElement;
    const col = at.cellIndex;
    let focusTo: Node | null = null;

    if (op === "row+") {
      const n = tr.cells.length;
      const fresh = document.createElement("tr");
      for (let j = 0; j < n; j++) {
        const td = document.createElement("td");
        td.appendChild(document.createElement("br"));
        fresh.appendChild(td);
      }
      /* อยู่ในแถวหัวตาราง → แถวใหม่ไปต้นเนื้อตาราง */
      if (tr.parentElement?.tagName === "THEAD") {
        const tb = table.tBodies[0] ?? table.createTBody();
        tb.insertBefore(fresh, tb.firstChild);
      } else tr.parentNode?.insertBefore(fresh, tr.nextSibling);
      focusTo = fresh.cells[Math.min(col, n - 1)] ?? null;
    } else if (op === "row-") {
      const idx = tr.rowIndex;
      const sec = tr.parentElement;
      tr.remove();
      if (sec && sec !== table && !sec.children.length) sec.remove();
      if (!table.rows.length) {
        focusTo = table.nextSibling;
        table.remove();
      } else focusTo = table.rows[Math.min(Math.max(idx, 0), table.rows.length - 1)]?.cells[0] ?? null;
    } else if (op === "col+") {
      Array.from(table.rows).forEach((r) => {
        const c = document.createElement(r.parentElement?.tagName === "THEAD" ? "th" : "td");
        c.appendChild(document.createElement("br"));
        r.insertBefore(c, r.cells[col + 1] ?? null);
      });
      focusTo = tr.cells[col + 1] ?? null;
    } else if (op === "col-") {
      Array.from(table.rows).forEach((r) => r.cells[col]?.remove());
      if (!table.rows[0]?.cells.length) {
        focusTo = table.nextSibling;
        table.remove();
      } else focusTo = tr.cells[Math.max(0, col - 1)] ?? null;
    } else if (op === "head") {
      const swap = (r: HTMLTableRowElement, tag: "td" | "th") =>
        Array.from(r.cells).forEach((x) => {
          const y = document.createElement(tag);
          while (x.firstChild) y.appendChild(x.firstChild);
          x.replaceWith(y);
        });
      if (table.tHead) {
        /* มีหัวตารางอยู่ → แปลงกลับเป็นแถวธรรมดา */
        const tb = table.tBodies[0] ?? table.createTBody();
        Array.from(table.tHead.rows)
          .reverse()
          .forEach((r) => {
            swap(r, "td");
            tb.insertBefore(r, tb.firstChild);
          });
        table.deleteTHead();
      } else if (table.rows[0]) {
        const first = table.rows[0];
        swap(first, "th");
        table.createTHead().appendChild(first);
      }
      focusTo = table.rows[0]?.cells[0] ?? null;
    } else {
      focusTo = table.nextSibling;
      table.remove();
    }

    el.focus();
    if (focusTo) caretInto(focusTo);
    else setCell(null);
    emit();
  }

  /** Tab / Shift+Tab ในตาราง = ไปช่องถัดไป/ก่อนหน้า · Tab ที่ช่องสุดท้ายเพิ่มแถวใหม่ */
  function tabInTable(back: boolean) {
    const table = cell?.closest("table");
    if (!cell || !table) return false;
    const all = Array.from(table.querySelectorAll("td, th"));
    const next = all[all.indexOf(cell) + (back ? -1 : 1)];
    if (next) caretInto(next);
    else if (!back) tableOp("row+", cell);
    return true;
  }

  function run(command: string) {
    if (disabled) return;
    ref.current?.focus();
    document.execCommand(command, false);
    emit();
  }

  /** แทรกเส้นแบ่งหน้า แล้ววางเคอร์เซอร์ไว้ย่อหน้าถัดไปให้พิมพ์ต่อได้เลย */
  function insertBreak() {
    if (disabled) return;
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    const rule = document.createElement("hr");
    const after = document.createElement("p");
    after.appendChild(document.createElement("br"));

    /* อยู่ในช่องตาราง → แบ่งหน้าต่อท้ายตารางแทน ไม่ผ่าตารางเป็นสองท่อน (ผู้ใช้สั่ง 14 ต.ค. 2569) */
    const inTable = sel?.anchorNode
      ? (sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement)?.closest("table")
      : null;
    if (inTable && el.contains(inTable)) {
      inTable.parentNode?.insertBefore(rule, inTable.nextSibling);
      rule.parentNode?.insertBefore(after, rule.nextSibling);
      if (sel) caretInto(after);
    } else if (sel?.rangeCount && el.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(rule);
      rule.parentNode?.insertBefore(after, rule.nextSibling);
      const next = document.createRange();
      next.setStart(after, 0);
      next.collapse(true);
      sel.removeAllRanges();
      sel.addRange(next);
    } else {
      el.appendChild(rule);
      el.appendChild(after);
    }
    emit();
  }

  function onPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    const clean = html
      ? cleanHtml(html)
      : textToHtml(e.clipboardData.getData("text/plain"));

    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();

    const holder = document.createElement("div");
    holder.innerHTML = clean;
    const frag = document.createDocumentFragment();
    let last: ChildNode | null = null;
    while (holder.firstChild) {
      last = holder.firstChild;
      frag.appendChild(last);
    }
    range.insertNode(frag);
    if (last) {
      range.setStartAfter(last);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    emit();
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <ToolButton onClick={() => run("bold")} disabled={disabled} title="ตัวหนา">
          <b>B</b>
        </ToolButton>
        <ToolButton onClick={() => run("italic")} disabled={disabled} title="ตัวเอียง">
          <i>I</i>
        </ToolButton>
        <ToolButton onClick={() => run("underline")} disabled={disabled} title="ขีดเส้นใต้">
          <u>U</u>
        </ToolButton>
        <ToolButton
          onClick={() => run("insertUnorderedList")}
          disabled={disabled}
          title="หัวข้อย่อย"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <circle cx="5" cy="7" r="1.4" fill="currentColor" />
            <circle cx="5" cy="12" r="1.4" fill="currentColor" />
            <circle cx="5" cy="17" r="1.4" fill="currentColor" />
            <path d="M10 7h10M10 12h10M10 17h10" />
          </svg>
        </ToolButton>
        <ToolButton onClick={openTablePick} disabled={disabled} title="แทรกตาราง" wide>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <rect x="3" y="4" width="18" height="16" rx="1.5" />
            <path d="M3 10h18M3 15h18M9 4v16M15 4v16" />
          </svg>
          ตาราง
        </ToolButton>
        <ToolButton onClick={insertBreak} disabled={disabled} title="ขึ้นหน้าใหม่ตอนพิมพ์" wide>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 4h12M6 20h12" />
            <path d="M3 12h4M10 12h4M17 12h4" />
          </svg>
          แบ่งหน้า
        </ToolButton>
      </div>

      {/* เลือกขนาดตาราง — ค่าตั้งต้น 3×3 (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      {tablePick && !disabled && (
        <div className="glass-thin mb-2 flex flex-wrap items-end gap-3 rounded-xl border border-border px-3 py-2.5 text-[13px]">
          <label className="grid gap-1">
            <span className="text-[12px] font-semibold text-muted-foreground">แถว</span>
            <input
              value={rows}
              inputMode="numeric"
              onChange={(e) => setRows(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className="field-control num h-9 w-16 text-center"
            />
          </label>
          <span className="pb-2 text-muted-foreground">×</span>
          <label className="grid gap-1">
            <span className="text-[12px] font-semibold text-muted-foreground">คอลัมน์</span>
            <input
              value={cols}
              inputMode="numeric"
              onChange={(e) => setCols(e.target.value.replace(/\D/g, "").slice(0, 2))}
              className="field-control num h-9 w-16 text-center"
            />
          </label>
          <label className="flex h-9 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={withHead}
              onChange={(e) => setWithHead(e.target.checked)}
              className="size-4 accent-[var(--primary)]"
            />
            แถวแรกเป็นหัวตาราง
          </label>
          <span className="ml-auto flex gap-2">
            <button type="button" className="btn glass-thin h-9" onClick={() => setTablePick(false)}>
              ยกเลิก
            </button>
            <button type="button" className="btn solid btn-solid h-9" onClick={insertTable}>
              แทรกตาราง
            </button>
          </span>
        </div>
      )}

      {/* เครื่องมือตาราง — ขึ้นเมื่อเคอร์เซอร์อยู่ในช่องตาราง */}
      {cell && !disabled && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="จัดการตาราง">
          <span className="mr-1 text-[12.5px] font-semibold text-muted-foreground">ตาราง</span>
          <ToolButton onClick={() => tableOp("row+")} title="เพิ่มแถวด้านล่าง" wide>+ แถว</ToolButton>
          <ToolButton onClick={() => tableOp("row-")} title="ลบแถวนี้" wide>− แถว</ToolButton>
          <ToolButton onClick={() => tableOp("col+")} title="เพิ่มคอลัมน์ด้านขวา" wide>+ คอลัมน์</ToolButton>
          <ToolButton onClick={() => tableOp("col-")} title="ลบคอลัมน์นี้" wide>− คอลัมน์</ToolButton>
          <ToolButton onClick={() => tableOp("head")} title="เปิด/ปิดแถวหัวตาราง" wide>หัวตาราง</ToolButton>
          <ToolButton onClick={() => tableOp("drop")} title="ลบตารางนี้" wide>ลบตาราง</ToolButton>
        </div>
      )}

      <div
        ref={ref}
        className={`rich ${invalid ? "border-destructive bg-[var(--destructive-soft)]" : ""}`}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === "Tab" && cell && tabInTable(e.shiftKey)) {
            e.preventDefault();
            return;
          }
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            insertBreak();
          }
        }}
      />
    </div>
  );
}

function ToolButton({
  onClick,
  disabled,
  title,
  wide,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`glass-thin inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] border border-border text-[13px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-45 ${
        wide ? "px-3" : "w-9"
      }`}
    >
      {children}
    </button>
  );
}
