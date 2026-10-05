"use client";

import { DevicePushCard } from "./device-push-card";
import { isIOS, useHydrated } from "@/lib/pwa";

import { optionsOf } from "@/lib/options";
import { bkkNow, parseIsoDate, todayIso } from "@/lib/format";

import { cloneElement, isValidElement, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import "@/styles/mobile/profile.css";
import { useRole } from "@/lib/role";
import { saveProfile, useProfile } from "@/lib/profile-data";
import {
  NOTIFY_CHANNELS,
  NOTIFY_EVENTS,
  saveNotifySettings,
  useNotifySettings,
  type NotifySettings,
} from "@/lib/notify-settings";
import { setProfilePhoto, useProfilePhoto } from "@/lib/profile-store";
import {
  BOTNAV_SLOTS,
  botnavChoices,
  botnavDefault,
  botnavOf,
  resetBotnav,
  setBotnav,
  useBotnavPrefs,
} from "@/lib/botnav-prefs";
import { navItemsOf, useMenuAccess } from "@/lib/nav";
import { useMyRoles } from "@/lib/hr-link";
import { useApprovalRoute } from "@/lib/role";
import { ICONS } from "./app-shell";
import {
  BellIcon,
  CameraIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  GridIcon,
  HomeIcon,
  LockIcon,
  LogoutIcon,
  PencilIcon,
  UserIcon,
} from "./icons";
import { FileDrop, type PickedFile } from "./file-drop";
import { PhotoCropper } from "./photo-cropper";

import { DateField } from "./thai-date-picker";
import { ADD_VALUE, useAddOption } from "./add-option";
/* ข้อมูลตัวอย่างย้ายไปหน้าผู้ดูแลระบบ (/admin/data) — เป็นเครื่องมือดูแลระบบ ไม่ใช่ของพนักงาน */
type Pane = "profile" | "notify" | "security" | "botnav";

const PANES: { key: Pane; label: string; icon: React.ReactNode }[] = [
  { key: "profile", label: "ข้อมูลส่วนตัว", icon: <UserIcon className="size-4" /> },
  { key: "notify", label: "การแจ้งเตือน", icon: <BellIcon className="size-4" /> },
  { key: "security", label: "รหัสผ่าน", icon: <LockIcon className="size-4" /> },
  /* แถบเมนูล่างเป็นของแต่ละคน ตั้งเองได้ที่นี่ (เจ้าของสั่ง 25 ก.ย. 2569) */
  { key: "botnav", label: "แถบเมนูล่าง", icon: <GridIcon className="size-4" /> },
];

/** ชื่อหัวจอของแต่ละแผงบนมือถือ — ตามต้นแบบ profile-glass.html */
const MOBILE_TITLE: Record<Pane, string> = {
  profile: "ข้อมูลส่วนตัว",
  notify: "การแจ้งเตือน",
  security: "เปลี่ยนรหัสผ่าน",
  botnav: "แถบเมนูล่าง",
};

/** กระเป๋าทำงานหน้าตำแหน่งงาน — ไม่มีใน icons.tsx จึงวาดไว้ที่นี่ (ใช้เฉพาะหน้ารวมบนมือถือ) */
function BriefcaseIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" />
    </svg>
  );
}

export function ProfilePage() {
  const params = useSearchParams();
  /*
   * ผู้ดูแลระบบเป็นบัญชีสำหรับควบคุมระบบ ไม่ใช่คนในทะเบียน (เจ้าของสั่ง 25 ก.ย. 2569)
   * จึงไม่มีข้อมูลส่วนตัวและไม่มีรูป เหลือเฉพาะรหัสผ่านกับการแจ้งเตือนที่จำเป็นต่อการเข้าใช้งาน
   */
  const panes = PANES;
  const fallback: Pane = "profile";
  const tab = params.get("tab") as Pane | null;
  const [saved, setSaved] = useState<string | null>(null);
  const initial = tab || fallback;
  const [pane, setPane] = useState<Pane>(initial);
  /*
   * มือถือ (ต้นแบบ profile-glass.html): ไม่มี ?tab= = หน้ารวม (การ์ดโปรไฟล์ + แถวเมนู)
   * มี ?tab= = เปิดแผงนั้นเต็มจอ ปุ่มย้อนกลับของเบราว์เซอร์จึงพากลับหน้ารวมได้
   * จอคอมไม่ใช้ค่านี้ ยังเปิดแผงด้วย state เหมือนเดิม — แค่ตามค่า ?tab= ที่เปลี่ยนจากมือถือ
   */
  const router = useRouter();
  const [lastTab, setLastTab] = useState(tab);
  const pushed = useRef(false);
  if (tab !== lastTab) {
    setLastTab(tab);
    if (tab) setPane(tab);
    setSaved(null);
  }
  function openMobile(p: Pane) {
    pushed.current = true;
    router.push(`/profile?tab=${p}`, { scroll: true });
  }
  function closeMobile() {
    if (pushed.current) {
      pushed.current = false;
      router.back();
    } else router.replace("/profile", { scroll: true });
  }
  /*
   * แผงที่เปิดอยู่จริง — บทบาทอ่านจาก localStorage จึงรู้หลัง hydrate
   * ถ้ายึดค่าที่ตั้งไว้ตอนเรนเดอร์แรก ผู้ดูแลระบบจะค้างอยู่ที่แผง "ข้อมูลส่วนตัว" ที่ไม่มีให้ดู แล้วจอว่างเปล่า
   */
  const current = panes.some((p) => p.key === pane) ? pane : fallback;
  const mobileScreen = tab && panes.some((p) => p.key === tab) ? "pane" : "landing";

  function flash(message: string) {
    setSaved(message);
  }

  return (
    <div
      className="pf-m mx-auto grid max-w-[1060px] grid-cols-[minmax(0,1fr)] items-start gap-[22px] lg:grid-cols-[262px_minmax(0,1fr)]"
      data-m={mobileScreen}
    >
      {/* พื้นไล่ชมพูด้านบน — มีเฉพาะมือถือ (ซ่อนด้วย hidden แล้ว profile.css เปิดเองบนจอแคบ) */}
      <div className="pf-glow hidden" aria-hidden="true" />
      <ProfileCard
        pane={current}
        panes={panes}
        onPane={(p) => { setPane(p); setSaved(null); }}
        onOpenMobile={openMobile}
      />

      <div className="pf-pane min-w-0">
        {/* หัวหน้าจอของแผงบนมือถือ — ปุ่มกลมย้อนกลับไปหน้ารวม ชื่อแผงอยู่กลาง */}
        <header className="pf-head hidden">
          <button type="button" className="pf-back" aria-label="ย้อนกลับ" onClick={closeMobile}>
            <ChevronLeftIcon className="size-5" strokeWidth={2.4} />
          </button>
          <h1>{MOBILE_TITLE[current]}</h1>
          <span aria-hidden="true" />
        </header>
        {saved && (
          <p className="mb-[18px] flex items-center gap-[11px] rounded-[14px] bg-[var(--success-soft)] px-[17px] py-3 text-[13.5px] font-medium text-[var(--success)]">
            <CheckIcon className="size-[18px] shrink-0" strokeWidth={2.4} />
            {saved}
          </p>
        )}
        {current === "profile" && <PersonalPane onSaved={flash} />}
        {current === "notify" && <NotifyPane onSaved={flash} />}
        {current === "security" && <SecurityPane onSaved={flash} />}
        {current === "botnav" && <BotnavPane onSaved={flash} />}
      </div>
    </div>
  );
}

// ─── การ์ดซ้าย ────────────────────────────────────────────────────
function ProfileCard({
  pane,
  panes,
  onPane,
  onOpenMobile,
}: {
  pane: Pane;
  panes: typeof PANES;
  onPane: (p: Pane) => void;
  onOpenMobile: (p: Pane) => void;
}) {
  const photo = useProfilePhoto();
  const fileRef = useRef<HTMLInputElement>(null);
  const [cropping, setCropping] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCropping(String(reader.result));
    reader.readAsDataURL(file);
    if (fileRef.current) fileRef.current.value = "";
  }

  const me = useProfile();
  const short = me.name.split(" ").map((s) => s[0]).join("").slice(0, 2);

  /* แถวเมนูของหน้ารวมบนมือถือ — แผงข้อมูลส่วนตัวเปิดจากปุ่มแดงในการ์ดแทน */
  const rows = panes.filter((p) => p.key !== "profile");

  return (
    <>
    {/* ── มือถือ: หน้ารวมตามต้นแบบ profile-glass.html (จอคอมซ่อนด้วย hidden) ── */}
    <div className="pf-land hidden">
      <section className="pf-hero">
        <span className="pf-ava">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" />
          ) : (
            <span>{short}</span>
          )}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="pf-cam"
            aria-label="เปลี่ยนรูปโปรไฟล์"
          >
            <CameraIcon className="size-[15px]" strokeWidth={2.2} />
          </button>
        </span>
        <h2>{me.name}</h2>
        {me.position && (
          <p>
            <BriefcaseIcon className="size-[15px] flex-none" />
            <span className="truncate">{me.position}</span>
          </p>
        )}
        {panes.some((p) => p.key === "profile") && (
          <button type="button" className="pf-edit" onClick={() => onOpenMobile("profile")}>
            <PencilIcon className="size-4" />
            แก้ไขข้อมูลส่วนตัว
          </button>
        )}
      </section>

      <div className="pf-rows">
        {rows.map((p) => (
          <button key={p.key} type="button" className="pf-row" onClick={() => onOpenMobile(p.key)}>
            <span className="pf-row-ico">{p.icon}</span>
            <span className="pf-row-lbl">{p.key === "security" ? "เปลี่ยนรหัสผ่าน" : p.label}</span>
            <ChevronRightIcon className="pf-row-cv size-[18px]" />
          </button>
        ))}
      </div>
      <div className="pf-rows">
        <Link href="/install" className="pf-row">
          <span className="pf-row-ico">
            <DownloadIcon className="size-4" />
          </span>
          <span className="pf-row-lbl">ติดตั้งแอป</span>
          <ChevronRightIcon className="pf-row-cv size-[18px]" />
        </Link>
      </div>
      <div className="pf-rows">
        <a href="/login" className="pf-row pf-row-out">
          <span className="pf-row-ico">
            <LogoutIcon className="size-4" />
          </span>
          <span className="pf-row-lbl">ออกจากระบบ</span>
        </a>
      </div>
    </div>

    <aside className="pf-desk glass rounded-[20px] px-4 py-4 sm:px-5 lg:sticky lg:top-[88px] lg:pt-[26px] lg:pb-[18px] lg:text-center">
      <div className="flex items-center gap-4 lg:block">
      {/* เปลี่ยนรูปได้ทุกบทบาท รวมผู้ดูแลระบบ (เจ้าของสั่ง 25 ก.ย. 2569)
          รูปเป็นของบัญชี ไม่ใช่ข้อมูลส่วนตัวของคน บัญชีควบคุมระบบจึงตั้งรูปประจำบัญชีได้ */}
      <span className="relative inline-block shrink-0">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo}
            alt=""
            className="size-16 rounded-full object-cover lg:size-[104px]"
          />
        ) : (
          <span className="grid size-16 place-items-center rounded-full bg-accent text-xl font-bold text-primary lg:size-[104px] lg:text-[34px]">
            {short}
          </span>
        )}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="absolute -right-0.5 -bottom-0.5 grid size-7 place-items-center rounded-full border-[3px] border-white bg-primary text-white transition-colors hover:bg-primary-hover lg:right-0.5 lg:bottom-0.5 lg:size-[30px]"
          aria-label="เปลี่ยนรูปโปรไฟล์"
        >
          <CameraIcon className="size-[15px]" strokeWidth={2.2} />
        </button>
      </span>

        {/* ผู้ดูแลระบบไม่มีชื่อคนและไม่มีตำแหน่ง — บรรทัดเดียวว่า "ผู้ดูแลระบบ" พอ (เจ้าของสั่ง 25 ก.ย. 2569) */}
        <div className="min-w-0 lg:mt-3.5">
          <h2 className="truncate text-[17px] font-semibold">{me.name}</h2>
          {(
            <p className="mt-[3px] truncate text-[13px] text-muted-foreground">
              {me.position}
            </p>
          )}
        </div>
      </div>

      {/*
        มือถือ: สามช่องเท่า ๆ กันในแถวเดียว ไอคอนอยู่บน ชื่ออยู่ล่าง · ออกจากระบบกินเต็มแถวถัดไป
        เดิมเป็นชิปเรียงแถวเดียวที่ต้องเลื่อนซ้ายขวา ปุ่มท้ายแถวจึงถูกซ่อนอยู่นอกจอ
        คนที่ไม่รู้ว่าเลื่อนได้จะหาไม่เจอ (เจ้าของแจ้ง 25 ก.ย. 2569)
        จอใหญ่: เมนูแนวตั้งเหมือนเดิม
      */}
      <div className="mt-4 grid grid-cols-3 gap-2 lg:mt-5 lg:flex lg:flex-col lg:gap-1 lg:text-left">
        {panes.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => onPane(p.key)}
            className={`flex min-w-0 flex-col items-center justify-start gap-1 rounded-[14px] px-2 py-2.5 text-[12px] leading-tight font-medium transition-colors lg:w-full lg:flex-row lg:gap-[11px] lg:rounded-xl lg:px-3.5 lg:py-[11px] lg:text-[13.5px] ${
              pane === p.key
                ? "bg-accent font-semibold text-primary"
                : "bg-secondary text-muted-foreground lg:bg-transparent lg:hover:bg-muted lg:hover:text-foreground"
            }`}
          >
            {p.icon}
            <span className="min-w-0 text-center lg:text-left">{p.label}</span>
          </button>
        ))}
        <hr className="mx-1 my-1.5 hidden border-border lg:block" />
        <a
          href="/login"
          className="col-span-3 flex items-center justify-center gap-2 rounded-[14px] bg-secondary px-3.5 py-2.5 text-[13px] font-medium text-primary transition-colors lg:w-full lg:justify-start lg:gap-[11px] lg:rounded-xl lg:bg-transparent lg:py-[11px] lg:hover:bg-accent/60"
        >
          <LogoutIcon className="size-4" />
          ออกจากระบบ
        </a>
      </div>
    </aside>

    {/* ช่องเลือกไฟล์กับกล่องครอปอยู่นอกการ์ด — การ์ดจอคอมถูกซ่อนบนมือถือ ปุ่มกล้องทั้งสองที่จึงใช้ช่องเดียวกัน
        sr-only เป็น absolute และกล่องครอปยิงออกไปที่ body จึงไม่กินช่องของกริด */}
    <input
      ref={fileRef}
      type="file"
      accept="image/jpeg,image/png,image/gif"
      aria-label="เลือกไฟล์รูปโปรไฟล์"
      className="sr-only"
      onChange={(e) => pick(e.target.files?.[0])}
    />
    {cropping && (
      <PhotoCropper
        src={cropping}
        onCancel={() => setCropping(null)}
        onDone={(url) => {
          setProfilePhoto(url);
          setCropping(null);
        }}
      />
    )}
    </>
  );
}

// ─── ข้อมูลส่วนตัว ────────────────────────────────────────────────
function PersonalPane({ onSaved }: { onSaved: (m: string) => void }) {
  /* ระดับการศึกษาเพิ่มได้จากตรงนี้ — ใช้ชุดเดียวกับหน้าผู้ดูแลระบบ "ตัวเลือกในรายการ" */
  const addEdu = useAddOption({ list: "eduLevel" }, () => {});
  const me = useProfile();
  const [name, setName] = useState(me.name);
  const [phone, setPhone] = useState(me.phone);
  const [officePhone, setOfficePhone] = useState(me.officePhone);
  const [emPhone, setEmPhone] = useState(me.emergencyPhone);
  const [birth, setBirth] = useState(me.birth);
  const [nums, setNums] = useState({ weight: "", height: "", sibs: "", order: "" });
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [bad, setBad] = useState<{ name?: boolean; phone?: boolean }>({});
  const age = ageFrom(birth);

  function save() {
    const digits = phone.replace(/\D/g, "");
    const next = { name: !name.trim(), phone: digits.length < 9 };
    setBad(next);
    if (next.name || next.phone) return;
    /* เก็บเข้าสโตร์กลาง หน้าอื่นที่ใช้ชื่อ–เบอร์เดียวกันจะเปลี่ยนตามทันที */
    saveProfile({
      name: name.trim(),
      phone,
      officePhone,
      emergencyPhone: emPhone,
      birth,
    });
    onSaved("บันทึกข้อมูลส่วนตัวเรียบร้อย (ยังไม่มีระบบหลังบ้าน)");
  }

  return (
    <section className="pf-sheet glass rounded-[20px] px-4 py-5 sm:px-7 sm:py-[26px]">
      <h2 className="pf-intro text-lg font-semibold">ข้อมูลส่วนตัว</h2>
      <p className="pf-intro mt-1 text-[13px] leading-relaxed text-muted-foreground">
        ตามแบบฟอร์มข้อมูลประจำตัวพนักงาน MAZ · ช่องที่มี{" "}
        <em className="text-primary not-italic">*</em> ต้องกรอก
      </p>

      {/* .pf-grp ไม่มีสไตล์บนจอคอม (หน้าตาเดิม) · บนมือถือแต่ละกลุ่มเป็นการ์ดของตัวเอง */}
      <div className="pf-grp">
      <H3>ข้อมูลทั่วไป</H3>
      <div className="pf-grid grid gap-4 sm:grid-cols-2 sm:gap-x-5">
        <F
          label="ชื่อ–สกุล (ภาษาไทย)"
          required
          wide
          error={bad.name ? "กรอกชื่อ–สกุลภาษาไทย" : undefined}
        >
          <Input
            value={name}
            onChange={(v) => {
              setName(v);
              setBad((b) => ({ ...b, name: false }));
            }}
          />
        </F>
        <F label="ชื่อ–สกุล (ภาษาอังกฤษ)" wide>
          <Input placeholder="Chitpon Panyanon" />
        </F>
        <F label="ชื่อเล่น">
          <Input />
        </F>
        <F label="เพศ">
          {/* มือถือ: ปุ่มเรดิโอกลายเป็นแถบเลือกแบบแบ่งช่อง (pf-seg) ด้วย CSS ล้วน */}
          <div className="pf-seg flex h-12 items-center gap-[18px]">
            {/* อ่านจากข้อมูลหลัก — เพิ่มเพศใหม่แล้วขึ้นให้เลือกที่นี่ด้วย */}
            {optionsOf("sex").map((g) => (
              <label
                key={g}
                className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium"
              >
                <input
                  type="radio"
                  name="sex"
                  defaultChecked={g === optionsOf("sex")[0]}
                  className="size-[19px] accent-[var(--primary)]"
                />
                {g}
              </label>
            ))}
          </div>
        </F>

        <div className="pf-wide sm:col-span-2">
          <F label="ที่อยู่ที่ติดต่อได้">
            <textarea
              aria-label="ที่อยู่ที่ติดต่อได้"
              className="field-control h-[86px] resize-y rounded-xl px-[15px] py-3 text-sm leading-relaxed"
              placeholder="บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
            />
          </F>
        </div>

        <F
          label="เบอร์ติดต่อ"
          required
          error={bad.phone ? "กรอกเบอร์ติดต่อให้ครบ 9–10 หลัก" : undefined}
        >
          <Input
            inputMode="numeric"
            value={phone}
            onChange={(v) => {
              setPhone(formatPhone(v));
              setBad((b) => ({ ...b, phone: false }));
            }}
          />
        </F>
        <F label="เบอร์ออฟฟิศที่ถืออยู่">
          <Input
            inputMode="numeric"
            placeholder="ถ้าบริษัทให้เครื่องด้วย"
            value={officePhone}
            onChange={(v) => setOfficePhone(formatPhone(v))}
          />
        </F>
        <F label="E-mail (ส่วนตัว)" wide>
          <Input type="email" placeholder="name@example.com" />
        </F>
        <F label="E-mail (บริษัท)" wide>
          <Input defaultValue={me.email} readOnly />
        </F>
        <F label="ID LINE" wide>
          <Input placeholder="@lineid" />
        </F>
        <F label="วัน/เดือน/ปีเกิด">
          <DateField
            value={birth}
            onChange={setBirth}
            label="วัน/เดือน/ปีเกิด"
            max={todayIso()}
            clearable
            className="h-12 rounded-xl px-[15px] text-sm font-normal"
          />
        </F>
        <F label="อายุ" hint="คำนวณจากวันเกิดอัตโนมัติ">
          <Input value={age} readOnly />
        </F>
        <F label="สถานภาพสมรส" wide>
          <Select options={["โสด", "สมรส", "หย่าร้าง", "หม้าย"]} />
        </F>
        <F label="น้ำหนัก (กก.)">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={nums.weight}
            onChange={(v) => setNums((n) => ({ ...n, weight: digits3(v) }))}
          />
        </F>
        <F label="ส่วนสูง (ซม.)">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={nums.height}
            onChange={(v) => setNums((n) => ({ ...n, height: digits3(v) }))}
          />
        </F>
        <F label="เชื้อชาติ">
          <Input placeholder="ไทย" />
        </F>
        <F label="สัญชาติ">
          <Input placeholder="ไทย" />
        </F>
        <F label="การรับราชการทหาร" wide>
          <Select
            options={[
              "ผ่านการเกณฑ์ทหารแล้ว",
              "ได้รับการยกเว้น",
              "ยังไม่ได้เกณฑ์",
              "ไม่เกี่ยวข้อง",
            ]}
          />
        </F>
      </div>
      </div>

      <div className="pf-grp">
      <H3>ข้อมูลครอบครัว</H3>
      <div className="pf-grid grid gap-4 sm:grid-cols-2 sm:gap-x-5">
        <F label="ชื่อบิดา">
          <Input />
        </F>
        <F label="อาชีพบิดา">
          <Input />
        </F>
        <F label="ชื่อมารดา">
          <Input />
        </F>
        <F label="อาชีพมารดา">
          <Input />
        </F>
        <F label="จำนวนพี่น้อง (คน)">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={nums.sibs}
            onChange={(v) => setNums((n) => ({ ...n, sibs: digits3(v) }))}
          />
        </F>
        <F label="คุณเป็นบุตรคนที่">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={nums.order}
            onChange={(v) => setNums((n) => ({ ...n, order: digits3(v) }))}
          />
        </F>
      </div>
      </div>

      <div className="pf-grp">
      <div className="pf-grp-head flex items-center justify-between gap-3">
        <H3>ประวัติการศึกษา</H3>
        {addEdu.canAdd && (
          <button type="button" className="lnk text-[12.5px]" onClick={() => addEdu.pick(ADD_VALUE)}>
            ＋ เพิ่มระดับการศึกษา
          </button>
        )}
      </div>
      {addEdu.dialog}
      {/* จอเล็กกรอกทีละระดับ — มือถือพับเก็บได้ทีละระดับ (แตะเพื่อกรอก) ตามต้นแบบ · จอใหญ่เป็นตารางเหมือนแบบฟอร์มกระดาษ */}
      <div className="pf-edu space-y-3 md:hidden">
        {optionsOf("eduLevel").map((lv) => (
          <details key={lv} className="pf-edu-item glass-thin rounded-[14px]">
            <summary>
              {lv}
              <span>แตะเพื่อกรอก</span>
            </summary>
            <div className="pf-edu-body">
              <F label="ชื่อสถานศึกษา" wide>
                <Input aria-label={`สถานศึกษา ${lv}`} />
              </F>
              <F label="ประเทศ">
                <Input placeholder="ไทย" aria-label={`ประเทศ ${lv}`} />
              </F>
              <F label="สาขาวิชา">
                <Input aria-label={`สาขาวิชา ${lv}`} />
              </F>
              <F label="เกรดเฉลี่ย">
                <Input inputMode="decimal" placeholder="0.00" aria-label={`เกรด ${lv}`} />
              </F>
              <F label="ปีที่สำเร็จ">
                <Input inputMode="numeric" placeholder="2562" aria-label={`ปีที่สำเร็จ ${lv}`} />
              </F>
            </div>
          </details>
        ))}
      </div>
      <div className="glass-thin hidden overflow-x-auto rounded-[14px] md:block">
        <table className="data-table min-w-[760px]">
          <thead>
            <tr>
              <th style={{ width: 170 }}>ระดับการศึกษา</th>
              <th>ชื่อสถานศึกษา</th>
              <th style={{ width: 130 }}>ประเทศ</th>
              <th style={{ width: 140 }}>สาขาวิชา</th>
              <th style={{ width: 100 }}>เกรดเฉลี่ย</th>
              <th style={{ width: 110 }}>ปีที่สำเร็จ</th>
            </tr>
          </thead>
          <tbody>
            {optionsOf("eduLevel").map((lv) => (
              <tr key={lv}>
                <td className="text-[12.5px] font-medium whitespace-nowrap text-muted-foreground">
                  {lv}
                </td>
                <td>
                  <input className="field-control h-[38px] text-[13px]" aria-label={`สถานศึกษา ${lv}`} />
                </td>
                <td>
                  <input className="field-control h-[38px] text-[13px]" placeholder="ไทย" aria-label={`ประเทศ ${lv}`} />
                </td>
                <td>
                  <input className="field-control h-[38px] text-[13px]" aria-label={`สาขาวิชา ${lv}`} />
                </td>
                <td>
                  <input className="field-control h-[38px] text-[13px]" inputMode="decimal" placeholder="0.00" aria-label={`เกรด ${lv}`} />
                </td>
                <td>
                  <input className="field-control h-[38px] text-[13px]" inputMode="numeric" placeholder="2562" aria-label={`ปีที่สำเร็จ ${lv}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>

      <div className="pf-grp">
      <H3>บุคคลที่ติดต่อได้กรณีเร่งด่วน</H3>
      <div className="pf-grid grid gap-4 sm:grid-cols-2 sm:gap-x-5">
        <F label="ชื่อ–สกุล" wide>
          <Input />
        </F>
        <F label="ความสัมพันธ์">
          <Select
            options={["บิดา", "มารดา", "คู่สมรส", "พี่น้อง", "บุตร", "ญาติ", "เพื่อน"]}
          />
        </F>
        <F label="โทรศัพท์">
          <Input
            inputMode="numeric"
            placeholder="08x-xxx-xxxx"
            value={emPhone}
            onChange={(v) => setEmPhone(formatPhone(v))}
          />
        </F>
      </div>
      </div>

      <div className="pf-grp">
      <H3>เอกสารแนบ</H3>
      <FileDrop
        files={files}
        onChange={setFiles}
        title="แนบรูปถ่าย"
        hint="รูปถ่ายหน้าตรง พื้นหลังสุภาพ · JPG หรือ PNG"
        accept="image/*"
        label="เลือกรูปถ่าย"
      />
      </div>

      {/* ฟอร์มยาวมาก — มือถือให้ปุ่มบันทึกลอยอยู่เหนือแถบล่างตลอด ไม่ต้องเลื่อนลงไปหา
          (.pf-bar บนจอแคบกว่า md เป็นแถบล่างแบบต้นแบบ: ยกเลิก / บันทึก 1fr 1.4fr) */}
      <div className="pf-bar mt-[26px] grid gap-3.5 max-sm:sticky max-sm:bottom-[calc(var(--botbar)+10px)] max-sm:z-10 max-sm:grid-cols-2 max-sm:gap-2.5 max-sm:rounded-2xl max-sm:border max-sm:border-border max-sm:bg-card max-sm:p-2.5 max-sm:shadow-[0_-6px_16px_-10px_rgb(0_0_0/0.25)] sm:grid-cols-2">
        <button
          type="button"
          className="h-12 rounded-[14px] border-[1.5px] border-primary bg-white text-[14.5px] font-semibold text-primary transition-colors hover:bg-accent max-sm:h-11 max-sm:text-[13.5px]"
          onClick={() => setBad({})}
        >
          <CancelLabel />
        </button>
        <button
          type="button"
          className="btn-solid h-12 rounded-[14px] text-[14.5px] font-semibold max-sm:h-11 max-sm:text-[13.5px]"
          onClick={save}
        >
          บันทึกการเปลี่ยนแปลง
        </button>
      </div>
    </section>
  );
}

/** ช่องกรอกมาตรฐานของหน้านี้ — สูง 48px มุมมน 12px ตามแบบฟอร์ม */
function Input({
  value,
  onChange,
  className,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  onChange?: (v: string) => void;
}) {
  return (
    <input
      {...props}
      value={value}
      onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      className={`field-control h-12 rounded-xl px-[15px] text-sm ${className ?? ""}`}
    />
  );
}

function Select({ options, id }: { options: string[]; id?: string }) {
  return (
    <select id={id} className="field-control h-12 cursor-pointer rounded-xl px-[15px] text-sm">
      <option value="">— เลือก —</option>
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  );
}

function digits3(v: string) {
  return v.replace(/\D/g, "").slice(0, 3);
}

// ─── การแจ้งเตือน ─────────────────────────────────────────────────
const LEAD_IN = [0, 5, 10, 15, 30];
const LEAD_OUT = [0, 5, 10, 15];
const REPEAT = [0, 5, 10, 15];

function NotifyPane({ onSaved }: { onSaved: (m: string) => void }) {
  const stored = useNotifySettings();
  /* แก้ในหน้าก่อน กดบันทึกแล้วค่อยเขียนลงสโตร์ที่หน้าอื่นอ่าน */
  const [draft, setDraft] = useState<NotifySettings>(stored);
  const { on, leadIn, leadOut, repeat, quietLunch: quiet, channels } = draft;
  const patch = (v: Partial<NotifySettings>) => setDraft((d) => ({ ...d, ...v }));
  const setOn = (v: boolean) => patch({ on: v });
  const setLeadIn = (v: number) => patch({ leadIn: v });
  const setLeadOut = (v: number) => patch({ leadOut: v });
  const setRepeat = (v: number) => patch({ repeat: v });
  const setQuiet = (v: boolean) => patch({ quietLunch: v });
  /* สวิตช์สั่นกดได้ทุกเครื่อง (ผู้ใช้สั่ง 29 ก.ย. 2569) — iPhone ไม่ให้เว็บสั่งสั่น เครื่องสั่นตามการตั้งค่าของ iPhone เอง
     จึงบอกไว้ใต้ตาราง ไม่ล็อกสวิตช์ · อ่านชนิดเครื่องหลัง hydrate เท่านั้น */
  const ios = useHydrated() && isIOS();

  return (
    <section className="pf-sheet glass rounded-[20px] px-4 py-5 sm:px-7 sm:py-[26px]">
      <h2 className="pf-intro text-lg font-semibold">การแจ้งเตือน</h2>
      <p className="pf-intro mt-1 text-[13px] leading-relaxed text-muted-foreground">
        เลือกได้ว่าเรื่องไหนจะเตือนด้วยวิธีใด ระบบยังคงส่งเรื่องสำคัญที่เกี่ยวกับบัญชีของคุณเสมอ
      </p>

      <DevicePushCard />

      {/* มือถือ: สวิตช์ใหญ่เป็นการ์ดบนสุดของจอ (.pf-master) */}
      <div className="pf-master glass-thin mt-5 flex items-center justify-between gap-3 rounded-[14px] px-4 py-3.5 text-sm font-semibold">
        <span>
          เปิดการแจ้งเตือน
          <small className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">
            {on
              ? "ป๊อปอัปจะเด้งให้อัตโนมัติเมื่อถึงเวลาและอยู่ในพื้นที่ทำงาน"
              : "ปิดอยู่ · ต้องกดปุ่มเช็คอินเองทุกครั้ง"}
          </small>
        </span>
        <Switch on={on} onToggle={() => setOn(!on)} label="เปิดการแจ้งเตือน" />
      </div>

      <div className={`pf-stack ${on ? "" : "pointer-events-none opacity-40"}`}>
        {/* .pf-grp ไม่มีสไตล์บนจอคอม · มือถือเป็นการ์ด "เรื่องที่แจ้งเตือน" */}
        <div className="pf-grp pf-events">
        <h2 className="pf-grp-title hidden">เรื่องที่แจ้งเตือน</h2>
        <div className="pf-chhead mt-5 grid grid-cols-[minmax(0,1fr)_44px_44px_44px] sm:grid-cols-[minmax(0,1fr)_60px_60px_60px] gap-2.5 border-b border-border pb-2.5">
          <span />
          {NOTIFY_CHANNELS.map((c) => (
            <span key={c.key} className="text-center text-[11.5px] font-semibold text-muted-foreground">
              {c.label}
            </span>
          ))}
        </div>

        {NOTIFY_EVENTS.map((e) => (
          <div
            key={e.key}
            className="pf-ev grid grid-cols-[minmax(0,1fr)_44px_44px_44px] sm:grid-cols-[minmax(0,1fr)_60px_60px_60px] items-center gap-2.5 border-b border-border py-4"
          >
            <span className="pf-ev-txt">
              <b className="block text-[13.5px] font-semibold">{e.title}</b>
              <span className="mt-[3px] block text-xs leading-relaxed text-muted-foreground">
                {e.detail}
              </span>
            </span>
            {NOTIFY_CHANNELS.map((c) => (
              <span key={c.key} className="pf-ch flex justify-center">
                {/* มือถือ: ช่องทางเรียงลงเป็นแถว ชื่อช่องทางอยู่หน้าสวิตช์เล็ก (ต้นแบบ .pg-ch) */}
                <span className="pf-ch-lbl hidden">{c.label}</span>
                <Switch
                  small
                  on={channels[e.key][c.key]}
                  label={`${e.title} — ${c.label}`}
                  onToggle={() =>
                    patch({
                      channels: {
                        ...channels,
                        [e.key]: { ...channels[e.key], [c.key]: !channels[e.key][c.key] },
                      },
                    })
                  }
                />
              </span>
            ))}
          </div>
        ))}

        {ios && (
          <p className="mt-3 text-xs leading-[1.65] text-muted-foreground">
            iPhone สั่นตามการตั้งค่าของเครื่อง (การตั้งค่า › เสียงและการสั่น › การสั่น) — สวิตช์สั่นในแอปใช้กับ Android
          </p>
        )}
        </div>

        <div className="pf-grp">
        <H3>เวลาแจ้งเตือน</H3>
        <div className="grid gap-[18px]">
          <Pills label="เตือนล่วงหน้าก่อนเข้างาน" options={LEAD_IN} value={leadIn} onChange={setLeadIn} zero="ตรงเวลา" />
          <Pills label="เตือนตอนเลิกงาน" options={LEAD_OUT} value={leadOut} onChange={setLeadOut} zero="ตรงเวลา" />
          <Pills label="เตือนซ้ำถ้ายังไม่กด" options={REPEAT} value={repeat} onChange={setRepeat} zero="ไม่เตือนซ้ำ" every />
        </div>
        </div>

        <div className="pf-grp">
        <H3>อื่น ๆ</H3>
        <div className="pf-quiet flex items-center justify-between gap-3 py-3.5 text-[13.5px]">
          <span>
            ปิดเสียงช่วงพักกลางวัน
            <small className="mt-0.5 block text-[11.5px] text-muted-foreground">
              12:00–13:00 น. แจ้งเตือนแบบเงียบ
            </small>
          </span>
          <Switch on={quiet} onToggle={() => setQuiet(!quiet)} label="ปิดเสียงช่วงพักกลางวัน" />
        </div>
        </div>
      </div>

      <div className="pf-bar mt-[26px] grid gap-3.5 sm:grid-cols-2">
        <button
          type="button"
          className="h-12 rounded-[14px] border-[1.5px] border-primary bg-white text-[14.5px] font-semibold text-primary transition-colors hover:bg-accent"
          onClick={() => setDraft(stored)}
        >
          <CancelLabel />
        </button>
        <button
          type="button"
          className="btn-solid h-12 rounded-[14px] text-[14.5px] font-semibold"
          onClick={() => {
            saveNotifySettings(draft);
            onSaved("บันทึกการตั้งค่าแจ้งเตือนเรียบร้อย");
          }}
        >
          บันทึกการเปลี่ยนแปลง
        </button>
      </div>
    </section>
  );
}

function Pills({
  label,
  options,
  value,
  onChange,
  zero,
  every,
}: {
  label: string;
  options: number[];
  value: number;
  onChange: (v: number) => void;
  zero: string;
  every?: boolean;
}) {
  return (
    <div>
      <p className="mb-2.5 text-[12.5px] font-semibold text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={`pf-chip rounded-xl border-[1.5px] px-4 py-2.5 text-[13px] transition-colors ${
              o === value
                ? "border-primary bg-accent font-semibold text-primary"
                : "border-border bg-white text-muted-foreground hover:border-muted-foreground/40"
            }`}
          >
            {o === 0 ? zero : `${every ? "ทุก " : ""}${o} นาที`}
          </button>
        ))}
      </div>
    </div>
  );
}

function Switch({
  on,
  onToggle,
  label,
  disabled,
  small,
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  disabled?: boolean;
  /** มือถือ: สวิตช์เล็ก 40×24 สำหรับช่องทางย่อยของแต่ละเรื่อง (จอคอมขนาดเท่าเดิม) */
  small?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      title={disabled ? "สั่นใช้ได้เฉพาะบนมือถือ" : undefined}
      onClick={onToggle}
      className={`pf-sw${small ? " pf-sw-sm" : ""} relative h-[25px] w-11 shrink-0 rounded-[14px] transition-colors disabled:opacity-35 ${
        on ? "bg-primary" : "bg-[#dde2e9]"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] size-[19px] rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[19px]" : ""
        }`}
      />
    </button>
  );
}

// ─── รหัสผ่าน ─────────────────────────────────────────────────────
function SecurityPane({ onSaved }: { onSaved: (m: string) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [touched, setTouched] = useState(false);

  const nextProblem = next ? passwordProblem(next) : "";
  const mismatch = confirm.length > 0 && confirm !== next;

  function save() {
    setTouched(true);
    if (!current || !next || nextProblem || confirm !== next) return;
    setCurrent("");
    setNext("");
    setConfirm("");
    setTouched(false);
    onSaved("เปลี่ยนรหัสผ่านเรียบร้อย (ยังไม่มีระบบหลังบ้าน)");
  }

  return (
    <section className="pf-sheet glass rounded-[20px] px-4 py-5 sm:px-7 sm:py-[26px]">
      <h2 className="pf-intro text-lg font-semibold">รหัสผ่าน</h2>
      <p className="pf-intro mt-1 text-[13px] text-muted-foreground">
        เปลี่ยนรหัสผ่านที่ใช้เข้าสู่ระบบ
      </p>

      <div className="pf-grp pf-pwgrid mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <F
            label="รหัสผ่านปัจจุบัน"
            required
            error={touched && !current ? "กรอกรหัสผ่านปัจจุบัน" : undefined}
            hint="หากลืมรหัสผ่าน ต้องติดต่อฝ่ายบุคคลเพื่อรีเซ็ตให้"
          >
            <input
              type="password"
              className="field-control h-12 rounded-xl px-[15px] text-sm"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </F>
        </div>
        <F
          label="รหัสผ่านใหม่"
          required
          className="pf-pwnew"
          error={nextProblem || (touched && !next ? "กรอกรหัสผ่านใหม่" : undefined)}
          hint="อย่างน้อย 8 ตัวอักษร · พิมพ์ใหญ่ · พิมพ์เล็ก · ตัวเลข · อักขระพิเศษ"
        >
          <input
            type="password"
            autoComplete="new-password"
            className="field-control h-12 rounded-xl px-[15px] text-sm"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </F>
        {/* มือถือ: เงื่อนไขรหัสผ่านใหม่ ข้อที่ผ่านเป็นเครื่องหมายถูกสีเขียวทันทีที่พิมพ์ (ต้นแบบ #pgRules)
            ใช้เกณฑ์เดียวกับ passwordProblem · จอคอมซ่อน (hidden) จึงไม่กินช่องกริด */}
        <ul className="pf-rules hidden" aria-live="polite">
          {PW_RULES.map((r) => (
            <li key={r.label} className={r.test(next) ? "ok" : undefined}>
              <span className="pf-dot" aria-hidden="true">
                <CheckIcon className="size-[11px]" strokeWidth={3} />
              </span>
              {r.label}
            </li>
          ))}
        </ul>
        <F
          label="ยืนยันรหัสผ่านใหม่"
          required
          error={mismatch ? "รหัสผ่านยืนยันไม่ตรงกัน" : undefined}
        >
          <input
            type="password"
            className="field-control h-12 rounded-xl px-[15px] text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </F>
      </div>

      <div className="pf-bar mt-[26px] grid gap-3.5 sm:grid-cols-2">
        <button
          type="button"
          className="h-12 rounded-[14px] border-[1.5px] border-primary bg-white text-[14.5px] font-semibold text-primary transition-colors hover:bg-accent"
          onClick={() => {
            setCurrent("");
            setNext("");
            setConfirm("");
            setTouched(false);
          }}
        >
          <CancelLabel />
        </button>
        <button
          type="button"
          className="btn-solid h-12 rounded-[14px] text-[14.5px] font-semibold"
          onClick={save}
        >
          เปลี่ยนรหัสผ่าน
        </button>
      </div>
    </section>
  );
}

// ─── ชิ้นส่วนร่วม ─────────────────────────────────────────────────
function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-6 mb-3 text-xs font-bold tracking-wide text-muted-foreground">
      {children}
    </h3>
  );
}

function F({
  label,
  required,
  hint,
  error,
  wide,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** มือถือ: กินเต็มแถวของกริดสองคอลัมน์ (จอคอมไม่มีผล) */
  wide?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  /* ผูก label กับช่องกรอกให้เอง หลักการเดียวกับ Field ใน ui.tsx */
  const id = useId();
  const kid =
    isValidElement<{ id?: string }>(children) && (children.type === Input || children.type === Select)
      ? cloneElement(children, { id })
      : children;

  return (
    <div className={`pf-f${wide ? " pf-wide" : ""}${className ? ` ${className}` : ""}`}>
      <label htmlFor={id} className="mb-[7px] block text-[12.5px] font-medium text-muted-foreground">
        {label}
        {required && <em className="ml-0.5 text-primary not-italic">*</em>}
      </label>
      {kid}
      {error ? (
        <p className="mt-1.5 text-[12.5px] text-destructive">{error}</p>
      ) : hint ? (
        <p className="pf-hint mt-1.5 text-[11.5px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function formatPhone(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 10);
  if (d.length > 6) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length > 3) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return d;
}

function ageFrom(iso: string) {
  if (!iso) return "";
  /* วันเกิดเป็น yyyy-mm-dd — new Date(iso) จะได้เที่ยงคืน UTC แล้วถอยไปวันก่อนบนเครื่องนอกไทย */
  const b = parseIsoDate(iso);
  const t = bkkNow();
  let a = t.getFullYear() - b.getFullYear();
  const m = t.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a -= 1;
  return a >= 0 ? `${a} ปี` : "";
}

/** เงื่อนไขรหัสผ่านทีละข้อ — รายการติ๊กบนมือถือ (ตรงกับ passwordProblem ด้านล่าง) */
const PW_RULES: { label: string; test: (v: string) => boolean }[] = [
  { label: "อย่างน้อย 8 ตัวอักษร", test: (v) => v.length >= 8 },
  { label: "ตัวพิมพ์ใหญ่", test: (v) => /[A-Z]/.test(v) },
  { label: "ตัวพิมพ์เล็ก", test: (v) => /[a-z]/.test(v) },
  { label: "ตัวเลข", test: (v) => /[0-9]/.test(v) },
  { label: "อักขระพิเศษ เช่น # @ !", test: (v) => /[^A-Za-z0-9]/.test(v) },
];

/** ปุ่มยกเลิก — มือถือคำสั้น "ยกเลิก" ตามต้นแบบ จอคอมคงคำเดิม */
function CancelLabel() {
  return (
    <>
      <span className="max-md:hidden">ยกเลิกการแก้ไข</span>
      <span className="md:hidden">ยกเลิก</span>
    </>
  );
}

/** คืนข้อความบอกว่าขาดอะไร หรือ "" ถ้าผ่าน */
function passwordProblem(v: string) {
  if (v.length < 8) return `ต้องมีอย่างน้อย 8 ตัวอักษร ตอนนี้มี ${v.length} ตัว`;
  if (!/[A-Z]/.test(v)) return "ต้องมีตัวพิมพ์ใหญ่อย่างน้อย 1 ตัว";
  if (!/[a-z]/.test(v)) return "ต้องมีตัวพิมพ์เล็กอย่างน้อย 1 ตัว";
  if (!/[0-9]/.test(v)) return "ต้องมีตัวเลขอย่างน้อย 1 ตัว";
  if (!/[^A-Za-z0-9]/.test(v)) return "ต้องมีอักขระพิเศษอย่างน้อย 1 ตัว เช่น . # / @ !";
  return "";
}

/* ─── แถบเมนูล่าง ───────────────────────────────────────────────── */

/*
 * เลือกเองว่าจะเอาหน้าไหนไว้ช่องไหนของแถบล่างบนมือถือ (เจ้าของสั่ง 25 ก.ย. 2569)
 * เป็นค่าของแต่ละคน ไม่ใช่ค่าตั้งค่าระบบ — เปลี่ยนแล้วมีผลเฉพาะเครื่องนี้และบทบาทนี้
 * เลือกได้เฉพาะหน้าที่บทบาทตัวเองเข้าได้ ไม่มีทางตั้งให้พาข้ามไปหน้าของฝ่ายอื่น
 * ปุ่มกลาง (ลงเวลา) ตรึงไว้ ไม่ให้เปลี่ยน เพราะทุกคนตอกบัตรทุกวัน
 */
function BotnavPane({ onSaved }: { onSaved: (message: string) => void }) {
  const role = useRole();
  const roles = useMyRoles();
  const access = useMenuAccess();
  const route = useApprovalRoute();
  const items = navItemsOf(roles, access, route);
  const prefs = useBotnavPrefs();
  const choices = botnavChoices(items, role);
  const current = botnavOf(prefs, role) ?? botnavDefault(items, role);
  const changed = botnavOf(prefs, role) !== null;
  const used = current.filter(Boolean);
  const full = used.length >= BOTNAV_SLOTS;

  /*
   * กดครั้งเดียวจบ (เจ้าของสั่ง 25 ก.ย. 2569 ให้ใช้ง่าย)
   * กดหน้าที่ยังไม่ได้เลือก = ใส่เข้าช่องว่างช่องแรก · กดหน้าที่เลือกไว้แล้ว = เอาออก
   * เลขบนไอคอนบอกว่าหน้านั้นไปอยู่ช่องที่เท่าไรของแถบ นับจากซ้ายไปขวา
   */
  function toggle(href: string) {
    const next = [...current];
    const at = next.indexOf(href);
    if (at >= 0) {
      next[at] = "";
      setBotnav(role, next);
      onSaved("เอาออกจากแถบเมนูล่างแล้ว");
      return;
    }
    const empty = next.indexOf("");
    if (empty < 0) return;
    next[empty] = href;
    setBotnav(role, next);
    onSaved("เพิ่มเข้าแถบเมนูล่างแล้ว");
  }

  /** ช่องที่เท่าไรของแถบ (นับเฉพาะช่องที่มีของ) — ใช้เป็นเลขบนไอคอน */
  const orderOf = (href: string) => {
    const at = current.indexOf(href);
    return at < 0 ? 0 : current.slice(0, at).filter(Boolean).length + 1;
  };

  return (
    <section className="pf-card glass rounded-[20px] px-4 py-4 sm:px-6 sm:py-[22px]">
      <h2 className="pf-intro text-lg font-semibold">แถบเมนูล่าง</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
        กดเลือกหน้าที่อยากให้อยู่ในแถบล่างบนมือถือ ได้สูงสุด {BOTNAV_SLOTS} หน้า
        <br />
        กดซ้ำที่หน้าเดิมเพื่อเอาออก · ปุ่มกลางเป็นลงเวลาเสมอ
      </p>

      {/* แถบตัวอย่างของจริง — เลือกแล้วเห็นผลทันทีว่าหน้าตาจะเป็นแบบไหน */}
      <div className="mt-4 flex items-end justify-between gap-1 rounded-[18px] bg-muted p-2">
        {[0, 1, -1, 2, 3].map((s) => {
          if (s === -1)
            return (
              <span key="mid" className="flex flex-1 flex-col items-center gap-1 py-1.5">
                <i className="grid size-10 place-items-center rounded-full bg-primary text-white">
                  <ClockIcon className="size-5" strokeWidth={2.3} />
                </i>
                <em className="text-[10.5px] font-semibold not-italic">ลงเวลา</em>
              </span>
            );
          const found = choices.find((c) => c.href === current[s]);
          const Icon = found ? (ICONS[found.icon] ?? HomeIcon) : null;
          return (
            <span key={s} className="flex flex-1 flex-col items-center gap-1 py-1.5 text-muted-foreground">
              {Icon ? <Icon className="size-[19px]" /> : <i className="block size-[19px]" />}
              <em className="w-full truncate px-0.5 text-center text-[10.5px] not-italic">
                {found?.label ?? "ว่าง"}
              </em>
            </span>
          );
        })}
      </div>

      <p className="mt-3.5 text-[12.5px] font-semibold">
        {full ? (
          <span className="text-muted-foreground">
            ครบ {BOTNAV_SLOTS} หน้าแล้ว — กดหน้าที่เลือกไว้เพื่อเอาออกก่อน
          </span>
        ) : (
          <>
            เลือกได้อีก <span className="text-primary">{BOTNAV_SLOTS - used.length}</span> หน้า
          </>
        )}
      </p>

      {/* หน้าที่เลือกได้ — เฉพาะหน้าในเมนูของบทบาทตัวเอง จึงไม่มีทางตั้งให้ข้ามไปหน้าของฝ่ายอื่น */}
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {choices.map((c) => {
          const Icon = ICONS[c.icon] ?? HomeIcon;
          const on = current.includes(c.href);
          return (
            <button
              key={c.href}
              type="button"
              onClick={() => toggle(c.href)}
              aria-pressed={on}
              disabled={!on && full}
              className={`flex flex-col items-center justify-start gap-1.5 rounded-[14px] border px-2 py-3 text-[11.5px] leading-tight font-medium transition-colors disabled:opacity-40 ${
                on ? "border-primary bg-[var(--accent)] text-primary" : "border-border bg-card"
              }`}
            >
              <span className="relative">
                <i
                  className={`grid size-[34px] place-items-center rounded-[11px] ${
                    on ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="size-[18px]" />
                </i>
                {on && (
                  /* เลขบอกลำดับช่องบนแถบ — เห็นได้ทันทีว่าหน้านี้ไปอยู่ตรงไหน */
                  <em className="num absolute -top-1.5 -right-1.5 grid size-[18px] place-items-center rounded-full bg-white text-[10.5px] font-bold text-primary shadow-[0_0_0_1.5px_var(--primary)] not-italic">
                    {orderOf(c.href)}
                  </em>
                )}
              </span>
              <span className="w-full truncate text-center">{c.label}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn glass-thin"
          disabled={!changed}
          onClick={() => {
            resetBotnav(role);
            onSaved("คืนแถบเมนูล่างเป็นค่าตั้งต้นแล้ว");
          }}
        >
          คืนค่าตั้งต้น
        </button>
      </div>
    </section>
  );
}
