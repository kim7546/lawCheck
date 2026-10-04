-- 유효한 이메일 링크를 가진 브라우저는 원래 대화를 함께 사용할 수 있다.
ALTER TABLE fo_conversations DROP CONSTRAINT fo_conversations_session_id_key;
CREATE UNIQUE INDEX fo_conversations_browser_id_session_id_key ON fo_conversations(browser_id, session_id);
CREATE INDEX fo_conversations_session_id_idx ON fo_conversations(session_id);
COMMENT ON TABLE fo_conversations IS '브라우저별 대화 연결: 이메일 링크로 여러 브라우저에 동일 대화 복원 가능';
