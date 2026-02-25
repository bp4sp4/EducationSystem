-- ============================
-- 교육원 통합 관리 시스템 스키마
-- ============================

-- Profiles (auth.users 확장)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  name text not null,
  role text not null default 'admin' check (role in ('super_admin', 'admin')),
  created_at timestamptz default now()
);

-- 교육원 (확장 가능)
create table public.education_centers (
  id serial primary key,
  name text not null,
  created_at timestamptz default now()
);

insert into public.education_centers (name) values
  ('한평생교육'),
  ('서사평'),
  ('올티칭');

-- 과정 (확장 가능)
create table public.courses (
  id serial primary key,
  name text not null,
  created_at timestamptz default now()
);

insert into public.courses (name) values
  ('사회복지사 2급 (신법)'),
  ('사회복지사 2급 (구법)');

-- 학생
create table public.students (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  phone text,
  education_level text check (education_level in ('고등학교졸업', '전문대졸업', '대학교재학', '대학교졸업')),
  status text not null default '등록' check (status in ('등록', '수료')),
  course_id integer references public.courses(id),
  manager_name text,
  cost numeric,
  class_start text,
  target_completion_date date,
  education_center_name text,
  all_care boolean default false,
  notes text,
  registered_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS 활성화
alter table public.profiles enable row level security;
alter table public.education_centers enable row level security;
alter table public.courses enable row level security;
alter table public.students enable row level security;

-- Profiles 정책
create policy "본인 프로필 조회" on public.profiles
  for select using (auth.uid() = id);

create policy "슈퍼관리자 전체 조회" on public.profiles
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- 교육원 정책 (인증된 유저 전체 읽기, 슈퍼관리자 쓰기)
create policy "인증된 유저 교육원 조회" on public.education_centers
  for select to authenticated using (true);

create policy "슈퍼관리자 교육원 수정" on public.education_centers
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- 과정 정책
create policy "인증된 유저 과정 조회" on public.courses
  for select to authenticated using (true);

create policy "슈퍼관리자 과정 수정" on public.courses
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- 학생 정책
create policy "인증된 유저 학생 조회" on public.students
  for select to authenticated using (true);

create policy "인증된 유저 학생 등록" on public.students
  for insert to authenticated with check (true);

create policy "인증된 유저 학생 수정" on public.students
  for update to authenticated using (true);

create policy "슈퍼관리자 학생 삭제" on public.students
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- 가입 시 자동으로 profiles 생성하는 트리거
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'admin')
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
