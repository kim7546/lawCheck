# 플랫폼 관리자

`apps/admin` 독립 서비스에서 운영 요약, 사용자 관리, 공통코드 관리, BO 메뉴 관리를 제공합니다. 로컬 주소는 `http://127.0.0.1:5175/admin`이며 루트 `/`에서도 같은 관리자 앱이 열립니다. FO·BO와 별도로 실행·빌드·배포하고 공통 Backend API와 DB를 사용합니다.

운영 도메인은 `https://admin.aiqaver.com`이며 `/admin` 경로도 지원합니다. 코드에 도메인 허용 설정을 반영했으며 Railway 서비스 연결과 DNS 등록은 배포 시 적용해야 합니다.

## 독립 실행과 빌드

저장소 루트에서 실행합니다. 관리 API를 사용하려면 `apps/api` 서버도 실행해야 합니다.

```powershell
npm install
npm run dev -w @lawcheck/api
```

다른 터미널에서 Admin을 실행합니다.

```powershell
npm run dev:admin
```

전체 실행은 `npm run dev`입니다. FO 5173, BO 5174, Admin 5175, API 4000을 사용합니다. 관리자 프런트엔드는 FO·BO가 꺼져 있어도 독립적으로 실행됩니다.

```powershell
npm run build -w @lawcheck/admin
npm run preview -w @lawcheck/admin
```

빌드 결과는 `apps/admin/dist`, preview 기본 포트는 4175입니다. preview에서 로그인까지 확인하려면 실행 프로세스에 `API_PROXY_TARGET`을 설정합니다. 로컬 확인 예: `$env:API_PROXY_TARGET='http://127.0.0.1:4000'`. 배포에서는 실제 공통 API 주소를 지정합니다.

## IntelliJ 실행·디버그

공유 npm 실행 설정 `.run/lawCheck Admin.run.xml`을 추가했습니다. 프로젝트를 다시 불러온 뒤 실행 목록에서 `lawCheck Admin`을 선택합니다. 수동으로 만들 경우 다음 값을 사용합니다.

| 항목                    | 값                                      |
| ----------------------- | --------------------------------------- |
| 종류                    | npm                                     |
| Name                    | lawCheck Admin                          |
| package.json            | `$PROJECT_DIR$/apps/admin/package.json` |
| Command / Scripts       | `run` / `dev`                           |
| Browser / Live Edit URL | `http://127.0.0.1:5175/admin`           |

화면 중단점이 필요하면 Browser / Live Edit에서 After launch와 with JavaScript debugger를 선택하고 Chrome을 지정합니다. API는 기존 `lawCheck` Node.js 설정(`apps/api/src/server.ts`, `--import tsx`)으로 Debug 실행합니다. 화면 중단점은 `apps/admin/src/AdminApp.tsx`, API 중단점은 `apps/api/src/admin.ts`에 둡니다. 이전에 FO를 복제해 만든 로컬 Admin 설정이 있다면 package.json과 URL을 위 값으로 변경합니다.

## 도메인과 서비스 간 이동

- Admin 배포 설정: `/apps/admin/railway.json`, 저장소 루트에서 빌드·실행합니다. `admin.aiqaver.com`은 기본 허용 호스트입니다. 추가 도메인은 `PREVIEW_ALLOWED_HOSTS`에 지정합니다. 상세 설정과 DNS 연결은 [Railway 안내](railway-deployment.md)를 참조합니다.
- Admin의 `VITE_FO_URL`은 FO로 돌아가는 링크입니다. 빌드 시 설정하며 기본값은 개발에서 `http://127.0.0.1:5173`, 배포에서 `https://aiqaver.com`입니다.
- 이전 FO `/admin` 주소는 독립 Admin 서비스로 이동합니다. 개발에서는 `http://127.0.0.1:5175/admin`, 배포에서는 `https://admin.aiqaver.com/admin`으로 이동합니다. 다른 배포 환경에서만 **FO 빌드 환경변수 `VITE_ADMIN_URL`**로 Admin origin을 덮어씁니다(`/admin` 경로 제외). 검색 문자열과 선택한 메뉴 해시는 유지됩니다.
- 관리자 API 요청은 Admin 호스트의 `/api/v1/admin`에서 공통 API로 프록시합니다. 브라우저가 다른 도메인의 API를 직접 호출하지 않으므로 기존 HttpOnly·SameSite 쿠키 인증을 그대로 사용합니다.
- 앱 분리에는 추가 DB migration이 필요하지 않습니다. 기존 관리자 테이블과 회원·권한을 그대로 사용합니다.

## 독립 서비스 점검

독립 배포 점검은 `npm run test:admin-service`로 실행합니다. Admin만 빌드한 후 격리된 preview와 임시 API 서버로 `/`, `/admin`, 정적 파일, 허용 도메인, API 프록시 및 쿠키 전달을 검사합니다. 실제 회원·DB는 사용하지 않습니다.

## 계정과 최초 관리자

공통 BO 회원 `expert_accounts`에 전문가 상세 `expert_lawyer_profiles`와 관리자 상세 `expert_admin_profiles`를 각각 1:1로 연결합니다. 전문그룹을 변경하지 않고 한 회원이 두 역할을 겸임할 수 있습니다. 관리자로 지정할 사용자는 먼저 BO에 가입해야 합니다. 관리자 설정으로 신규 회원을 생성하지 않습니다.

DB 준비 후 기존 BO 회원에게 최초 관리자 권한을 부여합니다.

```powershell
npm run db:migrate
npm run db:generate
npm run admin:account -- grant existing-member@example.com
```

배포 시에는 **API 서비스**의 환경변수 `ADMIN_EMAIL`에 기존 BO 회원 이메일을 지정합니다. 로컬에서는 루트 `.env`에 지정합니다. Admin 프런트엔드 서비스에만 설정하면 적용되지 않습니다.

```dotenv
ADMIN_EMAIL=existing-member@example.com
```

API는 시작할 때 해당 회원을 확인하고 관리자 권한을 연결합니다. 미가입 이메일, 잘못된 이메일, 중지된 회원이면 오류를 출력하고 종료 코드 1로 시작을 중단합니다. 정상 등록된 관리자는 재시작해도 중복 생성되지 않습니다. `ADMIN_EMAIL`이 비어 있으면 환경변수에 의한 관리자 설정을 건너뛰므로, 최초 배포에서는 비워 두고 BO 가입 후 설정할 수 있습니다.

기존 BO 아이디·이메일과 비밀번호로 Admin에 로그인합니다. `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_NAME`은 사용하지 않으며 회원 정보를 덮어쓰지 않습니다. 이전 `create` 명령은 제거되어 오류로 종료합니다.

서버를 재시작하지 않고 환경변수의 회원에게 권한을 부여하려면 다음 명령을 실행합니다. 이메일을 생략한 `grant`는 `ADMIN_EMAIL`을 사용하며, 해당 회원이 없으면 실패합니다.

```powershell
npm run admin:account -- grant
```

추가 관리자는 Admin 서비스의 `/admin#users` 회원 수정에서 권한을 부여하거나 회수합니다. 자신의 계정·관리자 권한 중지는 차단합니다. 서버 명령으로 회수할 때도 마지막 활성 관리자는 보호합니다.

환경변수로 지정했던 관리자의 권한을 회수했다면 `ADMIN_EMAIL`도 제거하거나 다른 활성 관리자로 바꿉니다. 재시작으로 회수된 권한을 자동 복구하지 않으며, 해당 이메일이 남아 있으면 오류로 시작을 중단합니다. 의도적으로 복구할 때만 `grant`를 실행합니다. 이메일 변경·삭제는 기존 관리자 권한을 자동 회수하지 않습니다.

```powershell
npm run admin:account -- revoke existing-member@example.com
```

BO 로그인과 관리자 로그인은 별개입니다. `admin_login_sessions`와 전용 HttpOnly·SameSite=Strict 쿠키를 사용하며 관리자 세션은 8시간 유효합니다. 모든 관리자 API는 활성 관리자 자격과 계정 상태를 조회합니다. 권한 회수 시 관리자 세션을 삭제하고 계정 중지 시 BO 세션도 삭제합니다. 일반 회원가입 입력으로 관리자 자격을 만들 수 없습니다.

## 운영 요약의 집계 기준

- 최근 7·30·90일, 오늘을 포함한 한국 시간의 날짜를 기준으로 집계합니다.
- 접수 질문: 해당 기간의 사용자 질문 메시지 수입니다. 답변 생성 실패 질문도 접수 건수에 포함됩니다.
- 검증 요청: 해당 기간에 생성된 `review_board_posts`입니다.
- 검증 완료: 전문가 완료 답변이 하나 이상 있는 요청 수입니다. 여러 전문가가 답변해도 요청은 한 번만 셉니다.
- 검증 대기: 아직 검증에 참여한 전문가가 없는 요청입니다. 검증 중은 참여자가 있지만 완료 답변은 없는 요청입니다.
- 검증 완료율: 완료 요청 / 전체 검증 요청입니다. 48시간 이상 미완료도 선택 기간 내 접수된 요청 기준입니다.
- 평균 첫 답변 시간: 요청 생성부터 가장 빠른 완료 답변까지의 시간입니다. 미완료 요청은 평균에서 제외합니다.
- 답변 선택률: 이용자가 답변을 선택한 요청 / 완료 요청입니다. 정확성 평가 지표가 아닙니다.
- 전문가 실적: 선택 기간 내 접수된 요청에 대한 전문가별 완료·검증 중·선택 답변 수입니다. 답변 완료 시점이 아닌 요청 접수 시점으로 기간을 구분합니다.
- 데이터가 없는 비율·평균은 `—`로 표시하며 실패한 조회를 0건으로 표시하지 않습니다.

## 관리 범위

사용자 관리에서 이름·아이디·이메일 검색, 전문그룹/관리자/중지 계정 필터, 20명 단위 페이지 이동을 제공합니다. 이름·요금제·계정 상태·관리자 자격을 수정할 수 있습니다. 비밀번호 해시와 가입코드는 관리자 조회 응답에도 포함하지 않습니다. FO는 익명 브라우저 기반이므로 별도의 FO 회원 목록은 제공하지 않습니다.

공통코드는 기존 관리 기능과 같은 그룹/상세 데이터 및 동시 수정 충돌 검사를 사용합니다. 기존 BO의 `can_manage_codes` 권한은 유지되며 플랫폼 관리자 자격과는 독립적입니다.

BO 메뉴는 실제 구현된 `dashboard`, `reviews`, `community`, `codes`의 표시명·정렬순서·표시 여부를 관리합니다. 대시보드는 필수 메뉴입니다. BO가 `/api/v1/bo/menus`를 조회해 표시하며 변경 후 BO 새로고침으로 반영됩니다. 공통코드 메뉴는 기존 관리 권한 보유자에게만 표시됩니다. 메뉴 숨김은 노출 설정이며 API 권한 변경은 아닙니다.

Migration: `202609260001_platform_admin`. 새 테이블 3개와 회원의 사용 여부·수정 시각을 추가하며 기존 데이터를 삭제하지 않습니다.
