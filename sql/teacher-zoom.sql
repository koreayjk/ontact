-- ============================================================
-- 온택 - 강사 줌 키 테이블 (teacher_zoom) 스키마 정리
-- 적용: Supabase Dashboard → SQL Editor 에서 실행
--
-- 증상: admin.html "강사 줌 키 등록" 저장 시
--   "Could not find the 'zoom_account_id' column of 'teacher_zoom'..."
-- 원인: teacher_zoom 테이블이 없거나, 컬럼명이 달라서 발생.
-- 조치: 아래를 실행하면 (없으면 생성 / 있으면 컬럼·제약 보강) 됩니다.
--       여러 번 실행해도 안전합니다.
-- ============================================================

-- 1) 테이블 없으면 생성 (teacher_id 를 PK 로 → upsert onConflict 대상)
create table if not exists public.teacher_zoom (
  teacher_id         uuid primary key,
  zoom_account_id    text,
  zoom_client_id     text,
  zoom_client_secret text,
  updated_at         timestamptz default now()
);

-- 2) 이미 있던 테이블이면 누락 컬럼 보강
alter table public.teacher_zoom add column if not exists zoom_account_id    text;
alter table public.teacher_zoom add column if not exists zoom_client_id     text;
alter table public.teacher_zoom add column if not exists zoom_client_secret text;
alter table public.teacher_zoom add column if not exists updated_at         timestamptz default now();

-- 3) teacher_id 에 유니크 제약이 없으면 추가 (upsert onConflict:"teacher_id" 용)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.teacher_zoom'::regclass
      and contype in ('p','u')
  ) then
    alter table public.teacher_zoom add constraint teacher_zoom_teacher_id_key unique (teacher_id);
  end if;
end $$;

-- 4) RLS: 총관리자만 관리. (줌 미팅 생성 Edge Function 은 서비스롤로 RLS 우회)
alter table public.teacher_zoom enable row level security;

drop policy if exists "admin manage teacher_zoom" on public.teacher_zoom;
create policy "admin manage teacher_zoom" on public.teacher_zoom
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- (선택) 강사가 자기 키 존재 여부만 확인해야 하면 아래 주석 해제
-- drop policy if exists "teacher read own zoom" on public.teacher_zoom;
-- create policy "teacher read own zoom" on public.teacher_zoom
--   for select to authenticated using (teacher_id = auth.uid());

-- 5) PostgREST 스키마 캐시 새로고침 (컬럼 인식 오류 방지)
notify pgrst, 'reload schema';
