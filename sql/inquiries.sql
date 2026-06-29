-- ============================================================
-- 온택 - 수강문의 게시판 (비회원 작성 + 비밀글 + 관리자 답변)
-- 적용: Supabase Dashboard → SQL Editor 에서 실행
--
-- 설계 핵심(보안):
--   · inquiries 테이블은 RLS로 잠그고 익명 직접 SELECT 금지
--     → 비밀글 본문/비밀번호 해시가 외부로 새지 않음
--   · 비회원은 아래 RPC(SECURITY DEFINER)로만 접근
--       - create_inquiry : 글 등록 (비번은 bcrypt 해시로 저장)
--       - list_inquiries : 목록 (이름 마스킹, 비밀글 제목은 '비밀글')
--       - view_inquiry   : 단건 조회 (비밀글이면 비번 확인)
--   · 총관리자(admin)는 RLS 정책으로 전체 열람/답변 가능
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.inquiries (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  phone         text,
  password_hash text not null,
  title         text not null,
  body          text not null default '',
  is_secret     boolean not null default false,
  answer        text,
  answered_at   timestamptz,
  answered_by   uuid,
  status        text not null default 'pending',   -- pending | answered
  created_at    timestamptz default now()
);
alter table public.inquiries enable row level security;

-- 총관리자만 테이블 직접 접근(열람/수정/삭제). 익명/일반은 RPC로만.
drop policy if exists "admin all inquiries" on public.inquiries;
create policy "admin all inquiries" on public.inquiries
  for all to authenticated
  using     (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'));

-- ── 이름 마스킹 헬퍼: 첫 글자만 보이고 나머지는 * ────────────
create or replace function public.mask_name(p text)
returns text language sql immutable as $$
  select case
    when p is null or length(p) = 0 then '비공개'
    when length(p) = 1 then p || '*'
    else left(p, 1) || repeat('*', length(p) - 1)
  end;
$$;

-- ── 글 등록 (비회원 가능) ──────────────────────────────────
create or replace function public.create_inquiry(
  p_name text, p_phone text, p_password text,
  p_title text, p_body text, p_is_secret boolean
) returns uuid
language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if coalesce(length(trim(p_name)),0)  = 0 then raise exception '이름을 입력해 주세요.'; end if;
  if coalesce(length(trim(p_title)),0) = 0 then raise exception '제목을 입력해 주세요.'; end if;
  if coalesce(length(p_password),0)    < 2 then raise exception '비밀번호를 입력해 주세요.'; end if;

  insert into public.inquiries(name, phone, password_hash, title, body, is_secret)
  values (
    trim(p_name), nullif(trim(p_phone),''),
    crypt(p_password, gen_salt('bf')),
    trim(p_title), coalesce(p_body,''), coalesce(p_is_secret, false)
  )
  returning id into new_id;
  return new_id;
end; $$;
grant execute on function public.create_inquiry(text,text,text,text,text,boolean) to anon, authenticated;

-- ── 목록 (마스킹된 안전 필드만 반환) ──────────────────────
create or replace function public.list_inquiries(p_limit int default 50, p_offset int default 0)
returns table(
  id uuid, display_name text, display_title text,
  is_secret boolean, status text, has_answer boolean, created_at timestamptz
)
language sql security definer set search_path = public as $$
  select
    i.id,
    public.mask_name(i.name)                                   as display_name,
    case when i.is_secret then '비밀글' else i.title end       as display_title,
    i.is_secret,
    i.status,
    (i.answer is not null and length(i.answer) > 0)            as has_answer,
    i.created_at
  from public.inquiries i
  order by i.created_at desc
  limit  least(coalesce(p_limit, 50), 100)
  offset coalesce(p_offset, 0);
$$;
grant execute on function public.list_inquiries(int,int) to anon, authenticated;

-- ── 단건 조회 (비밀글이면 비번 확인) ──────────────────────
create or replace function public.view_inquiry(p_id uuid, p_password text default null)
returns table(
  id uuid, name text, title text, body text, is_secret boolean,
  answer text, answered_at timestamptz, status text, created_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare r public.inquiries;
begin
  select * into r from public.inquiries where id = p_id;
  if not found then raise exception '글을 찾을 수 없습니다.'; end if;

  if r.is_secret then
    if p_password is null or r.password_hash <> crypt(p_password, r.password_hash) then
      raise exception '비밀번호가 일치하지 않습니다.';
    end if;
  end if;

  return query select
    r.id,
    public.mask_name(r.name),     -- 조회 시에도 이름은 마스킹 노출
    r.title, r.body, r.is_secret,
    r.answer, r.answered_at, r.status, r.created_at;
end; $$;
grant execute on function public.view_inquiry(uuid,text) to anon, authenticated;

-- 참고: 총관리자 답변은 admin.html 에서 인증된 admin 세션으로
--       update public.inquiries set answer=..., status='answered' ... 로 처리됩니다.
