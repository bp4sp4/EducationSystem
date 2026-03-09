'use client';

import { useState, useEffect, useRef } from 'react';
import type { Student, Course, EducationCenter, StudentFormData, EducationLevel, DesiredDegree } from '@/types';
import styles from './StudentModal.module.css';
import ModalSelect from './ModalSelect';
import { createClient } from '@/lib/supabase/client';

const EDUCATION_LEVELS: EducationLevel[] = [
  '고졸', '2년제중퇴', '2년제졸업', '3년제중퇴', '3년제졸업', '4년제중퇴', '4년제졸업',
];

const STATUSES = ['등록', '수료', '환불'] as const;

const DEFAULT_COURSES: Course[] = [
  { id: 1, name: '사회복지사2급(구법)', created_at: '' },
  { id: 2, name: '사회복지사2급(신법)', created_at: '' },
  { id: 3, name: '사회복지사 실습', created_at: '' },
];

const DEFAULT_CENTERS = ['한평생교육', '서사평', '올티칭'];

const EDUCATION_LEVELS_WITH_MAJOR: EducationLevel[] = [
  '2년제졸업', '3년제졸업', '4년제졸업',
];

function getDesiredDegreeOptions(level: EducationLevel | ''): DesiredDegree[] {
  if (!level || level === '4년제졸업') return [];
  if (level === '2년제졸업' || level === '3년제졸업') return ['없음', '학사'];
  return ['전문학사', '학사'];
}

interface Props {
  student?: Student | null;
  courses: Course[];
  centers: EducationCenter[];
  onClose: () => void;
  onSubmit: (data: StudentFormData) => Promise<void>;
}

const EMPTY_FORM: StudentFormData = {
  name: '',
  phone: '',
  education_level: '',
  major: '',
  desired_degree: '',
  status: '등록',
  course_id: '',
  manager_name: '',
  cost: '',
  class_start: '',
  target_completion_date: '',
  education_center_name: '',
  all_care: false,
  notes: '',
};

export default function StudentModal({ student, courses, centers, onClose, onSubmit }: Props) {
  const [form, setForm] = useState<StudentFormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [classStartInput, setClassStartInput] = useState('');
  const [majorSuggestions, setMajorSuggestions] = useState<string[]>([]);
  const [majorOpen, setMajorOpen] = useState(false);
  const majorRef = useRef<HTMLDivElement>(null);

  const [centerInput, setCenterInput] = useState('');
  const [centerOpen, setCenterOpen] = useState(false);
  const centerRef = useRef<HTMLDivElement>(null);

  const [allcareStatus, setAllcareStatus] = useState<{
    loading: boolean;
    subscribed: boolean | null;
    found: boolean | null;
    plan?: string;
    status?: string;
  }>({ loading: false, subscribed: null, found: null });
  const allcareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('credit_cert_presets')
      .select('bachelor_major')
      .not('bachelor_major', 'is', null)
      .then(({ data }) => {
        if (!data) return;
        const set = new Set<string>();
        data.forEach((row) => {
          row.bachelor_major?.split(',').forEach((m: string) => {
            const trimmed = m.trim();
            if (trimmed) set.add(trimmed);
          });
        });
        setMajorSuggestions(Array.from(set).sort());
      });
  }, []);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (majorRef.current && !majorRef.current.contains(e.target as Node)) setMajorOpen(false);
      if (centerRef.current && !centerRef.current.contains(e.target as Node)) setCenterOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // 이름 + 전화번호 변경 시 올케어 DB 실시간 조회 (디바운스 800ms)
  useEffect(() => {
    const name = form.name.trim();
    const phone = form.phone.trim();
    if (!name || !phone || phone.replace(/-/g, '').length < 10) {
      setAllcareStatus({ loading: false, subscribed: null, found: null });
      return;
    }
    if (allcareTimer.current) clearTimeout(allcareTimer.current);
    setAllcareStatus((prev) => ({ ...prev, loading: true }));
    allcareTimer.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/allcare-check?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(phone)}`);
        const data = await res.json();
        setAllcareStatus({ loading: false, subscribed: data.subscribed, found: data.found, plan: data.plan, status: data.status });
        if (data.subscribed === true) set('all_care', true);
        if (data.subscribed === false) set('all_care', false);
      } catch {
        setAllcareStatus({ loading: false, subscribed: null, found: null });
      }
    }, 800);
    return () => { if (allcareTimer.current) clearTimeout(allcareTimer.current); };
  }, [form.name, form.phone]);

  const courseList = courses.length > 0 ? courses : DEFAULT_COURSES;
  const centerSuggestions = centers.length > 0 ? centers.map((c) => c.name) : DEFAULT_CENTERS;

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name,
        phone: student.phone ?? '',
        education_level: student.education_level ?? '',
        major: student.major ?? '',
        desired_degree: student.desired_degree ?? '',
        status: student.status,
        course_id: student.course_id ?? '',
        manager_name: student.manager_name ?? '',
        cost: student.cost?.toString() ?? '',
        class_start: student.class_start ?? '',
        target_completion_date: student.target_completion_date ?? '',
        education_center_name: student.education_center_name ?? '',
        all_care: student.all_care,
        notes: student.notes ?? '',
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [student]);

  function set<K extends keyof StudentFormData>(key: K, value: StudentFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handlePhone(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    let formatted = d;
    if (d.length > 7)      formatted = `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
    else if (d.length > 3) formatted = `${d.slice(0,3)}-${d.slice(3)}`;
    set('phone', formatted);
  }

  function handleCost(raw: string) {
    const digits = raw.replace(/[^\d]/g, '');
    set('cost', digits);
  }

  function displayCost(val: string) {
    if (!val) return '';
    return Number(val).toLocaleString();
  }

  const selectedCourseName = courseList.find((c) => c.id === Number(form.course_id))?.name ?? '';
  const isRehabCourse = selectedCourseName.includes('실습');
  const degreeOptions = isRehabCourse ? [] : getDesiredDegreeOptions(form.education_level);
  const showDesiredDegree = degreeOptions.length > 0;

  // 등록 교육원 태그 관련
  const centerTags = form.education_center_name.split(',').map(s => s.trim()).filter(Boolean);

  function addCenter(val: string) {
    if (!val || centerTags.includes(val)) return;
    set('education_center_name', [...centerTags, val].join(','));
  }

  function removeCenter(idx: number) {
    set('education_center_name', centerTags.filter((_, i) => i !== idx).join(','));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await onSubmit(form);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal}>
        <div className={styles.modal_header}>
          <h2 className={styles.modal_title}>{student ? '학생 정보 수정' : '학생 추가'}</h2>
          <button className={styles.modal_close} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.modal_body}>
            <div className={styles.form_grid}>

              {/* 이름 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>이름<span className={styles.form_required}>*</span></label>
                <input className={styles.form_input} placeholder="이름 입력" value={form.name}
                  onChange={(e) => set('name', e.target.value)} required />
              </div>

              {/* 전화번호 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>전화번호</label>
                <input className={styles.form_input} placeholder="010-0000-0000"
                  value={form.phone} inputMode="numeric"
                  onChange={(e) => handlePhone(e.target.value)} />
              </div>

              {/* 최종학력 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>최종학력</label>
                <ModalSelect
                  value={form.education_level}
                  placeholder="선택"
                  options={EDUCATION_LEVELS.map((l) => ({ value: l, label: l }))}
                  onChange={(val) => {
                    set('education_level', val as EducationLevel | '');
                    if (!EDUCATION_LEVELS_WITH_MAJOR.includes(val as EducationLevel)) set('major', '');
                    if (val === '4년제졸업') set('desired_degree', '');
                  }}
                />
              </div>

              {/* 학과(전공) */}
              {EDUCATION_LEVELS_WITH_MAJOR.includes(form.education_level as EducationLevel) && (
                <div className={styles.form_field}>
                  <label className={styles.form_label}>학과 (전공)</label>
                  <div className={styles.major_wrap} ref={majorRef}>
                    <input
                      className={styles.major_input}
                      placeholder="전공 검색 또는 직접 입력"
                      value={form.major}
                      onChange={(e) => { set('major', e.target.value); setMajorOpen(true); }}
                      onFocus={() => setMajorOpen(true)}
                      autoComplete="off"
                    />
                    <svg
                      width="12" height="12" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      className={`${styles.major_chevron} ${majorOpen ? styles.major_chevron_open : ''}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                    {majorOpen && (
                      <div className={styles.major_dropdown}>
                        {majorSuggestions
                          .filter((m) => !form.major || m.includes(form.major))
                          .map((m) => (
                            <div
                              key={m}
                              className={`${styles.major_option} ${form.major === m ? styles.major_option_active : ''}`}
                              onMouseDown={(e) => { e.preventDefault(); set('major', m); setMajorOpen(false); }}
                            >
                              {m}
                            </div>
                          ))}
                        {majorSuggestions.filter((m) => !form.major || m.includes(form.major)).length === 0 && (
                          <div className={styles.major_option} style={{ color: 'var(--color-text-tertiary)', cursor: 'default' }}>
                            일치하는 전공 없음
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 상태 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>상태<span className={styles.form_required}>*</span></label>
                <ModalSelect
                  value={form.status}
                  placeholder="선택"
                  options={STATUSES.map((s) => ({ value: s, label: s }))}
                  onChange={(val) => val && set('status', val as StudentFormData['status'])}
                />
              </div>

              {/* 희망자격증과정 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>희망자격증과정</label>
                <ModalSelect
                  value={form.course_id !== '' ? String(form.course_id) : ''}
                  placeholder="선택"
                  options={courseList.map((c) => ({ value: String(c.id), label: c.name }))}
                  onChange={(val) => {
                    set('course_id', val ? Number(val) : '');
                    const name = courseList.find((c) => c.id === Number(val))?.name ?? '';
                    if (name.includes('실습')) set('desired_degree', '');
                  }}
                />
              </div>

              {/* 희망학위과정 */}
              {showDesiredDegree && (
                <div className={styles.form_field}>
                  <label className={styles.form_label}>희망학위과정</label>
                  <ModalSelect
                    value={form.desired_degree}
                    placeholder="선택"
                    options={degreeOptions.map((d) => ({ value: d, label: d }))}
                    onChange={(val) => set('desired_degree', val as DesiredDegree | '')}
                  />
                </div>
              )}

              {/* 담당자 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>담당자</label>
                <input className={styles.form_input} placeholder="담당자 이름 입력"
                  value={form.manager_name} onChange={(e) => set('manager_name', e.target.value)} />
              </div>

              {/* 등록교육원 (콤보박스) */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>등록교육원</label>
                {centerTags.length > 0 && (
                  <div className={styles.center_tags}>
                    {centerTags.map((tag, i) => (
                      <span key={i} className={styles.class_start_tag}>
                        {tag}
                        <button type="button" className={styles.class_start_tag_remove}
                          onClick={() => removeCenter(i)}>✕</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className={styles.major_wrap} ref={centerRef}>
                  <input
                    className={styles.major_input}
                    placeholder="교육원 검색 또는 직접 입력"
                    value={centerInput}
                    onChange={(e) => { setCenterInput(e.target.value); setCenterOpen(true); }}
                    onFocus={() => setCenterOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = centerInput.trim();
                        if (val) { addCenter(val); setCenterInput(''); setCenterOpen(false); }
                      }
                    }}
                    autoComplete="off"
                  />
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    className={`${styles.major_chevron} ${centerOpen ? styles.major_chevron_open : ''}`}
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  {centerOpen && (
                    <div className={styles.major_dropdown}>
                      {centerSuggestions
                        .filter((c) => !centerTags.includes(c) && (!centerInput || c.includes(centerInput)))
                        .map((c) => (
                          <div
                            key={c}
                            className={styles.major_option}
                            onMouseDown={(e) => { e.preventDefault(); addCenter(c); setCenterInput(''); setCenterOpen(false); }}
                          >
                            {c}
                          </div>
                        ))}
                      {centerInput.trim() && !centerSuggestions.includes(centerInput.trim()) && (
                        <div
                          className={styles.major_option}
                          style={{ color: 'var(--color-primary)', fontWeight: 600 }}
                          onMouseDown={(e) => { e.preventDefault(); addCenter(centerInput.trim()); setCenterInput(''); setCenterOpen(false); }}
                        >
                          + &quot;{centerInput.trim()}&quot; 추가
                        </div>
                      )}
                      {centerSuggestions.filter((c) => !centerTags.includes(c) && (!centerInput || c.includes(centerInput))).length === 0
                        && !centerInput.trim() && (
                        <div className={styles.major_option} style={{ color: 'var(--color-text-tertiary)', cursor: 'default' }}>
                          추가 가능한 교육원 없음
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 개강반 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>개강반 (기수)</label>
                <div className={styles.class_start_wrap}>
                  {form.class_start.split(',').filter(Boolean).map((tag, i) => (
                    <span key={i} className={styles.class_start_tag}>
                      {tag}
                      <button type="button" className={styles.class_start_tag_remove}
                        onClick={() => {
                          const tags = form.class_start.split(',').filter(Boolean);
                          set('class_start', tags.filter((_, idx) => idx !== i).join(','));
                        }}>✕</button>
                    </span>
                  ))}
                  <input
                    className={styles.class_start_input}
                    placeholder="예: 202511 → 2025년 1학기 1기"
                    value={classStartInput}
                    inputMode="numeric"
                    onChange={(e) => {
                      const raw = e.target.value;
                      const prevDigits = classStartInput.replace(/\D/g, '');
                      const newDigits = raw.replace(/\D/g, '').slice(0, 7);
                      const effectiveDigits = newDigits === prevDigits && raw.length < classStartInput.length
                        ? newDigits.slice(0, -1) : newDigits;
                      if (!effectiveDigits) { setClassStartInput(''); return; }
                      if (effectiveDigits.length < 4) { setClassStartInput(effectiveDigits); return; }
                      if (effectiveDigits.length === 4) { setClassStartInput(`${effectiveDigits}년 `); return; }
                      if (effectiveDigits.length === 5) { setClassStartInput(`${effectiveDigits.slice(0,4)}년 ${effectiveDigits.slice(4)}학기 `); return; }
                      setClassStartInput(`${effectiveDigits.slice(0,4)}년 ${effectiveDigits.slice(4,5)}학기 ${effectiveDigits.slice(5)}기`);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const val = classStartInput.trim();
                        const tags = form.class_start.split(',').filter(Boolean);
                        if (val && !tags.includes(val)) set('class_start', [...tags, val].join(','));
                        setClassStartInput('');
                      }
                    }}
                  />
                  {classStartInput.trim() && (
                    <button type="button" className={styles.class_start_add_btn}
                      onClick={() => {
                        const val = classStartInput.trim();
                        const tags = form.class_start.split(',').filter(Boolean);
                        if (val && !tags.includes(val)) set('class_start', [...tags, val].join(','));
                        setClassStartInput('');
                      }}>+</button>
                  )}
                </div>
              </div>

              {/* 비용 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>비용</label>
                <div className={styles.input_suffix_wrap}>
                  <input className={styles.form_input} inputMode="numeric" placeholder="0"
                    value={displayCost(form.cost)}
                    onChange={(e) => handleCost(e.target.value)} />
                  <span className={styles.input_suffix}>원</span>
                </div>
              </div>

              {/* 목표취득예정일 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>목표취득예정일</label>
                <input className={styles.form_input} type="date"
                  value={form.target_completion_date}
                  onChange={(e) => set('target_completion_date', e.target.value)} />
              </div>

              {/* 올케어 가입여부 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>
                  올케어 가입여부
                  {allcareStatus.loading && (
                    <span className={styles.allcare_badge_checking}>조회 중...</span>
                  )}
                  {!allcareStatus.loading && allcareStatus.subscribed === true && (
                    <span className={styles.allcare_badge_active}>
                      ● 올케어 활성{allcareStatus.plan ? ` · ${allcareStatus.plan}` : ''}
                    </span>
                  )}
                  {!allcareStatus.loading && allcareStatus.subscribed === false && allcareStatus.found === true && (
                    <span className={styles.allcare_badge_inactive}>● 미구독</span>
                  )}
                  {!allcareStatus.loading && allcareStatus.subscribed === false && allcareStatus.found === false && (
                    <span className={styles.allcare_badge_notfound}>● 미가입</span>
                  )}
                </label>
                <div className={styles.allcare_group}>
                  <button type="button"
                    className={`${styles.allcare_btn} ${form.all_care ? styles.allcare_btn_active_o : ''}`}
                    onClick={() => set('all_care', true)}>O</button>
                  <button type="button"
                    className={`${styles.allcare_btn} ${!form.all_care ? styles.allcare_btn_active_x : ''}`}
                    onClick={() => set('all_care', false)}>X</button>
                </div>
              </div>

              {/* 특이사항/메모 */}
              <div className={`${styles.form_field} ${styles.form_field_full}`}>
                <label className={styles.form_label}>특이사항 / 메모</label>
                <textarea className={styles.form_textarea} placeholder="특이사항 또는 메모를 입력하세요"
                  value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </div>

            </div>
          </div>

          <div className={styles.modal_footer}>
            <button type="button" className={styles.cancel_btn} onClick={onClose}>취소</button>
            <button type="submit" className={styles.submit_btn} disabled={loading}>
              {loading ? '저장 중...' : student ? '수정하기' : '학생 추가'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
