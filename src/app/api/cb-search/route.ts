import { NextResponse } from 'next/server';

const CB_BASE = 'https://www.cb.or.kr';

// 세션 쿠키 캐시 (서버 재시작 전까지 유지)
let cachedCookie = '';
let cookieFetchedAt = 0;
const COOKIE_TTL = 1000 * 60 * 10; // 10분

async function getSessionCookie(): Promise<string> {
  if (cachedCookie && Date.now() - cookieFetchedAt < COOKIE_TTL) {
    return cachedCookie;
  }
  const res = await fetch(`${CB_BASE}/creditbank/stuHelp/nStuHelp7_1.do`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' },
    cache: 'no-store',
  });
  const setCookies =
    (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ??
    [res.headers.get('set-cookie') ?? ''].filter(Boolean);

  cachedCookie = setCookies.map((c) => c.split(';')[0]).join('; ');
  cookieFetchedAt = Date.now();
  return cachedCookie;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim();

  if (!query) return NextResponse.json({ subjects: [] });

  try {
    const cookie = await getSessionCookie();

    const body = new URLSearchParams({
      m_szGrId: 'A',
      m_szMajorId: 'AGAE',
      m_szGrIdOri: 'A',
      m_szMajorIdOri: 'AGAE',
      m_szEtcYomokNm: query,
    });

    const res = await fetch(`${CB_BASE}/cmmn/popup/nEtcGrMajorYomokSearch.do`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Referer': `${CB_BASE}/creditbank/stuHelp/nStuHelp7_1.do`,
        'User-Agent': 'Mozilla/5.0 (compatible)',
        'Cookie': cookie,
      },
      body: body.toString(),
      cache: 'no-store',
    });

    const html = await res.text();

    // fnReturnData('00001538', '사회복지개론') 패턴 파싱
    const matches = [...html.matchAll(/fnReturnData\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g)];
    const subjects = matches.map((m) => ({ id: m[1], name: m[2] }));

    return NextResponse.json({ subjects });
  } catch (e) {
    console.error('[cb-search]', e);
    return NextResponse.json({ subjects: [], error: 'search_failed' }, { status: 500 });
  }
}
