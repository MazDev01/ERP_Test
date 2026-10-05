"use client";

import { useEffect, useRef } from "react";
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

    if (sel?.rangeCount && el.contains(sel.anchorNode)) {
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
        <ToolButton onClick={insertBreak} disabled={disabled} title="ขึ้นหน้าใหม่ตอนพิมพ์" wide>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
            <path d="M6 4h12M6 20h12" />
            <path d="M3 12h4M10 12h4M17 12h4" />
          </svg>
          แบ่งหน้า
        </ToolButton>
      </div>

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
