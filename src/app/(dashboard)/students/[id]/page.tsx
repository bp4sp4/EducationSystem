'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Student, Course, EducationCenter } from '@/types';
import StudentModal from '@/components/StudentModal';
import styles from './page.module.css';

function formatDate(d: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
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

export default function StudentDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const router   = useRouter();

  const [student,  setStudent]  = useState<Student | null>(null);
  const [courses,  setCourses]  = useState<Course[]>([]);
  const [centers,  setCenters]  = useState<EducationCenter[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from('students').select('*, courses(*)').eq('id', id).single(),
      supabase.from('courses').select('*').order('id'),
      supabase.from('education_centers').select('*').order('id'),
    ]).then(([s, c, e]) => {
      setStudent(s.data as Student);
      setCourses((c.data as Course[]) ?? []);
      setCenters((e.data as EducationCenter[]) ?? []);
    });
  }, [id]);

  async function handleSubmit(data: import('@/types').StudentFormData) {
    const supabase = createClient();
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
    const { error } = await supabase.from('students').update(payload).eq('id', id);
    if (error) { alert(`수정 실패: ${error.message}`); return; }
    // 다시 불러오기
    const { data: updated } = await supabase.from('students').select('*, courses(*)').eq('id', id).single();
    setStudent(updated as Student);
  }

  if (!student) {
    return (
      <div className={styles.page_wrap}>
        <div className={styles.loading}>불러오는 중...</div>
      </div>
    );
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

      {/* 헤더 */}
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

        {/* 기본 정보 */}
        <div className={styles.info_card}>
          <div className={styles.card_title}>기본 정보</div>
          <div className={styles.info_list}>
            <Row label="담당자"   value={student.manager_name} />
            <Row label="교육원"   value={student.education_center_name} />
            <Row label="과정"     value={student.courses?.name} />
            <Row label="개강반"   value={student.class_start} />
            <Row label="최종학력" value={student.education_level} />
            <Row label="등록일"   value={formatDate(student.registered_at)} />
          </div>
        </div>

        {/* 학습 정보 */}
        <div className={styles.info_card}>
          <div className={styles.card_title}>학습 정보</div>
          <div className={styles.info_list}>
            <Row label="목표취득일" value={formatDate(student.target_completion_date)} />
            <Row label="비용"
              value={student.cost ? `${student.cost.toLocaleString()}원` : null} />
            <Row label="올케어" value={student.all_care ? 'O' : 'X'} />
            {student.notes && <Row label="메모" value={student.notes} />}
          </div>
        </div>
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

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className={styles.info_row}>
      <span className={styles.info_label}>{label}</span>
      <span className={styles.info_value}>{value ?? '-'}</span>
    </div>
  );
}
