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
  education_level text check (education_level in ('고졸', '2년제중퇴', '2년제졸업', '3년제중퇴', '3년제졸업', '4년제중퇴', '4년제졸업')),
  major text,
  desired_degree text check (desired_degree in ('없음', '전문학사', '학사')),
  status text not null default '등록' check (status in ('등록', '수료', '환불', '삭제예정')),
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

-- ============================
-- 활동 로그
-- ============================

create table public.activity_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  user_name text not null,
  action text not null,
  target_type text,
  target_name text,
  detail text,
  created_at timestamptz default now()
);

alter table public.activity_logs enable row level security;

create policy "인증된 유저 로그 등록" on public.activity_logs
  for insert to authenticated with check (true);

create policy "슈퍼관리자 로그 조회" on public.activity_logs
  for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- ============================
-- 학점이수내역
-- ============================

create table public.student_credit_history (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.students(id) on delete cascade not null,
  subject_name text not null,
  credits numeric not null,
  institution text,
  completed_date date,
  created_at timestamptz default now()
);

alter table public.student_credit_history enable row level security;

create policy "인증된 유저 학점이수내역 전체" on public.student_credit_history
  for all to authenticated using (true) with check (true);

-- ============================
-- 성적 증명서 (파일 메타데이터)
-- ============================

create table public.student_documents (
  id uuid default gen_random_uuid() primary key,
  student_id uuid references public.students(id) on delete cascade not null,
  file_name text not null,
  file_path text not null,
  file_size integer,
  doc_type text not null default 'transcript', -- 'credit_history' | 'transcript'
  created_at timestamptz default now()
);

alter table public.student_documents enable row level security;

create policy "인증된 유저 문서 전체" on public.student_documents
  for all to authenticated using (true) with check (true);

-- ============================
-- 과목 프리셋 (구법/신법 기본 과목 목록)
-- ============================

create table public.subject_presets (
  id serial primary key,
  course_type text not null check (course_type in ('구법', '신법')),
  name text not null,
  credits integer not null default 3,
  subject_type text not null check (subject_type in ('필수', '선택')),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table public.subject_presets enable row level security;

create policy "인증된 유저 프리셋 조회" on public.subject_presets
  for select to authenticated using (true);

create policy "슈퍼관리자 프리셋 수정" on public.subject_presets
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- 구법 필수과목
insert into public.subject_presets (course_type, name, credits, subject_type, sort_order) values
  ('구법', '사회복지개론',        3, '필수', 1),
  ('구법', '인간행동과 사회환경',  3, '필수', 2),
  ('구법', '사회복지정책론',      3, '필수', 3),
  ('구법', '사회복지법제',        3, '필수', 4),
  ('구법', '사회복지실천론',      3, '필수', 5),
  ('구법', '사회복지실천기술론',   3, '필수', 6),
  ('구법', '사회복지조사론',      3, '필수', 7),
  ('구법', '사회복지행정론',      3, '필수', 8),
  ('구법', '지역사회복지론',      3, '필수', 9),
  ('구법', '사회복지현장실습',     3, '필수', 10);

-- 구법 선택과목
insert into public.subject_presets (course_type, name, credits, subject_type, sort_order) values
  ('구법', '아동복지론',          3, '선택', 11),
  ('구법', '청소년복지론',        3, '선택', 12),
  ('구법', '노인복지론',          3, '선택', 13),
  ('구법', '장애인복지론',        3, '선택', 14),
  ('구법', '여성복지론',          3, '선택', 15),
  ('구법', '가족복지론',          3, '선택', 16),
  ('구법', '산업복지론',          3, '선택', 17),
  ('구법', '의료사회사업론',       3, '선택', 18),
  ('구법', '학교사회사업론',       3, '선택', 19),
  ('구법', '정신건강론',          3, '선택', 20),
  ('구법', '교정복지론',          3, '선택', 21),
  ('구법', '사회보장론',          3, '선택', 22),
  ('구법', '사회문제론',          3, '선택', 23),
  ('구법', '자원봉사론',          3, '선택', 24),
  ('구법', '정신보건사회복지론',   3, '선택', 25),
  ('구법', '사회복지지도감독론',   3, '선택', 26),
  ('구법', '사회복지자료분석론',   3, '선택', 27),
  ('구법', '프로그램 개발과 평가', 3, '선택', 28),
  ('구법', '사회복지발달사',       3, '선택', 29),
  ('구법', '사회복지윤리와 철학',  3, '선택', 30);

-- 신법 필수과목
insert into public.subject_presets (course_type, name, credits, subject_type, sort_order) values
  ('신법', '사회복지학개론',       3, '필수', 1),
  ('신법', '사회복지법제와 실천',  3, '필수', 2),
  ('신법', '사회복지실천기술론',   3, '필수', 3),
  ('신법', '사회복지실천론',       3, '필수', 4),
  ('신법', '사회복지정책론',       3, '필수', 5),
  ('신법', '사회복지조사론',       3, '필수', 6),
  ('신법', '사회복지행정론',       3, '필수', 7),
  ('신법', '사회복지현장실습',     3, '필수', 8),
  ('신법', '인간행동과 사회환경',  3, '필수', 9),
  ('신법', '지역사회복지론',       3, '필수', 10);

-- 신법 선택과목
insert into public.subject_presets (course_type, name, credits, subject_type, sort_order) values
  ('신법', '사회복지학개론',       3, '선택', 11),
  ('신법', '사회복지법제와 실천',  3, '선택', 12),
  ('신법', '사회복지실천기술론',   3, '선택', 13),
  ('신법', '사회복지실천론',       3, '선택', 14),
  ('신법', '사회복지정책론',       3, '선택', 15),
  ('신법', '사회복지조사론',       3, '선택', 16),
  ('신법', '사회복지행정론',       3, '선택', 17),
  ('신법', '사회복지현장실습',     3, '선택', 18),
  ('신법', '인간행동과 사회환경',  3, '선택', 19),
  ('신법', '지역사회복지론',       3, '선택', 20);

-- ============================
-- 독학사 프리셋
-- ============================

create table public.dokaksa_presets (
  id serial primary key,
  stage text not null check (stage in ('1단계', '2단계', '3단계', '4단계')),
  category text not null default '교양',
  name text not null,
  credits integer not null default 4,
  subject_type text not null check (subject_type in ('필수', '선택', '전공')),
  sort_order integer not null default 0,
  created_at timestamptz default now()
);

alter table public.dokaksa_presets enable row level security;

create policy "인증된 유저 독학사프리셋 조회" on public.dokaksa_presets
  for select to authenticated using (true);

create policy "슈퍼관리자 독학사프리셋 수정" on public.dokaksa_presets
  for all using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin')
  );

-- 1단계 교양 필수
insert into public.dokaksa_presets (stage, category, name, credits, subject_type, sort_order) values
  ('1단계', '교양', '국어',           4, '필수', 1),
  ('1단계', '교양', '국사',           4, '필수', 2),
  ('1단계', '교양', '외국어(영어)',    4, '필수', 3),
  ('1단계', '교양', '외국어(독일어)',  4, '필수', 4),
  ('1단계', '교양', '외국어(프랑스어)',4, '필수', 5),
  ('1단계', '교양', '외국어(중국어)',  4, '필수', 6),
  ('1단계', '교양', '외국어(일본어)',  4, '필수', 7);

-- 1단계 교양 선택
insert into public.dokaksa_presets (stage, category, name, credits, subject_type, sort_order) values
  ('1단계', '교양', '현대사회와 윤리', 4, '선택', 10),
  ('1단계', '교양', '문학개론',       4, '선택', 11),
  ('1단계', '교양', '철학의 이해',    4, '선택', 12),
  ('1단계', '교양', '문화사',         4, '선택', 13),
  ('1단계', '교양', '한문',           4, '선택', 14),
  ('1단계', '교양', '법학개론',       4, '선택', 15),
  ('1단계', '교양', '경제학개론',     4, '선택', 16),
  ('1단계', '교양', '경영학개론',     4, '선택', 17),
  ('1단계', '교양', '사회학개론',     4, '선택', 18),
  ('1단계', '교양', '심리학개론',     4, '선택', 19),
  ('1단계', '교양', '교육학개론',     4, '선택', 20),
  ('1단계', '교양', '자연과학의 이해',4, '선택', 21),
  ('1단계', '교양', '일반수학',       4, '선택', 22),
  ('1단계', '교양', '기초통계학',     4, '선택', 23),
  ('1단계', '교양', '컴퓨터의 이해',  4, '선택', 24);

-- 2단계 전공과목 (학과별, 각 5학점)
insert into public.dokaksa_presets (stage, category, name, credits, subject_type, sort_order) values
  -- 국어국문학
  ('2단계', '국어국문학', '국어학개론',     5, '전공', 1),
  ('2단계', '국어국문학', '국어문법론',     5, '전공', 2),
  ('2단계', '국어국문학', '국문학개론',     5, '전공', 3),
  ('2단계', '국어국문학', '국어사',         5, '전공', 4),
  ('2단계', '국어국문학', '고전소설론',     5, '전공', 5),
  ('2단계', '국어국문학', '한국현대시론',   5, '전공', 6),
  ('2단계', '국어국문학', '한국현대소설론', 5, '전공', 7),
  ('2단계', '국어국문학', '한국현대희곡론', 5, '전공', 8),
  -- 영어영문학
  ('2단계', '영어영문학', '영어학개론',     5, '전공', 1),
  ('2단계', '영어영문학', '영국문학개관',   5, '전공', 2),
  ('2단계', '영어영문학', '중급영어',       5, '전공', 3),
  ('2단계', '영어영문학', '19세기영미소설', 5, '전공', 4),
  ('2단계', '영어영문학', '영미희곡',       5, '전공', 5),
  ('2단계', '영어영문학', '영어음성학',     5, '전공', 6),
  ('2단계', '영어영문학', '영문법',         5, '전공', 7),
  ('2단계', '영어영문학', '19세기영미시',   5, '전공', 8),
  -- 심리학
  ('2단계', '심리학', '이상심리학',         5, '전공', 1),
  ('2단계', '심리학', '감각및지각심리학',   5, '전공', 2),
  ('2단계', '심리학', '사회심리학',         5, '전공', 3),
  ('2단계', '심리학', '생물심리학',         5, '전공', 4),
  ('2단계', '심리학', '발달심리학',         5, '전공', 5),
  ('2단계', '심리학', '성격심리학',         5, '전공', 6),
  ('2단계', '심리학', '동기와정서',         5, '전공', 7),
  ('2단계', '심리학', '심리통계',           5, '전공', 8),
  -- 경영학
  ('2단계', '경영학', '회계원리',           5, '전공', 1),
  ('2단계', '경영학', '인적자원관리',       5, '전공', 2),
  ('2단계', '경영학', '마케팅원론',         5, '전공', 3),
  ('2단계', '경영학', '조직행동론',         5, '전공', 4),
  ('2단계', '경영학', '경영정보론',         5, '전공', 5),
  ('2단계', '경영학', '마케팅조사',         5, '전공', 6),
  ('2단계', '경영학', '생산운영관리',       5, '전공', 7),
  ('2단계', '경영학', '원가관리회계',       5, '전공', 8),
  -- 법학
  ('2단계', '법학', '민법1',   5, '전공', 1),
  ('2단계', '법학', '민법2',   5, '전공', 2),
  ('2단계', '법학', '헌법1',   5, '전공', 3),
  ('2단계', '법학', '헌법2',   5, '전공', 4),
  ('2단계', '법학', '형법1',   5, '전공', 5),
  ('2단계', '법학', '형법2',   5, '전공', 6),
  ('2단계', '법학', '상법1',   5, '전공', 7),
  ('2단계', '법학', '상법2',   5, '전공', 8),
  ('2단계', '법학', '법철학',  5, '전공', 9),
  ('2단계', '법학', '행정법1', 5, '전공', 10),
  ('2단계', '법학', '행정법2', 5, '전공', 11),
  ('2단계', '법학', '노동법',  5, '전공', 12),
  ('2단계', '법학', '국제법',  5, '전공', 13),
  -- 행정학
  ('2단계', '행정학', '전자정부론',   5, '전공', 1),
  ('2단계', '행정학', '정책학원론',   5, '전공', 2),
  ('2단계', '행정학', '지방자치론',   5, '전공', 3),
  ('2단계', '행정학', '정치학개론',   5, '전공', 4),
  ('2단계', '행정학', '기획론',       5, '전공', 5),
  ('2단계', '행정학', '조직행태론',   5, '전공', 6),
  ('2단계', '행정학', '헌법',         5, '전공', 7),
  ('2단계', '행정학', '조사방법론',   5, '전공', 8),
  -- 가정학
  ('2단계', '가정학', '인간발달',       5, '전공', 1),
  ('2단계', '가정학', '복식디자인',     5, '전공', 2),
  ('2단계', '가정학', '영양학',         5, '전공', 3),
  ('2단계', '가정학', '가정관리론',     5, '전공', 4),
  ('2단계', '가정학', '의복재료',       5, '전공', 5),
  ('2단계', '가정학', '주거학',         5, '전공', 6),
  ('2단계', '가정학', '가정학원론',     5, '전공', 7),
  ('2단계', '가정학', '식품및조리원리', 5, '전공', 8),
  -- 컴퓨터공학
  ('2단계', '컴퓨터공학', '논리회로',           5, '전공', 1),
  ('2단계', '컴퓨터공학', 'C프로그래밍',        5, '전공', 2),
  ('2단계', '컴퓨터공학', '자료구조',           5, '전공', 3),
  ('2단계', '컴퓨터공학', '객체지향프로그래밍', 5, '전공', 4),
  ('2단계', '컴퓨터공학', '웹프로그래밍',       5, '전공', 5),
  ('2단계', '컴퓨터공학', '컴퓨터구조',         5, '전공', 6),
  ('2단계', '컴퓨터공학', '운영체제',           5, '전공', 7),
  ('2단계', '컴퓨터공학', '이산수학',           5, '전공', 8);

-- 3단계 전공과목 (학과별, 각 5학점)
insert into public.dokaksa_presets (stage, category, name, credits, subject_type, sort_order) values
  -- 국어국문학
  ('3단계', '국어국문학', '국어음운론',   5, '전공', 1),
  ('3단계', '국어국문학', '한국문학사',   5, '전공', 2),
  ('3단계', '국어국문학', '문학비평론',   5, '전공', 3),
  ('3단계', '국어국문학', '국어정서법',   5, '전공', 4),
  ('3단계', '국어국문학', '구비문학론',   5, '전공', 5),
  ('3단계', '국어국문학', '국어의미론',   5, '전공', 6),
  ('3단계', '국어국문학', '한국한문학',   5, '전공', 7),
  ('3단계', '국어국문학', '고전시가론',   5, '전공', 8),
  -- 영어영문학
  ('3단계', '영어영문학', '고급영문법',     5, '전공', 1),
  ('3단계', '영어영문학', '미국문학개관',   5, '전공', 2),
  ('3단계', '영어영문학', '영어발달사',     5, '전공', 3),
  ('3단계', '영어영문학', '고급영어',       5, '전공', 4),
  ('3단계', '영어영문학', '20세기영미소설', 5, '전공', 5),
  ('3단계', '영어영문학', '영어통사론',     5, '전공', 6),
  ('3단계', '영어영문학', '20세기영미시',   5, '전공', 7),
  ('3단계', '영어영문학', '영미희곡2',      5, '전공', 8),
  -- 심리학
  ('3단계', '심리학', '상담심리학',         5, '전공', 1),
  ('3단계', '심리학', '심리검사',           5, '전공', 2),
  ('3단계', '심리학', '산업및조직심리학',   5, '전공', 3),
  ('3단계', '심리학', '학습심리학',         5, '전공', 4),
  ('3단계', '심리학', '인지심리학',         5, '전공', 5),
  ('3단계', '심리학', '중독심리학',         5, '전공', 6),
  ('3단계', '심리학', '건강심리학',         5, '전공', 7),
  ('3단계', '심리학', '학교심리학',         5, '전공', 8),
  -- 경영학
  ('3단계', '경영학', '재무관리론',   5, '전공', 1),
  ('3단계', '경영학', '경영전략',     5, '전공', 2),
  ('3단계', '경영학', '투자론',       5, '전공', 3),
  ('3단계', '경영학', '경영과학',     5, '전공', 4),
  ('3단계', '경영학', '재무회계',     5, '전공', 5),
  ('3단계', '경영학', '경영분석',     5, '전공', 6),
  ('3단계', '경영학', '노사관계론',   5, '전공', 7),
  ('3단계', '경영학', '소비자행동론', 5, '전공', 8),
  -- 법학 (로마숫자 → 아라비아숫자)
  ('3단계', '법학', '헌법3',       5, '전공', 1),
  ('3단계', '법학', '민법2',       5, '전공', 2),
  ('3단계', '법학', '형법2',       5, '전공', 3),
  ('3단계', '법학', '민사소송법',  5, '전공', 4),
  ('3단계', '법학', '행정법2',     5, '전공', 5),
  ('3단계', '법학', '지적재산권법',5, '전공', 6),
  ('3단계', '법학', '형사소송법',  5, '전공', 7),
  ('3단계', '법학', '상법2',       5, '전공', 8),
  -- 행정학 (로마숫자 → 아라비아숫자)
  ('3단계', '행정학', '정부규제론',     5, '전공', 1),
  ('3단계', '행정학', '복지정책론',     5, '전공', 2),
  ('3단계', '행정학', '한국정부론',     5, '전공', 3),
  ('3단계', '행정학', '행정법1',        5, '전공', 4),
  ('3단계', '행정학', '거버넌스와NGO',  5, '전공', 5),
  ('3단계', '행정학', '행정계량분석',   5, '전공', 6),
  ('3단계', '행정학', '도시행정론',     5, '전공', 7),
  ('3단계', '행정학', '공기업론',       5, '전공', 8),
  -- 유아교육학
  ('3단계', '유아교육학', '유아교육연구및평가',     5, '전공', 1),
  ('3단계', '유아교육학', '부모교육론',             5, '전공', 2),
  ('3단계', '유아교육학', '유아교육기관운영관리',   5, '전공', 3),
  ('3단계', '유아교육학', '아동복지',               5, '전공', 4),
  ('3단계', '유아교육학', '유아언어교육',           5, '전공', 5),
  ('3단계', '유아교육학', '유아사회교육',           5, '전공', 6),
  ('3단계', '유아교육학', '유아수학·과학교육',      5, '전공', 7),
  ('3단계', '유아교육학', '놀이이론과실제',         5, '전공', 8),
  -- 가정학
  ('3단계', '가정학', '가족관계',       5, '전공', 1),
  ('3단계', '가정학', '가정자원관리',   5, '전공', 2),
  ('3단계', '가정학', '식생활과건강',   5, '전공', 3),
  ('3단계', '가정학', '의복구성',       5, '전공', 4),
  ('3단계', '가정학', '육아',           5, '전공', 5),
  ('3단계', '가정학', '복식문화',       5, '전공', 6),
  ('3단계', '가정학', '주거공간디자인', 5, '전공', 7),
  ('3단계', '가정학', '식품저장및가공', 5, '전공', 8),
  -- 컴퓨터공학
  ('3단계', '컴퓨터공학', '인공지능',         5, '전공', 1),
  ('3단계', '컴퓨터공학', '컴퓨터네트워크',   5, '전공', 2),
  ('3단계', '컴퓨터공학', '임베디드시스템',   5, '전공', 3),
  ('3단계', '컴퓨터공학', '소프트웨어공학',   5, '전공', 4),
  ('3단계', '컴퓨터공학', '프로그래밍언어론', 5, '전공', 5),
  ('3단계', '컴퓨터공학', '컴파일러',         5, '전공', 6),
  ('3단계', '컴퓨터공학', '컴퓨터그래픽스',   5, '전공', 7),
  ('3단계', '컴퓨터공학', '정보보호',         5, '전공', 8),
  -- 정보통신학
  ('3단계', '정보통신학', '회로이론',         5, '전공', 1),
  ('3단계', '정보통신학', '데이터통신',       5, '전공', 2),
  ('3단계', '정보통신학', '정보통신이론',     5, '전공', 3),
  ('3단계', '정보통신학', '임베디드시스템',   5, '전공', 4),
  ('3단계', '정보통신학', '이동통신시스템',   5, '전공', 5),
  ('3단계', '정보통신학', '정보통신기기',     5, '전공', 6),
  ('3단계', '정보통신학', '정보보안',         5, '전공', 7),
  ('3단계', '정보통신학', '네트워크프로그래밍',5,'전공', 8);
