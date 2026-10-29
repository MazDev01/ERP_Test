"use client";

/*
 * จุดแดงบนเมนูแถบซ้ายของ PM — บอกว่ามี "ของใหม่เข้ามา" ในเมนูนั้น (ผู้ใช้สั่ง 8 ต.ค. 2569)
 *   งานเข้าใหม่ — GM: งานรอมอบหมาย PM ใบใหม่ · PM: งานที่ GM มอบหมายให้ใบใหม่ (ผู้ใช้สั่ง 27 ต.ค. 2569)
 *   โปรเจค     — งานที่มี PM ดูแลแล้วรอวางแผนรายการใหม่ (PM นับเฉพาะของตัวเอง) · ลูกค้าตอบรอบตรวจงานกลับมา
 *   งานรอตรวจ  — งานที่ทีมส่งมาให้ตรวจรายการใหม่
 *
 * เปิดหน้านั้นแล้วจุดหายทันที ไม่ต้องไปทำอะไรกับงานก่อน
 * จำรหัสรายการที่เห็นแล้วตอนเปิดหน้าล่าสุด จุดขึ้นใหม่เมื่อมีรายการที่ยังไม่เคยเห็นเท่านั้น
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { createPersistedStore } from "@/lib/persisted-store";
import { taskHomes, usePm } from "@/lib/pm-store";
import { isAssignedJob, isJobOf } from "@/lib/pm-data";
import { USERS } from "@/lib/mock-data";
import { useRole, type Role } from "@/lib/role";
import { askWaiting } from "@/lib/task-ask";
import { roundStatus, useClientReviews, type ClientReviewState } from "@/lib/client-review-store";
import { NewDot } from "./acc-ui";

const LABEL: Record<string, string> = {
  "/pm/inbox": "มีงานเข้าใหม่",
  "/pm/projects": "มีโปรเจคใหม่หรือลูกค้าตอบกลับ",
  "/pm/reviews": "มีงานรอตรวจใหม่",
};

type Seen = Record<string, string[]>;
const seenStore = createPersistedStore<Seen>("maz-erp.pm-nav-seen.v1", {}, (v): v is Seen => typeof v === "object" && v !== null);

/** รหัสรายการปัจจุบันของแต่ละเมนู */
function idsOf(href: string, pm: ReturnType<typeof usePm>, cr: ClientReviewState, role: Role): string[] {
  const gm = role === "gm";
  const me = USERS[role]?.name ?? "";
  if (href === "/pm/inbox")
    return [
      /* GM: งานที่ยังไม่มอบหมาย · PM: งานที่ GM มอบหมายให้ (มอบหมายซ้ำนับเป็นรายการใหม่) (ผู้ใช้สั่ง 27 ต.ค. 2569) */
      ...(gm
        ? pm.inbox.filter((j) => !isAssignedJob(j)).map((j) => j.pj)
        : pm.inbox.filter((j) => isJobOf(j, me)).map((j) => `as|${j.pj}|${j.assignedAt ?? ""}`)),
      /* งานที่ทีมเสนอรอ PM อนุมัติ (20 ต.ค. 2569) */
      ...(pm.asks ?? []).filter(askWaiting).map((a) => `ask|${a.id}`),
    ];
  if (href === "/pm/projects")
    return [
      ...pm.inbox
        .filter((j) => (gm ? isAssignedJob(j) : isJobOf(j, me)) && !pm.projects.some((p) => p.pj === j.pj))
        .map((j) => j.pj),
      /* ลูกค้าตอบกลับรอบตรวจงาน (ผู้ใช้สั่ง 8 ต.ค. 2569) */
      ...cr.rounds
        .filter((r) => {
          const st = roundStatus(r);
          return (st === "submitted" || st === "approved") && !r.forwardedAt && !r.closedAt &&
            pm.projects.some((p) => p.pj === r.pj && p.status !== "cancelled");
        })
        .map((r) => `client|${r.token}`),
    ];
  return taskHomes(pm)
    .filter((p) => p.status !== "cancelled")
    .flatMap((p) => p.tasks.filter((t) => t.status === "sent").map((t) => `${p.pj}|${t.name}`));
}

export function PmNavDot({ href }: { href: string }) {
  const pm = usePm();
  const cr = useClientReviews();
  const role = useRole();
  const path = usePathname();
  const seen = useSyncExternalStore(seenStore.subscribe, seenStore.get, seenStore.getServer);
  const known = LABEL[href] !== undefined;
  const ids = known ? idsOf(href, pm, cr, role) : [];
  const here = known && path === href;
  const key = ids.join(",");

  /* อยู่ที่หน้านั้น = เห็นแล้ว จำรายการทั้งหมดตอนนี้ไว้ */
  useEffect(() => {
    if (!here) return;
    const have = seenStore.get()[href] ?? [];
    if (ids.every((id) => have.includes(id))) return;
    seenStore.update((s) => ({ ...s, [href]: [...new Set([...(s[href] ?? []), ...ids])] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [here, href, key]);

  if (!known || here) return null;
  const have = seen[href] ?? [];
  if (!ids.some((id) => !have.includes(id))) return null;
  /* เมนูที่เปิดอยู่พื้นเป็นสีแบรนด์ จุดจึงเปลี่ยนเป็นสีขาว — แบบเดียวกับจุดของฝ่ายบัญชี */
  return <NewDot label={LABEL[href]} className="ml-auto [.on_&]:bg-white" />;
}
