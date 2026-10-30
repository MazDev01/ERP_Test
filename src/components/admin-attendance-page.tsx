"use client";

/*
 * เวลาทำงานและจุดลงเวลา (ต้นแบบ HR-15) — หน้าเดียวรวมเวลาเข้า-ออกงานกับพิกัดที่ลงเวลาได้
 *
 * ต่างจากหน้าเดิม (/admin/schedule + /admin/areas) ตรงที่บันทึกพร้อม "วันที่เริ่มใช้ค่าใหม่"
 * ชุดเดิมเก็บเป็นประวัติ ตั้งล่วงหน้าได้ ระบบสลับให้เองเมื่อถึงวัน (settings().attHistory)
 * รอบเงินเดือนที่ปิดไปแล้วแก้ไม่ได้ — วันที่เริ่มใช้ต้องอยู่หลังวันปิดรอบล่าสุด
 */

import { useEffect, useRef, useState } from "react";
import { HR_OT_DIVISOR, hrActivePositions, hrPos } from "@/lib/hr-data";
import { AdminHead, Card, Input2, inputCls } from "./admin-ui";
import { AreaMap } from "./area-map";
import { CheckIcon, CrosshairIcon, PlusIcon, TrashIcon } from "./icons";
import { DateField } from "./thai-date-picker";
import { thaiDate, todayIso } from "@/lib/format";
import { minutesOfDay, formatMinutes, formatMinutesOfDay } from "@/lib/work-schedule";
import { logChange } from "@/lib/admin-log";
import { saveAttFrom, saveSection, settings, useSystemSettings, type AttChange, type PosSchedule, type LateMode, type RateSettings, type ScheduleSettings } from "@/lib/system-settings";
import { Card as UiCard, Input2 as UiInput2, SaveBar, useSectionDraft } from "./admin-ui";
import { baht, thaiMonth } from "@/lib/format";
import { RADIUS_MAX, RADIUS_MIN, locate, mapLink, saveWorkplace, useAreaSettings, workplaceOf } from "@/lib/work-area";
import { lockedUntil, useHr } from "@/lib/hr-store";
import { Time24Input } from "./time24-input"; // ช่องเวลา 24 ชม. แทน input[type=time] (ผู้ใช้สั่ง 13 ต.ค. 2569)

/** รัศมีกรอกเป็นเมตร (ผู้ใช้สั่ง 20 ต.ค. 2569 — กิโลเมตรอ่านแล้วงง) */
const M_MIN = RADIUS_MIN;
const M_MAX = RADIUS_MAX;

type Draft = { start: string; end: string; lunchStart: string; lunchEnd: string; lat: string; lng: string; km: string };

/* กติกาเวลาเดียวกันทั้งเวลาบริษัทและเวลาเฉพาะตำแหน่ง (ผู้ใช้สั่ง 16 ต.ค. 2569) */
function timesProblem(d: { start: string; end: string; lunchStart: string; lunchEnd: string }) {
  const t = (x: string) => minutesOfDay(x);
  if ([d.start, d.end, d.lunchStart, d.lunchEnd].some((x) => !/^\d{2}:\d{2}$/.test(x))) return "กรอกเวลาให้ครบทุกช่อง";
  if (t(d.end) <= t(d.start)) return "เวลาเลิกงานต้องหลังเวลาเข้างาน";
  if (t(d.lunchEnd) <= t(d.lunchStart)) return "เวลาสิ้นสุดพักเที่ยงต้องหลังเวลาเริ่มพัก";
  if (t(d.lunchStart) < t(d.start) || t(d.lunchEnd) > t(d.end)) return "ช่วงพักเที่ยงต้องอยู่ในเวลาทำงาน";
  return "";
}

/* ดรอปดาวน์เลือกตำแหน่ง — แผงรายการแบบเดียวกับช่อง "ส่งให้" ของระบบ ไม่ใช้ select ของเบราว์เซอร์ (ผู้ใช้สั่ง 30 ต.ค. 2569) */
function PosPicker({
  value,
  options,
  onPick,
}: {
  value: string;
  options: { v: string; label: string }[];
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", off);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", off);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const picked = options.find((o) => o.v === value);
  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((x) => !x)}
        className="field-control flex h-10 w-full cursor-pointer items-center justify-between gap-2 text-left text-[14px]"
      >
        <span className={`clip min-w-0 flex-1 ${picked ? "" : "text-muted-foreground"}`}>
          {picked ? picked.label : "เลือกตำแหน่ง"}
        </span>
        <span aria-hidden className="shrink-0 text-[11px] text-muted-foreground">
          ▾
        </span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label="ตำแหน่ง"
          className="glass-solid scroll-stable absolute top-[calc(100%+6px)] right-0 left-0 z-90 max-h-[280px] overflow-auto rounded-[13px] p-1.5"
        >
          {options.map((o) => (
            <li
              key={o.v}
              role="option"
              aria-selected={o.v === value}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(o.v);
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-[9px] px-[11px] py-2.5 text-[13.5px] transition-colors hover:bg-accent"
            >
              <span className="clip min-w-0 flex-1">{o.label}</span>
              {o.v === value && <CheckIcon className="size-4 shrink-0 text-primary" strokeWidth={2.4} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* โอทีย้ายมาต่อท้ายเวลาทำงานในหน้านี้ (ผู้ใช้สั่ง 30 ต.ค. 2569) — บันทึกแล้วมีผลทันที ไม่มีวันเริ่มใช้แยก */
const OT_KEYS = ["otStart", "holLunchStart", "holLunchEnd", "holDinnerStart", "holDinnerEnd"] as const;
type OtDraft = Pick<ScheduleSettings, (typeof OT_KEYS)[number]>;
const otOf = (x: ScheduleSettings): OtDraft => ({
  otStart: x.otStart,
  holLunchStart: x.holLunchStart,
  holLunchEnd: x.holLunchEnd,
  holDinnerStart: x.holDinnerStart,
  holDinnerEnd: x.holDinnerEnd,
});
function otProblem(o: OtDraft) {
  if (OT_KEYS.some((k) => !/^\d{2}:\d{2}$/.test(o[k]))) return "กรอกเวลาโอทีให้ครบทุกช่อง";
  if (minutesOfDay(o.holLunchEnd) <= minutesOfDay(o.holLunchStart)) return "พักเที่ยงโอทีวันหยุด เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม";
  if (minutesOfDay(o.holDinnerEnd) <= minutesOfDay(o.holDinnerStart)) return "พักเย็นโอทีวันหยุด เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม";
  return "";
}

const POS_TIME_LABEL: [keyof Omit<PosSchedule, "pos">, string][] = [
  ["start", "เข้างาน"],
  ["end", "เลิกงาน"],
  ["lunchStart", "เริ่มพักเที่ยง"],
  ["lunchEnd", "สิ้นสุดพักเที่ยง"],
];

function problemOf(d: Draft) {
  const bad = timesProblem(d);
  if (bad) return bad;
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const km = Number(d.km);
  if (!(d.lat.trim() && Number.isFinite(lat) && Math.abs(lat) <= 90)) return "ละติจูดต้องอยู่ระหว่าง -90 ถึง 90";
  if (!(d.lng.trim() && Number.isFinite(lng) && Math.abs(lng) <= 180)) return "ลองจิจูดต้องอยู่ระหว่าง -180 ถึง 180";
  if (!(Number.isFinite(km) && km >= M_MIN && km <= M_MAX)) return `รัศมีต้องอยู่ระหว่าง ${M_MIN.toLocaleString()} ถึง ${M_MAX.toLocaleString()} เมตร`;
  return "";
}

function statusOf(list: AttChange[], h: AttChange) {
  const today = todayIso();
  if (h.at > today) return { label: "ล่วงหน้า", cls: "bg-[var(--warning-soft)] text-[var(--warning)]" };
  const now = [...list].filter((x) => x.at <= today).sort((a, b) => a.at.localeCompare(b.at)).pop();
  return now === h
    ? { label: "ใช้อยู่", cls: "bg-[#E7F5EE] text-[#14875A]" }
    : { label: "ใช้ก่อนหน้า", cls: "bg-muted text-muted-foreground" };
}

export function AdminAttendancePage() {
  const s = useSystemSettings();
  const areas = useAreaSettings();
  const place = workplaceOf(areas);
  const hr = useHr();
  /* รอบที่ปิดแล้วแก้ไม่ได้ — ค่าใหม่เริ่มใช้ได้ตั้งแต่วันถัดจากวันปิดรอบล่าสุด */
  const locked = lockedUntil(hr);
  const minAt = locked ? nextDay(locked) : "";

  const [d, setD] = useState<Draft>(() => ({
    start: s.schedule.start,
    end: s.schedule.end,
    lunchStart: s.schedule.lunchStart,
    lunchEnd: s.schedule.lunchEnd,
    lat: String(place.lat),
    lng: String(place.lng),
    km: String(place.radius),
  }));
  const [at, setAt] = useState(() => (minAt && minAt > todayIso() ? minAt : todayIso()));
  /*
   * เวลาทำงานเฉพาะตำแหน่ง — เลือกตำแหน่งได้หลายตำแหน่ง (ผู้ใช้สั่ง 30 ต.ค. 2569)
   * บันทึกแล้วมีผลทันที ไม่มีวันเริ่มใช้แยก · ลงประวัติการตั้งค่าเหมือนช่องอื่น
   */
  const posSaved = s.positionSchedules;
  const [pl, setPl] = useState<PosSchedule[]>(posSaved);
  const posBad =
    pl
      .map((p) => {
        const b = p.pos ? timesProblem(p) : "เลือกตำแหน่ง";
        return b ? `${p.pos ? hrPos(p.pos).label : "ตำแหน่งที่เพิ่ม"}: ${b}` : "";
      })
      .find(Boolean) ?? "";
  const posDirty = JSON.stringify(pl) !== JSON.stringify(posSaved);
  /* เริ่มโอทีของตำแหน่ง = เลิกงานของตำแหน่ง + ช่วงพักเย็นยาวเท่าของบริษัท (ดู scheduleFor) */
  const posOt = (p: PosSchedule) =>
    formatMinutesOfDay(
      Math.min(
        24 * 60 - 1,
        minutesOfDay(p.end) + Math.max(0, minutesOfDay(s.schedule.otStart) - minutesOfDay(s.schedule.end)),
      ),
    );
  const setPos = (i: number, patch: Partial<PosSchedule>) =>
    setPl((x) => x.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const addPos = () =>
    setPl((x) => [
      ...x,
      { pos: "", start: s.schedule.start, end: s.schedule.end, lunchStart: s.schedule.lunchStart, lunchEnd: s.schedule.lunchEnd },
    ]);
  const [ot, setOt] = useState<OtDraft>(() => otOf(s.schedule));
  const otDirty = OT_KEYS.some((k) => ot[k] !== s.schedule[k]);
  const otBad = otProblem(ot);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const set = <K extends keyof Draft>(k: K, v: string) => setD((x) => ({ ...x, [k]: v }));
  const bad = problemOf(d);
  const lat = Number(d.lat);
  const lng = Number(d.lng);
  const km = Number(d.km);
  const workMin = bad ? 0 : minutesOfDay(d.end) - minutesOfDay(d.start) - (minutesOfDay(d.lunchEnd) - minutesOfDay(d.lunchStart));
  const lunchMin = bad ? 0 : minutesOfDay(d.lunchEnd) - minutesOfDay(d.lunchStart);
  const mainDirty =
    d.start !== s.schedule.start ||
    d.end !== s.schedule.end ||
    d.lunchStart !== s.schedule.lunchStart ||
    d.lunchEnd !== s.schedule.lunchEnd ||
    lat !== place.lat ||
    lng !== place.lng ||
    Math.round(km) !== place.radius;
  const dirty = mainDirty || posDirty || otDirty;
  const allBad = bad || posBad || otBad;

  function reset() {
    setPl(posSaved);
    setOt(otOf(s.schedule));
    setD({
      start: s.schedule.start,
      end: s.schedule.end,
      lunchStart: s.schedule.lunchStart,
      lunchEnd: s.schedule.lunchEnd,
      lat: String(place.lat),
      lng: String(place.lng),
      km: String(place.radius),
    });
    setErr("");
  }

  async function here() {
    setBusy(true);
    const got = await locate();
    setBusy(false);
    if ("error" in got) {
      setErr(got.error);
      return;
    }
    setErr("");
    setD((x) => ({ ...x, lat: got.fix.lat.toFixed(6), lng: got.fix.lng.toFixed(6) }));
  }

  function save() {
    if (allBad) {
      setErr(allBad);
      return;
    }
    if (posDirty) {
      saveSection("positionSchedules", pl);
      const before = new Map(posSaved.map((p) => [p.pos, p]));
      const now = new Set(pl.map((p) => p.pos));
      const notes = [
        ...pl.flatMap((p) => {
          const o = before.get(p.pos);
          if (!o) return [`เพิ่ม ${hrPos(p.pos).label} ${p.start}–${p.end} · พักเที่ยง ${p.lunchStart}–${p.lunchEnd}`];
          const diff = POS_TIME_LABEL.filter(([k]) => p[k] !== o[k]).map(([k, label]) => `${label} ${o[k]} → ${p[k]}`);
          return diff.length ? [`${hrPos(p.pos).label} ${diff.join(" · ")}`] : [];
        }),
        ...posSaved.filter((p) => !now.has(p.pos)).map((p) => `ลบ ${hrPos(p.pos).label}`),
      ];
      if (notes.length) logChange("เวลาทำงาน", `เวลาทำงานเฉพาะตำแหน่ง ${notes.join(" · ")}`);
      setErr("");
    }
    if (otDirty) {
      saveSection("schedule", { ...settings().schedule, ...ot });
      logChange(
        "เวลาทำงาน",
        OT_KEYS.filter((k) => ot[k] !== s.schedule[k])
          .map((k) => `${SCHED_LABEL[k]} ${s.schedule[k]} → ${ot[k]}`)
          .join(" · "),
      );
      setErr("");
    }
    /* แก้แค่เวลาของตำแหน่งหรือโอที ไม่ต้องสร้างชุดเวลาบริษัทใหม่ในประวัติ */
    if (!mainDirty) return;
    if (!at) {
      setErr("เลือกวันที่เริ่มใช้ค่าใหม่");
      return;
    }
    if (minAt && at < minAt) {
      setErr(`วันที่เริ่มใช้ ${thaiDate(at)} ตกในรอบที่ปิดแล้ว เลือกตั้งแต่ ${thaiDate(minAt)} เป็นต้นไป`);
      return;
    }
    const times = { start: d.start, end: d.end, lunchStart: d.lunchStart, lunchEnd: d.lunchEnd };
    const radius = Math.round(km);
    const note = `เวลาทำงาน ${d.start}–${d.end} · พักเที่ยง ${d.lunchStart}–${d.lunchEnd} · รัศมี ${radius.toLocaleString()} ม.`;
    saveAttFrom(at, times, { lat, lng, radius }, note);
    /* มีผลแล้ววันนี้ก็เขียนพิกัดลงที่เก็บของพื้นที่เข้างานด้วย (คนละที่เก็บกับค่าตั้งค่า) */
    if (at <= todayIso()) saveWorkplace({ ...place, lat, lng, radius });
    logChange("เวลาทำงาน", `เริ่มใช้ ${thaiDate(at)} · ${note}`);
    setErr("");
  }

  return (
    <div className="space-y-4">
      <AdminHead
        title="เวลาทำงานและจุดลงเวลา"
        desc="เวลาเข้า-ออกงาน เวลาพักเที่ยง พิกัดสำนักงาน และรัศมีที่ลงเวลาได้"
      />

      <div className="grid items-start gap-4 2xl:grid-cols-2">
        <Card title="เวลาทำงาน">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input2 label="เวลาเข้างาน">
              <Time24Input value={d.start} onChange={(e) => set("start", e.target.value)} className={`${inputCls} num`} />
            </Input2>
            <Input2 label="เวลาเลิกงาน">
              <Time24Input value={d.end} onChange={(e) => set("end", e.target.value)} className={`${inputCls} num`} />
            </Input2>
            <Input2 label="เริ่มพักเที่ยง">
              <Time24Input value={d.lunchStart} onChange={(e) => set("lunchStart", e.target.value)} className={`${inputCls} num`} />
            </Input2>
            <Input2 label="สิ้นสุดพักเที่ยง">
              <Time24Input value={d.lunchEnd} onChange={(e) => set("lunchEnd", e.target.value)} className={`${inputCls} num`} />
            </Input2>
          </div>
          <p className="mt-3 rounded-[11px] border border-border bg-card px-3 py-2.5 text-[12.5px] text-muted-foreground">
            {bad ? (
              <b className="font-semibold text-destructive">{bad}</b>
            ) : (
              <>
                เวลาทำงานจริง <b className="font-semibold text-foreground">{formatMinutes(workMin)}/วัน</b> · พักเที่ยง{" "}
                <b className="font-semibold text-foreground">{formatMinutes(lunchMin)}</b>
              </>
            )}
          </p>

          {/* เวลาทำงานเฉพาะตำแหน่ง — เลือกตำแหน่งจากดรอปดาวน์ เพิ่มได้หลายตำแหน่ง เกิน 5 ตำแหน่งเลื่อนดู (ผู้ใช้สั่ง 30 ต.ค. 2569) */}
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13.5px] font-bold">เวลาทำงานเฉพาะตำแหน่ง</h3>
            {pl.length > 0 && (
              <div className={`mt-3 space-y-3 ${pl.length > 5 ? "max-h-[1060px] overflow-y-auto pr-1" : ""}`}>
                {pl.map((p, i) => {
                  const pb = p.pos ? timesProblem(p) : "";
                  return (
                    <div key={i} className="rounded-[12px] border border-border px-3 py-3 sm:px-4">
                      <div className="flex items-end gap-2">
                        <div className="min-w-0 flex-1">
                          <Input2 label="ตำแหน่ง">
                            <PosPicker
                              value={p.pos}
                              /* ตำแหน่งที่แถวอื่นเลือกไปแล้วไม่ขึ้นซ้ำ */
                              options={hrActivePositions(p.pos).filter((o) => o.v === p.pos || !pl.some((x) => x.pos === o.v))}
                              onPick={(v) => setPos(i, { pos: v })}
                            />
                          </Input2>
                        </div>
                        <button
                          type="button"
                          className="btn glass-thin h-10"
                          aria-label="ลบตำแหน่งนี้"
                          onClick={() => setPl((x) => x.filter((_, j) => j !== i))}
                        >
                          <TrashIcon className="size-4" />
                        </button>
                      </div>
                      <div className="mt-3 grid gap-4 sm:grid-cols-4">
                        {POS_TIME_LABEL.map(([k, label]) => (
                          <Input2 key={k} label={k === "start" ? "เวลาเข้างาน" : k === "end" ? "เวลาเลิกงาน" : label}>
                            <Time24Input
                              value={p[k]}
                              onChange={(e) => setPos(i, { [k]: e.target.value })}
                              className={`${inputCls} num`}
                            />
                          </Input2>
                        ))}
                      </div>
                      {p.pos && (
                        <p className="mt-3 text-[12.5px] text-muted-foreground">
                          {pb ? (
                            <b className="font-semibold text-destructive">{pb}</b>
                          ) : (
                            <>
                              เวลาทำงานจริง{" "}
                              <b className="font-semibold text-foreground">
                                {formatMinutes(
                                  minutesOfDay(p.end) - minutesOfDay(p.start) - (minutesOfDay(p.lunchEnd) - minutesOfDay(p.lunchStart)),
                                )}
                                /วัน
                              </b>{" "}
                              · เริ่มนับโอทีวันธรรมดา <b className="num font-semibold text-foreground">{posOt(p)} น.</b>
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <button type="button" className="btn glass-thin mt-3" onClick={addPos}>
              <PlusIcon className="size-4" />
              เพิ่มตำแหน่ง
            </button>
          </div>

          {/* โอทีต่อท้ายเวลาทำงาน วันธรรมดากับวันหยุดคนละบรรทัด (ผู้ใช้สั่ง 30 ต.ค. 2569)
              วันหยุดหักช่วงพักเที่ยง/พักเย็นออกจากชั่วโมงโอที (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13.5px] font-bold">โอทีวันธรรมดา</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Input2 label={SCHED_LABEL.otStart ?? ""}>
                <Time24Input
                  value={ot.otStart}
                  onChange={(e) => setOt((x) => ({ ...x, otStart: e.target.value }))}
                  className={`${inputCls} num`}
                />
              </Input2>
            </div>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <h3 className="text-[13.5px] font-bold">
              โอทีวันหยุด <small className="font-normal text-muted-foreground">ช่วงพักที่ไม่นับเป็นชั่วโมงโอที</small>
            </h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {(
                [
                  ["พักเที่ยง", "holLunchStart", "holLunchEnd"],
                  ["พักเย็น", "holDinnerStart", "holDinnerEnd"],
                ] as const
              ).map(([label, from, to]) => (
                <Input2 key={from} label={label}>
                  <div className="flex items-center gap-2">
                    <Time24Input
                      value={ot[from]}
                      onChange={(e) => setOt((x) => ({ ...x, [from]: e.target.value }))}
                      className={`${inputCls} num`}
                      wrapperClassName="min-w-0 flex-1"
                    />
                    <span className="text-muted-foreground">–</span>
                    <Time24Input
                      value={ot[to]}
                      onChange={(e) => setOt((x) => ({ ...x, [to]: e.target.value }))}
                      className={`${inputCls} num`}
                      wrapperClassName="min-w-0 flex-1"
                    />
                  </div>
                </Input2>
              ))}
            </div>
          </div>
        </Card>

        <Card title="จุดลงเวลา">
          {Number.isFinite(lat) && Number.isFinite(lng) ? (
            <div className="overflow-hidden rounded-[12px] border border-border">
              <AreaMap
                lat={lat}
                lng={lng}
                radius={Number.isFinite(km) && km > 0 ? km : 150}
                onPick={(la, ln) => setD((x) => ({ ...x, lat: String(la), lng: String(ln) }))}
                className="h-[300px] w-full"
              />
              <a
                href={mapLink(lat, lng)}
                target="_blank"
                rel="noreferrer"
                className="block border-t border-border px-3 py-2 text-[12.5px] text-muted-foreground hover:text-primary"
              >
                เปิดใน Google Maps ↗
              </a>
            </div>
          ) : (
            <div className="grid h-[200px] place-items-center rounded-[12px] border border-dashed border-border text-[13px] text-muted-foreground">
              กรอกพิกัดให้ถูกต้องก่อนจึงจะเห็นแผนที่
            </div>
          )}

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Input2 label="ละติจูด">
              <input value={d.lat} inputMode="decimal" onChange={(e) => set("lat", e.target.value)} className={`${inputCls} num`} />
            </Input2>
            <Input2 label="ลองจิจูด">
              <input value={d.lng} inputMode="decimal" onChange={(e) => set("lng", e.target.value)} className={`${inputCls} num`} />
            </Input2>
          </div>
          <div className="mt-3">
            <Input2 label="รัศมีที่ลงเวลาได้" hint={`ตั้งได้ ${M_MIN.toLocaleString()} ถึง ${M_MAX.toLocaleString()} เมตร`}>
              <div className="flex items-center gap-2">
                <input
                  value={d.km}
                  inputMode="numeric"
                  onChange={(e) => set("km", e.target.value)}
                  className={`${inputCls} num w-[130px]`}
                />
                <span className="text-[12.5px] whitespace-nowrap text-muted-foreground">เมตร</span>
              </div>
            </Input2>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="btn glass-thin" disabled={busy} onClick={() => void here()}>
              <CrosshairIcon className="size-4" strokeWidth={2.2} />
              {busy ? "กำลังหาตำแหน่ง…" : "ใช้ตำแหน่งปัจจุบัน"}
            </button>
            <span className="text-[12px] text-muted-foreground">กดขณะอยู่ที่สำนักงาน</span>
          </div>
        </Card>
      </div>

      <section className="glass rounded-[18px] px-4 py-4 sm:px-5">
        {err && (
          <p className="mb-3 rounded-[11px] border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12.5px] font-semibold text-destructive">
            {err}
          </p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          {/* ไม่มีช่องวันที่เริ่มใช้ค่าใหม่ — มีผลตั้งแต่วันที่บันทึก (หรือวันแรกหลังรอบที่ปิดแล้ว) (ผู้ใช้สั่ง 13 ต.ค. 2569) */}
          <span />
          <div className="flex gap-2">
            <button type="button" className="btn glass-thin disabled:opacity-45" disabled={!dirty} onClick={reset}>
              ยกเลิกการแก้
            </button>
            <button type="button" className="btn solid btn-solid disabled:opacity-45" disabled={Boolean(allBad)} onClick={save}>
              บันทึก
            </button>
          </div>
        </div>
      </section>

      {/* ประวัติการตั้งค่าย้ายไปเมนูย่อย "ประวัติการตั้งค่า" (ผู้ใช้สั่ง 6 ต.ค. 2569) */}

      {/* รอบเงินเดือน เริ่มนับโอที การหักมาสาย ย้ายไปหน้าการคำนวณเงินเดือน (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
    </div>
  );
}

/** วันถัดจากวันที่ ISO ที่ให้มา */
function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + 1);
  const p = (n: number) => (n < 10 ? "0" : "") + n;
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// ─── รอบเงินเดือน เริ่มนับโอที และการหักมาสาย ─────────────────────
/*
 * ต้นแบบ HR-15 มีแค่เวลาเข้า-ออกกับจุดลงเวลา แต่ระบบมีค่าอีกสามอย่างที่ผูกกับเวลาทำงาน
 * (วันตัดรอบเงินเดือน · เริ่มนับโอที · การหักเงินมาสาย) เดิมอยู่หน้า /admin/schedule ที่ยุบทิ้งแล้ว
 * จึงย้ายมาไว้ท้ายหัวข้อนี้ ไม่ใช่ทำหายไปพร้อมหน้าเดิม
 */
const SCHED_LABEL: Partial<Record<keyof ScheduleSettings, string>> = {
  otStart: "เริ่มนับโอทีวันทำงาน",
  /* ช่วงพักโอทีวันหยุด — ลงประวัติการตั้งค่าเหมือนช่องอื่น (ผู้ใช้สั่ง 13 ต.ค. 2569) */
  holLunchStart: "โอทีวันหยุด เริ่มพักเที่ยง",
  holLunchEnd: "โอทีวันหยุด เลิกพักเที่ยง",
  holDinnerStart: "โอทีวันหยุด เริ่มพักเย็น",
  holDinnerEnd: "โอทีวันหยุด เลิกพักเย็น",
  forgotPunchOutAfterHours: "เตือนลืมตอกออก (ชม.หลังเลิกงาน)",
  payCutDay: "วันตัดรอบเงินเดือน",
};
const LATE_MODE_LABEL: Record<"wage" | "fixed", string> = {
  wage: "หักตามฐานเงินเดือน",
  fixed: "กำหนดเอง (บาทต่อนาที)",
};
const modeOf = (m: LateMode) => (m === "fixed" ? "fixed" : "wage");
const SAMPLE_SALARY = 30000;
const SAMPLE_MONTH = "2026-09";

function describeSched(a: ScheduleSettings, b: ScheduleSettings) {
  return (Object.keys(SCHED_LABEL) as (keyof ScheduleSettings)[])
    .filter((k) => a[k] !== b[k])
    .map((k) => `${SCHED_LABEL[k]} ${a[k]} → ${b[k]}`);
}
function describeLate(a: RateSettings, b: RateSettings) {
  const out: string[] = [];
  if (modeOf(a.lateMode) !== modeOf(b.lateMode))
    out.push(`หักเงินมาสาย: ${LATE_MODE_LABEL[modeOf(a.lateMode)]} → ${LATE_MODE_LABEL[modeOf(b.lateMode)]}`);
  if (b.lateMode === "fixed" && a.latePerMinute !== b.latePerMinute)
    out.push(`หักมาสายนาทีละ ${a.latePerMinute} → ${b.latePerMinute} บาท`);
  return out;
}

/* ค่าร่างของการ์ดรอบเงินเดือน — แยกเป็น hook ให้หน้าการคำนวณเงินเดือนรวมแถบบันทึกเหลือแถบเดียว (ผู้ใช้สั่ง 30 ต.ค. 2569) */
export function usePayAndLate() {
  const d = useSectionDraft("schedule", "เวลาทำงาน", describeSched);
  const r = useSectionDraft("rates", "เวลาทำงาน", describeLate);
  const s = d.draft;
  const late = r.draft;
  const mode = modeOf(late.lateMode);
  const bad =
    !(Number.isInteger(s.payCutDay) && s.payCutDay >= 1 && s.payCutDay <= 28)
      ? "วันตัดรอบเงินเดือนต้องเป็นวันที่ 1–28"
      : mode === "fixed" && !(late.latePerMinute > 0 && late.latePerMinute <= 100)
          ? "หักมาสายนาทีละต้องมากกว่า 0 และไม่เกิน 100 บาท"
          : "";
  return {
    d,
    r,
    bad,
    dirty: d.dirty || r.dirty,
    isDefault: d.isDefault && modeOf(r.saved.lateMode) === "wage",
    save() {
      if (d.dirty) d.save();
      if (r.dirty) r.save();
    },
    cancel() {
      d.cancel();
      r.cancel();
    },
    toDefault() {
      d.toDefault();
    },
  };
}
export type PayLate = ReturnType<typeof usePayAndLate>;

export function PayAndLate({ pl }: { pl: PayLate }) {
  const { d, r } = pl;
  const s = d.draft;
  const late = r.draft;
  const mode = modeOf(late.lateMode);
  const wagePerMin = SAMPLE_SALARY / HR_OT_DIVISOR.days / HR_OT_DIVISOR.hours / 60;
  const set = <K extends keyof ScheduleSettings>(k: K, v: ScheduleSettings[K]) => d.setDraft({ ...s, [k]: v });
  const [cy, cm] = SAMPLE_MONTH.split("-").map(Number);
  const cutText = `${thaiMonth(SAMPLE_MONTH)} = วันที่ ${s.payCutDay + 1} เดือนก่อน ถึงวันที่ ${s.payCutDay} ของเดือนนี้`;
  void cy;
  void cm;

  return (
    <>
      <UiCard title="รอบเงินเดือนและการหักมาสาย">
        <div className={`grid gap-4 sm:grid-cols-2 ${mode === "fixed" ? "lg:grid-cols-3" : ""}`}>
          <UiInput2 label={SCHED_LABEL.payCutDay ?? ""}>
            <input
              type="number"
              min={1}
              max={28}
              value={s.payCutDay}
              onChange={(e) => set("payCutDay", Number(e.target.value))}
              className={`${inputCls} num`}
            />
          </UiInput2>
          {/* ไม่มีช่องเตือนลืมตอกออก และไม่มีข้อความอธิบายใต้ช่อง (ผู้ใช้สั่ง 6 ต.ค. 2569) */}
          <UiInput2 label="หักเงินเมื่อมาสาย">
            <select
              value={mode}
              onChange={(e) => r.setDraft({ ...late, lateMode: e.target.value as LateMode })}
              className={`${inputCls} cursor-pointer`}
            >
              {(["wage", "fixed"] as const).map((m) => (
                <option key={m} value={m}>
                  {LATE_MODE_LABEL[m]}
                </option>
              ))}
            </select>
          </UiInput2>
          {mode === "fixed" && (
            <UiInput2
              label="หักนาทีละ (บาท)"
              hint={
                late.latePerMinute > wagePerMin
                  ? `สูงกว่าค่าจ้างต่อนาทีของเงินเดือน ${baht(SAMPLE_SALARY)} บาท อาจขัดกฎหมายคุ้มครองแรงงาน`
                  : undefined
              }
            >
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={late.latePerMinute}
                onChange={(e) => r.setDraft({ ...late, latePerMinute: Number(e.target.value) })}
                className={`${inputCls} num`}
              />
            </UiInput2>
          )}
        </div>
      </UiCard>
      {/* แถบบันทึกอยู่ล่างสุดของหน้าการคำนวณเงินเดือนแถบเดียว (ผู้ใช้สั่ง 30 ต.ค. 2569) */}
    </>
  );
}

/** ประวัติค่าเวลาทำงานและจุดลงเวลา — แสดงที่หน้าประวัติการตั้งค่า (ผู้ใช้สั่ง 6 ต.ค. 2569) */
export function AttHistory() {
  const s = useSystemSettings();
  const hist = [...s.attHistory].sort((a, b) => b.at.localeCompare(a.at));
  if (hist.length === 0) return null;
  return (
    <section className="glass overflow-hidden rounded-[18px]">
      <div className="border-b border-border px-4 py-3.5 sm:px-5">
        <h2 className="text-[14.5px] font-bold">เวลาทำงานและจุดลงเวลา</h2>
      </div>
      {(
        <div className="px-4 pt-3 pb-4 sm:px-5">
          <div className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-2 border-b border-border pb-2 text-[11.5px] font-bold text-muted-foreground sm:grid-cols-[130px_150px_150px_100px_84px]">
            <span>เริ่มใช้</span>
            <span className="max-sm:hidden">เวลาทำงาน</span>
            <span className="max-sm:hidden">พักเที่ยง</span>
            <span className="max-sm:hidden">รัศมี</span>
            <span className="text-right">สถานะ</span>
          </div>
          {hist.map((h) => {
            const st = statusOf(s.attHistory, h);
            return (
              <div
                key={h.at}
                className="grid grid-cols-[minmax(0,1fr)_84px] items-center gap-2 border-b border-border py-2.5 last:border-b-0 sm:grid-cols-[130px_150px_150px_100px_84px]"
              >
                <span className="num text-[13.5px] font-semibold">
                  {thaiDate(h.at)}
                  <small className="block text-[11.5px] font-medium text-muted-foreground sm:hidden">
                    {h.times.start}–{h.times.end} · พัก {h.times.lunchStart}–{h.times.lunchEnd} · {h.place.radius.toLocaleString()} ม.
                  </small>
                </span>
                <span className="num text-[13px] max-sm:hidden">
                  {h.times.start} – {h.times.end}
                </span>
                <span className="num text-[13px] max-sm:hidden">
                  {h.times.lunchStart} – {h.times.lunchEnd}
                </span>
                <span className="num text-[13px] max-sm:hidden">{h.place.radius.toLocaleString()} ม.</span>
                <span className="text-right">
                  <em className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold not-italic ${st.cls}`}>{st.label}</em>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>

  );
}
