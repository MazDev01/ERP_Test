"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AccountLocked, type LockReason } from "./account-locked";
import { LoginScene } from "./login-scene";
import "@/styles/login.css";
import { homeOf, navItems } from "@/lib/nav";
import { accountOf, markLogin } from "@/lib/accounts";
import { useHr } from "@/lib/hr-store";
import { accountRoles } from "@/lib/hr-data";
import { bkkStamp } from "@/lib/format";
import { ROLES, setRole, useRole, type Role } from "@/lib/role";

/** ผิดครบกี่ครั้งจึงระงับบัญชี — ยืนยันกับฝ่ายบุคคล (ต้นแบบ login.html MAX_TRIES) */
const MAX_TRIES = 5;

/** ชื่อผู้ใช้ที่จดจำไว้บนเครื่องนี้ — ไม่เก็บรหัสผ่าน */
const REMEMBER_KEY = "maz-erp.remember-user.v1";
/** รหัสผ่านเดโม — ยังไม่มี auth จริง ทุกบัญชีใช้รหัสนี้ (ต้นแบบ login.html)
    TODO: แทนที่ด้วย supabase.auth.signInWithPassword เมื่อต่อหลังบ้าน */
const DEMO_PASSWORD = "maz1234";
const MSG_USER = "กรอกชื่อผู้ใช้ที่ฝ่ายบุคคลกำหนดให้";
const MSG_PASS = "กรอกรหัสผ่าน";

/* ชื่อผู้ใช้สองตัวนี้เอาไว้ดูหน้าจอบัญชีถูกระงับโดยไม่ต้องรอหลังบ้าน
   TODO: ให้เซิร์ฟเวอร์เป็นคนบอกสถานะบัญชีเมื่อต่อ auth แล้ว */
const DEMO_LOCK: Record<string, LockReason> = {
  locked: "attempts",
  suspended: "admin",
};

/* หน้าแรกหลังล็อกอิน — ทุกบทบาทที่ตอกบัตรได้เข้าหน้า "เวลาทำงาน" ก่อนเสมอ ทั้งคอมและมือถือ
   (ผู้ใช้สั่ง 22 ก.ย. 2569 "คลิกเข้าครั้งแรกต้องเด้งหน้านี้" — ตอกบัตรก่อนเริ่มงาน)
   CEO กับผู้ดูแลระบบไม่มีหน้าเวลาทำงาน — มือถือ CEO เข้าหน้าหลัก คอมเข้าเมนูแรก */
function homeAfterLogin(r: Role) {
  const items = navItems(r);
  /* มือถือเข้าหน้าหลักการ์ดเมนูก่อนทุกบทบาท (ผู้ใช้สั่ง 22 ก.ย. 2569 ทับกติกาเดิมเฉพาะบนมือถือ)
     ตอกบัตรกดจากการ์ด "เวลาทำงาน" */
  const phone = window.matchMedia?.("(max-width:640px)").matches;
  if (phone) return homeOf(r, undefined, undefined, true);
  if (items.some((i) => i.href === "/")) return "/";
  return items[0]?.href ?? homeOf(r);
}

export function LoginForm() {
  const router = useRouter();
  /* ค่าที่ผู้ใช้พิมพ์เอง — null คือยังไม่แตะ ให้ใช้ชื่อที่จดจำไว้บนเครื่องนี้แทน */
  const [typedUser, setTypedUser] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<LockReason | null>(null);
  /* สถานะช่องตามต้นแบบ — ช่องแดงพร้อมข้อความใต้ช่อง ข้อความผิดคู่อยู่ใต้ช่องรหัสผ่านช่องเดียว */
  const [badUser, setBadUser] = useState(false);
  const [badPass, setBadPass] = useState(false);
  const [credError, setCredError] = useState("");
  const [fails, setFails] = useState(0);
  /*
   * จดจำอุปกรณ์ (Full Proposal · M11) — เครื่องที่ติ๊กไว้จะเติมชื่อผู้ใช้ให้เองครั้งหน้า
   * เก็บแค่ชื่อผู้ใช้ ไม่เก็บรหัสผ่าน
   * อ่านผ่าน useSyncExternalStore เพราะฝั่งเซิร์ฟเวอร์ไม่มี localStorage — ให้ค่าว่างไปก่อนแล้วค่อยตรงกันตอน hydrate
   */
  const savedUser = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(REMEMBER_KEY) ?? "";
      } catch {
        /* โหมดส่วนตัวหรือปิดที่เก็บข้อมูลไว้ — ถือว่าไม่เคยจดจำ */
        return "";
      }
    },
    () => "",
  );
  const username = typedUser ?? savedUser;
  const [typedRemember, setTypedRemember] = useState<boolean | null>(null);
  const remember = typedRemember ?? Boolean(savedUser);

  function keepDevice(user: string) {
    try {
      if (remember && user) localStorage.setItem(REMEMBER_KEY, user);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {
      /* เก็บไม่ได้ก็ไม่เป็นไร ไม่ใช่ส่วนที่ทำให้เข้าระบบไม่ได้ */
    }
  }
  /* ผิดครบ MAX_TRIES ครั้ง — ปุ่มกลายเป็น "บัญชีถูกระงับ" กรอกต่อไม่ได้ (ต้นแบบ lockAccount) */
  const frozen = fails >= MAX_TRIES;
  const userRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  /* ยังไม่มี auth จริง บทบาทจึงเป็นสิ่งที่ผู้ใช้เลือกเองตรงนี้
     ตั้งค่าจากที่เลือกไว้ครั้งก่อน จะได้ไม่ต้องเลือกซ้ำทุกครั้ง */
  const savedRole = useRole();
  const hr = useHr();
  const [role, setPick] = useState<Role>(savedRole);

  function edit(which: "user" | "pass", v: string) {
    if (which === "user") {
      setTypedUser(v);
      setBadUser(false);
    } else {
      setPassword(v);
      setBadPass(false);
    }
    if (!frozen) setCredError("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || frozen) return;
    const user = username.trim();
    /* ไม่กรอกอะไรเลย = เข้าด้วยบทบาทที่เลือกทันที ไม่ต้องใช้รหัส (ผู้ใช้สั่ง 22 ก.ย. 2569 · ยังไม่มีหลังบ้าน)
       กรอกชื่อผู้ใช้เมื่อไร ตรวจรหัสผ่านและนับครั้งที่ผิดตามต้นแบบ login.html */
    if (!user && !password) {
      const account = accountOf(role);
      if (account.suspended) return setLocked("admin");
      setRole(role);
      keepDevice("");
      markLogin(role, bkkStamp());
      setBusy(true);
      /* ไม่ถามตั้งรหัสผ่านใหม่ เพราะทางนี้ไม่ได้ใช้รหัสผ่านเลย */
      router.replace(homeAfterLogin(role));
      return;
    }
    /* ช่องว่างขึ้นแดงพร้อมข้อความ แล้วพาเคอร์เซอร์ไปช่องแรกที่ว่าง */
    const noUser = !user;
    const noPass = !password;
    if (noUser || noPass) {
      setBadUser(noUser);
      setBadPass(noPass);
      setCredError("");
      (noUser ? userRef : passRef).current?.focus();
      return;
    }
    const demo = DEMO_LOCK[user.toLowerCase()];
    if (demo) return setLocked(demo);

    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      if (password !== DEMO_PASSWORD) {
        /* ผิดเป็นคู่ ไม่บอกว่าช่องไหนผิด — ข้อความเดียวใต้ช่องรหัสผ่าน */
        const n = fails + 1;
        setFails(n);
        setPassword("");
        setBadUser(true);
        setBadPass(true);
        if (n >= MAX_TRIES) {
          setCredError("บัญชีถูกระงับการใช้งาน กรุณาติดต่อฝ่ายบุคคล");
          return;
        }
        const left = MAX_TRIES - n;
        setCredError(
          `ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง${left <= 2 ? ` — เหลืออีก ${left} ครั้งก่อนบัญชีถูกระงับ` : ""}`,
        );
        passRef.current?.focus();
        return;
      }

      /* ชื่อผู้ใช้ที่ HR สร้างให้ (/hr/accounts) บอกบทบาทของคนนั้น — การ์ดที่เลือกไว้ต้องเป็นบทบาทของเขา
         ไม่งั้นใช้บทบาทแรกของบัญชี · ชื่อที่ไม่อยู่ในทะเบียน (เดโม) ใช้การ์ดที่เลือก */
      const person = hr.emp.find((x) => x.account && x.account.user === user);
      if (person?.account?.status === "suspended") return setLocked("admin");
      const roles = accountRoles(person?.account);
      const r: Role = roles.length && !roles.includes(role) ? roles[0] : role;
      const account = accountOf(r);
      if (!person && account.suspended) return setLocked("admin");
      const mustReset = person ? Boolean(person.account?.mustChange) : account.mustResetPassword;
      setFails(0);
      setRole(r);
      keepDevice(user);
      markLogin(r, bkkStamp());
      setBusy(true);
      router.replace(mustReset ? "/set-password" : homeAfterLogin(r));
    }, 1600);
  }

  return (
    /*
     * โครงหน้าตามไฟล์ตัวอย่าง login-3d-redwhite.html (เจ้าของสั่ง 24 ก.ย. 2569)
     * ซ้ายเป็นแผงแดงไล่เฉดพร้อมภาพ 3 มิติ ขวาเป็นแผ่นขาวมุมโค้งที่วางฟอร์ม
     * จอเล็กแถบแดงขึ้นไปอยู่ด้านบน แล้วแผ่นขาวเลื่อนขึ้นมาทับครึ่งล่าง
     */
    <main className="login-stage">
      <div className="login-card">
        <div className="login-brand">
          {/* เวิร์ดมาร์กสีขาวสำหรับพื้นแดง — โลโก้ไฟล์จริงเป็นสีแดง ใช้บนพื้นนี้ไม่ได้ */}
          <svg viewBox="60 115 1560 410" className="h-[38px] w-auto" role="img" aria-label="MAZ">
            <g fill="none" stroke="#ffffff" strokeWidth="80" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="115,470 115,170 335,355 555,170 555,470" />
              <polyline points="670,470 885,170 1105,470" />
              <polyline points="1215,170 1565,170 1215,470 1565,470" />
            </g>
          </svg>
          <p>งานขาย งานโครงการ และงานบุคคล อยู่ในระบบเดียวกัน</p>
        </div>

        <LoginScene className="login-canvas" />

        <section className="login-sheet">
          <div className="login-body">
          {locked ? (
            <AccountLocked reason={locked} onBack={() => setLocked(null)} />
          ) : (
            <>
          {/* บทบาทเปลี่ยนทั้งเมนูซ้ายและหน้างาน จึงต้องเลือกก่อนเข้า — เป็นดรอปดาวน์มุมขวาบน (ผู้ใช้สั่ง 30 ก.ย. 2569)
              เดิมเป็นการ์ดเรียงเต็มฟอร์ม บทบาทเยอะจนดันช่องกรอกลงไปไกล
              ถูกระงับแล้วปิดแค่ปุ่มเข้าสู่ระบบตาม mockup (lockAccount) — บทบาทยังเลือกได้ */}
          <div className="mb-2 flex justify-end">
            <RolePicker value={role} onChange={setPick} />
          </div>
          {/* โลโก้กับฟอร์มกว้างไม่เกิน 360px และอยู่กลางแผ่นขาวในแนวตั้ง ตามไฟล์ตัวอย่าง (form width:min(360px,42%) · top:50%)
              ผู้ใช้สั่ง 2 ต.ค. 2569: ช่องยาวเกินไป และชิดโลโก้เกินไป */}
          <div className="lg-center">
          {/* เวิร์ดมาร์กสีแดงสูง 46px ตามไฟล์ตัวอย่าง (.logo) — รูปเดียวกับโลโก้ขาวบนแผงแดง */}
          <svg viewBox="60 115 1560 410" className="mx-auto block h-[46px] w-auto" role="img" aria-label="MAZ">
            <g fill="none" stroke="var(--primary)" strokeWidth="70" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="115,470 115,170 335,355 555,170 555,470" />
              <polyline points="670,470 885,170 1105,470" />
              <polyline points="1215,170 1565,170 1215,470 1565,470" />
            </g>
          </svg>
          <p className="mt-2.5 mb-9 text-center text-[13.5px] text-muted-foreground">
            เข้าสู่ระบบเพื่อใช้งาน ERP MAZ
          </p>

          {/* ช่องกรอกและปุ่มตามไฟล์ตัวอย่างทุกค่า (ผู้ใช้สั่ง 2 ต.ค. 2569) — เส้นใต้อย่างเดียว ไม่มีกรอบ ไม่มีไอคอน · styles/login.css */}
          <form onSubmit={submit} noValidate className="lg-form">
            <div className="lg-field">
              <div className={`lg-control${badUser ? " bad" : ""}`}>
                <input
                  ref={userRef}
                  value={username}
                  /* ตาม mockup (.locked .field input): ช่องไม่ถูกปิด แต่เป็นสีจางและคลิกไม่ได้ */
                  className={frozen ? "pointer-events-none" : undefined}
                  style={frozen ? { color: "var(--muted-foreground)" } : undefined}
                  onChange={(e) => edit("user", e.target.value)}
                  autoComplete="username"
                  placeholder="ชื่อผู้ใช้"
                  aria-label="ชื่อผู้ใช้"
                  aria-invalid={badUser}
                  aria-describedby="m-user"
                />
              </div>
              {/* ผิดเป็นคู่ไม่บอกช่องชื่อผู้ใช้ ข้อความไปอยู่ใต้ช่องรหัสผ่านช่องเดียว */}
              <p id="m-user" className="lg-err" aria-live="polite">
                {badUser && !credError ? MSG_USER : ""}
              </p>
            </div>

            <div className="lg-field">
              <div className={`lg-control${badPass ? " bad" : ""}`}>
                <input
                  ref={passRef}
                  type={show ? "text" : "password"}
                  value={password}
                  className={frozen ? "pointer-events-none" : undefined}
                  style={frozen ? { color: "var(--muted-foreground)" } : undefined}
                  onChange={(e) => edit("pass", e.target.value)}
                  autoComplete="current-password"
                  placeholder="รหัสผ่าน"
                  aria-label="รหัสผ่าน"
                  aria-invalid={badPass}
                  aria-describedby="m-pass"
                />
                {!frozen && (
                  <button
                    type="button"
                    onClick={() => {
                      setShow((v) => !v);
                      passRef.current?.focus();
                    }}
                    aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                    aria-pressed={show}
                    className="lg-eye"
                  >
                    {/* ไอคอนตาตามไฟล์ตัวอย่าง — มีเส้นขีดทับตอนซ่อนรหัสผ่าน */}
                    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                      <path d="M1.5 10C4 5 7 3.5 10 3.5S16 5 18.5 10C16 15 13 16.5 10 16.5S4 15 1.5 10Z" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      <circle cx="10" cy="10" r="2.8" fill="none" stroke="currentColor" strokeWidth="1.5" />
                      {!show && <path d="M3 17 17 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
                    </svg>
                  </button>
                )}
              </div>
              <p id="m-pass" className="lg-err" aria-live="polite">
                {credError || (badPass ? MSG_PASS : "")}
              </p>
            </div>

            {/* จดจำอุปกรณ์กับลืมรหัสผ่าน — ไม่มีในไฟล์ตัวอย่าง แต่เป็นงานจริงของระบบ จึงรวมไว้แถวเดียวให้ฟอร์มสั้นเท่าเดิม */}
            <div className="-mt-2 flex items-center justify-between gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setTypedRemember(e.target.checked)}
                  className="size-4 accent-[var(--primary)]"
                />
                จดจำอุปกรณ์นี้
              </label>
              <Link href="/set-password" className="text-[13px] text-muted-foreground hover:text-primary">
                ลืมรหัสผ่าน?
              </Link>
            </div>

            <button type="submit" disabled={busy || frozen} className="lg-primary">
              {frozen ? "บัญชีถูกระงับ" : busy ? "" : "เข้าสู่ระบบ"}
              {busy && (
                <span
                  className="block size-[21px] animate-spin rounded-full border-[2.5px] border-white/30 border-t-white"
                  aria-hidden="true"
                />
              )}
            </button>
          </form>
          </div>

            </>
          )}
          </div>
        </section>
      </div>
    </main>
  );
}

/** ดรอปดาวน์เลือกบทบาท — ชื่ออังกฤษเป็นหลัก ไทยกำกับ ตามการ์ดเดิม */
function RolePicker({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = ROLES.find((r) => r.key === value) ?? ROLES[0];

  /* แตะนอกกล่องหรือกด Esc แล้วปิด */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`บทบาท: ${current.en} ${current.label} — กดเพื่อเปลี่ยน`}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-1.5 rounded-full border border-border bg-white pr-2.5 pl-3.5 text-[12.5px] transition-colors hover:border-primary"
      >
        <span className="text-muted-foreground">Sign in as</span>
        <b className="font-semibold text-primary">{current.en}</b>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="เข้าใช้งานในบทบาท"
          className="absolute top-[calc(100%+6px)] right-0 z-20 max-h-[min(420px,60vh)] w-[240px] list-none overflow-y-auto rounded-[14px] border border-border bg-white p-1.5 shadow-[0_18px_40px_-16px_rgba(120,20,35,.35)]"
        >
          {ROLES.map((r) => {
            const on = r.key === value;
            return (
              <li key={r.key} role="option" aria-selected={on}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(r.key);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left transition-colors ${
                    on ? "bg-accent text-primary" : "hover:bg-muted"
                  }`}
                >
                  <span className="min-w-0">
                    <b className="block text-[13px] font-semibold">{r.en}</b>
                    <span className="block text-[11.5px] font-medium opacity-75">{r.label}</span>
                  </span>
                  {on && (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
