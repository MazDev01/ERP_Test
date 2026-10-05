"use client";

import { optionsOf } from "@/lib/options";
/*
 * โฆษณาและรายงาน — เฉพาะงาน Digital Marketing
 *
 * สามแท็บคือสามขั้นตอนที่เกิดตามลำดับจริง
 *   แผนสื่อ      ตกลงกับลูกค้าไว้ว่าจะรันช่องทางไหน งบเท่าไร คาดผลเท่าไร
 *   สั่งรันโฆษณา  พอถึงรอบเดือน สั่งจริงตามแผน แล้วยืนยันว่ารันแล้ว
 *   รายงานผล     กรอกผลที่แพลตฟอร์มรายงานกลับมา เทียบกับที่คาดไว้
 *
 * งานที่ไม่ใช่ Digital Marketing จะไม่โผล่ในตัวเลือกโปรเจคเลย
 * เพราะไม่มีแผนสื่อให้ดู ไม่ใช่ว่ามีแล้วว่างเปล่า
 */

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AD_PLANS,
  costPerEngage,
  engageRate,
  type AdContent,
  type AdMetric,
  type AdRun,
} from "@/lib/ads-data";
import { addRun, markRun, saveMetric, useAds } from "@/lib/ads-store";
import { baht, thaiDate, thaiMonth, thaiStamp, todayIso, commaInput } from "@/lib/format";
import { currentProfile } from "@/lib/profile-data";
import { memberOf, usePm } from "@/lib/pm-store";
import { isRef } from "@/lib/pm-data";
import { useHr } from "@/lib/hr-store";
import { EyeIcon, PencilIcon, PlusIcon } from "./icons";
import { Sheet } from "./lead-dialogs";
import { MonthField, ThaiDatePicker } from "./thai-date-picker";
import { Field, Input, Select } from "./ui";
import { useAddOption } from "./add-option";

type Tab = "plan" | "run" | "report";

/** ช่องที่ต้องกรอกตอนบันทึกผล — ตรงกับที่แพลตฟอร์มรายงานกลับมา */
const FIELDS: { key: keyof AdMetric; label: string }[] = [
  { key: "impression", label: "การมองเห็น" },
  { key: "reach", label: "การเข้าถึง" },
  { key: "engagement", label: "มีส่วนร่วม" },
  { key: "reactions", label: "ถูกใจและความรู้สึก" },
  { key: "comments", label: "ความคิดเห็น" },
  { key: "saves", label: "บันทึกโพสต์" },
  { key: "shares", label: "แชร์" },
  { key: "clicks", label: "คลิก" },
  { key: "spent", label: "ใช้จ่าย (บาท)" },
];

export function PmAdsPage() {
  const pm = usePm();
  const ads = useAds();

  /* งาน Digital Marketing ทั้งหมด ทั้งที่ยังอยู่ในกล่องเข้าและที่เปิดโปรเจคแล้ว */
  const jobs = useMemo(() => {
    /* opened บอกว่าเปิดเป็นโปรเจคแล้วหรือยัง งานที่เปิดแล้วกดไปดูหน้าโปรเจคได้ */
    const fromInbox = pm.inbox
      .filter((j) => j.service === "dm")
      .map((j) => ({ pj: j.pj, cus: j.cus, scope: j.scope, opened: false, planStart: j.planStart }));
    const fromProjects = pm.projects
      .filter((p) => p.service === "dm")
      .map((p) => ({ pj: p.pj, cus: p.cus, scope: p.scope, opened: true, planStart: p.start }));
    return [...fromProjects, ...fromInbox];
  }, [pm.inbox, pm.projects]);

  /* หน้าโปรเจคของงาน DM ส่งเลขที่โปรเจคมาทาง ?pj= ให้เปิดตรงงานนั้นเลย · ลิงก์เก่า ?deal= ยังเปิดได้ (5 ต.ค. 2569) */
  const params = useSearchParams();
  const wantedRaw = params.get("pj") ?? params.get("deal") ?? "";
  const wanted = [...pm.projects, ...pm.inbox].find((x) => isRef(x, wantedRaw))?.pj ?? wantedRaw;
  /* ว่าง = ยังไม่ได้สลับเอง ใช้งานตามลิงก์ */
  const [picked, setPicked] = useState("");
  const current = jobs.find((j) => j.pj === (picked || wanted)) ?? jobs[0];
  const [tab, setTab] = useState<Tab>("plan");
  const [adding, setAdding] = useState(false);

  if (!current) {
    return (
      <div className="space-y-4">
        <Head />
        <section className="panel glass px-5 py-12 text-center text-[13.5px] text-muted-foreground">
          ยังไม่มีงาน Digital Marketing ในระบบ
        </section>
      </div>
    );
  }

  const plan = AD_PLANS[current.pj];
  const runs = ads.runs.filter((r) => r.pj === current.pj);
  const contents = ads.contents.filter((c) => c.pj === current.pj);

  return (
    <div className="space-y-4">
      <Head>
        <label className="flex items-center gap-2.5 max-sm:w-full">
          <span className="flex-none text-[12.5px] font-semibold text-muted-foreground">
            โปรเจค
          </span>
          <Select
            value={current.pj}
            onChange={(e) => setPicked(e.target.value)}
            className="w-auto min-w-[240px] max-sm:h-11 max-sm:min-w-0 max-sm:flex-1"
          >
            {jobs.map((j) => (
              <option key={j.pj} value={j.pj}>
                {j.cus}
              </option>
            ))}
          </Select>
        </label>
        {tab === "run" && (
          <button
            type="button"
            className="btn solid btn-solid max-sm:h-11 max-sm:w-full max-sm:justify-center"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="size-3.5" strokeWidth={2.4} />
            สั่งรันโฆษณา
          </button>
        )}
      </Head>

      <section className="panel glass flex flex-col">
        <div className="strip">
          <div className="tabs">
            <button type="button" className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>
              แผนสื่อ
            </button>
            <button type="button" className={tab === "run" ? "on" : ""} onClick={() => setTab("run")}>
              สั่งรันโฆษณา
            </button>
            <button type="button" className={tab === "report" ? "on" : ""} onClick={() => setTab("report")}>
              รายงานผล
            </button>
          </div>
        </div>

        {tab === "plan" && <PlanTab plan={plan} />}
        {tab === "run" && (
          <RunTab
            pj={current.pj}
            cus={current.cus}
            planStart={current.planStart}
            runs={runs}
            adding={adding}
            onAdd={setAdding}
          />
        )}
        {tab === "report" && <ReportTab pj={current.pj} contents={contents} />}
      </section>
    </div>
  );
}

function Head({ children }: { children?: React.ReactNode }) {
  return (
    <div className="bar">
      <div>
        <h1>โฆษณาและรายงาน</h1>
        <p>แผนสื่อ การสั่งรันโฆษณา และผลที่ได้ ของงาน Digital Marketing</p>
      </div>
      {children && <div className="tools w-full sm:w-auto">{children}</div>}
    </div>
  );
}

// ═══ แท็บที่ 1 · แผนสื่อ ═══════════════════════════════════════

function PlanTab({ plan }: { plan: (typeof AD_PLANS)[string] | undefined }) {
  if (!plan) {
    return (
      <p className="px-5 py-12 text-center text-[13.5px] text-muted-foreground">
        ยังไม่มีแผนสื่อของโปรเจคนี้
      </p>
    );
  }
  const total = plan.rows.reduce((sum, r) => sum + r.budget, 0);
  return (
    <>
      <dl className="mx-5 mt-4 grid gap-x-4 gap-y-2 rounded-[13px] border border-border bg-card px-4 py-3.5 text-[13.5px] max-sm:mx-3.5 max-sm:grid-cols-[92px_minmax(0,1fr)] max-sm:gap-x-3 sm:grid-cols-[150px_minmax(0,1fr)]">
        <Kv label="กลุ่มเป้าหมาย" value={plan.target.who} />
        <Kv label="พื้นที่" value={plan.target.area} />
        <Kv label="อายุ" value={plan.target.age} />
        {/* ความสนใจเป็นป้ายแยกทีละคำ ตามต้นแบบ */}
        <dt className="text-[12.5px] font-semibold text-muted-foreground">ความสนใจ</dt>
        <dd className="flex flex-wrap gap-1.5">
          {plan.target.interest.split("|").map((x) => x.trim()).filter(Boolean).map((x) => (
            <span key={x} className="rounded-full bg-muted px-2.5 py-0.5 text-[12px] text-muted-foreground">
              {x}
            </span>
          ))}
        </dd>
        <Kv label="ขนาดกลุ่ม" value={plan.target.size} />
      </dl>

      {/* มือถือ: การ์ดต่อช่องทาง หัวการ์ดคือช่องทางกับวัตถุประสงค์ งบอยู่ขวา รายละเอียดที่เหลือเป็นบรรทัดรอง */}
      <ul className="mt-3.5 space-y-2.5 px-3.5 sm:hidden">
        {plan.rows.map((r) => (
          <li
            key={`${r.channel}-${r.objective}-${r.tool}`}
            className="rounded-[13px] border border-border bg-card px-3.5 py-3"
          >
            <div className="flex items-start gap-3">
              <b className="min-w-0 flex-1 text-[14px] leading-snug font-bold">
                {r.channel} · {r.objective}
              </b>
              <b className="num flex-none text-[14px] font-bold">{baht(r.budget)}</b>
            </div>
            <dl className="mt-1.5 grid grid-cols-[76px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12.5px] leading-snug">
              <dt className="text-muted-foreground">เครื่องมือ</dt>
              <dd>{r.tool}</dd>
              <dt className="text-muted-foreground">ผลที่คาดไว้</dt>
              <dd>{r.est}</dd>
              <dt className="text-muted-foreground">หมายเหตุ</dt>
              <dd>{r.remark || "—"}</dd>
            </dl>
          </li>
        ))}
        <li className="flex items-center justify-between rounded-[13px] bg-muted px-3.5 py-3 text-[13.5px] font-semibold">
          รวมงบตามแผน
          <b className="num font-bold">{baht(total)} บาท</b>
        </li>
      </ul>

      <div className="scroll-stable mt-3.5 min-h-0 flex-1 overflow-auto max-sm:hidden">
        <table className="data-table cards-sm min-w-[880px]">
          <thead>
            <tr>
              <th style={{ width: 130 }}>ช่องทาง</th>
              <th style={{ width: 170 }}>วัตถุประสงค์</th>
              <th>เครื่องมือ</th>
              <th className="r" style={{ width: 120 }}>งบลูกค้า (บาท)</th>
              <th style={{ width: 170 }}>ผลที่คาดไว้</th>
              <th style={{ width: 180 }}>หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {plan.rows.map((r) => (
              <tr key={`${r.channel}-${r.objective}-${r.tool}`}>
                <td data-label="ช่องทาง">{r.channel}</td>
                <td data-label="วัตถุประสงค์">{r.objective}</td>
                <td data-label="เครื่องมือ" className="muted">{r.tool}</td>
                <td data-label="งบลูกค้า (บาท)" className="r num font-semibold">{baht(r.budget)}</td>
                <td data-label="ผลที่คาดไว้" className="muted">{r.est}</td>
                <td data-label="หมายเหตุ" className="muted">{r.remark || "—"}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3} className="font-semibold">
                รวมงบตามแผน
              </td>
              <td data-label="รวมงบตามแผน" className="r num font-bold">
                {baht(total)}
              </td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
      </div>

      <div className="foot">
        <span>ช่องทางในแผน {plan.rows.length} รายการ</span>
      </div>
    </>
  );
}

function Kv({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[12.5px] font-semibold text-muted-foreground">{label}</dt>
      <dd className="leading-relaxed">{value}</dd>
    </>
  );
}

// ═══ แท็บที่ 2 · สั่งรันโฆษณา ══════════════════════════════════

function RunTab({
  pj,
  cus,
  planStart,
  runs,
  adding,
  onAdd,
}: {
  pj: string;
  cus: string;
  /** วันเริ่มตามแผนของงาน — ใบแรกของงานตั้งรอบเดือนตามนี้ ตามต้นแบบ */
  planStart?: string;
  runs: AdRun[];
  adding: boolean;
  onAdd: (v: boolean) => void;
}) {
  const [open, setOpen] = useState<AdRun | null>(null);
  /* งบตามคำสั่งรวมทุกใบ ไม่ใช่เฉพาะใบที่รันแล้ว เพราะเป็นเงินที่ตกลงกับลูกค้าไว้ทั้งรอบ */
  const ordered = runs.reduce((sum, r) => sum + r.budget, 0);

  return (
    <>
      {/* มือถือ: การ์ดทั้งใบกดเปิดรายละเอียดของคำสั่งรัน */}
      <ul className="space-y-2.5 px-3.5 py-3.5 sm:hidden">
        {runs.length === 0 ? (
          <li className="py-10 text-center text-[13px] text-muted-foreground">ยังไม่มีการสั่งรันโฆษณา</li>
        ) : (
          runs.map((r) => (
            <li key={`${r.round}-${r.channel}-${r.tool}`}>
              <button
                type="button"
                aria-label={`ดูรายละเอียด ${r.channel} ${r.tool}`}
                onClick={() => setOpen(r)}
                className="block w-full rounded-[13px] border border-border bg-card px-3.5 py-3 text-left active:bg-muted"
              >
                <span className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <b className="block text-[14px] leading-snug font-bold">
                      {r.channel} · {r.tool}
                    </b>
                    <span className="num mt-0.5 block text-[12px] text-muted-foreground">
                      รอบ {thaiMonth(r.round)}
                    </span>
                  </span>
                  <span className={`tag flex-none ${r.ran ? "t-ok" : "t-early"}`}>
                    <i />
                    {r.ran ? "รันแล้ว" : "ยังไม่รัน"}
                  </span>
                </span>
                <span className="mt-2 flex items-end justify-between gap-3 text-[12.5px]">
                  <span className="num text-muted-foreground">
                    {thaiDate(r.start)} – {thaiDate(r.end)}
                  </span>
                  <b className="num flex-none font-semibold">{baht(r.budget)}</b>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
        <table className="data-table cards-sm min-w-[980px]">
          <thead>
            <tr>
              <th style={{ width: 130 }}>รอบเดือน</th>
              <th style={{ width: 120 }}>ช่องทาง</th>
              <th>เครื่องมือ</th>
              <th style={{ width: 200 }}>ช่วงรันโฆษณา</th>
              <th className="r" style={{ width: 118 }}>งบลูกค้า (บาท)</th>
              <th style={{ width: 130 }}>สถานะ</th>
              <th className="c" style={{ width: 90 }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {runs.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  ยังไม่มีการสั่งรันโฆษณา
                </td>
              </tr>
            ) : (
              runs.map((r) => (
                /* กดตรงไหนของแถวก็เปิดรายละเอียดได้ ไม่ต้องเล็งปุ่มเล็ก ๆ ท้ายแถว */
                <tr
                  key={`${r.round}-${r.channel}-${r.tool}`}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => setOpen(r)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(r)}
                >
                  <td data-label="รอบเดือน" className="num muted">{thaiMonth(r.round)}</td>
                  <td data-label="ช่องทาง">{r.channel}</td>
                  <td data-label="เครื่องมือ" className="muted">{r.tool}</td>
                  <td data-label="ช่วงรันโฆษณา" className="num muted">
                    {thaiDate(r.start)} – {thaiDate(r.end)}
                  </td>
                  <td data-label="งบลูกค้า (บาท)" className="r num font-semibold">{baht(r.budget)}</td>
                  <td data-label="สถานะ">
                    <span className={`tag ${r.ran ? "t-ok" : "t-early"}`}>
                      <i />
                      {r.ran ? "รันแล้ว" : "ยังไม่รัน"}
                    </span>
                  </td>
                  <td data-label="จัดการ" className="c">
                    <button
                      type="button"
                      className="iconbtn glass-thin mx-auto size-8"
                      aria-label={`ดูรายละเอียด ${r.channel} ${r.tool}`}
                      title="ดูรายละเอียด"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(r);
                      }}
                    >
                      <EyeIcon className="size-[17px]" strokeWidth={1.9} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="foot flex-col items-stretch gap-2 text-center sm:flex-row sm:items-center sm:text-left">
        <span>
          สั่งแล้ว {runs.length} รายการ · รันแล้ว {runs.filter((r) => r.ran).length}
        </span>
        <span className="sum sm:ml-auto">
          งบตามคำสั่งรวม<b>{baht(ordered)}</b> บาท
        </span>
      </div>

      {open && <RunSheet run={open} onClose={() => setOpen(null)} />}
      {adding && (
        <NewRunSheet
          pj={pj}
          cus={cus}
          runs={runs}
          lastRound={runs[runs.length - 1]?.round ?? (planStart ? planStart.slice(0, 7) : undefined)}
          onClose={() => onAdd(false)}
        />
      )}
    </>
  );
}

/**
 * สั่งรันโฆษณาใบใหม่
 *
 * รอบเดือนกับช่วงวันแยกกัน เพราะรอบเดือนคือรอบบัญชีของลูกค้า
 * ส่วนช่วงวันคือช่วงที่โฆษณาเดินจริง ซึ่งคร่อมเดือนได้
 */
function NewRunSheet({
  pj,
  cus,
  runs,
  lastRound,
  onClose,
}: {
  pj: string;
  cus: string;
  /** ใบสั่งรันที่มีอยู่แล้วของงานนี้ — กันสั่งซ้ำใบเดิม */
  runs: AdRun[];
  /** รอบของคำสั่งล่าสุด — ใบใหม่ส่วนใหญ่สั่งเพิ่มในรอบเดิม จึงตั้งต้นให้ตรงกัน */
  lastRound?: string;
  onClose: () => void;
}) {
  const today = todayIso();
  /* เปิดตัวเลือกวันได้ทีละช่อง */
  const [pick, setPick] = useState<"s" | "e" | null>(null);
  /* กดบันทึกทั้งที่กรอกไม่ครบ = ขึ้นคำเตือนตามต้นแบบ ไม่ปิดปุ่มไว้เฉย ๆ */
  const [warn, setWarn] = useState(false);
  const [form, setForm] = useState({
    round: lastRound ?? today.slice(0, 7),
    channel: optionsOf("adPlatform")[0] ?? "",
    tool: "",
    budget: "",
    start: "",
    end: "",
    note: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((v) => ({ ...v, ...patch }));
  const addPlatform = useAddOption({ list: "adPlatform" }, (v) => set({ channel: v }));

  const budget = Number(form.budget.replace(/,/g, "").trim());
  /*
   * ใบสั่งรันไม่มีรหัสของตัวเอง ระบบอ้างถึงด้วย รอบ + ช่องทาง + เครื่องมือ (ดู markRun)
   * สั่งซ้ำชุดเดิมจึงกลายเป็นสองใบที่แยกกันไม่ออก กดยืนยันใบเดียวแล้วติดทั้งคู่ — กันไว้ตั้งแต่ตอนสั่ง
   */
  const dup = runs.some(
    (r) =>
      r.round === form.round &&
      r.channel === form.channel &&
      r.tool.trim() === form.tool.trim() &&
      form.tool.trim() !== "",
  );
  const ok =
    form.tool.trim() !== "" &&
    /^\d+(\.\d+)?$/.test(form.budget.replace(/,/g, "").trim()) &&
    form.round !== "" &&
    form.start !== "" &&
    form.end !== "" &&
    form.start <= form.end &&
    !dup;

  return (
    <Sheet
      title="สั่งรันโฆษณา"
      wide
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
              if (!ok) {
                setWarn(true);
                return;
              }
              addRun({
                pj,
                round: form.round,
                /* ผู้ดูแลสื่อและผู้ดูแลลูกค้ายังไม่มีให้เลือก ระบบยังไม่รู้ว่าใครล็อกอินอยู่
                   TODO: ใช้ผู้ใช้ที่ล็อกอินเป็นผู้สั่งเมื่อต่อ auth แล้ว */
                media: "E09",
                ae: "E10",
                orderedAt: today,
                orderedBy: currentProfile().name,
                channel: form.channel,
                tool: form.tool.trim(),
                start: form.start,
                end: form.end,
                budget,
                note: form.note.trim(),
              });
              onClose();
            }}
          >
            บันทึกคำสั่ง
          </button>
        </>
      }
    >
      {/* กดที่ว่างในกล่อง = ปิดตัวเลือกวันที่เปิดค้างอยู่ */}
      <div onClick={() => setPick(null)}>
      <p className="text-[12.5px] text-muted-foreground">{cus}</p>

      <div className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        <Field label="รอบเดือน" htmlFor="run-round" required>
          <MonthField id="run-round" label="รอบเดือน" value={form.round} onChange={(ym) => set({ round: ym })} />
        </Field>
        <Field label="ช่องทาง" htmlFor="run-channel" required>
          <Select
            id="run-channel"
            value={form.channel}
            onChange={(e) => addPlatform.pick(e.target.value) || set({ channel: e.target.value })}
          >
            {optionsOf("adPlatform").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            {addPlatform.option}
          </Select>
        </Field>
        {addPlatform.dialog}
        <Field label="เครื่องมือ" htmlFor="run-tool" required>
          <Input
            id="run-tool"
            value={form.tool}
            onChange={(e) => set({ tool: e.target.value })}
            placeholder="เช่น Single Ads 1-3"
          />
        </Field>
        <Field label="งบ (บาท)" htmlFor="run-budget" required>
          <Input
            id="run-budget"
            inputMode="decimal"
            value={form.budget}
            onChange={(e) => set({ budget: commaInput(e.target.value) })}
            placeholder="0"
          />
        </Field>
        <Field label="เริ่มรันโฆษณา" required>
          <ThaiDatePicker
            value={form.start}
            open={pick === "s"}
            label="วันเริ่มรันโฆษณา"
            clearable
            onToggle={() => setPick((p) => (p === "s" ? null : "s"))}
            onPick={(iso) => {
              /* ขยับวันเริ่มไปหลังวันสิ้นสุด ให้วันสิ้นสุดตามไปด้วย ช่วงจะได้ไม่กลับด้าน */
              set(iso && form.end && form.end < iso ? { start: iso, end: iso } : { start: iso });
              setPick(null);
            }}
          />
        </Field>
        <Field label="สิ้นสุด" required>
          <ThaiDatePicker
            value={form.end}
            min={form.start || undefined}
            open={pick === "e"}
            label="วันสิ้นสุดรันโฆษณา"
            clearable
            onToggle={() => setPick((p) => (p === "e" ? null : "e"))}
            onPick={(iso) => {
              set({ end: iso });
              setPick(null);
            }}
          />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="หมายเหตุ" htmlFor="run-note">
          <Input
            id="run-note"
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
            placeholder="ไม่บังคับ"
          />
        </Field>
      </div>

      {dup && (
        <p role="alert" className="mt-4 rounded-[11px] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] font-semibold text-destructive">
          รอบนี้สั่ง {form.channel} · {form.tool.trim()} ไปแล้ว ถ้าจะสั่งเพิ่มให้แยกชื่อเครื่องมือหรือเปลี่ยนรอบเดือน
        </p>
      )}
      {warn && !ok && !dup && (
        <p role="alert" className="mt-4 rounded-[11px] bg-[var(--destructive-soft)] px-3.5 py-2.5 text-[12.5px] font-semibold text-destructive">
          กรอกเครื่องมือ งบเป็นตัวเลข และช่วงวันให้ครบ
        </p>
      )}
      <p className="mt-4 rounded-[11px] border border-border bg-card px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {ok
          ? "สั่งแล้วสถานะเริ่มที่ ยังไม่รัน ต้องกลับมากดยืนยันเมื่อรันโฆษณาขึ้นจริง"
          : "กรอกเครื่องมือ งบเป็นตัวเลข และช่วงวันให้ครบ โดยวันสิ้นสุดต้องไม่ก่อนวันเริ่ม"}
      </p>
      </div>
    </Sheet>
  );
}

/*
 * ชื่อคนจากรหัสพนักงาน — ทีมของ PM ไม่มีตัว PM เองอยู่ในทะเบียน (PM_TEAM)
 * ใบสั่งรันเก็บรหัส PM ไว้ที่ ae จึงต้องถอยไปอ่านทะเบียนฝ่ายบุคคล ไม่งั้นขึ้นเป็นรหัสดิบ เช่น "E10"
 */
function useEmpName() {
  const hr = useHr();
  return (id: string) => memberOf(id)?.name ?? hr.emp.find((e) => e.id === id)?.name ?? id;
}

function RunSheet({ run, onClose }: { run: AdRun; onClose: () => void }) {
  const nameOf = useEmpName();
  return (
    <Sheet
      title={`${run.channel} · ${run.tool}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ปิด
          </button>
          {/* ยืนยันว่ารันจริงแล้ว — รันแล้วยกเลิกไม่ได้ เงินออกไปแล้ว */}
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={run.ran}
            onClick={() => {
              markRun(run.pj, run.round, run.channel, run.tool, currentProfile().name);
              onClose();
            }}
          >
            {run.ran ? "ยืนยันแล้ว" : "ยืนยันว่ารันแล้ว"}
          </button>
        </>
      }
    >
      <dl className="grid gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-[140px_minmax(0,1fr)]">
        <Kv label="รอบเดือน" value={thaiMonth(run.round)} />
        <Kv label="ผู้ดูแลสื่อ" value={nameOf(run.media)} />
        <Kv label="ผู้ดูแลงาน (PM)" value={nameOf(run.ae)} />
        <Kv label="วันที่สั่งรัน" value={thaiDate(run.orderedAt)} />
        <Kv label="ช่วงรันโฆษณา" value={`${thaiDate(run.start)} – ${thaiDate(run.end)}`} />
        <Kv label="งบลูกค้า" value={`${baht(run.budget)} บาท`} />
        <Kv label="สถานะ" value={run.ran ? "รันแล้ว" : "ยังไม่รัน"} />
        {/* ผู้ยืนยันและเวลา — ตรวจย้อนได้ (PM-BR-10) · ใบตั้งต้นไม่มีข้อมูลนี้ */}
        {run.ranBy && <Kv label="ยืนยันโดย" value={`${run.ranBy} · ${thaiStamp(run.ranAt ?? "")}`} />}
        <Kv label="หมายเหตุ" value={run.note || "ไม่มี"} />
      </dl>

      {!run.ran && (
        <p className="mt-4 rounded-[11px] border border-border bg-card px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
          เมื่อรันโฆษณาขึ้นจริงแล้วให้กดยืนยัน ระบบจะบันทึกว่ารันแล้ว
        </p>
      )}
    </Sheet>
  );
}

// ═══ แท็บที่ 3 · รายงานผล ══════════════════════════════════════

function ReportTab({ pj, contents }: { pj: string; contents: AdContent[] }) {
  const [open, setOpen] = useState<AdContent | null>(null);
  const done = contents.filter((c) => c.m);

  /* ยอดรวมคิดจากชิ้นที่กรอกผลแล้วเท่านั้น ชิ้นที่ยังว่างไม่นับเป็นศูนย์ */
  const sum = done.reduce(
    (acc, c) => ({
      impression: acc.impression + (c.m?.impression ?? 0),
      engagement: acc.engagement + (c.m?.engagement ?? 0),
      spent: acc.spent + (c.m?.spent ?? 0),
    }),
    { impression: 0, engagement: 0, spent: 0 },
  );

  return (
    <>
      {/* มือถือ: การ์ดต่อชิ้นงาน ตัวเลขผลเรียงเป็นตาราง 3 ช่อง กดทั้งใบเปิดฟอร์มกรอกหรือแก้ผล */}
      <ul className="space-y-2.5 px-3.5 py-3.5 sm:hidden">
        {contents.length === 0 ? (
          <li className="py-10 text-center text-[13px] leading-relaxed text-muted-foreground">
            ยังไม่มีชิ้นงานของโปรเจคนี้
            <span className="mt-1 block text-xs">ชิ้นงานจะขึ้นเองเมื่อทีมส่งอาร์ตเวิร์กและแคปชันในเฟสผลิตชิ้นงาน</span>
          </li>
        ) : (
          contents.map((c) => (
            <li key={`${c.round}-${c.name}`}>
              <button
                type="button"
                aria-label={`${c.m ? "แก้ผล" : "กรอกผล"} ${c.name}`}
                onClick={() => setOpen(c)}
                className="block w-full rounded-[13px] border border-border bg-card px-3.5 py-3 text-left active:bg-muted"
              >
                <b className="block text-[14px] leading-snug font-bold">{c.name}</b>
                <span className="num mt-0.5 block text-[12px] text-muted-foreground">
                  {c.type} · รอบ {thaiMonth(c.round)}
                </span>
                {c.m ? (
                  <span className="mt-2.5 grid grid-cols-3 gap-2">
                    {(
                      [
                        ["การมองเห็น", c.m.impression.toLocaleString()],
                        ["การเข้าถึง", c.m.reach.toLocaleString()],
                        ["มีส่วนร่วม", c.m.engagement.toLocaleString()],
                        ["อัตรา", `${engageRate(c.m).toFixed(2)}%`],
                        ["คลิก", c.m.clicks.toLocaleString()],
                        ["ใช้จ่าย", baht(c.m.spent)],
                      ] as const
                    ).map(([k, v]) => (
                      <span key={k} className="rounded-[9px] bg-muted px-2 py-1.5">
                        <em className="block text-[10.5px] text-muted-foreground not-italic">{k}</em>
                        <b className="num block text-[12.5px] font-semibold">{v}</b>
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="mt-2 block text-[12.5px] text-muted-foreground">ยังไม่ได้กรอกผล</span>
                )}
                <span className="btn glass-thin mt-3 h-10 w-full justify-center">
                  <PencilIcon className="size-[15px]" strokeWidth={1.9} />
                  {c.m ? "แก้ผล" : "กรอกผล"}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="scroll-stable min-h-0 flex-1 overflow-auto max-sm:hidden">
        <table className="data-table cards-sm min-w-[1040px]">
          <thead>
            <tr>
              <th>ชิ้นงาน</th>
              <th style={{ width: 96 }}>รูปแบบ</th>
              <th className="r" style={{ width: 110 }}>การมองเห็น</th>
              <th className="r" style={{ width: 104 }}>การเข้าถึง</th>
              <th className="r" style={{ width: 110 }}>มีส่วนร่วม</th>
              <th className="r" style={{ width: 96 }}>อัตรา</th>
              <th className="r" style={{ width: 96 }}>คลิก</th>
              <th className="r" style={{ width: 116 }}>ใช้จ่าย</th>
              <th className="c" style={{ width: 90 }}>จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {contents.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-10 text-center leading-relaxed text-muted-foreground">
                  ยังไม่มีชิ้นงานของโปรเจคนี้
                  <span className="mt-1 block text-xs">
                    ชิ้นงานจะขึ้นเองเมื่อทีมส่งอาร์ตเวิร์กและแคปชันในเฟสผลิตชิ้นงาน
                  </span>
                </td>
              </tr>
            ) : (
              contents.map((c) => (
                /* กดตรงไหนของแถวก็เปิดฟอร์มกรอกผลได้ ไม่ต้องเล็งปุ่มท้ายแถว */
                <tr
                  key={`${c.round}-${c.name}`}
                  tabIndex={0}
                  style={{ cursor: "pointer" }}
                  onClick={() => setOpen(c)}
                  onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen(c)}
                >
                  <td data-label="ชิ้นงาน">
                    {c.name}
                    <span className="why num">รอบ {thaiMonth(c.round)}</span>
                  </td>
                  <td data-label="รูปแบบ" className="muted">{c.type}</td>
                  {c.m ? (
                    <>
                      <td data-label="การมองเห็น" className="r num">{c.m.impression.toLocaleString()}</td>
                      <td data-label="การเข้าถึง" className="r num">{c.m.reach.toLocaleString()}</td>
                      <td data-label="มีส่วนร่วม" className="r num">{c.m.engagement.toLocaleString()}</td>
                      <td data-label="อัตรา" className="r num">{engageRate(c.m).toFixed(2)}%</td>
                      <td data-label="คลิก" className="r num">{c.m.clicks.toLocaleString()}</td>
                      <td data-label="ใช้จ่าย" className="r num font-semibold">{baht(c.m.spent)}</td>
                    </>
                  ) : (
                    <td className="c muted" colSpan={6} data-label="ผล">
                      ยังไม่ได้กรอกผล
                    </td>
                  )}
                  <td data-label="จัดการ" className="c">
                    <button
                      type="button"
                      className="iconbtn glass-thin mx-auto size-8"
                      aria-label={`${c.m ? "แก้ผล" : "กรอกผล"} ${c.name}`}
                      title={c.m ? "แก้ผล" : "กรอกผล"}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpen(c);
                      }}
                    >
                      <PencilIcon className="size-[17px]" strokeWidth={1.9} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="foot flex-col items-stretch gap-2 text-center sm:flex-row sm:items-center sm:text-left">
        {done.length === 0 ? (
          <span>{contents.length ? "ยังไม่มีชิ้นงานที่กรอกผล" : "—"}</span>
        ) : (
          <>
            <span>
              กรอกผลแล้ว {done.length} จาก {contents.length} ชิ้น
            </span>
            <span className="sum sm:ml-auto">
              การมองเห็น<b>{sum.impression.toLocaleString()}</b> · มีส่วนร่วม
              <b>{sum.engagement.toLocaleString()}</b> (
              {sum.impression ? ((sum.engagement * 100) / sum.impression).toFixed(2) : "0.00"}%) ·
              ใช้จ่าย<b>{baht(sum.spent)}</b> บาท
            </span>
          </>
        )}
      </div>

      {open && (
        <MetricSheet pj={pj} content={open} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/** ค่าเริ่มต้นของฟอร์ม — ชิ้นที่ยังไม่เคยกรอกเริ่มจากว่าง ไม่ใช่ศูนย์ */
function blankForm(m: AdMetric | null): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of FIELDS) out[f.key] = m ? String(m[f.key]) : "";
  return out;
}

function MetricSheet({
  pj,
  content,
  onClose,
}: {
  pj: string;
  content: AdContent;
  onClose: () => void;
}) {
  const [form, setForm] = useState(() => blankForm(content.m));

  /* ทุกช่องต้องเป็นตัวเลขไม่ติดลบ ผลจากแพลตฟอร์มไม่มีทางติดลบอยู่แล้ว */
  const parsed = useMemo(() => {
    const out = {} as AdMetric;
    for (const f of FIELDS) {
      const raw = form[f.key].replace(/,/g, "").trim();
      if (!/^\d+(\.\d+)?$/.test(raw)) return null;
      out[f.key] = Number(raw);
    }
    return out;
  }, [form]);

  return (
    <Sheet
      title={content.m ? "แก้ผลโฆษณา" : "กรอกผลโฆษณา"}
      wide
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn glass-thin" onClick={onClose}>
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn solid btn-solid disabled:opacity-45"
            disabled={!parsed}
            onClick={() => {
              if (!parsed) return;
              saveMetric(pj, content.round, content.name, parsed, currentProfile().name);
              onClose();
            }}
          >
            บันทึกผล
          </button>
        </>
      }
    >
      <p className="text-[12.5px] text-muted-foreground">
        {content.name} · {content.type} · รอบ {thaiMonth(content.round)}
      </p>
      {/* ตัวเลขคีย์มือ — บอกว่าใครกรอกล่าสุดเมื่อไร ตรวจย้อนได้ (PM-BR-10) */}
      {content.by && (
        <p className="mt-1 text-[12px] text-muted-foreground">
          กรอกล่าสุดโดย {content.by} · {thaiStamp(content.at ?? "")}
        </p>
      )}

      <div className="mt-4 grid gap-x-4 gap-y-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`m-${f.key}`}>
            <Input
              id={`m-${f.key}`}
              inputMode="numeric"
              value={form[f.key]}
              onChange={(e) => setForm((v) => ({ ...v, [f.key]: e.target.value }))}
              placeholder="0"
            />
          </Field>
        ))}
      </div>

      {/* คิดให้ดูสดขณะพิมพ์ จะได้เห็นว่าตัวเลขที่กรอกสมเหตุสมผลไหมก่อนบันทึก */}
      <p className="mt-4 rounded-[11px] border border-border bg-card px-3.5 py-3 text-[12.5px] leading-relaxed text-muted-foreground">
        {parsed ? (
          <>
            ระบบคำนวณให้ · อัตราการมีส่วนร่วม{" "}
            <b className="num font-bold text-foreground">{engageRate(parsed).toFixed(2)}%</b> · ต้นทุนต่อการ
            มีส่วนร่วม{" "}
            <b className="num font-bold text-foreground">{baht(costPerEngage(parsed))}</b> บาท
          </>
        ) : (
          "กรอกได้เฉพาะตัวเลขจำนวนเต็มไม่ติดลบ · กรอกให้ครบทุกช่องเพื่อดูค่าที่ระบบคำนวณให้"
        )}
      </p>
    </Sheet>
  );
}
