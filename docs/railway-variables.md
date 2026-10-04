# Railway 서비스별 환경변수

Railway에서 대상 환경(개발 또는 운영)을 선택하고 각 서비스의 Variables에 입력합니다. 개발 환경에서도 배포한 앱은 `NODE_ENV=production`을 사용합니다. 개발·운영은 연결할 DB와 서비스 주소로 구분합니다.

공통 API 공개 주소는 `https://api.aiqaver.com`을 사용합니다. 별도 개발 환경의 API에는 해당 환경의 API 주소를 지정합니다. `PORT`는 각 서비스의 Networking → Domain Target port와 맞춥니다. 기존 FO가 5173을 사용한다면 4173으로 바꾸지 않고 `PORT=5173`을 유지해도 됩니다.

## API

참고 파일: [apps/api/.env.example](../apps/api/.env.example)

```dotenv
NODE_ENV=production
PORT=4000
DATABASE_URL=${{Postgres.DATABASE_URL}}
OPENAI_API_KEY=발급받은_API_키
OPENAI_ANSWER_MODEL=gpt-4.1-mini
LAW_OFFICE_CODE=LAW001
LAW_OFFICE_NAME=법률사무소 IBS
QUESTION_LIMIT_ENABLED=false
VOICE_INPUT_ENABLED=true
```

- `DATABASE_URL`: 현재 API의 DB 기능에 필수입니다. `Postgres`는 실제 Railway DB 서비스 이름으로 바꿉니다.
- `OPENAI_API_KEY`: AI 답변 생성에 필요합니다. API에만 등록합니다.
- `OPENAI_ANSWER_MODEL`: 현재 코드 기본값은 `gpt-4.1-mini`이며, 사용하는 모델 ID로 지정합니다.
- `LAW_OFFICE_CODE`, `LAW_OFFICE_NAME`: 사무소 식별 코드와 표시명입니다. 코드 기본값은 각각 `LAW001`, `법률사무소 IBS`입니다.
- `QUESTION_LIMIT_ENABLED`: `true`이면 대화당 질문 3회 제한, `false`이면 제한 해제입니다.
- `VOICE_INPUT_ENABLED`: 기본 활성화입니다. `false`이면 FO 마이크 버튼을 숨기고 음성 세션 발급을 중단합니다. 기존 `OPENAI_API_KEY`로 `gpt-live-transcribe`를 사용합니다. [음성 입력 설정과 검증](voice-input.md)을 참고하세요.

최초에는 `ADMIN_EMAIL`을 비워 두고 배포합니다. 이 환경의 BO에서 회원가입한 뒤 API에 아래 값을 추가하고 재배포합니다. 이미 가입한 활성 회원이라면 바로 설정할 수 있습니다.

```dotenv
ADMIN_EMAIL=kim7546@gmail.com
```

API는 기존 BO 회원에 플랫폼 관리자 권한을 연결합니다. 미가입·중지된 회원이나 회수된 관리자 권한을 지정하면 API 시작이 실패합니다. 기존 BO 비밀번호를 사용하며, 한번 부여한 권한은 DB에 유지됩니다.

`BOOTSTRAP_ADMIN_EMAIL`과 `BOOTSTRAP_ADMIN_PASSWORD`는 별도 `staff_accounts` 사무소 직원 생성용입니다. 플랫폼 Admin에는 필요하지 않습니다. 사용하지 않으면 둘 다 생략합니다. 사무소 직원을 초기 생성할 때만 둘 다 지정하며 비밀번호는 12자 이상이어야 합니다.

API의 Railway Config File은 [apps/api/railway.database.json](../apps/api/railway.database.json)을 사용합니다. 배포 전에 `npm run db:deploy`로 migration과 seed를 적용합니다. Root Directory는 저장소 루트(`/`)입니다. 관리자 migration `202609260001_platform_admin`이 포함되어야 합니다.

API 서비스의 Settings → Networking → Custom Domain에 `api.aiqaver.com`을 등록하고 `PORT=4000`이면 Target port도 `4000`으로 설정합니다. DNS에는 Railway가 안내한 CNAME과 소유권 확인 TXT를 등록합니다. 도메인 검증과 HTTPS 인증서 발급 후 `https://api.aiqaver.com/api/v1/health`의 HTTP 200 및 `success: true` 응답을 확인하고 Admin·BO·FO의 API 주소를 전환합니다. 상세 내용은 [배포 안내](railway-deployment.md)를 참조하세요.

## Admin

참고 파일: [apps/admin/.env.example](../apps/admin/.env.example)

```dotenv
NODE_ENV=production
PORT=4175
API_PROXY_TARGET=https://api.aiqaver.com
SEARCH_ENGINE_INDEXING_ENABLED=false
```

`API_PROXY_TARGET`은 API의 origin이며 `/api`나 `/api/v1`을 붙이지 않습니다.

Config File은 [apps/admin/railway.json](../apps/admin/railway.json), Root Directory는 저장소 루트(`/`)입니다. `admin.aiqaver.com`과 `lawcheckadmin-production.up.railway.app`은 기본 허용 호스트입니다. 다른 도메인을 쓰면 `PREVIEW_ALLOWED_HOSTS=추가도메인`을 설정합니다.

`Blocked request. This host (...) is not allowed.`가 표시되면 Admin 서비스에 `PREVIEW_ALLOWED_HOSTS=lawcheckadmin-production.up.railway.app`처럼 오류에 나온 호스트명을 추가하고 재배포합니다. 기존 목록이 있으면 쉼표로 추가합니다. 시작 명령은 `npm run preview -w @lawcheck/admin`이어야 `vite.preview.config.ts`의 설정을 읽습니다. `RAILWAY_PUBLIC_DOMAIN`이 비어 있거나 접속한 도메인과 다른 경우에도 명시한 호스트는 허용됩니다.

## BO

참고 파일: [apps/bo/.env.example](../apps/bo/.env.example)

```dotenv
NODE_ENV=production
PORT=4174
API_PROXY_TARGET=https://api.aiqaver.com
SEARCH_ENGINE_INDEXING_ENABLED=false
```

`office.aiqaver.com`은 기본 허용 호스트입니다. 다른 커스텀 도메인을 쓰면 `PREVIEW_ALLOWED_HOSTS=추가도메인`을 설정합니다. BO에는 별도의 관리자 이메일이나 DB 연결값을 넣지 않습니다.

## FO

참고 파일: [apps/fo/.env.example](../apps/fo/.env.example)

```dotenv
NODE_ENV=production
PORT=4173
API_PROXY_TARGET=https://api.aiqaver.com
SEARCH_ENGINE_INDEXING_ENABLED=false
```

`search.aiqaver.com`과 `lawcheckfo-production.up.railway.app`은 기본 허용 호스트입니다. 다른 커스텀 도메인을 추가로 사용하면 다음 값도 설정합니다. 개발 환경의 커스텀 도메인이 있다면 해당 호스트명으로 바꿉니다.

```dotenv
PREVIEW_ALLOWED_HOSTS=aiqaver.com,www.aiqaver.com
```

`Blocked request. This host (...) is not allowed.`가 표시되면 FO 서비스의 `PREVIEW_ALLOWED_HOSTS`에 오류에 나온 호스트명을 추가하고 재배포합니다. 예: `PREVIEW_ALLOWED_HOSTS=search.aiqaver.com`. 기존 목록이 있으면 쉼표로 추가합니다. 시작 명령은 `npm run preview -w @lawcheck/fo`이어야 `vite.preview.config.ts`의 설정을 읽습니다.

## 공통 규칙과 적용 순서

- FO·BO·Admin은 `SEARCH_ENGINE_INDEXING_ENABLED=false`가 기본값입니다. 미설정·빈 값·오타도 검색 색인을 차단합니다. 허용할 서비스만 `true`로 바꾸고 같은 값으로 **빌드·실행하도록 재배포**합니다. 실행 환경변수만 바꾸면 빌드된 HTML의 차단 태그는 남으므로 반드시 재빌드합니다. [검색엔진 노출 설정](search-indexing.md)을 참고하세요.
- Admin·BO·FO의 `API_PROXY_TARGET`은 같은 환경의 공통 API를 가리킵니다. DB 연결과 AI 키, `ADMIN_EMAIL`은 API에만 설정합니다.
- Railway 공개 도메인은 Networking에서 생성합니다. `RAILWAY_PUBLIC_DOMAIN`은 Railway가 제공하므로 직접 추가할 필요가 없습니다. 이 도메인은 세 화면의 preview 설정에서 자동 허용합니다.
- `PREVIEW_ALLOWED_HOSTS`는 추가 커스텀 호스트명을 쉼표로 구분합니다. `https://`, 경로, 포트는 넣지 않습니다.
- API와 DB를 준비하고 migration을 적용한 뒤 BO 가입 → API `ADMIN_EMAIL` 설정 → Admin 로그인을 진행합니다.
- 루트 `.env.example`은 로컬 Docker·개발용입니다. 통째로 Railway에 복사하지 않습니다. `POSTGRES_*`는 로컬 DB용이고 `OPENAI_CLASSIFIER_MODEL`은 현재 앱 코드에서 사용하지 않습니다. 이메일 발송 변수는 아래 설정을 따릅니다.
- `.env.example`은 참고 파일입니다. 이 파일 수정만으로 배포 환경변수가 적용되지는 않습니다.

Railway에서는 다른 서비스 값을 `${{서비스명.변수명}}`으로 참조할 수 있습니다. 예를 들어 API 서비스 이름이 `API`이면 `API_PROXY_TARGET=https://${{API.RAILWAY_PUBLIC_DOMAIN}}`을 사용할 수 있습니다. 공개 도메인을 먼저 생성하고 실제 서비스 이름으로 바꿉니다. [Railway 변수 참조 문서](https://docs.railway.com/variables/reference)

Variables의 Raw Editor에 값을 입력한 뒤 변경 사항을 Deploy해야 적용됩니다. [Railway 환경변수 문서](https://docs.railway.com/variables)

## 전문가 답변 이메일과 발송 이력

H-ERP의 SMTP/Resend 전송 방식과 DB 대기열·시도 이력·재시도 정책을 적용합니다. BO 전문가가 검증 답변을 완료하면 검증 요청 당시 등록한 질문자 이메일로 질문 원문, 답변 전문과 답변 열람 링크를 발송합니다. 여러 전문가가 답변하면 각 답변마다 한 번씩 등록됩니다. 답변 완료와 발송 대기열 저장은 같은 트랜잭션으로 처리합니다. 기존 완료 답변은 소급 발송하지 않습니다.

API 서비스에 다음 변수를 설정하고 재배포합니다. 발송 작업은 API 프로세스에서 5초 간격으로 실행되므로 별도 Worker 서비스는 필요하지 않습니다.

```dotenv
FO_PUBLIC_URL=https://search.aiqaver.com
EMAIL_TRANSPORT=smtp
EMAIL_FROM=발신자 이메일
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=Gmail 이메일
SMTP_PASSWORD=Gmail 앱 비밀번호
```

Resend를 사용하는 경우 `EMAIL_TRANSPORT=resend`, `EMAIL_FROM`에 인증된 발신 주소, `RESEND_API_KEY`에 API 키를 설정합니다. 비밀값은 API 환경변수에만 저장합니다. H-ERP와 같이 `SMTP_PASSWORD` 이름을 사용합니다. 기존 미사용 예제 변수 `SMTP_PASS`/`SMTP_FROM`은 각각 `SMTP_PASSWORD`/`EMAIL_FROM`으로 교체합니다. `EMAIL_TRANSPORT=disabled` 또는 SMTP 사용자만 있고 비밀번호가 없는 경우 대기열을 그대로 보존합니다. SMTP 설정 오류는 시작 시 감지합니다.

migration `202610040001_answer_email`을 먼저 적용하고 API와 FO·Admin을 함께 배포합니다. Admin의 **이메일 발송이력**(`#emails`)에서 수신자/제목, 상태, 한국 날짜 기준 기간으로 조회하고 상세 본문과 시도별 오류를 확인합니다. 실패 건은 버전 확인 후 재발송할 수 있습니다. 최초 전송 포함 5회, 30/60/120/240초 간격으로 재시도하고 수동 재발송은 총 이력을 유지하면서 5회 한도를 다시 시작합니다. 다중 API 인스턴스는 행 잠금과 5분 lease로 작업을 나눕니다. 메일 서비스 접수와 DB 성공 기록 사이의 장애에서는 중복 메일 가능성이 있습니다. SENT는 서비스 접수 성공이며 수신함 도착/반송/열람은 추적하지 않습니다.

전용 링크는 256비트 난수로 만들어 URL fragment에 담으며 30일간 원래 질문 대화를 현재 브라우저에 복원할 수 있습니다. 다른 기기에서도 이전 질문·AI 답변·전문가 답변을 확인하고 이어서 질문하거나 답변을 선택할 수 있습니다. 기존 브라우저와 현재 브라우저의 다른 대화는 유지하며 링크에 연결된 대화만 추가합니다. 링크를 공유하면 받은 사람이 해당 대화를 사용할 수 있습니다. 기존 이메일의 링크도 같은 복원 기능을 사용합니다. migration `202610040002_email_conversation_restore`로 대화당 여러 브라우저 연결을 허용합니다. 발송 시 이미 만료된 링크는 새 토큰과 30일 유효기간으로 갱신합니다. 이메일 본문은 관리자 상세에서 확인할 수 있으며 공급자 오류 응답 원문과 인증 비밀값은 저장하지 않습니다.
