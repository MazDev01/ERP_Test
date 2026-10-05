"use client";

/*
 * พื้นที่เข้างาน — ที่ทำงานจุดเดียวที่ตอกบัตรเข้างานได้ (ดู admin-areas-page.tsx)
 *
 * กติกาตายตัวตามที่ผู้ใช้สั่ง (16 ก.ย. 2569):
 *   "ปรับแค่ที่เดียวคือที่ทำงาน" · "อยู่นอกเขตเข้างานไม่ได้"
 * ผู้ดูแลระบบตั้งได้แค่ที่ทำงาน (พิกัด + รัศมี) — ไม่มีสวิตช์ปิดการตรวจ ไม่มีแบบใส่เหตุผลแล้วเข้างานนอกพื้นที่
 *
 * ตอนกด "เข้างาน" หน้าตอกบัตรขอพิกัด GPS จากเครื่อง แล้วเทียบกับที่ทำงาน
 * อยู่ในรัศมีเข้างานได้ · อยู่นอก / GPS ไม่แม่น / ไม่ได้พิกัด → เข้างานไม่ได้ ให้ลองใหม่
 * ตรวจเฉพาะตอนเข้างาน ออกงานไม่ตรวจ เพราะคนออกไปหาลูกค้าแล้วเลิกงานข้างนอกเป็นเรื่องปกติ
 *
 * ยังไม่มี backend — พิกัดที่ส่งมาจากเบราว์เซอร์ปลอมได้ เมื่อต่อเซิร์ฟเวอร์แล้ว
 * ต้องตรวจซ้ำฝั่งเซิร์ฟเวอร์ และ geolocation ใช้ได้เฉพาะ https หรือ localhost เท่านั้น
 */

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPersistedStore } from "./persisted-store";
import { useHydrated } from "./pwa";
import { todayIso } from "./format";
import { attOn, saveAttFrom, settings } from "./system-settings";

export type WorkArea = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  /** รัศมีที่นับว่าอยู่ในพื้นที่ (เมตร) */
  radius: number;
  active: boolean;
  address: string;
};

/*
 * เก็บเป็น areas[] ตามรูปแบบเดิมในเครื่อง แต่ใช้จุดแรกจุดเดียว (keepOne)
 * ช่อง enforce / outside / maxAccuracy ของรุ่นก่อนยังอาจค้างใน localStorage — ไม่อ่านแล้ว
 */
export type AreaSettings = {
  areas: WorkArea[];
};

/** GPS คลาดเคลื่อนเกินนี้ (เมตร) และอยู่นอกรัศมี → บอกว่าสัญญาณไม่แม่น ให้ลองใหม่ แทนที่จะบอกว่าอยู่นอกพื้นที่ */
export const MAX_ACCURACY = 100;

export const RADIUS_MIN = 30;
export const RADIUS_MAX = 5000;

/* ที่ทำงานจริงของบริษัท — อาคาร IMZ Group บ้านสวนกลางเวียง (ผู้ใช้ให้พิกัดมา 16 ก.ย. 2569) */
/** ชื่อที่ทำงานตามที่ผู้ใช้ให้มา (16 ก.ย. 2569) — ขึ้นบนป้ายหน้าตอกบัตรและกล่องนอกพื้นที่ */
const WORKPLACE_NAME = "บริษัท ไอเมซเมกเกอร์ iMazmaker จำกัด MAZ (MAZMAKER)";

const INITIAL: AreaSettings = {
  areas: [
    {
      id: "HQ",
      name: WORKPLACE_NAME,
      lat: 18.751466,
      lng: 99.015214,
      radius: 150,
      active: true,
      address: "อาคาร IMZ Group บ้านสวนกลางเวียง ต.หนองหอย อ.เมือง จ.เชียงใหม่",
    },
  ],
};

function isSettings(v: unknown): v is AreaSettings {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.areas);
}

/** เครื่องที่เคยตั้งไว้หลายจุด — ใช้จุดแรกเป็นที่ทำงาน และเปิดใช้เสมอ */
/* พิกัดตัวอย่างเดิม (ถ.นิมมานเหมินท์) ที่ใช้ก่อนได้พิกัดจริง — เครื่องที่ยังค้างค่านี้ให้ย้ายไปที่ทำงานจริง */
const OLD_SAMPLE = { lat: 18.7953, lng: 98.9523 };

function keepOne(s: AreaSettings): AreaSettings {
  const stored = s.areas[0] ?? INITIAL.areas[0];
  const moved =
    stored.lat === OLD_SAMPLE.lat && stored.lng === OLD_SAMPLE.lng
      ? { ...stored, lat: INITIAL.areas[0].lat, lng: INITIAL.areas[0].lng, address: INITIAL.areas[0].address }
      : stored;
  /* ชื่อตัวอย่างเดิม "สำนักงานใหญ่" — เปลี่ยนเป็นชื่อจริง ถ้าผู้ดูแลตั้งชื่ออื่นไว้เองไม่ทับ */
  const first = moved.name === "สำนักงานใหญ่" ? { ...moved, name: WORKPLACE_NAME } : moved;
  /* ทิ้งช่องกติกาของรุ่นก่อนไปด้วย เหลือแค่ที่ทำงาน */
  if (first === stored && s.areas.length === 1 && first.active && Object.keys(s).length === 1) return s;
  return { areas: [{ ...first, active: true }] };
}

const store = createPersistedStore<AreaSettings>("maz-erp.work-area.v1", INITIAL, isSettings, keepOne);

export function useAreaSettings() {
  return useSyncExternalStore(store.subscribe, store.get, store.getServer);
}

export function areaSettings() {
  return store.get();
}

/**
 * ที่ทำงาน — จุดเดียวที่ใช้ตัดสิน
 * ถ้าหน้าตั้งค่ารวมบันทึกชุดที่มีวันเริ่มใช้ไว้ (ต้นแบบ HR-15) พิกัดเดินตามชุดที่มีผลวันนี้
 */
export function workplaceOf(s: AreaSettings): WorkArea {
  const base = s.areas[0] ?? INITIAL.areas[0];
  const hit = attOn(todayIso());
  if (!hit) return base;
  const p = hit.place;
  if (base.lat === p.lat && base.lng === p.lng && base.radius === p.radius) return base;
  return { ...base, ...p };
}

export function saveWorkplace(area: WorkArea) {
  store.update((s) => ({ ...s, areas: [{ ...area, active: true }] }));
  /* มีประวัติแล้วพิกัดอ่านจากประวัติ — แก้จากหน้านี้ต้องลงประวัติของวันนี้ด้วย ไม่งั้นค่าใหม่ถูกชุดเก่าทับ */
  const s = settings();
  if (s.attHistory.length) {
    const c = s.schedule;
    saveAttFrom(
      todayIso(),
      { start: c.start, end: c.end, lunchStart: c.lunchStart, lunchEnd: c.lunchEnd },
      { lat: area.lat, lng: area.lng, radius: area.radius },
      "แก้จุดลงเวลาจากหน้าพื้นที่เข้างาน",
    );
  }
}

export function resetAreaSettings() {
  store.reset();
}

/** ระยะทางบนผิวโลกเป็นเมตร (haversine) */
export function distanceM(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type Fix = { lat: number; lng: number; acc: number };

/**
 * ผลการตรวจพื้นที่ที่แนบไปกับการตอกบัตร — ผู้ดูแลระบบใช้ตรวจย้อนหลัง
 *   inside  อยู่ในรัศมีของจุดใดจุดหนึ่ง
 *   outside อยู่นอกทุกจุด (area/dist คือจุดที่ใกล้ที่สุด)
 *   weak    สัญญาณ GPS คลาดเคลื่อนเกินที่ตั้งไว้ ตัดสินไม่ได้
 *   nogps   เครื่องไม่ให้พิกัด (ปฏิเสธสิทธิ์ ไม่มี GPS หรือหมดเวลา)
 *   off     ไม่ได้ตรวจ (การตอกบัตรรุ่นก่อนที่ยังปิดการตรวจได้)
 */
export type GeoStatus = "inside" | "outside" | "weak" | "nogps" | "off";

export type PunchGeo = {
  status: GeoStatus;
  lat?: number;
  lng?: number;
  acc?: number;
  /** ชื่อจุดที่อยู่ข้างใน หรือจุดที่ใกล้ที่สุดถ้าอยู่นอก */
  area?: string;
  dist?: number;
  /** เหตุผลที่พนักงานให้ไว้ตอนเข้างานนอกพื้นที่ */
  why?: string;
};

export const GEO_LABEL: Record<GeoStatus, string> = {
  inside: "ในพื้นที่",
  outside: "นอกพื้นที่",
  weak: "GPS ไม่แม่น",
  nogps: "ไม่ได้พิกัด",
  off: "ไม่ได้ตรวจ",
};

/** ตัดสินว่าพิกัดนี้อยู่ในพื้นที่ไหม */
export function judge(fix: Fix, s: AreaSettings): PunchGeo {
  const base = { lat: fix.lat, lng: fix.lng, acc: Math.round(fix.acc) };
  const areas = [workplaceOf(s)];

  const ranked = areas
    .map((a) => ({ a, d: distanceM(fix.lat, fix.lng, a.lat, a.lng) }))
    /* เรียงตามระยะถึงขอบรัศมี ไม่ใช่ถึงจุดกลาง — จุดใหญ่ที่ไกลกว่าอาจเข้าใกล้กว่าจริง */
    .sort((x, y) => x.d - x.a.radius - (y.d - y.a.radius));
  const hit = ranked.find((x) => x.d <= x.a.radius);
  if (hit) return { ...base, status: "inside", area: hit.a.name, dist: Math.round(hit.d) };

  const near = ranked[0];
  /* อยู่นอกจริงหรือ GPS แค่คลาด — ถ้าคลาดเกินเกณฑ์ บอกว่าสัญญาณไม่แม่นแทนที่จะกล่าวหาว่าอยู่นอก */
  if (fix.acc > MAX_ACCURACY) {
    return { ...base, status: "weak", area: near.a.name, dist: Math.round(near.d) };
  }
  return { ...base, status: "outside", area: near.a.name, dist: Math.round(near.d) };
}

/*
 * เบราว์เซอร์ให้ใช้ตำแหน่งได้เฉพาะหน้าที่เปิดผ่าน https หรือ localhost
 * เปิดผ่าน http://<IP เครื่อง>:3000 จะถูกปฏิเสธทันทีโดยไม่ถามผู้ใช้เลย
 * ถ้าบอกว่า "ไปเปิดสิทธิ์ในตั้งค่า" คนใช้จะหาทางแก้ไม่เจอ จึงแยกข้อความกรณีนี้ออกมา
 */
const INSECURE =
  "หน้านี้เปิดผ่าน http ซึ่งเบราว์เซอร์ไม่ให้ใช้ตำแหน่ง — เปิดระบบผ่าน https หรือ localhost แล้วลองใหม่";

function insecure() {
  return typeof window !== "undefined" && !window.isSecureContext;
}

function geoError(e: GeolocationPositionError) {
  if (insecure()) return INSECURE;
  return e.code === e.PERMISSION_DENIED
    ? "ไม่ได้อนุญาตให้เข้าถึงตำแหน่ง — เปิดสิทธิ์ตำแหน่งของเว็บนี้ในตั้งค่าเบราว์เซอร์ แล้วลองใหม่"
    : e.code === e.TIMEOUT
      ? "หาตำแหน่งไม่ทันเวลา — ลองขยับไปที่โล่งหรือเปิด GPS แล้วลองใหม่"
      : "หาตำแหน่งไม่ได้ — ตรวจว่าเปิด GPS ไว้ แล้วลองใหม่";
}

/** พิกัดจากการติดตามสดที่ได้มาไม่เกินนี้ ถือว่ายังใช้ตัดสินตอนกดเข้างานได้ */
export const LIVE_FRESH_MS = 15_000;

/** พิกัดสดที่ยังใช้ตัดสินตอนกดเข้างานได้ — เก่ากว่า LIVE_FRESH_MS คืน null ให้ขอใหม่ */
export function freshFix(live: LiveGeo): Fix | null {
  return live.phase === "ready" && Date.now() - live.at < LIVE_FRESH_MS ? live.fix : null;
}

export type LiveGeo =
  | { phase: "locating" }
  /* at = เวลาที่ได้พิกัดนี้ (ms) — ตอนกดเข้างานใช้พิกัดนี้ต่อได้ถ้ายังสด */
  | { phase: "ready"; geo: PunchGeo; fix: Fix; at: number }
  | { phase: "error"; error: string };

/**
 * ติดตามตำแหน่งสดขณะเปิดหน้าตอกบัตร — ให้ป้ายบอกได้ก่อนกดว่าอยู่ในพื้นที่ทำงานหรือไม่
 * ปิด (enabled = false) ตอนกำลังทำงานอยู่ ไม่ต้องเปลืองแบตติดตามตำแหน่งต่อ
 * ตอนกดเข้างานใช้พิกัดจากตัวนี้ถ้าได้มาไม่เกิน LIVE_FRESH_MS ไม่งั้นขอใหม่ (locate)
 * ไม่ขอซ้อนระหว่างที่ติดตามอยู่ เพราะบางเครื่องไม่ตอบคำขอใหม่จนกว่าตำแหน่งจะขยับ กล่องจะค้าง "กำลังตรวจพื้นที่"
 */
export function useLiveGeo(enabled: boolean): LiveGeo {
  const s = useAreaSettings();
  const [live, setLive] = useState<LiveGeo>({ phase: "locating" });
  const hydrated = useHydrated();

  useEffect(() => {
    if (!enabled) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        const fix = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setLive({ phase: "ready", fix, at: Date.now(), geo: judge(fix, areaSettings()) });
      },
      (e) => setLive({ phase: "error", error: geoError(e) }),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [enabled]);

  /* ตรวจว่าเครื่องรองรับหลัง hydrate เท่านั้น — Node มี navigator แต่ไม่มี geolocation
     ถ้าตรวจตอนเรนเดอร์ฝั่งเซิร์ฟเวอร์จะได้ข้อความคนละแบบกับเบราว์เซอร์ */
  if (hydrated && insecure()) return { phase: "error", error: INSECURE };
  if (hydrated && !navigator.geolocation) {
    return { phase: "error", error: "เครื่องหรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง" };
  }
  /* ผู้ดูแลแก้ที่ทำงานระหว่างเปิดหน้าอยู่ — ตัดสินพิกัดเดิมกับที่ทำงานใหม่ทันที ไม่ต้องรอพิกัดถัดไป */
  if (live.phase === "ready") return { ...live, geo: judge(live.fix, s) };
  return live;
}

/** ขอพิกัดจากเครื่อง — ไม่ได้คืน null พร้อมเหตุผลที่อ่านได้ */
export function locate(): Promise<{ fix: Fix } | { error: string }> {
  return new Promise((resolve) => {
    if (insecure()) {
      resolve({ error: INSECURE });
      return;
    }
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve({ error: "เครื่องหรือเบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ fix: { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy } }),
      (e) => resolve({ error: geoError(e) }),
      /* maximumAge 0 — ห้ามใช้ตำแหน่งเก่าที่เครื่องจำไว้ ไม่งั้นคนที่เพิ่งเดินถึงที่ทำงานกด "ตรวจใหม่" จะยังได้ตำแหน่งนอกเขตเดิม */
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 0 },
    );
  });
}

export function mapLink(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

export function meters(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)} กม.` : `${Math.round(n)} ม.`;
}
