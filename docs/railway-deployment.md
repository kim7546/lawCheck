# Railway FO·BO·Admin·API 배포

서비스별 Variables 입력값과 복사 예시는 [Railway 환경변수 안내](railway-variables.md)를 참조하세요. 개발 환경과 운영 환경의 DB·API·화면 주소를 각각 연결합니다.

FO·BO·Admin은 각각 개발용 `vite.config.ts`와 배포 확인용 `vite.preview.config.ts`를 분리합니다.

| 항목        | 로컬 개발 (`npm run dev`)      | 배포 확인 (`npm run preview`)                     |
| ----------- | ------------------------------ | ------------------------------------------------- |
| 설정 파일   | `vite.config.ts`               | `vite.preview.config.ts`                          |
| 바인딩      | `127.0.0.1`                    | `0.0.0.0`                                         |
| 포트        | FO 5173 / BO 5174 / Admin 5175 | `PORT` (미설정 시 FO 4173 / BO 4174 / Admin 4175) |
| API 프록시  | `http://127.0.0.1:4000`        | `API_PROXY_TARGET` 지정 시에만 활성화             |
| 허용 도메인 | 로컬 호스트                    | `RAILWAY_PUBLIC_DOMAIN`, `PREVIEW_ALLOWED_HOSTS`  |

배포 설정은 실행 프로세스의 환경변수를 읽습니다. 루트의 개발용 `.env`는 읽지 않습니다.
기존 FO 도메인 `lawcheckfo-production.up.railway.app`도 명시적으로 허용합니다.
BO는 `office.aiqaver.com`과 `lawcheckbo-production.up.railway.app`을 기본으로 허용합니다.

## FO 서비스

| Railway 설정       | 값                                |
| ------------------ | --------------------------------- |
| Root Directory     | 비워두기 (저장소 루트)            |
| Build Command      | `npm run build -w @lawcheck/fo`   |
| Pre-deploy Command | 비워두기                          |
| Start Command      | `npm run preview -w @lawcheck/fo` |
| Healthcheck Path   | `/`                               |
| Domain Target port | `PORT`와 동일한 값                |

현재 FO 도메인의 Target port가 5173이므로 Variables에 `PORT=5173`을 설정합니다.
기존 시작 명령의 `-- --host 0.0.0.0 --port $PORT`를 유지해도 동작합니다.

BO는 명령의 workspace를 `@lawcheck/bo`로 바꾸고 해당 서비스의 도메인과 포트를 사용합니다.

## Admin 서비스

동일한 저장소에서 **별도 Railway 서비스**를 만들고 `admin.aiqaver.com`을 연결합니다. 아래는 구성 파일과 설정값이며 실제 서비스 생성·배포·DNS 변경은 별도로 수행합니다.

| Railway 설정       | 값                                   |
| ------------------ | ------------------------------------ |
| Config File        | `/apps/admin/railway.json`           |
| Root Directory     | 저장소 루트 (`/`)                    |
| Build Command      | `npm run build -w @lawcheck/admin`   |
| Start Command      | `npm run preview -w @lawcheck/admin` |
| Healthcheck Path   | `/admin`                             |
| Domain Target port | 해당 서비스의 `PORT`와 동일          |

`https://admin.aiqaver.com` 또는 `https://admin.aiqaver.com/admin`으로 접속합니다. 다음 변수는 **Admin 서비스**에 설정합니다.

| 변수                    | 값                                                                            |
| ----------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`              | `production`                                                                  |
| `PORT`                  | 서비스 Target port에 맞게 설정, 기본값 `4175`                                 |
| `API_PROXY_TARGET`      | `https://api.aiqaver.com`. 별도 개발 환경은 해당 API origin. `/api` 경로 제외 |
| `RAILWAY_PUBLIC_DOMAIN` | Railway 자동 제공 도메인                                                      |
| `PREVIEW_ALLOWED_HOSTS` | 추가 도메인만 지정. `admin.aiqaver.com`은 코드에서 기본 허용                  |
| `VITE_FO_URL`           | 돌아가기 링크용 FO origin, 빌드 시 적용                                       |

API 프록시는 Admin 호스트에서 동작하며 관리자 쿠키에 Domain을 추가하지 않습니다. `/admin` healthcheck는 정적 화면 제공 여부만 확인하며 DB·관리자 로그인 성공을 보장하지 않습니다.

이전 FO `/admin` 주소는 FO 재빌드 후 기본적으로 `https://admin.aiqaver.com/admin`으로 이동합니다. 기존 **FO 서비스**에 `VITE_ADMIN_URL`이 설정되어 있다면 `https://admin.aiqaver.com`으로 변경하거나 삭제한 후 재빌드합니다. 다른 환경에서만 이 변수로 이동할 origin을 덮어씁니다.

Railway의 Admin 서비스 **Settings → Networking → Public Networking → Custom Domain**에 `admin.aiqaver.com`을 등록합니다. `PORT=4175`를 사용하면 도메인의 Target port도 `4175`로 설정합니다. DNS에는 Railway 화면에 표시되는 CNAME과 소유권 확인 TXT 레코드를 그대로 등록합니다. CNAME 이름은 `admin`이며, 대상과 TXT 값은 Railway가 해당 서비스에 발급한 값을 사용합니다. 도메인 확인이 완료되면 Railway가 HTTPS 인증서를 발급합니다. [Railway 도메인 설정 문서](https://docs.railway.com/networking/domains/working-with-domains)

`ADMIN_EMAIL`과 `DATABASE_URL`은 **공통 API 서비스**에 설정합니다. Admin 서비스에는 API 연결용 `API_PROXY_TARGET`을 설정하며, 브라우저에서 API 공개 주소로 직접 호출하지 않습니다.

Admin은 FO·BO 소스를 참조하지 않습니다. 공통코드 편집 UI는 `packages/ui`, 공통 타입은 `packages/contracts`, 브랜드 토큰은 `packages/brand`를 사용합니다. BO의 Watch Paths에도 `/packages/ui/**` 변경을 포함해야 합니다.

## 환경변수

| 변수                    | 설정 방법                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`              | `production`                                                                  |
| `PORT`                  | 공개 도메인의 Target port와 일치 (현재 FO: `5173`)                            |
| `RAILWAY_PUBLIC_DOMAIN` | Railway가 제공하는 서비스 도메인                                              |
| `PREVIEW_ALLOWED_HOSTS` | 추가 도메인이 있으면 호스트명만 쉼표로 구분. `https://`와 경로는 제외         |
| `API_PROXY_TARGET`      | 선택. 실제 배포된 API의 origin, 예: `https://<API 도메인>` (`/api` 경로 제외) |

API를 연결하지 않아도 체험 화면은 기본 사무소명으로 열립니다.
`API_PROXY_TARGET` 미설정 시 개발용 API로 요청을 전달하지 않습니다.
이 변수는 서버 측 프록시 설정이며 브라우저에 주입하지 않습니다.

## API 서비스

공통 API 공개 주소는 `https://api.aiqaver.com`을 사용합니다. API 서비스의 **Settings → Networking → Public Networking → Custom Domain**에 `api.aiqaver.com`을 추가합니다. `PORT=4000`을 사용하면 도메인의 Target port도 `4000`으로 지정합니다.

DNS에 CNAME 이름 `api`와 Railway가 발급한 대상 호스트를 등록하고, 소유권 확인 TXT도 Railway에 표시된 이름·값 그대로 등록합니다. DNS 검증과 HTTPS 인증서 발급 후 `https://api.aiqaver.com/api/v1/health`에서 HTTP 200 및 `success: true`를 확인합니다. [Railway 도메인 설정 문서](https://docs.railway.com/networking/domains/working-with-domains)

이후 Admin·BO·FO 서비스의 `API_PROXY_TARGET=https://api.aiqaver.com`을 설정하고 재배포합니다. URL에 `:4000`, `/api`, `/api/v1`은 붙이지 않습니다. 별도 개발 환경에서는 해당 환경의 API origin을 사용합니다. API 자체는 Express로 실행하며 `preview.allowedHosts` 설정을 사용하지 않습니다. 브라우저는 계속 각 화면 서비스의 `/api`로 요청하고 화면 서버가 API 도메인으로 전달합니다.

API도 로컬 개발과 Railway 배포 설정을 분리합니다.

| 항목      | 로컬 개발·IntelliJ 디버그       | Railway 배포                            |
| --------- | ------------------------------- | --------------------------------------- |
| 설정 파일 | `apps/api/src/server.config.ts` | `apps/api/src/server.deploy.config.ts`  |
| 진입 파일 | `apps/api/src/server.ts`        | 빌드된 `apps/api/dist/server.deploy.js` |
| 바인딩    | `127.0.0.1`                     | `0.0.0.0`                               |
| 포트      | 루트 `.env`의 `PORT`, 기본 4000 | Railway `PORT`, 미설정 시 4000          |
| 환경변수  | 루트 `.env` 로드                | 실행 환경변수만 사용                    |
| 시작 명령 | `npm run dev -w @lawcheck/api`  | `npm run start -w @lawcheck/api`        |

API 서비스의 **Settings → Config as Code → Railway Config File**을 `/apps/api/railway.json`으로 지정합니다.
Root Directory는 비워두거나 `/`로 설정하여 저장소 루트에서 npm workspace를 사용합니다.
`apps/api`를 Root Directory로 지정하면 공통 패키지와 루트 잠금 파일을 사용할 수 없습니다.
이 설정 파일은 API 서비스에만 지정합니다. FO·BO에는 기존 설정을 사용합니다.

| Railway 설정        | 값                               |
| ------------------- | -------------------------------- |
| Config File         | `/apps/api/railway.json`         |
| Root Directory      | 저장소 루트 (`/`)                |
| Build Command       | `npm run build -w @lawcheck/api` |
| Start Command       | `npm run start -w @lawcheck/api` |
| Pre-deploy Command  | 비워두기                         |
| Healthcheck Path    | `/api/v1/health`                 |
| Healthcheck Timeout | 60초                             |

빌드·시작 명령과 healthcheck는 `railway.json`에 포함되어 있습니다.
Railway Variables에는 아래 값을 설정합니다. 예시는 `apps/api/.env.example`에도 있습니다.

```dotenv
NODE_ENV=production
PORT=4000
LAW_OFFICE_NAME=법률사무소 IBS
OPENAI_API_KEY=발급받은_API_키
OPENAI_ANSWER_MODEL=gpt-4.1-mini
QUESTION_LIMIT_ENABLED=false
```

플랫폼 관리자는 먼저 BO에 가입한 다음 **API 서비스** Variables에 `ADMIN_EMAIL=가입한회원이메일`을 설정합니다. API 시작 시 기존 회원에 관리자 권한을 연결하며, 미가입 이메일·중지된 회원·회수된 관리자 권한이면 오류와 종료 코드 1로 시작을 중단합니다. 기존 BO 비밀번호를 사용하므로 `ADMIN_PASSWORD`는 설정하지 않습니다. 최초 BO 가입 전에는 `ADMIN_EMAIL`을 비워 두고 배포합니다. 관리자 연결 후 이 변수를 제거해도 부여한 권한은 유지됩니다. 상세 명령과 권한 회수 방법은 [관리자 설정 안내](admin.md)를 참조하세요.

`PORT=4000`을 직접 지정한다면 API 공개 도메인의 Target port도 `4000`으로 맞춥니다.
Railway 자동 할당 `PORT`를 사용해도 되지만 Target port와 실제 리스닝 포트가 일치해야 합니다.
FO의 포트와 API 포트는 서로 달라도 됩니다. 모델은 사용하려는 모델 ID로 지정합니다.
`.env.example`은 참고용이며 배포 서버가 자동으로 읽지 않습니다. 비밀 키는 Railway Variables에 입력합니다.
위 `/apps/api/railway.json`은 DB 없이 시작하는 기존 설정입니다. PostgreSQL을 함께 준비하려면 [DB 설치·Railway 연결 안내](database-setup.md)에 따라 DB 서비스를 생성하고 API Config File을 `/apps/api/railway.database.json`으로 변경하세요. 이 설정은 Docker 빌드와 `npm run db:deploy` pre-deploy migration을 포함합니다.

Admin·FO·BO Variables의 `API_PROXY_TARGET`은 `https://api.aiqaver.com`으로 지정하고 재배포합니다. 별도 개발 환경은 해당 API origin으로 바꿉니다.
API 경로 `/api/v1`은 붙이지 않습니다. 브라우저 요청은 FO·BO의 `/api` 프록시를 통해 전달됩니다.

배포 로그에 아래처럼 `0.0.0.0`과 지정 포트가 나와야 합니다.

```text
LawCheck API: http://0.0.0.0:4000/api/v1/health (prototype)
```

`https://api.aiqaver.com/api/v1/health`가 200이면 API 연결이 정상입니다. 이 healthcheck는 DB·로그인·AI 답변 성공까지 검증하지는 않습니다.
루트 `/`는 제공하지 않으므로 404가 정상입니다. health는 DB·OpenAI 연결까지 확인하지 않습니다.
502가 계속되면 Deployment의 설정 출처에서 새 `railway.json` 적용 여부, 위 시작 로그,
도메인의 Target port를 확인합니다. `127.0.0.1` 로그가 나오면 여전히 로컬 진입 파일로 실행 중입니다.

현재 실제 서버의 채팅은 PostgreSQL 세션·메시지를 사용합니다. DB 포함 배포 설정과 migration을 적용해야 하며, DB에 저장된 세션 횟수와 대화는 API 재배포 후에도 유지됩니다.
개발용 3회 제한 해제는 그대로 유지하며, 오픈 시 `QUESTION_LIMIT_ENABLED=true`로 바꿀 수 있습니다.

공식 참고: [Railway 502 해결](https://docs.railway.com/networking/troubleshooting/application-failed-to-respond),
[서비스별 설정 파일 지정](https://docs.railway.com/config-as-code).

Watch Paths는 앱 외에도 `/packages/contracts/**`, `/package.json`, `/package-lock.json`,
`/tsconfig.base.json` 변경을 포함하면 공통 의존성 변경 시에도 재배포할 수 있습니다.

설정 변경 후 GitHub의 연결된 `master` 브랜치로 푸시하여 재배포합니다.

## 운영 서버 전환

이 문서는 현재 체험 배포에 사용하는 Vite preview의 설정을 분리한 것입니다.
Vite preview는 정식 운영 서버가 아니므로 실제 운영 전에는 정적 파일 서버와 API 프록시로 전환해야 합니다.
참고: https://vite.dev/guide/static-deploy
