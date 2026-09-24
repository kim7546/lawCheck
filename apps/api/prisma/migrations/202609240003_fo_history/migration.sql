CREATE TABLE fo_browsers (
  id UUID PRIMARY KEY,
  token_hash VARCHAR(64) NOT NULL UNIQUE,
  active_session_id UUID,
  expires_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE fo_conversations (
  id UUID PRIMARY KEY,
  browser_id UUID NOT NULL REFERENCES fo_browsers(id) ON DELETE CASCADE,
  session_id UUID NOT NULL UNIQUE REFERENCES chat_sessions(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX fo_conversations_browser_id_created_at_idx ON fo_conversations(browser_id, created_at);
CREATE TABLE fo_review_reads (
  browser_id UUID NOT NULL REFERENCES fo_browsers(id) ON DELETE CASCADE,
  contribution_id UUID NOT NULL REFERENCES review_contributions(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(browser_id, contribution_id)
);
