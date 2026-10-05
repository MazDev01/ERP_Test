"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { type SubItem } from "@/lib/nav";

const EMPTY = new URLSearchParams();

/** หน้าย่อยนี้คือหน้าที่เปิดอยู่ไหม — หน้าย่อยที่แยกด้วย query (?g=) ใช้ on ของตัวเอง ที่เหลือเทียบที่อยู่หน้า */
export function subActive(item: SubItem, pathname: string, q: URLSearchParams) {
  return item.on ? item.on(pathname, q) : item.href === pathname;
}

/*
 * เมนูย่อยที่แยกด้วย query (รอบเงินเดือน ?g= · ผู้ใช้สั่ง 5 ต.ค. 2569) ต้องอ่าน useSearchParams
 * ซึ่งต้องมี Suspense คร่อม — ระหว่างรอใช้ query ว่าง (ค่าเริ่มต้น) เมนูย่อยอื่นไม่ต้องอ่านเลย
 */
function WithQuery({ items, children }: { items: SubItem[]; children: (q: URLSearchParams) => ReactNode }) {
  if (!items.some((i) => i.on)) return <>{children(EMPTY)}</>;
  return (
    <Suspense fallback={children(EMPTY)}>
      <ReadQuery>{children}</ReadQuery>
    </Suspense>
  );
}

function ReadQuery({ children }: { children: (q: URLSearchParams) => ReactNode }) {
  const q = useSearchParams();
  return <>{children(new URLSearchParams(q.toString()))}</>;
}

/**
 * เมนูย่อยในแถบข้าง (ผู้ใช้สั่ง 5 ต.ค. 2569 — ย้ายจากแถบชิปเหนือเนื้อหามาเป็นรายการย่อยใต้เมนูแม่)
 * ขึ้นเฉพาะใต้เมนูแม่ที่เปิดอยู่ · ไม่มีไอคอน ใช้จุดเล็กแทน · หน้าย่อยที่เปิดอยู่เป็นตัวหนาสีแบรนด์
 */
export function SideSub({ items, pathname }: { items: SubItem[]; pathname: string }) {
  return (
    <WithQuery items={items}>
      {(q) => (
        <ul className="side-sub" aria-label="หน้าย่อย">
          {items.map((item, i) => {
            const active = subActive(item, pathname, q);
            return (
              <li key={`${item.href}-${i}`}>
                {/* หัวข้อกลุ่มคั่นระหว่างรายการย่อย เช่น ข้อมูลองค์กร / การลาและเวลา (ผู้ใช้สั่ง 5 ต.ค. 2569) */}
                {item.caption && <p className="side-sub-cap">{item.caption}</p>}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={active ? "on" : undefined}
                >
                  <i aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WithQuery>
  );
}

/**
 * ชิปสลับหน้าย่อยของหัวข้อเดียวกัน — เห็นทุกหน้าพร้อมกันโดยไม่ต้องกดเปิด
 * ตั้งแต่ 5 ต.ค. 2569 ใช้เฉพาะมือถือ (จอคอมใช้ SideSub ในแถบข้าง) เพราะมือถือไม่มีแถบข้าง
 */
export function SubNav({
  items,
  pathname,
}: {
  items: SubItem[];
  pathname: string;
}) {
  return (
    <WithQuery items={items}>
      {(q) => (
        /* รายการยาว (หัวข้อตั้งค่าระบบ 13 ช่อง) เลื่อนข้างแถวเดียว ไม่ห่อเป็นหลายแถวดันเนื้อหาลง (ผู้ใช้สั่ง 5 ต.ค. 2569) */
        <nav
          className={`flex gap-2 ${items.length > 6 ? "overflow-x-auto [scrollbar-width:none]" : "flex-wrap"}`}
          aria-label="หน้าย่อย"
        >
          {/* สองหัวข้อชี้หน้าเดียวกันได้ (คนละหมวดในหน้าเดียว) คีย์จึงต้องมีลำดับกำกับ ไม่ใช่ที่อยู่หน้าอย่างเดียว */}
          {items.map((item, i) => {
            const active = subActive(item, pathname, q);
            return (
              <Link
                key={`${item.href}-${i}`}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm whitespace-nowrap font-medium transition-colors ${
                  active
                    ? "bg-primary font-semibold text-white"
                    : "bg-secondary text-muted-foreground hover:bg-accent hover:text-primary"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </WithQuery>
  );
}
