'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient, ensureUserProfile, listSchools } from '../lib/supabase/client';
import { destroyDashboard, initDashboard } from '../legacy/dashboard';

function applyTheme(theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.classList.toggle('dark', next === 'dark');
  document.documentElement.dataset.theme = next;
}

function LoginScreen({ schools, loadingSchools, error, onSignedIn }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error || '');

  useEffect(() => {
    if (!schoolId && schools?.[0]?.id) setSchoolId(schools[0].id);
  }, [schools, schoolId]);

  const [dark, setDark] = useState(false);

  useEffect(() => {
    const initialDark = document.documentElement.dataset.theme === 'dark';
    setDark(initialDark);
    applyTheme(initialDark ? 'dark' : 'light');
  }, []);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        if (!displayName.trim()) throw new Error('이름을 입력하세요.');
        if (!schoolId) throw new Error('학교를 선택하세요.');
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim(), school_id: schoolId } },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          await onSignedIn(data.user, schoolId);
        } else {
          setMessage('회원가입이 완료되었습니다. 이메일 확인이 필요한 경우 메일에서 계정을 확인한 뒤 로그인하세요.');
          setMode('signin');
        }
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        await onSignedIn(data.user);
      }
    } catch (err) {
      setMessage(err?.message || '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleTheme() {
    const next = dark ? 'light' : 'dark';
    setDark(next === 'dark');
    applyTheme(next);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-6 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div className="absolute right-5 top-5">
        <button
          type="button"
          onClick={toggleTheme}
          className="ui-btn rounded-none border border-neutral-200 bg-white px-3 text-xs text-neutral-700 hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-200 dark:hover:bg-neutral-900"
          aria-label="다크 모드 전환"
        >
          <span>{dark ? '☀' : '☾'}</span>
        </button>
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mb-3 text-3xl font-bold">M</div>
          <h1 className="font-display text-2xl font-medium">My Dashboard</h1>
          <p className="mt-1 text-xs text-neutral-400">개인 학습·일정 대시보드</p>
        </div>

        <form onSubmit={submit} className="border border-neutral-200 p-5 dark:border-neutral-800">
          <div className="mb-5 grid grid-cols-2 border-b border-neutral-200 dark:border-neutral-800">
            <button type="button" onClick={() => { setMode('signin'); setMessage(''); }} className={`px-3 py-2 text-xs font-medium ${mode === 'signin' ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white' : 'text-neutral-400'}`}>로그인</button>
            <button type="button" onClick={() => { setMode('signup'); setMessage(''); }} className={`px-3 py-2 text-xs font-medium ${mode === 'signup' ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white' : 'text-neutral-400'}`}>회원가입</button>
          </div>

          <div className="space-y-3">
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">이름</label>
                <input className="ui-input rounded-none border-neutral-300 dark:border-neutral-700" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="이름" required />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">이메일</label>
              <input className="ui-input rounded-none border-neutral-300 dark:border-neutral-700" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" required />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-neutral-500">비밀번호</label>
              <input className="ui-input rounded-none border-neutral-300 dark:border-neutral-700" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="비밀번호" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} required />
            </div>
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="text-xs text-neutral-500">학교</label>
                <select className="ui-input rounded-none border-neutral-300 dark:border-neutral-700" value={schoolId} onChange={(e) => setSchoolId(e.target.value)} disabled={loadingSchools} required>
                  {schools.map((school) => <option key={school.id} value={school.id}>{school.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {(message || error) && <p className="mt-3 text-xs leading-relaxed text-rose-500">{message || error}</p>}
          <button disabled={busy} className="ui-btn mt-5 w-full rounded-none bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200">
            {busy ? '처리 중...' : mode === 'signup' ? '회원가입' : '로그인'}
          </button>
        </form>

        <p className="mt-4 text-center text-[10px] text-neutral-400">개인 데이터는 로그인한 계정의 Supabase DB에 저장됩니다.</p>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [status, setStatus] = useState('loading');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      try {
        const schoolList = await listSchools();
        if (mounted) setSchools(schoolList);
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        if (!data.user) {
          applyTheme('light');
          setStatus('logged_out');
          return;
        }
        const nextProfile = await ensureUserProfile(data.user);
        if (!mounted) return;
        setUser(data.user);
        setProfile(nextProfile);
        applyTheme(nextProfile?.theme || 'light');
        setStatus('ready');
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || '초기화에 실패했습니다.');
        setStatus('error');
      }
    }

    bootstrap();
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextUser) => {
      if (!mounted) return;
      if (!nextUser) {
        destroyDashboard();
        setUser(null);
        setProfile(null);
        setStatus('logged_out');
        applyTheme('light');
        return;
      }
      try {
        const nextProfile = await ensureUserProfile(nextUser);
        if (!mounted) return;
        setUser(nextUser);
        setProfile(nextProfile);
        applyTheme(nextProfile?.theme || 'light');
        setStatus('ready');
      } catch (err) {
        if (!mounted) return;
        setError(err?.message || '프로필을 불러오지 못했습니다.');
        setStatus('error');
      }
    });

    return () => {
      mounted = false;
      subscription?.subscription?.unsubscribe();
      destroyDashboard();
    };
  }, [supabase]);

  useEffect(() => {
    if (status === 'ready' && user) {
      initDashboard(user, profile);
      return () => destroyDashboard();
    }
  }, [status, user, profile]);

  async function handleSignedIn(nextUser, preferredSchoolId) {
    const nextProfile = await ensureUserProfile(nextUser, preferredSchoolId);
    setUser(nextUser);
    setProfile(nextProfile);
    applyTheme(nextProfile?.theme || 'light');
    setStatus('ready');
  }

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center text-xs text-neutral-400">불러오는 중...</div>;
  }

  if (status === 'error') {
    return <div className="flex h-screen items-center justify-center px-6 text-center text-xs text-rose-500">{error}</div>;
  }

  if (status === 'logged_out') {
    return <LoginScreen schools={schools} loadingSchools={schools.length === 0} error={error} onSignedIn={handleSignedIn} />;
  }

  return (
    <div className="flex h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <div id="sidebar-container" />
      <main id="main-content" className="flex-1 overflow-y-auto" />
    </div>
  );
}
