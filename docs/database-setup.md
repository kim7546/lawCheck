# PostgreSQL 설치와 Railway 배포

기준: `legal_ai_platform_solution_plan_v0.4.md`의 데이터 모델과 검증 흐름.
로컬은 Docker Compose의 PostgreSQL 17, Railway는 별도 PostgreSQL 서비스를 사용합니다.
FO·BO는 API에 접속하고, DB 접속 정보는 API만 갖습니다.

이번 구성은 스키마·migration·seed·DB 검사·Docker·Railway 배포 기반입니다.
**실제 API 서버는 세션별 질문·답변을 PostgreSQL에 저장하도록 연결했습니다. DB 실행·migration·seed가 완료되어야 채팅할 수 있습니다. 변호사 검증 요청과 BO는 아직 체험 UI입니다.**
질문은 PROCESSING으로 먼저 저장하고 답변과 함께 COMPLETED로 전환합니다. 모델 실패 시 질문은 FAILED로 남고 횟수를 환급합니다. 비법률 답변은 NON_LEGAL_NOTICE로 저장합니다. 서버는 이전 문맥을 DB에서 읽으며 클라이언트가 보낸 문맥으로 대체하지 않습니다.
`GET /api/v1/chat/history`는 현재 쿠키 세션의 기록을 반환합니다. FO 화면의 자동 복원, 인증, 검증 요청·배정·답변 API, 이메일 worker는 후속 구현 사항입니다.
개발용 `QUESTION_LIMIT_ENABLED=false`는 유지합니다. DB 연동 시 무제한 세션은 `max_question_count=NULL`로 생성하고, 오픈 시 3을 지정합니다.

## 1. PC에 설치할 것

1. 현재 PC에는 Node.js 24가 설치되어 있으므로 재설치하지 않아도 됩니다.
2. [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)를 설치합니다. WSL 2 기반 Linux 컨테이너를 사용합니다.
3. WSL이 없다면 관리자 PowerShell에서 `wsl --install`을 실행하고 안내에 따라 재부팅합니다. 기존 WSL은 `wsl --update`로 업데이트할 수 있습니다.
4. Docker Desktop을 실행하고 엔진 준비가 끝날 때까지 기다립니다. 새 터미널에서 아래 명령을 확인합니다.

```powershell
docker --version
docker compose version
docker info
```

PostgreSQL·psql·pgAdmin을 Windows에 따로 설치할 필요는 없습니다. DB 화면은 프로젝트에 포함된 Prisma Studio를 사용할 수 있습니다.
현재 작업 환경에서는 Docker 설치를 확인하지 못했으므로 컨테이너 실행은 설치 후 진행해야 합니다.

## 2. 로컬 DB 생성

프로젝트 루트 PowerShell에서 실행합니다.

```powershell
Set-Location D:\workspace\lawCheck
npm install
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

기존 `.env`의 API 키 등은 보존하고 다음 값을 확인합니다. 아래 비밀번호는 로컬 개발 전용입니다.

```dotenv
POSTGRES_USER=lawcheck
POSTGRES_PASSWORD=lawcheck_local
POSTGRES_DB=lawcheck
POSTGRES_PORT=5432
DATABASE_URL=postgresql://lawcheck:lawcheck_local@127.0.0.1:5432/lawcheck?schema=public
LAW_OFFICE_CODE=LAW001
LAW_OFFICE_NAME=법률사무소 IBS
QUESTION_LIMIT_ENABLED=false
```

`docker-compose.yml`의 기본 비밀번호와 다르게 위 값을 지정해도 `.env` 값이 우선합니다. 이미 생성한 볼륨의 계정·비밀번호는 환경변수 변경만으로 바뀌지 않습니다. 기존 DB가 있다면 기존 접속 정보를 사용하세요.
5432가 사용 중이면 `POSTGRES_PORT`와 `DATABASE_URL`의 포트를 함께 5433 등으로 바꿉니다.

```powershell
npm run db:up
npm run db:setup
npm run db:status
npm run db:test
npm run db:studio
```

- `db:up`: PostgreSQL 시작 후 healthcheck가 성공할 때까지 대기.
- `db:setup`: Prisma Client 생성 → 누적 migration 적용 → 사무실 seed → 접속·33개 업무 테이블·한글 논리명·사무실 확인.
- `db:test`: 연결된 DB에서 합성 데이터로 무결성을 검증하고 전체 롤백. 개발 DB에서 실행합니다.
- `db:studio`: 터미널에 표시된 주소(기본 `http://localhost:5555`)에서 테이블 조회.

사무실 seed는 같은 `LAW_OFFICE_CODE`가 있으면 기존 값을 덮어쓰지 않습니다.
선택적으로 `.env`에 `BOOTSTRAP_ADMIN_EMAIL`과 `BOOTSTRAP_ADMIN_PASSWORD`(12자 이상)를 함께 지정하면 초기 OFFICE_ADMIN 계정을 만듭니다. 기본 관리자 비밀번호는 없습니다. 기존 계정 비밀번호도 덮어쓰지 않습니다.

이 설정은 `staff_accounts`의 사무소 직원용이며 플랫폼 `/admin` 로그인과는 별개입니다. 플랫폼 관리자는 BO에 먼저 가입한 뒤 API 환경변수 `ADMIN_EMAIL`로 지정합니다. 가입하지 않은 이메일이면 API 시작이 실패합니다. 자세한 내용은 [관리자 안내](admin.md)를 참조하세요.
이 계정은 DB 준비용이며 현재 BO 로그인 기능을 활성화하지 않습니다. 향후 인증 구현은 seed의 `scrypt$N$r$p$salt$hash` 형식을 검증해야 합니다.

```powershell
npm run db:logs
npm run db:stop
```

중지해도 `lawcheck_pgdata` 볼륨의 데이터는 유지됩니다. 개발 데이터 보존이 필요하면 볼륨 삭제 명령을 실행하지 마세요.

## 3. Railway PostgreSQL 생성

1. FO·BO·API가 있는 Railway 프로젝트의 같은 환경에서 **New → Database → PostgreSQL**을 선택합니다.
2. DB 서비스 배포와 볼륨 연결이 완료되는지 확인합니다. PC의 Docker Compose를 업로드할 필요는 없습니다.
3. **API 서비스 → Variables → Add Reference**에서 PostgreSQL 서비스의 `DATABASE_URL`을 선택합니다.
4. DB 서비스 이름이 `Postgres`라면 참조 값은 다음과 같습니다. 실제 서비스 이름에 맞추며 비밀번호를 직접 복사하지 않아도 됩니다.

```dotenv
DATABASE_URL=${{Postgres.DATABASE_URL}}
NODE_ENV=production
LAW_OFFICE_CODE=LAW001
LAW_OFFICE_NAME=법률사무소 IBS
QUESTION_LIMIT_ENABLED=false
```

기존 `OPENAI_API_KEY`, 모델, 포트 설정도 유지합니다. `DATABASE_URL`은 **FO·BO에 넣지 않습니다**.
Railway 내부 DB 주소는 같은 프로젝트의 실행 환경에서 사용합니다. PC에서는 내부 도메인으로 접속할 수 없습니다.
로컬은 PostgreSQL 17로 고정했습니다. Railway DB 이미지의 주 버전도 확인하고 가능하면 최초 생성 때 맞추세요. 데이터가 있는 볼륨의 주 버전 이미지만 임의로 바꾸지 않습니다.

## 4. API를 DB 포함 배포 설정으로 전환

변경 파일을 연결된 Git 저장소에 반영한 후 API 서비스에서 설정합니다.

| 항목                                            | 값                                    |
| ----------------------------------------------- | ------------------------------------- |
| Root Directory                                  | `/` 또는 비워 두기                    |
| Settings → Config as Code → Railway Config File | `/apps/api/railway.database.json`     |
| Builder                                         | Dockerfile (설정 파일에 포함)         |
| Dockerfile                                      | `apps/api/Dockerfile`                 |
| Pre-deploy Command                              | `npm run db:deploy`                   |
| Start Command                                   | `node apps/api/dist/server.deploy.js` |
| Healthcheck Path                                | `/api/v1/health`                      |

기존 `/apps/api/railway.json`은 DB 없이 사용하는 기존 배포용입니다. **DB를 만든 뒤 `railway.database.json`으로 바꿔야 자동 migration이 적용됩니다.**
UI에 수동으로 넣은 이전 build/start 명령이 있으면 새 배포의 적용 설정을 확인합니다. Docker 빌드는 Dockerfile이 담당합니다.
Dockerfile은 Prisma Client를 생성하고 API를 빌드합니다. 런타임에도 Prisma CLI를 포함하여 pre-deploy에서 migration과 seed를 실행합니다.
Railway의 pre-deploy는 내부 네트워크에서 실행되므로 DB 서비스 참조를 사용할 수 있습니다. migration 실패 시 로그를 해결한 뒤 재배포합니다.
운영에서는 `migrate dev`, `db push`, `migrate reset`을 실행하지 않습니다.

FO·BO의 `API_PROXY_TARGET=https://<API 공개 도메인>` 설정은 그대로 사용합니다. DB 도메인을 넣으면 안 됩니다.
배포 후 pre-deploy 로그의 migration/seed 성공을 확인하고 API 실행 컨테이너에서 `npm run db:check`로 DB까지 검사할 수 있습니다.
`/api/v1/health`의 200은 HTTP 서버 상태만 의미하며 DB·OpenAI 연결 검사가 아닙니다.

## 5. 테이블과 무결성

현재 전체 33개 업무 테이블의 한글 논리명과 컬럼 설명은 [데이터베이스 논리 스키마](database-logical-schema.md)를 기준으로 합니다. PostgreSQL의 테이블·컬럼 Comment와 Prisma `///` 주석에도 같은 내용을 적용했습니다. 아래 표는 초기 사무소 배정형 검증의 테이블 목록입니다. Office 회원은 `expert_accounts` 및 `expert_*` 관련 테이블에서 관리하며 `reviewer_` 테이블은 없습니다. 플랫폼 관리자와 BO 메뉴 설정은 [관리자 설정 안내](admin.md)를 참조하세요.

| 영역                | 테이블                                                           |
| ------------------- | ---------------------------------------------------------------- |
| 사무실·직원 인증    | `law_offices`, `staff_accounts`, `staff_sessions`                |
| 변호사·입퇴사·휴가  | `lawyers`, `lawyer_employments`, `lawyer_leaves`                 |
| FO 질문 기록        | `chat_sessions`, `chat_messages`                                 |
| 검증 요청·검토 링크 | `verification_requests`, `review_invitations`, `review_sessions` |
| 배정·변호사 답변    | `assignment_history`, `lawyer_replies`                           |
| 메일 발송·재시도    | `email_outbox`, `email_delivery_attempts`                        |
| BO 관리 이력        | `audit_logs`                                                     |

복합 외래키로 사무실·세션·질문·답변의 소속을 검증합니다. 완료된 법률 답변만 검증 요청할 수 있고, 요청 시 DB의 원문을 스냅샷으로 복사합니다. 같은 AI 답변의 중복 요청, 현재 배정과 다른 변호사/배정 버전의 답변, 입퇴사 기간 중복을 차단합니다.
제출 답변·배정 이력·감사 이력의 UPDATE는 금지합니다. 보존 기간에 따른 삭제 정책은 후속 구현 사항입니다.
토큰은 SHA-256 등 64자리 소문자 hex 해시를 저장하도록 제약을 둡니다. 이메일 발송용 임시 payload는 암호화 바이트만 저장하고 발송 완료/취소 시 지웁니다. 암호화·발송 worker는 아직 구현되지 않았습니다.
`is_active`와 사무실 `status`는 일치해야 하므로 상태 변경 시 함께 갱신합니다.
권한 검사, 세션 소유권, 배정 가능 여부(승인·재직·휴가), 상태 전이, 토큰 만료, 개인정보 마스킹·보존 정책은 API에서도 구현해야 합니다. DB 제약이 인증을 대신하지 않습니다.

## 6. 이후 스키마 변경과 검사

```powershell
# schema.prisma 수정 후 로컬 DB에서 새 migration 생성
npm run db:migrate:dev -- --name change_description
# Docker 없이 SQL migration/무결성 회귀 검사
npm run test:db
npm run db:validate
```

생성된 migration을 schema와 함께 Git에 반영합니다. 배포된 migration 파일은 수정하지 않고 새 migration을 추가합니다.
CHECK·트리거·GiST 배제 제약은 Prisma schema만으로 표현되지 않아 `202609200002_integrity_rules/migration.sql`에 직접 작성했습니다. `db push` 대신 migration을 사용합니다.
`test:db`는 PGlite의 격리된 PostgreSQL 엔진에 전체 migration을 적용하고 기존 사무실 데이터 보존과 무결성을 검사합니다. 실제 Docker 네트워크·Prisma 접속·Railway 배포 검증은 별도입니다.

공식 안내: [Docker Windows 설치](https://docs.docker.com/desktop/setup/install/windows-install/), [Railway PostgreSQL](https://docs.railway.com/databases/postgresql), [Railway pre-deploy](https://docs.railway.com/deployments/pre-deploy-command).
