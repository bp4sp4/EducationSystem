'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/logger';
import type { Course } from '@/types';
import styles from './page.module.css';

interface SubjectPreset {
  id: number;
  course_type: string;
  name: string;
  credits: number;
  subject_type: '필수' | '선택';
  sort_order: number;
}

// 기존 DB 데이터와 courses.name 간 매핑
function getCourseType(courseName: string): string {
  if (courseName.includes('신법')) return '신법';
  if (courseName.includes('구법')) return '구법';
  return courseName; // 새 과정은 이름 그대로 사용
}

const EMPTY_PRESET = { name: '', credits: 3, subject_type: '필수' as '필수' | '선택', sort_order: 0 };
const EMPTY_COURSE = { name: '' };

export default function AdminSubjectsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [courses, setCourses] = useState<Course[]>([]);
  const [presets, setPresets] = useState<SubjectPreset[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  // 모달
  const [showPresetModal, setShowPresetModal] = useState(false);
  const [editPreset, setEditPreset] = useState<SubjectPreset | null>(null);
  const [presetForm, setPresetForm] = useState({ ...EMPTY_PRESET });

  const [showCourseModal, setShowCourseModal] = useState(false);
  const [editCourse, setEditCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState({ ...EMPTY_COURSE });

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // 더블클릭 방지용 동기 플래그

  // super_admin 체크 + 데이터 로드
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'super_admin') { router.push('/students'); return; }

      const [coursesRes, presetsRes] = await Promise.all([
        supabase.from('courses').select('*').order('id'),
        supabase.from('subject_presets').select('*').order('sort_order'),
      ]);
      if (cancelled) return;
      const loadedCourses = (coursesRes.data ?? []) as Course[];
      setCourses(loadedCourses);
      setPresets((presetsRes.data ?? []) as SubjectPreset[]);
      if (loadedCourses.length > 0) setSelectedCourseId(loadedCourses[0].id);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const selectedCourse = courses.find(c => c.id === selectedCourseId) ?? null;
  const courseType = selectedCourse ? getCourseType(selectedCourse.name) : '';
  const coursePresets = presets.filter(p => p.course_type === courseType).sort((a, b) => a.sort_order - b.sort_order);

  // ── 과정 CRUD ────────────────────────────────────────────────
  function openAddCourse() {
    setEditCourse(null);
    setCourseForm({ ...EMPTY_COURSE });
    setShowCourseModal(true);
  }

  function openEditCourse(c: Course) {
    setEditCourse(c);
    setCourseForm({ name: c.name });
    setShowCourseModal(true);
  }

  async function handleSaveCourse() {
    if (savingRef.current || !courseForm.name.trim()) return;
    savingRef.current = true;
    setSaving(true);
    const supabase = createClient();
    if (editCourse) {
      await supabase.from('courses').update({ name: courseForm.name.trim() }).eq('id', editCourse.id);
      setCourses(prev => prev.map(c => c.id === editCourse.id ? { ...c, name: courseForm.name.trim() } : c));
      logActivity({ action: '과정 수정', target_type: 'course', target_name: courseForm.name.trim() });
    } else {
      const { data } = await supabase.from('courses').insert({ name: courseForm.name.trim() }).select().single();
      if (data) {
        setCourses(prev => [...prev, data as Course]);
        setSelectedCourseId((data as Course).id);
      }
      logActivity({ action: '과정 추가', target_type: 'course', target_name: courseForm.name.trim() });
    }
    savingRef.current = false;
    setSaving(false);
    setShowCourseModal(false);
  }

  async function handleDeleteCourse(c: Course) {
    if (!confirm(`"${c.name}" 과정을 삭제하시겠습니까?\n해당 과정의 과목 프리셋도 모두 삭제됩니다.`)) return;
    const supabase = createClient();
    const ct = getCourseType(c.name);
    await supabase.from('subject_presets').delete().eq('course_type', ct);
    await supabase.from('courses').delete().eq('id', c.id);
    setPresets(prev => prev.filter(p => p.course_type !== ct));
    const remaining = courses.filter(x => x.id !== c.id);
    setCourses(remaining);
    setSelectedCourseId(remaining[0]?.id ?? null);
    logActivity({ action: '과정 삭제', target_type: 'course', target_name: c.name });
  }

  // ── 과목 CRUD ────────────────────────────────────────────────
  function openAddPreset() {
    setEditPreset(null);
    const nextOrder = coursePresets.length > 0 ? Math.max(...coursePresets.map(p => p.sort_order)) + 1 : 1;
    setPresetForm({ ...EMPTY_PRESET, sort_order: nextOrder });
    setShowPresetModal(true);
  }

  function openEditPreset(p: SubjectPreset) {
    setEditPreset(p);
    setPresetForm({ name: p.name, credits: p.credits, subject_type: p.subject_type, sort_order: p.sort_order });
    setShowPresetModal(true);
  }

  async function handleSavePreset() {
    if (savingRef.current || !presetForm.name.trim() || !courseType) return;
    savingRef.current = true;
    setSaving(true);
    const supabase = createClient();
    if (editPreset) {
      const { error } = await supabase.from('subject_presets').update({
        name: presetForm.name.trim(),
        credits: presetForm.credits,
        subject_type: presetForm.subject_type,
        sort_order: presetForm.sort_order,
      }).eq('id', editPreset.id);
      if (error) { alert(`수정 실패: ${error.message}`); savingRef.current = false; setSaving(false); return; }
      setPresets(prev => prev.map(p => p.id === editPreset.id ? { ...p, ...presetForm, name: presetForm.name.trim() } : p));
      logActivity({ action: '과목 수정', target_type: 'subject_preset', target_name: presetForm.name.trim() });
    } else {
      const { data, error } = await supabase.from('subject_presets').insert({
        course_type: courseType,
        name: presetForm.name.trim(),
        credits: presetForm.credits,
        subject_type: presetForm.subject_type,
        sort_order: presetForm.sort_order,
      }).select().single();
      if (error) { alert(`추가 실패: ${error.message}`); savingRef.current = false; setSaving(false); return; }
      if (data) setPresets(prev => [...prev, data as SubjectPreset]);
      logActivity({ action: '과목 추가', target_type: 'subject_preset', target_name: presetForm.name.trim() });
    }
    savingRef.current = false;
    setSaving(false);
    setShowPresetModal(false);
  }

  async function handleDeletePreset(p: SubjectPreset) {
    if (!confirm(`"${p.name}" 과목을 삭제하시겠습니까?`)) return;
    const supabase = createClient();
    await supabase.from('subject_presets').delete().eq('id', p.id);
    setPresets(prev => prev.filter(x => x.id !== p.id));
    logActivity({ action: '과목 삭제', target_type: 'subject_preset', target_name: p.name });
  }

  if (loading) return <div className={styles.loading}>불러오는 중...</div>;

  return (
    <div className={styles.page}>
      {/* 좌: 과정 목록 */}
      <div className={styles.sidebar}>
        <div className={styles.sidebar_header}>
          <span className={styles.sidebar_title}>희망자격증과정</span>
          <button className={styles.icon_btn} onClick={openAddCourse} title="과정 추가">+</button>
        </div>
        <div className={styles.course_list}>
          {courses.map(c => (
            <div
              key={c.id}
              className={`${styles.course_item} ${selectedCourseId === c.id ? styles.course_item_active : ''}`}
              onClick={() => setSelectedCourseId(c.id)}
            >
              <span className={styles.course_name}>{c.name}</span>
              <div className={styles.course_actions}>
                <button className={styles.mini_btn} onClick={e => { e.stopPropagation(); openEditCourse(c); }}>수정</button>
                <button className={`${styles.mini_btn} ${styles.mini_btn_danger}`} onClick={e => { e.stopPropagation(); handleDeleteCourse(c); }}>삭제</button>
              </div>
            </div>
          ))}
          {courses.length === 0 && (
            <div className={styles.sidebar_empty}>과정이 없습니다.<br />+ 버튼으로 추가하세요.</div>
          )}
        </div>
      </div>

      {/* 우: 과목 목록 */}
      <div className={styles.content}>
        {!selectedCourse ? (
          <div className={styles.no_course}>왼쪽에서 과정을 선택하세요.</div>
        ) : (
          <>
            <div className={styles.content_header}>
              <div>
                <div className={styles.content_title}>{selectedCourse.name}</div>
                <div className={styles.content_sub}>과목 프리셋 {coursePresets.length}개</div>
              </div>
              <button className={styles.add_btn} onClick={openAddPreset}>+ 과목 추가</button>
            </div>

            <div className={styles.table_wrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>순서</th>
                    <th>과목명</th>
                    <th>학점</th>
                    <th>구분</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {coursePresets.length === 0 ? (
                    <tr><td colSpan={5} className={styles.empty}>등록된 과목이 없습니다.</td></tr>
                  ) : coursePresets.map(p => (
                    <tr key={p.id}>
                      <td className={styles.sort_order}>{p.sort_order}</td>
                      <td className={styles.subject_name}>{p.name}</td>
                      <td>{p.credits}학점</td>
                      <td>
                        <span className={`${styles.type_badge} ${p.subject_type === '필수' ? styles.type_required : styles.type_elective}`}>
                          {p.subject_type}
                        </span>
                      </td>
                      <td>
                        <div className={styles.row_actions}>
                          <button className={styles.edit_btn} onClick={() => openEditPreset(p)}>수정</button>
                          <button className={styles.delete_btn} onClick={() => handleDeletePreset(p)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* 과목 추가/수정 모달 */}
      {showPresetModal && (
        <div className={styles.overlay} onClick={() => setShowPresetModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modal_header}>
              <span className={styles.modal_title}>{editPreset ? '과목 수정' : '과목 추가'}</span>
              <button className={styles.modal_close} onClick={() => setShowPresetModal(false)}>✕</button>
            </div>
            <div className={styles.modal_body}>
              <div className={styles.field}>
                <label className={styles.label}>과목명</label>
                <input
                  className={styles.input}
                  value={presetForm.name}
                  onChange={e => setPresetForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="과목명 입력"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSavePreset()}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>학점</label>
                <div className={styles.radio_group}>
                  {[1, 2, 3, 4, 5].map(c => (
                    <label key={c} className={`${styles.radio} ${presetForm.credits === c ? styles.radio_active : ''}`}>
                      <input type="radio" checked={presetForm.credits === c} onChange={() => setPresetForm(f => ({ ...f, credits: c }))} />
                      {c}학점
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>구분</label>
                <div className={styles.radio_group}>
                  {(['필수', '선택'] as const).map(t => (
                    <label key={t} className={`${styles.radio} ${presetForm.subject_type === t ? styles.radio_active : ''}`}>
                      <input type="radio" checked={presetForm.subject_type === t} onChange={() => setPresetForm(f => ({ ...f, subject_type: t }))} />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>순서</label>
                <input
                  type="number"
                  className={styles.input}
                  value={presetForm.sort_order}
                  onChange={e => setPresetForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  min={1}
                />
              </div>
            </div>
            <div className={styles.modal_footer}>
              <button className={styles.cancel_btn} onClick={() => setShowPresetModal(false)}>취소</button>
              <button className={styles.confirm_btn} onClick={handleSavePreset} disabled={saving || !presetForm.name.trim()}>
                {saving ? '저장 중...' : editPreset ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 과정 추가/수정 모달 */}
      {showCourseModal && (
        <div className={styles.overlay} onClick={() => setShowCourseModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modal_header}>
              <span className={styles.modal_title}>{editCourse ? '과정 수정' : '과정 추가'}</span>
              <button className={styles.modal_close} onClick={() => setShowCourseModal(false)}>✕</button>
            </div>
            <div className={styles.modal_body}>
              <div className={styles.field}>
                <label className={styles.label}>과정명</label>
                <input
                  className={styles.input}
                  value={courseForm.name}
                  onChange={e => setCourseForm({ name: e.target.value })}
                  placeholder="예: 보육교사 2급"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSaveCourse()}
                />
              </div>
            </div>
            <div className={styles.modal_footer}>
              <button className={styles.cancel_btn} onClick={() => setShowCourseModal(false)}>취소</button>
              <button className={styles.confirm_btn} onClick={handleSaveCourse} disabled={saving || !courseForm.name.trim()}>
                {saving ? '저장 중...' : editCourse ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
