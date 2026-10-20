-- Retain all existing answer deliveries, attempts and answer links.
ALTER TABLE answer_email_deliveries
  ADD COLUMN kind VARCHAR(30) NOT NULL DEFAULT 'ANSWER',
  ADD COLUMN request_post_id UUID REFERENCES review_board_posts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD COLUMN request_expert_id UUID REFERENCES expert_accounts(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  ALTER COLUMN contribution_id DROP NOT NULL,
  ALTER COLUMN link_token_hash DROP NOT NULL,
  ALTER COLUMN link_expires_at DROP NOT NULL;

CREATE UNIQUE INDEX answer_email_deliveries_request_post_id_request_expert_id_key
  ON answer_email_deliveries(request_post_id, request_expert_id);

ALTER TABLE answer_email_deliveries ADD CONSTRAINT answer_email_delivery_kind_check CHECK (
  (kind = 'ANSWER' AND contribution_id IS NOT NULL AND link_token_hash IS NOT NULL
    AND link_expires_at IS NOT NULL AND request_post_id IS NULL AND request_expert_id IS NULL)
  OR
  (kind = 'REVIEW_REQUEST' AND contribution_id IS NULL AND link_token_hash IS NULL
    AND link_expires_at IS NULL AND request_post_id IS NOT NULL AND request_expert_id IS NOT NULL)
);

COMMENT ON TABLE answer_email_deliveries IS '검증 요청 및 전문가 답변 이메일 발송 대기열과 이력';
COMMENT ON COLUMN answer_email_deliveries.kind IS 'ANSWER 질문자 답변 알림, REVIEW_REQUEST 변호사 검증 요청 알림';
COMMENT ON COLUMN answer_email_deliveries.request_post_id IS '검증 요청 알림 대상 게시글';
COMMENT ON COLUMN answer_email_deliveries.request_expert_id IS '검증 요청 알림 수신 변호사';
