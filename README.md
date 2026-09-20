# lawCheck

FO 사용자용 법률 채팅과 BO 법률사무실 관리 시스템의 개발 기반입니다.

## 실행

Node.js 24 LTS와 npm을 사용합니다.

```powershell
npm install
Copy-Item .env.example .env
npm run dev
```

이미 `.env`가 있다면 덮어쓰지 마세요. `.env`는 루트에 두며 Git에 포함하지 않습니다.

| 서비스 | 주소                                | 현재 범위                                            |
| ------ | ----------------------------------- | ---------------------------------------------------- |
| FO     | http://localhost:5173               | 홍보·채팅 첫 화면, 질문 예시, 대화 및 검증 요청 체험 |
| BO     | http://localhost:5174               | 업무·변호사·휴가·발송 메뉴와 기본 화면               |
| API    | http://localhost:4000/api/v1/health | 상태 확인, 공개 사무실 설정                          |

`npm run dev`로 세 서비스를 함께 실행하고 Ctrl+C로 종료합니다. 개발 서버는 로컬 인터페이스에만 바인딩합니다. API 포트를 변경하면 FO·BO의 Vite 프록시도 맞춰야 합니다.

## 현재 구현 범위

- React + TypeScript + Vite 기반 FO·BO 별도 앱
- Node.js + Express API와 공통 TypeScript 계약
- PostgreSQL Docker Compose, Prisma 스키마·초기 migration·사무실 seed
- TypeScript strict, ESLint, API 테스트, 데스크톱·모바일 Playwright 테스트
- 개발용 OpenAI Docs MCP 설정 예시

질문을 보내면 서버의 `POST /api/v1/chat`이 질문을 DB에 저장한 뒤 OpenAI Responses API를 호출합니다. 답변 저장 완료 후 다음 말풍선에 GPT 답변을 표시합니다. 이전에 완료된 대화는 서버가 DB에서 조회합니다. 로딩·오류 상태를 표시하며 실패한 질문은 다시 전송할 수 있습니다. DB 기록은 유지되지만 FO 화면의 새로고침 후 자동 복원은 아직 연결하지 않았습니다. 이메일 발송·실제 검증 요청은 체험 기능입니다.

개발 중에는 질문 횟수 제한을 기본적으로 끕니다(`QUESTION_LIMIT_ENABLED=false`, 미설정 시에도 꺼짐). 화면에서 남은 횟수를 숨기고 3회 이후에도 계속 질문할 수 있습니다. 긴 대화에서는 최근 완료된 질문·답변 10쌍을 API 문맥으로 전달합니다. 오픈 시 루트 `.env`에 `QUESTION_LIMIT_ENABLED=true`를 설정하고 API를 재시작하면 세션당 3회 제한이 다시 적용됩니다. 비법률 질문도 포함하며 모델 호출 실패 시 횟수를 복구합니다. 동시 요청 차단은 제한 설정과 관계없이 유지합니다.

새로고침해도 같은 쿠키 세션을 사용합니다. `새 대화 시작`은 `POST /api/v1/chat/session`으로 새 DB 세션을 만들고 이전 세션을 만료시킵니다. 실제 서버는 `chat_sessions`에 세션·카운터, `chat_messages`에 질문·답변을 저장합니다. 토큰은 해시로 저장하고 세션은 24시간 유효합니다. DB 기록은 재시작 후에도 유지됩니다. `GET /api/v1/chat/history`로 현재 세션 기록을 조회할 수 있으며 FO의 새로고침 후 화면 복원은 후속 작업입니다. DB 연결이 안 되면 채팅은 `DATABASE_UNAVAILABLE`로 실패하며 메모리 저장으로 대체하지 않습니다.

AI 답변은 구조화된 `answer`, `isLegalQuestion`으로 받습니다. 현재 질문과 이전 문맥을 바탕으로 법률 여부를 판별하며, 법률 질문으로 확인된 완료 답변에만 변호사 검증 요청 버튼을 표시합니다. 비법률·판별 누락·거절·오류 응답에는 버튼을 표시하지 않습니다. 참고: [OpenAI 구조화된 출력](https://developers.openai.com/api/docs/guides/structured-outputs).

루트 `.env`에 `OPENAI_API_KEY`를 설정하고 API 서버를 재시작하세요. `OPENAI_ANSWER_MODEL` 기본값은 `gpt-4.1-mini`입니다. 키는 서버에서만 사용합니다. 키가 없거나 호출이 실패하면 오류 안내를 표시합니다. 대화는 OpenAI에 전송되며 `store: false`를 지정합니다. DB 변경은 없습니다.

구현 참고: [OpenAI 텍스트 생성 문서](https://developers.openai.com/api/docs/guides/text).

기본 사무실명 `법률사무소 IBS`은 샘플입니다. `.env`의 `LAW_OFFICE_NAME` 변경 후 API를 재시작하면 FO에 반영됩니다. API가 꺼진 경우에도 샘플 첫 화면을 열 수 있습니다.

## 프로젝트 구조

```text
apps/
  fo/                 사용자용 lawCheck
  bo/                 법률사무실 관리 화면
  api/
    src/              서버·health·공개 설정
    prisma/           schema·migration·seed
packages/contracts/   공통 API 타입
tests/                첫 화면 브라우저 테스트
docs/                 기획서·MCP 설정 예시
```

BO는 관리용 애플리케이션입니다. 공통 Backend는 `apps/api`에 별도로 둡니다.

## Railway 체험 배포

FO·BO의 로컬 개발 설정은 `vite.config.ts`, 배포 확인 설정은 `vite.preview.config.ts`로 분리합니다.
배포용 API 주소는 `API_PROXY_TARGET`으로 지정하며, 미설정 시 로컬 API로 연결하지 않습니다.
실행 명령과 환경변수는 [Railway 배포 안내](docs/railway-deployment.md)를 참고하세요.

API의 로컬 설정은 `apps/api/src/server.config.ts`, Railway 배포 설정은 `apps/api/src/server.deploy.config.ts`입니다. API 서비스에서 `/apps/api/railway.json`을 Config File로 지정하고 저장소 루트에서 빌드·실행합니다. `npm run start -w @lawcheck/api`는 배포 진입 파일로 실행하여 `0.0.0.0:$PORT`에 바인딩하며 로컬 `.env`를 읽지 않습니다. IntelliJ 디버그는 기존 `apps/api/src/server.ts`를 그대로 사용합니다.

## 데이터베이스 준비

Docker Desktop으로 PostgreSQL 17을 실행합니다. 설치부터 Railway 연결까지는 [DB 설정 안내](docs/database-setup.md)를 순서대로 진행하세요.

```powershell
npm run db:up
npm run db:setup
npm run db:studio
```

누적 migration은 사무실·직원·변호사·채팅·검증·배정·답변·메일·감사 이력 등 16개 테이블을 생성합니다. `npm run test:db`는 Docker 없이 격리된 PostgreSQL 엔진에서 migration과 무결성을 검사합니다. 실제 연결은 `npm run db:check`로 확인합니다. DB가 없어도 health는 200을 반환하며 **DB 연결 정상 여부를 의미하지 않습니다**.

Railway에 PostgreSQL 서비스를 만든 뒤 API의 `DATABASE_URL`을 참조하고 Config File을 `/apps/api/railway.database.json`으로 지정하면 Docker 빌드와 pre-deploy migration을 사용합니다. 채팅은 DB 연결이 필요합니다. 검증·BO UI의 업무 API 연결은 후속 구현 범위입니다.

## 검사

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright 테스트는 Windows에 설치된 Microsoft Edge를 사용합니다. 다른 환경에서는 `playwright.config.ts`의 `channel`을 제거하고 `npx playwright install chromium`을 실행하세요. 데스크톱과 모바일 크기에서 질문·검증 체험·대화 초기화·API 요청·실패 후 재시도를 검사합니다.

Prisma CLI·Client는 초기 schema 문법과 호환되는 동일 버전으로 고정합니다. 버전을 올릴 때 schema validate/generate와 의존성 감사 결과를 함께 확인합니다.

## MCP

프로젝트의 `.codex/config.toml`에 OpenAI 개발 문서 검색용 MCP 설정을 추가했습니다. 신뢰된 프로젝트로 열고 Codex 클라이언트를 재시작한 뒤 연결을 확인합니다. 현재 CLI에서는 프로젝트 설정이 로드되지 않아 활성 연결까지 확인하지 못했습니다. 설정 예시는 `docs/mcp-config.example.toml`에도 있습니다.

```powershell
codex mcp list
```

MCP 문서 조회와 FO의 GPT API 호출은 별개입니다. 실제 업무용 MCP 서버는 현재 만들지 않습니다.

## 다음 구현

1. FO: 저장된 대화 화면 복원·중복 전송 방지와 실제 배포 DB 검증
2. FO: 개인정보 마스킹·법률 분류 고도화
3. FO: 질문 소유권 검증·이메일 수집·검증 요청 저장
4. BO: 직원 인증·변호사·입퇴사·휴가 관리
5. BO: 배정·재배정·토큰 답변·outbox 이메일 발송

공개 서비스 배포 전 실제 인증·보관 정책과 업무 API 연결을 완료해야 합니다. 현재 화면은 내부 개발·검토용입니다.
