"use client";

/*
 * ชิ้นส่วนเล็ก ๆ ที่หน้าโปรเจคกับหน้ารายละเอียดโปรเจคใช้ร่วมกัน
 * แยกไว้ที่เดียวเพื่อไม่ให้สองหน้าอิมพอร์ตวนกันเอง
 */

import { daysBetween, initials } from "@/lib/format";
import { memberOf } from "@/lib/pm-store";

/** กองรูปคนแบบซ้อนกัน เกินจำนวนที่แสดงได้จะสรุปเป็น +N */
export function Faces({ ids, limit }: { ids: string[]; limit: number }) {
  const shown = ids.slice(0, limit);
  const rest = ids.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((id) => (
        <span
          key={id}
          title={memberOf(id)?.name}
          className="-mr-2 grid size-[26px] place-items-center rounded-full border-2 border-white bg-accent text-[10px] font-bold text-primary"
        >
          {initials(memberOf(id)?.name ?? "")}
        </span>
      ))}
      {rest > 0 && (
        <span className="num -mr-2 grid size-[26px] place-items-center rounded-full border-2 border-white bg-muted text-[10px] font-bold text-muted-foreground">
          +{rest}
        </span>
      )}
    </span>
  );
}

/** "เมื่อวาน" อ่านง่ายกว่า "1 วันก่อน" บนการ์ดที่มีที่จำกัด */

export function ago(iso: string, today: string) {
  const n = daysBetween(iso, today);
  return n <= 0 ? "วันนี้" : n === 1 ? "เมื่อวาน" : `${n} วันก่อน`;
}

/** สถานะการเก็บเงินของโปรเจค — อ่านจากสโตร์ของฝ่ายบัญชีโดยตรง ไม่เก็บซ้ำ */
