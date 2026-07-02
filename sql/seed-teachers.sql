-- ============================================================
-- 온택 - 강사 소개 시드 (메인 화면 강사 카드)
-- 적용: Supabase Dashboard → SQL Editor 에서 실행
--
-- 메인 index.html 은 teachers 테이블에서
--   is_active = true AND show_on_main = true 인 강사를 sort_order 순으로 표시.
-- 카드: display_name / specialties(역할) / rating
-- 모달: bio(소개) / tags(칩)
--
-- 사진(photo_url)은 없이 넣습니다(이니셜 아바타). 이후 총관리자 페이지의
-- 강사 편집에서 photo_url 을 채우면 사진이 표시됩니다.
-- 재실행해도 같은 이름은 중복 생성되지 않습니다.
-- ============================================================

insert into public.teachers
  (id, display_name, specialties, bio, tags, rating, badge, is_active, show_on_main, sort_order)
select gen_random_uuid(), v.display_name, v.specialties, v.bio, v.tags,
       5.0, null, true, true, v.sort_order
from (values
  ('NIKKA',
   'ESL 전문 · 회화·문법',
   '학생 중심의 몰입형 수업으로 영어 소통 능력을 키워 드립니다. 교육학 석사 과정 중이며 대학 강사 경험을 바탕으로 자신감 있는 영어를 만들어 드립니다.',
   array['회화','문법','대학 강사 경력','석사 과정'], 1),
  ('PRECIOUS',
   'ESL 11년 경력 · 키즈~성인',
   '11년간 다양한 연령과 레벨의 학습자를 지도한 ESL 전문 강사입니다. 소통 능력과 자신감을 키우고 영어에 대한 흥미를 심어 드립니다.',
   array['11년 경력','키즈','성인','기초~중급'], 2),
  ('MEL',
   'ESL 7년 경력 · 회화 유창성',
   '7년 경력의 ESL 강사로 학생의 자신감과 말하기 유창성 향상에 집중합니다. 명확한 설명과 안정적인 수업 운영이 강점입니다.',
   array['7년 경력','회화','유창성','키즈·성인'], 3),
  ('ROSE',
   'ESL 8년 경력 · 회화·스토리텔링',
   '8년 경력의 ESL 강사입니다. 토론과 실생활 예시, 스토리텔링·창의 활동으로 즐겁게 몰입하는 수업을 만듭니다.',
   array['8년 경력','회화','Junior TOEFL','스토리텔링'], 4),
  ('GLADYS',
   'ESL 5년 경력 · 재미있는 회화',
   '5년 경력의 ESL 강사입니다. 게임과 실전 대화로 지루하지 않게, 매일 영어를 쓰는 자신감을 키워 드립니다.',
   array['5년 경력','회화','키즈','Junior TOEFL'], 5),
  ('NHANIE',
   'ESL 강사 · 커리큘럼 설계',
   '학생 중심 수업으로 영어 소통 능력을 키워 드립니다. 온라인 ESL 강의와 커리큘럼 설계·팀 관리 경험을 갖춘 강사입니다.',
   array['커리큘럼 설계','회화','키즈','온라인 전문'], 6),
  ('SHAINA',
   'ESL 강사 · 회화·스피킹',
   '학습자의 영어 실력과 자신감 향상에 집중하는 ESL 강사입니다. 효과적이고 몰입감 있는 수업으로 말하기 능력을 키워 드립니다.',
   array['회화','스피킹','중·고등','자신감'], 7)
) as v(display_name, specialties, bio, tags, sort_order)
where not exists (
  select 1 from public.teachers t where t.display_name = v.display_name
);
