import { createClient } from './supabase/client';

/**
 * 관리자 활동 로그를 Supabase activity_logs 테이블에 기록한다.
 * fire-and-forget 방식으로 호출해도 무방하며, 로그 실패가 메인 플로우를 막지 않는다.
 */
export async function logActivity(params: {
  action: string;
  target_type?: string;
  target_name?: string;
  detail?: string;
}) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single();

  await supabase.from('activity_logs').insert({
    user_id: user.id,
    user_name: profile?.name ?? user.email ?? '알 수 없음',
    action: params.action,
    target_type: params.target_type ?? null,
    target_name: params.target_name ?? null,
    detail: params.detail ?? null,
  });
}
