'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Student } from '@/types';
import styles from './page.module.css';

// ── 타입 ──────────────────────────────────────────────────────

type SubjectCategory = '전공' | '교양' | '일반';

interface Subject {
  id: number;
  category: SubjectCategory;
  name: string;
  credits: number;
  type: '이론' | '실습';
  subject_type?: '필수' | '선택' | null;
  student_id?: string | null;
}

interface PrevSubject {
  id: string;
  student_id: string;
  category: SubjectCategory;
  name: string;
  credits: number;
}

interface CreditCert {
  id: string;
  student_id: string;
  name: string;
  credits: number;
  acquired_date: string | null;
}

interface DokaksaEntry {
  id: string;
  student_id: string;
  stage: string;
  subject_name: string;
  credits: number;
}

interface Semester {
  id: number;
  year: string;
  term: number;
  label: string;
  months: string;
}

interface SemesterDates {
  start: string;
  end: string;
}

// ── 상수 ──────────────────────────────────────────────────────

const SUBJECT_CATEGORIES: SubjectCategory[] = ['전공', '교양', '일반'];
const CREDIT_OPTIONS = [1, 2, 3, 4, 5] as const;
const DOKAKSA_STAGES = ['1단계', '2단계', '3단계', '4단계'] as const;

const YEAR_OPTIONS = Array.from({ length: 8 }, (_, i) => String(2023 + i)); // 2023~2030

const INITIAL_SEMESTERS: Semester[] = [
  { id: 0, year: '2025', term: 1, label: '', months: '' },
  { id: 1, year: '2025', term: 2, label: '', months: '' },
];

const TARGET_CREDITS  = 51;
const TARGET_SUBJECTS = 8;

// ── 학력별 플랜 설정 ─────────────────────────────────────────

interface PlanTarget {
  label: string;
  categories: SubjectCategory[];
  target: number;
  color: string;
}

interface PracticeRequirement {
  required: number; // 필수 최소 이수 과목 수
  elective: number; // 선택 최소 이수 과목 수
}

interface PlanConfig {
  isHighSchool: boolean;
  totalTarget: number;
  subjectTarget: number | null;
  targets: PlanTarget[];
  practice?: PracticeRequirement;
}

function getPlanConfig(educationLevel: string | null, courseName?: string | null): PlanConfig {
  // 실습예정 과정은 학력과 무관하게 별도 레이아웃
  if (courseName?.includes('실습예정')) {
    return {
      isHighSchool: false,
      totalTarget: 6,
      subjectTarget: 6,
      targets: [
        { label: '전공', categories: ['전공'], target: 6, color: '#3182F6' },
      ],
      practice: { required: 4, elective: 2 },
    };
  }

  if (educationLevel === '고등학교졸업') {
    return {
      isHighSchool: true,
      totalTarget: 80,
      subjectTarget: null,
      targets: [
        { label: '전공', categories: ['전공'], target: 45, color: '#3182F6' },
        { label: '교양', categories: ['교양'], target: 15, color: '#059669' },
        { label: '일반', categories: ['일반'], target: 20, color: '#D97706' },
      ],
    };
  }
  return {
    isHighSchool: false,
    totalTarget: 51,
    subjectTarget: 8,
    targets: [
      { label: '전공', categories: ['전공'], target: 51, color: '#3182F6' },
    ],
  };
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  // 기본 데이터
  const [student,    setStudent]    = useState<Student | null>(null);
  const [subjects,   setSubjects]   = useState<Subject[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [saving,     setSaving]     = useState(false);
  const isInitialized = useRef(false);
  const saveTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 학점 인정 데이터 (각각 즉시 DB 저장)
  const [prevSubjects, setPrevSubjects] = useState<PrevSubject[]>([]);
  const [creditCerts,  setCreditCerts]  = useState<CreditCert[]>([]);
  const [dokaksaList,  setDokaksaList]  = useState<DokaksaEntry[]>([]);

  // 학기 플랜 (저장 버튼으로 저장)
  const [semesters,        setSemesters]        = useState<Semester[]>(INITIAL_SEMESTERS);
  const [semesterSubjects, setSemesterSubjects] = useState<Record<number, number[]>>({});
  const [semesterDates,    setSemesterDates]    = useState<Record<number, SemesterDates>>({});

  // UI 상태
  const [selectedCategory, setSelectedCategory] = useState('전체');
  const [selectedSemester, setSelectedSemester] = useState(0);

  // 팝업 상태
  const [showSubjectPopup, setShowSubjectPopup] = useState(false);
  const [subjectForm, setSubjectForm] = useState({ category: '전공' as SubjectCategory, name: '', credits: 3, type: '이론' as '이론' | '실습' });

  const [showPrevPopup,   setShowPrevPopup]   = useState(false);
  const [showGubupPopup,  setShowGubupPopup]  = useState(false);
  const [prevForm, setPrevForm] = useState({ category: '전공' as SubjectCategory, name: '', credits: 3 });
  const [cbQuery,      setCbQuery]      = useState('');
  const [cbResults,    setCbResults]    = useState<{ id: string; name: string }[]>([]);
  const [cbSearching,  setCbSearching]  = useState(false);
  const cbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showCertPopup, setShowCertPopup] = useState(false);
  const [certForm, setCertForm] = useState({ name: '', credits: 3, acquired_date: '' });

  const [showDokaksaPopup, setShowDokaksaPopup] = useState(false);
  const [dokaksaForm, setDokaksaForm] = useState({ stage: '1단계' as typeof DOKAKSA_STAGES[number], subject_name: '', credits: 3 });

  const [showAddSemesterPopup, setShowAddSemesterPopup] = useState(false);
  const [newSemesterForm, setNewSemesterForm] = useState({ year: '2025', term: 1 });
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  const planConfig = useMemo(
    () => getPlanConfig(student?.education_level ?? null, student?.courses?.name ?? null),
    [student?.education_level, student?.courses?.name],
  );

  // ── 데이터 로드 ─────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('students').select('*, courses(*)').eq('id', id).single(),
      supabase.from('subjects').select('*').or(`student_id.is.null,student_id.eq.${id}`).order('id'),
      supabase.from('student_prev_subjects').select('*').eq('student_id', id).order('created_at'),
      supabase.from('student_credit_certs').select('*').eq('student_id', id).order('created_at'),
      supabase.from('student_dokaksa').select('*').eq('student_id', id).order('created_at'),
      supabase.from('student_plans').select('*').eq('student_id', id).maybeSingle(),
    ]).then(([studentRes, subjectsRes, prevRes, certsRes, dokaksaRes, planRes]) => {
      setStudent(studentRes.data as Student);
      if (subjectsRes.data?.length)  setSubjects(subjectsRes.data as Subject[]);
      if (prevRes.data?.length)      setPrevSubjects(prevRes.data as PrevSubject[]);
      if (certsRes.data?.length)     setCreditCerts(certsRes.data as CreditCert[]);
      if (dokaksaRes.data?.length)   setDokaksaList(dokaksaRes.data as DokaksaEntry[]);
      if (planRes.data) {
        const p = planRes.data;
        if (p.semesters?.length)       setSemesters(p.semesters);
        if (p.semester_subjects)       setSemesterSubjects(p.semester_subjects);
        if (p.semester_dates)          setSemesterDates(p.semester_dates);
      }
      setLoading(false);
      setTimeout(() => { isInitialized.current = true; }, 0);
    });
  }, [id]);

  // ── 통계 계산 ───────────────────────────────────────────────
  const assignedIds = useMemo(() => Object.values(semesterSubjects).flat(), [semesterSubjects]);

  const creditsByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    assignedIds.forEach((sid) => {
      const s = subjects.find((s) => s.id === sid);
      if (s) map[s.category] = (map[s.category] ?? 0) + s.credits;
    });
    // 전적대 과목
    prevSubjects.forEach((s) => { map[s.category] = (map[s.category] ?? 0) + s.credits; });
    return map;
  }, [assignedIds, subjects, prevSubjects]);

  // 자격증 + 독학사 학점 (전공으로 합산)
  const certCredits    = useMemo(() => creditCerts.reduce((s, c) => s + c.credits, 0), [creditCerts]);
  const dokaksaCredits = useMemo(() => dokaksaList.reduce((s, d) => s + d.credits, 0), [dokaksaList]);

  const getCategoryCredits = (categories: SubjectCategory[]) =>
    categories.reduce((sum, cat) => sum + (creditsByCategory[cat] ?? 0), 0);

  const totalSubjects = assignedIds.length + prevSubjects.length;

  // 실습예정 요건 카운터 (필수/선택 이수 과목 수)
  const practiceCount = useMemo(() => {
    if (!planConfig.practice) return null;
    let required = 0, elective = 0;
    assignedIds.forEach((sid) => {
      const s = subjects.find((s) => s.id === sid);
      if (s?.subject_type === '필수') required++;
      if (s?.subject_type === '선택') elective++;
    });
    prevSubjects.forEach((s) => {
      if (s.category === '전공') elective++; // 전적대 전공 과목은 선택으로 카운트
    });
    return { required, elective };
  }, [assignedIds, subjects, prevSubjects, planConfig.practice]);
  const totalCredits  = Object.values(creditsByCategory).reduce((a, b) => a + b, 0) + certCredits + dokaksaCredits;
  const progress      = Math.min(Math.round((totalCredits / planConfig.totalTarget) * 100), 100);

  // ── 과목 필터/그룹 ───────────────────────────────────────────
  const filteredSubjects = useMemo(
    () => selectedCategory === '전체' ? subjects : subjects.filter((s) => s.category === selectedCategory),
    [selectedCategory, subjects],
  );

  const groupedSubjects = useMemo(() => {
    const groups: Record<string, Subject[]> = {};
    filteredSubjects.forEach((s) => {
      if (!groups[s.category]) groups[s.category] = [];
      groups[s.category].push(s);
    });
    return groups;
  }, [filteredSubjects]);

  // ── 핸들러: 수강 계획 ────────────────────────────────────────
  const MAX_PER_SEMESTER = 8;
  const MAX_PER_YEAR     = 14;

  function getYearSubjectCount(year: string): number {
    return semesters
      .filter((s) => s.year === year)
      .reduce((sum, s) => sum + (semesterSubjects[s.id] ?? []).length, 0);
  }

  function isSubjectUsed(subjectId: number) { return assignedIds.includes(subjectId); }

  function handleSubjectClick(subjectId: number) {
    if (isSubjectUsed(subjectId)) return;
    const current     = semesterSubjects[selectedSemester] ?? [];
    const currentSem  = semesters.find((s) => s.id === selectedSemester);
    const yearCount   = currentSem ? getYearSubjectCount(currentSem.year) : 0;

    if (current.length >= MAX_PER_SEMESTER) {
      alert(`한 학기에 최대 ${MAX_PER_SEMESTER}과목까지 수강 가능합니다.`);
      return;
    }
    if (yearCount >= MAX_PER_YEAR) {
      alert(`${currentSem?.year}년도에 최대 ${MAX_PER_YEAR}과목까지 수강 가능합니다.\n(1학기 + 2학기 합산 기준)`);
      return;
    }
    setSemesterSubjects((prev) => ({ ...prev, [selectedSemester]: [...current, subjectId] }));
  }

  function handleRemoveAssigned(semesterId: number, subjectId: number) {
    setSemesterSubjects((prev) => ({
      ...prev,
      [semesterId]: (prev[semesterId] ?? []).filter((sid) => sid !== subjectId),
    }));
  }

  function handleDateChange(semesterId: number, field: 'start' | 'end', value: string) {
    setSemesterDates((prev) => ({
      ...prev,
      [semesterId]: { ...(prev[semesterId] ?? { start: '', end: '' }), [field]: value },
    }));
  }

  function handleUpdateSemester(semId: number, field: 'year' | 'term', value: string | number) {
    setSemesters((prev) => prev.map((s) => s.id === semId ? { ...s, [field]: value } : s));
  }

  function handleAddSemester() {
    const last  = semesters[semesters.length - 1];
    const nextTerm = last.term === 2 ? 1 : 2;
    const nextYear = last.term === 2 ? String(Number(last.year) + 1) : last.year;
    setNewSemesterForm({ year: nextYear, term: nextTerm });
    setShowAddSemesterPopup(true);
  }

  function handleConfirmAddSemester() {
    const newId = (semesters[semesters.length - 1]?.id ?? -1) + 1;
    setSemesters((prev) => [...prev, { id: newId, year: newSemesterForm.year, term: newSemesterForm.term, label: '', months: '' }]);
    setSelectedSemester(newId);
    setShowAddSemesterPopup(false);
  }

  function handleDeleteSemester(semId: number) {
    if (semesters.length <= 1) return;
    setSemesters((prev) => prev.filter((s) => s.id !== semId));
    setSemesterSubjects((prev) => { const next = { ...prev }; delete next[semId]; return next; });
    setSemesterDates((prev) => { const next = { ...prev }; delete next[semId]; return next; });
    if (selectedSemester === semId) {
      const remaining = semesters.filter((s) => s.id !== semId);
      setSelectedSemester(remaining[remaining.length - 1]?.id ?? 0);
    }
  }

  // ── 핸들러: 과목 수기 추가 (DB) ─────────────────────────────
  async function handleAddCustomSubject() {
    if (!subjectForm.name.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.from('subjects').insert({
      category: subjectForm.category,
      name: subjectForm.name.trim(),
      credits: subjectForm.credits,
      type: subjectForm.type,
      student_id: id,
    }).select().single();
    if (error) { alert(`추가 실패: ${error.message}`); return; }
    setSubjects((prev) => [...prev, data as Subject]);
    setSubjectForm({ category: '전공', name: '', credits: 3, type: '이론' });
    setShowSubjectPopup(false);
  }

  async function handleDeleteSubject(subjectId: number) {
    const supabase = createClient();
    const { error } = await supabase.from('subjects').delete().eq('id', subjectId).eq('student_id', id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setSubjects((prev) => prev.filter((s) => s.id !== subjectId));
    // 학기 배정에서도 제거
    setSemesterSubjects((prev) => {
      const updated: Record<number, number[]> = {};
      Object.entries(prev).forEach(([k, v]) => { updated[Number(k)] = v.filter((sid) => sid !== subjectId); });
      return updated;
    });
  }

  // ── 핸들러: 학점은행 검색 ────────────────────────────────────
  function handleCbQueryChange(q: string) {
    setCbQuery(q);
    setCbResults([]);
    if (cbTimer.current) clearTimeout(cbTimer.current);
    if (!q.trim()) return;
    cbTimer.current = setTimeout(async () => {
      setCbSearching(true);
      try {
        const res = await fetch(`/api/cb-search?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setCbResults(data.subjects ?? []);
      } catch {
        setCbResults([]);
      } finally {
        setCbSearching(false);
      }
    }, 400);
  }

  function handleCbSelect(name: string) {
    setPrevForm((f) => ({ ...f, name }));
    setCbQuery('');
    setCbResults([]);
  }

  // ── 핸들러: 전적대 이수과목 (DB) ────────────────────────────
  async function handleAddPrevSubject() {
    if (!prevForm.name.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.from('student_prev_subjects').insert({
      student_id: id, category: prevForm.category, name: prevForm.name.trim(), credits: prevForm.credits,
    }).select().single();
    if (error) { alert(`추가 실패: ${error.message}`); return; }
    setPrevSubjects((prev) => [...prev, data as PrevSubject]);
    setPrevForm({ category: '전공', name: '', credits: 3 });
    setShowPrevPopup(false);
    setCbQuery(''); setCbResults([]);
  }

  async function handleDeletePrevSubject(entryId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('student_prev_subjects').delete().eq('id', entryId);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setPrevSubjects((prev) => prev.filter((s) => s.id !== entryId));
  }

  // ── 핸들러: 학점인정 자격증 (DB) ────────────────────────────
  async function handleAddCert() {
    if (!certForm.name.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.from('student_credit_certs').insert({
      student_id: id,
      name: certForm.name.trim(),
      credits: certForm.credits,
      acquired_date: certForm.acquired_date || null,
    }).select().single();
    if (error) { alert(`추가 실패: ${error.message}`); return; }
    setCreditCerts((prev) => [...prev, data as CreditCert]);
    setCertForm({ name: '', credits: 3, acquired_date: '' });
    setShowCertPopup(false);
  }

  async function handleDeleteCert(certId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('student_credit_certs').delete().eq('id', certId);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setCreditCerts((prev) => prev.filter((c) => c.id !== certId));
  }

  // ── 핸들러: 독학사 (DB) ─────────────────────────────────────
  async function handleAddDokaksa() {
    if (!dokaksaForm.subject_name.trim()) return;
    const supabase = createClient();
    const { data, error } = await supabase.from('student_dokaksa').insert({
      student_id: id,
      stage: dokaksaForm.stage,
      subject_name: dokaksaForm.subject_name.trim(),
      credits: dokaksaForm.credits,
    }).select().single();
    if (error) { alert(`추가 실패: ${error.message}`); return; }
    setDokaksaList((prev) => [...prev, data as DokaksaEntry]);
    setDokaksaForm({ stage: '1단계', subject_name: '', credits: 3 });
    setShowDokaksaPopup(false);
  }

  async function handleDeleteDokaksa(entryId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('student_dokaksa').delete().eq('id', entryId);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setDokaksaList((prev) => prev.filter((d) => d.id !== entryId));
  }

  // ── 자동 저장 (debounce 800ms) ──────────────────────────────
  useEffect(() => {
    if (!isInitialized.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      const supabase = createClient();
      await supabase.from('student_plans').upsert({
        student_id: id, semesters, semester_subjects: semesterSubjects,
        semester_dates: semesterDates, updated_at: new Date().toISOString(),
      }, { onConflict: 'student_id' });
      setSaving(false);
    }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [semesters, semesterSubjects, semesterDates]);

  // ── 렌더링 ──────────────────────────────────────────────────
  if (loading) {
    return <div className={styles.page_wrap}><div className={styles.loading_text}>불러오는 중...</div></div>;
  }
  if (!student) {
    return <div className={styles.page_wrap}><div className={styles.loading_text}>학생을 찾을 수 없습니다.</div></div>;
  }

  const currentSemester           = semesters.find((s) => s.id === selectedSemester) ?? semesters[0];
  const currentSemesterSubjectIds = semesterSubjects[selectedSemester] ?? [];
  const currentDates              = semesterDates[selectedSemester] ?? { start: '', end: '' };

  return (
    <div className={styles.page_wrap}>

      {/* 뒤로 가기 */}
      <button className={styles.back_btn} onClick={() => router.push('/students')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        학생 목록으로
      </button>

      {/* 헤더 카드 */}
      <div className={styles.header_card}>
        <div className={styles.header_left}>
          <div className={styles.course_name}>{student.courses?.name ?? '과정 미배정'}</div>
          <div className={styles.student_meta}>
            {student.name}
            {student.manager_name && <><span className={styles.meta_sep}>|</span>담당자 {student.manager_name}</>}
          </div>
        </div>
        <div className={styles.save_indicator}>
          {saving ? (
            <><span className={styles.save_dot_saving} />저장 중...</>
          ) : (
            <><span className={styles.save_dot_saved} />저장됨</>
          )}
        </div>
      </div>

      {/* 학력 안내 배너 — 실습예정은 숨김 */}
      {!planConfig.practice && (planConfig.isHighSchool ? (
        <div className={styles.edu_banner} style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className={styles.edu_banner_text}>
            <strong>고등학교졸업</strong> — 전공 45 + 교양 15 + 일반 20 = 총 80학점
            <span className={styles.edu_banner_sub}> (교양을 35학점으로 늘려 일반 대체 가능)</span>
          </span>
        </div>
      ) : (
        <div className={styles.edu_banner} style={{ borderColor: '#BFDBFE', background: '#EFF6FF' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3182F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className={styles.edu_banner_text}>
            <strong>{student.education_level ?? '학력 미입력'}</strong> — 전공 51학점 17과목 이수
          </span>
        </div>
      ))}

      {/* 통계 카드 — 실습예정은 숨김 */}
      {!planConfig.practice && <div className={styles.stats_row}>
        {planConfig.isHighSchool ? (
          <>
            {planConfig.targets.map((t) => {
              const earned = getCategoryCredits(t.categories);
              const pct = Math.min(Math.round((earned / t.target) * 100), 100);
              return (
                <div key={t.label} className={styles.stat_card}>
                  <div className={styles.stat_label} style={{ color: t.color }}>{t.label} 학점</div>
                  <div className={styles.stat_value} style={{ color: t.color }}>
                    {earned}<span className={styles.stat_unit}>/ {t.target}</span>
                  </div>
                  <div className={styles.stat_bar_wrap}>
                    <div className={styles.stat_bar} style={{ width: `${pct}%`, background: t.color }} />
                  </div>
                </div>
              );
            })}
            <div className={styles.stat_card}>
              <div className={styles.stat_label}>총 학점</div>
              <div className={styles.stat_value}>{totalCredits}<span className={styles.stat_unit}>/ 80</span></div>
              <div className={styles.stat_bar_wrap}><div className={styles.stat_bar} style={{ width: `${progress}%` }} /></div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.stat_card}>
              <div className={styles.stat_label}>총 과목</div>
              <div className={styles.stat_value}>{totalSubjects}<span className={styles.stat_unit}>/ {TARGET_SUBJECTS}개</span></div>
            </div>
            <div className={styles.stat_card}>
              <div className={styles.stat_label}>총 학점</div>
              <div className={styles.stat_value}>{totalCredits}<span className={styles.stat_unit}>학점</span></div>
            </div>
            <div className={styles.stat_card}>
              <div className={styles.stat_label}>목표 학점</div>
              <div className={styles.stat_value}>{TARGET_CREDITS}<span className={styles.stat_unit}>학점</span></div>
            </div>
            <div className={styles.stat_card}>
              <div className={styles.stat_label}>진행률</div>
              <div className={styles.stat_value}>{progress}<span className={styles.stat_unit}>%</span></div>
              <div className={styles.stat_bar_wrap}><div className={styles.stat_bar} style={{ width: `${progress}%` }} /></div>
            </div>
          </>
        )}
      </div>}

      {/* ── 학점인정 자격증 ── */}
      <div className={styles.credit_section}>
        <div className={styles.credit_section_header}>
          <div className={styles.credit_section_title_wrap}>
            <span className={styles.section_title}>학점인정 자격증</span>
            {creditCerts.length > 0 && (
              <span className={styles.section_count_badge}>{certCredits}학점</span>
            )}
          </div>
          <button className={styles.section_add_btn} onClick={() => setShowCertPopup(true)}>+ 추가</button>
        </div>

        {creditCerts.length === 0 ? (
          <div className={styles.section_empty}>등록된 자격증이 없습니다</div>
        ) : (
          <div className={styles.credit_list}>
            {creditCerts.map((c) => (
              <div key={c.id} className={styles.credit_item}>
                <span className={styles.credit_item_name}>{c.name}</span>
                {c.acquired_date && <span className={styles.credit_item_date}>{c.acquired_date}</span>}
                <span className={styles.credit_badge}>{c.credits}학점</span>
                <button className={styles.item_remove_btn} onClick={() => handleDeleteCert(c.id)} aria-label="삭제">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 독학사 ── */}
      <div className={styles.credit_section}>
        <div className={styles.credit_section_header}>
          <div className={styles.credit_section_title_wrap}>
            <span className={styles.section_title}>독학사</span>
            {dokaksaList.length > 0 && (
              <span className={styles.section_count_badge}>{dokaksaCredits}학점</span>
            )}
          </div>
          <button className={styles.section_add_btn} onClick={() => setShowDokaksaPopup(true)}>+ 추가</button>
        </div>

        {dokaksaList.length === 0 ? (
          <div className={styles.section_empty}>등록된 독학사 과목이 없습니다</div>
        ) : (
          <div className={styles.credit_list}>
            {dokaksaList.map((d) => (
              <div key={d.id} className={styles.credit_item}>
                <span className={styles.stage_badge}>{d.stage}</span>
                <span className={styles.credit_item_name}>{d.subject_name}</span>
                <span className={styles.credit_badge}>{d.credits}학점</span>
                <button className={styles.item_remove_btn} onClick={() => handleDeleteDokaksa(d.id)} aria-label="삭제">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 전적대 이수과목 ── */}
      <div className={styles.credit_section}>
        <div className={styles.credit_section_header}>
          <div className={styles.credit_section_title_wrap}>
            <span className={styles.section_title}>전적대 이수과목</span>
            {prevSubjects.length > 0 && (
              <span className={styles.section_count_badge}>
                {prevSubjects.reduce((s, p) => s + p.credits, 0)}학점
              </span>
            )}
          </div>
          <div className={styles.section_btn_group}>
            {student.courses?.name?.includes('구법') && (
              <button className={styles.section_add_btn_gubup} onClick={() => setShowGubupPopup(true)}>
                구법 과목 추가
              </button>
            )}
            <a
              className={styles.section_link_btn}
              href="https://www.cb.or.kr/creditbank/stuHelp/nStuHelp7_1.do"
              target="_blank"
              rel="noopener noreferrer"
            >학점은행 검색</a>
            <button className={styles.section_add_btn} onClick={() => setShowPrevPopup(true)}>+ 추가</button>
          </div>
        </div>

        {prevSubjects.length === 0 ? (
          <div className={styles.section_empty}>전적대에서 이수한 과목이 없습니다</div>
        ) : (
          <div className={styles.credit_list}>
            {prevSubjects.map((s) => (
              <div key={s.id} className={styles.credit_item}>
                <span className={styles.prev_cat_badge}>{s.category}</span>
                <span className={styles.credit_item_name}>{s.name}</span>
                <span className={styles.credit_badge}>{s.credits}학점</span>
                <button className={styles.item_remove_btn} onClick={() => handleDeletePrevSubject(s.id)} aria-label="삭제">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 실습예정 요건 트래커 ── */}
      {planConfig.practice && practiceCount && (
        <div className={styles.practice_tracker}>
          <div className={styles.practice_tracker_title}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#EA580C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
            사회복지사 실습 이수 요건
          </div>
          <div className={styles.practice_tracker_items}>
            <div className={`${styles.practice_item} ${practiceCount.required >= planConfig.practice.required ? styles.practice_item_done : ''}`}>
              <span className={styles.practice_item_label}>필수과목</span>
              <span className={styles.practice_item_count}>
                {practiceCount.required} / {planConfig.practice.required}개
              </span>
              {practiceCount.required >= planConfig.practice.required && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
            <div className={`${styles.practice_item} ${practiceCount.elective >= planConfig.practice.elective ? styles.practice_item_done : ''}`}>
              <span className={styles.practice_item_label}>선택과목</span>
              <span className={styles.practice_item_count}>
                {practiceCount.elective} / {planConfig.practice.elective}개
              </span>
              {practiceCount.elective >= planConfig.practice.elective && (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── 두 패널: 과목목록 + 학기별 수강계획 ── */}
      <div className={styles.plan_layout}>

        {/* 좌: 과목 목록 */}
        <div className={styles.subject_panel}>
          <div className={styles.subject_panel_header}>
            <div className={styles.panel_title}>과목 목록</div>
            <button className={styles.subject_add_btn} onClick={() => setShowSubjectPopup(true)}>+ 추가</button>
          </div>

          {currentSemesterSubjectIds.length >= 8 && (
            <div className={styles.subject_max_notice}>이번 학기 최대 8과목 도달</div>
          )}

          <select className={styles.subject_filter} value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
            <option value="전체">전체</option>
            {SUBJECT_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
          </select>

          <div className={styles.subject_list}>
            {Object.entries(groupedSubjects).map(([category, subjs]) => (
              <div key={category}>
                <div className={styles.subject_category_label}>{category}</div>
                {subjs.map((subject) => {
                  const used = isSubjectUsed(subject.id);
                  const isCustom = !!subject.student_id;
                  return (
                    <div
                      key={subject.id}
                      className={`${styles.subject_card} ${used ? styles.subject_card_disabled : styles.subject_card_active}`}
                      onClick={() => handleSubjectClick(subject.id)}
                      role="button"
                      tabIndex={used ? -1 : 0}
                      aria-disabled={used}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSubjectClick(subject.id); }}
                    >
                      {used ? (
                        <svg className={styles.subject_check} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : (
                        <div className={styles.subject_check_placeholder} />
                      )}
                      <span className={styles.subject_name}>{subject.name}</span>
                      <div className={styles.subject_badges}>
                        <span className={styles.credit_badge}>{subject.credits}학점</span>
                        <span className={`${styles.type_badge} ${subject.type === '실습' ? styles.type_badge_practice : ''}`}>{subject.type}</span>
                        {subject.subject_type && (
                          <span className={`${styles.subject_type_badge} ${subject.subject_type === '필수' ? styles.subject_type_required : styles.subject_type_elective}`}>
                            {subject.subject_type}
                          </span>
                        )}
                        {isCustom && (
                          <button className={styles.subject_delete_btn}
                            onClick={(e) => { e.stopPropagation(); handleDeleteSubject(subject.id); }}
                            aria-label="과목 삭제">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 우: 학기별 수강 계획 */}
        <div className={styles.semester_panel}>
          <div className={styles.semester_panel_header}>
            <div className={styles.panel_title}>학기별 수강 계획</div>
            <div className={styles.semester_header_right}>
              <span className={styles.semester_count_badge}>{currentSemesterSubjectIds.length} / 8과목</span>
              <span className={`${styles.semester_count_badge} ${getYearSubjectCount(currentSemester.year) >= MAX_PER_YEAR ? styles.semester_count_badge_full : ''}`}>
                {currentSemester.year}년 {getYearSubjectCount(currentSemester.year)} / 14과목
              </span>
              <button className={styles.semester_add_btn} onClick={handleAddSemester}>+ 수강계획 추가</button>
            </div>
          </div>

          <div className={styles.semester_tabs}>
            {semesters.map((sem) => {
              const count = (semesterSubjects[sem.id] ?? []).length;
              const isActive = selectedSemester === sem.id;
              return (
                <div key={sem.id} className={`${styles.semester_tab_wrap} ${isActive ? styles.semester_tab_wrap_active : ''}`}>
                  <button
                    className={`${styles.semester_tab} ${isActive ? styles.semester_tab_active : ''}`}
                    onClick={() => setSelectedSemester(sem.id)}
                  >
                    <span className={styles.tab_year}>{sem.year}년</span>
                    <span className={styles.tab_term}>{sem.term}학기</span>
                    {count > 0 && <span className={styles.tab_count}>{count}</span>}
                  </button>
                  {semesters.length > 1 && (
                    <button
                      className={styles.tab_delete_btn}
                      onClick={(e) => { e.stopPropagation(); handleDeleteSemester(sem.id); }}
                      aria-label="학기 삭제"
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className={styles.semester_detail}>
            <div className={styles.semester_title_big}>{currentSemester.year}년 {currentSemester.term}학기</div>

            <div className={styles.date_row}>
              <div className={styles.date_field}>
                <label className={styles.date_label} htmlFor={`start-${selectedSemester}`}>학기 시작일</label>
                <input id={`start-${selectedSemester}`} className={styles.date_input} type="date"
                  value={currentDates.start} onChange={(e) => handleDateChange(selectedSemester, 'start', e.target.value)} />
              </div>
              <div className={styles.date_field}>
                <label className={styles.date_label} htmlFor={`end-${selectedSemester}`}>학기 종료일</label>
                <input id={`end-${selectedSemester}`} className={styles.date_input} type="date"
                  value={currentDates.end} onChange={(e) => handleDateChange(selectedSemester, 'end', e.target.value)} />
              </div>
            </div>

            {currentSemesterSubjectIds.length === 0 ? (
              <div className={styles.semester_empty}>왼쪽에서 과목을 선택하세요</div>
            ) : (
              <div className={styles.assigned_list}>
                {currentSemesterSubjectIds.map((subjectId) => {
                  const subject = subjects.find((s) => s.id === subjectId);
                  if (!subject) return null;
                  return (
                    <div key={subjectId} className={styles.assigned_item}>
                      <div className={styles.assigned_info}>
                        <span className={styles.assigned_name}>{subject.name}</span>
                        <div className={styles.subject_badges}>
                          <span className={styles.credit_badge}>{subject.credits}학점</span>
                          <span className={`${styles.type_badge} ${subject.type === '실습' ? styles.type_badge_practice : ''}`}>{subject.type}</span>
                        </div>
                      </div>
                      <button className={styles.assigned_remove_btn}
                        onClick={() => handleRemoveAssigned(selectedSemester, subjectId)} aria-label="삭제">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── 팝업: 과목 수기 추가 ── */}
      {showSubjectPopup && (
        <div className={styles.popup_overlay} onClick={() => setShowSubjectPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>과목 추가</span>
              <button className={styles.popup_close} onClick={() => setShowSubjectPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>분류</label>
                <div className={styles.popup_radio_group}>
                  {SUBJECT_CATEGORIES.map((cat) => (
                    <label key={cat} className={`${styles.popup_radio} ${subjectForm.category === cat ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="sCat" value={cat} checked={subjectForm.category === cat}
                        onChange={() => setSubjectForm((f) => ({ ...f, category: cat }))} />{cat}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>과목명</label>
                <input className={styles.popup_input} placeholder="과목명을 입력하세요" value={subjectForm.name}
                  onChange={(e) => setSubjectForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCustomSubject(); }} autoFocus />
              </div>
              <div className={styles.popup_row}>
                <div className={styles.popup_field}>
                  <label className={styles.popup_label}>학점</label>
                  <div className={styles.popup_radio_group}>
                    {CREDIT_OPTIONS.map((c) => (
                      <label key={c} className={`${styles.popup_radio} ${subjectForm.credits === c ? styles.popup_radio_active : ''}`}>
                        <input type="radio" name="sCred" value={c} checked={subjectForm.credits === c}
                          onChange={() => setSubjectForm((f) => ({ ...f, credits: c }))} />{c}
                      </label>
                    ))}
                  </div>
                </div>
                <div className={styles.popup_field}>
                  <label className={styles.popup_label}>유형</label>
                  <div className={styles.popup_radio_group}>
                    {(['이론', '실습'] as const).map((t) => (
                      <label key={t} className={`${styles.popup_radio} ${subjectForm.type === t ? styles.popup_radio_active : ''}`}>
                        <input type="radio" name="sType" value={t} checked={subjectForm.type === t}
                          onChange={() => setSubjectForm((f) => ({ ...f, type: t }))} />{t}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className={styles.popup_footer}>
              <button className={styles.popup_cancel} onClick={() => setShowSubjectPopup(false)}>취소</button>
              <button className={styles.popup_confirm} onClick={handleAddCustomSubject} disabled={!subjectForm.name.trim()}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 팝업: 구법 과목 추가 ── */}
      {showGubupPopup && (
        <div className={styles.popup_overlay} onClick={() => setShowGubupPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>구법 과목 추가</span>
              <button className={styles.popup_close} onClick={() => setShowGubupPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              <div className={styles.gubup_coming_soon}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#b0b8c1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>
                </svg>
                <span>구법 과목 목록 준비 중입니다</span>
              </div>
            </div>
            <div className={styles.popup_footer}>
              <button className={styles.popup_cancel} onClick={() => setShowGubupPopup(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 팝업: 전적대 과목 추가 ── */}
      {showPrevPopup && (
        <div className={styles.popup_overlay} onClick={() => setShowPrevPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>전적대 이수과목 추가</span>
              <button className={styles.popup_close} onClick={() => setShowPrevPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              {/* 학점은행 검색 */}
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>
                  학점은행 검색
                  <span className={styles.popup_label_sub}> · 과목명으로 검색 후 선택</span>
                </label>
                <div className={styles.cb_search_wrap}>
                  <input
                    className={styles.popup_input}
                    placeholder="과목명 검색 (예: 사회복지개론)"
                    value={cbQuery}
                    onChange={(e) => handleCbQueryChange(e.target.value)}
                    autoFocus
                  />
                  {cbSearching && <div className={styles.cb_searching}>검색 중...</div>}
                  {cbResults.length > 0 && (
                    <div className={styles.cb_results}>
                      {cbResults.map((r) => (
                        <div key={r.id} className={styles.cb_result_item} onClick={() => handleCbSelect(r.name)}>
                          {r.name}
                        </div>
                      ))}
                    </div>
                  )}
                  {!cbSearching && cbQuery.trim() && cbResults.length === 0 && (
                    <div className={styles.cb_no_result}>
                      검색 결과가 없습니다.{' '}
                      <a
                        href="https://www.cb.or.kr/creditbank/stuHelp/nStuHelp7_1.do"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.cb_no_result_link}
                      >
                        학점은행 바로가기
                      </a>
                      에서 확인 후 아래에 직접 입력해주세요.
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.popup_divider} />

              <div className={styles.popup_field}>
                <label className={styles.popup_label}>분류</label>
                <div className={styles.popup_radio_group}>
                  {SUBJECT_CATEGORIES.map((cat) => (
                    <label key={cat} className={`${styles.popup_radio} ${prevForm.category === cat ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="pCat" value={cat} checked={prevForm.category === cat}
                        onChange={() => setPrevForm((f) => ({ ...f, category: cat }))} />{cat}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>과목명</label>
                <input className={styles.popup_input} placeholder="검색 선택 또는 직접 입력" value={prevForm.name}
                  onChange={(e) => setPrevForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddPrevSubject(); }} />
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>학점</label>
                <div className={styles.popup_radio_group}>
                  {CREDIT_OPTIONS.map((c) => (
                    <label key={c} className={`${styles.popup_radio} ${prevForm.credits === c ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="pCred" value={c} checked={prevForm.credits === c}
                        onChange={() => setPrevForm((f) => ({ ...f, credits: c }))} />{c}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.popup_footer}>
              <button className={styles.popup_cancel} onClick={() => setShowPrevPopup(false)}>취소</button>
              <button className={styles.popup_confirm} onClick={handleAddPrevSubject} disabled={!prevForm.name.trim()}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 팝업: 학점인정 자격증 추가 ── */}
      {showCertPopup && (
        <div className={styles.popup_overlay} onClick={() => setShowCertPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>학점인정 자격증 추가</span>
              <button className={styles.popup_close} onClick={() => setShowCertPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>자격증명</label>
                <input className={styles.popup_input} placeholder="자격증명을 입력하세요" value={certForm.name}
                  onChange={(e) => setCertForm((f) => ({ ...f, name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddCert(); }} autoFocus />
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>인정 학점</label>
                <div className={styles.popup_radio_group}>
                  {[1,2,3,4,5,6,9,12,15,18,20].map((c) => (
                    <label key={c} className={`${styles.popup_radio} ${certForm.credits === c ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="certCred" value={c} checked={certForm.credits === c}
                        onChange={() => setCertForm((f) => ({ ...f, credits: c }))} />{c}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>취득일 (선택)</label>
                <input className={styles.popup_input} type="date" value={certForm.acquired_date}
                  onChange={(e) => setCertForm((f) => ({ ...f, acquired_date: e.target.value }))} />
              </div>
            </div>
            <div className={styles.popup_footer}>
              <button className={styles.popup_cancel} onClick={() => setShowCertPopup(false)}>취소</button>
              <button className={styles.popup_confirm} onClick={handleAddCert} disabled={!certForm.name.trim()}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 팝업: 독학사 추가 ── */}
      {showDokaksaPopup && (
        <div className={styles.popup_overlay} onClick={() => setShowDokaksaPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>독학사 과목 추가</span>
              <button className={styles.popup_close} onClick={() => setShowDokaksaPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>단계</label>
                <div className={styles.popup_radio_group}>
                  {DOKAKSA_STAGES.map((s) => (
                    <label key={s} className={`${styles.popup_radio} ${dokaksaForm.stage === s ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="dStage" value={s} checked={dokaksaForm.stage === s}
                        onChange={() => setDokaksaForm((f) => ({ ...f, stage: s }))} />{s}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>과목명</label>
                <input className={styles.popup_input} placeholder="과목명을 입력하세요" value={dokaksaForm.subject_name}
                  onChange={(e) => setDokaksaForm((f) => ({ ...f, subject_name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddDokaksa(); }} autoFocus />
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>학점</label>
                <div className={styles.popup_radio_group}>
                  {CREDIT_OPTIONS.map((c) => (
                    <label key={c} className={`${styles.popup_radio} ${dokaksaForm.credits === c ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="dCred" value={c} checked={dokaksaForm.credits === c}
                        onChange={() => setDokaksaForm((f) => ({ ...f, credits: c }))} />{c}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.popup_footer}>
              <button className={styles.popup_cancel} onClick={() => setShowDokaksaPopup(false)}>취소</button>
              <button className={styles.popup_confirm} onClick={handleAddDokaksa} disabled={!dokaksaForm.subject_name.trim()}>추가</button>
            </div>
          </div>
        </div>
      )}

      {/* ── 팝업: 수강계획 추가 ── */}
      {showAddSemesterPopup && (
        <div className={styles.popup_overlay} onClick={() => setShowAddSemesterPopup(false)}>
          <div className={styles.popup} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>수강계획 추가</span>
              <button className={styles.popup_close} onClick={() => setShowAddSemesterPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>년도</label>
                <div className={styles.fd_wrap}>
                  <button
                    type="button"
                    className={`${styles.fd_trigger} ${yearDropdownOpen ? styles.fd_trigger_open : ''}`}
                    onClick={() => setYearDropdownOpen((o) => !o)}
                  >
                    <span>{newSemesterForm.year}년</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`${styles.fd_chevron} ${yearDropdownOpen ? styles.fd_chevron_open : ''}`}>
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {yearDropdownOpen && (
                    <div className={styles.fd_dropdown}>
                      {YEAR_OPTIONS.map((y) => (
                        <div key={y}
                          className={`${styles.fd_option} ${newSemesterForm.year === y ? styles.fd_option_active : ''}`}
                          onClick={() => { setNewSemesterForm((f) => ({ ...f, year: y })); setYearDropdownOpen(false); }}
                        >{y}년</div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>학기</label>
                <div className={styles.popup_radio_group}>
                  {[1, 2].map((t) => (
                    <label key={t} className={`${styles.popup_radio} ${newSemesterForm.term === t ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="semTerm" value={t} checked={newSemesterForm.term === t}
                        onChange={() => setNewSemesterForm((f) => ({ ...f, term: t }))} />{t}학기
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className={styles.popup_footer}>
              <button className={styles.popup_cancel} onClick={() => setShowAddSemesterPopup(false)}>취소</button>
              <button className={styles.popup_confirm} onClick={handleConfirmAddSemester}>추가</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
