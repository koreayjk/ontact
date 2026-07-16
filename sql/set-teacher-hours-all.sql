-- ============================================================
-- 온택 - 모든 강사에게 동일한 가능 시간 일괄 적용
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- 정규 시간표 전체(필리핀 09:00 첫 교시 ~ 19:50 마지막 교시, 20:10 종료)를
-- 모두 포함하도록, 모든 강사의 가능 시간을 필리핀 시간 09:00~20:10 로 설정.
-- (학생 화면엔 각자 로컬 시간으로 자동 변환되어, 점심/저녁 사이 교시까지 전부 노출)
-- ============================================================

insert into public.teacher_hours (teacher_id, start_hm, end_hm)
select id, '09:00', '20:10' from public.teachers
on conflict (teacher_id) do update
  set start_hm = excluded.start_hm,
      end_hm   = excluded.end_hm;

notify pgrst, 'reload schema';

-- 확인:
--   select t.display_name, t.is_active, h.start_hm, h.end_hm
--   from public.teachers t
--   left join public.teacher_hours h on h.teacher_id = t.id
--   order by t.display_name;
-- → 모든 강사 start_hm=09:00, end_hm=20:10 로 채워지면 완료.
-- ============================================================
