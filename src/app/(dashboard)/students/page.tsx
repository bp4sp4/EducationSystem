'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import StudentModal from '@/components/StudentModal';
import FilterDropdown from '@/components/FilterDropdown';
import type { Student, Course, EducationCenter, StudentFormData, MonthlyEnrollment } from '@/types';
import styles from './page.module.css';

const STATUS_MAP = {
  등록:              { label: '등록',           cls: styles.badge_enrolled  },
  '사회복지사-실습예정': { label: '실습예정',      cls: styles.badge_practice  },
  수료:              { label: '수료',           cls: styles.badge_completed },
} as const;

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatPhone(phone: string | null) {
  if (!phone) return '-';
  return phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
}

export default function StudentsPage() {
  const supabase = createClient();
  const router = useRouter();

  const [students, setStudents] = useState<Student[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [centers, setCenters] = useState<EducationCenter[]>([]);
  const [monthly, setMonthly] = useState<MonthlyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Student | null>(null);

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCenter, setFilterCenter] = useState('');
  const [filterBatch, setFilterBatch] = useState('');
  const [filterManager, setFilterManager] = useState('');
  const [filterCourse, setFilterCourse] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [studentsRes, coursesRes, centersRes] = await Promise.all([
      supabase.from('students').select('*, courses(*)').order('registered_at', { ascending: false }),
      supabase.from('courses').select('*').order('id'),
      supabase.from('education_centers').select('*').order('id'),
    ]);

    if (studentsRes.error) console.error('학생 조회 에러:', studentsRes.error.message, studentsRes.error.code, studentsRes.error.details, studentsRes.error.hint);

    const data = (studentsRes.data as Student[]) ?? [];
    setStudents(data);
    setCourses((coursesRes.data as Course[]) ?? []);
    setCenters((centersRes.data as EducationCenter[]) ?? []);

    const monthMap: Record<string, number> = {};
    data.forEach((s) => {
      const d = new Date(s.registered_at);
      const key = `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, '0')}월`;
      monthMap[key] = (monthMap[key] ?? 0) + 1;
    });
    setMonthly(
      Object.entries(monthMap)
        .map(([month, count]) => ({ month, count }))
        .sort((a, b) => b.month.localeCompare(a.month))
    );
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const batches = Array.from(new Set(students.map((s) => s.class_start).filter(Boolean))) as string[];
  const managers = Array.from(new Set(students.map((s) => s.manager_name).filter(Boolean))) as string[];
  const centerNames = Array.from(new Set(students.map((s) => s.education_center_name).filter(Boolean))) as string[];

  const filtered = students.filter((s) => {
    const q = search.toLowerCase();
    if (q && !s.name.toLowerCase().includes(q) && !(s.phone ?? '').includes(q)) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterCenter && s.education_center_name !== filterCenter) return false;
    if (filterBatch && s.class_start !== filterBatch) return false;
    if (filterManager && s.manager_name !== filterManager) return false;
    if (filterCourse && String(s.course_id) !== filterCourse) return false;
    return true;
  });

  const total = students.length;
  const enrolled = students.filter((s) => s.status === '등록').length;
  const completed = students.filter((s) => s.status === '수료').length;

  async function handleSubmit(data: StudentFormData) {
    const payload = {
      name: data.name,
      phone: data.phone || null,
      education_level: data.education_level || null,
      status: data.status,
      course_id: data.course_id || null,
      manager_name: data.manager_name || null,
      cost: data.cost ? Number(data.cost) : null,
      class_start: data.class_start || null,
      target_completion_date: data.target_completion_date || null,
      education_center_name: data.education_center_name || null,
      all_care: data.all_care,
      notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };
    if (editTarget) {
      const { error } = await supabase.from('students').update(payload).eq('id', editTarget.id);
      if (error) { alert(`수정 실패: ${error.message}`); return; }
    } else {
      const { error } = await supabase.from('students').insert(payload);
      if (error) { alert(`등록 실패: ${error.message}`); return; }
    }
    await fetchAll();
  }

  async function handleDelete(id: string) {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    await fetchAll();
  }

  return (
    <>
      {/* 상단 요약 */}
      <div className={styles.summary_row}>
        <div className={styles.monthly_card}>
          <div className={styles.monthly_card_title}>월별 등록 현황</div>
          <div className={styles.monthly_list}>
            {monthly.length === 0 ? (
              <div className={styles.monthly_empty}>데이터 없음</div>
            ) : (() => {
              const max = Math.max(...monthly.map((m) => m.count));
              return monthly.map((m) => (
                <div key={m.month} className={styles.monthly_item}>
                  <span className={styles.monthly_month}>{m.month}</span>
                  <div className={styles.monthly_bar_wrap}>
                    <div
                      className={styles.monthly_bar}
                      style={{ width: `${(m.count / max) * 100}%` }}
                    />
                  </div>
                  <span className={styles.monthly_count}>{m.count}명</span>
                </div>
              ));
            })()}
          </div>
        </div>

        <div className={styles.stats_grid}>
          <div className={styles.stat_card}>
            <div className={styles.stat_card_label}>전체 학생</div>
            <div className={styles.stat_card_value}>{total}</div>
          </div>
          <div className={`${styles.stat_card} ${styles.stat_card_enrolled}`}>
            <div className={styles.stat_card_label}>등록 학생</div>
            <div className={styles.stat_card_value}>{enrolled}</div>
          </div>
          <div className={`${styles.stat_card} ${styles.stat_card_completed}`}>
            <div className={styles.stat_card_label}>수료 학생</div>
            <div className={styles.stat_card_value}>{completed}</div>
          </div>
        </div>
      </div>

      {/* 필터 바 */}
      <div className={styles.filter_bar}>
        <div className={styles.filter_search_wrap}>
          <svg className={styles.filter_search_icon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input className={styles.filter_search} placeholder="이름 또는 전화번호로 검색..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <FilterDropdown
          value={filterCenter}
          onChange={setFilterCenter}
          placeholder="전체 교육원"
          options={centerNames.map((n) => ({ value: n, label: n }))}
        />

        <FilterDropdown
          value={filterBatch}
          onChange={setFilterBatch}
          placeholder="전체 기수"
          options={batches.map((b) => ({ value: b, label: b }))}
        />

        <FilterDropdown
          value={filterManager}
          onChange={setFilterManager}
          placeholder="전체 담당자"
          options={managers.map((m) => ({ value: m, label: m }))}
        />

        <FilterDropdown
          value={filterCourse}
          onChange={setFilterCourse}
          placeholder="전체 과정"
          options={courses.map((c) => ({ value: String(c.id), label: c.name }))}
        />

        <button className={styles.add_btn} onClick={() => { setEditTarget(null); setModalOpen(true); }}>
          + 학생 추가
        </button>
      </div>

      {/* 테이블 */}
      <div className={styles.table_wrap}>
        {loading ? (
          <div className={styles.empty_state}><div className={styles.empty_text}>불러오는 중...</div></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty_state}>
            <div className={styles.empty_text}>등록된 학생이 없습니다</div>
            <div className={styles.empty_sub}>+ 학생 추가 버튼을 눌러 첫 학생을 등록해보세요</div>
          </div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.table_head}>
                <tr>
                  <th className={styles.table_th}>이름</th>
                  <th className={styles.table_th}>연락처</th>
                  <th className={styles.table_th}>과정</th>
                  <th className={styles.table_th}>상태</th>
                  <th className={styles.table_th}>담당자</th>
                  <th className={styles.table_th}>교육원</th>
                  <th className={styles.table_th}>등록일</th>
                  <th className={styles.table_th}>관리</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => {
                  const status = STATUS_MAP[s.status];
                  return (
                    <tr key={s.id} className={styles.table_row}>
                      <td className={`${styles.table_td} ${styles.table_name}`}>
                        <span
                          className={styles.name_link}
                          onClick={() => router.push(`/students/${s.id}`)}
                        >
                          {s.name}
                        </span>
                      </td>
                      <td className={`${styles.table_td} ${styles.table_phone}`}>{formatPhone(s.phone)}</td>
                      <td className={`${styles.table_td} ${styles.table_course}`}>{s.courses?.name ?? '-'}</td>
                      <td className={styles.table_td}>
                        <span className={`${styles.badge} ${status.cls}`}>{status.label}</span>
                      </td>
                      <td className={`${styles.table_td} ${styles.table_manager}`}>{s.manager_name ?? '-'}</td>
                      <td className={`${styles.table_td} ${styles.table_manager}`}>{s.education_center_name ?? '-'}</td>
                      <td className={`${styles.table_td} ${styles.table_date}`}>{formatDate(s.registered_at)}</td>
                      <td className={styles.table_td}>
                        <div className={styles.action_group}>
                          <button className={`${styles.action_btn} ${styles.action_btn_plan}`}
                            onClick={() => router.push(`/students/${s.id}/plan`)}>플랜설계</button>
                          <button className={`${styles.action_btn} ${styles.action_btn_edit}`}
                            onClick={() => { setEditTarget(s); setModalOpen(true); }}>수정</button>
                          <button className={`${styles.action_btn} ${styles.action_btn_delete}`}
                            onClick={() => handleDelete(s.id)}>삭제</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={styles.table_footer}>
              <span className={styles.table_count}>전체 {total}명 중 {filtered.length}명 표시</span>
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <StudentModal
          student={editTarget}
          courses={courses}
          centers={centers}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
