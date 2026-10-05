"use client";

/*
 * ตัวเลือกในรายการ — ผู้ดูแลระบบเพิ่ม/แก้/ลบ/เรียงตัวเลือกในดรอปดาวน์ของแต่ละบทบาท (ผู้ใช้สั่ง 18 ก.ย. 2569)
 * ค่าเก็บใน system-settings.ts หมวด options · หน้าที่ใช้อ่านผ่าน optionsOf() (options.ts)
 *
 * สองแบบ
 *   ข้อความล้วน (options) — เพิ่ม แก้ ลบ เรียงได้หมด
 *   รายการที่มีรหัสผูกระบบ (catalog) — ประเภทบริการ แผนก ตำแหน่ง เอกสารประจำตัว ตำแหน่งในทีม ประเภทหัก ณ ที่จ่าย
 *     เพิ่มและแก้ชื่อได้ · ของตั้งต้นลบไม่ได้ (ข้อมูลเก่าและการคำนวณอ้างรหัสอยู่) · ของที่เพิ่มเองลบได้
 * สถานะที่ระบบใช้ตัดสินขั้นตอน (ดีล ใบเสนอราคา ฯลฯ) ไม่อยู่ในนี้ ตั้งใจไม่ให้แก้
 * ข้อมูลเก่าที่เคยเลือกไว้เก็บข้อความเดิม แก้ชื่อหรือลบตัวเลือกไม่ทำให้ข้อมูลเก่าหาย
 * ต้องเหลืออย่างน้อยหนึ่งตัวเลือกต่อรายการ ไม่งั้นดรอปดาวน์ว่าง
 */

import { useState } from "react";
import { OPTION_GROUPS, type OptionGroup, type OptionKey } from "@/lib/options";
import { whtRateOn, type Catalog, type SystemSettings, type WhtChange } from "@/lib/system-settings";
import { merged, newCatalogKey } from "@/lib/catalog";
import { BUILTIN_SERVICES, BUILTIN_TEAM_ROLES } from "@/lib/pm-data";
import { PM_EVENT_KIND } from "@/lib/pm-schedule-data";
import { BUILTIN_HR_DEPT, BUILTIN_HR_DOCS, BUILTIN_HR_POSITION, holdsPos } from "@/lib/hr-data";
import { BUILTIN_WHT_TYPES } from "@/lib/acc-data";
import { AdminHead, Input2, SaveBar, Switch, inputCls, useSectionDraft } from "./admin-ui";
import { GripIcon, PencilIcon, PlusIcon, TrashIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { DateField } from "./thai-date-picker";
import { thaiDate, todayIso } from "@/lib/format";
import { useHr } from "@/lib/hr-store";

type Options = SystemSettings["options"];

function describe(a: Options, b: Options) {
  const out: string[] = [];
  for (const g of OPTION_GROUPS) {
    const was = a[g.key];
    const now = b[g.key];
    const added = now.filter((x) => !was.includes(x));
    const removed = was.filter((x) => !now.includes(x));
    if (added.length) out.push(`${g.label}: เพิ่ม ${added.join(", ")}`);
    if (removed.length) out.push(`${g.label}: เอาออก ${removed.join(", ")}`);
    if (!added.length && !removed.length && was.join("|") !== now.join("|")) out.push(`${g.label}: เรียงลำดับใหม่`);
  }
  return out;
}

/* ── รายการที่มีรหัสผูกระบบ ── */
type CatKey = keyof Catalog;
type CatItem = { id: string; label: string; dept?: string; req?: boolean; color?: string; rate?: number; off?: boolean };

type CatSpec = {
  key: CatKey;
  role: OptionGroup["role"];
  label: string;
  where: string;
  /** ช่องเพิ่มเติมในกล่องแก้ไข */
  extra?: "dept" | "req" | "color" | "rate";
};

/*
 * หมวดที่มีหน้าของตัวเองในเมนูตั้งค่าแล้ว (Full Proposal · M5) — ไม่ต้องโชว์ซ้ำในหน้าข้อมูลหลัก
 * เจ้าของทัก 28 ก.ย. 2569 ว่าข้อมูลในข้อมูลหลักซ้ำกับเมนูด้านล่าง
 */

const CAT_SPECS: CatSpec[] = [
  { key: "services", role: "sales", label: "ประเภทบริการ", where: "ใบเสนอราคา · งานเข้าใหม่ของ PM" },
  { key: "teamRoles", role: "pm", label: "ตำแหน่งในทีม", where: "หน้าวางแผนงาน (มอบงานตามตำแหน่ง)", extra: "color" },
  /* ประเภทนัดหมายในปฏิทินของ PM (Full Proposal · M5 ข้อมูลหลัก) */
  { key: "eventKinds", role: "pm", label: "ประเภทนัดหมาย", where: "ตารางงานของ PM · ปฏิทินทีม", extra: "color" },
  { key: "whtTypes", role: "acc", label: "ประเภทเงินได้ที่หัก ณ ที่จ่าย", where: "หน้ายื่นภาษี", extra: "rate" },
  { key: "depts", role: "hr", label: "แผนก", where: "ข้อมูลพนักงาน · รายงาน" },
  { key: "positions", role: "hr", label: "ตำแหน่งงาน", where: "ข้อมูลพนักงาน (ตำแหน่งตามสัญญาจ้าง)", extra: "dept" },
  { key: "docs", role: "hr", label: "เอกสารประจำตัวพนักงาน", where: "ข้อมูลพนักงาน · แจ้งเตือนเอกสารไม่ครบ", extra: "req" },
];

/** ชุดตั้งต้นในรูปแบบกลาง — ลบไม่ได้ */
const BUILTIN: Record<CatKey, CatItem[]> = {
  services: BUILTIN_SERVICES.map((x) => ({ id: x.key, label: x.label })),
  teamRoles: BUILTIN_TEAM_ROLES.map((x) => ({ id: x.key, label: x.label, color: x.color })),
  eventKinds: Object.entries(PM_EVENT_KIND).map(([key, v]) => ({ id: key, label: v.label, color: v.dot })),
  whtTypes: BUILTIN_WHT_TYPES.map((x) => ({ id: x.key, label: x.label, rate: x.rate })),
  depts: BUILTIN_HR_DEPT.map((x) => ({ id: x.v, label: x.label })),
  positions: BUILTIN_HR_POSITION.map((x) => ({ id: x.v, label: x.label, dept: x.dept })),
  docs: BUILTIN_HR_DOCS.map((x) => ({ id: x.v, label: x.label, req: x.req })),
};

/** อ่านจากที่เก็บ → รูปแบบกลาง */
function toItems(c: Catalog, key: CatKey): CatItem[] {
  const raw = (c[key] ?? []) as Record<string, unknown>[];
  const saved = c[key]
    ? raw.map((x) => ({
        id: String(x.key ?? x.v),
        label: String(x.label),
        dept: x.dept as string | undefined,
        req: x.req as boolean | undefined,
        color: x.color as string | undefined,
        rate: x.rate as number | undefined,
        off: x.off as boolean | undefined,
      }))
    : undefined;
  return merged(saved, BUILTIN[key], (x) => x.id);
}

/** รูปแบบกลาง → รูปแบบที่แต่ละไฟล์ข้อมูลใช้ */
function fromItems(key: CatKey, items: CatItem[]): Catalog[CatKey] {
  switch (key) {
    case "services":
      return items.map((x) => ({ key: x.id, label: x.label, off: x.off }));
    case "eventKinds":
      return items.map((x) => ({ key: x.id, label: x.label, color: x.color ?? "#4A5568", off: x.off }));
    case "teamRoles":
      return items.map((x) => ({ key: x.id, label: x.label, color: x.color ?? "#888888", off: x.off }));
    case "whtTypes":
      return items.map((x) => ({ key: x.id, label: x.label, rate: x.rate ?? 3, off: x.off }));
    case "depts":
      return items.map((x) => ({ v: x.id, label: x.label, off: x.off }));
    case "positions":
      return items.map((x) => ({ v: x.id, label: x.label, dept: x.dept ?? BUILTIN_HR_DEPT[0].v, off: x.off }));
    case "docs":
      return items.map((x) => ({ v: x.id, label: x.label, req: Boolean(x.req), off: x.off }));
  }
}

function describeWht(a: WhtChange[], b: WhtChange[]) {
  const same = (x: WhtChange, y: WhtChange) => x.key === y.key && x.at === y.at;
  return b
    .filter((x) => !a.some((y) => same(x, y) && y.rate === x.rate))
    .map((x) => `หัก ณ ที่จ่าย ${x.key} ${x.rate}% มีผล ${thaiDate(x.at)}`);
}

function describeOff(a: SystemSettings["optionsOff"], b: SystemSettings["optionsOff"]) {
  const out: string[] = [];
  for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])] as OptionKey[]) {
    const was = a[key] ?? [];
    const now = b[key] ?? [];
    for (const x of now) if (!was.includes(x)) out.push(`ปิดใช้งาน ${x}`);
    for (const x of was) if (!now.includes(x)) out.push(`เปิดใช้งาน ${x}`);
  }
  return out;
}

/** จำนวนที่ใช้อยู่ของรายการในหมวดที่มีรหัส — นับได้เท่าที่ระบบรู้ */
function usageOfCat(key: CatKey, id: string, hr: ReturnType<typeof useHr>) {
  if (key === "depts") return "";
  if (key === "positions") {
    const n = hr.emp.filter((e) => holdsPos(e, id)).length;
    return n ? `พนักงาน ${n}` : "";
  }
  return "";
}

/** จำนวนที่ใช้อยู่ของตัวเลือกธรรมดา */
function usageOfOpt(key: OptionKey, value: string, hr: ReturnType<typeof useHr>) {
  if (key === "sex") {
    const n = hr.emp.filter((e) => e.sex === value).length;
    return n ? `พนักงาน ${n}` : "";
  }
  return "";
}

function describeCat(a: Catalog, b: Catalog) {
  const out: string[] = [];
  for (const spec of CAT_SPECS) {
    const was = toItems(a, spec.key);
    const now = toItems(b, spec.key);
    for (const x of now) {
      const old = was.find((w) => w.id === x.id);
      if (!old) out.push(`${spec.label}: เพิ่ม ${x.label}`);
      else if (JSON.stringify(old) !== JSON.stringify(x)) out.push(`${spec.label}: แก้ ${old.label}${old.label !== x.label ? ` → ${x.label}` : ""}`);
    }
    for (const w of was) if (!now.some((x) => x.id === w.id)) out.push(`${spec.label}: เอาออก ${w.label}`);
  }
  return out;
}

/*
 * หน้าเดียวใช้ได้สองแบบ (Full Proposal · M5 แยก "บริการ" กับ "หัก ณ ที่จ่าย" เป็นหัวข้อของตัวเอง)
 *   ไม่ส่ง only = ข้อมูลหลักทั้งหน้า (แท็บตามบทบาท)
 *   ส่ง only    = การ์ดเดียวของหมวดนั้น ไม่มีแท็บและไม่มีตัวเลือกในดรอปดาวน์
 */
export function AdminOptionsPage({ only }: { only?: CatKey } = {}) {
  const d = useSectionDraft("options", "ตัวเลือกในรายการ", describe);
  const cat = useSectionDraft("catalog", "ตัวเลือกในรายการ", describeCat);
  /* อัตราหัก ณ ที่จ่ายเก็บวันเริ่มใช้แยกจากตัวรายการ (Full Proposal · M5) */
  const wht = useSectionDraft("whtHistory", "ตัวเลือกในรายการ", describeWht);
  /* ตัวเลือกที่ปิดใช้งาน (สวิตช์ "เปิดใช้" ในตาราง) */
  const d2 = useSectionDraft("optionsOff", "ตัวเลือกในรายการ", describeOff);
  const [catEditing, setCatEditing] = useState<{ key: CatKey; id: string | null } | null>(null);
  const setCat = (key: CatKey, items: CatItem[]) => cat.setDraft({ ...cat.draft, [key]: fromItems(key, items) });
  const catSpec = catEditing ? CAT_SPECS.find((c) => c.key === catEditing.key) : undefined;
  const hr = useHr();
  /* ลบรายการที่เพิ่มเองได้เฉพาะที่ยังไม่มีใครใช้ — แผนกที่ยังมีตำแหน่ง / ตำแหน่งที่พนักงานยังถืออยู่ */
  function usedBy(key: CatKey, id: string) {
    if (key === "depts") return toItems(cat.draft, "positions").some((x) => x.dept === id) ? "ยังมีตำแหน่งในแผนกนี้" : "";
    if (key === "positions") return hr.emp.some((e) => holdsPos(e, id)) ? "ยังมีพนักงานในตำแหน่งนี้" : "";
    return "";
  }
  /* หมวดที่กำลังดูอยู่ทางขวา — เริ่มที่หมวดแรกของฝั่งขาย */
  const [sel, setSel] = useState<{ kind: "cat" | "opt"; key: string }>({ kind: "cat", key: "depts" });
  /* กล่องเพิ่ม/แก้ — index -1 = เพิ่มใหม่ */
  const [editing, setEditing] = useState<{ key: OptionKey; index: number } | null>(null);

  const onlySpec = only ? CAT_SPECS.find((c) => c.key === only) : undefined;
  const setList = (key: OptionKey, list: string[]) => d.setDraft({ ...d.draft, [key]: list });

  const editGroup = editing ? OPTION_GROUPS.find((g) => g.key === editing.key) : undefined;

  /* แถวที่กำลังลาก — จับที่ปุ่มจุดหกจุดเท่านั้น เหมือนต้นแบบ */
  const [drag, setDrag] = useState<string>("");

  /*
   * แท็บตามต้นแบบ HR-10 เป๊ะ ๆ (เจ้าของสั่ง 29 ก.ย. 2569 "ข้อมูลมันซ้ำซ้อนเกินไป เอาตามที่ส่งไป")
   * เหลือสามหมวด: แผนก · ประเภทนัดหมาย · ประเภทค่าใช้จ่าย
   * รายการอื่น (แหล่งที่มา เพศ ระดับการศึกษา ฯลฯ) ยังมีอยู่ในระบบและเพิ่มจากหน้างานได้เหมือนเดิม
   */
  const tabs = only
    ? []
    : [
        ...(["depts", "eventKinds"] as const).flatMap((k) => {
          const c = CAT_SPECS.find((x) => x.key === k);
          return c ? [{ kind: "cat" as const, key: c.key as string, label: c.label, where: c.where, count: toItems(cat.draft, c.key).length }] : [];
        }),
        ...OPTION_GROUPS.filter((g) => g.key === "expenseKind").map((g) => ({
          kind: "opt" as const,
          key: g.key as string,
          label: g.label,
          where: g.where,
          count: d.draft[g.key].length,
        })),
      ];
  const curTab = tabs.find((t) => t.kind === sel.kind && t.key === sel.key) ?? tabs[0];
  const spec = onlySpec ?? (curTab && curTab.kind === "cat" ? CAT_SPECS.find((c) => c.key === curTab.key) : undefined);
  const optGroup = !onlySpec && curTab && curTab.kind === "opt" ? OPTION_GROUPS.find((g) => g.key === curTab.key) : undefined;

  /* รายการในแท็บที่เลือก — แปลงเป็นรูปแบบเดียวกันก่อนวาด ตารางจะได้ใช้โค้ดชุดเดียว */
  type Row = { id: string; label: string; extra: string; off: boolean; used: string; block: string };
  /* คอลัมน์เพิ่มของบางหมวด (ต้นแบบ HR-17 มีคอลัมน์อัตราหัก) */
  const extraHead = spec?.key === "whtTypes" ? "อัตราหัก" : "";
  const rows: Row[] = spec
    ? toItems(cat.draft, spec.key).map((x) => ({
        id: x.id,
        label: x.label,
        extra: spec.key === "whtTypes" && x.rate != null ? `${x.rate}%` : "",
        off: Boolean(x.off),
        used: usageOfCat(spec.key, x.id, hr),
        block: BUILTIN[spec.key].some((b) => b.id === x.id) ? "รายการตั้งต้นของระบบลบไม่ได้ — ปิดใช้งานแทน" : usedBy(spec.key, x.id),
      }))
    : optGroup
      ? d.draft[optGroup.key].map((x) => ({
          id: x,
          label: x,
          extra: "",
          off: (d2.draft[optGroup.key] ?? []).includes(x),
          used: usageOfOpt(optGroup.key, x, hr),
          block: d.draft[optGroup.key].length <= 1 ? "ต้องเหลืออย่างน้อยหนึ่งตัวเลือก" : "",
        }))
      : [];

  function moveRow(from: string, to: string, after: boolean) {
    if (!to || from === to) return;
    if (spec) {
      const items = toItems(cat.draft, spec.key);
      const fi = items.findIndex((x) => x.id === from);
      if (fi < 0) return;
      const [it] = items.splice(fi, 1);
      const ti = items.findIndex((x) => x.id === to);
      items.splice(after ? ti + 1 : ti, 0, it);
      setCat(spec.key, items);
      return;
    }
    if (!optGroup) return;
    const list = [...d.draft[optGroup.key]];
    const fi = list.indexOf(from);
    if (fi < 0) return;
    list.splice(fi, 1);
    const ti = list.indexOf(to);
    list.splice(after ? ti + 1 : ti, 0, from);
    setList(optGroup.key, list);
  }

  function moveBy(id: string, by: number) {
    const i = rows.findIndex((r) => r.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= rows.length) return;
    moveRow(id, rows[j].id, by > 0);
  }

  function toggleRow(id: string) {
    if (spec) {
      const items = toItems(cat.draft, spec.key).map((x) => (x.id === id ? { ...x, off: !x.off } : x));
      setCat(spec.key, items);
      return;
    }
    if (!optGroup) return;
    const off = d2.draft[optGroup.key] ?? [];
    d2.setDraft({
      ...d2.draft,
      [optGroup.key]: off.includes(id) ? off.filter((x) => x !== id) : [...off, id],
    });
  }

  function removeRow(id: string) {
    if (spec) {
      setCat(
        spec.key,
        toItems(cat.draft, spec.key).filter((x) => x.id !== id),
      );
      return;
    }
    if (!optGroup) return;
    setList(
      optGroup.key,
      d.draft[optGroup.key].filter((x) => x !== id),
    );
  }

  function editRow(id: string) {
    if (spec) return setCatEditing({ key: spec.key, id });
    if (optGroup) setEditing({ key: optGroup.key, index: d.draft[optGroup.key].indexOf(id) });
  }

  function addRow() {
    if (spec) return setCatEditing({ key: spec.key, id: null });
    if (optGroup) setEditing({ key: optGroup.key, index: -1 });
  }

  return (
    <div className="space-y-4">
      <AdminHead
        title={onlySpec ? onlySpec.label : "ข้อมูลหลัก"}
        desc={
          onlySpec
            ? `เพิ่ม แก้ชื่อ และปิดใช้งานรายการ — ใช้ที่ ${onlySpec.where}`
            : "รายการตัวเลือกที่ใช้ทั่วระบบ ลากเพื่อเรียงลำดับ"
        }
      >
        <button type="button" className="btn solid btn-solid" onClick={addRow}>
          <PlusIcon className="size-4" strokeWidth={2.4} />
          เพิ่มรายการ
        </button>
      </AdminHead>

      <section className="glass overflow-hidden rounded-[18px]">
        {!only && (
          /* แท็บหมวดพร้อมจำนวนรายการ ตามต้นแบบ
             ขึ้นบรรทัดใหม่แทนการเลื่อนข้าง (กติกาเดียวกับมือถือ 25 ก.ย. 2569)
             แท็บที่ถูกตัดขอบเท่ากับไม่มี และการเลื่อนเองตอนกดแท็บทำให้หน้าขยับ */
          <div
            className="tabs wrap border-b border-border px-3 whitespace-nowrap"
            role="tablist"
            aria-label="หมวดข้อมูลหลัก"
          >
            {tabs.map((t) => {
              const on = curTab && t.kind === curTab.kind && t.key === curTab.key;
              return (
                <button
                  key={`${t.kind}:${t.key}`}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  className={on ? "on" : ""}
                  onClick={() => setSel({ kind: t.kind, key: t.key })}
                >
                  {t.label}
                  <b>{t.count}</b>
                </button>
              );
            })}
          </div>
        )}

        <div className="px-4 pt-3.5 pb-4 sm:px-5">
          <p className="mb-3 text-[12.5px] text-muted-foreground">
            ใช้ใน: {onlySpec ? onlySpec.where : (curTab?.where ?? "")}
          </p>

          {/* หัวตาราง — จอแคบซ่อน เหลือแต่แถวรายการ */}
          <div
            className={`grid grid-cols-[26px_minmax(0,1fr)_58px_84px] items-center gap-2 border-b border-border pb-2 text-[11.5px] font-bold text-muted-foreground ${
              extraHead
                ? "sm:grid-cols-[28px_26px_minmax(0,1fr)_110px_120px_58px_84px]"
                : "sm:grid-cols-[28px_26px_minmax(0,1fr)_120px_58px_84px]"
            }`}
          >
            <span className="max-sm:hidden" />
            <span className="text-center max-sm:hidden">#</span>
            <span className="max-sm:col-start-2">ชื่อ</span>
            {extraHead && <span className="max-sm:hidden">{extraHead}</span>}
            <span className="max-sm:hidden">การใช้งาน</span>
            <span className="text-center">เปิดใช้</span>
            <span />
          </div>

          {rows.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted-foreground">ยังไม่มีรายการ กดเพิ่มรายการเพื่อเริ่มต้น</p>
          ) : (
            rows.map((r, i) => (
              <div
                key={r.id}
                draggable={drag === r.id}
                onDragOver={(e) => {
                  if (drag) e.preventDefault();
                }}
                onDrop={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  moveRow(drag, r.id, e.clientY - box.top > box.height / 2);
                  setDrag("");
                }}
                onDragEnd={() => setDrag("")}
                className={`grid grid-cols-[26px_minmax(0,1fr)_58px_84px] items-center gap-2 border-b border-border py-2 last:border-b-0 hover:bg-muted/40 ${
                  extraHead
                    ? "sm:grid-cols-[28px_26px_minmax(0,1fr)_110px_120px_58px_84px]"
                    : "sm:grid-cols-[28px_26px_minmax(0,1fr)_120px_58px_84px]"
                } ${drag === r.id ? "opacity-40" : ""}`}
              >
                <button
                  type="button"
                  aria-label={`เรียงลำดับ ${r.label} ใช้ลูกศรขึ้นลงหรือลากได้`}
                  title="ลากเพื่อเรียงลำดับ"
                  onMouseDown={() => setDrag(r.id)}
                  onMouseUp={() => setDrag("")}
                  onKeyDown={(e) => {
                    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
                    e.preventDefault();
                    moveBy(r.id, e.key === "ArrowUp" ? -1 : 1);
                  }}
                  className="flex size-6 cursor-grab items-center justify-center rounded-[6px] text-muted-foreground hover:bg-muted hover:text-foreground max-sm:hidden"
                >
                  <GripIcon className="size-3.5" />
                </button>
                <span className="num text-center text-[12px] text-muted-foreground max-sm:hidden">{i + 1}</span>
                <span className="min-w-0 max-sm:col-start-2">
                  <b className={`block truncate text-[13.5px] ${r.off ? "font-medium text-muted-foreground" : "font-semibold"}`}>
                    {r.label}
                    {r.off && (
                      <em className="ml-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground not-italic">
                        ปิดใช้งาน
                      </em>
                    )}
                  </b>
                  <small className="block text-[11.5px] text-muted-foreground sm:hidden">
                    {[r.extra, r.used || "ยังไม่ถูกใช้"].filter(Boolean).join(" · ")}
                  </small>
                </span>
                {extraHead && <span className="num text-[13px] max-sm:hidden">{r.extra}</span>}
                <span className={`text-[12px] max-sm:hidden ${r.used ? "text-muted-foreground" : "text-muted-foreground/60"}`}>
                  {r.used || "ยังไม่ถูกใช้"}
                </span>
                <span className="flex justify-center">
                  <Switch on={!r.off} onToggle={() => toggleRow(r.id)} label={`เปิดหรือปิดใช้งาน ${r.label}`} />
                </span>
                <span className="flex justify-end gap-1.5">
                  <IconBtn label={`แก้ไข ${r.label}`} onClick={() => editRow(r.id)}>
                    <PencilIcon className="size-3.5" strokeWidth={1.9} />
                  </IconBtn>
                  <IconBtn
                    label={`ลบ ${r.label}`}
                    danger
                    disabled={Boolean(r.block)}
                    title={r.block || undefined}
                    onClick={() => removeRow(r.id)}
                  >
                    <TrashIcon className="size-3.5" strokeWidth={1.9} />
                  </IconBtn>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* ตัวอย่างการหักตามต้นแบบ HR-17 — เห็นทันทีว่าอัตราที่ตั้งไว้คิดเป็นเงินเท่าไร */}
      {spec?.key === "whtTypes" && (
        <section className="glass rounded-[18px] px-4 py-4 sm:px-5">
          <h2 className="text-[14.5px] font-bold">ตัวอย่างการหัก (ฐาน 10,000 บาท ก่อน VAT)</h2>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {toItems(cat.draft, "whtTypes")
              .filter((x) => !x.off)
              .map((x) => (
                <div key={x.id} className="rounded-[12px] border border-border bg-card px-3 py-2.5">
                  <small className="block text-[11.5px] text-muted-foreground">
                    {x.label} {x.rate ?? 0}%
                  </small>
                  <b className="num text-[16px] font-bold">หัก {(10000 * (x.rate ?? 0)) / 100} บาท</b>
                </div>
              ))}
          </div>
        </section>
      )}

      {editing && editGroup && (
        <OptionDialog
          group={editGroup}
          initial={editing.index >= 0 ? d.draft[editing.key][editing.index] : ""}
          taken={d.draft[editing.key].filter((_, k) => k !== editing.index)}
          onClose={() => setEditing(null)}
          onSave={(text) => {
            const list = [...d.draft[editing.key]];
            if (editing.index >= 0) list[editing.index] = text;
            else list.push(text);
            setList(editing.key, list);
            setEditing(null);
          }}
        />
      )}

      {catEditing && catSpec && (
        <CatDialog
          spec={catSpec}
          history={wht.draft}
          initial={catEditing.id ? toItems(cat.draft, catEditing.key).find((x) => x.id === catEditing.id) : undefined}
          taken={toItems(cat.draft, catEditing.key)
            .filter((x) => x.id !== catEditing.id)
            .map((x) => x.label)}
          depts={toItems(cat.draft, "depts")}
          onClose={() => setCatEditing(null)}
          onSave={(item, at) => {
            const items = toItems(cat.draft, catEditing.key);
            if (catSpec.extra === "rate" && at) {
              /* อัตราใหม่เก็บเป็นช่วงวัน — ตัวรายการเก็บอัตราที่ใช้ "วันนี้" ไว้ให้หน้าอื่นอ่านตรง ๆ */
              const rate = item.rate ?? 3;
              const next = [...wht.draft.filter((h) => !(h.key === item.id && h.at === at)), { key: item.id, at, rate }];
              wht.setDraft(next);
              item = { ...item, rate: whtRateOn(item.id, todayIso(), rate, next) };
            }
            setCat(
              catEditing.key,
              catEditing.id ? items.map((x) => (x.id === catEditing.id ? item : x)) : [...items, item],
            );
            setCatEditing(null);
          }}
        />
      )}

      <SaveBar
        dirty={d.dirty || cat.dirty || wht.dirty || d2.dirty}
        isDefault={d.isDefault && cat.isDefault && wht.isDefault && d2.isDefault}
        invalid={OPTION_GROUPS.some((g) => d.draft[g.key].length === 0) ? "ทุกรายการต้องมีอย่างน้อยหนึ่งตัวเลือก" : ""}
        onSave={() => {
          if (d.dirty) d.save();
          if (cat.dirty) cat.save();
          if (wht.dirty) wht.save();
          if (d2.dirty) d2.save();
        }}
        onCancel={() => {
          d.cancel();
          cat.cancel();
          wht.cancel();
          d2.cancel();
        }}
        onDefault={() => {
          d.toDefault();
          cat.toDefault();
          wht.toDefault();
          d2.toDefault();
        }}
      />
    </div>
  );
}

function IconBtn({
  label,
  title,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  title?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={title}
      disabled={disabled}
      onClick={onClick}
      /* มือถือ: ปุ่มโตขึ้นให้นิ้วกดถูก (inline style กว้าง 30 ต้องใช้ ! ถึงจะชนะ) */
      className={`iconbtn glass-thin shrink-0 text-muted-foreground disabled:opacity-30 max-sm:!size-[38px] ${
        danger ? "hover:text-destructive" : "hover:text-primary"
      }`}
      style={{ width: 30, height: 30 }}
    >
      {children}
    </button>
  );
}

function OptionDialog({
  group,
  initial,
  taken,
  onClose,
  onSave,
}: {
  group: OptionGroup;
  initial: string;
  taken: string[];
  onClose: () => void;
  onSave: (text: string) => void;
}) {
  const [text, setText] = useState(initial);
  const clean = text.trim();
  const dup = Boolean(clean) && taken.includes(clean);

  function save() {
    if (!clean || dup) return;
    onSave(clean);
  }

  return (
    <Sheet
      title={initial ? `แก้ไขตัวเลือก · ${group.label}` : `เพิ่มตัวเลือก · ${group.label}`}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" disabled={!clean || dup || clean === initial} onClick={save}>
            {initial ? "บันทึกการแก้ไข" : "เพิ่ม"}
          </button>
        </>
      }
    >
      <Input2 label="ข้อความตัวเลือก" error={dup ? "มีตัวเลือกนี้อยู่แล้ว" : undefined}>
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          className={inputCls}
        />
      </Input2>
      <p className="mt-3 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {initial
          ? "แก้ชื่อแล้ว ข้อมูลที่เคยเลือกตัวเลือกนี้ไว้ยังแสดงข้อความเดิม"
          : `ขึ้นให้เลือกใน${group.where} ทันทีที่กดบันทึกที่แถบล่าง`}
      </p>
    </Sheet>
  );
}

/** เพิ่ม/แก้รายการที่มีรหัสผูกระบบ — รหัสสร้างให้เอง ผู้ใช้เห็นแค่ชื่อกับช่องเพิ่มเติม */
function CatDialog({
  spec,
  initial,
  taken,
  depts,
  history,
  onClose,
  onSave,
}: {
  spec: CatSpec;
  initial?: CatItem;
  taken: string[];
  depts: CatItem[];
  history: WhtChange[];
  onClose: () => void;
  onSave: (item: CatItem, at?: string) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [dept, setDept] = useState(initial?.dept ?? depts[0]?.id ?? "");
  const [req, setReq] = useState(initial?.req ?? false);
  const [color, setColor] = useState(initial?.color ?? "#2f7dd1");
  const [rate, setRate] = useState(String(initial?.rate ?? 3));
  /* อัตราหัก ณ ที่จ่ายต้องมีวันเริ่มใช้ — ค่าเดิมยังอยู่ในประวัติด้านล่าง */
  const [at, setAt] = useState(todayIso());
  const past = history
    .filter((h) => initial && h.key === initial.id)
    .sort((a, b) => b.at.localeCompare(a.at));
  const clean = label.trim();
  const dup = Boolean(clean) && taken.includes(clean);
  const nRate = Number(rate);
  const badRate = spec.extra === "rate" && !(nRate >= 0 && nRate <= 15);

  function save() {
    if (!clean || dup || badRate) return;
    onSave({
      id: initial?.id ?? newCatalogKey(),
      label: clean,
      ...(spec.extra === "dept" ? { dept } : {}),
      ...(spec.extra === "req" ? { req } : {}),
      ...(spec.extra === "color" ? { color } : {}),
      ...(spec.extra === "rate" ? { rate: nRate } : {}),
    }, spec.extra === "rate" ? at : undefined);
  }

  return (
    <Sheet
      title={initial ? `แก้ไข · ${spec.label}` : `เพิ่ม · ${spec.label}`}
      narrow
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button type="button" className="btn solid btn-solid" disabled={!clean || dup || badRate} onClick={save}>
            {initial ? "บันทึกการแก้ไข" : "เพิ่ม"}
          </button>
        </>
      }
    >
      <div className="space-y-3.5">
        <Input2 label="ชื่อ" error={dup ? "มีชื่อนี้อยู่แล้ว" : undefined}>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && save()}
            className={inputCls}
          />
        </Input2>
        {spec.extra === "dept" && (
          <Input2 label="แผนก">
            <select value={dept} onChange={(e) => setDept(e.target.value)} className={`${inputCls} cursor-pointer`}>
              {depts.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Input2>
        )}
        {spec.extra === "rate" && (
          <>
            <Input2 label="อัตราหัก (%)" error={badRate ? "0–15%" : undefined}>
              <input
                type="number"
                min={0}
                max={15}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                className={`${inputCls} num w-[120px] text-right`}
              />
            </Input2>
            <Input2
              label="เริ่มใช้อัตรานี้"
              hint={at > todayIso() ? "ตั้งล่วงหน้า ระบบสลับให้เองเมื่อถึงวัน" : "มีผลกับเอกสารที่คิดยอดหลังจากนี้"}
            >
              <DateField
                value={at}
                onChange={setAt}
                label="วันเริ่มใช้อัตราหัก ณ ที่จ่าย"
                placeholder="เลือกวันที่"
                className="h-[38px] rounded-[10px] text-[13.5px]"
              />
            </Input2>
            {past.length > 0 && (
              <div>
                <p className="mb-1 text-[12px] font-semibold">ประวัติอัตรา</p>
                <ul className="divide-y divide-border rounded-[12px] border border-border bg-card text-[12.5px]">
                  {past.map((h) => (
                    <li key={h.at} className="flex items-baseline gap-2 px-3 py-1.5">
                      <b className="min-w-[110px] font-semibold">{thaiDate(h.at)}</b>
                      <span className="num text-muted-foreground">{h.rate}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {spec.extra === "color" && (
          <Input2 label="สีบนแผนงาน">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              aria-label="สีบนแผนงาน"
              className="h-10 w-20 cursor-pointer rounded-[10px] border border-border bg-card p-1"
            />
          </Input2>
        )}
        {spec.extra === "req" && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px]">
            <input type="checkbox" checked={req} onChange={(e) => setReq(e.target.checked)} className="size-4 accent-[var(--primary)]" />
            ต้องมี — ขาดแล้วขึ้นเตือนว่าเอกสารไม่ครบ
          </label>
        )}
      </div>
      <p className="mt-3.5 rounded-[11px] bg-muted/60 px-3.5 py-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
        {initial
          ? "แก้ชื่อแล้ว ข้อมูลเก่าที่ใช้รายการนี้จะแสดงชื่อใหม่ด้วย (อ้างรหัสเดียวกัน)"
          : `ขึ้นให้เลือกใน${spec.where} ทันทีที่กดบันทึกที่แถบล่าง`}
      </p>
    </Sheet>
  );
}
