# Railway 체험 화면 배포

FO와 BO는 개발용 `vite.config.ts`와 배포 확인용 `vite.preview.config.ts`를 분리합니다.

| 항목        | 로컬 개발 (`npm run dev`) | 배포 확인 (`npm run preview`)                    |
| ----------- | ------------------------- | ------------------------------------------------ |
| 설정 파일   | `vite.config.ts`          | `vite.preview.config.ts`                         |
| 바인딩      | `127.0.0.1`               | `0.0.0.0`                                        |
| 포트        | FO 5173 / BO 5174         | `PORT` (미설정 시 FO 4173 / BO 4174)             |
| API 프록시  | `http://127.0.0.1:4000`   | `API_PROXY_TARGET` 지정 시에만 활성화            |
| 허용 도메인 | 로컬 호스트               | `RAILWAY_PUBLIC_DOMAIN`, `PREVIEW_ALLOWED_HOSTS` |

배포 설정은 실행 프로세스의 환경변수를 읽습니다. 루트의 개발용 `.env`는 읽지 않습니다.
기존 FO 도메인 `lawcheckfo-production.up.railway.app`도 명시적으로 허용합니다.

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

API를 별도 Railway 서비스로 연결하려면 API 서버도 `0.0.0.0` 및 해당 서비스의 `PORT`로
실행되어야 합니다. 현재 API의 로컬 전용 바인딩은 별도 변경이 필요합니다.
FO의 `PORT`를 API 서비스에 그대로 복사할 필요는 없습니다.

Watch Paths는 앱 외에도 `/packages/contracts/**`, `/package.json`, `/package-lock.json`,
`/tsconfig.base.json` 변경을 포함하면 공통 의존성 변경 시에도 재배포할 수 있습니다.

설정 변경 후 GitHub의 연결된 `master` 브랜치로 푸시하여 재배포합니다.

## 운영 서버 전환

이 문서는 현재 체험 배포에 사용하는 Vite preview의 설정을 분리한 것입니다.
Vite preview는 정식 운영 서버가 아니므로 실제 운영 전에는 정적 파일 서버와 API 프록시로 전환해야 합니다.
참고: https://vite.dev/guide/static-deploy
