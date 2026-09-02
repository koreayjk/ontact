-- ============================================================
-- 온택 - 각 강사 PMI(개인 회의실) 링크 등록
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- teacher_zoom.teacher_id = PK 이므로 upsert(onConflict) 안전.
-- pmi_url 이 있으면 confirm-enrollment 이 이 링크로 수업을 엽니다(강사=host).
-- ※ 링크에 ?pwd=... 가 포함돼 있어 암호는 자동 적용됩니다(별도 저장 불필요).
-- ============================================================

-- Gladys
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us05web.zoom.us/j/6702977833?pwd=NjZVQXFsRXZRQ1d4TkpDSFFvT0ZEdz09'
from public.teachers where display_name = 'Instructor_Gladys'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- Mel
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us05web.zoom.us/j/3671844151?pwd=RG9ZM2pDTnhEeVI4VE9uUHB4WGNxQT09'
from public.teachers where display_name = 'Instructor_Mel'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- Precious
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us05web.zoom.us/j/3776661772?pwd=ZVNVTSs5Q3ludmhGcFliRi92d2Fqdz09'
from public.teachers where display_name = 'Instructor_Precious'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- Rose (동일 이름 2개 행 → 둘 다 같은 링크로 세팅)
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us05web.zoom.us/j/6190081597?pwd=NmZsSFlwR3h6NmJqZVVDbVdqcXlBdz09'
from public.teachers where display_name = 'Instructor_Rose'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- Shaina
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us05web.zoom.us/j/9621165797?pwd=wSqGStlZn1tN3tjX7469kMcbbnBoWg.1'
from public.teachers where display_name = 'Instructor_Shaina'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- Nikka
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us05web.zoom.us/j/6455582713?pwd=a1ZYQ0VaOSt0dTVIaE9LTDBndXUwZz09'
from public.teachers where display_name = 'Instructor_Nikka'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- Nhanie
insert into public.teacher_zoom (teacher_id, pmi_url)
select id, 'https://us04web.zoom.us/j/2515826910?pwd=U7TsvcWd6Gm5UTyhqMVaFb6TvwJZ62.1'
from public.teachers where display_name = 'Instructor_Nhanie'
on conflict (teacher_id) do update set pmi_url = excluded.pmi_url, updated_at = now();

-- 확인: 모든 강사에 pmi_url 이 채워졌는지
select t.display_name, tz.pmi_url
from public.teachers t
left join public.teacher_zoom tz on tz.teacher_id = t.id
order by t.display_name;

notify pgrst, 'reload schema';
