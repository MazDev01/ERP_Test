"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { Customer } from "@/lib/crm-data";
import { addPresalesRequest, useCrm } from "@/lib/crm-store";
import { hrPos } from "@/lib/hr-data";
import { services } from "@/lib/pm-data";
import { canTakeService, empAssignee } from "@/lib/presales-work";
import { useHr } from "@/lib/hr-store";
import { displayName, nameHay } from "@/lib/emp-name";
import { addDays, todayIso } from "@/lib/format";
import { useHydrated } from "@/lib/pwa";
import { CustomerCombo } from "./customer-combo";
import { FileDrop, type PickedFile } from "./file-drop";
import { CheckIcon, ChevronLeftIcon } from "./icons";
import { useCrumb } from "@/lib/crumb";
import { Field } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";

/*
 * หน้าส่งคำขอก่อนการขาย — ตามต้นแบบ presales-new.html (หน้าเต็ม ไม่ใช่กล่องเด้ง)
 * ?customer=<รหัส> = กดมาจากหน้าผู้สนใจ เลือกลูกค้าไว้ให้
 * ส่งแล้วขึ้นแถบสำเร็จด้านบน แล้วล้างฟอร์มให้ส่งคำขอถัดไปได้เลย
 */

/* ช่องระดับความเร่งด่วนเอาออก — คำขอใหม่บันทึกเป็น "ปกติ" (ผู้ใช้สั่ง 14 ต.ค. 2569) */

export function PresalesNewPage() {
  /* รอ hydrate ก่อน — ลูกค้าที่เพิ่งเพิ่มในเครื่องต้องหาเจอตอนเปิดจากลิงก์ ?customer= */
  const hydrated = useHydrated();
  return hydrated ? <PresalesNewBody /> : null;
}

function PresalesNewBody() {
  const params = useSearchParams();
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [preset, setPreset] = useState(params.get("customer") ?? undefined);
  const [done, setDone] = useState<string[] | null>(null);
  /* เส้นทางบนแถบบน "ขอทำข้อเสนอ / ส่งโจทย์ใหม่" (ผู้ใช้สั่ง 12 ต.ค. 2569) */
  useCrumb("ส่งโจทย์ใหม่");

  return (
    <div className="space-y-4">
      <div className="bar">
        <div className="min-w-0">
          {/* ปุ่มกลับเหลือเฉพาะมือถือ — จอคอมใช้เส้นทางบนแถบบน (ผู้ใช้สั่ง 12 ต.ค. 2569) */}
          <span className="md:hidden">
            <Link href="/presales" className="btn glass-thin btn-mini mb-1.5">
              <ChevronLeftIcon className="size-3.5" strokeWidth={2.4} />
              ขอทำข้อเสนอ
            </Link>
          </span>
          <h1>ส่งโจทย์ใหม่</h1>
        </div>
      </div>

      {/* ฟอร์มเต็มความกว้าง ไม่เว้นซ้ายขวา (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      <div className="space-y-4">
        {done && (
          <p
            role="status"
            className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[14px] bg-[var(--success-soft)] px-4 py-3 text-[13.5px] font-semibold text-[var(--success)]"
          >
            <CheckIcon className="size-4 shrink-0" strokeWidth={2.4} />
            {done.map((t, i) => (
              <span key={t}>
                {i > 0 && <span className="mr-3 opacity-50">·</span>}
                {t}
              </span>
            ))}
          </p>
        )}
        <PresalesForm
          key={formKey}
          presetCustomer={preset}
          onCreated={(msg) => {
            setDone(msg);
            setPreset(undefined);
            setFormKey((k) => k + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          /* ยกเลิก = ออกจากฟอร์ม กลับไปหน้ารายการคำขอ (เจ้าของแจ้ง 25 ก.ย. 2569)
             เดิมล้างฟอร์มให้ว่างเฉย ๆ ฟอร์มที่ยังไม่ได้กรอกอะไรกดแล้วจึงเหมือนปุ่มเสีย */
          onCancel={() => router.push("/presales")}
        />
      </div>
    </div>
  );
}

function PresalesForm({
  presetCustomer,
  onCreated,
  onCancel,
}: {
  /** รหัสลูกค้าที่ตั้งไว้ล่วงหน้า เช่น กดมาจากหน้ารายละเอียดลูกค้า */
  presetCustomer?: string;
  onCreated: (msg: string[]) => void;
  onCancel: () => void;
}) {
  const card = "glass rounded-2xl px-4 py-5 sm:px-6";
  const h2 = "mb-4 border-b border-border pb-3 text-[15px] font-semibold";
  const crm = useCrm();
  const today = todayIso();

  const [customer, setCustomer] = useState<Customer | null>(
    () => crm.customers.find((c) => c.code === presetCustomer) ?? null,
  );
  /* "ส่งให้" = เลือกตัวคน (พนักงานที่ยังทำงานอยู่ทุกคน) — เลิกส่งตามประเภทงาน (ผู้ใช้สั่ง 14 ต.ค. 2569)
     ประเภทงานยังเลือกเป็นข้อมูลของคำขอ แต่ไม่ได้กำหนดว่าใครเห็น */
  const hr = useHr();
  /* เฉพาะคนที่มีบัญชีเข้าระบบที่ใช้งานอยู่ — คนไม่มีบัญชีเปิดคิวงานไม่ได้ คำขอจะค้าง (ผู้ใช้สั่ง 15 ต.ค. 2569)
     คำขอที่ส่งไปแล้วเก็บผู้รับไว้ที่คำขอ (toEmp/assignee) ไม่กระทบ */
  const withAccount = hr.emp.filter((e) => e.status === "active" && e.account?.status === "active");
  const types = services().filter((x) => !("off" in x && x.off));
  const [service, setService] = useState("");
  const [toEmp, setToEmp] = useState("");
  /* เลือกประเภทงานก่อน แล้ว "ส่งให้" เหลือเฉพาะคนในตำแหน่งที่เกี่ยวข้อง (SERVICE_POS + SA/BD) (ผู้ใช้สั่ง 15 ต.ค. 2569) */
  const people = service ? withAccount.filter((e) => canTakeService(e, service)) : [];
  const person = people.find((e) => e.id === toEmp);
  /* SA = วิเคราะห์เทคนิค · ตำแหน่งอื่นเป็นข้อเสนอธุรกิจ — กติกาเดียวกับตอนเลือกคน (ผู้ใช้สั่ง 9 ต.ค. 2569) */
  const kind: "BD" | "SA" | "" = person ? (person.pos === "sa" ? "SA" : "BD") : "";
  const [problem, setProblem] = useState("");
  const [budget, setBudget] = useState("");
  const [due, setDue] = useState(() => addDays(today, 7));
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [touched, setTouched] = useState(false);
  /** กำลังส่ง — หมุนรอราว 1.2 วินาทีก่อนบันทึก ตาม mockup */
  const [saving, setSaving] = useState(false);

  const problems = {
    customer: !customer,
    service: !service,
    person: !person,
    problem: !problem.trim(),
    due: !due,
  };
  const blocked = Object.values(problems).some(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (blocked || !customer || !person || !kind || saving) return;
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      save(customer, kind);
    }, 1200);
  }

  function save(customer: Customer, kind: "BD" | "SA") {
    const no = addPresalesRequest({
      customerCode: customer.code,
      kind,
      assignee: person ? empAssignee(person) : "",
      service,
      toEmp,
      problem: problem.trim(),
      due,
      budget: Number(budget.replace(/\D/g, "")) || 0,
      /* ลิงก์เก็บเป็นที่อยู่เต็ม ไฟล์เก็บชื่อ — ยังไม่มีที่เก็บไฟล์จริง */
      attachments: files.map((f) => f.url ?? f.name),
    });
    /* ไม่บอกเลขที่คำขอ — รหัสอยู่ในฐานข้อมูลเท่านั้น (ผู้ใช้สั่ง 14 ต.ค. 2569) */
    onCreated([
      `ส่งคำขอของ ${customer.name} ให้ ${person ? empAssignee({ ...person, name: displayName(person) }) : ""} เรียบร้อย`,
      `แนบไฟล์ ${files.length} รายการ`,
      "สถานะ รอรับงาน",
    ]);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <section className={card}>
        <h2 className={h2}>ผู้สนใจ</h2>

        {/* ช่องผู้สนใจเต็มความกว้าง — ช่องความเร่งด่วนเอาออก (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
        <Field label="ผู้สนใจ" required error={touched && problems.customer ? "เลือกผู้สนใจก่อน" : undefined}>
          <CustomerCombo
            /* ต้นแบบ presales-new ไม่มีรายที่ปฏิเสธแล้วในรายการ — ส่งคำขอให้คนที่ไม่เอาแล้วไม่มีประโยชน์ */
            customers={crm.customers.filter((c) => c.status !== "ปฏิเสธ")}
            value={customer}
            onChange={setCustomer}
            invalid={touched && problems.customer}
          />
        </Field>
      </section>

      <section className={card}>
        <h2 className={h2}>รายละเอียดงาน</h2>

        {/* กล่องคำแนะนำสีเทาเอาออก (ผู้ใช้สั่ง 15 ต.ค. 2569)
            ประเภทงานมาก่อน (ซ้าย) แล้วจึงส่งให้ (ขวา) — รายชื่อกรองตามประเภทงาน (ผู้ใช้สั่ง 15 ต.ค. 2569) */}
        <div className="grid gap-x-6 sm:grid-cols-2">
        <Field
          label="ประเภทงาน"
          required
          error={touched && problems.service ? "เลือกประเภทงาน" : undefined}
        >
          <select
            value={service}
            onChange={(e) => {
              const next = e.target.value;
              setService(next);
              /* เปลี่ยนประเภทแล้วคนที่เลือกไว้ไม่อยู่ในตำแหน่งที่เกี่ยวข้อง — ล้างออก */
              const still = withAccount.find((x) => x.id === toEmp);
              if (!next || !still || !canTakeService(still, next)) setToEmp("");
            }}
            className="field-control cursor-pointer"
            aria-label="ประเภทงาน"
          >
            <option value="">— เลือกประเภทงาน —</option>
            {types.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="ส่งให้"
          required
          error={touched && problems.person ? (service ? "เลือกผู้รับคำขอ" : "เลือกประเภทงานก่อน") : undefined}
        >
          <PersonPicker
            options={people.map((e) => ({
              id: e.id,
              /* โชว์ชื่อเล่น ค้นได้ทั้งชื่อเล่นและชื่อจริง (ผู้ใช้สั่ง 19 ต.ค. 2569) */
              label: e.pos ? `${displayName(e)} · ${hrPos(e.pos).label}` : displayName(e),
              hay: `${nameHay(e)} ${e.pos ? hrPos(e.pos).label : ""}`,
            }))}
            value={toEmp}
            onChange={setToEmp}
            disabled={!service}
            placeholder={
              !service
                ? "เลือกประเภทงานก่อน"
                : people.length
                  ? "— เลือกผู้รับคำขอ —"
                  : "ไม่มีผู้รับสำหรับประเภทงานนี้"
            }
            invalid={touched && problems.person}
          />
        </Field>
        </div>

        <Field
          label="โจทย์จากลูกค้า"
          required
          error={touched && problems.problem ? "กรอกโจทย์จากลูกค้า" : undefined}
        >
          <textarea
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            placeholder="ลูกค้าต้องการอะไร มีปัญหาอะไรอยู่ ใช้ระบบอะไรอยู่เดิม มีข้อจำกัดอะไร"
            className="field-control h-[104px] resize-y py-2.5 leading-relaxed max-sm:h-[150px]"
          />
        </Field>

        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field
            label="งบประมาณโดยประมาณ"
            labelNote="ถ้าลูกค้าบอก"
          >
            <input
              value={budget}
              inputMode="numeric"
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "");
                setBudget(digits ? Number(digits).toLocaleString("th-TH") : "");
              }}
              placeholder="0"
              className="field-control num"
            />
          </Field>

          <Field
            label="ต้องการได้งานวันที่"
            required
            error={touched && problems.due ? "เลือกวันที่ต้องการได้งาน" : undefined}
          >
            <DateField value={due} onChange={(iso) => setDue(iso)} label="ต้องการได้งานวันที่" min={today} />
          </Field>
        </div>
      </section>

      <section className={card}>
        <h2 className={h2}>ไฟล์แนบ</h2>
        <FileDrop
          files={files}
          onChange={setFiles}
          hint="เอกสารที่ลูกค้าส่งมา ภาพหน้าจอระบบเดิม หรือ TOR"
          links
        />
      </section>

      {/* มือถือ: แถบปุ่มติดล่างจอเหนือแถบเมนู กดส่งได้ทุกเมื่อไม่ต้องเลื่อนลงสุดฟอร์ม */}
      {/* ปุ่มใหญ่แบ่งครึ่งซ้ายขวา (ผู้ใช้สั่ง 9 ต.ค. 2569) */}
      <div className="grid grid-cols-2 gap-3 [&>.btn]:h-12 [&>.btn]:justify-center [&>.btn]:text-[15px] max-sm:sticky max-sm:bottom-[calc(var(--botbar)+10px)] max-sm:z-10 max-sm:rounded-2xl max-sm:border max-sm:border-border max-sm:bg-card max-sm:p-2.5 max-sm:shadow-[0_-6px_16px_-10px_rgb(0_0_0/0.25)] max-sm:[&>.btn]:h-11 max-sm:[&>.btn]:justify-center">
        <button type="button" className="btn glass-thin" onClick={onCancel}>
          ยกเลิก
        </button>
        <button type="submit" className="btn solid btn-solid" disabled={saving}>
          {saving ? (
            <span
              aria-label="กำลังส่งคำขอ"
              className="block size-[18px] animate-spin rounded-full border-[2.5px] border-white/30 border-t-white"
            />
          ) : (
            "ส่งคำขอ"
          )}
        </button>
      </div>
    </form>
  );
}

/*
 * ดรอปดาวน์เลือกผู้รับคำขอ (ผู้ใช้สั่ง 15 ต.ค. 2569) — รายชื่อยาวได้ จึงไม่ใช้ select ของเบราว์เซอร์ที่กางสูงเต็มจอ
 * กล่องรายการสูงไม่เกิน 280px เลื่อนในกล่อง · มีช่องค้นหาด้านบน · ใช้คีย์บอร์ดได้ (ลูกศรขึ้นลง Enter Esc)
 */
function PersonPicker({
  options,
  value,
  onChange,
  disabled,
  placeholder,
  invalid,
}: {
  options: { id: string; label: string; hay?: string }[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const picked = options.find((o) => o.id === value);
  const term = q.trim().toLowerCase();
  const shown = term ? options.filter((o) => (o.hay ?? o.label).toLowerCase().includes(term)) : options;
  const empty = !options.length;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  /* เลื่อนรายการให้เห็นตัวที่เลือกด้วยคีย์บอร์ดอยู่เสมอ */
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-i="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor, open]);

  const show = () => {
    if (disabled || empty) return;
    setQ("");
    setCursor(Math.max(0, options.findIndex((o) => o.id === value)));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    btnRef.current?.focus();
  };
  const pick = (id: string) => {
    onChange(id);
    close();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(shown.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(Math.max(0, shown.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (shown[cursor]) pick(shown[cursor].id);
    } else if (e.key === "Escape" || e.key === "Tab") {
      if (e.key === "Escape") e.preventDefault();
      close();
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-label="ส่งให้"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={disabled || empty}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            show();
          }
        }}
        className={`field-control flex w-full cursor-pointer items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${
          invalid ? "border-destructive bg-[var(--destructive-soft)]" : ""
        }`}
      >
        <span className={`clip min-w-0 flex-1 ${picked ? "" : "text-muted-foreground"}`}>
          {picked ? picked.label : placeholder}
        </span>
        <span aria-hidden className="shrink-0 text-[11px] text-muted-foreground">
          ▾
        </span>
      </button>

      {open && (
        <div className="glass-solid absolute top-[calc(100%+6px)] right-0 left-0 z-90 rounded-[13px] p-1.5">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKey}
            placeholder="ค้นหาชื่อหรือตำแหน่ง"
            aria-label="ค้นหาผู้รับคำขอ"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={shown[cursor] ? `${listId}-${cursor}` : undefined}
            className="field-control mb-1.5 h-9 text-[13px]"
          />
          {shown.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">ไม่พบรายชื่อที่ค้นหา</p>
          ) : (
            <ul ref={listRef} id={listId} role="listbox" aria-label="ส่งให้" className="scroll-stable max-h-[280px] overflow-auto">
              {shown.map((o, i) => (
                <li
                  key={o.id}
                  id={`${listId}-${i}`}
                  data-i={i}
                  role="option"
                  aria-selected={o.id === value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(o.id);
                  }}
                  onMouseEnter={() => setCursor(i)}
                  className={`flex cursor-pointer items-center gap-2 rounded-[9px] px-[11px] py-2.5 text-[13.5px] transition-colors ${
                    i === cursor ? "bg-accent" : "hover:bg-accent/60"
                  }`}
                >
                  <span className="clip min-w-0 flex-1">{o.label}</span>
                  {o.id === value && <CheckIcon className="size-4 shrink-0 text-primary" strokeWidth={2.4} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
