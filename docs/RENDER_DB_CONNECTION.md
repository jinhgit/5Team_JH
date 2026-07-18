# Render + Supabase DB 연결 실패 해결

## 에러 의미

```text
JDBCConnectionException: Unable to open JDBC Connection for DDL execution
The connection attempt failed.
Application run failed
```

→ **Docker/앱 빌드는 성공**했지만,  
→ 기동 시 **Supabase Postgres에 접속하지 못해** Spring이 종료됨.

---

## 가장 흔한 원인

1. **Direct 호스트 (`db.xxx.supabase.co`) 가 Render에서 안 열림** (IPv6/네트워크)
2. **비밀번호 오타** / 특수문자
3. Supabase 프로젝트 **Paused** (무료 티어 슬립)
4. Username 형식 오류 (pooler 사용 시 `postgres.프로젝트ref` 필요)

---

## 해결 1 — Session Pooler 로 바꾸기 (권장)

### Supabase에서 주소 복사

1. 프로젝트 열기  
2. 상단 **Connect**  
3. **Connection string** / **Session pooler** (또는 Method: Session)  
4. URI 예:

```text
postgresql://postgres.jgihoktxpzonbjlxcjwy:[YOUR-PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres
```

> `aws-0-...` 의 **리전 숫자/이름은 Connect 화면에 나온 그대로** 쓰세요.  
> Seoul이면 보통 `ap-northeast-2` 근처입니다.

### Render Environment 수정

| Name | Value (예시) |
|------|----------------|
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `DB_URL` | `jdbc:postgresql://aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres?sslmode=require` |
| `DB_USERNAME` | `postgres.jgihoktxpzonbjlxcjwy` |
| `DB_PASSWORD` | Supabase DB 비밀번호 |

**중요**

- Direct 때: `DB_USERNAME=postgres`  
- Pooler 때: `DB_USERNAME=postgres.jgihoktxpzonbjlxcjwy` (**프로젝트 ref 포함**)  
- Host는 Connect에 나온 **pooler 호스트 그대로**  
- `?sslmode=require` 유지  

저장 후 **Manual Deploy / Clear build cache & deploy**.

---

## 해결 2 — Direct 유지 시 점검

지금 쓰던 값:

```text
DB_URL=jdbc:postgresql://db.jgihoktxpzonbjlxcjwy.supabase.co:5432/postgres?sslmode=require
DB_USERNAME=postgres
DB_PASSWORD=...
```

확인:

1. Supabase 프로젝트가 **Active** 인지 (Paused면 Resume)  
2. 비밀번호 Reset 후 Render에 다시 입력  
3. 값에 따옴표 `"..."` 가 붙어 있지 않은지  
4. 그래도 실패하면 → **해결 1 Pooler** 로 전환  

---

## 해결 3 — Supabase 쪽 상태

1. Dashboard 홈에서 프로젝트가 **paused** 면 **Restore**  
2. **Project Settings → Database** 에서 password reset  
3. 새 비밀번호를 Render `DB_PASSWORD`에 반영  

---

## 성공 로그

```text
HikariPool-1 - Start completed.
Started MyeongrangHoeApplication
```

확인 URL:

```text
https://본인.onrender.com/api/mail/status
```

---

## 체크리스트

- [ ] `SPRING_PROFILES_ACTIVE=prod`
- [ ] Pooler 사용 시 username = `postgres.jgihoktxpzonbjlxcjwy`
- [ ] `DB_URL` host = Connect의 pooler host
- [ ] `sslmode=require`
- [ ] 비밀번호 재확인
- [ ] Supabase not paused
- [ ] 변수 수정 후 **Redeploy**
