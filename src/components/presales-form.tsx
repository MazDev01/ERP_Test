"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Customer, Urgency } from "@/lib/crm-data";
import { addPresalesRequest, useCrm } from "@/lib/crm-store";
import { addDays, todayIso } from "@/lib/format";
import { useHydrated } from "@/lib/pwa";
import { CustomerCombo } from "./customer-combo";
import { FileDrop, type PickedFile } from "./file-drop";
import { CheckIcon, ChevronLeftIcon } from "./icons";
import { Field } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";

/*
 * หน้าส่งคำขอก่อนการขาย — ตามต้นแบบ presales-new.html (หน้าเต็ม ไม่ใช่กล่องเด้ง)
 * ?customer=<รหัส> = กดมาจากหน้าผู้สนใจ เลือกลูกค้าไว้ให้
 * ส่งแล้วขึ้นแถบสำเร็จด้านบน แล้วล้างฟอร์มให้ส่งคำขอถัดไปได้เลย
 */

const KINDS = [
  { key: "BD" as const, label: "BD", detail: "ทำข้อเสนอเชิงธุรกิจ ราคา แพ็กเกจ" },
  { key: "SA" as const, label: "SA", detail: "วิเคราะห์ขอบเขตและความเป็นไปได้ทางเทคนิค" },
];

const URGENCIES: { key: Urgency; detail: string }[] = [
  { key: "ปกติ", detail: "ตามคิวงาน" },
  { key: "ด่วน", detail: "ขอให้จัดลำดับก่อนงานอื่น" },
  { key: "ด่วนมาก", detail: "ต้องระบุเหตุผล" },
];

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

  return (
    <div className="space-y-4">
      <div className="bar">
        <div className="min-w-0">
          <Link href="/presales" className="btn glass-thin btn-mini mb-1.5">
            <ChevronLeftIcon className="size-3.5" strokeWidth={2.4} />
            คำขอก่อนการขาย
          </Link>
          <h1>ส่งคำขอก่อนการขาย</h1>
          <p>ส่งใบงานให้ BD หรือ SA จัดทำข้อเสนอ</p>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] space-y-4">
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
  const [kind, setKind] = useState<"BD" | "SA" | "">("");
  const [problem, setProblem] = useState("");
  const [budget, setBudget] = useState("");
  const [due, setDue] = useState(() => addDays(today, 7));
  const [urgency, setUrgency] = useState<Urgency>("ปกติ");
  const [urgentReason, setUrgentReason] = useState("");
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [touched, setTouched] = useState(false);
  /** กำลังส่ง — หมุนรอราว 1.2 วินาทีก่อนบันทึก ตาม mockup */
  const [saving, setSaving] = useState(false);

  const problems = {
    customer: !customer,
    kind: !kind,
    problem: !problem.trim(),
    due: !due,
    reason: urgency === "ด่วนมาก" && !urgentReason.trim(),
  };
  const blocked = Object.values(problems).some(Boolean);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (blocked || !customer || !kind || saving) return;
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
      problem: problem.trim(),
      due,
      urgency,
      urgentReason: urgency === "ด่วนมาก" ? urgentReason.trim() : "",
      budget: Number(budget.replace(/\D/g, "")) || 0,
      /* ลิงก์เก็บเป็นที่อยู่เต็ม ไฟล์เก็บชื่อ — ยังไม่มีที่เก็บไฟล์จริง */
      attachments: files.map((f) => f.url ?? f.name),
    });
    /* บอกเลขที่คำขอที่เพิ่งสร้างด้วย — ต้องใช้อ้างอิงเวลาตามงานกับทีมก่อนการขาย
       (เจ้าของแจ้ง 25 ก.ย. 2569 ว่าส่งแล้วไม่รู้ว่าได้เลขอะไร) */
    onCreated([
      `ส่งคำขอ ${kind} ให้ ${customer.name} เรียบร้อย`,
      `เลขที่คำขอ ${no}`,
      `แนบไฟล์ ${files.length} รายการ`,
      "สถานะ รอรับงาน",
    ]);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <section className={card}>
        <h2 className={h2}>ผู้สนใจและความเร่งด่วน</h2>

        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="ผู้สนใจ" required error={touched && problems.customer ? "เลือกผู้สนใจก่อน" : undefined}>
            <CustomerCombo
              /* ต้นแบบ presales-new ไม่มีรายที่ปฏิเสธแล้วในรายการ — ส่งคำขอให้คนที่ไม่เอาแล้วไม่มีประโยชน์ */
              customers={crm.customers.filter((c) => c.status !== "ปฏิเสธ")}
              value={customer}
              onChange={setCustomer}
              invalid={touched && problems.customer}
            />
          </Field>

          <Field label="ระดับความเร่งด่วน" required>
            {/* มือถือก็วางสามช่องในแถวเดียว กดสลับได้ทันทีโดยไม่ต้องเลื่อนผ่านการ์ดยาว ๆ */}
            <div className="grid grid-cols-3 gap-2">
              {URGENCIES.map((u) => (
                <button
                  key={u.key}
                  type="button"
                  /* ปุ่มสลับสถานะ ต้องบอกโปรแกรมอ่านหน้าจอด้วยว่าอันไหนถูกเลือก ไม่ใช่รู้จากสีอย่างเดียว */
                  aria-pressed={urgency === u.key}
                  onClick={() => setUrgency(u.key)}
                  className={`rounded-xl border-[1.4px] px-3 py-2.5 text-left transition-colors max-sm:px-2.5 ${
                    urgency === u.key
                      ? u.key === "ด่วนมาก"
                        ? "border-destructive bg-[var(--destructive-soft)] text-destructive"
                        : "border-primary bg-accent text-primary"
                      : "border-border bg-white text-muted-foreground hover:border-muted-foreground/40"
                  }`}
                >
                  <b className="block text-[13.5px] font-semibold">{u.key}</b>
                  <small className="mt-0.5 block text-[11.5px] opacity-80">{u.detail}</small>
                </button>
              ))}
            </div>
          </Field>
        </div>

        {urgency === "ด่วนมาก" && (
          <Field
            label="เหตุผลที่ต้องด่วนมาก"
            required
            error={touched && problems.reason ? "กรอกเหตุผลเมื่อเลือกด่วนมาก" : undefined}
          >
            <textarea
              value={urgentReason}
              onChange={(e) => setUrgentReason(e.target.value)}
              placeholder="เช่น ลูกค้าต้องใช้ยื่นประมูลวันที่ 15 หรือคู่แข่งยื่นข้อเสนอไปแล้ว"
              className="field-control h-[76px] resize-y py-2.5 leading-relaxed"
            />
          </Field>
        )}
      </section>

      <section className={card}>
        <h2 className={h2}>รายละเอียดงาน</h2>

        <Field label="ประเภทงาน" required error={touched && problems.kind ? "เลือกประเภทงาน" : undefined}>
          <div className="grid grid-cols-2 gap-2">
            {KINDS.map((k) => (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                className={`rounded-xl border-[1.4px] px-3.5 py-3 text-left transition-colors ${
                  kind === k.key
                    ? "border-primary bg-accent text-primary"
                    : "border-border bg-white text-muted-foreground hover:border-muted-foreground/40"
                }`}
              >
                <b className="block text-[13.5px] font-semibold">{k.label}</b>
                <small className="mt-0.5 block text-[11.5px] opacity-80">{k.detail}</small>
              </button>
            ))}
          </div>
        </Field>

        <Field
          label="โจทย์จากลูกค้า"
          required
          error={touched && problems.problem ? "กรอกโจทย์จากลูกค้า" : undefined}
          hint="ยิ่งละเอียด ยิ่งลดรอบการถามกลับ"
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
            hint="ช่วยให้ผู้จัดทำเลือกขนาดของข้อเสนอได้ตรงขึ้น"
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
      <div className="flex justify-end gap-2.5 max-sm:sticky max-sm:bottom-[calc(var(--botbar)+10px)] max-sm:z-10 max-sm:rounded-2xl max-sm:border max-sm:border-border max-sm:bg-card max-sm:p-2.5 max-sm:shadow-[0_-6px_16px_-10px_rgb(0_0_0/0.25)] max-sm:[&>.btn]:h-11 max-sm:[&>.btn]:justify-center">
        <button type="button" className="btn glass-thin max-sm:flex-1" onClick={onCancel}>
          ยกเลิก
        </button>
        <button type="submit" className="btn solid btn-solid max-sm:flex-[2]" disabled={saving}>
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
