# My Dashboard — Next.js + Supabase

Google Apps Script 웹앱의 UI/기능 구조를 유지한 Next.js 버전입니다.

## 이번 버전에서 바뀐 것

- 개인 데이터 저장소를 `localStorage`에서 Supabase Postgres로 변경
- Supabase Auth 로그인/회원가입 추가
- 개인 데이터에 `user_id` + RLS 적용
- 다크 모드 추가, 사용자 설정을 Supabase `profiles.theme`에 저장
- 학교 정보를 `schools`에서 관리
- 학교 일정/급식/공지를 Supabase DB에 캐시하고, 필요할 때만 원본 학교 사이트에서 서버 동기화
- 학교 일정은 사용자별 `school_event_overrides`로 수정/삭제 가능
- 홈 달력은 개인 일정을 먼저 렌더링한 뒤 학교 일정을 비동기로 덮어 씌움
- D-day에 개인 일정과 학교 일정을 함께 표시
- 기존 메일 기능은 포함하지 않음
- 사이드바의 달력/북마크 전용 탭은 포함하지 않음

원본의 랜덤 뽑기, 노트, 숙제, 스케줄러/시간표, 일정, 홈 달력, 홈 북마크, 날씨, 급식, 학교 공지 등의 UI는 기존 구조를 유지합니다.

## 1. Supabase 프로젝트 준비

Supabase 프로젝트를 만든 뒤 SQL Editor에서 아래 파일을 전체 실행하세요.

`supabase/schema.sql`

이 파일은 다음을 생성합니다.

- `profiles`
- `schools`
- `schedules`
- `homework`
- `notes`
- `timetables`
- `bookmark_folders`
- `bookmarks`
- `school_schedules`
- `school_event_overrides`
- `school_meals`
- `school_notices`

개인 테이블은 로그인한 사용자 본인의 행만 읽고 쓸 수 있도록 RLS 정책이 포함되어 있습니다. Supabase는 `auth.uid()`를 이용한 사용자별 RLS를 권장합니다.

## 2. 환경 변수

`.env.example`을 `.env.local`로 복사한 뒤 입력하세요.

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

`SUPABASE_SERVICE_ROLE_KEY`는 브라우저 코드에 노출하면 안 됩니다. 이 프로젝트에서는 학교 원본 데이터 동기화용 Next.js 서버 라우트에서만 사용합니다.

## 3. 실행

```bash
npm install
npm run dev
```

Vercel에서는 동일한 환경 변수를 Project Settings → Environment Variables에 등록한 뒤 배포하면 됩니다.

## 4. Supabase Auth

기본 로그인 방식은 이메일 + 비밀번호입니다. 회원가입 시 이름과 학교를 저장하고, 첫 로그인 때 `profiles`가 연결됩니다.

Supabase Auth에서 이메일 확인을 켜 둔 프로젝트라면 회원가입 후 확인 메일을 받은 뒤 로그인해야 할 수 있습니다.

## 5. 학교 데이터 동기화

브라우저가 학교 데이터를 직접 크롤링하지 않습니다.

1. 사용자가 로그인합니다.
2. 프로필의 `school_id`로 `schools`에서 학교 설정을 찾습니다.
3. `school_schedules`, `school_meals`, `school_notices`에 저장된 데이터가 최신이면 DB에서 바로 반환합니다.
4. DB 데이터가 비어 있거나 오래되었거나 사용자가 새로고침하면 Next.js 서버가 학교 사이트에서 데이터를 가져와 DB를 갱신한 뒤 반환합니다.

따라서 첫 동기화 이후에는 학교 일정/급식/공지 로딩을 DB 조회 중심으로 처리할 수 있습니다.

## 6. 학교 일정 수정/삭제

학교에서 가져온 원본 일정은 `school_schedules`에 보관합니다.

사용자가 학교 일정을 수정하거나 삭제하면 `school_event_overrides`에 사용자별 변경 사항을 저장합니다. 그래서 원본 학교 DB 데이터가 다시 동기화되어도 개인 수정이 다른 사용자에게 전달되지 않습니다.

## 7. 구조

```text
app/
  api/functions/route.js    # 학교 DB 캐시/동기화 + 날씨 API
  globals.css               # 기존 UI + 다크 모드 팔레트
  layout.js
  page.js                   # 인증 게이트 + 대시보드 진입
lib/
  supabase/client.js        # 브라우저 Supabase/Auth/프로필/학교
legacy/
  dashboard.js              # 기존 대시보드 UI/동작의 메인 파일
supabase/
  schema.sql                # DB + RLS + 기본 학교 데이터
```

향후 수정할 때는 이 구조를 기준으로, 변경된 파일만 교체하면 됩니다.

## 현재 기본 학교

기존 GAS 버전이 사용하던 학교 데이터 소스를 기준으로 `GVCS-음성캠퍼스`가 기본 학교로 들어 있습니다. 학교 사이트에도 같은 캠퍼스 명칭과 주소가 확인됩니다.
