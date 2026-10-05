"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { enableNotify, isIOS, isStandalone, notifyState, useHydrated, type PwaResult } from "@/lib/pwa";
import { pushServiceOf } from "@/lib/push-scenarios";
import {
  currentSubscription,
  deviceLabel,
  registerDevice,
  senderInfo,
  unregisterDevice,
  type SenderInfo,
} from "@/lib/notify-test";

type View =
  | { kind: "loading" }
  /** เปิดระบบตรง ๆ ไม่ได้ผ่านตัวส่งทดสอบบนคอม */
  | { kind: "no-sender" }
  | { kind: "ios-install" }
  | { kind: "ready"; sender: NonNullable<SenderInfo>; endpoint: string | null };

/*
 * การ์ด "การแจ้งเตือนบนเครื่องนี้" — ให้มือถือลงทะเบียนรับแจ้งเตือนจากตัวส่งทดสอบบนคอม (tools/push-sender.mjs)
 * ยังไม่มี backend ของระบบ การ์ดนี้ใช้ได้เฉพาะตอนเปิดผ่านลิงก์ทดสอบที่ชี้ไปที่ตัวส่ง
 */
export function DevicePushCard() {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [label, setLabel] = useState("");
  const [msg, setMsg] = useState<PwaResult | null>(null);
  const [busy, setBusy] = useState(false);
  /* ชนิดเครื่องอ่านได้หลัง hydrate เท่านั้น ไม่งั้น HTML จากเซิร์ฟเวอร์กับที่เบราว์เซอร์วาดไม่ตรงกัน */
  const ios = useHydrated() && isIOS();

  const load = useCallback(async () => {
    const [sender, sub] = await Promise.all([senderInfo(), currentSubscription()]);
    if (!sender) return setView({ kind: "no-sender" });
    if (isIOS() && !isStandalone()) return setView({ kind: "ios-install" });
    setView({ kind: "ready", sender, endpoint: sub?.endpoint ?? null });
  }, []);

  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      setLabel((v) => v || deviceLabel());
      load().catch(() => setView({ kind: "no-sender" }));
    });
    return () => {
      alive = false;
    };
  }, [load]);

  async function register(publicKey: string) {
    setBusy(true);
    /* ขอสิทธิ์ก่อนอย่างอื่นทั้งหมด — iOS ยอมให้ขอเฉพาะตอนที่ผู้ใช้เพิ่งกดปุ่ม */
    const perm = await enableNotify();
    setMsg(perm.ok ? await registerDevice(publicKey, label.trim() || deviceLabel()) : perm);
    await load();
    setBusy(false);
  }

  async function unregister() {
    setBusy(true);
    await unregisterDevice();
    setMsg({ ok: true, reason: "ยกเลิกการลงทะเบียนแล้ว เครื่องนี้จะไม่ได้รับแจ้งเตือนทดสอบอีก" });
    await load();
    setBusy(false);
  }

  return (
    <div className="glass-thin mt-5 rounded-[14px] px-4 py-4 text-[13.5px]">
      <b className="text-sm font-semibold">การแจ้งเตือนบนเครื่องนี้</b>

      {view.kind === "loading" && <p className="mt-1 text-muted-foreground">กำลังตรวจ…</p>}

      {view.kind === "no-sender" && (
        <p className="mt-1 leading-relaxed text-muted-foreground">
          ใช้ได้เมื่อเปิดผ่านลิงก์ทดสอบที่ต่อกับตัวส่งบนคอมเท่านั้น (ยังไม่มีเซิร์ฟเวอร์ของระบบ)
        </p>
      )}

      {view.kind === "ios-install" && (
        <p className="mt-1 leading-relaxed text-muted-foreground">
          iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน: กดแชร์ › <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วเปิดจากไอคอน ERP MAZ{" "}
          <Link href="/install" className="text-primary underline">
            ดูวิธี
          </Link>
        </p>
      )}

      {view.kind === "ready" &&
        (view.endpoint && notifyState() === "granted" ? (
          <>
            <p className="mt-1 leading-relaxed text-[var(--success)]">
              ลงทะเบียนแล้ว · รับผ่าน {pushServiceOf(view.endpoint)} — ส่งแจ้งเตือนทดสอบจากคอมได้เลย
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={unregister}
              className="btn glass-thin mt-3 h-10 rounded-[20px] px-4 text-[13px] disabled:opacity-45"
            >
              ยกเลิกการลงทะเบียน
            </button>
          </>
        ) : (
          <>
            <label className="mt-2 block text-xs text-muted-foreground">
              ชื่อเครื่อง (ให้ผู้ส่งเลือกถูกเครื่อง)
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                className="mt-1 block h-10 w-full rounded-[10px] border border-border bg-transparent px-3 text-[13.5px] text-foreground"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => register(view.sender.publicKey)}
              className="btn-solid mt-3 h-11 w-full rounded-[22px] text-sm font-semibold disabled:opacity-45"
            >
              {busy ? "กำลังลงทะเบียน…" : "อนุญาตและลงทะเบียนเครื่องนี้"}
            </button>
          </>
        ))}

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

      {/* เกณฑ์ผ่านคือเห็นข้อความบนหน้าจอล็อก — ค่าเริ่มต้นของเครื่องมักซ่อนไว้ */}
      <p className="mt-3 text-xs leading-[1.65] text-muted-foreground">
        ให้เห็นข้อความบนหน้าจอล็อก:{" "}
        {ios
          ? "การตั้งค่า › การแจ้งเตือน › ERP MAZ › แสดงตัวอย่าง › เสมอ"
          : "การตั้งค่า › การแจ้งเตือน › การแจ้งเตือนบนหน้าจอล็อก › แสดงเนื้อหาทั้งหมด"}
      </p>

      <Link href="/notify-test" className="mt-2 inline-block text-[13px] text-primary underline">
        หน้าทดสอบแบบละเอียด
      </Link>
    </div>
  );
}
