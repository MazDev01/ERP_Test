"use client";

/*
 * ใบสัญญาที่ระบบออกให้ดีล (ผู้ใช้สั่ง 14 ต.ค. 2569) — เก็บแยกจากสโตร์ CRM
 * ทุกฉบับเก็บไว้ ไม่มีการลบหรือแก้ทับ บันทึกใหม่ = ฉบับถัดไปของเลขที่สัญญาเดิม
 * สัญญาที่ฝ่ายขายเคยแนบเป็นไฟล์ (Deal.contracts) ไม่อยู่ในนี้ และไม่แสดงในรายการเอกสารของดีลแล้ว
 */

import { useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { nextContractNo, type ContractDoc } from "./contract-data";
import { bkkStamp } from "./format";
import type { IssuerCode } from "./crm-data";

const store = createPersistedStore<ContractDoc[]>(
  "maz-erp.contracts.v1",
  [],
  (v): v is ContractDoc[] => Array.isArray(v),
);

export function useContracts() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

/** ทุกฉบับของดีล เรียงฉบับแรกก่อน */
export function contractsOf(all: ContractDoc[], dealNo: string) {
  return all.filter((c) => c.dealNo === dealNo).sort((a, b) => a.version - b.version);
}

/**
 * บันทึกฉบับใหม่ — ดีลที่ยังไม่มีสัญญาได้เลขที่ใหม่ · มีแล้วใช้เลขเดิม ฉบับที่ +1
 * otherNos = เลขสัญญาที่มีอยู่นอกสโตร์นี้ (ไฟล์สัญญาที่เคยแนบ) กันเลขชน
 */
export function saveContractVersion(
  input: { dealNo: string; issuer: IssuerCode; body: string; date: string; by: string; from: ContractDoc["from"] },
  otherNos: string[] = [],
): ContractDoc {
  let saved!: ContractDoc;
  store.update((all) => {
    const mine = contractsOf(all, input.dealNo);
    const last = mine[mine.length - 1];
    const no = last?.no ?? nextContractNo(input.issuer, [...all.map((c) => c.no), ...otherNos]);
    saved = {
      id: `CTD-${Date.now().toString(36)}`,
      dealNo: input.dealNo,
      no,
      version: (last?.version ?? 0) + 1,
      issuer: last?.issuer ?? input.issuer,
      body: input.body,
      date: input.date,
      at: bkkStamp(),
      by: input.by,
      from: input.from,
    };
    return [...all, saved];
  });
  return saved;
}
