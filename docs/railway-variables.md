# Railway 서비스별 환경변수

Railway에서 대상 환경(개발 또는 운영)을 선택하고 각 서비스의 Variables에 입력합니다. 개발 환경에서도 배포한 앱은 `NODE_ENV=production`을 사용합니다. 개발·운영은 연결할 DB와 서비스 주소로 구분합니다.

아래 예시의 `your-...example.com`은 같은 환경에 배포한 실제 서비스 도메인으로 바꿉니다. `PORT`는 각 서비스의 Networking → Domain Target port와 맞춥니다. 기존 FO가 5173을 사용한다면 4173으로 바꾸지 않고 `PORT=5173`을 유지해도 됩니다.

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
```

- `DATABASE_URL`: 현재 API의 DB 기능에 필수입니다. `Postgres`는 실제 Railway DB 서비스 이름으로 바꿉니다.
- `OPENAI_API_KEY`: AI 답변 생성에 필요합니다. API에만 등록합니다.
- `OPENAI_ANSWER_MODEL`: 현재 코드 기본값은 `gpt-4.1-mini`이며, 사용하는 모델 ID로 지정합니다.
- `LAW_OFFICE_CODE`, `LAW_OFFICE_NAME`: 사무소 식별 코드와 표시명입니다. 코드 기본값은 각각 `LAW001`, `법률사무소 IBS`입니다.
- `QUESTION_LIMIT_ENABLED`: `true`이면 대화당 질문 3회 제한, `false`이면 제한 해제입니다.

최초에는 `ADMIN_EMAIL`을 비워 두고 배포합니다. 이 환경의 BO에서 회원가입한 뒤 API에 아래 값을 추가하고 재배포합니다. 이미 가입한 활성 회원이라면 바로 설정할 수 있습니다.

```dotenv
ADMIN_EMAIL=kim7546@gmail.com
```

API는 기존 BO 회원에 플랫폼 관리자 권한을 연결합니다. 미가입·중지된 회원이나 회수된 관리자 권한을 지정하면 API 시작이 실패합니다. 기존 BO 비밀번호를 사용하며, 한번 부여한 권한은 DB에 유지됩니다.

`BOOTSTRAP_ADMIN_EMAIL`과 `BOOTSTRAP_ADMIN_PASSWORD`는 별도 `staff_accounts` 사무소 직원 생성용입니다. 플랫폼 Admin에는 필요하지 않습니다. 사용하지 않으면 둘 다 생략합니다. 사무소 직원을 초기 생성할 때만 둘 다 지정하며 비밀번호는 12자 이상이어야 합니다.

API의 Railway Config File은 [apps/api/railway.database.json](../apps/api/railway.database.json)을 사용합니다. 배포 전에 `npm run db:deploy`로 migration과 seed를 적용합니다. Root Directory는 저장소 루트(`/`)입니다. 관리자 migration `202609260001_platform_admin`이 포함되어야 합니다.

## Admin

참고 파일: [apps/admin/.env.example](../apps/admin/.env.example)

```dotenv
NODE_ENV=production
PORT=4175
API_PROXY_TARGET=https://your-api-service.example.com
VITE_FO_URL=https://your-fo-service.example.com
```

`API_PROXY_TARGET`은 API의 origin이며 `/api`나 `/api/v1`을 붙이지 않습니다. `VITE_FO_URL`은 화면의 FO 이동 링크입니다. 운영에서 `https://aiqaver.com`을 쓸 수 있으며, 개발 환경에는 개발 FO 주소를 지정합니다.

Config File은 [apps/admin/railway.json](../apps/admin/railway.json), Root Directory는 저장소 루트(`/`)입니다. `admin.aiqaver.com`과 `lawcheckadmin-production.up.railway.app`은 기본 허용 호스트입니다. 다른 도메인을 쓰면 `PREVIEW_ALLOWED_HOSTS=추가도메인`을 설정합니다.

`Blocked request. This host (...) is not allowed.`가 표시되면 Admin 서비스에 `PREVIEW_ALLOWED_HOSTS=lawcheckadmin-production.up.railway.app`처럼 오류에 나온 호스트명을 추가하고 재배포합니다. 기존 목록이 있으면 쉼표로 추가합니다. 시작 명령은 `npm run preview -w @lawcheck/admin`이어야 `vite.preview.config.ts`의 설정을 읽습니다. `RAILWAY_PUBLIC_DOMAIN`이 비어 있거나 접속한 도메인과 다른 경우에도 명시한 호스트는 허용됩니다.

## BO

참고 파일: [apps/bo/.env.example](../apps/bo/.env.example)

```dotenv
NODE_ENV=production
PORT=4174
API_PROXY_TARGET=https://your-api-service.example.com
```

`office.aiqaver.com`은 기본 허용 호스트입니다. 다른 커스텀 도메인을 쓰면 `PREVIEW_ALLOWED_HOSTS=추가도메인`을 설정합니다. BO에는 별도의 관리자 이메일이나 DB 연결값을 넣지 않습니다.

## FO

참고 파일: [apps/fo/.env.example](../apps/fo/.env.example)

```dotenv
NODE_ENV=production
PORT=4173
API_PROXY_TARGET=https://your-api-service.example.com
VITE_ADMIN_URL=https://your-admin-service.example.com
```

`VITE_ADMIN_URL`은 기존 FO `/admin` 접속을 이동시킬 Admin origin이며 `/admin`을 붙이지 않습니다. 개발 환경에서는 개발 Admin 주소를 지정해야 운영 Admin으로 이동하지 않습니다.

운영 커스텀 도메인을 사용하면 다음 값도 추가합니다. 개발 환경의 커스텀 도메인이 있다면 해당 호스트명으로 바꿉니다.

```dotenv
PREVIEW_ALLOWED_HOSTS=aiqaver.com,www.aiqaver.com
```

## 공통 규칙과 적용 순서

- Admin·BO·FO의 `API_PROXY_TARGET`은 같은 환경의 공통 API를 가리킵니다. DB 연결과 AI 키, `ADMIN_EMAIL`은 API에만 설정합니다.
- Railway 공개 도메인은 Networking에서 생성합니다. `RAILWAY_PUBLIC_DOMAIN`은 Railway가 제공하므로 직접 추가할 필요가 없습니다. 이 도메인은 세 화면의 preview 설정에서 자동 허용합니다.
- `PREVIEW_ALLOWED_HOSTS`는 추가 커스텀 호스트명을 쉼표로 구분합니다. `https://`, 경로, 포트는 넣지 않습니다.
- `VITE_FO_URL`, `VITE_ADMIN_URL`은 빌드 시 반영됩니다. 값을 변경한 뒤 해당 프런트엔드를 다시 빌드·배포합니다.
- API와 DB를 준비하고 migration을 적용한 뒤 BO 가입 → API `ADMIN_EMAIL` 설정 → Admin 로그인을 진행합니다.
- 루트 `.env.example`은 로컬 Docker·개발용입니다. 통째로 Railway에 복사하지 않습니다. `POSTGRES_*`는 로컬 DB용이고 `SMTP_*`, `OPENAI_CLASSIFIER_MODEL`은 현재 앱 코드에서 사용하지 않습니다.
- `.env.example`은 참고 파일입니다. 이 파일 수정만으로 배포 환경변수가 적용되지는 않습니다.

Railway에서는 다른 서비스 값을 `${{서비스명.변수명}}`으로 참조할 수 있습니다. 예를 들어 API 서비스 이름이 `API`이면 `API_PROXY_TARGET=https://${{API.RAILWAY_PUBLIC_DOMAIN}}`을 사용할 수 있습니다. 공개 도메인을 먼저 생성하고 실제 서비스 이름으로 바꿉니다. [Railway 변수 참조 문서](https://docs.railway.com/variables/reference)

Variables의 Raw Editor에 값을 입력한 뒤 변경 사항을 Deploy해야 적용됩니다. [Railway 환경변수 문서](https://docs.railway.com/variables)
