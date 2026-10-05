"use client";

import Link from "next/link";
import { LockIcon } from "./icons";

/** บัญชีถูกระงับด้วยเหตุอะไร — คนละข้อความ คนละทางออก */
export type LockReason = "attempts" | "admin";

const COPY: Record<LockReason, { title: string; detail: string }> = {
  attempts: {
    title: "บัญชีถูกระงับการเข้าใช้",
    detail:
      "บัญชีของคุณถูกระงับชั่วคราว เนื่องจากพยายามเข้าสู่ระบบไม่สำเร็จหลายครั้ง กรุณาติดต่อฝ่ายบุคคลเพื่อปลดล็อก",
  },
  admin: {
    title: "บัญชีถูกระงับการเข้าใช้",
    detail: "บัญชีของคุณถูกระงับการเข้าใช้ กรุณาติดต่อฝ่ายบุคคล",
  },
};

/**
 * หน้าจอที่ขึ้นแทนฟอร์มเข้าสู่ระบบเมื่อบัญชีเข้าไม่ได้
 * ทางออกทางเดียวคือติดต่อฝ่ายบุคคล — ไม่มีอะไรให้ผู้ใช้กดแก้เอง
 */
export function AccountLocked({
  reason,
  onBack,
}: {
  reason: LockReason;
  onBack: () => void;
}) {
  const { title, detail } = COPY[reason];
  return (
    <div className="text-center">
      <span className="mx-auto grid size-[74px] place-items-center rounded-full bg-accent text-primary">
        <LockIcon className="size-9" strokeWidth={1.7} />
      </span>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-[13.5px] leading-[1.65] text-muted-foreground">{detail}</p>

      <Link
        href="tel:022345678"
        className="btn-solid mt-6 flex h-[46px] w-full items-center justify-center rounded-[23px] text-[14.5px] font-semibold"
      >
        ติดต่อฝ่ายบุคคล
      </Link>
      <button
        type="button"
        onClick={onBack}
        className="mt-2.5 flex h-[46px] w-full items-center justify-center rounded-[23px] border-[1.6px] border-primary text-[14.5px] font-semibold text-primary"
      >
        กลับไปหน้าเข้าสู่ระบบ
      </button>

      <p className="mt-4 rounded-xl bg-accent px-3.5 py-3 text-left text-[11.5px] leading-[1.6] text-primary">
        ฝ่ายบุคคลจะตรวจสอบและปลดล็อกให้ รวมถึงรีเซ็ตรหัสผ่านใหม่ให้ถ้าจำเป็น
      </p>
    </div>
  );
}

