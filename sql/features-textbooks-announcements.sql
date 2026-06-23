-- ============================================================
-- 온택 - 신규 기능 테이블 (교재 / 공지사항 / 공지 확인기록)
-- 적용: Supabase Dashboard → SQL Editor 에서 실행
-- 대상 기능:
--   #5 교재(textbooks)      : 총관리자가 등록 → 매니저 레벨입력 드롭다운
--   #6 공지(announcements)  : 총관리자가 작성 → 전 역할 로그인 팝업 + 확인추적
--   #7 카톡공유             : (#6의 데이터를 Web Share로 내보내기 — DB 변경 없음)
-- ============================================================

-- ── #5 교재 ───────────────────────────────────────────────
create table if not exists public.textbooks (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  level      text,                       -- CEFR (예: A1, B1) · 선택
  note       text,                       -- 비고(출판사 등) · 선택
  sort       int  default 0,
  active     boolean default true,
  created_at timestamptz default now()
);
alter table public.textbooks enable row level security;

drop policy if exists "anyone read textbooks"  on public.textbooks;
drop policy if exists "admin manage textbooks"  on public.textbooks;

-- 로그인 사용자는 활성 교재 조회 가능(매니저 드롭다운)
create policy "anyone read textbooks" on public.textbooks
  for select to authenticated using (true);
-- 총관리자만 추가/수정/삭제
create policy "admin manage textbooks" on public.textbooks
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check(exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── #6 공지사항 ───────────────────────────────────────────
create table if not exists public.announcements (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  body            text not null,
  audience        text default 'all',    -- all | student | teacher | manager
  active          boolean default true,
  created_by      uuid,
  created_by_name text,
  created_at      timestamptz default now()
);
alter table public.announcements enable row level security;

drop policy if exists "auth read announcements"  on public.announcements;
drop policy if exists "admin manage announcements" on public.announcements;

-- 로그인 사용자는 공지 조회 가능(팝업)
create policy "auth read announcements" on public.announcements
  for select to authenticated using (true);
-- 총관리자만 작성/수정/삭제
create policy "admin manage announcements" on public.announcements
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check(exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── #6 공지 확인기록 ──────────────────────────────────────
create table if not exists public.announcement_reads (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid references public.announcements(id) on delete cascade,
  user_id         uuid,
  user_name       text,
  role            text,
  read_at         timestamptz default now(),
  unique (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;

drop policy if exists "user insert own read"  on public.announcement_reads;
drop policy if exists "user read own read"     on public.announcement_reads;
drop policy if exists "staff read all reads"   on public.announcement_reads;

-- 본인 확인기록 작성
create policy "user insert own read" on public.announcement_reads
  for insert to authenticated with check (user_id = auth.uid());
-- 본인 확인기록 조회
create policy "user read own read" on public.announcement_reads
  for select to authenticated using (user_id = auth.uid());
-- 총관리자/매니저는 누가 확인했는지 전체 조회
create policy "staff read all reads" on public.announcement_reads
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','manager')));

-- ============================================================
-- #8 강사용 학생 명부: 강사는 자기 학생의 enrollments + 결과 조회 필요.
--   · enrollments 는 teacher.html 에서 이미 teacher_id = auth.uid() 로 읽고 있어
--     기존 정책이 있다고 가정합니다. 없다면 아래 주석 해제:
-- drop policy if exists "teacher read own enrollments" on public.enrollments;
-- create policy "teacher read own enrollments" on public.enrollments
--   for select to authenticated using (teacher_id = auth.uid());
--   · 학생 프로필 조회가 막혀 있으면(이름/이메일) 아래도 필요할 수 있습니다:
-- drop policy if exists "staff read student profiles" on public.profiles;
-- create policy "staff read student profiles" on public.profiles
--   for select to authenticated
--   using (exists (select 1 from public.profiles me where me.id = auth.uid() and me.role in ('teacher','manager','admin')));
--   · 레벨/서면 결과는 이전에 적용한 sql/staff-read-level-results.sql 로 이미 열려 있습니다.
-- ============================================================
