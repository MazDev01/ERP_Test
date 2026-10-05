"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { optionsOf } from "@/lib/options";
import { addLead, nextLeadCode, useCrm } from "@/lib/crm-store";
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
}: {
  formId: string;
  /** เรียกเมื่อบันทึกสำเร็จ พร้อมรหัสผู้สนใจที่เพิ่งสร้าง */
  onCreated: (code: string) => void;
  /** อยู่ในป็อบอัพแล้ว ไม่ต้องมีการ์ดกระจกซ้อนการ์ดอีกชั้น */
  bare?: boolean;
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

  /* รหัสที่รายนี้จะได้เมื่อกดบันทึก — เลขเดินหน้าอย่างเดียว ไม่เอาเลขที่เคยออกไปแล้วกลับมาใช้ซ้ำ */
  const nextCode = useMemo(() => nextLeadCode(crm.customers), [crm.customers]);

  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (blocked || busy) {
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
      <section className={card}>
        <h2 className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border pb-3 text-[15px] font-semibold">
          ข้อมูลผู้สนใจ
          <span className="text-xs font-normal text-muted-foreground">
            รหัสที่จะได้ <b className="num font-semibold text-foreground">{nextCode}</b>
          </span>
        </h2>
        <div className="grid gap-x-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field
              label="ชื่อผู้สนใจ / ชื่อบริษัท"
              required
              error={touched && problems.name ? "กรอกชื่อผู้สนใจหรือชื่อบริษัท" : undefined}
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
            error={touched && problems.phone ? "เบอร์โทรศัพท์ต้องมี 9–10 หลัก" : undefined}
            hint={duplicate ? undefined : "ใช้ตรวจสอบข้อมูลซ้ำ"}
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
                  {duplicate.name} ({duplicate.code})
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
            <Field label="ที่อยู่" hint="ใช้เป็นที่อยู่จดทะเบียนบนใบกำกับภาษี — ไม่กรอกตอนนี้ก็ได้ แต่ต้องมีก่อนบัญชีออกใบเสร็จ">
              <textarea
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="ที่อยู่สำหรับออกเอกสาร"
                className="field-control h-[84px] resize-y py-2.5 leading-relaxed"
              />
            </Field>
          </div>

          <Field label="ประเภทผู้ซื้อ" hint="ใช้ตัดสินว่าต้องมีข้อมูลอะไรบ้างตอนออกใบกำกับภาษี">
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
                  hint="ชื่อเต็มที่จะขึ้นบนใบกำกับภาษี เว้นว่างไว้ก่อนได้ แต่ต้องมีก่อนออกใบเสร็จ"
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
                hint="ใบกำกับภาษีต้องระบุว่าออกให้สำนักงานใหญ่หรือสาขาไหน"
              >
                <BranchInput value={branch} onChange={setBranch} />
              </Field>
            </>
          )}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-4 border-b border-border pb-3 text-[15px] font-semibold">
          การติดต่อครั้งแรก
        </h2>
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

          <Field label="นัดติดตามครั้งถัดไป" hint="ใช้ตั้งการเตือนบนหน้ารายละเอียด">
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

/** ป็อบอัพเพิ่มผู้สนใจ — เนื้อในเดียวกับหน้าเต็ม ไม่ต้องออกจากรายการ */
export function LeadNewDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (code: string) => void;
}) {
  return (
    <Sheet
      title="เพิ่มผู้สนใจ"
      onClose={onClose}
      steady
      footer={
        <>
          <button type="button" className="btn glass-thin flex-1 justify-center sm:flex-none" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="submit"
            form="lead-new-dialog"
            className="btn solid btn-solid flex-1 justify-center sm:flex-none"
          >
            บันทึกผู้สนใจ
          </button>
        </>
      }
    >
      <LeadForm formId="lead-new-dialog" onCreated={onCreated} bare />
    </Sheet>
  );
}
