"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AndroidIcon,
  CheckIcon,
  CloseIcon,
  MonitorIcon,
  PhoneIcon,
  ShareIcon,
} from "./icons";
import {
  enableNotify,
  install,
  isAndroid,
  isIOS,
  isSecure,
  testNotify,
  useHydrated,
  usePwa,
  type NotifyState,
  type PwaResult,
} from "@/lib/pwa";

export type RowState = "ok" | "no" | "wait";

export function InstallPage() {
  const pwa = usePwa();
  const [msg, setMsg] = useState<PwaResult | null>(null);

  /* ชนิดของเครื่องอ่านได้เฉพาะบนเบราว์เซอร์ รอให้ hydrate เสร็จก่อน
     ไม่งั้น HTML ที่เซิร์ฟเวอร์ส่งมากับที่เบราว์เซอร์วาดจะไม่ตรงกัน */
  const hydrated = useHydrated();
  const ios = hydrated && isIOS();
  const android = hydrated && isAndroid();
  const secure = !hydrated || isSecure();

  async function run(fn: () => Promise<PwaResult>) {
    setMsg(await fn());
  }

  return (
    <main className="flex min-h-dvh justify-center px-5 pt-8 pb-16">
      <div className="w-full max-w-[560px]">
        <div className="text-center">
          <p className="text-[32px] leading-none font-extrabold tracking-[0.04em] text-primary">
            MAZ
          </p>
          <p className="mt-1 text-[10.5px] font-semibold tracking-[0.13em] text-muted-foreground">
            DIGITAL BUSINESS SOLUTION
          </p>
        </div>

        <h1 className="mt-6 text-center text-[21px] font-bold">
          ติดตั้ง ERP MAZ ลงหน้าจอโฮม
        </h1>
        <p className="mt-2 text-center text-sm leading-[1.75] text-muted-foreground">
          ติดตั้งแล้วเปิดใช้ได้เหมือนแอป ไม่ต้องพิมพ์ลิงก์ทุกครั้ง
          <br />
          และรับแจ้งเตือนจากงานที่ต้องทำได้
        </p>

        {/* ── สถานะปัจจุบันของเครื่องนี้ ── */}
        <div className="glass mt-6 overflow-hidden rounded-[15px]">
          <Row
            state={secure ? "ok" : "no"}
            title={secure ? "เปิดผ่านเซิร์ฟเวอร์ที่ปลอดภัย" : "เปิดจากไฟล์ในเครื่อง"}
            detail={
              secure
                ? "ติดตั้งและรับแจ้งเตือนได้"
                : "ต้องเปิดผ่านลิงก์ขององค์กร จึงจะติดตั้งได้"
            }
          />
          <Row
            state={pwa.installed ? "ok" : "wait"}
            title={pwa.installed ? "ติดตั้งลงหน้าจอโฮมแล้ว" : "ยังไม่ได้ติดตั้ง"}
            detail={pwa.installed ? "กำลังเปิดจากไอคอนแอปอยู่" : "ทำตามขั้นตอนด้านล่าง"}
          />
          <NotifyRow state={pwa.notify} />
        </div>

        {/* ── ขั้นตอนของแต่ละระบบ ── */}
        <Guide
          title="iPhone และ iPad"
          tag="iOS 16.4 ขึ้นไป"
          now={ios}
          icon={<PhoneIcon className="size-4" />}
          steps={[
            <>
              เปิดลิงก์ระบบด้วย <b>Safari</b> เท่านั้น (Chrome บน iPhone ติดตั้งไม่ได้)
            </>,
            <>
              กดปุ่ม <b>แชร์</b>{" "}
              <ShareIcon
                className="inline-block size-[15px] -translate-y-px rounded bg-muted p-0.5"
                aria-hidden="true"
              />{" "}
              ที่แถบล่างของ Safari
            </>,
            <>
              เลื่อนหาแล้วกด <b>เพิ่มไปยังหน้าจอโฮม</b> แล้วกด <b>เพิ่ม</b>
            </>,
            <>
              ปิด Safari แล้ว <b>เปิดจากไอคอน ERP MAZ บนหน้าจอโฮม</b>
            </>,
            <>
              กลับมาหน้านี้แล้วกด <b>เปิดการแจ้งเตือน</b> แล้วเลือก <b>อนุญาต</b>
            </>,
          ]}
        />
        <Guide
          title="Android"
          tag="Chrome"
          now={android}
          icon={<AndroidIcon className="size-4" />}
          steps={[
            <>
              เปิดลิงก์ระบบด้วย <b>Chrome</b>
            </>,
            <>
              กดปุ่ม <b>ติดตั้งแอป</b> ด้านล่าง หรือกดเมนูสามจุดแล้วเลือก <b>ติดตั้งแอป</b>
            </>,
            <>
              กด <b>ติดตั้ง</b> แล้วเปิดจากไอคอนบนหน้าจอโฮม
            </>,
            <>
              กด <b>เปิดการแจ้งเตือน</b> แล้วเลือก <b>อนุญาต</b>
            </>,
          ]}
        />
        <Guide
          title="คอมพิวเตอร์"
          tag="Chrome / Edge"
          now={!ios && !android}
          icon={<MonitorIcon className="size-4" />}
          steps={[
            <>
              กดปุ่ม <b>ติดตั้งแอป</b> ด้านล่าง หรือกดไอคอนติดตั้งท้ายช่องที่อยู่เว็บ
            </>,
            <>
              กด <b>ติดตั้ง</b> เอกสารจะเปิดเป็นหน้าต่างของตัวเอง
            </>,
            <>
              กด <b>เปิดการแจ้งเตือน</b> แล้วเลือก <b>อนุญาต</b>
            </>,
          ]}
        />

        {/* ── ปุ่มลงมือ ── */}
        <div className="mt-[18px] flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={() => run(install)}
            disabled={ios || pwa.installed || !pwa.canInstall}
            className="btn-solid flex h-11 items-center rounded-[22px] px-[22px] text-sm font-semibold disabled:opacity-45"
          >
            {pwa.installed
              ? "ติดตั้งแล้ว"
              : ios
                ? "iPhone ต้องกดแชร์เอง"
                : "ติดตั้งแอป"}
          </button>
          <button
            type="button"
            onClick={() => run(enableNotify)}
            disabled={pwa.notify === "granted"}
            className="btn glass-thin h-11 rounded-[22px] px-[22px] text-sm disabled:opacity-45"
          >
            {pwa.notify === "granted" ? "เปิดการแจ้งเตือนแล้ว" : "เปิดการแจ้งเตือน"}
          </button>
          <button
            type="button"
            onClick={() => run(testNotify)}
            className="btn glass-thin h-11 rounded-[22px] px-[22px] text-sm"
          >
            ทดสอบแจ้งเตือน
          </button>
        </div>

        {msg && (
          <p
            role="status"
            className={`mt-3 rounded-[11px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
              msg.ok
                ? "bg-[var(--success-soft)] text-[var(--success)]"
                : "bg-[var(--destructive-soft)] text-destructive"
            }`}
          >
            {msg.reason}
          </p>
        )}

        <p className="mt-4 text-[12.5px] leading-[1.7] text-muted-foreground">
          ติดตั้งแล้วเปิดหน้าที่เคยเปิดไว้ได้แม้ไม่มีเน็ต
          แต่การบันทึกข้อมูลยังต้องต่อเน็ตทุกครั้ง
        </p>

        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-[7px] text-[13.5px] text-muted-foreground hover:text-primary"
        >
          <span aria-hidden="true">←</span>
          กลับไปหน้าเข้าสู่ระบบ
        </Link>
      </div>
    </main>
  );
}

function NotifyRow({ state }: { state: NotifyState }) {
  const map: Record<NotifyState, { s: RowState; title: string; detail: string }> = {
    granted: {
      s: "ok",
      title: "เปิดการแจ้งเตือนแล้ว",
      detail: "จะได้รับแจ้งเตือนงานที่ต้องทำ",
    },
    denied: {
      s: "no",
      title: "ปิดการแจ้งเตือนไว้",
      detail: "ต้องไปเปิดใหม่ที่ตั้งค่าของเบราว์เซอร์",
    },
    "ios-needs-install": {
      s: "wait",
      title: "ยังรับแจ้งเตือนไม่ได้",
      detail: "iPhone ต้องติดตั้งลงหน้าจอโฮมก่อน",
    },
    unsupported: {
      s: "no",
      title: "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน",
      detail: "ลองเปลี่ยนเบราว์เซอร์",
    },
    default: {
      s: "wait",
      title: "ยังไม่ได้เปิดการแจ้งเตือน",
      detail: "กดปุ่มเปิดการแจ้งเตือนด้านล่าง",
    },
  };
  const r = map[state];
  return <Row state={r.s} title={r.title} detail={r.detail} />;
}

export function Row({
  state,
  title,
  detail,
}: {
  state: RowState;
  title: string;
  detail: string;
}) {
  const tone =
    state === "ok"
      ? "bg-[var(--success-soft)] text-[var(--success)]"
      : state === "no"
        ? "bg-[var(--destructive-soft)] text-destructive"
        : "bg-[var(--warning-soft)] text-[var(--warning)]";
  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3.5 text-[13.5px] last:border-b-0">
      <span className={`grid size-[26px] flex-none place-items-center rounded-full ${tone}`}>
        {state === "ok" ? (
          <CheckIcon className="size-3.5" strokeWidth={2.6} />
        ) : state === "no" ? (
          <CloseIcon className="size-3.5" strokeWidth={2.6} />
        ) : (
          <b className="text-sm leading-none">!</b>
        )}
      </span>
      <div className="min-w-0">
        <b className="font-semibold">{title}</b>
        <span className="mt-0.5 block text-xs leading-[1.55] text-muted-foreground">
          {detail}
        </span>
      </div>
    </div>
  );
}

function Guide({
  title,
  tag,
  now,
  icon,
  steps,
}: {
  title: string;
  tag: string;
  /** ระบบที่ผู้ใช้กำลังใช้อยู่ — เน้นสีให้หาเจอก่อน */
  now: boolean;
  icon: React.ReactNode;
  steps: React.ReactNode[];
}) {
  return (
    <section className="glass mt-4 rounded-[15px] px-[18px] pt-[18px] pb-5">
      <h2 className="flex items-center gap-2.5 text-[15.5px] font-bold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
        <span
          className={`rounded-[20px] px-2.5 py-0.5 text-[11.5px] font-bold ${
            now ? "bg-accent text-primary" : "bg-muted text-muted-foreground"
          }`}
        >
          {now ? `${tag} · เครื่องนี้` : tag}
        </span>
      </h2>
      <ol className="mt-3.5 list-none">
        {steps.map((step, i) => (
          <li
            key={i}
            className="relative mb-3.5 pl-[38px] text-[13.5px] leading-[1.7] last:mb-0"
          >
            <span className="btn-solid absolute top-px left-0 grid size-[25px] place-items-center rounded-full text-[12.5px] font-bold">
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  );
}
