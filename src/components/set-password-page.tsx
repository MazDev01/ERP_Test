"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, EyeIcon, EyeOffIcon, LockIcon } from "./icons";
import { checkPassword, passwordOk, PASSWORD_HINT } from "@/lib/password-rule";
import { requirePasswordReset } from "@/lib/accounts";
import { currentRole } from "@/lib/role";

/**
 * ตั้งรหัสผ่านใหม่ — ใช้ทั้งตอนเข้าใช้ครั้งแรกและตอนฝ่ายบุคคลรีเซ็ตให้
 * ยังไม่ต่อหลังบ้าน กดยืนยันแล้วพากลับไปหน้าเข้าสู่ระบบ
 */
export function SetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);

  const checks = checkPassword(pw);
  const strong = passwordOk(pw);
  const matched = confirm.length > 0 && pw === confirm;
  const error = !tried
    ? null
    : !strong
      ? "รหัสผ่านยังไม่ตรงตามกติกาด้านล่าง"
      : !matched
        ? "รหัสผ่านทั้งสองช่องไม่ตรงกัน"
        : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (!strong || !matched || busy) return;
    /* ตั้งรหัสใหม่แล้ว ผู้ดูแลระบบไม่ต้องบังคับอีก */
    requirePasswordReset(currentRole(), false);
    setBusy(true);
    setTimeout(() => router.push("/login"), 500);
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="glass w-full max-w-[420px] rounded-[20px] px-6 py-7 sm:px-7">
        <span className="mx-auto grid size-[74px] place-items-center rounded-full bg-accent text-primary">
          <LockIcon className="size-9" strokeWidth={1.7} />
        </span>

        <h1 className="mt-4 text-center text-lg font-semibold">กรุณาตั้งรหัสผ่านใหม่</h1>
        <p className="mt-2 text-center text-[13.5px] leading-[1.65] text-muted-foreground">
          เพื่อความปลอดภัยของบัญชีคุณ
        </p>

        <form onSubmit={submit} noValidate className="mt-5">
          <Field
            label="รหัสผ่านใหม่"
            value={pw}
            onChange={setPw}
            show={show}
            onToggle={() => setShow((v) => !v)}
            placeholder={PASSWORD_HINT}
            autoComplete="new-password"
          />
          <Field
            label="ยืนยันรหัสผ่านใหม่"
            value={confirm}
            onChange={setConfirm}
            show={show}
            onToggle={() => setShow((v) => !v)}
            placeholder="กรอกให้ตรงกัน"
            autoComplete="new-password"
            invalid={tried && !matched}
          />

          {/* กติกาแต่ละข้อติ๊กถูกทันทีที่พิมพ์ผ่าน จะได้ไม่ต้องเดาว่าขาดอะไร */}
          <ul className="mt-3.5 rounded-xl bg-accent px-3.5 py-3">
            {checks.map((c) => (
              <li
                key={c.key}
                className={`flex items-center gap-2 py-0.5 text-[11.5px] leading-[1.6] ${
                  c.pass ? "text-[var(--success)]" : "text-muted-foreground"
                }`}
              >
                <CheckIcon
                  className={`size-3.5 shrink-0 ${c.pass ? "" : "opacity-30"}`}
                  strokeWidth={2.6}
                />
                {c.label}
              </li>
            ))}
          </ul>

          {error && (
            <p role="alert" className="mt-3 text-[12.5px] text-destructive">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="btn-solid mt-[18px] flex h-[46px] w-full items-center justify-center rounded-[23px] text-[14.5px] font-semibold disabled:saturate-50"
          >
            {busy ? "กำลังบันทึก…" : "ยืนยัน"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  show,
  onToggle,
  placeholder,
  autoComplete,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  placeholder: string;
  autoComplete: string;
  invalid?: boolean;
}) {
  return (
    <label className="mt-3.5 block first:mt-0">
      <span className="mb-1.5 block text-[12.5px] font-medium">{label}</span>
      <span
        className={`field-control field-shell h-11 rounded-[11px] text-[13px] ${
          invalid ? "border-destructive bg-[var(--destructive-soft)]" : ""
        }`}
      >
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
        />
        <button
          type="button"
          onClick={onToggle}
          aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          aria-pressed={show}
          className="-mr-1.5 shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-foreground"
        >
          {show ? (
            <EyeOffIcon className="size-4" strokeWidth={1.9} />
          ) : (
            <EyeIcon className="size-4" strokeWidth={1.9} />
          )}
        </button>
      </span>
    </label>
  );
}

