"use client";

/*
 * จุดแดงบนเมนูแถบซ้ายของ PM — บอกว่ามี "ของใหม่เข้ามา" ในเมนูนั้น (ผู้ใช้สั่ง 8 ต.ค. 2569)
 *   งานเข้าใหม่ — งานรอรับใบใหม่
 *   โปรเจค     — งานที่รับแล้วรอวางแผนรายการใหม่ · ลูกค้าตอบรอบตรวจงานกลับมา
 *   งานรอตรวจ  — งานที่ทีมส่งมาให้ตรวจรายการใหม่
 *
 * เปิดหน้านั้นแล้วจุดหายทันที ไม่ต้องไปทำอะไรกับงานก่อน
 * จำรหัสรายการที่เห็นแล้วตอนเปิดหน้าล่าสุด จุดขึ้นใหม่เมื่อมีรายการที่ยังไม่เคยเห็นเท่านั้น
 */

import { useEffect, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { createPersistedStore } from "@/lib/persisted-store";
import { usePm } from "@/lib/pm-store";
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
function idsOf(href: string, pm: ReturnType<typeof usePm>, cr: ClientReviewState): string[] {
  if (href === "/pm/inbox") return pm.inbox.filter((j) => j.stage === "new").map((j) => j.pj);
  if (href === "/pm/projects")
    return [
      ...pm.inbox.filter((j) => j.stage === "plan" && !pm.projects.some((p) => p.pj === j.pj)).map((j) => j.pj),
      /* ลูกค้าตอบกลับรอบตรวจงาน (ผู้ใช้สั่ง 8 ต.ค. 2569) */
      ...cr.rounds
        .filter((r) => {
          const st = roundStatus(r);
          return (st === "submitted" || st === "approved") && !r.forwardedAt && !r.closedAt &&
            pm.projects.some((p) => p.pj === r.pj && p.status !== "cancelled");
        })
        .map((r) => `client|${r.token}`),
    ];
  return pm.projects
    .filter((p) => p.status !== "cancelled")
    .flatMap((p) => p.tasks.filter((t) => t.status === "sent").map((t) => `${p.pj}|${t.name}`));
}

export function PmNavDot({ href }: { href: string }) {
  const pm = usePm();
  const cr = useClientReviews();
  const path = usePathname();
  const seen = useSyncExternalStore(seenStore.subscribe, seenStore.get, seenStore.getServer);
  const known = LABEL[href] !== undefined;
  const ids = known ? idsOf(href, pm, cr) : [];
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
