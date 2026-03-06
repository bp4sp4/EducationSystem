'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
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

// ── 분류 정의 ──────────────────────────────────────────────────

type Category = '전체' | '학생관리' | '과목관리' | '수강계획' | '이수인정' | '시스템';

interface CategoryConfig {
  label: Category;
  color: string;
  bg: string;
  keywords: string[];
}

const CATEGORIES: CategoryConfig[] = [
  {
    label: '학생관리',
    color: '#3182F6',
    bg: '#EEF5FF',
    keywords: ['학생 추가', '학생 수정', '학생 삭제', '학생 복구'],
  },
  {
    label: '과목관리',
    color: '#059669',
    bg: '#ECFDF5',
    keywords: ['과목 추가', '과목 수정', '과목 삭제', '구법 과목 추가', '프리셋', '과목관리'],
  },
  {
    label: '수강계획',
    color: '#7C3AED',
    bg: '#F5F3FF',
    keywords: ['플랜 저장', '수강계획', '기수 추가', '기수 삭제', '학기'],
  },
  {
    label: '이수인정',
    color: '#D97706',
    bg: '#FFFBEB',
    keywords: ['자격증', '독학사', '전적대', '학점 인정'],
  },
  {
    label: '시스템',
    color: '#6B7684',
    bg: '#F2F4F6',
    keywords: ['과정 추가', '과정 수정', '과정 삭제', '교육원', '로그인', '설정'],
  },
];

function getCategory(action: string): CategoryConfig {
  for (const cat of CATEGORIES) {
    if (cat.keywords.some(k => action.includes(k.replace(' ', '')) || action.includes(k))) {
      return cat;
    }
  }
  // target_type 기반 fallback
  return { label: '시스템', color: '#6B7684', bg: '#F2F4F6', keywords: [] };
}

// 액션 타입 (추가/수정/삭제/저장)
function getActionType(action: string): { label: string; color: string; bg: string } {
  if (action.includes('삭제'))  return { label: '삭제', color: '#EF4444', bg: '#FFF5F5' };
  if (action.includes('수정'))  return { label: '수정', color: '#3182F6', bg: '#EEF5FF' };
  if (action.includes('추가') || action.includes('등록')) return { label: '추가', color: '#059669', bg: '#ECFDF5' };
  if (action.includes('저장'))  return { label: '저장', color: '#7C3AED', bg: '#F5F3FF' };
  if (action.includes('복구'))  return { label: '복구', color: '#D97706', bg: '#FFFBEB' };
  return { label: '기타', color: '#6B7684', bg: '#F2F4F6' };
}

// 시간 포맷
function formatDate(str: string) {
  const d = new Date(str);
  return d.toLocaleString('ko-KR', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateGroup(str: string) {
  const d = new Date(str);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const dStr = d.toDateString();
  if (dStr === today.toDateString()) return '오늘';
  if (dStr === yesterday.toDateString()) return '어제';
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function getDateGroup(str: string) {
  return new Date(str).toDateString();
}

export default function AdminLogsPage() {
  const [logs,    setLogs]    = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const [filterCategory, setFilterCategory] = useState<Category>('전체');
  const [filterUser,     setFilterUser]     = useState('');
  const [search,         setSearch]         = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled || !user) { if (!user) router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (cancelled) return;
      if (profile?.role !== 'super_admin') { router.push('/students'); return; }

      const { data } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

      if (!cancelled) {
        setLogs((data as ActivityLog[]) ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const users = useMemo(() => Array.from(new Set(logs.map(l => l.user_name))), [logs]);

  // 카테고리별 카운트
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { 전체: logs.length };
    for (const cat of CATEGORIES) {
      counts[cat.label] = logs.filter(l => getCategory(l.action).label === cat.label).length;
    }
    return counts;
  }, [logs]);

  const filtered = useMemo(() => logs.filter(l => {
    if (filterCategory !== '전체' && getCategory(l.action).label !== filterCategory) return false;
    if (filterUser && l.user_name !== filterUser) return false;
    if (search) {
      const q = search.toLowerCase();
      const hit = l.user_name.toLowerCase().includes(q)
        || l.action.toLowerCase().includes(q)
        || (l.target_name ?? '').toLowerCase().includes(q)
        || (l.detail ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  }), [logs, filterCategory, filterUser, search]);

  // 날짜별 그룹
  const grouped = useMemo(() => {
    const groups: { dateKey: string; dateLabel: string; logs: ActivityLog[] }[] = [];
    for (const log of filtered) {
      const key = getDateGroup(log.created_at);
      const last = groups[groups.length - 1];
      if (last && last.dateKey === key) {
        last.logs.push(log);
      } else {
        groups.push({ dateKey: key, dateLabel: formatDateGroup(log.created_at), logs: [log] });
      }
    }
    return groups;
  }, [filtered]);

  return (
    <div className={styles.page}>
      {/* 상단: 카테고리 탭 + 통계 */}
      <div className={styles.category_tabs}>
        {(['전체', ...CATEGORIES.map(c => c.label)] as Category[]).map(cat => {
          const cfg = CATEGORIES.find(c => c.label === cat);
          const isActive = filterCategory === cat;
          return (
            <button
              key={cat}
              className={`${styles.cat_tab} ${isActive ? styles.cat_tab_active : ''}`}
              style={isActive && cfg ? { borderColor: cfg.color, color: cfg.color, background: cfg.bg } : {}}
              onClick={() => setFilterCategory(cat)}
            >
              <span className={styles.cat_tab_label}>{cat}</span>
              <span
                className={styles.cat_tab_count}
                style={isActive && cfg ? { background: cfg.color, color: '#fff' } : {}}
              >{categoryCounts[cat] ?? 0}</span>
            </button>
          );
        })}
      </div>

      {/* 필터 바 */}
      <div className={styles.filter_bar}>
        <div className={styles.search_wrap}>
          <svg className={styles.search_icon} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            className={styles.search_input}
            placeholder="이름, 액션, 대상 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button className={styles.search_clear} onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <select
          className={styles.user_select}
          value={filterUser}
          onChange={e => setFilterUser(e.target.value)}
        >
          <option value="">전체 관리자</option>
          {users.map(u => <option key={u} value={u}>{u}</option>)}
        </select>

        <span className={styles.result_count}>{filtered.length}건</span>
      </div>

      {/* 로그 목록 */}
      {loading ? (
        <div className={styles.empty}>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className={styles.empty}>활동 내역이 없습니다.</div>
      ) : (
        <div className={styles.log_wrap}>
          {grouped.map(group => (
            <div key={group.dateKey} className={styles.date_group}>
              <div className={styles.date_label}>{group.dateLabel}</div>
              <div className={styles.log_list}>
                {group.logs.map(log => {
                  const cat    = getCategory(log.action);
                  const atype  = getActionType(log.action);
                  return (
                    <div key={log.id} className={styles.log_row}>
                      {/* 왼쪽: 카테고리 컬러 바 */}
                      <div className={styles.log_bar} style={{ background: cat.color }} />

                      {/* 본문 */}
                      <div className={styles.log_body}>
                        <div className={styles.log_top}>
                          {/* 분류 배지 */}
                          <span className={styles.cat_badge} style={{ color: cat.color, background: cat.bg }}>
                            {cat.label}
                          </span>
                          {/* 액션 타입 배지 */}
                          <span className={styles.type_badge} style={{ color: atype.color, background: atype.bg }}>
                            {atype.label}
                          </span>
                          {/* 액션 텍스트 */}
                          <span className={styles.log_action}>{log.action}</span>
                        </div>

                        <div className={styles.log_mid}>
                          {log.target_name && (
                            <span className={styles.log_target}>
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                              </svg>
                              {log.target_name}
                            </span>
                          )}
                          {log.detail && (
                            <span className={styles.log_detail}>{log.detail}</span>
                          )}
                        </div>
                      </div>

                      {/* 오른쪽: 관리자 + 시간 */}
                      <div className={styles.log_right}>
                        <span className={styles.log_user}>{log.user_name}</span>
                        <span className={styles.log_time}>{formatDate(log.created_at)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
