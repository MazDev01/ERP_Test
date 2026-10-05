"use client";

import { useHydrated } from "@/lib/pwa";
import { useEffect, useRef } from "react";
import { lockScroll } from "@/lib/scroll-lock";
import { createPortal } from "react-dom";
import { Button } from "./ui";

/**
 * กล่องยืนยันแบบ modal — ใช้ก่อนทำสิ่งที่ย้อนกลับไม่ได้ เช่น ตอกบัตร
 * ปิดด้วย Esc หรือคลิกฉากหลัง, โฟกัสวิ่งไปที่ปุ่มยืนยันเมื่อเปิด
 *
 * ต้องยิงออกไปที่ body ด้วย portal — กล่องนี้ถูกเรียกจากเมนูบนแถบหัว
 * ถ้าเรนเดอร์คาอยู่ตรงนั้น กล่องจะติดอยู่ในกรอบของแถบหัว ทั้ง stacking context
 * และกรอบอ้างอิงของ position: fixed — ฉากหลังจะคลุมแค่แถบหัว ไม่ใช่ทั้งจอ
 */
export function ConfirmDialog({
  open,
  title,
  description,
  detail,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  detail?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  /* เปิดกล่องได้หลัง hydrate เท่านั้น — ถ้าใช้ typeof document เซิร์ฟเวอร์จะวาดว่าง แต่เบราว์เซอร์วาดกล่อง
     ตอนที่กล่องเปิดมาตั้งแต่แรก (เช่นลิงก์ ?new=1) React จะฟ้อง hydration ไม่ตรงกัน */
  const hydrated = useHydrated();
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", onKey);
    const unlock = lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [open, onCancel]);

  if (!open || !hydrated) return null;

  return createPortal(
    <div
      /* z สูงกว่ากล่องฟอร์ม (z-80) เพราะกล่องยืนยันเปิดจากในกล่องฟอร์มได้
         ถ้าต่ำกว่า มันจะไปโผล่ข้างหลังจนกดไม่ได้ */
      className="fixed inset-0 z-90 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
        className="glass-solid w-full max-w-sm rounded-[18px]"
      >
        <div className="px-5 pt-5 pb-4">
          <h2 id="confirm-title" className="text-lg font-semibold">
            {title}
          </h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
          {detail && (
            <div className="mt-3 rounded-lg bg-muted px-3 py-2.5 text-sm">
              {detail}
            </div>
          )}
        </div>
        <div className="flex gap-2 border-t border-border px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={onCancel}
          >
            {cancelLabel}
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant={tone === "destructive" ? "destructive" : "default"}
            size="lg"
            className="flex-1"
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
