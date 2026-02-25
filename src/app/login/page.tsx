'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { createClient } from '@/lib/supabase/client';
import styles from './page.module.css';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    router.push('/students');
    router.refresh();
  }

  return (
    <div className={styles.page}>
      <div className={styles.logo_area}>
        <Image src="/logo.png" alt="로고" width={30} height={30} className={styles.logo_img} priority />
        <h1 className={styles.logo_title}>교육원 관리 시스템</h1>
      </div>

      <form className={styles.card} onSubmit={handleSubmit}>
        <input
          className={styles.input}
          type="email"
          placeholder="이메일을 입력하세요"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={styles.input}
          type="password"
          placeholder="비밀번호"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error && <div className={styles.error_msg}>{error}</div>}

        <button
          className={styles.submit_btn}
          type="submit"
          disabled={loading}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>
      </form>

      <p className={styles.footer_text}>로그인에 문제가 있으시면 관리자에게 문의하세요.</p>
    </div>
  );
}
