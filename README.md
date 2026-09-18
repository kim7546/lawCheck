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

**첫 화면은 명시적인 체험 모드입니다.** 질문의 답변은 동일한 고정 예시이며 GPT가 생성하지 않습니다. 질문과 폼 입력은 React 메모리에만 있고 서버나 브라우저 저장소에 저장되지 않습니다. 새로고침 시 사라집니다. 이메일 발송·실제 검증 요청·인사 데이터·직원 인증은 아직 구현하지 않았습니다. API는 실제 접수처럼 보이는 가짜 성공 응답을 제공하지 않습니다.

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

## 데이터베이스 준비

Docker Desktop 또는 별도 PostgreSQL 서버가 필요합니다. 첫 화면 실행에는 DB가 필요하지 않습니다.

```powershell
docker compose up -d postgres
npm run db:generate
npm run db:migrate
npm run db:seed
```

초기 migration은 `law_offices` 테이블만 생성합니다. 익명 세션·대화·검증·직원·입퇴사·휴가·배정 이력 테이블은 해당 API 구현 단계에서 추가합니다. DB가 없어도 health는 200을 반환하며 **DB 연결 정상 여부를 의미하지 않습니다**.

로컬 개발용 DB 비밀번호만 Compose에 포함되어 있습니다. 운영 배포 시 별도 인증 정보·배포 구성이 필요합니다.

## 검사

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Playwright 테스트는 Windows에 설치된 Microsoft Edge를 사용합니다. 다른 환경에서는 `playwright.config.ts`의 `channel`을 제거하고 `npx playwright install chromium`을 실행하세요. 데스크톱과 모바일 크기에서 질문·검증 체험·대화 초기화·개인정보 비전송을 검사합니다.

Prisma CLI·Client는 초기 schema 문법과 호환되는 동일 버전으로 고정합니다. 버전을 올릴 때 schema validate/generate와 의존성 감사 결과를 함께 확인합니다.

## MCP

프로젝트의 `.codex/config.toml`에 OpenAI 개발 문서 검색용 MCP 설정을 추가했습니다. 신뢰된 프로젝트로 열고 Codex 클라이언트를 재시작한 뒤 연결을 확인합니다. 현재 CLI에서는 프로젝트 설정이 로드되지 않아 활성 연결까지 확인하지 못했습니다. 설정 예시는 `docs/mcp-config.example.toml`에도 있습니다.

```powershell
codex mcp list
```

MCP 문서 조회와 FO의 GPT API 호출은 별개입니다. 실제 업무용 MCP 서버는 현재 만들지 않습니다.

## 다음 구현

1. FO: 익명 서버 세션·질문 제한·대화 DB 저장
2. FO: 개인정보 마스킹·법률 분류·실제 GPT 답변
3. FO: 질문 소유권 검증·이메일 수집·검증 요청 저장
4. BO: 직원 인증·변호사·입퇴사·휴가 관리
5. BO: 배정·재배정·토큰 답변·outbox 이메일 발송

공개 서비스 배포 전 실제 인증·보관 정책과 업무 API 연결을 완료해야 합니다. 현재 화면은 내부 개발·검토용입니다.
