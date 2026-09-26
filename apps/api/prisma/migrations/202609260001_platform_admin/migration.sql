BEGIN;

ALTER TABLE expert_accounts ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE expert_admin_profiles (
  account_id UUID PRIMARY KEY REFERENCES expert_accounts(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE admin_login_sessions (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES expert_admin_profiles(account_id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX admin_login_sessions_expires_at_idx ON admin_login_sessions(expires_at);
CREATE TABLE bo_menus (
  key VARCHAR(30) PRIMARY KEY CHECK (key IN ('dashboard','reviews','community','codes')),
  label VARCHAR(50) NOT NULL CHECK (length(trim(label)) > 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 99999),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT bo_menus_home_enabled CHECK (key <> 'dashboard' OR is_active)
);
INSERT INTO bo_menus(key,label,sort_order) VALUES
  ('dashboard','대시보드',10), ('reviews','검증요청 게시판',20),
  ('community','커뮤니티',30), ('codes','공통 코드 관리',40);

COMMENT ON COLUMN expert_accounts.is_active IS '회원 계정 사용 여부';
COMMENT ON COLUMN expert_accounts.updated_at IS '회원 정보 최종 수정 일시';
COMMENT ON TABLE expert_admin_profiles IS '관리자 회원 상세: 전문 직역과 별도로 관리자 역할 부여';
COMMENT ON COLUMN expert_admin_profiles.account_id IS '공통 회원 식별자: 전문가 역할 겸임 가능';
COMMENT ON COLUMN expert_admin_profiles.is_active IS '관리자 권한 활성 여부';
COMMENT ON COLUMN expert_admin_profiles.created_at IS '관리자 등록 일시';
COMMENT ON COLUMN expert_admin_profiles.updated_at IS '관리자 권한 최종 수정 일시';
COMMENT ON TABLE admin_login_sessions IS '관리자 로그인 세션: BO 세션과 분리';
COMMENT ON COLUMN admin_login_sessions.id IS '관리자 세션 식별자';
COMMENT ON COLUMN admin_login_sessions.account_id IS '관리자 회원 식별자';
COMMENT ON COLUMN admin_login_sessions.token_hash IS '인증 토큰의 SHA-256 해시';
COMMENT ON COLUMN admin_login_sessions.expires_at IS '세션 만료 일시';
COMMENT ON TABLE bo_menus IS 'BO 메뉴의 표시명과 노출 순서 관리';
COMMENT ON COLUMN bo_menus.key IS '메뉴 식별 코드';
COMMENT ON COLUMN bo_menus.label IS '메뉴 표시명';
COMMENT ON COLUMN bo_menus.sort_order IS '메뉴 표시 순서';
COMMENT ON COLUMN bo_menus.is_active IS '메뉴 표시 여부';
COMMENT ON COLUMN bo_menus.updated_at IS '메뉴 최종 수정 일시';

-- 기존 회원 및 공통 코드 담당자를 자동으로 플랫폼 관리자로 승격하지 않는다.
COMMIT;
