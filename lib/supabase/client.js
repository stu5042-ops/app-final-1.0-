import { createClient } from '@supabase/supabase-js';

let browserClient;

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase 환경 변수가 설정되지 않았습니다. .env.local 또는 Vercel 환경 변수를 확인하세요.');
  }

  browserClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  return browserClient;
}

export async function listSchools() {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('schools')
    .select('id,name,code,region,homepage_url,meal_url,schedule_url,notice_url,latitude,longitude,active')
    .eq('active', true)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getUserProfile(user) {
  if (!user) return null;
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id,display_name,school_id,theme,created_at,updated_at,schools(id,name,code,region,homepage_url,meal_url,schedule_url,notice_url,latitude,longitude,active)')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function ensureUserProfile(user, preferredSchoolId) {
  if (!user) return null;
  const supabase = getSupabaseBrowserClient();
  const existing = await getUserProfile(user);
  if (existing) {
    if (!existing.display_name && user.user_metadata?.display_name) {
      const { data, error } = await supabase
        .from('profiles')
        .update({ display_name: user.user_metadata.display_name, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select('id,display_name,school_id,theme,created_at,updated_at,schools(id,name,code,region,homepage_url,meal_url,schedule_url,notice_url,latitude,longitude,active)')
        .single();
      if (error) throw error;
      return data;
    }
    return existing;
  }

  const schools = await listSchools();
  const schoolId = preferredSchoolId || user.user_metadata?.school_id || schools[0]?.id || null;
  const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || '';

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      display_name: displayName,
      school_id: schoolId,
      theme: 'light',
    })
    .select('id,display_name,school_id,theme,created_at,updated_at,schools(id,name,code,region,homepage_url,meal_url,schedule_url,notice_url,latitude,longitude,active)')
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(patch) {
  const supabase = getSupabaseBrowserClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) throw new Error('로그인이 필요합니다.');
  const safePatch = { ...patch, updated_at: new Date().toISOString() };
  const { data, error } = await supabase
    .from('profiles')
    .update(safePatch)
    .eq('id', authData.user.id)
    .select('id,display_name,school_id,theme,created_at,updated_at,schools(id,name,code,region,homepage_url,meal_url,schedule_url,notice_url,latitude,longitude,active)')
    .single();
  if (error) throw error;
  return data;
}

export async function setUserTheme(theme) {
  return updateUserProfile({ theme: theme === 'dark' ? 'dark' : 'light' });
}

export async function setUserSchool(schoolId) {
  return updateUserProfile({ school_id: schoolId || null });
}
