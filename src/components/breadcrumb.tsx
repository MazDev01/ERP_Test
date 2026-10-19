"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Fragment, Suspense } from "react";
import { usePageCrumbs, type Crumb } from "@/lib/crumb";
import { navCrumbs, pageTitle } from "@/lib/nav";
import { useRole, type Role } from "@/lib/role";

const NO_QUERY = new URLSearchParams();

/*
 * เส้นทางบนแถบบนจอคอม แทนชื่อหน้ากับวันที่ (ผู้ใช้สั่ง 12 ต.ค. 2569) — แบบ "ใบเสนอราคา / สร้างใบเสนอราคา"
 * ช่วงก่อนหน้าเป็นลิงก์สีจาง ช่วงสุดท้ายคือหน้าที่เปิดอยู่ ตัวหนา ไม่เป็นลิงก์
 * เมนูย่อยบางชุดแยกด้วย query (?s= ?g= ?k=) จึงต้องอ่าน useSearchParams — คร่อม Suspense ไว้
 */
export function Breadcrumb({ pathname, role }: { pathname: string; role: Role }) {
  return (
    <Suspense fallback={<Trail pathname={pathname} role={role} q={NO_QUERY} />}>
      <WithQuery pathname={pathname} role={role} />
    </Suspense>
  );
}

function WithQuery({ pathname, role }: { pathname: string; role: Role }) {
  const q = useSearchParams();
  return <Trail pathname={pathname} role={role} q={new URLSearchParams(q.toString())} />;
}

function Trail({ pathname, role, q }: { pathname: string; role: Role; q: URLSearchParams }) {
  const page = usePageCrumbs();
  const base: Crumb[] = navCrumbs(pathname, role, q);
  const all = page[0]?.root ? [...page] : [...base, ...page];
  if (all.length === 0) all.push({ label: "ERP MAZ" });
  return (
    <nav aria-label="เส้นทาง" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-[15px] leading-tight">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <Fragment key={`${i}-${c.label}`}>
              {i > 0 && (
                <li aria-hidden="true" className="flex-none text-muted-foreground/70">
                  /
                </li>
              )}
              <li className={last ? "min-w-0 truncate font-semibold text-foreground" : "max-w-[240px] flex-none truncate"}>
                {!last && c.onClick ? (
                  <button type="button" onClick={c.onClick} className="text-muted-foreground transition-colors hover:text-foreground">
                    {c.label}
                  </button>
                ) : last || !c.href ? (
                  <span aria-current={last ? "page" : undefined} className={last ? undefined : "text-muted-foreground"}>
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="text-muted-foreground transition-colors hover:text-foreground">
                    {c.label}
                  </Link>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * ชื่อหน้ามุมซ้ายบนของเนื้อหา สำหรับหน้าที่ไม่มีหัวเรื่องของตัวเอง — ชื่อตามเมนูของบทบาท (ผู้ใช้สั่ง 12 ต.ค. 2569)
 * มือถือซ่อนไว้ให้โปรแกรมอ่านหน้าจออย่างเดียว (.page-h1) เพราะแถบบนของมือถือมีชื่อหน้าแล้ว
 */
export function PageTitle({ className = "" }: { className?: string }) {
  const pathname = usePathname();
  const role = useRole();
  return <h1 className={`page-h1 ${className}`}>{pageTitle(pathname, role)}</h1>;
}
