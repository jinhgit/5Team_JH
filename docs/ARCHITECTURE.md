# 명랑회 (Myeongrang-hoe) 시스템 아키텍처

> 저장소 실제 구조 기준 문서입니다.  
> 대상: 개발·배포·발표용 아키텍처 개요

---

## 1. 한 줄 정의

**명랑회**는 대학생 모임을 **목표 인원 달성 시 성사**되는 크라우드펀딩형 모집으로 다루고,  
위치·관심사·신뢰 지표·후기(햇살지수)로 **발견 → 참여 → 만남 → 신뢰 축적**을 한 사이클로 묶은 웹 서비스입니다.

---

## 2. 전체 구조 (논리)

```text
┌─────────────────────────────────────────────────────────────┐
│  Client (Browser / Mobile Safari)                           │
│  React + TypeScript + Vite                                  │
│  pages / components / store / lib                           │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS REST (JSON)
                            │ Authorization: Bearer <accessToken>
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  API Server                                                 │
│  Spring Boot (Java 17)                                      │
│  controller → service → repository (JPA)                    │
└───────────────────────────┬─────────────────────────────────┘
                            │ JDBC
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Database                                                   │
│  로컬: H2 (파일)                                            │
│  배포: PostgreSQL (Railway / Supabase 등 환경변수 DB_URL)   │
└─────────────────────────────────────────────────────────────┘

외부 연동
  · Kakao Maps (JS 키, 프론트) — 지도·장소
  · SMTP (Gmail 등, 백엔드) — 학교 메일 OTP
  · Google Calendar 링크 / .ics — 일정 내보내기
```

---

## 3. 저장소(모노레포) 레이아웃

```text
5Team_JH/
├── BE/Myeongrang-hoe/     # Spring Boot API
├── FE/Myeongrang-hoe/     # React SPA
├── docs/                  # 설계·배포·포트폴리오 문서
├── PRD.pdf
└── README.md
```

| 경로 | 역할 |
|------|------|
| `BE/Myeongrang-hoe` | REST API, JPA 도메인, 인증·메일·펀딩 로직 |
| `FE/Myeongrang-hoe` | UI, 라우팅, 로컬 스토어 동기화, 지도·추천 UI |
| `docs/` | 아키텍처, 배포, 기능 명세 등 |

프론트와 백엔드는 **독립 프로세스**로 기동하며, 프론트는 `VITE_API_BASE_URL`로 API 베이스를 지정합니다.

---

## 4. 프론트엔드 아키텍처

### 4.1 기술 스택

| 구분 | 기술 |
|------|------|
| UI | React 19, TypeScript |
| 빌드 | Vite |
| 스타일 | Tailwind CSS 4 |
| 라우팅 | React Router |
| 지도 | Kakao Maps SDK (`react-kakao-maps-sdk`) |

### 4.2 레이어

```text
pages/          # 화면 단위 (Home, FundingTab, Login, Chat, MyPage …)
components/     # 공통 UI (BottomNav, GigCard, SunlightBadge, AiBrandMark …)
store/          # 클라이언트 상태 (db, actions, schema, notifications …)
lib/            # API 클라이언트, geo, calendar, myeongBot, kakao …
styles/         # 디자인 토큰
```

### 4.3 상태·데이터 흐름

1. **서버가 소스 오브 트루스** (로그인·펀딩·채팅·후기 등)  
2. `lib/api.ts` 가 `fetch` + Bearer 토큰으로 REST 호출  
3. `store/actions.ts` 가 응답을 로컬 DB(`store/db.ts`, localStorage)에 반영  
4. 화면은 `useDB()` / 셀렉터로 구독해 렌더  

오프라인·서버 장애 시 일부 플로우는 **로컬 시드/폴백**이 남아 있으나, 배포 환경에서는 API 연동이 기본입니다.

### 4.4 주요 화면

| 영역 | 페이지 | 역할 |
|------|--------|------|
| 인증 | Login, Signup/* | 학교 메일 OTP, 가입, 로그인 |
| 발견 | Home, FundingList | 지도, 거리 필터, 관심사 / 명랑봇 |
| 펀딩 | FundingTab, FundingForm, MyPosts | 상세·참여·일정·댓글 |
| 소통 | ChatList, ChatRoom | 성사 후 채팅(폴링) |
| 신뢰 | ReviewForm, MyPage | 후기, 햇살지수 |
| 기타 | Notifications, ProfileSetup | 알림, 프로필 |

### 4.5 클라이언트 측 “추천·신뢰” 로직

| 모듈 | 설명 |
|------|------|
| `lib/myeongBot.ts` | 거리·관심사·성사 임박·신뢰도·참여 이력 점수화 추천 (규칙 기반) |
| `lib/sunlight.ts` + `SunlightBadge` | 햇살지수 단계·배지 UI |
| FundingTab 리스크 카피 | 서버 `aiRisk` 기준 안내 UI (규칙/서버 필드) |

외부 LLM API에 상시 의존하지 않는 **규칙·점수 기반** 구조입니다.

---

## 5. 백엔드 아키텍처

### 5.1 기술 스택

| 구분 | 기술 |
|------|------|
| 런타임 | Java 17 |
| 프레임워크 | Spring Boot |
| 영속성 | Spring Data JPA, Hibernate |
| 보안 | BCrypt 비밀번호, Bearer 세션 토큰 |
| 메일 | Spring Mail (SMTP) |
| DB | H2(로컬) / PostgreSQL(배포) |

### 5.2 패키지 구조

```text
com.example.myeongranghoe
├── controller/     # REST 엔드포인트
├── service/        # 비즈니스 로직
├── repository/     # JPA Repository
├── domain/         # 엔티티
├── dto/            # API 응답 모델
└── config/         # CORS, Auth, Mail, Exception, Seeder …
```

### 5.3 계층 규칙

```text
HTTP Request
  → Controller (검증·매핑)
  → Service (트랜잭션·규칙)
  → Repository / Entity
  → JSON Response
```

공통:

- `AuthInterceptor`: `Authorization: Bearer` → 사용자 이메일 컨텍스트  
- `ApiExceptionHandler`: 검증·비즈니스 예외를 JSON `message`로 반환  
- `DataSeeder`: 테스트 계정·샘플 펀딩 (빈 DB 시)

### 5.4 핵심 도메인

| 엔티티 | 역할 |
|--------|------|
| `UserAccount` | 회원, 관심사, 햇살지수, 위치 |
| `Funding` | 모임(목표 인원, 장소, 성사·마감, aiRisk, 일정) |
| `EmailVerification` | 가입 OTP |
| `AuthSession` | 액세스 토큰 |
| `Comment` / `ChatMessage` | 댓글·채팅 |
| `Review` / `WishlistItem` | 후기·찜 |

### 5.5 주요 API 그룹

| Prefix | 기능 |
|--------|------|
| `/api/auth/*` | OTP, 가입, 로그인, 이메일 중복 |
| `/api/users/*` | 프로필, 위치, 후기 조회 |
| `/api/fundings/*` | CRUD, 참여/취소, 확정, 넛지, 댓글, 채팅, 후기, 찜 |
| `/api/fundings/{id}/calendar.ics` | 일정 ICS (캘린더 앱 연동) |
| `/api/mail/status` | SMTP 설정 여부 |
| `/api/files/*`, `/api/geo/*` | 업로드·지도 보조 |

---

## 6. 인증·인가

```text
[가입]
학교 메일 → send-verification-code → (SMTP 또는 개발용 코드 노출)
         → verify-code → 프로필 입력 → signup → accessToken

[로그인]
email + password → login → accessToken + user

[이후 요청]
Authorization: Bearer <accessToken>
  → AuthSession 조회 → UserContext(email)
```

- 비밀번호: BCrypt 해시 저장  
- 토큰: 서버 `AuthSession` 테이블에 보관 (서버 사이드 세션형)  
- 로컬 편의: `ALLOW_EMAIL_HEADER` 로 `X-User-Email` 허용 가능 (배포에서는 끄는 것 권장)

---

## 7. 핵심 비즈니스 플로우

### 7.1 펀딩 라이프사이클

```text
생성 → 모집(참여/취소) → 목표 인원 성사(matched)
     → (선택) 호스트 확정/마감
     → 일정 확정(scheduleConfirmed)
     → 채팅·캘린더
     → 만남 후 후기 → 햇살지수 갱신
```

### 7.2 홈 발견

```text
위치 확보 (GPS → 저장 위치 → 캠퍼스 폴백)
  → 주변 펀딩 동기화
  → [내 관심사] 태그 매칭 카드
  → [명랑봇] 점수 기반 “지금 나가기 좋은 모임” + 한 줄 이유
  → 목록/지도 마커
```

### 7.3 신뢰 표현

- 펀딩 `aiRisk` (낮음/중간/높음) → UI 신뢰도 안내  
- 후기 체크리스트 → 햇살지수  
- 햇살 배지 단계: 새싹 → 묘목 → 나무 → 큰 나무  

---

## 8. 인프라·배포 아키텍처

### 8.1 로컬

```text
FE: npm run dev          → http://127.0.0.1:5173
BE: ./gradlew bootRun    → http://127.0.0.1:8080
DB: H2 file ./data/myeongrang
```

### 8.2 배포 (현재 운영 형태 예시)

```text
Browser
   │
   ▼
Frontend (예: Railway Static / 동일 플랫폼 호스팅)
   │  VITE_API_BASE_URL
   ▼
Backend (예: Railway Web · Spring Boot)
   │  DB_URL / DB_USERNAME / DB_PASSWORD
   ▼
PostgreSQL (Railway Postgres 또는 Supabase 등)
```

환경변수 요약:

| 구분 | 주요 변수 |
|------|-----------|
| FE | `VITE_API_BASE_URL`, `VITE_KAKAO_MAP_KEY` |
| BE | `DB_*`, `MAIL_*`, `CORS_ALLOWED_ORIGINS`, `SERVER_PORT`/`PORT` |

관련 문서: `docs/DEPLOY_SUPABASE.md`, `docs/DEPLOY_RAILWAY.md`, `docs/RENDER_DB_CONNECTION.md` 등.

---

## 9. 보안·크로스 커팅

| 항목 | 구현 |
|------|------|
| CORS | `app.cors.allowed-origins` (환경변수 오버라이드) |
| 입력 검증 | Bean Validation (`@Valid`, `@Pattern` 학교 메일 등) |
| 파일 업로드 | 용량 제한, 로컬/볼륨 디렉터리 |
| 시크릿 | `.env` / 플랫폼 Variables (Git 커밋 금지) |
| 메일 | SMTP 실패 시 OTP 노출 옵션 (데모용, 운영 정책에 맞게 조정) |

---

## 10. 설계 원칙 요약

1. **성사 조건 명확화** — 목표 인원 기반 matched  
2. **FE/BE 분리** — SPA + REST  
3. **서버 권위 + 클라이언트 캐시** — actions 동기화  
4. **규칙 기반 보조 기능** — 추천·리스크·넛지 (외부 LLM 필수 아님)  
5. **캠퍼스 맥락** — 학교 메일(`*.ac.kr`), 이중 캠퍼스 표기  
6. **배포 이식성** — 환경변수로 DB·메일·CORS 전환  

---

## 11. 관련 문서

| 문서 | 내용 |
|------|------|
| `docs/BACKEND_기능_로드맵.md` | API·기능 완료 상태 |
| `docs/포트폴리오_명랑회_기능명세.md` | 기능·기술 명세 |
| `docs/DEPLOY_*.md` | 배포 절차 |
| `README.md` | 제품 소개 |

---

## 12. 변경 이력

| 일자 | 내용 |
|------|------|
| 2026-07-18 | 실제 코드베이스 기준으로 아키텍처 문서 초안 작성 |

---

*이 문서는 구현 상태에 맞게 갱신합니다. 인프라 벤더(Railway/Render/Vercel 등)가 바뀌어도 논리 아키텍처(FE–API–DB)는 동일합니다.*
