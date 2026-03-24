'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { logActivity } from '@/lib/logger';
import styles from './page.module.css';

interface Manager {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export default function AdminManagersPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [managers, setManagers] = useState<Manager[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Manager | null>(null);
  const [form, setForm] = useState({ name: '', sort_order: 0 });
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) { router.push('/login'); return; }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'super_admin') { router.push('/students'); return; }

      const { data } = await supabase.from('managers').select('*').order('sort_order');
      if (!cancelled) {
        setManagers((data ?? []) as Manager[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  function openAdd() {
    setEditTarget(null);
    const nextOrder = managers.length > 0 ? Math.max(...managers.map(m => m.sort_order)) + 1 : 1;
    setForm({ name: '', sort_order: nextOrder });
    setShowModal(true);
  }

  function openEdit(m: Manager) {
    setEditTarget(m);
    setForm({ name: m.name, sort_order: m.sort_order });
    setShowModal(true);
  }

  async function handleSave() {
    if (savingRef.current || !form.name.trim()) return;
    savingRef.current = true;
    setSaving(true);
    const supabase = createClient();

    if (editTarget) {
      await supabase.from('managers').update({ name: form.name.trim(), sort_order: form.sort_order }).eq('id', editTarget.id);
      setManagers(prev => prev.map(m => m.id === editTarget.id ? { ...m, name: form.name.trim(), sort_order: form.sort_order } : m).sort((a, b) => a.sort_order - b.sort_order));
      logActivity({ action: '담당자 수정', target_type: 'manager', target_name: form.name.trim() });
    } else {
      const { data } = await supabase.from('managers').insert({ name: form.name.trim(), sort_order: form.sort_order }).select().single();
      if (data) setManagers(prev => [...prev, data as Manager].sort((a, b) => a.sort_order - b.sort_order));
      logActivity({ action: '담당자 추가', target_type: 'manager', target_name: form.name.trim() });
    }

    savingRef.current = false;
    setSaving(false);
    setShowModal(false);
  }

  async function handleDelete(m: Manager) {
    if (!confirm(`"${m.name}" 담당자를 삭제하시겠습니까?`)) return;
    const supabase = createClient();
    await supabase.from('managers').delete().eq('id', m.id);
    setManagers(prev => prev.filter(x => x.id !== m.id));
    logActivity({ action: '담당자 삭제', target_type: 'manager', target_name: m.name });
  }

  if (loading) return <div className={styles.loading}>불러오는 중...</div>;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>담당자 관리</div>
          <div className={styles.sub}>담당자 {managers.length}명</div>
        </div>
        <button className={styles.add_btn} onClick={openAdd}>+ 담당자 추가</button>
      </div>

      <div className={styles.table_wrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>순서</th>
              <th>이름</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {managers.length === 0 ? (
              <tr><td colSpan={3} className={styles.empty}>등록된 담당자가 없습니다.</td></tr>
            ) : managers.map(m => (
              <tr key={m.id}>
                <td className={styles.sort_order}>{m.sort_order}</td>
                <td className={styles.manager_name}>{m.name}</td>
                <td>
                  <div className={styles.row_actions}>
                    <button className={styles.edit_btn} onClick={() => openEdit(m)}>수정</button>
                    <button className={styles.delete_btn} onClick={() => handleDelete(m)}>삭제</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className={styles.overlay} onClick={() => setShowModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modal_header}>
              <span className={styles.modal_title}>{editTarget ? '담당자 수정' : '담당자 추가'}</span>
              <button className={styles.modal_close} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modal_body}>
              <div className={styles.field}>
                <label className={styles.label}>이름</label>
                <input
                  className={styles.input}
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="담당자 이름"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleSave()}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>순서</label>
                <input
                  type="number"
                  className={styles.input}
                  value={form.sort_order}
                  onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
                  min={1}
                />
              </div>
            </div>
            <div className={styles.modal_footer}>
              <button className={styles.cancel_btn} onClick={() => setShowModal(false)}>취소</button>
              <button className={styles.confirm_btn} onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? '저장 중...' : editTarget ? '수정' : '추가'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
