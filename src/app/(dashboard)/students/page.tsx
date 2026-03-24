'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/logger';
import StudentModal from '@/components/StudentModal';
import FilterDropdown from '@/components/FilterDropdown';
import type { Student, Course, EducationCenter, StudentFormData, MonthlyEnrollment } from '@/types';
import styles from './page.module.css';

interface ActivityLog {
  id: string;
  user_name: string;
  action: string;
  target_type: string | null;
  target_name: string | null;
  detail: string | null;
  created_at: string;
}

// ── 활동로그 헬퍼 ─────────────────────────────────────────────
function getLogActionType(action: string): { label: string; color: string; bg: string } {
  if (action.includes('삭제')) return { label: '삭제', color: '#EF4444', bg: '#FFF5F5' };
  if (action.includes('수정')) return { label: '수정', color: '#3182F6', bg: '#EEF5FF' };
  if (action.includes('추가') || action.includes('등록')) return { label: '추가', color: '#059669', bg: '#ECFDF5' };
  if (action.includes('저장')) return { label: '저장', color: '#7C3AED', bg: '#F5F3FF' };
  return { label: '기타', color: '#6B7684', bg: '#F2F4F6' };
}

type Tab = '학생관리' | '활동로그' | '환불목록' | '삭제목록';

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  등록:              { label: '등록',    cls: styles.badge_enrolled  },
  '사회복지사-실습예정': { label: '실습예정', cls: styles.badge_practice  },
  수료:              { label: '수료',    cls: styles.badge_completed },
  환불:              { label: '환불',    cls: styles.badge_refund    },
  삭제예정:           { label: '삭제예정', cls: styles.badge_refund    },
};

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
  const [managersDb, setManagersDb] = useState<string[]>([]);
  const [monthly, setMonthly] = useState<MonthlyEnrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const [activeTab, setActiveTab] = useState<Tab>('학생관리');
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logSearch, setLogSearch] = useState('');
  const [logActionType, setLogActionType] = useState('');
  const [logDateFrom, setLogDateFrom] = useState('');
  const [logDateTo, setLogDateTo] = useState('');
  const [logPage, setLogPage] = useState(1);
  const LOG_PAGE_SIZE = 10;

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
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      setIsSuperAdmin(profile?.role === 'super_admin');
    }
    const [studentsRes, coursesRes, centersRes, managersRes] = await Promise.all([
      supabase.from('students').select('*, courses(*)').order('registered_at', { ascending: false }),
      supabase.from('courses').select('*').order('id'),
      supabase.from('education_centers').select('*').order('id'),
      supabase.from('managers').select('name').order('sort_order'),
    ]);

    if (studentsRes.error) console.error('학생 조회 에러:', studentsRes.error.message, studentsRes.error.code, studentsRes.error.details, studentsRes.error.hint);

    const data = (studentsRes.data as Student[]) ?? [];
    setStudents(data);
    setCourses((coursesRes.data as Course[]) ?? []);
    setCenters((centersRes.data as EducationCenter[]) ?? []);
    setManagersDb((managersRes.data ?? []).map((m: { name: string }) => m.name));

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

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    const { data } = await supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(200);
    setActivityLogs((data as ActivityLog[]) ?? []);
    setLogsLoading(false);
  }, []);

  useEffect(() => {
    if (activeTab === '활동로그' && isSuperAdmin) fetchLogs();
  }, [activeTab, isSuperAdmin, fetchLogs]);

  const batches = Array.from(new Set(
    students.flatMap((s) => s.class_start?.split(',').map((v) => v.trim()).filter(Boolean) ?? [])
  )) as string[];
  const managers = Array.from(new Set(students.map((s) => s.manager_name).filter(Boolean))) as string[];
  const centerNames = Array.from(new Set(
    students.flatMap((s) => s.education_center_name?.split(',').map((v) => v.trim()).filter(Boolean) ?? [])
  )) as string[];

  // 상태별 분리
  const activeStudents  = students.filter((s) => s.status !== '환불' && s.status !== '삭제예정');
  const refundStudents  = students.filter((s) => s.status === '환불');
  const deleteStudents  = students.filter((s) => s.status === '삭제예정');

  const filtered = activeStudents.filter((s) => {
    const q = search.toLowerCase();
    if (q && !s.name.toLowerCase().includes(q) && !(s.phone ?? '').includes(q)) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterCenter && !s.education_center_name?.split(',').map((v) => v.trim()).includes(filterCenter)) return false;
    if (filterBatch && !s.class_start?.split(',').map((v) => v.trim()).includes(filterBatch)) return false;
    if (filterManager && s.manager_name !== filterManager) return false;
    if (filterCourse && String(s.course_id) !== filterCourse) return false;
    return true;
  });

  const total    = activeStudents.length;
  const enrolled  = activeStudents.filter((s) => s.status === '등록').length;
  const completed = activeStudents.filter((s) => s.status === '수료').length;

  async function handleSubmit(data: StudentFormData) {
    const payload = {
      name: data.name,
      phone: data.phone || null,
      education_level: data.education_level || null,
      major: data.major || null,
      desired_degree: data.desired_degree || null,
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
      logActivity({ action: '학생 수정', target_type: 'student', target_name: data.name, detail: `상태: ${data.status}` });
    } else {
      const { error } = await supabase.from('students').insert(payload);
      if (error) { alert(`등록 실패: ${error.message}`); return; }
      logActivity({ action: '학생 추가', target_type: 'student', target_name: data.name, detail: `과정ID: ${data.course_id}, 담당자: ${data.manager_name}` });
    }
    await fetchAll();
  }

  async function handleDelete(id: string) {
    const targetName = students.find((s) => s.id === id)?.name ?? id;
    const { error } = await supabase.from('students').update({ status: '삭제예정', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    logActivity({ action: '삭제 요청', target_type: 'student', target_name: targetName });
    await fetchAll();
  }

  async function handlePermanentDelete(id: string) {
    if (!confirm('완전히 삭제합니다. 복구할 수 없습니다.')) return;
    const targetName = students.find((s) => s.id === id)?.name ?? id;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) { alert(`삭제 실패: ${error.message}`); return; }
    logActivity({ action: '학생 완전삭제', target_type: 'student', target_name: targetName });
    await fetchAll();
  }

  async function handleRestore(id: string) {
    const targetName = students.find((s) => s.id === id)?.name ?? id;
    const { error } = await supabase.from('students').update({ status: '등록', updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { alert(`복구 실패: ${error.message}`); return; }
    logActivity({ action: '삭제 복구', target_type: 'student', target_name: targetName });
    await fetchAll();
  }

  function formatLogDate(dateStr: string) {
    const d = new Date(dateStr);
    return d.toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <>
      {/* 탭 네비게이션 */}
      {isSuperAdmin && (
        <div className={styles.tab_bar}>
          {(['학생관리', '활동로그', '환불목록', '삭제목록'] as const).map((tab) => (
            <button
              key={tab}
              className={`${styles.tab_btn} ${activeTab === tab ? styles.tab_btn_active : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === '환불목록' && refundStudents.length > 0 && (
                <span className={styles.tab_badge}>{refundStudents.length}</span>
              )}
              {tab === '삭제목록' && deleteStudents.length > 0 && (
                <span className={styles.tab_badge}>{deleteStudents.length}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── 학생관리 탭 ── */}
      {activeTab === '학생관리' && <>
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
                        <span className={`${styles.badge} ${status?.cls ?? ''}`}>{status?.label ?? s.status}</span>
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

      </> /* end 학생관리 tab */}

      {/* ── 활동로그 탭 ── */}
      {activeTab === '활동로그' && isSuperAdmin && (() => {
        const filteredLogs = activityLogs.filter(l => {
          if (logSearch) {
            const q = logSearch.toLowerCase();
            if (!l.user_name.toLowerCase().includes(q) && !l.action.toLowerCase().includes(q) && !(l.target_name ?? '').toLowerCase().includes(q)) return false;
          }
          if (logActionType && getLogActionType(l.action).label !== logActionType) return false;
          if (logDateFrom && l.created_at.slice(0, 10) < logDateFrom) return false;
          if (logDateTo && l.created_at.slice(0, 10) > logDateTo) return false;
          return true;
        });

        const totalPages = Math.ceil(filteredLogs.length / LOG_PAGE_SIZE);
        const pagedLogs = filteredLogs.slice((logPage - 1) * LOG_PAGE_SIZE, logPage * LOG_PAGE_SIZE);

        // 통계
        const todayStr = new Date().toDateString();
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const todayCount = activityLogs.filter(l => new Date(l.created_at).toDateString() === todayStr).length;
        const weekCount  = activityLogs.filter(l => new Date(l.created_at) >= weekAgo).length;
        const actionTypeStats = [
          { label: '추가', color: '#059669', bg: '#ECFDF5' },
          { label: '수정', color: '#3182F6', bg: '#EEF5FF' },
          { label: '삭제', color: '#EF4444', bg: '#FFF5F5' },
          { label: '저장', color: '#7C3AED', bg: '#F5F3FF' },
        ].map(t => ({ ...t, count: activityLogs.filter(l => getLogActionType(l.action).label === t.label).length }));
        const userStats = Array.from(new Set(activityLogs.map(l => l.user_name)))
          .map(u => ({ name: u, count: activityLogs.filter(l => l.user_name === u).length }))
          .sort((a, b) => b.count - a.count);

        const resetFilters = () => { setLogSearch(''); setLogActionType(''); setLogDateFrom(''); setLogDateTo(''); setLogPage(1); };

        return (
          <div className={styles.log_layout}>
            {/* ── 왼쪽: 로그 목록 ── */}
            <div className={styles.log_main}>
              <div className={styles.log_header}>
                <span className={styles.log_header_title}>로그 관리</span>
                <span className={styles.log_header_count}>전체 로그: {activityLogs.length}개</span>
              </div>

              <div className={styles.log_filters}>
                <div className={styles.log_search_row}>
                  <div className={styles.log_search_wrap}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.log_search_icon}>
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                    </svg>
                    <input className={styles.log_search} placeholder="관리자명 검색..." value={logSearch} onChange={e => { setLogSearch(e.target.value); setLogPage(1); }} />
                  </div>
                  <button className={styles.log_reset_btn} onClick={resetFilters}>초기화</button>
                </div>
                <div className={styles.log_filter_row}>
                  <div className={styles.log_filter_group}>
                    <label className={styles.log_filter_label}>액션 타입</label>
                    <select className={styles.log_filter_select} value={logActionType} onChange={e => { setLogActionType(e.target.value); setLogPage(1); }}>
                      <option value="">전체 타입</option>
                      <option value="추가">추가</option>
                      <option value="수정">수정</option>
                      <option value="삭제">삭제</option>
                      <option value="저장">저장</option>
                    </select>
                  </div>
                  <div className={styles.log_filter_group}>
                    <label className={styles.log_filter_label}>시작일</label>
                    <input type="date" className={styles.log_filter_date} value={logDateFrom} onChange={e => { setLogDateFrom(e.target.value); setLogPage(1); }} />
                  </div>
                  <div className={styles.log_filter_group}>
                    <label className={styles.log_filter_label}>종료일</label>
                    <input type="date" className={styles.log_filter_date} value={logDateTo} onChange={e => { setLogDateTo(e.target.value); setLogPage(1); }} />
                  </div>
                </div>
              </div>

              {logsLoading ? (
                <div className={styles.empty_state}><div className={styles.empty_text}>불러오는 중...</div></div>
              ) : filteredLogs.length === 0 ? (
                <div className={styles.empty_state}><div className={styles.empty_text}>활동 로그가 없습니다</div></div>
              ) : (
                <>
                  <div className={styles.log_cards}>
                    {pagedLogs.map(log => {
                      const atype = getLogActionType(log.action);
                      const detailLines = log.detail ? log.detail.split(',').map(s => s.trim()).filter(Boolean) : [];
                      return (
                        <div key={log.id} className={styles.log_card}>
                          <div className={styles.log_card_top}>
                            <div className={styles.log_card_left}>
                              <span className={styles.log_card_badge} style={{ color: atype.color, background: atype.bg }}>{atype.label}</span>
                              <span className={styles.log_card_user}>{log.user_name}</span>
                            </div>
                            <span className={styles.log_card_time}>
                              {new Date(log.created_at).toLocaleString('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          <div className={styles.log_card_action}>{log.action}</div>
                          {(log.target_type || log.target_name) && (
                            <div className={styles.log_card_meta}>
                              {log.target_type && <span>테이블: {log.target_type}</span>}
                              {log.target_name && <span>대상: {log.target_name}</span>}
                            </div>
                          )}
                          {detailLines.length > 0 && (
                            <div className={styles.log_card_detail}>
                              <div className={styles.log_card_detail_title}>변경된 항목:</div>
                              {detailLines.map((line, i) => (
                                <div key={i} className={styles.log_card_detail_line}>{line}</div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 && (
                    <div className={styles.log_pagination}>
                      <button className={styles.log_page_btn} disabled={logPage === 1} onClick={() => setLogPage(p => p - 1)}>이전</button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(p => p === 1 || p === totalPages || Math.abs(p - logPage) <= 2)
                        .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                          if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('...');
                          acc.push(p); return acc;
                        }, [])
                        .map((p, i) => p === '...' ? (
                          <span key={`el-${i}`} className={styles.log_page_ellipsis}>…</span>
                        ) : (
                          <button key={p} className={`${styles.log_page_btn} ${logPage === p ? styles.log_page_btn_active : ''}`} onClick={() => setLogPage(p as number)}>{p}</button>
                        ))}
                      <button className={styles.log_page_btn} disabled={logPage === totalPages} onClick={() => setLogPage(p => p + 1)}>다음</button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* ── 오른쪽: 통계 사이드바 ── */}
            <div className={styles.log_sidebar}>
              <div className={styles.log_stat_section}>
                <div className={styles.log_stat_section_title}>활동 통계</div>
                <div className={styles.log_stat_grid}>
                  <div className={styles.log_stat_today}>
                    <div className={styles.log_stat_label}>오늘 활동</div>
                    <div className={styles.log_stat_value}>{todayCount}</div>
                  </div>
                  <div className={styles.log_stat_week}>
                    <div className={styles.log_stat_label}>이번 주 활동</div>
                    <div className={styles.log_stat_value}>{weekCount}</div>
                  </div>
                </div>
              </div>

              <div className={styles.log_stat_section}>
                <div className={styles.log_stat_section_title}>액션 타입별 통계</div>
                <div className={styles.log_type_stats}>
                  {actionTypeStats.map(s => (
                    <div key={s.label} className={styles.log_type_stat_row} style={{ background: s.bg }}>
                      <span className={styles.log_type_stat_dot} style={{ background: s.color }} />
                      <span className={styles.log_type_stat_label}>{s.label}</span>
                      <span className={styles.log_type_stat_count} style={{ color: s.color }}>{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.log_stat_section}>
                <div className={styles.log_stat_section_title}>관리자별 활동</div>
                <div className={styles.log_user_stats}>
                  {userStats.map(u => (
                    <div key={u.name} className={styles.log_user_stat_row}>
                      <span className={styles.log_user_stat_name}>{u.name}</span>
                      <span className={styles.log_user_stat_count}>{u.count}회</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── 환불목록 탭 ── */}
      {activeTab === '환불목록' && isSuperAdmin && (
        <div className={styles.table_wrap}>
          {refundStudents.length === 0 ? (
            <div className={styles.empty_state}><div className={styles.empty_text}>환불 학생이 없습니다</div></div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.table_head}>
                <tr>
                  <th className={styles.table_th}>이름</th>
                  <th className={styles.table_th}>연락처</th>
                  <th className={styles.table_th}>과정</th>
                  <th className={styles.table_th}>담당자</th>
                  <th className={styles.table_th}>교육원</th>
                  <th className={styles.table_th}>등록일</th>
                  <th className={styles.table_th}>관리</th>
                </tr>
              </thead>
              <tbody>
                {refundStudents.map((s) => (
                  <tr key={s.id} className={styles.table_row}>
                    <td className={`${styles.table_td} ${styles.table_name}`}>
                      <span className={styles.name_link} onClick={() => router.push(`/students/${s.id}`)}>
                        {s.name}
                      </span>
                    </td>
                    <td className={`${styles.table_td} ${styles.table_phone}`}>{formatPhone(s.phone)}</td>
                    <td className={`${styles.table_td} ${styles.table_course}`}>{s.courses?.name ?? '-'}</td>
                    <td className={`${styles.table_td} ${styles.table_manager}`}>{s.manager_name ?? '-'}</td>
                    <td className={`${styles.table_td} ${styles.table_manager}`}>{s.education_center_name ?? '-'}</td>
                    <td className={`${styles.table_td} ${styles.table_date}`}>{formatDate(s.registered_at)}</td>
                    <td className={styles.table_td}>
                      <div className={styles.action_group}>
                        <button className={`${styles.action_btn} ${styles.action_btn_edit}`}
                          onClick={() => { setEditTarget(s); setModalOpen(true); }}>수정</button>
                        <button className={`${styles.action_btn} ${styles.action_btn_delete}`}
                          onClick={() => handleDelete(s.id)}>삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 삭제목록 탭 ── */}
      {activeTab === '삭제목록' && isSuperAdmin && (
        <div className={styles.table_wrap}>
          {deleteStudents.length === 0 ? (
            <div className={styles.empty_state}><div className={styles.empty_text}>삭제 요청된 학생이 없습니다</div></div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.table_head}>
                <tr>
                  <th className={styles.table_th}>이름</th>
                  <th className={styles.table_th}>연락처</th>
                  <th className={styles.table_th}>과정</th>
                  <th className={styles.table_th}>담당자</th>
                  <th className={styles.table_th}>교육원</th>
                  <th className={styles.table_th}>등록일</th>
                  <th className={styles.table_th}>관리</th>
                </tr>
              </thead>
              <tbody>
                {deleteStudents.map((s) => (
                  <tr key={s.id} className={styles.table_row}>
                    <td className={`${styles.table_td} ${styles.table_name}`}>
                      <span className={styles.name_link} onClick={() => router.push(`/students/${s.id}`)}>
                        {s.name}
                      </span>
                    </td>
                    <td className={`${styles.table_td} ${styles.table_phone}`}>{formatPhone(s.phone)}</td>
                    <td className={`${styles.table_td} ${styles.table_course}`}>{s.courses?.name ?? '-'}</td>
                    <td className={`${styles.table_td} ${styles.table_manager}`}>{s.manager_name ?? '-'}</td>
                    <td className={`${styles.table_td} ${styles.table_manager}`}>{s.education_center_name ?? '-'}</td>
                    <td className={`${styles.table_td} ${styles.table_date}`}>{formatDate(s.registered_at)}</td>
                    <td className={styles.table_td}>
                      <div className={styles.action_group}>
                        <button className={`${styles.action_btn} ${styles.action_btn_restore}`}
                          onClick={() => handleRestore(s.id)}>복구</button>
                        <button className={`${styles.action_btn} ${styles.action_btn_delete}`}
                          onClick={() => handlePermanentDelete(s.id)}>완전삭제</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {modalOpen && (
        <StudentModal
          student={editTarget}
          courses={courses}
          centers={centers}
          managers={managersDb}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </>
  );
}
