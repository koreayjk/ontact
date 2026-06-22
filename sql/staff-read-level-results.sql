-- ============================================================
-- 온택 - 레벨테스트 결과 staff(강사/매니저/관리자) 읽기 권한 RLS
-- 적용 위치: Supabase Dashboard → SQL Editor 에서 실행
-- 목적: teacher.html 의 "📊 레벨테스트 결과" 모달이
--       서면(placement_tests) + 1:1(level_test_results)을 읽을 수 있게 함
-- 안전: 기존 정책과 OR로 합쳐지는 추가(SELECT-only) 정책. 쓰기 권한은 부여하지 않음.
-- ============================================================

-- RLS가 꺼져 있다면 켜기 (이미 켜져 있으면 무시됨)
alter table public.level_test_results enable row level security;
alter table public.placement_tests    enable row level security;

-- 중복 실행 안전을 위해 동일 이름 정책 먼저 제거
drop policy if exists "staff read level_test_results" on public.level_test_results;
drop policy if exists "staff read placement_tests"    on public.placement_tests;

-- 강사/매니저/관리자는 모든 학생의 1:1 결과를 조회 가능
create policy "staff read level_test_results"
  on public.level_test_results
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','admin')
    )
  );

-- 강사/매니저/관리자는 모든 학생의 서면 진단 결과를 조회 가능
create policy "staff read placement_tests"
  on public.placement_tests
  for select
  to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('teacher','manager','admin')
    )
  );

-- 참고: 학생 본인 읽기 정책(student.html 용)은 이미 있다고 가정합니다.
--       없다면 아래도 함께 적용하세요.
-- create policy "student read own level_test_results"
--   on public.level_test_results for select to authenticated
--   using (student_id = auth.uid());
-- create policy "student read own placement_tests"
--   on public.placement_tests for select to authenticated
--   using (student_id = auth.uid());
