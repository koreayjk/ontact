-- ============================================================
-- 온택 - 학생 예약화면 "등록된 강사가 없습니다" 해결
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- 원인 1) 강사가 비활성(is_active=false)
--      2) teacher_hours 컬럼 불일치(관리자 start_time/end_time ↔ 학생 읽기)
--      3) (경우에 따라) 로그인 학생이 teachers/teacher_hours 읽기 권한 없음
-- ============================================================

-- ── teacher_hours: start_time / end_time 컬럼 보장 ──────────
create table if not exists public.teacher_hours (
  teacher_id uuid primary key,
  start_time text,
  end_time   text,
  is_active  boolean default true
);
alter table public.teacher_hours add column if not exists start_time text;
alter table public.teacher_hours add column if not exists end_time   text;
alter table public.teacher_hours add column if not exists is_active  boolean default true;

-- 레거시(start_hm/end_hm) 데이터가 있으면 start_time/end_time 으로 이관
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='teacher_hours' and column_name='start_hm') then
    update public.teacher_hours set start_time = coalesce(start_time, start_hm::text) where start_time is null;
    update public.teacher_hours set end_time   = coalesce(end_time,   end_hm::text)   where end_time   is null;
  end if;
end $$;

-- ── 읽기 권한(로그인 학생 포함) + 관리자 관리 ──────────────
drop policy if exists "read teacher_hours"         on public.teacher_hours;
create policy "read teacher_hours" on public.teacher_hours
  for select to anon, authenticated using (true);

drop policy if exists "admin manage teacher_hours" on public.teacher_hours;
create policy "admin manage teacher_hours" on public.teacher_hours
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── teachers: 로그인 학생도 읽기 + 전체 활성화 ─────────────
drop policy if exists "public read teachers" on public.teachers;
create policy "public read teachers" on public.teachers
  for select to anon, authenticated using (true);

update public.teachers set is_active = true;

-- ── PostgREST 스키마 캐시 새로고침 ─────────────────────────
notify pgrst, 'reload schema';

-- ============================================================
-- 실행 후 확인용(참고): 강사 목록/시간 상태
--   select t.display_name, t.is_active,
--          h.start_time, h.end_time
--   from public.teachers t
--   left join public.teacher_hours h on h.teacher_id = t.id
--   order by t.display_name;
-- → is_active=true 이고 start_time/end_time 이 채워진 강사가
--   학생 예약화면에 나타납니다.
-- ============================================================
