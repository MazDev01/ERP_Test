"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useProfile } from "@/lib/profile-data";
import { useMyRoles } from "@/lib/hr-link";
import { roleLabel, useRole } from "@/lib/role";
import { useProfilePhoto } from "@/lib/profile-store";
import { ConfirmDialog } from "./confirm-dialog";
import { DownloadIcon, LockIcon, LogoutIcon, UserIcon } from "./icons";

/** ตัวย่อชื่อสองตัวอักษรแรกของชื่อจริง */
function initials(name: string) {
  const [first = "", last = ""] = name.split(" ");
  return (first.slice(0, 1) + last.slice(0, 1)) || first.slice(0, 2);
}

export function UserMenu({ variant = "top" }: { variant?: "top" | "bar" }) {
  /* "bar" = ปุ่มในแถบล่างบนมือถือ — เมนูต้องคลี่ขึ้นจากขอบล่าง ไม่ใช่ห้อยใต้ปุ่ม */
  const bar = variant === "bar";
  const router = useRouter();
  const [open, setOpen] = useState(false);
  /* ออกจากระบบแล้วย้อนกลับเองไม่ได้ ต้องถามก่อนเสมอ */
  const [askLogout, setAskLogout] = useState(false);
  const me = useProfile();
  /* คนหนึ่งควบได้หลายบทบาท (เช่น บัญชี + บุคคล + ผู้ดูแลระบบ)
     ต้องเห็นว่าตอนนี้ทำงานในบทบาทไหน และตัวเองถือบทบาทอะไรอีกบ้าง
     ไม่งั้นพอคิวอนุมัติหรือเมนูไม่เหมือนที่คิด ก็เดาไม่ออกว่าเพราะสวมหมวกผิดใบ */
  const role = useRole();
  const myRoles = useMyRoles();
  const dual = myRoles.length > 1;
  const photo = useProfilePhoto();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const avatar = photo ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={photo} alt="" className="size-8 rounded-full object-cover" />
  ) : (
    <span className="grid size-8 place-items-center rounded-full bg-accent text-xs font-bold text-primary">
      {initials(me.name)}
    </span>
  );

  return (
    <div ref={wrapRef} className={bar ? "botnav-slot" : "relative"}>
      {bar ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className={open ? "on" : undefined}
        >
          <UserIcon className="size-[21px]" />
          <span>โปรไฟล์</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="บัญชีของฉัน"
          className="glass-thin flex items-center gap-2.5 rounded-full py-1 pr-1 pl-1 transition-colors hover:border-primary sm:pr-3.5"
        >
          {avatar}
          {/* ชื่อกับบทบาทโผล่เฉพาะจอกว้าง จอแคบเหลือแค่รูปกลม */}
          <span className="hidden min-w-0 text-left leading-tight sm:block">
            <b className="block max-w-[140px] truncate text-[13.5px] font-semibold">{me.name}</b>
            <span
              className="block max-w-[140px] truncate text-[11.5px] text-muted-foreground"
              title={dual ? `ควบ ${myRoles.length} บทบาท: ${myRoles.map(roleLabel).join(" · ")}` : undefined}
            >
              {dual ? `${roleLabel(role)} · ควบ ${myRoles.length}` : me.position}
            </span>
          </span>
        </button>
      )}

      {open && (
        <nav
          role="menu"
          className={
            bar
              ? "glass-solid fixed inset-x-0 bottom-0 z-60 rounded-t-[18px] p-2 pb-[max(10px,env(safe-area-inset-bottom))]"
              : "glass-solid absolute top-[calc(100%+8px)] right-0 z-60 w-[236px] rounded-[14px] p-2"
          }
        >
          <div className="flex items-center gap-[11px] px-2.5 pt-2 pb-2.5">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="size-10 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-[15px] font-bold text-primary">
                {initials(me.name)}
              </span>
            )}
            <span className="min-w-0">
              <b className="block truncate text-[13.5px] font-semibold">
                {me.name}
              </b>
              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">
                {me.position}
              </span>
              {dual && (
                <span className="mt-1 block text-[11.5px] leading-relaxed text-muted-foreground">
                  ควบ {myRoles.length} บทบาท ·{" "}
                  {myRoles.map((r, i) => (
                    <span key={r}>
                      {i > 0 && " · "}
                      <span className={r === role ? "font-semibold text-primary" : undefined}>
                        {roleLabel(r)}
                      </span>
                    </span>
                  ))}
                </span>
              )}
            </span>
          </div>

          <hr className="mx-1 my-1.5 border-border" />

          <MenuLink href="/profile" onClick={() => setOpen(false)}>
            <UserIcon className="size-[15px]" />
            โปรไฟล์ของฉัน
          </MenuLink>
          <MenuLink href="/profile?tab=security" onClick={() => setOpen(false)}>
            <LockIcon className="size-[15px]" />
            เปลี่ยนรหัสผ่าน
          </MenuLink>

          <hr className="mx-1 my-1.5 border-border" />

          {/* ทางไปติดตั้ง PWA — อยู่ในเมนูนี้ทุกหน้า ไม่ใช่เฉพาะหน้าเข้าสู่ระบบ */}
          <MenuLink href="/install" onClick={() => setOpen(false)}>
            <DownloadIcon className="size-[15px]" />
            ติดตั้งแอป
          </MenuLink>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setAskLogout(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-[9px] px-[11px] py-2.5 text-left text-[13px] text-primary transition-colors hover:bg-accent"
          >
            <LogoutIcon className="size-[15px]" />
            ออกจากระบบ
          </button>
        </nav>
      )}

      <ConfirmDialog
        open={askLogout}
        title="ออกจากระบบ"
        description="คุณต้องการออกจากระบบใช่หรือไม่"
        confirmLabel="ยืนยัน"
        cancelLabel="ยกเลิก"
        onCancel={() => setAskLogout(false)}
        onConfirm={() => {
          setAskLogout(false);
          router.push("/login");
        }}
      />
    </div>
  );
}

function MenuLink({
  href,
  onClick,
  tone,
  children,
}: {
  href: string;
  onClick: () => void;
  tone?: "danger";
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      role="menuitem"
      onClick={onClick}
      className={`flex items-center gap-2.5 rounded-[9px] px-[11px] py-2.5 text-[13px] transition-colors hover:bg-accent ${
        tone === "danger" ? "text-primary" : "text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
