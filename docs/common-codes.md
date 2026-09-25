# 공통 코드 관리

`common_code_groups`는 그룹 코드·그룹명·설명·정렬순서·사용 여부·생성/수정 시각을 관리합니다. `common_code_details`는 그룹 코드와 상세 코드의 복합 기본키를 사용하며, 동일한 관리 항목을 갖습니다. 서로 다른 그룹에는 같은 상세 코드 값을 사용할 수 있습니다.

초기 그룹은 `EXPERT_GROUP`(전문가 그룹)과 `PLAN`(요금제)입니다. 전문가 코드는 LAWYER, LABOR_ATTORNEY, PATENT_ATTORNEY, TAX_ACCOUNTANT이며 처음에는 LAWYER만 사용합니다. 요금제는 FREE, PRO, BUSINESS입니다. 업무 상태 전이 및 약관 종류 Enum은 그대로 유지합니다.

## 데이터 보존과 서비스 연결

- Migration `202609250003_common_codes`가 테이블과 초기 데이터를 한 번 생성합니다. 반복 배포·seed가 수정한 코드명이나 사용 여부를 덮어쓰지 않습니다.
- 회원의 전문가 그룹과 요금제는 기존 값을 보존하면서 Enum에서 코드 상세 외래키로 변경합니다. 기존 회원의 NULL 전문가 그룹도 유지합니다.
- 회원의 코드 그룹은 DB CHECK 제약으로 EXPERT_GROUP/PLAN에 고정됩니다. 등록되지 않은 값, 다른 그룹의 코드, 참조 중인 코드 삭제는 DB가 거부합니다.
- 회원가입 그룹명·정렬순서는 DB에서 조회합니다. 그룹과 상세가 모두 사용 상태이고 현재 Office 코드인 LAWYER인 경우에만 가입할 수 있습니다. 다른 전문가 상세를 활성화해도 현재 변호사 Office에 가입할 수는 없습니다.
- PLAN 또는 FREE를 미사용으로 바꾸면 신규 가입이 중단됩니다. 기존 회원 로그인과 요금제 값은 유지됩니다. 가입자는 임의로 요금제를 지정할 수 없습니다.
- 로그인 및 `/bo/me`의 `planCode.name`을 요금제 표시명으로 사용합니다. 변경은 다음 로그인/페이지 새로고침에서 반영됩니다.

## 관리 화면과 권한

BO 공통 코드 관리 메뉴에서 그룹·상세 추가, 이름·설명·정렬·사용 여부 수정이 가능합니다. 기존 식별 코드 값 변경 및 삭제 API는 제공하지 않습니다. 미사용 처리로 이력과 참조를 유지합니다. 수정 시 `updatedAt` 버전을 검사하여 다른 관리자의 변경을 덮어쓰지 않도록 합니다.

`expert_accounts.can_manage_codes`가 true인 계정만 관리 API에 접근할 수 있습니다. 기본값은 false이며 가입 요청으로 권한을 얻을 수 없습니다. 관리 계정은 자동 지정하지 않습니다. DB 운영 권한이 있는 환경에서 기존 BO 계정에 다음 명령으로 지정합니다.

```powershell
npm run codes:admin -- grant admin@example.com
npm run codes:admin -- revoke admin@example.com
```

실제 기존 계정 이메일을 사용합니다. 계정이 없으면 생성하지 않고 실패합니다. 권한을 부여한 뒤 BO를 새로고침하면 메뉴가 나타납니다. 권한 회수는 기존 로그인 세션에도 다음 API 요청부터 적용됩니다. 이 권한은 사무실별 권한이 아닌 시스템 공통 코드 관리 권한입니다.

## API

| 방식 | 경로 (`/api/v1/bo` 기준)              | 기능      |
| ---- | ------------------------------------- | --------- |
| GET  | `/code-groups`                        | 그룹 목록 |
| POST | `/code-groups`                        | 그룹 등록 |
| POST | `/code-groups/:group`                 | 그룹 수정 |
| GET  | `/code-groups/:group/details`         | 상세 목록 |
| POST | `/code-groups/:group/details`         | 상세 등록 |
| POST | `/code-groups/:group/details/:detail` | 상세 수정 |

등록은 `code, name, description, sortOrder, isActive`, 수정은 동일한 값과 조회한 `updatedAt`을 보냅니다. 코드값은 영문 대문자로 시작하는 대문자·숫자·밑줄 1~50자, 이름은 1~100자, 설명은 500자 이하, 순서는 0~99999입니다. 중복과 버전 충돌은 409, 권한 부족은 403입니다.
