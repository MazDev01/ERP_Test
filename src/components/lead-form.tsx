"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { optionsOf } from "@/lib/options";
import { addLead, useCrm } from "@/lib/crm-store";
import { todayIso } from "@/lib/format";
import { Field, Sheet } from "./lead-dialogs";
import { BranchInput } from "./lead-facts";
import type { BuyerType } from "@/lib/crm-data";

import { DateField } from "./thai-date-picker";
import { useAddOption } from "./add-option";
/** จัดรูปแบบเบอร์โทรระหว่างพิมพ์ ให้เก็บเหมือนกันทั้งระบบ */
function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

/** ฟอร์มเพิ่มผู้สนใจ ใช้ร่วมกันทั้งหน้าเต็มและป็อบอัพ — ปุ่มบันทึกอยู่นอกฟอร์มได้ด้วย formId */
export function LeadForm({
  formId,
  onCreated,
  bare = false,
  step,
  onStep,
}: {
  formId: string;
  /** เรียกเมื่อบันทึกสำเร็จ พร้อมรหัสผู้สนใจที่เพิ่งสร้าง */
  onCreated: (code: string) => void;
  /** อยู่ในป็อบอัพแล้ว ไม่ต้องมีการ์ดกระจกซ้อนการ์ดอีกชั้น */
  bare?: boolean;
  /**
   * แบ่งฟอร์มเป็นสองขั้น: 1 ข้อมูลผู้สนใจ → 2 การติดต่อครั้งแรก (ผู้ใช้สั่ง 14 ต.ค. 2569)
   * ไม่ส่งมา = แสดงทั้งสองส่วนในหน้าเดียวเหมือนเดิม
   * ทั้งสองส่วนยังอยู่ในฟอร์มเดียวกันตลอด (แค่ซ่อน) ค่าที่กรอกจึงไม่หายตอนย้อนกลับ
   */
  step?: 1 | 2;
  onStep?: (step: 1 | 2) => void;
}) {
  const card = bare ? "" : "glass rounded-2xl px-4 py-5 sm:px-6";
  const crm = useCrm();
  const today = todayIso();

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [source, setSource] = useState("");
  /* สามช่องนี้คือสิ่งที่ใบกำกับภาษีบังคับ ถามตั้งแต่ตอนเพิ่ม จะได้ไม่ต้องย้อนมากรอกตอนบัญชีจะออกใบเสร็จ */
  const [buyerType, setBuyerType] = useState<BuyerType>("juristic");
  const [legalName, setLegalName] = useState("");
  const [branch, setBranch] = useState("");
  const juristic = buyerType === "juristic";

  const [date, setDate] = useState(today);
  const [channel, setChannel] = useState("");
  const addSource = useAddOption({ list: "leadSource" }, setSource);
  const addChannel = useAddOption({ list: "leadChannel" }, setChannel);
  const [summary, setSummary] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUp, setFollowUp] = useState("");

  /* ขั้น 1 กับขั้น 2 ขึ้นกรอบแดงแยกกัน — เพิ่งผ่านขั้น 1 มา ขั้น 2 ยังไม่ควรแดงทั้งที่ยังไม่ได้กรอก */
  const [touched1, setTouched1] = useState(false);
  const [touched, setTouched] = useState(false);
  const stepping = step !== undefined;
  /* เคยไปขั้น 2 แล้วหรือยัง — ตอนเปิดกล่องครั้งแรกขั้น 1 ไม่ต้องเลื่อนเข้า มีแค่ตอนย้อนกลับ
     (ส่วนที่ซ่อนด้วย hidden แล้วโผล่กลับมา เบราว์เซอร์เล่นแอนิเมชันใหม่เอง ไม่ต้องเปลี่ยน key) */
  const [reached2, setReached2] = useState(false);
  const show1 = !stepping || step === 1;
  const show2 = !stepping || step === 2;
  const [busy, setBusy] = useState(false);

  /** เลื่อนกล่องกลับขึ้นบนสุดตอนสลับขั้น — ไม่งั้นขั้นใหม่จะเปิดค้างกลางหน้าเท่าที่เลื่อนไว้ */
  function scrollTop() {
    requestAnimationFrame(() => {
      const form = document.getElementById(formId);
      form?.closest(".ui-sheet-body")?.scrollTo({ top: 0 });
    });
  }

  function goStep(s: 1 | 2) {
    if (s === 2) setReached2(true);
    onStep?.(s);
    scrollTop();
  }

  /** ไปช่องแรกที่ยังกรอกไม่ครบ (ช่องที่ Field ติด data-miss ไว้) */
  function focusMissing() {
    /*
     * กรอกไม่ครบแล้วกดบันทึก ต้องพาไปที่ช่องที่ยังขาด (เจ้าของแจ้ง 25 ก.ย. 2569)
     * บนมือถือปุ่มบันทึกติดอยู่ท้ายกล่อง ส่วนช่องที่ขาดอยู่บนสุดหรือกลางฟอร์ม
     * กดแล้วไม่เห็นข้อความเตือน จะดูเหมือนปุ่มเสีย
     */
    requestAnimationFrame(() => {
      const first = document.querySelector<HTMLElement>(`#${formId} [data-miss="1"]`);
      first?.scrollIntoView({ behavior: "smooth", block: "center" });
      first?.focus?.();
    });
  }

  /** เบอร์ซ้ำมักแปลว่าเป็นลูกค้าเดิม — เตือนไว้ก่อนจะได้ไม่มีข้อมูลซ้ำสองรายการ */
  const duplicate = useMemo(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) return null;
    return (
      crm.customers.find((c) => c.phone.replace(/\D/g, "") === digits) ?? null
    );
  }, [crm.customers, phone]);

  const phoneDigits = phone.replace(/\D/g, "");
  const badPhone = phoneDigits.length > 0 && phoneDigits.length < 9;
  const problems = {
    name: !name.trim(),
    phone: badPhone,
    channel: !channel,
    summary: !summary.trim(),
  };
  const blocked = Object.values(problems).some(Boolean);
  const step1Blocked = problems.name || problems.phone;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    /* ขั้น 1: กด "ถัดไป" (ปุ่ม submit ของฟอร์มเดียวกัน) — ตรวจเฉพาะช่องของขั้นนี้แล้วค่อยไปขั้น 2 */
    if (stepping && step === 1) {
      setTouched1(true);
      if (step1Blocked) {
        focusMissing();
        return;
      }
      goStep(2);
      return;
    }
    setTouched1(true);
    setTouched(true);
    if (blocked || busy) {
      /* กันไว้เผื่อช่องขั้น 1 ยังขาด (เช่นกด Enter ข้ามมา) — พากลับไปขั้น 1 ก่อน */
      if (stepping && step1Blocked) {
        goStep(1);
        setTimeout(focusMissing, 50);
        return;
      }
      focusMissing();
      return;
    }
    setBusy(true);
    const code = addLead({
      name: name.trim(),
      contact: contact.trim(),
      phone,
      email: email.trim(),
      address: address.trim(),
      source,
      /* เลขภาษีกรอกตอนสร้างใบเสนอราคา (ผู้ใช้สั่ง 5 ต.ค. 2569) */
      taxId: "",
      type: buyerType,
      legalName: legalName.trim(),
      branch,
      activity: {
        date,
        channel,
        summary: summary.trim(),
        nextAction: nextAction.trim(),
        followUp,
      },
    });
    onCreated(code);
  }

  return (
    <form id={formId} onSubmit={submit} noValidate className="space-y-4">
      {/* ไม่โชว์รหัสผู้สนใจที่จะได้ — รหัสภายในห้ามขึ้นจอ (ผู้ใช้สั่ง 14 ต.ค. 2569) */}
      <section className={`${card} ${reached2 ? "step-in-back" : ""}`} hidden={!show1}>
        {/* โหมดสองขั้นมีตัวบอกขั้นที่หัวกล่องแล้ว ไม่ต้องมีหัวข้อซ้ำ */}
        {!stepping && (
          <h2 className="mb-4 border-b border-border pb-3 text-[15px] font-semibold">ข้อมูลผู้สนใจ</h2>
        )}
        <div className="grid gap-x-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="ชื่อผู้สนใจ / ชื่อบริษัท"
              required
              error={touched1 && problems.name ? "กรอกชื่อผู้สนใจหรือชื่อบริษัท" : undefined}
            >
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="เช่น เทคโซลูชั่น จำกัด"
                className="field-control"
              />
            </Field>
          </div>

          <Field label="ชื่อผู้ติดต่อ">
            <input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="เช่น สมชาย พันธ์แก้ว"
              className="field-control"
            />
          </Field>

          <Field
            label="เบอร์โทรศัพท์"
            error={touched1 && problems.phone ? "เบอร์โทรศัพท์ต้องมี 9–10 หลัก" : undefined}
          >
            <input
              value={phone}
              aria-label="เบอร์โทรศัพท์"
              inputMode="numeric"
              onChange={(e) => setPhone(formatPhone(e.target.value))}
              placeholder="081-234-5678"
              className="field-control"
            />
            {duplicate && (
              <p className="mt-2 rounded-lg bg-[var(--warning-soft)] px-3 py-2 text-[12.5px] leading-relaxed text-[var(--warning)]">
                เบอร์นี้มีอยู่แล้วในระบบ:{" "}
                <Link href={`/leads/${duplicate.code}`} className="font-semibold underline">
                  {duplicate.name}
                </Link>{" "}
                — ตรวจสอบก่อนบันทึกซ้ำ
              </p>
            )}
          </Field>

          <Field label="อีเมล">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="somchai@example.com"
              className="field-control"
            />
          </Field>

          <Field label="แหล่งที่มา">
            <select
              value={source}
              onChange={(e) => addSource.pick(e.target.value) || setSource(e.target.value)}
              className="field-control cursor-pointer"
            >
              <option value="">— เลือก —</option>
              {optionsOf("leadSource").map((s) => (
                <option key={s}>{s}</option>
              ))}
              {addSource.option}
            </select>
          </Field>
          {addSource.dialog}

          <div className="sm:col-span-2">
            {/* ไม่บังคับตอนนี้ แต่ถ้าไม่มี บัญชีจะออกใบกำกับภาษีให้ไม่ได้ตอนเก็บเงิน — บอกไว้ตั้งแต่ตรงนี้ */}
            <Field label="ที่อยู่">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ที่อยู่สำหรับออกเอกสาร"
                className="field-control h-[84px] resize-y py-2.5 leading-relaxed"
              />
            </Field>
          </div>

          <Field label="ประเภทผู้ซื้อ">
            <select
              value={buyerType}
              onChange={(e) => setBuyerType(e.target.value as BuyerType)}
              className="field-control cursor-pointer"
            >
              <option value="juristic">นิติบุคคล</option>
              <option value="individual">บุคคลธรรมดา</option>
            </select>
          </Field>

          {juristic && (
            <>
              <div className="sm:col-span-2">
                <Field
                  label="ชื่อตามหนังสือรับรอง"
                >
                  <input
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="เช่น บริษัท เทคโซลูชั่น จำกัด"
                    className="field-control"
                  />
                </Field>
              </div>

              <Field
                label="สำนักงานใหญ่ / สาขา"
              >
                <BranchInput value={branch} onChange={setBranch} />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className={`${card} ${stepping ? "step-in-next" : ""}`} hidden={!show2}>
        {!stepping && (
          <h2 className="mb-4 border-b border-border pb-3 text-[15px] font-semibold">การติดต่อครั้งแรก</h2>
        )}
        <div className="grid gap-x-5 sm:grid-cols-2">
          <Field label="วันที่ติดต่อ" required>
            <DateField
              value={date}
              onChange={(iso) => setDate(iso)}
              label="วันที่ติดต่อ"
              max={today}
            />
          </Field>

          <Field
            label="ช่องทาง"
            required
            error={touched && problems.channel ? "เลือกช่องทางการติดต่อ" : undefined}
          >
            <select
              value={channel}
              onChange={(e) => addChannel.pick(e.target.value) || setChannel(e.target.value)}
              className="field-control cursor-pointer"
            >
              <option value="">— เลือก —</option>
              {optionsOf("leadChannel").map((c) => (
                <option key={c}>{c}</option>
              ))}
              {addChannel.option}
            </select>
          </Field>
          {addChannel.dialog}

          <div className="sm:col-span-2">
            <Field
              label="สรุปผลการพูดคุย"
              required
              error={touched && problems.summary ? "กรอกสรุปผลการพูดคุย" : undefined}
            >
              <textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="ลูกค้าสอบถามอะไร ต้องการอะไร มีข้อจำกัดอะไร"
                className="field-control h-[100px] resize-y py-2.5 leading-relaxed"
              />
            </Field>
          </div>

          <div className="sm:col-span-2">
            <Field label="สิ่งที่ต้องทำต่อ">
              <input
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="เช่น ส่งพอร์ตงานทางอีเมล"
                className="field-control"
              />
            </Field>
          </div>

          <Field label="นัดติดตามครั้งถัดไป">
            <DateField
              value={followUp}
              onChange={(iso) => setFollowUp(iso)}
              label="นัดติดตามครั้งถัดไป"
              clearable
            />
          </Field>
        </div>
      </section>
    </form>
  );
}

/** ป็อบอัพเพิ่มผู้สนใจ — สองขั้น: ข้อมูลผู้สนใจ → การติดต่อครั้งแรก (ผู้ใช้สั่ง 14 ต.ค. 2569) */
export function LeadNewDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const formId = "lead-new-dialog";

  function back() {
    setStep(1);
    requestAnimationFrame(() => {
      document.getElementById(formId)?.closest(".ui-sheet-body")?.scrollTo({ top: 0 });
    });
  }

  return (
    <Sheet
      title="เพิ่มผู้สนใจ"
      onClose={onClose}
      steady
      subhead={<StepIndicator step={step} />}
      footer={
        step === 1 ? (
          <>
            <button key="cancel" type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
              ยกเลิก
            </button>
            {/* ปุ่ม submit ของฟอร์ม — ฟอร์มตรวจช่องขั้น 1 เองแล้วค่อยพาไปขั้น 2 */}
            <button key="next" type="submit" form={formId} className="btn solid btn-solid flex-1 justify-center sm:flex-none">
              ถัดไป
            </button>
          </>
        ) : (
          <>
            <button key="back" type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={back}>
              ย้อนกลับ
            </button>
            <button key="save" type="submit" form={formId} className="btn solid btn-solid flex-1 justify-center sm:flex-none">
              บันทึกผู้สนใจ
            </button>
          </>
        )
      }
    >
      <LeadForm formId={formId} onCreated={onCreated} bare step={step} onStep={setStep} />
    </Sheet>
  );
}

/** ตัวบอกขั้นของกล่องสองขั้น — ส่ง labels มาเองได้ เช่นกล่องเพิ่มพนักงาน (ผู้ใช้สั่ง 15 ต.ค. 2569) */
export function StepIndicator({
  step,
  labels = ["ข้อมูลผู้สนใจ", "การติดต่อครั้งแรก"],
}: {
  step: 1 | 2;
  labels?: readonly [string, string];
}) {
  const items = [
    { n: 1, label: labels[0] },
    { n: 2, label: labels[1] },
  ] as const;
  return (
    <ol className="flex items-center gap-2 text-[13px]" aria-label="ขั้นตอน">
      {items.map((it, i) => {
        const active = it.n === step;
        const done = it.n < step;
        return (
          <li key={it.n} className="flex min-w-0 items-center gap-2" aria-current={active ? "step" : undefined}>
            {i > 0 && <span aria-hidden className="text-muted-foreground">·</span>}
            <span
              className={`grid size-5 flex-none place-items-center rounded-full text-[11.5px] font-bold ${
                active || done ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              {it.n}
            </span>
            <span className={`truncate ${active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
              {it.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
