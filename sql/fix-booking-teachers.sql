-- ============================================================
-- 온택 - 학생 예약화면 "등록된 강사가 없습니다" 해결
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- 실제 teacher_hours 컬럼은 start_hm / end_hm 입니다.
--   · 코드(관리자 저장 / 학생 읽기)는 start_hm/end_hm 으로 통일했습니다.
--   · 아래는 권한(RLS) 보강 + 강사 활성화만 처리합니다.
-- ============================================================

-- 로그인 학생도 강사/시간 읽기 가능하도록
drop policy if exists "public read teachers" on public.teachers;
create policy "public read teachers" on public.teachers
  for select to anon, authenticated using (true);

drop policy if exists "read teacher_hours" on public.teacher_hours;
create policy "read teacher_hours" on public.teacher_hours
  for select to anon, authenticated using (true);

-- 총관리자가 시간 저장(쓰기) 가능하도록
drop policy if exists "admin manage teacher_hours" on public.teacher_hours;
create policy "admin manage teacher_hours" on public.teacher_hours
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- 등록된 강사 전체 활성화(학생 화면 표시)
update public.teachers set is_active = true;

notify pgrst, 'reload schema';

-- ============================================================
-- 확인용 쿼리 (컬럼명 start_hm / end_hm 사용)
--   select t.display_name, t.is_active, h.start_hm, h.end_hm
--   from public.teachers t
--   left join public.teacher_hours h on h.teacher_id = t.id
--   order by t.display_name;
-- → is_active=true 이고 start_hm/end_hm 이 채워진 강사가 예약화면에 표시됩니다.
--   시간이 비어(null) 있으면 관리자 "강사 가능 시간 범위"에서 저장하세요.
-- ============================================================
