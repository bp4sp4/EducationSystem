import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get('name')?.trim();
  const phone = searchParams.get('phone')?.trim();

  if (!name || !phone) {
    return NextResponse.json({ subscribed: false });
  }

  const url = process.env.ALLCARE_SUPABASE_URL;
  const key = process.env.ALLCARE_SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: 'ALLCARE env not configured' }, { status: 500 });
  }

  const supabase = createClient(url, key);

  // 전화번호 포맷 정규화 (하이픈 제거)
  const phoneRaw = phone.replace(/-/g, '');
  const phoneFormatted = phone.includes('-') ? phone : phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');

  // 이름 + 전화번호로 users 조회
  const { data: user } = await supabase
    .from('users')
    .select('id')
    .eq('name', name)
    .or(`phone.eq.${phoneRaw},phone.eq.${phoneFormatted}`)
    .maybeSingle();

  if (!user) {
    return NextResponse.json({ subscribed: false, found: false });
  }

  // 활성 구독 조회
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status, plan, next_billing_date')
    .eq('user_id', user.id)
    .in('status', ['active', 'cancel_scheduled'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription) {
    return NextResponse.json({ subscribed: false, found: true });
  }

  return NextResponse.json({
    subscribed: true,
    found: true,
    status: subscription.status,
    plan: subscription.plan,
    next_billing_date: subscription.next_billing_date,
  });
}
