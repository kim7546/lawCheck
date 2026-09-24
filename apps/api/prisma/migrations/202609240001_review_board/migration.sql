CREATE TABLE reviewer_accounts (
  id UUID PRIMARY KEY, email VARCHAR(254) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL, password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE reviewer_login_sessions (
  id UUID PRIMARY KEY, account_id UUID NOT NULL REFERENCES reviewer_accounts(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL UNIQUE, expires_at TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX reviewer_login_sessions_expires_at_idx ON reviewer_login_sessions(expires_at);
CREATE TABLE review_board_posts (
  id UUID PRIMARY KEY, session_id UUID NOT NULL, answer_message_id UUID NOT NULL UNIQUE,
  question TEXT NOT NULL, ai_answer TEXT NOT NULL, requester_email VARCHAR(254) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'REQUESTED',
  reviewer_id UUID REFERENCES reviewer_accounts(id) ON DELETE RESTRICT,
  reply TEXT, created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ(3),
  CONSTRAINT review_board_state CHECK (
    (status = 'REQUESTED' AND reviewer_id IS NULL AND reply IS NULL AND completed_at IS NULL) OR
    (status = 'REVIEWING' AND reviewer_id IS NOT NULL AND reply IS NULL AND completed_at IS NULL) OR
    (status = 'COMPLETED' AND reviewer_id IS NOT NULL AND length(trim(reply)) > 0 AND reply IS NOT NULL AND completed_at IS NOT NULL)
  )
);
CREATE INDEX review_board_posts_status_created_at_idx ON review_board_posts(status, created_at);
CREATE INDEX review_board_posts_session_id_idx ON review_board_posts(session_id);
