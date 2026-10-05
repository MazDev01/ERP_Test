"use client";

import { useEffect, useState } from "react";
import { WifiOffIcon } from "./icons";

/**
 * หน้าที่ service worker หยิบมาแสดงเมื่อเปิดหน้าใหม่ไม่ได้เพราะเน็ตหลุด
 * ต้องพึ่งพาอะไรจากเครือข่ายให้น้อยที่สุด — ทั้งหน้าอยู่ในแคชอยู่แล้ว
 */
export function OfflinePage() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-10 text-center">
      <div className="max-w-[420px]">
        <p className="text-[34px] leading-none font-extrabold tracking-[0.04em] text-primary">
          MAZ
        </p>
        <p className="mt-1 text-[11px] font-semibold tracking-[0.13em] text-muted-foreground">
          DIGITAL BUSINESS SOLUTION
        </p>

        <span className="mx-auto mt-7 grid size-[74px] place-items-center rounded-full bg-accent text-primary">
          <WifiOffIcon className="size-9" strokeWidth={1.7} />
        </span>

        <h1 className="mt-5 text-xl font-bold">ตอนนี้ยังเชื่อมต่ออินเทอร์เน็ตไม่ได้</h1>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">
          หน้าที่เคยเปิดไว้แล้วยังดูได้ตามปกติ
          ส่วนหน้าที่ยังไม่เคยเปิดต้องรอสัญญาณกลับมาก่อน
        </p>

        <button
          type="button"
          onClick={() => location.reload()}
          className="btn-solid mx-auto mt-6 flex h-11 items-center rounded-[22px] px-7 text-[14.5px] font-semibold"
        >
          ลองอีกครั้ง
        </button>

        <p className="mt-3.5 text-[12.5px] text-muted-foreground">
          {online ? "ออนไลน์แล้ว กดลองอีกครั้งได้เลย" : "กำลังรอสัญญาณ"}
        </p>
      </div>
    </main>
  );
}

