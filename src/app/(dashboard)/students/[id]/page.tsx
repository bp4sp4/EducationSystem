'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/logger';
import type { Student, Course, EducationCenter } from '@/types';
import StudentModal from '@/components/StudentModal';
import styles from './page.module.css';

// ── 타입 ───────────────────────────────────────────────────────
interface StudentMemo {
  id: string;
  student_id: string;
  content: string;
  created_by: string;
  created_at: string;
}

interface StudentContact {
  id: string;
  student_id: string;
  contact_type: string;
  content: string;
  contacted_at: string;
  created_by: string;
  created_at: string;
}

interface ActivityLog {
  id: string;
  user_name: string;
  action: string;
  target_type: string | null;
  target_name: string | null;
  detail: string | null;
  created_at: string;
}

type DetailTab = '메모' | '연락기록' | '변경이력';

const CONTACT_TYPES = ['전화', '문자', '이메일', '방문'];

const CONTACT_TYPE_STYLE: Record<string, { color: string; bg: string }> = {
  전화:  { color: '#3182F6', bg: '#EEF5FF' },
  문자:  { color: '#059669', bg: '#ECFDF5' },
  이메일:{ color: '#7C3AED', bg: '#F5F3FF' },
  방문:  { color: '#D97706', bg: '#FFFBEB' },
};

// ── 헬퍼 ──────────────────────────────────────────────────────
function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatPhone(phone: string | null) {
  if (!phone) return '-';
  return phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');
}

const STATUS_STYLE: Record<string, { cls: string; label: string }> = {
  등록:              { cls: styles.badge_enrolled,  label: '등록'    },
  '사회복지사-실습예정': { cls: styles.badge_practice, label: '실습예정' },
  수료:              { cls: styles.badge_completed, label: '수료'    },
  환불:              { cls: styles.badge_refund,    label: '환불'    },
  삭제예정:           { cls: styles.badge_refund,    label: '삭제예정' },
};

// ── 메인 컴포넌트 ──────────────────────────────────────────────
export default function StudentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();

  const [student,   setStudent]   = useState<Student | null>(null);
  const [courses,   setCourses]   = useState<Course[]>([]);
  const [centers,   setCenters]   = useState<EducationCenter[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [activeTab, setActiveTab] = useState<DetailTab>('메모');

  // 메모
  const [memos,        setMemos]        = useState<StudentMemo[]>([]);
  const [newMemo,      setNewMemo]      = useState('');
  const [memoSaving,   setMemoSaving]   = useState(false);
  const [editingMemoId,   setEditingMemoId]   = useState<string | null>(null);
  const [editingMemoText, setEditingMemoText] = useState('');

  // 연락기록
  const [contacts,        setContacts]        = useState<StudentContact[]>([]);
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactType,     setContactType]     = useState('전화');
  const [contactDate,     setContactDate]     = useState(() => new Date().toISOString().slice(0, 10));
  const [contactContent,  setContactContent]  = useState('');
  const [contactSaving,   setContactSaving]   = useState(false);

  // 변경이력
  const [logs,        setLogs]        = useState<ActivityLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // 현재 사용자 이름
  const [myName, setMyName] = useState('');

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    (async () => {
      const [s, c, e, { data: { user } }] = await Promise.all([
        supabase.from('students').select('*, courses(*)').eq('id', id).single(),
        supabase.from('courses').select('*').order('id'),
        supabase.from('education_centers').select('*').order('id'),
        supabase.auth.getUser(),
      ]);
      if (cancelled) return;
      setStudent(s.data as Student);
      setCourses((c.data as Course[]) ?? []);
      setCenters((e.data as EducationCenter[]) ?? []);

      if (user) {
        const { data: profile } = await supabase.from('profiles').select('name').eq('id', user.id).single();
        if (!cancelled) setMyName(profile?.name ?? '');
      }

      const [memosRes, contactsRes] = await Promise.all([
        supabase.from('student_memos').select('*').eq('student_id', id).order('created_at', { ascending: false }),
        supabase.from('student_contacts').select('*').eq('student_id', id).order('contacted_at', { ascending: false }),
      ]);
      if (!cancelled) {
        setMemos((memosRes.data as StudentMemo[]) ?? []);
        setContacts((contactsRes.data as StudentContact[]) ?? []);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  // 변경이력 — 탭 진입 시 로드
  useEffect(() => {
    if (activeTab !== '변경이력' || !student) return;
    let cancelled = false;
    setLogsLoading(true);
    const supabase = createClient();
    supabase.from('activity_logs')
      .select('*')
      .eq('target_name', student.name)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (!cancelled) {
          setLogs((data as ActivityLog[]) ?? []);
          setLogsLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [activeTab, student]);

  async function handleSubmit(data: import('@/types').StudentFormData) {
    const supabase = createClient();
    const payload = {
      name: data.name, phone: data.phone || null,
      education_level: data.education_level || null, major: data.major || null,
      desired_degree: data.desired_degree || null, status: data.status,
      course_id: data.course_id || null, manager_name: data.manager_name || null,
      cost: data.cost ? Number(data.cost) : null, class_start: data.class_start || null,
      target_completion_date: data.target_completion_date || null,
      education_center_name: data.education_center_name || null,
      all_care: data.all_care, notes: data.notes || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('students').update(payload).eq('id', id);
    if (error) { alert(`수정 실패: ${error.message}`); return; }
    logActivity({ action: '학생 수정', target_type: 'student', target_name: data.name });
    const { data: updated } = await supabase.from('students').select('*, courses(*)').eq('id', id).single();
    setStudent(updated as Student);
  }

  async function handleAddMemo() {
    if (!newMemo.trim()) return;
    setMemoSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('student_memos').insert({
      student_id: id, content: newMemo.trim(), created_by: myName,
    }).select().single();
    if (error) { alert('메모 저장 실패'); setMemoSaving(false); return; }
    setMemos(prev => [data as StudentMemo, ...prev]);
    setNewMemo('');
    setMemoSaving(false);
  }

  async function handleDeleteMemo(memoId: string) {
    if (!confirm('메모를 삭제하시겠습니까?')) return;
    const supabase = createClient();
    await supabase.from('student_memos').delete().eq('id', memoId);
    setMemos(prev => prev.filter(m => m.id !== memoId));
  }

  function startEditMemo(memo: StudentMemo) {
    setEditingMemoId(memo.id);
    setEditingMemoText(memo.content);
  }

  async function handleSaveMemo(memoId: string) {
    if (!editingMemoText.trim()) return;
    const supabase = createClient();
    const { error } = await supabase.from('student_memos')
      .update({ content: editingMemoText.trim() })
      .eq('id', memoId);
    if (error) { alert('수정 실패'); return; }
    setMemos(prev => prev.map(m => m.id === memoId ? { ...m, content: editingMemoText.trim() } : m));
    setEditingMemoId(null);
    setEditingMemoText('');
  }

  async function handleAddContact() {
    if (!contactContent.trim()) return;
    setContactSaving(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('student_contacts').insert({
      student_id: id, contact_type: contactType, content: contactContent.trim(),
      contacted_at: contactDate, created_by: myName,
    }).select().single();
    if (error) { alert('연락기록 저장 실패'); setContactSaving(false); return; }
    setContacts(prev => [data as StudentContact, ...prev].sort(
      (a, b) => new Date(b.contacted_at).getTime() - new Date(a.contacted_at).getTime()
    ));
    setContactContent('');
    setContactDate(new Date().toISOString().slice(0, 10));
    setContactType('전화');
    setShowContactForm(false);
    setContactSaving(false);
  }

  async function handleDeleteContact(contactId: string) {
    if (!confirm('연락기록을 삭제하시겠습니까?')) return;
    const supabase = createClient();
    await supabase.from('student_contacts').delete().eq('id', contactId);
    setContacts(prev => prev.filter(c => c.id !== contactId));
  }

  if (!student) {
    return <div className={styles.page_wrap}><div className={styles.loading}>불러오는 중...</div></div>;
  }

  const status = STATUS_STYLE[student.status];

  return (
    <div className={styles.page_wrap}>

      {/* 뒤로가기 */}
      <button className={styles.back_btn} onClick={() => router.push('/students')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        학생 목록으로
      </button>

      {/* 헤더 카드 */}
      <div className={styles.header_card}>
        <div className={styles.header_left}>
          <div className={styles.name_row}>
            <h1 className={styles.student_name}>{student.name}</h1>
            <span className={`${styles.badge} ${status?.cls ?? ''}`}>{status?.label ?? student.status}</span>
          </div>
          <div className={styles.meta_row}>
            <span>{formatPhone(student.phone)}</span>
            {student.courses?.name && <><span className={styles.meta_dot} /><span>{student.courses.name}</span></>}
            {student.education_center_name && <><span className={styles.meta_dot} /><span>{student.education_center_name}</span></>}
            {student.manager_name && <><span className={styles.meta_dot} /><span>{student.manager_name}</span></>}
          </div>
        </div>
        <div className={styles.header_actions}>
          <button className={styles.plan_btn} onClick={() => router.push(`/students/${id}/plan`)}>
            학습플랜 설계
          </button>
          <button className={styles.edit_btn} onClick={() => setModalOpen(true)}>
            수정
          </button>
        </div>
      </div>

      {/* 정보 그리드 */}
      <div className={styles.info_grid}>
        <div className={styles.info_card}>
          <div className={styles.card_title}>기본 정보</div>
          <div className={styles.info_list}>
            <InfoRow label="담당자"   value={student.manager_name} />
            <InfoRow label="교육원"   value={student.education_center_name} />
            <InfoRow label="과정"     value={student.courses?.name} />
            <InfoRow label="개강반"   value={student.class_start} />
            <InfoRow label="최종학력" value={student.education_level} />
            <InfoRow label="등록일"   value={formatDate(student.registered_at)} />
          </div>
        </div>
        <div className={styles.info_card}>
          <div className={styles.card_title}>학습 정보</div>
          <div className={styles.info_list}>
            <InfoRow label="목표취득일" value={formatDate(student.target_completion_date)} />
            <InfoRow label="비용"       value={student.cost ? `${student.cost.toLocaleString()}원` : null} />
            <InfoRow label="올케어"     value={student.all_care ? 'O' : 'X'} />
            <InfoRow label="전공"       value={student.major} />
            <InfoRow label="희망학위"   value={student.desired_degree} />
            {student.notes && <InfoRow label="메모" value={student.notes} />}
          </div>
        </div>
      </div>

      {/* 탭 섹션 */}
      <div className={styles.tab_section}>
        {/* 탭 헤더 */}
        <div className={styles.tab_header}>
          {(['메모', '연락기록', '변경이력'] as DetailTab[]).map(tab => (
            <button
              key={tab}
              className={`${styles.tab_btn} ${activeTab === tab ? styles.tab_btn_active : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === '메모'    && memos.length    > 0 && <span className={styles.tab_count}>{memos.length}</span>}
              {tab === '연락기록' && contacts.length > 0 && <span className={styles.tab_count}>{contacts.length}</span>}
            </button>
          ))}
        </div>

        {/* ── 메모 탭 ── */}
        {activeTab === '메모' && (
          <div className={styles.tab_body}>
            {/* 메모 입력 */}
            <div className={styles.memo_input_wrap}>
              <textarea
                className={styles.memo_textarea}
                placeholder="메모를 입력하세요..."
                value={newMemo}
                onChange={e => setNewMemo(e.target.value)}
                rows={3}
              />
              <div className={styles.memo_input_footer}>
                <button
                  className={styles.memo_submit_btn}
                  onClick={handleAddMemo}
                  disabled={memoSaving || !newMemo.trim()}
                >
                  {memoSaving ? '저장 중...' : '메모 추가'}
                </button>
              </div>
            </div>

            {/* 메모 목록 */}
            {memos.length === 0 ? (
              <div className={styles.empty}>등록된 메모가 없습니다.</div>
            ) : (
              <div className={styles.memo_list}>
                {memos.map(memo => (
                  <div key={memo.id} className={styles.memo_card}>
                    {editingMemoId === memo.id ? (
                      <>
                        <textarea
                          className={styles.memo_edit_textarea}
                          value={editingMemoText}
                          onChange={e => setEditingMemoText(e.target.value)}
                          rows={3}
                          autoFocus
                        />
                        <div className={styles.memo_footer}>
                          <span className={styles.memo_meta}>{memo.created_by} · {formatDateTime(memo.created_at)}</span>
                          <div className={styles.memo_edit_actions}>
                            <button className={styles.cancel_btn} onClick={() => setEditingMemoId(null)}>취소</button>
                            <button className={styles.memo_submit_btn} onClick={() => handleSaveMemo(memo.id)} disabled={!editingMemoText.trim()}>저장</button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className={styles.memo_content}>{memo.content}</div>
                        <div className={styles.memo_footer}>
                          <span className={styles.memo_meta}>{memo.created_by} · {formatDateTime(memo.created_at)}</span>
                          <div className={styles.memo_edit_actions}>
                            <button className={styles.edit_icon_btn} onClick={() => startEditMemo(memo)}>수정</button>
                            <button className={styles.delete_btn} onClick={() => handleDeleteMemo(memo.id)}>삭제</button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── 연락기록 탭 ── */}
        {activeTab === '연락기록' && (
          <div className={styles.tab_body}>
            {/* 추가 버튼 */}
            <div className={styles.contact_header}>
              <button className={styles.add_btn} onClick={() => setShowContactForm(v => !v)}>
                {showContactForm ? '취소' : '+ 연락 기록 추가'}
              </button>
            </div>

            {/* 추가 폼 */}
            {showContactForm && (
              <div className={styles.contact_form}>
                <div className={styles.contact_form_row}>
                  <div className={styles.form_group}>
                    <label className={styles.form_label}>유형</label>
                    <div className={styles.contact_type_btns}>
                      {CONTACT_TYPES.map(t => (
                        <button
                          key={t}
                          className={`${styles.contact_type_btn} ${contactType === t ? styles.contact_type_btn_active : ''}`}
                          style={contactType === t ? { background: CONTACT_TYPE_STYLE[t].bg, color: CONTACT_TYPE_STYLE[t].color, borderColor: CONTACT_TYPE_STYLE[t].color } : {}}
                          onClick={() => setContactType(t)}
                        >{t}</button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.form_group}>
                    <label className={styles.form_label}>날짜</label>
                    <input
                      type="date"
                      className={styles.form_date}
                      value={contactDate}
                      onChange={e => setContactDate(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.form_group}>
                  <label className={styles.form_label}>내용</label>
                  <textarea
                    className={styles.form_textarea}
                    placeholder="연락 내용을 입력하세요..."
                    value={contactContent}
                    onChange={e => setContactContent(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className={styles.form_actions}>
                  <button
                    className={styles.submit_btn}
                    onClick={handleAddContact}
                    disabled={contactSaving || !contactContent.trim()}
                  >
                    {contactSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            )}

            {/* 연락 목록 */}
            {contacts.length === 0 ? (
              <div className={styles.empty}>연락 기록이 없습니다.</div>
            ) : (
              <div className={styles.contact_list}>
                {contacts.map(c => {
                  const typeStyle = CONTACT_TYPE_STYLE[c.contact_type] ?? { color: '#6B7684', bg: '#F2F4F6' };
                  return (
                    <div key={c.id} className={styles.contact_card}>
                      <div className={styles.contact_card_top}>
                        <div className={styles.contact_card_left}>
                          <span className={styles.contact_type_badge} style={{ color: typeStyle.color, background: typeStyle.bg }}>
                            {c.contact_type}
                          </span>
                          <span className={styles.contact_date}>{formatDate(c.contacted_at)}</span>
                        </div>
                        <div className={styles.contact_card_right}>
                          <span className={styles.contact_by}>{c.created_by}</span>
                          <button className={styles.delete_btn} onClick={() => handleDeleteContact(c.id)}>삭제</button>
                        </div>
                      </div>
                      <div className={styles.contact_content}>{c.content}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── 변경이력 탭 ── */}
        {activeTab === '변경이력' && (
          <div className={styles.tab_body}>
            {logsLoading ? (
              <div className={styles.empty}>불러오는 중...</div>
            ) : logs.length === 0 ? (
              <div className={styles.empty}>변경 이력이 없습니다.</div>
            ) : (
              <div className={styles.log_list}>
                {logs.map(log => (
                  <div key={log.id} className={styles.log_row}>
                    <div className={styles.log_row_left}>
                      <span className={styles.log_action}>{log.action}</span>
                      {log.detail && <span className={styles.log_detail}>{log.detail}</span>}
                    </div>
                    <div className={styles.log_row_right}>
                      <span className={styles.log_user}>{log.user_name}</span>
                      <span className={styles.log_time}>{formatDateTime(log.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {modalOpen && (
        <StudentModal
          student={student}
          courses={courses}
          centers={centers}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={styles.info_row}>
      <span className={styles.info_label}>{label}</span>
      <span className={styles.info_value}>{value ?? '-'}</span>
    </div>
  );
}
