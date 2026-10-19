-- ERP MAZ · backend รอบที่ 1 — บัญชีผู้ใช้ + ตอกบัตรเข้า/ออก
-- ขอบเขต: ล็อกอิน · โปรไฟล์ · ตอกบัตร (เวลาและรัศมีตรวจที่ฐานข้อมูล) · HR เพิ่มพนักงาน/สร้างบัญชี/ดูเวลาทุกคน
-- ยังไม่มี: ลา · โอที · เบิก · เงินเดือน · เอกสารเข้ารหัส (รอบหลัง)
--
-- หลักสิทธิ์
--   ทุกตารางเปิด RLS · anon ไม่ได้อะไรเลย
--   พนักงานเห็นแค่ของตัวเอง · บทบาท hr เห็นของทุกคน
--   punches เพิ่มได้ทางเดียวคือ clock_punch() — เวลาเป็น now() ของฐานข้อมูล เครื่องผู้ใช้กำหนดไม่ได้
--   user_accounts / audit_log เขียนจากฝั่ง server (secret key) เท่านั้น

-- ─── พนักงาน ───────────────────────────────────────────────────────
create table public.employees (
  id          uuid primary key default gen_random_uuid(),
  /* รหัสพนักงานใช้ภายใน ห้ามแสดงบนหน้าจอ */
  emp_no      text unique,
  first_name  text not null check (length(trim(first_name)) > 0),
  last_name   text not null default '',
  /* ชื่อเล่น — หน้าจอแสดงชื่อนี้ (emp-name.ts displayName) */
  nick        text not null default '',
  sex         text not null default '',
  birth       date,
  /* PosKey ของ hr-data.ts — เวลางานตามตำแหน่งยังคิดในโค้ด (scheduleFor) */
  position    text not null,
  pos_more    text[] not null default '{}',
  emp_type    text not null default 'full' check (emp_type in ('full', 'probat', 'intern')),
  status      text not null default 'active' check (status in ('active', 'left')),
  started_at  date not null,
  left_at     date,
  left_why    text not null default '',
  boss_id     uuid references public.employees (id),
  phone       text not null default '',
  email       text not null default '',
  /* ที่อยู่ไฟล์ใน bucket avatars: <employee id>/<ชื่อไฟล์> */
  photo_path  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  edited_by   uuid
);

create index employees_boss_idx on public.employees (boss_id);

-- ─── บัญชีเข้าระบบ ─────────────────────────────────────────────────
/*
 * ผู้ใช้หนึ่งคน = พนักงานหนึ่งคน · ควบได้สูงสุด 2 บทบาท (HR_MAX_ROLES)
 * อีเมลใน auth.users เป็นอีเมลแฝงที่ server สร้างจากรหัสพนักงาน — ชื่อผู้ใช้จริงอยู่ที่นี่
 * (ชื่อผู้ใช้มีอักษรไทยได้ ตาม suggestUser ใน hr-data.ts จึงใช้เป็นอีเมลตรง ๆ ไม่ได้)
 */
create table public.user_accounts (
  user_id               uuid primary key references auth.users (id) on delete cascade,
  employee_id           uuid not null unique references public.employees (id) on delete restrict,
  username              text not null check (username ~ '^[^\s@]{2,40}$'),
  roles                 text[] not null check (
                          cardinality(roles) between 1 and 2
                          and roles <@ array['sales', 'ps', 'pm', 'acc', 'hr', 'staff', 'gm', 'ceo', 'intern', 'maid']
                        ),
  status                text not null default 'active' check (status in ('active', 'suspended')),
  suspended_why         text not null default '',
  suspended_at          timestamptz,
  /* บัญชีใหม่และบัญชีที่ HR รีเซ็ตรหัส ต้องตั้งรหัสใหม่ก่อนใช้งาน */
  must_change_password  boolean not null default true,
  failed_attempts       int not null default 0,
  last_login_at         timestamptz,
  created_at            timestamptz not null default now(),
  created_by            uuid
);

create unique index user_accounts_username_key on public.user_accounts (lower(username));

-- ─── พื้นที่ทำงาน (geofence) ───────────────────────────────────────
create table public.work_areas (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  lat         double precision not null check (lat between -90 and 90),
  lng         double precision not null check (lng between -180 and 180),
  /* RADIUS_MIN / RADIUS_MAX ใน work-area.ts */
  radius_m    int not null check (radius_m between 30 and 5000),
  address     text not null default '',
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

/* ใช้จุดเดียว (keepOne ใน work-area.ts) — เปิดได้ทีละหนึ่งจุด */
create unique index work_areas_one_active on public.work_areas (active) where active;

-- ─── การตอกบัตร ────────────────────────────────────────────────────
create table public.punches (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references public.employees (id),
  type         text not null check (type in ('in', 'out')),
  at           timestamptz not null default now(),
  /* วันตามปฏิทินไทย — ตอกสี่ทุ่มต้องลงวันนั้น (dayKey ใน attendance.ts) */
  work_date    date not null,
  lat          double precision,
  lng          double precision,
  acc          real,
  geo_status   text check (geo_status in ('inside', 'outside', 'weak', 'nogps', 'off')),
  area_id      uuid references public.work_areas (id),
  area_name    text,
  dist_m       int,
  note         text not null default '' check (length(note) <= 500),
  created_by   uuid
);

create index punches_emp_at_idx on public.punches (employee_id, at desc);
create index punches_day_idx on public.punches (work_date);

-- ─── บันทึกการกระทำของ HR / ระบบ ───────────────────────────────────
create table public.audit_log (
  id      bigint generated always as identity primary key,
  actor   uuid,
  action  text not null,
  target  uuid,
  detail  jsonb not null default '{}',
  at      timestamptz not null default now()
);

create index audit_log_at_idx on public.audit_log (at desc);

-- ─── updated_at ───────────────────────────────────────────────────
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger employees_touch before update on public.employees
  for each row execute function public.touch_updated_at();
create trigger work_areas_touch before update on public.work_areas
  for each row execute function public.touch_updated_at();

-- ─── ตัวช่วยของ RLS ────────────────────────────────────────────────
/* security definer เพื่ออ่าน user_accounts ได้โดยไม่วนเข้า policy ของตัวเอง */
create function public.my_employee_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select a.employee_id
  from public.user_accounts a
  join public.employees e on e.id = a.employee_id
  where a.user_id = auth.uid() and a.status = 'active' and e.status = 'active'
$$;

create function public.has_role(r text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.user_accounts a
    join public.employees e on e.id = a.employee_id
    where a.user_id = auth.uid() and a.status = 'active' and e.status = 'active' and r = any (a.roles)
  )
$$;

-- ─── RLS ──────────────────────────────────────────────────────────
alter table public.employees     enable row level security;
alter table public.user_accounts enable row level security;
alter table public.work_areas    enable row level security;
alter table public.punches       enable row level security;
alter table public.audit_log     enable row level security;

/* Supabase ให้สิทธิ์ตารางใน public กับ anon/authenticated ไว้ตั้งต้น — ถอนออกแล้วให้เฉพาะที่ต้องใช้ */
revoke all on public.employees, public.user_accounts, public.work_areas, public.punches, public.audit_log
  from anon, authenticated;

grant select, insert, update on public.employees to authenticated;
grant select on public.user_accounts to authenticated;
grant select, insert, update on public.work_areas to authenticated;
grant select on public.punches to authenticated;
grant select on public.audit_log to authenticated;

create policy employees_read on public.employees for select to authenticated
  using (id = public.my_employee_id() or public.has_role('hr'));
create policy employees_hr_insert on public.employees for insert to authenticated
  with check (public.has_role('hr'));
create policy employees_hr_update on public.employees for update to authenticated
  using (public.has_role('hr')) with check (public.has_role('hr'));

create policy accounts_read on public.user_accounts for select to authenticated
  using (user_id = auth.uid() or public.has_role('hr'));

create policy areas_read on public.work_areas for select to authenticated
  using (true);
create policy areas_hr_insert on public.work_areas for insert to authenticated
  with check (public.has_role('hr'));
create policy areas_hr_update on public.work_areas for update to authenticated
  using (public.has_role('hr')) with check (public.has_role('hr'));

create policy punches_read on public.punches for select to authenticated
  using (employee_id = public.my_employee_id() or public.has_role('hr'));

create policy audit_hr_read on public.audit_log for select to authenticated
  using (public.has_role('hr'));

-- ─── ตอกบัตร ───────────────────────────────────────────────────────
/*
 * ทางเดียวที่เพิ่มการตอกบัตรได้ — เรียกด้วย JWT ของผู้ใช้ (supabase.rpc('clock_punch', ...))
 * เข้างาน: ต้องส่งพิกัด · อยู่ในรัศมีเท่านั้น (ผู้ใช้ยืนยัน 19 ต.ค. 2569)
 *          นอกรัศมีแต่ GPS คลาดเกิน 100 ม. (MAX_ACCURACY) → weak ให้ลองใหม่ ไม่กล่าวหาว่าอยู่นอก
 * ออกงาน: ไม่ตรวจพิกัด (ผู้ใช้ยืนยัน 19 ต.ค. 2569)
 * ลำดับ: เข้าได้เมื่อไม่ได้กำลังทำงาน · ลืมออกงานของวันก่อนไม่ขวางการเข้างานวันนี้
 *        ออกได้เมื่อเข้างานไว้ในวันเดียวกัน
 * ผล: jsonb { ok: true, punch } หรือ { ok: false, reason, dist?, area?, radius? }
 */
create function public.clock_punch(
  p_type text,
  p_lat  double precision default null,
  p_lng  double precision default null,
  p_acc  double precision default null,
  p_note text default ''
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_emp   uuid := public.my_employee_id();
  v_at    timestamptz := clock_timestamp();
  v_day   date := (clock_timestamp() at time zone 'Asia/Bangkok')::date;
  v_last  public.punches;
  v_area  public.work_areas;
  v_dist  double precision;
  v_row   public.punches;
begin
  if v_emp is null then
    return jsonb_build_object('ok', false, 'reason', 'no_account');
  end if;
  if p_type is null or p_type not in ('in', 'out') then
    return jsonb_build_object('ok', false, 'reason', 'bad_type');
  end if;

  /* กดซ้ำสองแท็บพร้อมกันต้องได้รายการเดียว */
  perform pg_advisory_xact_lock(hashtext('punch:' || v_emp::text));

  select * into v_last from public.punches
  where employee_id = v_emp order by at desc limit 1;

  if p_type = 'in' then
    if v_last.type = 'in' and v_last.work_date = v_day then
      return jsonb_build_object('ok', false, 'reason', 'already_in');
    end if;
    if p_lat is null or p_lng is null or p_acc is null
       or p_lat not between -90 and 90 or p_lng not between -180 and 180 or p_acc < 0 then
      return jsonb_build_object('ok', false, 'reason', 'nogps');
    end if;

    select * into v_area from public.work_areas where active limit 1;
    if v_area.id is null then
      return jsonb_build_object('ok', false, 'reason', 'no_area');
    end if;

    /* haversine — สูตรเดียวกับ distanceM ใน work-area.ts */
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(p_lat - v_area.lat) / 2), 2)
      + cos(radians(v_area.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_area.lng) / 2), 2)
    ));

    if v_dist > v_area.radius_m then
      return jsonb_build_object(
        'ok', false,
        'reason', case when p_acc > 100 then 'weak' else 'outside' end,
        'dist', round(v_dist),
        'area', v_area.name,
        'radius', v_area.radius_m
      );
    end if;

    insert into public.punches (employee_id, type, at, work_date, lat, lng, acc, geo_status, area_id, area_name, dist_m, note, created_by)
    values (v_emp, 'in', v_at, v_day, p_lat, p_lng, round(p_acc), 'inside', v_area.id, v_area.name, round(v_dist), left(coalesce(p_note, ''), 500), auth.uid())
    returning * into v_row;
  else
    if v_last.id is null or v_last.type <> 'in' or v_last.work_date <> v_day then
      return jsonb_build_object('ok', false, 'reason', 'not_in');
    end if;

    insert into public.punches (employee_id, type, at, work_date, note, created_by)
    values (v_emp, 'out', v_at, v_day, left(coalesce(p_note, ''), 500), auth.uid())
    returning * into v_row;
  end if;

  return jsonb_build_object('ok', true, 'punch', to_jsonb(v_row));
end $$;

-- ─── นับรหัสผิด (เรียกจาก server ด้วย secret key เท่านั้น) ──────────
/* ผิดครบ 5 ครั้ง (MAX_TRIES ใน login-form.tsx) → ระงับบัญชี · คืนจำนวนครั้งที่ผิดและสถานะ */
create function public.register_login_failure(p_username text) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v public.user_accounts;
begin
  update public.user_accounts
  set failed_attempts = failed_attempts + 1,
      status = case when failed_attempts + 1 >= 5 then 'suspended' else status end,
      suspended_why = case when failed_attempts + 1 >= 5 and status = 'active' then 'ใส่รหัสผ่านผิดเกินกำหนด' else suspended_why end,
      suspended_at = case when failed_attempts + 1 >= 5 and status = 'active' then now() else suspended_at end
  where lower(username) = lower(p_username)
  returning * into v;

  if v.user_id is null then
    return jsonb_build_object('found', false);
  end if;
  if v.status = 'suspended' and v.failed_attempts = 5 then
    insert into public.audit_log (actor, action, target, detail)
    values (null, 'account.locked', v.user_id, jsonb_build_object('attempts', v.failed_attempts));
  end if;
  return jsonb_build_object('found', true, 'user_id', v.user_id, 'attempts', v.failed_attempts, 'status', v.status);
end $$;

create function public.register_login_success(p_user uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.user_accounts set failed_attempts = 0, last_login_at = now() where user_id = p_user
$$;

-- ─── สิทธิ์เรียกฟังก์ชัน ───────────────────────────────────────────
revoke execute on all functions in schema public from public, anon;
grant execute on function public.my_employee_id() to authenticated;
grant execute on function public.has_role(text) to authenticated;
grant execute on function public.clock_punch(text, double precision, double precision, double precision, text) to authenticated;
revoke execute on function public.register_login_failure(text) from authenticated;
revoke execute on function public.register_login_success(uuid) from authenticated;
grant execute on function public.register_login_failure(text) to service_role;
grant execute on function public.register_login_success(uuid) to service_role;

-- ─── ใส่บทบาทลงใน JWT (Custom Access Token Hook) ────────────────────
/*
 * proxy.ts ใช้ค่านี้พาไปหน้าตั้งรหัสใหม่ / กันหน้าตามบทบาท โดยไม่ต้องอ่านฐานข้อมูลทุกครั้ง
 * ค่าใน token ใช้นำทางเท่านั้น — สิทธิ์จริงตัดสินที่ RLS ซึ่งอ่านตารางสด
 * เปิดใช้ที่ Dashboard → Authentication → Hooks → Customize Access Token → public.custom_access_token_hook
 */
create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
declare
  v_claims jsonb := coalesce(event -> 'claims', '{}');
  v public.user_accounts;
begin
  select * into v from public.user_accounts where user_id = (event ->> 'user_id')::uuid;
  if v.user_id is null then
    v_claims := v_claims - 'app';
  else
    v_claims := jsonb_set(v_claims, '{app}', jsonb_build_object(
      'emp', v.employee_id,
      'roles', to_jsonb(v.roles),
      'must_change', v.must_change_password,
      'status', v.status
    ));
  end if;
  return jsonb_set(event, '{claims}', v_claims);
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on public.user_accounts to supabase_auth_admin;
create policy accounts_auth_hook on public.user_accounts for select to supabase_auth_admin
  using (true);

-- ─── รูปโปรไฟล์ ────────────────────────────────────────────────────
/* bucket ส่วนตัว — เปิดด้วย signed URL · โฟลเดอร์แรกของไฟล์คือรหัสพนักงานเจ้าของ */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']);

create policy avatars_read on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (
    (storage.foldername(name))[1] = public.my_employee_id()::text or public.has_role('hr')
  ));
create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_employee_id()::text);
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_employee_id()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_employee_id()::text);
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = public.my_employee_id()::text);

-- ─── ที่ทำงาน ──────────────────────────────────────────────────────
/* พิกัดและรัศมีที่ผู้ใช้ให้มา 19 ต.ค. 2569 — HR แก้ได้ภายหลัง */
insert into public.work_areas (name, lat, lng, radius_m)
values ('บริษัท ไอเมซเมกเกอร์ iMazmaker จำกัด MAZ (MAZMAKER)', 18.7515551, 99.0151536, 100);
