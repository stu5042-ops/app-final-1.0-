import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const memoryCache = globalThis.__MY_DASHBOARD_WEATHER_CACHE__ || (globalThis.__MY_DASHBOARD_WEATHER_CACHE__ = new Map());

const KO_LABELS = {
  113: '맑음', 116: '부분적 흐림', 119: '흐림', 122: '매우 흐림',
  143: '안개', 248: '안개', 260: '서리 안개', 176: '약한 이슬비', 263: '약한 이슬비',
  266: '이슬비', 281: '어는 이슬비', 284: '어는 이슬비', 293: '약한 비', 296: '비',
  299: '강한 비', 302: '강한 비', 305: '매우 강한 비', 308: '폭우', 311: '강한 비',
  314: '강한 비', 317: '강한 비', 320: '어는 비', 350: '어는 이슬비', 353: '약한 소나기',
  356: '소나기', 359: '강한 소나기', 179: '약한 눈/비', 182: '약한 눈/비', 185: '약한 눈/비',
  227: '눈', 230: '강한 눈', 323: '약한 눈', 326: '눈', 329: '강한 눈', 332: '강한 눈',
  335: '매우 강한 눈', 338: '폭설', 362: '약한 소낙눈', 365: '소낙눈', 368: '약한 눈',
  371: '눈', 374: '강한 눈', 377: '폭설', 200: '뇌우', 386: '약한 뇌우', 389: '뇌우',
  392: '뇌우/눈', 395: '뇌우/눈'
};

function mapIcon(code) {
  const c = Number.parseInt(code, 10);
  if (c === 113) return 'sun';
  if (c === 116) return 'cloud-sun';
  if ([119, 122].includes(c)) return 'cloud';
  if ([143, 248, 260].includes(c)) return 'cloud-fog';
  if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 317, 320, 350, 353, 356, 359].includes(c)) return 'cloud-rain';
  if ([179, 182, 185, 227, 230, 323, 326, 329, 332, 335, 338, 362, 365, 368, 371, 374, 377].includes(c)) return 'cloud-snow';
  if ([200, 386, 389, 392, 395].includes(c)) return 'cloud-lightning';
  return 'cloud';
}

function koLabel(code) {
  return KO_LABELS[Number.parseInt(code, 10)] || '알 수 없음';
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase 서버 환경 변수가 설정되지 않았습니다.');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function authenticate(request, admin) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) throw new Error('인증 토큰이 없습니다.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new Error('로그인이 필요합니다.');
  return data.user;
}

async function schoolContext(admin, user) {
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id,display_name,school_id,theme')
    .eq('id', user.id)
    .maybeSingle();
  if (profileError) throw profileError;

  let school = null;
  if (profile?.school_id) {
    const { data, error } = await admin.from('schools').select('*').eq('id', profile.school_id).single();
    if (error) throw error;
    school = data;
  } else {
    const { data, error } = await admin.from('schools').select('*').eq('active', true).order('name').limit(1).single();
    if (error) throw error;
    school = data;
    if (profile) {
      const { error: updateError } = await admin.from('profiles').update({ school_id: school.id, updated_at: new Date().toISOString() }).eq('id', user.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await admin.from('profiles').insert({
        id: user.id,
        display_name: user.user_metadata?.display_name || user.email?.split('@')[0] || '',
        school_id: school.id,
        theme: 'light',
      });
      if (insertError && insertError.code !== '23505') throw insertError;
    }
  }
  return { profile: profile || { id: user.id, school_id: school.id, theme: 'light' }, school };
}

async function cachedFetch(key, forceRefresh, ttlMs, liveFn) {
  if (!forceRefresh) {
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.ts < ttlMs) return hit.data;
  }
  const data = await liveFn();
  memoryCache.set(key, { ts: Date.now(), data });
  return data;
}

async function getWeatherLive(school) {
  const lat = school?.latitude ?? 36.9407;
  const lon = school?.longitude ?? 127.4525;
  const location = school?.name || '학교';
  const url = `https://wttr.in/${lat},${lon}?format=j1&lang=ko`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`날씨 API 오류 (${res.status})`);
  const data = await res.json();
  const cur = data.current_condition?.[0] || {};
  const weatherDays = data.weather || [];
  const days = weatherDays.slice(0, 3).map((d) => {
    const hourly = d.hourly || [];
    const midday = hourly.find((h) => h.time === '1200') || hourly[0] || {};
    return {
      date: d.date,
      label: koLabel(midday.weatherCode),
      icon: mapIcon(midday.weatherCode),
      tempMax: Number.parseFloat(d.maxtempC),
      tempMin: Number.parseFloat(d.mintempC),
      precipProb: Number.parseInt(midday.chanceofrain || 0, 10),
      windMax: Number.parseFloat(d['max windspeedKmph'] || 0),
    };
  });
  return {
    location,
    current: {
      temp: Number.parseInt(cur.temp_C, 10),
      label: koLabel(cur.weatherCode),
      icon: mapIcon(cur.weatherCode),
      humidity: Number.parseInt(cur.humidity || 0, 10),
    },
    days,
  };
}

function mealCell(c) {
  return String(c || '')
    .replace(/<BR\/?\>/gi, '|')
    .replace(/[\r\n]/g, '')
    .replace(/<[^>]*>/g, '')
    .split('|')
    .map((x) => x.replace(/&nbsp;/g, ' ').trim())
    .filter(Boolean)
    .join(', ');
}

async function getSchoolMealLive(school) {
  const res = await fetch(school.meal_url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!res.ok) throw new Error(`급식 페이지 오류 (${res.status})`);
  const html = await res.text();
  const tbody = html.match(/<table[^>]*summary="식단표"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  const rowsHtml = tbody ? tbody[1] : '';
  const rows = rowsHtml.split(/<tr[^>]*>/).slice(1);
  const days = [];
  for (const row of rows) {
    const cells = [];
    const cre = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    while ((cm = cre.exec(row))) cells.push(cm[1]);
    if (cells.length < 5) continue;
    const dm = cells[0].match(/Date=(\d{8})/);
    if (!dm) continue;
    const d = dm[1];
    const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
    days.push({ date, breakfast: mealCell(cells[1]), lunch: mealCell(cells[2]), dinner: mealCell(cells[3]), snack: mealCell(cells[4]) });
  }
  return { days };
}

function extractHidden(html) {
  function get(name) {
    const re = new RegExp(`${name}"[\\s\\S]*?value="([^"]*)"`);
    const m = html.match(re);
    return m ? m[1] : '';
  }
  return { __VIEWSTATE: get('__VIEWSTATE'), __VIEWSTATEGENERATOR: get('__VIEWSTATEGENERATOR'), __EVENTVALIDATION: get('__EVENTVALIDATION') };
}

function selectedValue(html, selectName) {
  const re = new RegExp(`name="${selectName}"[\\s\\S]*?<\\/select>`);
  const m = html.match(re);
  if (!m) return '';
  const sel = m[0].match(/<option[^>]*selected="selected"[^>]*value="([^"]*)"/);
  return sel ? sel[1] : '';
}

function toDate(year, mmdd) {
  if (!mmdd) return null;
  const p = mmdd.split('.');
  if (p.length < 2) return null;
  return `${year}-${String(p[0]).padStart(2, '0')}-${String(p[1]).padStart(2, '0')}`;
}

function parseScheduleItems(html, year) {
  const re = /<li>\s*<span class="date">([\s\S]*?)<\/span>\s*<span class="subject"[^>]*>([\s\S]*?)<\/span>\s*<\/li>/g;
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    const dateRaw = stripTags(m[1]).replace(/\s/g, '');
    const subject = m[2].replace(/<div class="btn[\s\S]*?<\/div>/g, ' ');
    const title = stripTags(subject);
    const parts = dateRaw.split('~');
    items.push({ title, date: toDate(year, parts[0].trim()), end_date: parts[1] ? toDate(year, parts[1].trim()) : null });
  }
  return items;
}

function setCookiesFrom(headers) {
  let cookies = [];
  if (typeof headers.getSetCookie === 'function') cookies = headers.getSetCookie();
  else {
    const raw = headers.get('set-cookie');
    if (raw) cookies = [raw];
  }
  return cookies.map((c) => c.split(';')[0]).join('; ');
}
function mergeCookies(oldC, newC) { return !newC ? oldC || '' : oldC ? `${oldC}; ${newC}` : newC; }
async function schoolHttpGet(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  return { text: await res.text(), cookies: setCookiesFrom(res.headers) };
}
async function schoolHttpPost(url, cookies, hidden, extra) {
  const payload = new URLSearchParams({
    __EVENTTARGET: '', __EVENTARGUMENT: '', __VIEWSTATE: hidden.__VIEWSTATE || '',
    __VIEWSTATEGENERATOR: hidden.__VIEWSTATEGENERATOR || '', __EVENTVALIDATION: hidden.__EVENTVALIDATION || '',
  });
  Object.entries(extra || {}).forEach(([k, v]) => payload.set(k, String(v)));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'User-Agent': UA, Cookie: cookies || '', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
    cache: 'no-store',
  });
  return { text: await res.text(), cookies: mergeCookies(cookies, setCookiesFrom(res.headers)) };
}

async function getSchoolScheduleLive(school) {
  const url = school.schedule_url;
  const g0 = await schoolHttpGet(url);
  const year = selectedValue(g0.text, 'ctl00$IContents$ddlYear') || String(new Date().getFullYear());
  let all = parseScheduleItems(g0.text, year);
  let hidden = extractHidden(g0.text);
  let cookies = g0.cookies;
  for (let i = 0; i < 12; i++) {
    try {
      const p = await schoolHttpPost(url, cookies, hidden, { 'ctl00$IContents$btnNext': '' });
      const items = parseScheduleItems(p.text, year);
      if (items.length === 0) break;
      all = all.concat(items);
      hidden = extractHidden(p.text);
      cookies = p.cookies;
      if (selectedValue(p.text, 'ctl00$IContents$ddlMonth') === '12') break;
    } catch { break; }
  }
  hidden = extractHidden(g0.text);
  cookies = g0.cookies;
  for (let j = 0; j < 12; j++) {
    try {
      const p2 = await schoolHttpPost(url, cookies, hidden, { 'ctl00$IContents$btnPrev': '' });
      const items2 = parseScheduleItems(p2.text, year);
      if (items2.length === 0) break;
      all = all.concat(items2);
      hidden = extractHidden(p2.text);
      cookies = p2.cookies;
      if (selectedValue(p2.text, 'ctl00$IContents$ddlMonth') === '1') break;
    } catch { break; }
  }
  const seen = new Set();
  const items = [];
  for (const it of all) {
    if (!it.date) continue;
    const key = `${it.title}|${it.date}|${it.end_date || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
  }
  items.sort((a, b) => (a.date < b.date ? -1 : 1));
  return { year, items };
}

async function getSchoolNoticesLive(school) {
  const res = await fetch(school.notice_url, { headers: { 'User-Agent': UA }, cache: 'no-store' });
  if (!res.ok) throw new Error(`공지 페이지 오류 (${res.status})`);
  const html = await res.text();
  const base = new URL(school.notice_url).origin + new URL(school.notice_url).pathname.replace(/\/[^/]*$/, '/');
  const tbody = html.match(/<table[^>]*summary="게시판 목록"[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/);
  const rowsHtml = tbody ? tbody[1] : '';
  const rows = rowsHtml.split(/<tr[^>]*>/).slice(1);
  const items = [];
  for (const row of rows) {
    const cells = [];
    const cre = /<td[^>]*>([\s\S]*?)<\/td>/g;
    let cm;
    while ((cm = cre.exec(row))) cells.push(cm[1]);
    if (cells.length < 4) continue;
    const titleCell = row.match(/<td class="title">([\s\S]*?)<\/td>/);
    if (!titleCell) continue;
    const am = titleCell[1].match(/<a href='([^']*)'>([\s\S]*?)<\/a>/);
    if (!am) continue;
    const link = new URL(am[1], base).toString();
    const title = stripTags(am[2]);
    const dateStr = stripTags(cells[3] || '');
    const dm = dateStr.match(/(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/);
    const date = dm ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}` : null;
    items.push({ title, link, date });
  }
  const cutoff = new Date(Date.now() - 30 * 86400000);
  return { items: items.filter((i) => i.date && new Date(`${i.date}T00:00:00`) >= cutoff).sort((a, b) => (a.date < b.date ? 1 : -1)) };
}

function latestFetched(rows) {
  return rows.reduce((max, row) => {
    const ts = row.fetched_at ? new Date(row.fetched_at).getTime() : 0;
    return Math.max(max, Number.isFinite(ts) ? ts : 0);
  }, 0);
}

function isStale(rows, ttlMs) {
  return !rows.length || Date.now() - latestFetched(rows) > ttlMs;
}

async function getScheduleDb(admin, schoolId, userId, forceRefresh, school) {
  let { data: rows, error } = await admin.from('school_schedules').select('*').eq('school_id', schoolId).eq('active', true).order('date');
  if (error) throw error;
  const stale = isStale(rows || [], 12 * 3600000);
  if (forceRefresh || stale) {
    let live;
    try {
      live = await getSchoolScheduleLive(school);
    } catch (error) {
      // Keep usable DB data when the school website is temporarily unavailable.
      if (rows && rows.length) {
        return applyScheduleOverrides(admin, rows, userId, true);
      }
      throw error;
    }
    const now = new Date().toISOString();
    if (!live.items.length && rows && rows.length) {
      return applyScheduleOverrides(admin, rows, userId, true);
    }
    { const { error: deactivateError } = await admin.from('school_schedules').update({ active: false, updated_at: now }).eq('school_id', schoolId); if (deactivateError) throw deactivateError; }
    const upsertRows = live.items.map((it) => ({
      school_id: schoolId,
      source_key: `${it.title}|${it.date}|${it.end_date || ''}`,
      title: it.title,
      date: it.date,
      end_date: it.end_date || null,
      start_time: null,
      end_time: null,
      description: null,
      source_url: school.schedule_url,
      fetched_at: now,
      active: true,
      updated_at: now,
    }));
    if (upsertRows.length) {
      const { error: upsertError } = await admin.from('school_schedules').upsert(upsertRows, { onConflict: 'school_id,source_key' });
      if (upsertError) throw upsertError;
    }
    const refreshed = await admin.from('school_schedules').select('*').eq('school_id', schoolId).eq('active', true).order('date');
    if (refreshed.error) throw refreshed.error;
    rows = refreshed.data || [];
  }

  return applyScheduleOverrides(admin, rows || [], userId, !forceRefresh && !stale);
}

async function applyScheduleOverrides(admin, rows, userId, cached) {
  const ids = (rows || []).map((r) => r.id);
  let overrides = [];
  if (ids.length) {
    const { data, error: overrideError } = await admin
      .from('school_event_overrides')
      .select('*')
      .eq('user_id', userId)
      .in('school_schedule_id', ids);
    if (overrideError) throw overrideError;
    overrides = data || [];
  }
  const byId = new Map(overrides.map((o) => [o.school_schedule_id, o]));
  const items = (rows || []).map((r) => {
    const o = byId.get(r.id);
    return {
      id: r.id,
      school_schedule_id: r.id,
      override_id: o?.id || null,
      __school: true,
      title: o?.title ?? r.title,
      date: o?.date ?? r.date,
      end_date: o?.end_date ?? r.end_date,
      start_time: o?.start_time ?? r.start_time,
      end_time: o?.end_time ?? r.end_time,
      description: o?.description ?? r.description,
      color: o?.color || 'emerald',
      deleted: !!o?.deleted,
    };
  }).filter((r) => !r.deleted);
  return { year: new Date().getFullYear(), items, cached };
}

async function getMealDb(admin, schoolId, forceRefresh, school) {
  let { data: rows, error } = await admin.from('school_meals').select('*').eq('school_id', schoolId).eq('active', true).order('meal_date');
  if (error) throw error;
  const stale = isStale(rows || [], 12 * 3600000);
  if (forceRefresh || stale) {
    let live;
    try {
      live = await getSchoolMealLive(school);
    } catch (error) {
      if (rows && rows.length) return { days: rows.map((r) => ({ date: r.meal_date, breakfast: r.breakfast, lunch: r.lunch, dinner: r.dinner, snack: r.snack })), cached: true };
      throw error;
    }
    if (!live.days.length && rows && rows.length) {
      return { days: rows.map((r) => ({ date: r.meal_date, breakfast: r.breakfast, lunch: r.lunch, dinner: r.dinner, snack: r.snack })), cached: true };
    }
    const now = new Date().toISOString();
    { const { error: deactivateError } = await admin.from('school_meals').update({ active: false, updated_at: now }).eq('school_id', schoolId); if (deactivateError) throw deactivateError; }
    const upserts = live.days.map((d) => ({
      school_id: schoolId,
      meal_date: d.date,
      breakfast: d.breakfast,
      lunch: d.lunch,
      dinner: d.dinner,
      snack: d.snack,
      fetched_at: now,
      active: true,
      updated_at: now,
    }));
    if (upserts.length) {
      const { error: upsertError } = await admin.from('school_meals').upsert(upserts, { onConflict: 'school_id,meal_date' });
      if (upsertError) throw upsertError;
    }
    const refreshed = await admin.from('school_meals').select('*').eq('school_id', schoolId).eq('active', true).order('meal_date');
    if (refreshed.error) throw refreshed.error;
    rows = refreshed.data || [];
  }
  return { days: (rows || []).map((r) => ({ date: r.meal_date, breakfast: r.breakfast, lunch: r.lunch, dinner: r.dinner, snack: r.snack })), cached: !forceRefresh && !stale };
}

async function getNoticeDb(admin, schoolId, forceRefresh, school) {
  let { data: rows, error } = await admin.from('school_notices').select('*').eq('school_id', schoolId).eq('active', true).order('notice_date', { ascending: false }).limit(100);
  if (error) throw error;
  const stale = isStale(rows || [], 6 * 3600000);
  if (forceRefresh || stale) {
    let live;
    try {
      live = await getSchoolNoticesLive(school);
    } catch (error) {
      if (rows && rows.length) return { items: rows.map((r) => ({ title: r.title, link: r.link, date: r.notice_date })), cached: true };
      throw error;
    }
    if (!live.items.length && rows && rows.length) {
      return { items: rows.map((r) => ({ title: r.title, link: r.link, date: r.notice_date })), cached: true };
    }
    const now = new Date().toISOString();
    { const { error: deactivateError } = await admin.from('school_notices').update({ active: false, updated_at: now }).eq('school_id', schoolId); if (deactivateError) throw deactivateError; }
    const upserts = live.items.map((n) => ({
      school_id: schoolId,
      source_key: `${n.date}|${n.link}|${n.title}`,
      title: n.title,
      link: n.link,
      notice_date: n.date,
      fetched_at: now,
      active: true,
      updated_at: now,
    }));
    if (upserts.length) {
      const { error: upsertError } = await admin.from('school_notices').upsert(upserts, { onConflict: 'school_id,source_key' });
      if (upsertError) throw upsertError;
    }
    const refreshed = await admin.from('school_notices').select('*').eq('school_id', schoolId).eq('active', true).order('notice_date', { ascending: false }).limit(100);
    if (refreshed.error) throw refreshed.error;
    rows = refreshed.data || [];
  }
  return { items: (rows || []).map((r) => ({ title: r.title, link: r.link, date: r.notice_date })), cached: !forceRefresh && !stale };
}

export async function POST(request) {
  try {
    const admin = getAdmin();
    const user = await authenticate(request, admin);
    const { school } = await schoolContext(admin, user);
    const body = await request.json();
    const fnName = body?.fnName;
    const args = Array.isArray(body?.args) ? body.args : [];

    if (fnName === 'getSchoolInfo') return NextResponse.json({ data: { profile: await schoolContext(admin, user).then((x) => x.profile), school } });
    if (fnName === 'getWeather') return NextResponse.json({ data: await cachedFetch(`weather:${school.id}`, !!args[0], 1800000, () => getWeatherLive(school)) });
    if (fnName === 'getSchoolSchedule') return NextResponse.json({ data: await getScheduleDb(admin, school.id, user.id, !!args[0], school) });
    if (fnName === 'getSchoolMeal') return NextResponse.json({ data: await getMealDb(admin, school.id, !!args[0], school) });
    if (fnName === 'getSchoolNotices') return NextResponse.json({ data: await getNoticeDb(admin, school.id, !!args[0], school) });

    return NextResponse.json({ error: `Unknown function: ${fnName}` }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error?.message || '서버 오류' }, { status: 500 });
  }
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
