'use client';

import { useState, useEffect } from 'react';
import type { Student, Course, EducationCenter, StudentFormData } from '@/types';
import styles from './StudentModal.module.css';

const EDUCATION_LEVELS = ['고등학교졸업', '전문대졸업', '대학교재학', '대학교졸업'] as const;
const STATUSES = ['등록', '수료'] as const;

const DEFAULT_COURSES: Course[] = [
  { id: 1, name: '사회복지사 2급 (신법)', created_at: '' },
  { id: 2, name: '사회복지사 2급 (구법)', created_at: '' },
  { id: 3, name: '사회복지사 (실습예정)', created_at: '' },
];

const DEFAULT_CENTERS = ['한평생교육', '서사평', '올티칭'];

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

  const courseList = courses.length > 0 ? courses : DEFAULT_COURSES;
  const centerSuggestions = centers.length > 0 ? centers.map((c) => c.name) : DEFAULT_CENTERS;

  useEffect(() => {
    if (student) {
      setForm({
        name: student.name,
        phone: student.phone ?? '',
        education_level: student.education_level ?? '',
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

  // 전화번호 자동 하이픈
  function handlePhone(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 11);
    let formatted = d;
    if (d.length > 7)       formatted = `${d.slice(0,3)}-${d.slice(3,7)}-${d.slice(7)}`;
    else if (d.length > 3)  formatted = `${d.slice(0,3)}-${d.slice(3)}`;
    set('phone', formatted);
  }

  // 개강반 자동 포맷: 숫자만 추출 → 2025년 1기
  function handleClassStart(raw: string) {
    const prevDigits = form.class_start.replace(/\D/g, '');
    const newDigits = raw.replace(/\D/g, '').slice(0, 6);
    // 포맷 문자(년/기/공백)를 지우려 할 때 → 숫자 하나 제거
    const effectiveDigits =
      newDigits === prevDigits && raw.length < form.class_start.length
        ? newDigits.slice(0, -1)
        : newDigits;
    if (!effectiveDigits) { set('class_start', ''); return; }
    if (effectiveDigits.length < 4) { set('class_start', effectiveDigits); return; }
    if (effectiveDigits.length === 4) { set('class_start', `${effectiveDigits}년 `); return; }
    set('class_start', `${effectiveDigits.slice(0, 4)}년 ${effectiveDigits.slice(4)}기`);
  }

  // 비용 콤마 포맷 (form.cost는 숫자 문자열로 저장)
  function handleCost(raw: string) {
    const digits = raw.replace(/[^\d]/g, '');
    set('cost', digits);
  }

  function displayCost(val: string) {
    if (!val) return '';
    return Number(val).toLocaleString();
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
                <select className={styles.form_select} value={form.education_level}
                  onChange={(e) => set('education_level', e.target.value as StudentFormData['education_level'])}>
                  <option value="">선택</option>
                  {EDUCATION_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>

              {/* 상태 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>상태<span className={styles.form_required}>*</span></label>
                <select className={styles.form_select} value={form.status}
                  onChange={(e) => set('status', e.target.value as StudentFormData['status'])} required>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* 과정 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>과정</label>
                <select className={styles.form_select} value={form.course_id}
                  onChange={(e) => set('course_id', e.target.value ? Number(e.target.value) : '')}>
                  <option value="">선택</option>
                  {courseList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              {/* 담당자 - 직접 입력 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>담당자</label>
                <input className={styles.form_input} placeholder="담당자 이름 입력"
                  value={form.manager_name} onChange={(e) => set('manager_name', e.target.value)} />
              </div>

              {/* 등록교육원 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>등록교육원</label>
                <input
                  className={styles.form_input}
                  placeholder="교육원명 입력"
                  value={form.education_center_name}
                  onChange={(e) => set('education_center_name', e.target.value)}
                />
              </div>

              {/* 개강반 */}
              <div className={styles.form_field}>
                <label className={styles.form_label}>개강반</label>
                <input className={styles.form_input} placeholder="예: 2025Y1X → 2025년도 1기"
                  value={form.class_start} onChange={(e) => handleClassStart(e.target.value)} />
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
              <div className={`${styles.form_field} ${styles.form_field_full}`}>
                <label className={styles.form_label}>올케어 가입여부</label>
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
