-- ============================================================
-- 온택 - 수업 차단(블록) 기능: blocked_slots 테이블
-- 적용: Supabase Dashboard → SQL Editor 에서 실행 (재실행 안전)
--
-- 관리자가 특정 강사(또는 전체 강사=teacher_id NULL)의 시간대를
-- 매주 반복으로 예약 불가로 막습니다. 학생 예약화면에서 해당 슬롯 제외.
--   slot_hm : 필리핀 시간 'HH:MM' (정규 시간표 값)
--   teacher_id : NULL = 모든 강사(단체수업 시간), 값 = 특정 강사
-- ============================================================

create table if not exists public.blocked_slots (
  id         bigint generated always as identity primary key,
  teacher_id uuid,
  slot_hm    text not null,
  created_at timestamptz default now()
);

-- 중복 방지 (NULL도 하나로 취급: PG15+)
do $$
begin
  begin
    alter table public.blocked_slots
      add constraint blocked_slots_uniq unique nulls not distinct (teacher_id, slot_hm);
  exception when duplicate_object then null;
           when others then null;  -- 구버전 등에서 실패해도 무시(코드에서 중복 체크함)
  end;
end $$;

alter table public.blocked_slots enable row level security;

-- 학생(로그인/비로그인) 읽기
drop policy if exists "read blocked_slots" on public.blocked_slots;
create policy "read blocked_slots" on public.blocked_slots
  for select to anon, authenticated using (true);

-- 총관리자만 추가/삭제
drop policy if exists "admin manage blocked_slots" on public.blocked_slots;
create policy "admin manage blocked_slots" on public.blocked_slots
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

notify pgrst, 'reload schema';
