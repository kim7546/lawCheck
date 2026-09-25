BEGIN;

-- 기본 계정 정보만으로 가입할 수 있도록 기존 상세 값은 보존하고 선택 입력을 허용한다.
ALTER TABLE expert_lawyer_profiles
  ALTER COLUMN mobile_phone DROP NOT NULL,
  ALTER COLUMN registration_number DROP NOT NULL,
  ALTER COLUMN issue_number DROP NOT NULL,
  ALTER COLUMN office_name DROP NOT NULL,
  ALTER COLUMN address DROP NOT NULL,
  ALTER COLUMN office_phone DROP NOT NULL;

ALTER TABLE expert_accounts ADD COLUMN beta_signup_code VARCHAR(100)
  CHECK (beta_signup_code IS NULL OR length(btrim(beta_signup_code)) > 0);
COMMENT ON COLUMN expert_accounts.beta_signup_code IS '클로즈 베타 가입코드: 선택 입력, 공개 계정 응답에 포함하지 않음';

COMMIT;
