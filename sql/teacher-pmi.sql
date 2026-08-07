-- ============================================================
-- 온택 - 강사 개인 회의실 링크(PMI) 방식
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- teacher_zoom 에 pmi_url(개인 회의실 참가 링크) 컬럼 추가.
-- 이 링크가 있으면 수업/레벨테스트가 이 링크로 열립니다(강사가 본인 방 host).
-- ============================================================

alter table public.teacher_zoom add column if not exists pmi_url text;

notify pgrst, 'reload schema';
