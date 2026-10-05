"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DevicePushCard } from "./device-push-card";
import { Row } from "./install-page";
import { enableNotify, testNotify, type PwaResult } from "@/lib/pwa";
import { PUSH_SCENARIOS } from "@/lib/push-scenarios";
import { popupOn, useNotifySettings } from "@/lib/notify-settings";
import {
  clearLog,
  diagnose,
  readLog,
  setBadge,
  simulatePush,
  type Check,
  type LogEntry,
} from "@/lib/notify-test";

const DELAYS = [0, 5, 15, 30];

/*
 * หน้าทดสอบแจ้งเตือนบนมือถือ (iOS และ Android) — ใช้คู่กับ docs/TestPlan_Notifications_Mobile.md
 * ไม่ต้องมี backend: จำลอง push ผ่าน service worker ทางเดียวกับ push จริง
 */
export function NotifyTestPage() {
  const notify = useNotifySettings();
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [msg, setMsg] = useState<PwaResult | null>(null);
  const [scenario, setScenario] = useState(PUSH_SCENARIOS[0].key);
  const [delay, setDelay] = useState(0);
  const [useProfile, setUseProfile] = useState(true);

  const reload = useCallback(async () => {
    const [c, l] = await Promise.all([diagnose(), readLog()]);
    setChecks(c);
    setLog(l);
  }, []);

  useEffect(() => {
    let alive = true;
    const run = () => {
      reload().catch(() => {});
    };
    Promise.resolve().then(() => alive && run());
    /* กดแจ้งเตือนแล้วกลับเข้าแอป — อ่านบันทึกใหม่ให้เห็นว่ากดถึงแล้ว */
    const onVisible = () => document.visibilityState === "visible" && run();
    const onMessage = (e: MessageEvent) => e.data?.type === "push-log" && readLog().then(setLog);
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, [reload]);

  async function act(fn: () => Promise<PwaResult>) {
    setMsg(await fn());
    await reload();
  }

  async function send() {
    const s = PUSH_SCENARIOS.find((x) => x.key === scenario) ?? PUSH_SCENARIOS[0];
    const payload = { ...s.build(), id: Math.random().toString(36).slice(2, 10) };
    /* ทำตามค่าตั้งในหน้าโปรไฟล์เหมือนของจริง — ปิดป๊อปอัปไม่ขึ้น · ปิดเสียงให้เงียบ · ปิดสั่นเอารูปแบบสั่นออก */
    if (useProfile && payload.event) {
      if (!popupOn(notify, payload.event))
        return setMsg({ ok: false, reason: "เรื่องนี้ปิดป๊อปอัปไว้ในหน้าโปรไฟล์ — ไม่แสดง (ถูกต้องตามค่าตั้ง)" });
      const ch = notify.channels[payload.event] ?? {};
      if (ch.sound === false) {
        payload.silent = true;
        delete payload.vibrate;
      }
      if (ch.vibrate === false) delete payload.vibrate;
    }
    setMsg(await simulatePush(payload, delay));
  }

  const current = PUSH_SCENARIOS.find((x) => x.key === scenario);

  return (
    <main className="flex min-h-dvh justify-center px-4 pt-8 pb-16">
      <div className="w-full max-w-[560px]">
        <h1 className="text-center text-[21px] font-bold">ทดสอบแจ้งเตือนบนมือถือ</h1>
        <p className="mt-2 text-center text-sm leading-[1.75] text-muted-foreground">
          ใช้ได้ทั้ง iPhone และ Android — ทำตามเอกสาร TestPlan_Notifications_Mobile
          <br />
          ยังไม่มี backend จึงจำลอง push ในเครื่อง ผ่านทางเดียวกับ push จริง
        </p>

        <Section title="1. ความพร้อมของเครื่อง" action={<SmallBtn onClick={() => reload()}>ตรวจใหม่</SmallBtn>}>
          <div className="glass overflow-hidden rounded-[15px]">
            {checks === null ? (
              <p className="px-4 py-3.5 text-[13.5px] text-muted-foreground">กำลังตรวจ…</p>
            ) : (
              checks.map((c) => <Row key={c.key} state={c.state} title={c.title} detail={c.detail} />)
            )}
          </div>
        </Section>

        <Section title="2. สิทธิ์แจ้งเตือน">
          <div className="flex flex-wrap gap-2.5">
            <button type="button" onClick={() => act(enableNotify)} className="btn-solid h-11 rounded-[22px] px-5 text-sm font-semibold">
              ขอสิทธิ์แจ้งเตือน
            </button>
            <button type="button" onClick={() => act(testNotify)} className="btn glass-thin h-11 rounded-[22px] px-5 text-sm">
              แจ้งเตือนแบบง่าย
            </button>
          </div>
        </Section>

        <Section title="3. จำลองแจ้งเตือนตามเรื่องจริง">
          <div className="glass overflow-hidden rounded-[15px]">
            {PUSH_SCENARIOS.map((s) => (
              <label key={s.key} className="flex cursor-pointer items-start gap-3 border-b border-border px-4 py-3 text-[13.5px] last:border-b-0">
                <input
                  type="radio"
                  name="scenario"
                  checked={scenario === s.key}
                  onChange={() => setScenario(s.key)}
                  className="mt-1 accent-[var(--primary)]"
                />
                <span className="min-w-0">
                  <b className="font-semibold">{s.label}</b>
                  <span className="mt-0.5 block text-xs leading-[1.55] text-muted-foreground">{s.checks}</span>
                </span>
              </label>
            ))}
          </div>

          <p className="mt-3.5 text-[13px] font-semibold">หน่วงเวลาก่อนขึ้น</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {DELAYS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDelay(d)}
                className={`h-9 rounded-[18px] px-4 text-[13px] ${delay === d ? "btn-solid font-semibold" : "btn glass-thin"}`}
              >
                {d === 0 ? "ทันที" : `${d} วินาที`}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-[1.6] text-muted-foreground">
            เลือกหน่วงเวลาแล้วกดส่ง จากนั้นกดกลับหน้าโฮมหรือล็อกจอ เพื่อทดสอบตอนแอปไม่ได้เปิดอยู่
          </p>

          <label className="mt-3 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={useProfile} onChange={(e) => setUseProfile(e.target.checked)} className="accent-[var(--primary)]" />
            ทำตามค่าตั้งแจ้งเตือนในหน้าโปรไฟล์ (ป๊อปอัป / เสียง / สั่น)
          </label>

          <button type="button" onClick={send} className="btn-solid mt-3.5 h-11 w-full rounded-[22px] text-sm font-semibold">
            ส่ง “{current?.label}”
          </button>
        </Section>

        {msg && (
          <p
            role="status"
            className={`mt-3 rounded-[11px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              msg.ok ? "bg-[var(--success-soft)] text-[var(--success)]" : "bg-[var(--destructive-soft)] text-destructive"
            }`}
          >
            {msg.reason}
          </p>
        )}

        <Section title="4. ตัวเลขบนไอคอนแอป">
          <div className="flex flex-wrap gap-2.5">
            <SmallBtn
              onClick={async () =>
                setMsg((await setBadge(5)) ? { ok: true, reason: "ตั้งเลข 5 แล้ว — ออกไปดูที่หน้าจอโฮม" } : { ok: false, reason: "เครื่องนี้ไม่รองรับ" })
              }
            >
              ตั้งเลข 5
            </SmallBtn>
            <SmallBtn
              onClick={async () =>
                setMsg((await setBadge(0)) ? { ok: true, reason: "ล้างตัวเลขแล้ว" } : { ok: false, reason: "เครื่องนี้ไม่รองรับ" })
              }
            >
              ล้างตัวเลข
            </SmallBtn>
          </div>
        </Section>

        <Section title="5. บันทึกการรับและการกด" action={<SmallBtn onClick={() => clearLog().then(reload)}>ล้าง</SmallBtn>}>
          <div className="glass overflow-hidden rounded-[15px]">
            {log.length === 0 ? (
              <p className="px-4 py-3.5 text-[13px] text-muted-foreground">ยังไม่มี — ส่งแจ้งเตือนแล้วกดดู</p>
            ) : (
              log.map((e, i) => (
                <div key={`${e.at}-${i}`} className="border-b border-border px-4 py-2.5 text-[12.5px] last:border-b-0">
                  <b className={e.kind === "clicked" ? "text-[var(--success)]" : ""}>
                    {e.kind === "clicked" ? "กดแล้ว" : e.source === "push" ? "รับ push" : "แสดงแล้ว"}
                  </b>{" "}
                  {new Date(e.at).toLocaleTimeString("th-TH")} · {e.title}
                  {e.url && <span className="block text-muted-foreground">→ {e.url}</span>}
                  {e.source === "push" && e.sentAt ? (
                    <span className="block text-muted-foreground">ส่งถึงเครื่องใช้ {((e.at - e.sentAt) / 1000).toFixed(1)} วินาที (นาฬิกาเซิร์ฟเวอร์กับเครื่องอาจต่างกันเล็กน้อย)</span>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </Section>

        <Section title="6. รับแจ้งเตือนจริงจากตัวส่งบนคอม">
          <DevicePushCard />
        </Section>

        <Link href="/install" className="mt-8 inline-flex items-center gap-[7px] text-[13.5px] text-muted-foreground hover:text-primary">
          <span aria-hidden="true">←</span>
          หน้าติดตั้งแอป
        </Link>
      </div>
    </main>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-[15.5px] font-bold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SmallBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="btn glass-thin h-9 rounded-[18px] px-4 text-[13px]">
      {children}
    </button>
  );
}
