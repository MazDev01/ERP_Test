"use client";

import { optionsOf } from "@/lib/options";
import { useHydrated } from "@/lib/pwa";
import { cloneElement, isValidElement, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { todayIso } from "@/lib/format";
import { lockScroll } from "@/lib/scroll-lock";
import { CloseIcon } from "./icons";
import "@/styles/mobile/sheet.css";

import { DateField } from "./thai-date-picker";
import { useAddOption } from "./add-option";
/** โครงกล่องมาตรฐาน — จอแคบกว่า md เปิดเป็นแผ่นจากขอบล่าง (styles/mobile/sheet.css) ตั้งแต่ md ขึ้นไปอยู่กลางจอ */
export function Sheet({
  title,
  onClose,
  children,
  footer,
  wide = false,
  mid = false,
  narrow = false,
  steady = false,
  className = "",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  /** ฟอร์มยาวที่มีสองคอลัมน์ ต้องการกล่องกว้างกว่าปกติ */
  wide?: boolean;
  /** ฟอร์มสองคอลัมน์ขนาดกลาง ตามความกว้างของกล่องในต้นแบบ (720px) */
  mid?: boolean;
  /** กล่องกว้างของหน้าบัญชีตามต้นแบบ (.box.wide = 620px) */
  narrow?: boolean;
  /** เนื้อหายืดหดตามที่กรอก — ตรึงความสูงไว้ กล่องจะได้ไม่ขยับตอนใช้งาน */
  steady?: boolean;
  /** คลาสเพิ่มที่ตัวกล่อง (panel) — หน้าที่เรียกใช้จับแต่งเนื้อหาเฉพาะหน้าได้ ไม่ต้องพึ่ง :has() */
  className?: string;
}) {
  /* เปิดกล่องได้หลัง hydrate เท่านั้น — ถ้าใช้ typeof document เซิร์ฟเวอร์จะวาดว่าง แต่เบราว์เซอร์วาดกล่อง
     ตอนที่กล่องเปิดมาตั้งแต่แรก (เช่นลิงก์ ?new=1) React จะฟ้อง hydration ไม่ตรงกัน */
  const hydrated = useHydrated();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [onClose]);

  if (!hydrated) return null;

  return createPortal(
    <div
      className="ui-sheet fixed inset-0 z-80 flex items-end justify-center bg-black/50 md:items-start md:p-6 md:pt-[max(24px,7vh)]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`ui-sheet-panel glass-solid flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[18px] md:max-h-full md:rounded-[18px] ${
          wide ? "max-w-[1080px]" : mid ? "max-w-[720px]" : narrow ? "max-w-[620px]" : "max-w-[560px]"
        } ${className}`}
      >
        <div className="ui-sheet-head flex flex-none items-center justify-between gap-3 border-b border-border px-4 py-3.5 md:px-5 md:py-4">
          <h2 className="text-[16.5px] font-bold">{title}</h2>
          <button type="button" className="iconbtn glass-thin" onClick={onClose} aria-label="ปิด">
            <CloseIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </div>
        <div
          className={`ui-sheet-body scroll-stable min-h-0 flex-1 overflow-auto px-4 py-4 md:px-5 md:py-[18px] ${
            steady ? "md:max-h-[min(70dvh,560px)] md:min-h-[280px] md:flex-none" : ""
          }`}
        >
          {children}
        </div>
        {/* กล่องที่วางปุ่มไว้ในเนื้อหาเอง (เช่นการ์ดงานย่อย) ส่ง footer เป็น null
            จะได้ไม่มีแถบท้ายเปล่า ๆ ค้างอยู่ใต้กล่อง */}
        {footer != null && footer !== false && (
          <div className="ui-sheet-foot flex flex-none items-center gap-2.5 border-t border-border px-4 py-3.5 pb-[max(14px,env(safe-area-inset-bottom))] md:justify-end md:px-5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export function Field({
  label,
  labelNote,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  /** ข้อความเล็กต่อท้ายหัวช่อง เช่น "ถ้าลูกค้าบอก" */
  labelNote?: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  /*
   * ผูก label กับช่องกรอกให้เอง — ที่เรียกใช้ทั้งหมดส่งแค่ label มา ไม่ได้ตั้ง id เอง
   * ไม่ผูกไว้ โปรแกรมอ่านหน้าจอจะอ่านช่องในกล่องว่า "ช่องกรอก" เฉย ๆ ไม่รู้ว่าเป็นช่องอะไร
   * ลูกที่เป็นกล่องห่อหลายชิ้น (เช่น ช่องค้นหาลูกค้า) ผูกไม่ได้ ต้องใส่ aria-label เอง
   */
  const id = useId();
  const kid =
    isValidElement<{ id?: string }>(children) &&
    typeof children.type === "string" &&
    ["input", "select", "textarea"].includes(children.type) &&
    !children.props.id
      ? cloneElement(children, { id })
      : children;

  return (
    /* data-miss ให้ฟอร์มหาช่องแรกที่ยังไม่ผ่านแล้วเลื่อนไปหาได้ตอนกดบันทึกไม่ผ่าน */
    <div className="mb-[15px]" data-miss={error ? "1" : undefined}>
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold text-muted-foreground">
        {label}
        {labelNote && <small className="ml-1.5 text-[11.5px] font-normal">{labelNote}</small>}
        {required && <em className="ml-0.5 text-primary not-italic">*</em>}
      </label>
      {kid}
      {error ? (
        <p className="mt-1.5 text-[12.5px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

export function ActivityDialog({
  customerName,
  channels,
  onClose,
  onSubmit,
}: {
  customerName: string;
  channels: string[];
  onClose: () => void;
  onSubmit: (v: {
    date: string;
    channel: string;
    summary: string;
    nextAction: string;
    followUp: string;
  }) => void;
}) {
  const [date, setDate] = useState(() => todayIso());
  const [channel, setChannel] = useState(channels[0]);
  /* ช่องทางที่เพิ่งเพิ่มจากกล่องนี้ — ต่อท้ายรายการที่ส่งมาให้เห็นทันที */
  const [extra, setExtra] = useState<string[]>([]);
  const addChannel = useAddOption({ list: "leadChannel" }, (v) => {
    setExtra((x) => (channels.includes(v) || x.includes(v) ? x : [...x, v]));
    setChannel(v);
  });
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [touched, setTouched] = useState(false);

  /* ต้นแบบ lead-detail.html — ข้อความเดียวใต้ฟอร์มเมื่อวันที่หรือสรุปผลว่าง */
  const bad = touched && (!summary.trim() || !date);

  return (
    <Sheet
      title="บันทึกการติดต่อ"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn glass-thin flex-1 justify-center sm:flex-none"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            onClick={() => {
              setTouched(true);
              if (!summary.trim() || !date) return;
              onSubmit({ date, channel, summary: summary.trim(), nextAction: nextAction.trim(), followUp });
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-muted-foreground">{customerName}</p>

      <Field label="วันที่ติดต่อ" required>
        <DateField
          value={date}
          onChange={(iso) => setDate(iso)}
          label="วันที่ติดต่อ"
          max={todayIso()}
        />
      </Field>

      <Field label="ช่องทาง" required>
        <div className="flex flex-wrap gap-1.5">
          {[...channels, ...extra].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              className={`rounded-[10px] border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                channel === c
                  ? "border-primary bg-accent text-primary"
                  : "border-border bg-white text-muted-foreground hover:border-muted-foreground/40"
              }`}
            >
              {c}
            </button>
          ))}
          {addChannel.canAdd && (
            <button
              type="button"
              onClick={() => addChannel.pick("__add_option__")}
              className="rounded-[10px] border border-dashed border-border px-3 py-1.5 text-[12.5px] font-medium text-primary hover:border-primary"
            >
              ＋ เพิ่ม
            </button>
          )}
        </div>
      </Field>
      {addChannel.dialog}

      <Field label="สรุปผลการพูดคุย" required>
        <textarea
          value={summary}
          onChange={(e) => {
            setSummary(e.target.value);
            setTouched(false);
          }}
          placeholder="คุยเรื่องอะไร ลูกค้าตอบว่าอย่างไร"
          aria-invalid={bad && !summary.trim()}
          className={`field-control h-[84px] resize-y py-2.5 leading-relaxed ${bad && !summary.trim() ? "border-destructive" : ""}`}
        />
      </Field>

      <Field label="สิ่งที่ต้องทำต่อ">
        <input
          value={nextAction}
          onChange={(e) => setNextAction(e.target.value)}
          placeholder="เช่น ส่งใบเสนอราคาทางอีเมล"
          className="field-control"
        />
      </Field>

      <Field label="วันนัดติดตามครั้งถัดไป" hint="ใส่ไว้เพื่อให้ขึ้นเตือนบนไทม์ไลน์">
        <DateField
          value={followUp}
          onChange={(iso) => setFollowUp(iso)}
          label="วันนัดติดตามครั้งถัดไป"
          clearable
        />
      </Field>
      {bad && (
        <p role="alert" className="text-[12.5px] text-destructive">
          ต้องระบุวันที่ติดต่อและสรุปผลการพูดคุย
        </p>
      )}
    </Sheet>
  );
}

export function CloseLeadDialog({
  customerName,
  code,
  onClose,
  onSubmit,
}: {
  customerName: string;
  /** รหัสผู้สนใจ — ขึ้นคู่กับชื่อใต้หัวกล่อง ตามต้นแบบ lead-detail.html */
  code?: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const addReason = useAddOption({ list: "leadClose" }, setReason);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  return (
    <Sheet
      title="ปฏิเสธรายการนี้"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn glass-thin flex-1 justify-center sm:flex-none"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            onClick={() => {
              setTouched(true);
              if (!reason) return;
              onSubmit(note.trim() ? `${reason} — ${note.trim()}` : reason);
            }}
          >
            ยืนยันปฏิเสธ
          </button>
        </>
      }
    >
      <p className="mb-4 text-[13px] text-muted-foreground">
        {customerName}
        {code ? ` · ${code}` : ""}
      </p>

      <Field
        label="เหตุผล"
        required
        error={touched && !reason ? "เลือกเหตุผลก่อนยืนยัน" : undefined}
      >
        <select
          value={reason}
          onChange={(e) => addReason.pick(e.target.value) || setReason(e.target.value)}
          className="field-control cursor-pointer"
        >
          <option value="">— เลือกเหตุผล —</option>
          {optionsOf("leadClose").map((r) => (
            <option key={r}>{r}</option>
          ))}
          {addReason.option}
        </select>
      </Field>
      {addReason.dialog}

      <Field label="รายละเอียดเพิ่มเติม" labelNote="ถ้ามี">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="บันทึกไว้ให้คนอื่นเข้าใจบริบท"
          className="field-control h-[78px] resize-y py-2.5 leading-relaxed"
        />
      </Field>
    </Sheet>
  );
}

/** รับช่วงดูแลผู้สนใจที่เป็นของคนอื่น — ต้องบอกเหตุผล เพราะเปลี่ยนเจ้าของงาน */
export function TakeOverDialog({
  customerName,
  currentOwner,
  onClose,
  onSubmit,
}: {
  customerName: string;
  currentOwner: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const addReason = useAddOption({ list: "leadTakeover" }, setReason);
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  return (
    <Sheet
      title="รับช่วงดูแล"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            className="btn glass-thin flex-1 justify-center sm:flex-none"
            onClick={onClose}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
            onClick={() => {
              setTouched(true);
              if (!reason) return;
              onSubmit(note.trim() ? `${reason} — ${note.trim()}` : reason);
            }}
          >
            ยืนยันรับช่วง
          </button>
        </>
      }
    >
      <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
        {customerName} · ตอนนี้อยู่ในความดูแลของ{" "}
        <b className="font-medium text-foreground">{currentOwner}</b> — รับช่วงแล้วรายการนี้จะ
        มาอยู่กับคุณ และบันทึกลงประวัติการเปลี่ยนแปลง
      </p>

      <Field
        label="เหตุผล"
        required
        error={touched && !reason ? "เลือกเหตุผลก่อนยืนยัน" : undefined}
      >
        <select
          value={reason}
          onChange={(e) => addReason.pick(e.target.value) || setReason(e.target.value)}
          className="field-control cursor-pointer"
        >
          <option value="">— เลือกเหตุผล —</option>
          {optionsOf("leadTakeover").map((r) => (
            <option key={r}>{r}</option>
          ))}
          {addReason.option}
        </select>
      </Field>
      {addReason.dialog}

      <Field label="รายละเอียดเพิ่มเติม">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="บันทึกไว้ให้คนอื่นเข้าใจบริบท"
          className="field-control h-[78px] resize-y py-2.5 leading-relaxed"
        />
      </Field>
    </Sheet>
  );
}
