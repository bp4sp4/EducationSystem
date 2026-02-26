'use client';

import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/logger';
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
  credit_type: '전공' | '일반' | '교양';
}

interface DokaksaPreset {
  stage: string;
  category: string;
  name: string;
  credits: number;
  subject_type: '필수' | '선택';
  sort_order: number;
}

interface StudentDocument {
  id: string;
  student_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  doc_type: string;
  created_at: string;
}

interface Semester {
  id: number;
  year: string;
  term: number;
  class_number: number;  // 기수 (1, 2, 3...)
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
  { id: 0, year: '2025', term: 1, class_number: 1, label: '', months: '' },
  { id: 1, year: '2025', term: 2, class_number: 1, label: '', months: '' },
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

const JUNGTAE_GROUP = ['고졸', '2년제중퇴', '3년제중퇴', '4년제중퇴'];
const TWOTHREE_GRAD = ['2년제졸업', '3년제졸업'];
const GRAD_ALL = ['2년제졸업', '3년제졸업', '4년제졸업'];

function getPlanConfig(
  educationLevel: string | null,
  courseName?: string | null,
  desiredDegree?: string | null,
): PlanConfig {
  // 실습 과정은 학력과 무관하게 별도 레이아웃
  if (courseName?.includes('실습')) {
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

  const level = educationLevel ?? '';

  // 중퇴군 + 학사 → 140학점
  if (JUNGTAE_GROUP.includes(level) && desiredDegree === '학사') {
    return {
      isHighSchool: true,
      totalTarget: 140,
      subjectTarget: null,
      targets: [
        { label: '전공', categories: ['전공'], target: 60, color: '#3182F6' },
        { label: '교양', categories: ['교양'], target: 30, color: '#059669' },
        { label: '일반', categories: ['일반'], target: 50, color: '#D97706' },
      ],
    };
  }

  // 중퇴군 → 없음/전문학사 → 80학점
  if (JUNGTAE_GROUP.includes(level)) {
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

  // 2년제/3년제 졸업 + 학사 → 140학점
  if (TWOTHREE_GRAD.includes(level) && desiredDegree === '학사') {
    return {
      isHighSchool: true,
      totalTarget: 140,
      subjectTarget: null,
      targets: [
        { label: '전공', categories: ['전공'], target: 60, color: '#3182F6' },
        { label: '교양', categories: ['교양'], target: 30, color: '#059669' },
        { label: '일반', categories: ['일반'], target: 50, color: '#D97706' },
      ],
    };
  }

  // 졸업군 → 없음 → 51학점 전공만 (전적대 불필요)
  if (GRAD_ALL.includes(level)) {
    return {
      isHighSchool: false,
      totalTarget: 51,
      subjectTarget: 8,
      targets: [
        { label: '전공', categories: ['전공'], target: 51, color: '#3182F6' },
      ],
    };
  }

  // 기본값
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
  const [gubupPresets,    setGubupPresets]    = useState<{ name: string; credits: number; subject_type: '필수' | '선택' }[]>([]);
  const [prevForm, setPrevForm] = useState({ category: '전공' as SubjectCategory, name: '', credits: 3 });
  const [cbQuery,      setCbQuery]      = useState('');
  const [cbResults,    setCbResults]    = useState<{ id: string; name: string }[]>([]);
  const [cbSearching,  setCbSearching]  = useState(false);
  const cbTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showCertPopup, setShowCertPopup] = useState(false);
  const [certForm, setCertForm] = useState({ name: '', credits: 3, acquired_date: '' });

  const [showDokaksaPopup, setShowDokaksaPopup] = useState(false);
  const [dokaksaForm, setDokaksaForm] = useState({ stage: '1단계' as typeof DOKAKSA_STAGES[number], subject_name: '', credits: 4 });
  const [dokaksaPresets, setDokaksaPresets] = useState<DokaksaPreset[]>([]);

  const [showAddSemesterPopup, setShowAddSemesterPopup] = useState(false);
  const [newSemesterForm, setNewSemesterForm] = useState({ year: '2025', term: 1 });
  const [yearDropdownOpen, setYearDropdownOpen] = useState(false);

  // 전체보기
  const [showFullView, setShowFullView] = useState(false);

  // 문서 모달
  const [docModal, setDocModal] = useState<null | 'credit' | 'transcript'>(null);

  // 학점이수내역 & 성적 증명서 (파일 첨부)
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [uploadingCredit, setUploadingCredit] = useState(false);
  const [uploadingTranscript, setUploadingTranscript] = useState(false);
  const creditFileInputRef = useRef<HTMLInputElement>(null);
  const transcriptFileInputRef = useRef<HTMLInputElement>(null);
  const [previewDoc, setPreviewDoc] = useState<{ url: string; name: string; fileType: 'image' | 'pdf' | 'other' } | null>(null);

  const planConfig = useMemo(
    () => getPlanConfig(
      student?.education_level ?? null,
      student?.courses?.name ?? null,
      student?.desired_degree ?? null,
    ),
    [student?.education_level, student?.courses?.name, student?.desired_degree],
  );

  // ── 팝업 열림 시 배경 스크롤 잠금 ───────────────────────────
  const anyPopupOpen = showSubjectPopup || showGubupPopup || showPrevPopup
    || showCertPopup || showDokaksaPopup || showAddSemesterPopup || !!previewDoc || !!docModal;

  useEffect(() => {
    document.body.style.overflow = anyPopupOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [anyPopupOpen]);

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
      supabase.from('student_documents').select('*').eq('student_id', id).order('created_at', { ascending: false }),
    ]).then(async ([studentRes, subjectsRes, prevRes, certsRes, dokaksaRes, planRes, documentsRes]) => {
      const studentData = studentRes.data as Student;
      setStudent(studentData);
      let loadedSubjects = (subjectsRes.data ?? []) as Subject[];

      // 신법/구법 과정이고 과목이 아직 없으면 프리셋 자동 삽입
      const isSinbup = studentData?.courses?.name?.includes('신법');
      const isGubup  = studentData?.courses?.name?.includes('구법');
      const courseType = (isSinbup || isGubup) ? '신법' : null;
      if (courseType && loadedSubjects.length === 0) {
        const supabase = createClient();
        const { data: presets } = await supabase
          .from('subject_presets')
          .select('name, credits, subject_type')
          .eq('course_type', courseType)
          .order('sort_order');
        if (presets?.length) {
          const rows = presets.map((p) => ({
            category: '전공' as SubjectCategory,
            name: p.name,
            credits: p.credits,
            type: '이론' as const,
            subject_type: p.subject_type as '필수' | '선택',
            student_id: id,
          }));
          const { data: inserted } = await supabase.from('subjects').insert(rows).select();
          if (inserted) loadedSubjects = inserted as Subject[];
        }
      }

      if (loadedSubjects.length) setSubjects(loadedSubjects);
      if (prevRes.data?.length)      setPrevSubjects(prevRes.data as PrevSubject[]);
      if (certsRes.data?.length)     setCreditCerts(certsRes.data as CreditCert[]);
      if (dokaksaRes.data?.length)   setDokaksaList(dokaksaRes.data as DokaksaEntry[]);
      if (documentsRes.data?.length) setDocuments(documentsRes.data as StudentDocument[]);

      // class_start (쉼표 구분 다중 기수) → Semester 목록으로 파싱
      function parseClassStart(classStart: string | null): Semester[] {
        if (!classStart) return [];
        return classStart.split(',').map(v => v.trim()).filter(Boolean).flatMap((val, idx) => {
          const m = val.match(/(\d{4})년\s*(\d+)학기\s*(\d+)기/);
          if (!m) return [];
          return [{ id: idx, year: m[1], term: parseInt(m[2]), class_number: parseInt(m[3]), label: '', months: '' }];
        });
      }

      // 저장된 플랜 또는 class_start 기반 학기 초기화
      let finalSemesters: Semester[] = INITIAL_SEMESTERS;
      if (planRes.data) {
        const p = planRes.data;
        if (p.semesters?.length) {
          finalSemesters = (p.semesters as Semester[]).map((s) => ({ ...s, class_number: s.class_number ?? 1 }));
        }
        if (p.semester_subjects) setSemesterSubjects(p.semester_subjects);
        if (p.semester_dates)    setSemesterDates(p.semester_dates);
      }

      // class_start에 있는 기수 중 finalSemesters에 없는 것 추가
      const csItems = parseClassStart(studentData?.class_start ?? null);
      if (csItems.length > 0) {
        // class_start 기반이 하나도 반영 안 된 상태면 (저장된 플랜 없음) 교체
        const hasAnyMatch = csItems.some(cs =>
          finalSemesters.some(s => s.year === cs.year && s.term === cs.term && s.class_number === cs.class_number)
        );
        if (!hasAnyMatch && !planRes.data) {
          // 저장된 플랜 없음 → class_start로 완전히 초기화
          finalSemesters = csItems.map((cs, i) => ({ ...cs, id: i }));
        } else {
          // 저장된 플랜 있음 → 누락된 기수만 추가
          let nextId = Math.max(...finalSemesters.map(s => s.id)) + 1;
          for (const cs of csItems) {
            const exists = finalSemesters.some(s => s.year === cs.year && s.term === cs.term && s.class_number === cs.class_number);
            if (!exists) {
              finalSemesters = [...finalSemesters, { ...cs, id: nextId++ }];
            }
          }
        }
      }
      setSemesters(finalSemesters);
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
    // 독학사 — credit_type(전공/일반/교양)을 카테고리로 합산
    dokaksaList.forEach((d) => { map[d.credit_type] = (map[d.credit_type] ?? 0) + d.credits; });
    return map;
  }, [assignedIds, subjects, prevSubjects, dokaksaList]);

  // 자격증 학점
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
  const totalCredits  = Object.values(creditsByCategory).reduce((a, b) => a + b, 0) + certCredits;
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
    // 현재 선택된 기수(selectedSemester)에 추가
    const targetSemId = selectedSemester;
    const current     = semesterSubjects[targetSemId] ?? [];
    const curSem      = semesters.find((s) => s.id === targetSemId);

    // 같은 학기 그룹(1기+2기+... 합산) 과목 수
    const groupKey    = curSem ? `${curSem.year}-${curSem.term}` : '';
    const groupSems   = semesters.filter((s) => `${s.year}-${s.term}` === groupKey);
    const groupCount  = groupSems.reduce((sum, s) => sum + (semesterSubjects[s.id] ?? []).length, 0);

    // 연간 과목 수
    const yearCount   = curSem ? getYearSubjectCount(curSem.year) : 0;

    if (groupCount >= MAX_PER_SEMESTER) {
      alert(`${curSem?.term}학기 최대 ${MAX_PER_SEMESTER}과목까지 수강 가능합니다.\n(기수 합산 기준)`);
      return;
    }
    if (yearCount >= MAX_PER_YEAR) {
      alert(`${curSem?.year}년도 최대 ${MAX_PER_YEAR}과목까지 수강 가능합니다.\n(1학기+2학기 합산 기준)`);
      return;
    }
    setSemesterSubjects((prev) => ({
      ...prev,
      [targetSemId]: [...current, subjectId],
    }));
  }

  function handleRemoveAssigned(_semesterId: number, subjectId: number) {
    setSemesterSubjects((prev) => {
      const next = { ...prev };
      // 현재 선택된 semester의 year+term 그룹 내 어느 semester에 있는지 찾아서 삭제
      const curSem = semesters.find((s) => s.id === selectedSemester) ?? semesters[0];
      const groupKey = curSem ? `${curSem.year}-${curSem.term}` : '';
      const groupSems = semesters.filter((s) => `${s.year}-${s.term}` === groupKey);
      for (const sem of groupSems) {
        if ((next[sem.id] ?? []).includes(subjectId)) {
          next[sem.id] = (next[sem.id] ?? []).filter((id) => id !== subjectId);
          break;
        }
      }
      return next;
    });
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

  // 학기별 기본 날짜: 1학기 11월 중순~5월 초 / 2학기 5월 중순~11월 초
  function getDefaultDates(year: string, term: number): SemesterDates {
    const y = parseInt(year);
    if (term === 1) return { start: `${y - 1}-11-15`, end: `${y}-05-05` };
    return { start: `${y}-05-15`, end: `${y}-11-05` };
  }

  function handleConfirmAddSemester() {
    const newId = (semesters[semesters.length - 1]?.id ?? -1) + 1;
    const sameGroup = semesters.filter(s => s.year === newSemesterForm.year && s.term === newSemesterForm.term);
    const classNumber = sameGroup.length + 1;
    setSemesters((prev) => [...prev, { id: newId, year: newSemesterForm.year, term: newSemesterForm.term, class_number: classNumber, label: '', months: '' }]);
    setSemesterDates((prev) => ({ ...prev, [newId]: getDefaultDates(newSemesterForm.year, newSemesterForm.term) }));
    setSelectedSemester(newId);
    setShowAddSemesterPopup(false);
  }

  function handleDeleteSemester(semId: number) {
    if (semesters.length <= 1) return;
    const remaining = semesters.filter((s) => s.id !== semId);
    setSemesters(remaining);
    setSemesterSubjects((prev) => { const next = { ...prev }; delete next[semId]; return next; });
    setSemesterDates((prev) => { const next = { ...prev }; delete next[semId]; return next; });
    // 삭제된 semester가 선택된 경우, 남은 그룹의 첫 번째 또는 마지막 semester로 이동
    if (selectedSemester === semId) {
      const deletedSem = semesters.find((s) => s.id === semId);
      if (deletedSem) {
        const groupKey = `${deletedSem.year}-${deletedSem.term}`;
        const remainingGroup = remaining.filter((s) => `${s.year}-${s.term}` === groupKey);
        if (remainingGroup.length > 0) {
          setSelectedSemester(remainingGroup[0].id);
        } else {
          setSelectedSemester(remaining[remaining.length - 1]?.id ?? 0);
        }
      } else {
        setSelectedSemester(remaining[remaining.length - 1]?.id ?? 0);
      }
    }
  }

  function handleAddKisu() {
    const curSem = semesters.find((s) => s.id === selectedSemester) ?? semesters[0];
    const newId = (semesters[semesters.length - 1]?.id ?? -1) + 1;
    const sameGroup = semesters.filter((s) => s.year === curSem.year && s.term === curSem.term);
    const classNumber = sameGroup.length + 1;
    setSemesters((prev) => [...prev, {
      id: newId,
      year: curSem.year,
      term: curSem.term,
      class_number: classNumber,
      label: '',
      months: '',
    }]);
    setSemesterDates((prev) => ({ ...prev, [newId]: getDefaultDates(curSem.year, curSem.term) }));
  }

  // ── 구법 프리셋 fetch ─────────────────────────────────────────
  async function openGubupPopup() {
    setShowGubupPopup(true);
    if (gubupPresets.length > 0) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('subject_presets')
      .select('name, credits, subject_type')
      .eq('course_type', '구법')
      .order('sort_order');
    if (data) setGubupPresets(data as { name: string; credits: number; subject_type: '필수' | '선택' }[]);
  }

  // ── 핸들러: 구법 과목 추가 → 전적대 이수과목에 등록 ─────────
  async function handleAddGubupSubject(subj: { name: string; credits: number; subject_type: '필수' | '선택' }) {
    const supabase = createClient();
    const { data, error } = await supabase.from('student_prev_subjects').insert({
      student_id: id,
      category: '전공',
      name: subj.name,
      credits: subj.credits,
    }).select().single();
    if (error) { alert(`추가 실패: ${error.message}`); return; }
    setPrevSubjects((prev) => [...prev, data as PrevSubject]);
    logActivity({ action: '구법 과목 추가', target_type: 'prev_subject', target_name: subj.name, detail: student?.name });
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
    logActivity({ action: '과목 추가', target_type: 'subject', target_name: subjectForm.name, detail: student?.name });
    setSubjectForm({ category: '전공', name: '', credits: 3, type: '이론' });
    setShowSubjectPopup(false);
  }

  async function handleDeleteSubject(subjectId: number) {
    const supabase = createClient();
    const deletedSubjectName = subjects.find((s) => s.id === subjectId)?.name;
    const { error } = await supabase.from('subjects').delete().eq('id', subjectId).eq('student_id', id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    logActivity({ action: '과목 삭제', target_type: 'subject', target_name: deletedSubjectName, detail: student?.name });
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
    logActivity({ action: '전적대 과목 추가', target_type: 'prev_subject', target_name: prevForm.name, detail: student?.name });
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
    logActivity({ action: '자격증 추가', target_type: 'cert', target_name: certForm.name, detail: student?.name });
    setCertForm({ name: '', credits: 3, acquired_date: '' });
    setShowCertPopup(false);
  }

  async function handleDeleteCert(certId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('student_credit_certs').delete().eq('id', certId);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setCreditCerts((prev) => prev.filter((c) => c.id !== certId));
  }

  // ── 독학사 팝업 열기 + 프리셋 fetch ─────────────────────────
  async function openDokaksaPopup() {
    setShowDokaksaPopup(true);
    if (dokaksaPresets.length > 0) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('dokaksa_presets')
      .select('stage, category, name, credits, subject_type, sort_order')
      .order('sort_order');
    if (data) setDokaksaPresets(data as DokaksaPreset[]);
  }

  // ── 핸들러: 프리셋에서 독학사 과목 추가/제거 ────────────────
  async function handleToggleDokaksaPreset(preset: DokaksaPreset) {
    const existing = dokaksaList.find(
      (d) => d.stage === dokaksaForm.stage && d.subject_name === preset.name,
    );
    if (existing) {
      handleDeleteDokaksa(existing.id);
      return;
    }
    // 1단계 → 교양, 2/3단계 전공일치 → 전공, 아니면 일반
    const credit_type: '전공' | '일반' | '교양' =
      dokaksaForm.stage === '1단계'
        ? '교양'
        : student?.major && preset.category === student.major
          ? '전공'
          : '일반';
    const supabase = createClient();
    const { data, error } = await supabase.from('student_dokaksa').insert({
      student_id: id,
      stage: dokaksaForm.stage,
      subject_name: preset.name,
      credits: preset.credits,
      credit_type,
    }).select().single();
    if (error) { alert(`추가 실패: ${error.message}`); return; }
    setDokaksaList((prev) => [...prev, data as DokaksaEntry]);
    logActivity({ action: '독학사 추가', target_type: 'dokaksa', target_name: preset.name, detail: `${dokaksaForm.stage} ${credit_type} / ${student?.name}` });
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
    logActivity({ action: '독학사 추가', target_type: 'dokaksa', target_name: dokaksaForm.subject_name, detail: student?.name });
    setDokaksaForm({ stage: '1단계', subject_name: '', credits: 3 });
    setShowDokaksaPopup(false);
  }

  async function handleDeleteDokaksa(entryId: string) {
    const supabase = createClient();
    const { error } = await supabase.from('student_dokaksa').delete().eq('id', entryId);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setDokaksaList((prev) => prev.filter((d) => d.id !== entryId));
  }

  // ── 핸들러: 파일 업로드 (공통) ──────────────────────────────
  async function handleFileUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    docType: 'credit_history' | 'transcript',
    fileInputRef: React.RefObject<HTMLInputElement | null>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    const setUploading = docType === 'credit_history' ? setUploadingCredit : setUploadingTranscript;
    setUploading(true);
    const supabase = createClient();
    const ext = file.name.split('.').pop() ?? 'bin';
    const filePath = `${id}/${docType}/${Date.now()}.${ext}`;
    const { error: uploadError } = await supabase.storage.from('student-documents').upload(filePath, file);
    if (uploadError) { alert(`업로드 실패: ${uploadError.message}`); setUploading(false); return; }
    const { data, error: dbError } = await supabase.from('student_documents').insert({
      student_id: id,
      file_name: file.name,
      file_path: filePath,
      file_size: file.size,
      doc_type: docType,
    }).select().single();
    if (dbError) { alert(`저장 실패: ${dbError.message}`); setUploading(false); return; }
    setDocuments((prev) => [data as StudentDocument, ...prev]);
    logActivity({ action: '파일 업로드', target_type: docType, target_name: file.name, detail: student?.name });
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleDeleteDocument(doc: StudentDocument) {
    if (!confirm(`"${doc.file_name}" 파일을 삭제하시겠습니까?`)) return;
    const supabase = createClient();
    await supabase.storage.from('student-documents').remove([doc.file_path]);
    const { error } = await supabase.from('student_documents').delete().eq('id', doc.id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  }

  const creditHistoryDocs = documents.filter((d) => d.doc_type === 'credit_history');
  const transcriptDocs    = documents.filter((d) => d.doc_type === 'transcript');

  async function handlePreviewDocument(doc: StudentDocument) {
    const supabase = createClient();
    const { data } = await supabase.storage.from('student-documents').createSignedUrl(doc.file_path, 300);
    if (!data?.signedUrl) return;
    const ext = doc.file_name.split('.').pop()?.toLowerCase() ?? '';
    const fileType = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? 'image'
      : ext === 'pdf' ? 'pdf' : 'other';
    setPreviewDoc({ url: data.signedUrl, name: doc.file_name, fileType });
  }

  async function handleDownloadDocument(doc: StudentDocument) {
    const supabase = createClient();
    const { data } = await supabase.storage.from('student-documents').createSignedUrl(doc.file_path, 60);
    if (!data?.signedUrl) return;
    const res = await fetch(data.signedUrl);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = doc.file_name; a.click();
    URL.revokeObjectURL(url);
  }

  function formatFileSize(bytes: number | null) {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
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
      logActivity({ action: '플랜 저장', target_type: 'plan', target_name: student?.name });
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

  const currentSemester = semesters.find((s) => s.id === selectedSemester) ?? semesters[0];
  const currentDates    = semesterDates[selectedSemester] ?? { start: '', end: '' };

  // 같은 year+term 그룹의 모든 학기
  const selectedGroupKey       = currentSemester ? `${currentSemester.year}-${currentSemester.term}` : '';
  const selectedGroupSemesters = semesters.filter((s) => `${s.year}-${s.term}` === selectedGroupKey);

  // 그룹의 모든 과목 합산
  const currentSemesterSubjectIds = selectedGroupSemesters.flatMap((s) => semesterSubjects[s.id] ?? []);

  // ── 전체보기 ────────────────────────────────────────────────
  const ORDINALS_KR = ['첫', '두번째', '세번째', '네번째', '다섯번째', '여섯번째', '일곱번째', '여덟번째', '아홉번째', '열번째'];
  const SEM_COLORS = [
    { bg: '#EEF2FF', border: '#C7D2FE', label: '#4338CA' },
    { bg: '#ECFDF5', border: '#A7F3D0', label: '#065F46' },
    { bg: '#FFF7ED', border: '#FED7AA', label: '#C2410C' },
    { bg: '#F5F3FF', border: '#DDD6FE', label: '#5B21B6' },
    { bg: '#F0F9FF', border: '#BAE6FD', label: '#0369A1' },
    { bg: '#FFF1F2', border: '#FECDD3', label: '#9F1239' },
    { bg: '#F0FDFA', border: '#99F6E4', label: '#0F766E' },
    { bg: '#FFFBEB', border: '#FDE68A', label: '#92400E' },
    { bg: '#FDF4FF', border: '#F5D0FE', label: '#86198F' },
    { bg: '#ECFEFF', border: '#A5F3FC', label: '#0E7490' },
  ];
  // 전체보기 고정 컬럼: 전공(category), 교양(category), 실습(type)
  const FV_COLUMNS = ['전공', '교양', '실습'] as const;

  function getSemCreditByCol(semId: number, col: string) {
    const ids = semesterSubjects[semId] ?? (semesterSubjects as Record<string, number[]>)[String(semId)] ?? [];
    return ids.reduce((sum, sid) => {
      const s = subjects.find((sub) => sub.id === sid || sub.id === Number(sid));
      if (!s) return sum;
      if (col === '전공') return s.category === '전공' ? sum + s.credits : sum;
      if (col === '교양') return s.category === '교양' ? sum + s.credits : sum;
      if (col === '실습') return s.type === '실습' ? sum + s.credits : sum;
      return sum;
    }, 0);
  }

  function getTotalCreditByCol(col: string) {
    return semesters.reduce((sum, sem) => sum + getSemCreditByCol(sem.id, col), 0);
  }

  function getMonthRange(semId: number) {
    const d = semesterDates[semId];
    if (!d?.start && !d?.end) return '';
    const fmt = (s: string) => `${new Date(s).getMonth() + 1}월`;
    if (d.start && d.end) return `${fmt(d.start)}~${fmt(d.end)}`;
    return d.start ? `${fmt(d.start)}~` : '';
  }

  if (showFullView) {
    return (
      <div className={styles.fv_wrap}>
        {/* 전체보기 헤더 */}
        <div className={styles.fv_top}>
          <h2 className={styles.fv_title}>학습플랜 전체보기</h2>
          <button className={styles.fv_back_btn} onClick={() => setShowFullView(false)}>
            ← 돌아가기
          </button>
        </div>

        {/* 학생 정보 */}
        <div className={styles.fv_info_bar}>
          <span>성명: {student.name}</span>
          <span>과정: {student.courses?.name ?? '-'}</span>
          <span>담당자: {student.manager_name ?? '-'}</span>
        </div>

        {/* 메인 테이블 */}
        <table className={styles.fv_table}>
          <thead>
            <tr>
              <th className={styles.fv_th} rowSpan={2}>온라인수업 일정</th>
              <th className={styles.fv_th} rowSpan={2}>과목</th>
              <th className={styles.fv_th} colSpan={FV_COLUMNS.length}>학점</th>
            </tr>
            <tr>
              {FV_COLUMNS.map((label) => (
                <th key={label} className={styles.fv_th}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(() => {
              // 같은 year+term끼리 그룹화 (순서 유지)
              const groups: Semester[][] = [];
              const groupKeys: string[] = [];
              semesters.forEach((s) => {
                const key = `${s.year}-${s.term}`;
                const existing = groupKeys.indexOf(key);
                if (existing === -1) { groupKeys.push(key); groups.push([s]); }
                else { groups[existing].push(s); }
              });

              return groups.map((group, groupIdx) => {
                const rep = group[0];
                const ordinalLabel = (ORDINALS_KR[groupIdx] ?? `${groupIdx + 1}번째`) + '학기';
                const color = SEM_COLORS[groupIdx % SEM_COLORS.length];
                const multiKisu = group.length > 1;

                // 전체 rowSpan 계산
                const totalRows = group.reduce((sum, sem) => {
                  const subCount = Math.max((semesterSubjects[sem.id] ?? []).length, 1);
                  return sum + (multiKisu ? 1 : 0) + subCount + 1;
                }, 0);

                const leftCell = (
                  <td
                    className={styles.fv_sem_cell}
                    rowSpan={totalRows}
                    style={{ background: color.bg, borderColor: color.border }}
                  >
                    <div className={styles.fv_sem_label} style={{ color: color.label }}>{ordinalLabel}</div>
                    <div className={styles.fv_sem_meta}>{rep.year}년도 {rep.term}학기</div>
                  </td>
                );

                let leftCellPlaced = false;
                const rows: React.ReactNode[] = group.flatMap((sem) => {
                  const subjectIds = semesterSubjects[sem.id] ?? [];
                  const semSubjects = subjectIds.map((sid) => subjects.find((s) => s.id === sid)).filter(Boolean) as Subject[];
                  const monthRange = getMonthRange(sem.id);
                  const result: React.ReactNode[] = [];

                  if (multiKisu) {
                    // 기수 헤더 행
                    result.push(
                      <tr key={`kisu-${sem.id}`} className={styles.fv_kisu_row}>
                        {!leftCellPlaced && leftCell}
                        <td colSpan={1 + FV_COLUMNS.length} className={styles.fv_kisu_label}>
                          {sem.class_number}기{monthRange ? ` · ${monthRange}` : ''}
                        </td>
                      </tr>
                    );
                    leftCellPlaced = true;

                    if (semSubjects.length === 0) {
                      result.push(
                        <tr key={`empty-${sem.id}`}>
                          <td className={styles.fv_empty} colSpan={1 + FV_COLUMNS.length}>등록된 과목이 없습니다</td>
                        </tr>
                      );
                    } else {
                      semSubjects.forEach((subject) => {
                        result.push(
                          <tr key={`subj-${sem.id}-${subject.id}`}>
                            <td className={styles.fv_td}>{subject.name}</td>
                            {FV_COLUMNS.map((col) => {
                              const credits = col === '전공' && subject.category === '전공' ? subject.credits
                                : col === '교양' && subject.category === '교양' ? subject.credits
                                : col === '실습' && subject.type === '실습' ? subject.credits
                                : 0;
                              return <td key={col} className={styles.fv_credit_td}>{credits}</td>;
                            })}
                          </tr>
                        );
                      });
                    }
                  } else {
                    // 단일 기수 — 기존 방식
                    if (semSubjects.length === 0) {
                      result.push(
                        <tr key={`empty-${sem.id}`}>
                          {!leftCellPlaced && leftCell}
                          <td className={styles.fv_empty} colSpan={1 + FV_COLUMNS.length}>등록된 과목이 없습니다</td>
                        </tr>
                      );
                      leftCellPlaced = true;
                    } else {
                      semSubjects.forEach((subject, subjIdx) => {
                        result.push(
                          <tr key={`subj-${sem.id}-${subject.id}`}>
                            {subjIdx === 0 && !leftCellPlaced && leftCell}
                            <td className={styles.fv_td}>{subject.name}</td>
                            {FV_COLUMNS.map((col) => {
                              const credits = col === '전공' && subject.category === '전공' ? subject.credits
                                : col === '교양' && subject.category === '교양' ? subject.credits
                                : col === '실습' && subject.type === '실습' ? subject.credits
                                : 0;
                              return <td key={col} className={styles.fv_credit_td}>{credits}</td>;
                            })}
                          </tr>
                        );
                        if (subjIdx === 0) leftCellPlaced = true;
                      });
                    }
                  }

                  // 이수학점 소계
                  result.push(
                    <tr key={`summary-${sem.id}`} className={styles.fv_summary_row}>
                      <td className={styles.fv_summary_label}>이수학점</td>
                      {FV_COLUMNS.map((col) => (
                        <td key={col} className={styles.fv_summary_credit}>
                          <strong>{getSemCreditByCol(sem.id, col)}</strong>
                        </td>
                      ))}
                    </tr>
                  );
                  return result;
                });

                return <Fragment key={`group-${rep.year}-${rep.term}`}>{rows}</Fragment>;
              });
            })()}
            <tr className={styles.fv_total_row}>
              <td colSpan={2} className={styles.fv_total_label}>총 학점합계</td>
              {FV_COLUMNS.map((col) => (
                <td key={col} className={styles.fv_total_credit}>
                  <strong>{getTotalCreditByCol(col)}</strong>
                </td>
              ))}
            </tr>
          </tbody>
        </table>

      </div>
    );
  }

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
          <div className={styles.course_name}>{student.name}</div>
          <div className={styles.student_meta}>
            {student.courses?.name ?? '과정 미배정'}
            {student.manager_name && <><span className={styles.meta_sep}>|</span>담당자 {student.manager_name}</>}
          </div>
        </div>
        <div className={styles.header_right_group}>
          <button className={styles.header_doc_btn} onClick={() => setDocModal('credit')}>
            학점이수내역{creditHistoryDocs.length > 0 && <span className={styles.header_doc_count}>{creditHistoryDocs.length}</span>}
          </button>
          <button className={styles.header_doc_btn} onClick={() => setDocModal('transcript')}>
            성적 증명서{transcriptDocs.length > 0 && <span className={styles.header_doc_count}>{transcriptDocs.length}</span>}
          </button>
          <button className={styles.fullview_btn} onClick={() => setShowFullView(true)}>
            전체보기
          </button>
          <div className={styles.save_indicator}>
            {saving ? (
              <><span className={styles.save_dot_saving} />저장 중...</>
            ) : (
              <><span className={styles.save_dot_saved} />저장됨</>
            )}
          </div>
        </div>
      </div>

      {/* 학력 안내 배너 — 실습예정은 숨김 */}
      {!planConfig.practice && (planConfig.isHighSchool ? (
        <div className={styles.edu_banner} style={{ borderColor: '#FDE68A', background: '#FFFBEB' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
          <span className={styles.edu_banner_text}>
            <strong>{student.education_level ?? ''}</strong>
            {student.desired_degree && student.desired_degree !== '없음' && (
              <span> / 희망학위: {student.desired_degree}</span>
            )}
            {' — '}
            {planConfig.targets.map((t) => `${t.label} ${t.target}`).join(' + ')} = 총 {planConfig.totalTarget}학점
            {planConfig.totalTarget === 80 && (
              <span className={styles.edu_banner_sub}> (교양을 35학점으로 늘려 일반 대체 가능)</span>
            )}
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
              <div className={styles.stat_value}>{totalCredits}<span className={styles.stat_unit}>/ {planConfig.totalTarget}</span></div>
              <div className={styles.stat_bar_wrap}><div className={styles.stat_bar} style={{ width: `${progress}%` }} /></div>
            </div>
          </>
        ) : (
          <>
            <div className={styles.stat_card}>
              <div className={styles.stat_label}>이번 학기 과목</div>
              <div className={styles.stat_value}>{currentSemesterSubjectIds.length}<span className={styles.stat_unit}>/ 8개</span></div>
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

      {/* ── 학점인정 자격증 — 학위과정만 표시 ── */}
      {planConfig.isHighSchool && <div className={styles.credit_section}>
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
      </div>}

      {/* ── 독학사 — 학위과정(isHighSchool)인 경우만 표시 ── */}
      {planConfig.isHighSchool && <div className={styles.credit_section}>
        <div className={styles.credit_section_header}>
          <div className={styles.credit_section_title_wrap}>
            <span className={styles.section_title}>독학사</span>
            {dokaksaList.length > 0 && (
              <span className={styles.section_count_badge}>{dokaksaCredits}학점</span>
            )}
          </div>
          <button className={styles.section_add_btn} onClick={() => openDokaksaPopup()}>+ 추가</button>
        </div>

        {dokaksaList.length === 0 ? (
          <div className={styles.section_empty}>등록된 독학사 과목이 없습니다</div>
        ) : (
          <div className={styles.credit_list}>
            {dokaksaList.map((d) => (
              <div key={d.id} className={styles.credit_item}>
                <span className={styles.stage_badge}>{d.stage}</span>
                <span className={
                  d.credit_type === '전공' ? styles.dokaksa_major_badge
                  : d.credit_type === '교양' ? styles.dokaksa_gyoyang_badge
                  : styles.dokaksa_general_badge
                }>{d.credit_type}</span>
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
      </div>}

      {/* ── 전적대 이수과목 — 학위과정만 표시 ── */}
      {planConfig.isHighSchool && <div className={styles.credit_section}>
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
              <button className={styles.section_add_btn_gubup} onClick={openGubupPopup}>
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
      </div>}

      {/* ── 문서 모달 (학점이수내역 / 성적 증명서) ── */}
      {docModal && (() => {
        const isCredit = docModal === 'credit';
        const docs     = isCredit ? creditHistoryDocs : transcriptDocs;
        const title    = isCredit ? '학점이수내역' : '성적 증명서';
        const uploading = isCredit ? uploadingCredit : uploadingTranscript;
        const fileRef   = isCredit ? creditFileInputRef : transcriptFileInputRef;
        const docType   = isCredit ? 'credit_history' as const : 'transcript' as const;
        return (
          <div className={styles.doc_modal_overlay} onClick={() => setDocModal(null)}>
            <div className={styles.doc_modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.doc_modal_header}>
                <span className={styles.doc_modal_title}>{title}</span>
                <div className={styles.doc_modal_actions}>
                  <button
                    className={styles.doc_modal_upload_btn}
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? '업로드 중...' : '+ 파일 첨부'}
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileUpload(e, docType, fileRef)}
                    accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  />
                  <button className={styles.doc_modal_close} onClick={() => setDocModal(null)} aria-label="닫기">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>
              </div>
              {docs.length === 0 ? (
                <div className={styles.doc_modal_empty}>첨부된 파일이 없습니다</div>
              ) : (
                <div className={styles.doc_modal_list}>
                  {docs.map((doc) => (
                    <div key={doc.id} className={styles.doc_item}>
                      <svg className={styles.doc_icon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      </svg>
                      <span className={styles.doc_name}>{doc.file_name}</span>
                      {doc.file_size && <span className={styles.doc_size}>{formatFileSize(doc.file_size)}</span>}
                      <button className={styles.doc_preview_btn} onClick={() => handlePreviewDocument(doc)} title="미리보기">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                      </button>
                      <button className={styles.item_remove_btn} onClick={() => handleDeleteDocument(doc)} aria-label="삭제">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
                      <div className={styles.subject_card_content}>
                        <div className={styles.subject_card_top}>
                          <span className={styles.subject_name}>{subject.name}</span>
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
                        <div className={styles.subject_card_bottom}>
                          <span className={styles.credit_badge}>{subject.credits}학점</span>
                          <span className={`${styles.type_badge} ${subject.type === '실습' ? styles.type_badge_practice : ''}`}>{subject.type}</span>
                          {subject.subject_type && (
                            <span className={`${styles.subject_type_badge} ${subject.subject_type === '필수' ? styles.subject_type_required : styles.subject_type_elective}`}>
                              {subject.subject_type}
                            </span>
                          )}
                        </div>
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
            {/* 탭: year+term별로 그룹화하여 ONE 탭 */}
            {(() => {
              // 그룹 맵 생성 (순서 유지)
              const groups = new Map<string, Semester[]>();
              semesters.forEach((s) => {
                const key = `${s.year}-${s.term}`;
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key)!.push(s);
              });

              return Array.from(groups.entries()).map(([groupKey, groupSems]) => {
                const rep        = groupSems[0]; // 대표 학기
                const isActive   = selectedGroupKey === groupKey;
                const totalCount = groupSems.reduce((sum, s) => sum + (semesterSubjects[s.id] ?? []).length, 0);
                return (
                  <div key={groupKey} className={`${styles.semester_tab_wrap} ${isActive ? styles.semester_tab_wrap_active : ''}`}>
                    <button
                      className={`${styles.semester_tab} ${isActive ? styles.semester_tab_active : ''}`}
                      onClick={() => setSelectedSemester(groupSems.find(s => s.id === selectedSemester) ? selectedSemester : groupSems[0].id)}
                    >
                      <div className={styles.tab_top_row}>
                        <span className={styles.tab_year}>{String(rep.year).slice(2)}년{totalCount > 0 ? ` · ${totalCount}과목` : ''}</span>
                        {semesters.length > groupSems.length && (
                          <span
                            className={styles.tab_delete_btn}
                            onClick={(e) => { e.stopPropagation(); groupSems.forEach(s => handleDeleteSemester(s.id)); }}
                            role="button"
                            aria-label="학기 삭제"
                          >
                            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </span>
                        )}
                      </div>
                      <span className={styles.tab_term}>{rep.term}학기</span>
                    </button>
                  </div>
                );
              });
            })()}
          </div>

          <div className={styles.semester_detail}>
            <div className={styles.semester_title_big}>{currentSemester.year}년 {currentSemester.term}학기</div>

            {selectedGroupSemesters.map((sem) => {
              const dates = semesterDates[sem.id] ?? { start: '', end: '' };
              const isActivKisu = selectedSemester === sem.id;
              const multiKisu = selectedGroupSemesters.length > 1;
              return (
                <div
                  key={sem.id}
                  className={`${styles.kisu_date_block} ${multiKisu && isActivKisu ? styles.kisu_date_block_active : ''}`}
                  onClick={() => multiKisu && setSelectedSemester(sem.id)}
                  style={multiKisu ? { cursor: 'pointer' } : undefined}
                >
                  {multiKisu && (
                    <div className={styles.kisu_label_row}>
                      <span className={`${styles.kisu_label} ${isActivKisu ? styles.kisu_label_active : ''}`}>
                        {sem.class_number}기
                      </span>
                      {isActivKisu && (
                        <span className={styles.kisu_active_badge}>과목 추가 중</span>
                      )}
                      <button
                        className={styles.kisu_delete_btn}
                        onClick={(e) => { e.stopPropagation(); handleDeleteSemester(sem.id); }}
                        title={`${sem.class_number}기 삭제`}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  )}
                  <div className={styles.date_row} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.date_field}>
                      <label className={styles.date_label} htmlFor={`start-${sem.id}`}>학기 시작일</label>
                      <input id={`start-${sem.id}`} className={styles.date_input} type="date"
                        value={dates.start} onChange={(e) => handleDateChange(sem.id, 'start', e.target.value)} />
                    </div>
                    <div className={styles.date_field}>
                      <label className={styles.date_label} htmlFor={`end-${sem.id}`}>학기 종료일</label>
                      <input id={`end-${sem.id}`} className={styles.date_input} type="date"
                        value={dates.end} onChange={(e) => handleDateChange(sem.id, 'end', e.target.value)} />
                    </div>
                  </div>
                </div>
              );
            })}

            <button className={styles.kisu_add_btn} onClick={handleAddKisu}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              기수 추가
            </button>

            {currentSemesterSubjectIds.length === 0 ? (
              <div className={styles.semester_empty}>왼쪽에서 과목을 선택하세요</div>
            ) : (
              <div className={styles.assigned_list}>
                {selectedGroupSemesters.length > 1
                  ? /* 기수가 여러 개면 기수별 칩 그룹 */
                    selectedGroupSemesters.map((sem, gi) => {
                      const semIds = semesterSubjects[sem.id] ?? [];
                      return (
                        <Fragment key={sem.id}>
                          <div className={`${styles.assigned_kisu_header} ${gi > 0 ? styles.assigned_kisu_header_border : ''}`}>
                            <span className={styles.assigned_kisu_title}>{sem.class_number}기</span>
                            <span className={styles.assigned_kisu_count}>{semIds.length}과목</span>
                          </div>
                          {semIds.length === 0 ? (
                            <div className={styles.assigned_kisu_empty}>과목 없음</div>
                          ) : (
                            <div className={styles.assigned_chips}>
                              {semIds.map((subjectId) => {
                                const subject = subjects.find((s) => s.id === subjectId);
                                if (!subject) return null;
                                return (
                                  <div key={subjectId} className={styles.assigned_item}>
                                    <div className={styles.assigned_info}>
                                      <span className={styles.assigned_name}>{subject.name}</span>
                                      {subject.subject_type && (
                                        <span className={`${styles.subject_type_badge} ${subject.subject_type === '필수' ? styles.subject_type_required : styles.subject_type_elective}`}>
                                          {subject.subject_type}
                                        </span>
                                      )}
                                      <span className={styles.credit_badge}>{subject.credits}학점</span>
                                    </div>
                                    <button className={styles.assigned_remove_btn}
                                      onClick={() => handleRemoveAssigned(sem.id, subjectId)} aria-label="삭제">
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                                      </svg>
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </Fragment>
                      );
                    })
                  : /* 기수 1개 — 칩 레이아웃 */
                    <div className={styles.assigned_chips}>
                      {currentSemesterSubjectIds.map((subjectId) => {
                        const subject = subjects.find((s) => s.id === subjectId);
                        if (!subject) return null;
                        return (
                          <div key={subjectId} className={styles.assigned_item}>
                            <div className={styles.assigned_info}>
                              <span className={styles.assigned_name}>{subject.name}</span>
                              {subject.subject_type && (
                                <span className={`${styles.subject_type_badge} ${subject.subject_type === '필수' ? styles.subject_type_required : styles.subject_type_elective}`}>
                                  {subject.subject_type}
                                </span>
                              )}
                              <span className={styles.credit_badge}>{subject.credits}학점</span>
                            </div>
                            <button className={styles.assigned_remove_btn}
                              onClick={() => handleRemoveAssigned(selectedSemester, subjectId)} aria-label="삭제">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                }
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
              <p className={styles.gubup_desc}>클릭하면 과목 목록에 추가됩니다. 이미 추가된 과목은 비활성화됩니다.</p>
              {gubupPresets.length === 0 ? (
                <div className={styles.gubup_loading}>불러오는 중...</div>
              ) : (['필수', '선택'] as const).map((type) => (
                <div key={type} className={styles.gubup_group}>
                  <div className={styles.gubup_group_label}>{type}과목</div>
                  <div className={styles.gubup_list}>
                    {gubupPresets.filter((s) => s.subject_type === type).map((subj) => {
                      const existing = prevSubjects.find((s) => s.name === subj.name);
                      return (
                        <button
                          key={subj.name}
                          type="button"
                          className={`${styles.gubup_item} ${existing ? styles.gubup_item_done : ''}`}
                          onClick={() => existing ? handleDeletePrevSubject(existing.id) : handleAddGubupSubject(subj)}
                        >
                          <span className={styles.gubup_item_name}>{subj.name}</span>
                          <span className={styles.gubup_item_credit}>{subj.credits}학점</span>
                          {existing
                            ? <span className={styles.gubup_item_check}>✓</span>
                            : <span className={styles.gubup_item_add}>+</span>
                          }
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
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
          <div className={`${styles.popup} ${styles.popup_wide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.popup_header}>
              <span className={styles.popup_title}>독학사 과목 추가</span>
              <button className={styles.popup_close} onClick={() => setShowDokaksaPopup(false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className={styles.popup_body}>
              {/* 단계 선택 */}
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>단계</label>
                <div className={styles.popup_radio_group}>
                  {(['1단계', '2단계', '3단계'] as const).map((s) => (
                    <label key={s} className={`${styles.popup_radio} ${dokaksaForm.stage === s ? styles.popup_radio_active : ''}`}>
                      <input type="radio" name="dStage" value={s} checked={dokaksaForm.stage === s}
                        onChange={() => setDokaksaForm((f) => ({ ...f, stage: s }))} />{s}
                    </label>
                  ))}
                </div>
              </div>

              {/* 카테고리별 프리셋 목록 */}
              {(() => {
                const stagePresets = dokaksaPresets.filter((p) => p.stage === dokaksaForm.stage);
                const studentMajor = student?.major ?? null;
                // 2단계는 학생 전공 카테고리를 먼저, 나머지는 뒤로
                const allCats = Array.from(new Set(stagePresets.map((p) => p.category)));
                const categories = dokaksaForm.stage === '2단계' && studentMajor
                  ? [studentMajor, ...allCats.filter((c) => c !== studentMajor)]
                  : allCats;
                return stagePresets.length > 0 ? (
                  <>
                    <p className={styles.gubup_desc}>클릭하면 추가/제거됩니다.{dokaksaForm.stage === '2단계' && studentMajor && ` 학생 전공: ${studentMajor}`}</p>
                    {categories.map((cat) => {
                      const isMajorMatch = dokaksaForm.stage === '2단계' && studentMajor === cat;
                      const items = stagePresets.filter((p) => p.category === cat);
                      if (items.length === 0) return null;
                      return (
                        <div key={cat} className={styles.gubup_group}>
                          <div className={styles.gubup_group_label}>
                            {cat}
                            {(dokaksaForm.stage === '2단계' || dokaksaForm.stage === '3단계') && (
                              <span className={isMajorMatch ? styles.dokaksa_major_badge : styles.dokaksa_general_badge}>
                                {isMajorMatch ? '전공' : '일반'}
                              </span>
                            )}
                          </div>
                          <div className={styles.gubup_list}>
                            {items.map((preset) => {
                              const existing = dokaksaList.find(
                                (d) => d.stage === dokaksaForm.stage && d.subject_name === preset.name,
                              );
                              return (
                                <button key={preset.name} type="button"
                                  className={`${styles.gubup_item} ${existing ? styles.gubup_item_done : ''}`}
                                  onClick={() => handleToggleDokaksaPreset(preset)}>
                                  <span className={styles.gubup_item_name}>{preset.name}</span>
                                  <span className={styles.gubup_item_credit}>{preset.credits}학점</span>
                                  {existing
                                    ? <span className={styles.gubup_item_check}>✓</span>
                                    : <span className={styles.gubup_item_add}>+</span>}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    <div className={styles.dokaksa_divider} />
                  </>
                ) : (
                  <p className={styles.gubup_desc}>해당 단계의 과목 목록이 준비 중입니다.</p>
                );
              })()}

              {/* 수기 입력 */}
              <div className={styles.popup_field}>
                <label className={styles.popup_label}>직접 입력</label>
                <input className={styles.popup_input} placeholder="과목명 직접 입력" value={dokaksaForm.subject_name}
                  onChange={(e) => setDokaksaForm((f) => ({ ...f, subject_name: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddDokaksa(); }} />
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
              <button className={styles.popup_cancel} onClick={() => setShowDokaksaPopup(false)}>닫기</button>
              <button className={styles.popup_confirm} onClick={handleAddDokaksa} disabled={!dokaksaForm.subject_name.trim()}>직접 추가</button>
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

      {/* ── 파일 미리보기 모달 ── */}
      {previewDoc && (
        <div className={styles.popup_overlay} onClick={() => setPreviewDoc(null)}>
          <div className={styles.preview_modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.preview_header}>
              <span className={styles.preview_title}>{previewDoc.name}</span>
              <button className={styles.popup_close} onClick={() => setPreviewDoc(null)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div className={styles.preview_body}>
              {previewDoc.fileType === 'image' ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewDoc.url} alt={previewDoc.name} className={styles.preview_img} />
              ) : previewDoc.fileType === 'pdf' ? (
                <iframe src={previewDoc.url} className={styles.preview_iframe} title={previewDoc.name} />
              ) : (
                <div className={styles.preview_unsupported}>
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#8B95A1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  </svg>
                  <p>이 파일 형식은 미리보기를 지원하지 않습니다</p>
                  <a href={previewDoc.url} download={previewDoc.name} className={styles.preview_dl_link}>
                    파일 다운로드
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
