-- ============================================================
-- 온택 - 결석계(absences)가 매니저·관리자 창에 안 보이는 문제 해결
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- 원인: absences RLS 에 매니저/관리자 조회 정책이 없어서 그 창엔 0건으로 보임.
-- 조치: 매니저·관리자가 모든 결석계를 조회/처리(승인·거절)할 수 있게 정책 추가.
-- ============================================================

alter table public.absences enable row level security;

drop policy if exists "staff manage absences" on public.absences;
create policy "staff manage absences" on public.absences
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('manager','admin')));

notify pgrst, 'reload schema';

-- 확인: 매니저/관리자 계정으로 로그인 후 결석계 목록이 보이면 완료.
--   (학생·강사 기존 정책은 그대로 유지됩니다.)
-- ============================================================
