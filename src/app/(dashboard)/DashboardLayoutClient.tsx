'use client';

import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';
import styles from './layout.module.css';

// NAV_ITEMS는 DashboardLayoutClient 내부에서 profile.role 기반으로 동적 생성됨

export default function DashboardLayoutClient({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: Profile | null;
}) {
  const router = useRouter();

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  const initials = profile?.name?.slice(0, 2) ?? '관리';
  const roleLabel = profile?.role === 'super_admin' ? '최상위관리자' : '관리자';

  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.header_inner}>
          <div className={styles.header_left}>
            <Image
              src="/logo.png"
              alt="로고"
              width={32}
              height={32}
              className={styles.header_logo_img}
            />
            <h1 className={styles.header_title}>교육원 통합 관리 시스템</h1>
          </div>
          <div className={styles.header_right}>
            <div className={styles.header_user}>
              
              <span className={styles.header_user_name}>{profile?.name ?? '관리자'}</span>
              <span className={styles.header_role_badge}>{roleLabel}</span>
            </div>
            <button className={styles.logout_btn} onClick={handleLogout}>
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
