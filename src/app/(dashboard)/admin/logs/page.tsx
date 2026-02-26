'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import FilterDropdown from '@/components/FilterDropdown';
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

const ACTION_COLOR: Record<string, string> = {
  '학생 추가':       '#059669',
  '학생 수정':       '#3182F6',
  '학생 삭제':       '#EF4444',
  '과목 추가':       '#059669',
  '구법 과목 추가':   '#7C3AED',
  '과목 삭제':       '#EF4444',
  '플랜 저장':       '#3182F6',
  '전적대 과목 추가': '#059669',
  '자격증 추가':     '#059669',
  '독학사 추가':     '#059669',
};

function formatDate(str: string) {
  return new Date(str).toLocaleString('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function AdminLogsPage() {
  const [logs,    setLogs]    = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [filterUser,   setFilterUser]   = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [search,       setSearch]       = useState('');

  useEffect(() => {
    const supabase = createClient();
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'super_admin') { router.push('/students'); return; }

      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      setLogs((data as ActivityLog[]) ?? []);
      setLoading(false);
    }
    load();
  }, [router]);

  const users   = useMemo(() => Array.from(new Set(logs.map((l) => l.user_name))), [logs]);
  const actions = useMemo(() => Array.from(new Set(logs.map((l) => l.action))),    [logs]);

  const filtered = useMemo(() => logs.filter((l) => {
    if (filterUser   && l.user_name !== filterUser)  return false;
    if (filterAction && l.action    !== filterAction) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = l.user_name.toLowerCase().includes(q)
        || l.action.toLowerCase().includes(q)
        || (l.target_name ?? '').toLowerCase().includes(q)
        || (l.detail ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  }), [logs, filterUser, filterAction, search]);

  return (
    <>
      {/* 필터 바 */}
      <div className={styles.filter_bar}>
        <div className={styles.filter_search_wrap}>
          <svg className={styles.filter_search_icon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className={styles.filter_search}
            placeholder="이름, 액션, 대상, 상세 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <FilterDropdown
          value={filterUser}
          onChange={setFilterUser}
          placeholder="전체 관리자"
          options={users.map((u) => ({ value: u, label: u }))}
        />

        <FilterDropdown
          value={filterAction}
          onChange={setFilterAction}
          placeholder="전체 액션"
          options={actions.map((a) => ({ value: a, label: a }))}
        />
      </div>

      {/* 테이블 */}
      <div className={styles.table_wrap}>
        {loading ? (
          <div className={styles.empty_state}><div className={styles.empty_text}>불러오는 중...</div></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty_state}><div className={styles.empty_text}>활동 내역이 없습니다</div></div>
        ) : (
          <>
            <table className={styles.table}>
              <thead className={styles.table_head}>
                <tr>
                  <th className={styles.table_th}>일시</th>
                  <th className={styles.table_th}>관리자</th>
                  <th className={styles.table_th}>액션</th>
                  <th className={styles.table_th}>대상</th>
                  <th className={styles.table_th}>상세</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => {
                  const color = ACTION_COLOR[log.action] ?? '#191F28';
                  return (
                    <tr key={log.id} className={styles.table_row}>
                      <td className={`${styles.table_td} ${styles.table_date}`}>{formatDate(log.created_at)}</td>
                      <td className={`${styles.table_td} ${styles.table_name}`}>{log.user_name}</td>
                      <td className={styles.table_td}>
                        <span className={styles.action_badge} style={{ color, background: `${color}18` }}>
                          {log.action}
                        </span>
                      </td>
                      <td className={styles.table_td}>{log.target_name ?? '-'}</td>
                      <td className={`${styles.table_td} ${styles.table_detail}`}>{log.detail ?? '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className={styles.table_footer}>
              <span className={styles.table_count}>전체 {logs.length}건 중 {filtered.length}건 표시</span>
            </div>
          </>
        )}
      </div>
    </>
  );
}
