"use client";

import { useState } from "react";
import {
  WHT_KIND,
  whtTypes,
  whtAmount,
  whtType,
  type WhtKind,
  type WhtRow,
  type WhtType,
} from "@/lib/acc-data";
import { newWhtId, saveWht, useAcc } from "@/lib/acc-store";
import { TH_MONTHS_FULL, baht, bkkNow, parseIsoDate, thaiDate, todayIso, commaInput } from "@/lib/format";
import { MonthNav } from "./acc-ui";
import { PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { Field, Select } from "./ui";
import { PhoneCard, PhoneList } from "./acchr-phone";

import { DateField } from "./thai-date-picker";
import { useAddOption } from "./add-option";
type TabKey = "all" | WhtKind;

export function AccWhtPage() {
  const acc = useAcc();
  const [tab, setTab] = useState<TabKey>("all");
  const [view, setView] = useState(() => bkkNow());
  const [editing, setEditing] = useState<WhtRow | "new" | null>(null);

  /* r.date เป็น yyyy-mm-dd — ต้องอ่านผ่าน parseIsoDate ไม่ใช่ new Date(iso)
     ที่ตีความเป็นเที่ยงคืน UTC แล้วเลื่อนไปเดือนก่อนบนเครื่องที่อยู่หลังเวลาไทย */
  const inMonth = acc.wht.filter((r) => {
    const d = parseIsoDate(r.date);
    return d.getFullYear() === view.getFullYear() && d.getMonth() === view.getMonth();
  });
  const rows = (tab === "all" ? inMonth : inMonth.filter((r) => r.kind === tab)).sort((a, b) =>
    b.date.localeCompare(a.date),
  );

  const k53 = inMonth.filter((r) => r.kind === "53");
  const k3 = inMonth.filter((r) => r.kind === "3");
  const noCert = inMonth.filter((r) => !r.no);
  const sum = (list: WhtRow[]) => list.reduce((a, r) => a + whtAmount(r), 0);
  const base = (list: WhtRow[]) => list.reduce((a, r) => a + r.base, 0);

  /* นำส่งภายในวันที่ 7 ของเดือนถัดไป */
  const due = new Date(view.getFullYear(), view.getMonth() + 1, 7);

  return (
    <div className="space-y-4">
      <div className="bar">
        <div>
          <h1>ยื่นภาษี</h1>
          <p>รายจ่ายที่บริษัทหักภาษีจากผู้รับเงิน แล้วนำส่งกรมสรรพากร</p>
        </div>
        <div className="tools w-full flex-wrap sm:w-auto">
          <MonthNav view={view} onChange={setView} />
          <button
            type="button"
            className="btn solid btn-solid btn-block-mobile shrink-0"
            onClick={() => setEditing("new")}
          >
            <PlusIcon className="size-[15px]" strokeWidth={2.2} />
            เพิ่มรายการ
          </button>
        </div>
      </div>

      <section className="glass rounded-[15px] px-5 py-[18px] max-sm:px-4 max-sm:py-4">
        <h2 className="text-[15px] font-bold">สรุปยื่นแบบประจำเดือน</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          รอบเดือน {TH_MONTHS_FULL[view.getMonth()]} {view.getFullYear() + 543} · กำหนดนำส่งภายในวันที่{" "}
          <b className="font-bold text-primary">
            {due.getDate()} {TH_MONTHS_FULL[due.getMonth()]} {due.getFullYear() + 543}
          </b>
        </p>
        {/* มือถือ: สรุปสี่ช่องวางสองคอลัมน์ ไม่ต้องปัดผ่านกล่องใหญ่สี่กล่อง */}
        <div className="mt-3.5 grid grid-cols-2 gap-3 max-sm:gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
          <Sum
            title="ภ.ง.ด.53 · นิติบุคคล"
            value={baht(sum(k53))}
            meta={`${k53.length} ราย · ยอดจ่าย ${baht(base(k53))}`}
          />
          <Sum
            title="ภ.ง.ด.3 · บุคคลธรรมดา"
            value={baht(sum(k3))}
            meta={`${k3.length} ราย · ยอดจ่าย ${baht(base(k3))}`}
          />
          <Sum
            title="รวมต้องนำส่ง"
            value={baht(sum(inMonth))}
            meta={`${inMonth.length} ราย`}
            tone="ok"
          />
          <Sum
            title="ยังไม่ได้ออกหนังสือรับรอง"
            value={`${noCert.length} ราย`}
            meta={noCert.length ? "ผู้รับเงินต้องได้เอกสารทุกราย" : "ออกครบแล้ว"}
            tone={noCert.length ? "bad" : undefined}
          />
        </div>
      </section>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            <button type="button" className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>
              ทั้งหมด <b>{inMonth.length}</b>
            </button>
            <button type="button" className={tab === "53" ? "on" : ""} onClick={() => setTab("53")}>
              ภ.ง.ด.53 <b>{k53.length}</b>
            </button>
            <button type="button" className={tab === "3" ? "on" : ""} onClick={() => setTab("3")}>
              ภ.ง.ด.3 <b>{k3.length}</b>
            </button>
          </div>
        </div>

        <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
          <table className="data-table cards-sm min-w-[980px]">
            <thead>
              <tr>
                <th style={{ width: 120 }}>วันที่จ่าย</th>
                <th style={{ width: 230 }}>ผู้รับเงิน</th>
                <th style={{ width: 200 }}>ประเภทเงินได้</th>
                <th className="r" style={{ width: 130 }}>ยอดก่อนภาษี</th>
                <th className="r" style={{ width: 120 }}>ภาษีที่หัก</th>
                <th style={{ width: 160 }}>หนังสือรับรอง</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-muted-foreground">
                    ไม่มีรายการในเดือนนี้
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    style={{ cursor: "pointer" }}
                    onClick={() => setEditing(r)}
                  >
                    <td data-label="วันที่จ่าย" className="num muted">{thaiDate(r.date)}</td>
                    <td data-label="ผู้รับเงิน">
                      <b className="font-semibold">{r.name}</b>
                      <span className="why num">{r.tax}</span>
                    </td>
                    <td data-label="ประเภทเงินได้" className="muted">
                      <span className="clip">
                        {whtType(r.type).label} · {r.rate}%
                      </span>
                      <span className="why">{WHT_KIND[r.kind]}</span>
                    </td>
                    <td data-label="ยอดก่อนภาษี" className="r num">{baht(r.base)}</td>
                    <td data-label="ภาษีที่หัก" className="r num font-semibold">{baht(whtAmount(r))}</td>
                    <td data-label="หนังสือรับรอง" className="muted">
                      {r.no ? (
                        <span className="num">{r.no}</span>
                      ) : (
                        <span className="font-semibold text-destructive">ยังไม่ได้ออก</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* มือถือ: ผู้รับเงิน + ภาษีที่หักขึ้นก่อน แตะการ์ดเพื่อแก้ไขรายการ */}
        <PhoneList empty={rows.length === 0 ? "ไม่มีรายการในเดือนนี้" : undefined}>
          {rows.map((r) => (
            <PhoneCard
              key={r.id}
              title={r.name}
              sub={<span className="num">{r.tax}</span>}
              amount={baht(whtAmount(r))}
              amountNote="ภาษีที่หัก (บาท)"
              onOpen={() => setEditing(r)}
              openLabel={`แก้ไขรายการของ ${r.name}`}
              badge={
                r.no ? (
                  <span className="tag t-ok">
                    <i />
                    <span className="num">{r.no}</span>
                  </span>
                ) : (
                  <span className="tag t-late">
                    <i />
                    หนังสือรับรองยังไม่ได้ออก
                  </span>
                )
              }
              stats={[
                { label: "วันที่จ่าย", value: thaiDate(r.date) },
                { label: "ยอดก่อนภาษี", value: baht(r.base) },
                { label: "ประเภทเงินได้", value: `${whtType(r.type).label} · ${r.rate}%` },
                { label: "แบบยื่น", value: WHT_KIND[r.kind] },
              ]}
            />
          ))}
        </PhoneList>

        <div className="foot flex-col items-stretch gap-3 text-center sm:flex-row sm:items-center sm:text-left">
          <span>แสดง {rows.length} รายการ</span>
          <span className="sum sm:ml-auto">
            ภาษีที่ต้องนำส่งรวม<b>{baht(sum(rows))}</b> บาท
          </span>
        </div>
      </section>

      {editing && (
        <WhtDialog
          row={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(iso) => {
            setView(new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1));
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function Sum({
  title,
  value,
  meta,
  tone,
}: {
  title: string;
  value: string;
  meta: string;
  tone?: "ok" | "bad";
}) {
  const skin =
    tone === "ok"
      ? "bg-[var(--success-soft)] border-transparent"
      : tone === "bad"
        ? "bg-[var(--destructive-soft)] border-transparent"
        : "bg-muted/60 border-border";
  const num =
    tone === "ok" ? "text-[var(--success)]" : tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <div className={`min-w-0 rounded-[13px] border px-4 py-3.5 max-sm:px-3 max-sm:py-3 ${skin}`}>
      <span className="block text-[12.5px] font-semibold text-muted-foreground max-sm:text-[11.5px] max-sm:leading-snug">{title}</span>
      <b className={`num mt-1 block text-[19px] font-bold max-sm:text-[16px] ${num}`}>{value}</b>
      <span className="mt-1 block text-[11.5px] leading-[1.5] text-muted-foreground">{meta}</span>
    </div>
  );
}

function WhtDialog({
  row,
  onClose,
  onSaved,
}: {
  row: WhtRow | null;
  onClose: () => void;
  onSaved: (iso: string) => void;
}) {
  const [name, setName] = useState(row?.name ?? "");
  const [tax, setTax] = useState(row?.tax ?? "");
  const [kind, setKind] = useState<WhtKind>(row?.kind ?? "53");
  const [type, setType] = useState<WhtType>(row?.type ?? "service");
  const [date, setDate] = useState(row?.date ?? todayIso());
  const [base, setBase] = useState(row ? commaInput(String(row.base)) : "");
  const [rate, setRate] = useState(String(row?.rate ?? whtType("service").rate));
  const addType = useAddOption({ catalog: "whtTypes" }, (v) => {
    setType(v);
    setRate(String(whtType(v).rate));
  });
  const [no, setNo] = useState(row?.no ?? "");
  const [tried, setTried] = useState(false);

  /* ช่องกรอกมีจุลภาคคั่นหลักพัน — ตัดออกก่อนแปลงเป็นตัวเลข ไม่งั้นได้ NaN แล้วภาษีเป็นศูนย์ */
  const baseNum = Number(base.replace(/,/g, "")) || 0;
  const rateNum = Number(rate.replace(/,/g, "")) || 0;
  const tax13 = tax.replace(/\D/g, "");
  const wht = Math.round(((baseNum * rateNum) / 100) * 100) / 100;

  const bad = {
    name: !name.trim(),
    tax: tax13.length !== 13,
    base: baseNum <= 0,
  };
  const invalid = bad.name || bad.tax || bad.base;

  return (
    <Sheet
      title={row ? "แก้ไขรายการหักภาษี ณ ที่จ่าย" : "เพิ่มรายการหักภาษี ณ ที่จ่าย"}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid"
            onClick={() => {
              setTried(true);
              if (invalid) return;
              saveWht({
                id: row?.id ?? newWhtId(),
                date,
                name: name.trim(),
                tax: tax13,
                kind,
                type,
                base: Math.round(baseNum * 100) / 100,
                rate: rateNum,
                no: no.trim(),
              });
              onSaved(date);
            }}
          >
            บันทึก
          </button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="ชื่อผู้รับเงิน"
          required
          hint={tried && bad.name ? <span className="text-destructive">ต้องกรอกชื่อผู้รับเงิน</span> : undefined}
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="เช่น บริษัท ทรู คอร์ปอเรชั่น จำกัด (มหาชน)"
            className="field-control h-[38px] w-full rounded-[10px] px-3 text-[13.5px]"
          />
        </Field>
        <Field
          label="เลขประจำตัวผู้เสียภาษี"
          required
          hint={tried && bad.tax ? <span className="text-destructive">ต้องครบ 13 หลัก</span> : undefined}
        >
          <input
            value={tax}
            inputMode="numeric"
            onChange={(e) => setTax(e.target.value)}
            placeholder="13 หลัก"
            className="field-control num h-[38px] w-full rounded-[10px] px-3 text-[13.5px]"
          />
        </Field>
      </div>

      <div className="mt-4">
        <p className="mb-2 text-[0.8rem] font-medium">
          ประเภทผู้รับเงิน<span className="text-destructive">*</span>
        </p>
        <div className="flex flex-wrap gap-2">
          {(["53", "3"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`min-h-[38px] flex-1 rounded-[11px] border px-3.5 py-1 text-[12.5px] transition-colors ${
                kind === k
                  ? "border-primary bg-accent font-semibold text-primary"
                  : "glass-thin text-muted-foreground hover:border-primary"
              }`}
            >
              <span className="block leading-tight">{k === "53" ? "นิติบุคคล" : "บุคคลธรรมดา"}</span>
              <span className="block text-[11px] leading-tight opacity-80">ยื่น ภ.ง.ด.{k}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="ประเภทเงินได้" required>
          <Select
            value={type}
            onChange={(e) => {
              if (addType.pick(e.target.value)) return;
              const next = e.target.value as WhtType;
              setType(next);
              setRate(String(whtType(next).rate));
            }}
            className="h-[38px]"
          >
            {whtTypes().map((t) => (
              <option key={t.key} value={t.key}>
                {t.label} ({t.rate}%)
              </option>
            ))}
            {addType.option}
          </Select>
        </Field>
        {addType.dialog}
        <Field label="วันที่จ่ายเงิน" required>
          <DateField
            value={date}
            onChange={(iso) => setDate(iso)}
            label="วันที่จ่ายเงิน"
            className="h-[38px] rounded-[10px] text-[13.5px]"
          />
        </Field>
        <Field
          label="ยอดก่อนภาษี"
          required
          hint={tried && bad.base ? <span className="text-destructive">ต้องมากกว่า 0</span> : undefined}
        >
          <input
            value={base}
            inputMode="decimal"
            onChange={(e) => setBase(commaInput(e.target.value))}
            placeholder="0.00"
            className="field-control num h-[38px] w-full rounded-[10px] px-3 text-[13.5px]"
          />
        </Field>
        <Field label="อัตราภาษี (%)">
          <input
            value={rate}
            inputMode="decimal"
            onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))}
            className="field-control num h-[38px] w-full rounded-[10px] px-3 text-[13.5px]"
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field
          label="เลขที่หนังสือรับรองที่ออกให้ผู้รับเงิน"
        >
          <input
            value={no}
            placeholder="ออกให้ผู้รับเงินเก็บไว้เป็นหลักฐาน"
            onChange={(e) => setNo(e.target.value)}
            className="field-control num h-[38px] w-full rounded-[10px] px-3 text-[13.5px]"
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-[11px] border border-border bg-muted/60 px-3.5 py-3 text-[13px]">
        <span>ภาษีที่ต้องหักและนำส่ง</span>
        <b className="num text-[15px] font-bold">{baht(wht)} บาท</b>
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        จ่ายจริงให้ผู้รับเงิน {baht(Math.round((baseNum - wht) * 100) / 100)} บาท
      </p>
    </Sheet>
  );
}
