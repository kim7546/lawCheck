CREATE TYPE "AnswerEmailStatus" AS ENUM ('QUEUED', 'SENDING', 'RETRY', 'SENT', 'FAILED');
CREATE TABLE answer_email_deliveries (
  id UUID PRIMARY KEY,
  contribution_id UUID NOT NULL UNIQUE REFERENCES review_contributions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  recipient VARCHAR(254) NOT NULL,
  subject VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  link_token_hash VARCHAR(64) NOT NULL UNIQUE,
  link_expires_at TIMESTAMPTZ(3) NOT NULL,
  status "AnswerEmailStatus" NOT NULL DEFAULT 'QUEUED',
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 5),
  version INTEGER NOT NULL DEFAULT 1,
  next_attempt_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  lease_until TIMESTAMPTZ(3),
  last_error_code VARCHAR(100),
  sent_at TIMESTAMPTZ(3),
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX answer_email_deliveries_status_next_attempt_at_lease_until_idx ON answer_email_deliveries(status,next_attempt_at,lease_until);
CREATE INDEX answer_email_deliveries_created_at_id_idx ON answer_email_deliveries(created_at,id);
CREATE TABLE answer_email_attempts (
  id UUID PRIMARY KEY,
  delivery_id UUID NOT NULL REFERENCES answer_email_deliveries(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  attempt_no INTEGER NOT NULL,
  status "AnswerEmailStatus" NOT NULL DEFAULT 'SENDING',
  error_code VARCHAR(100),
  started_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ(3),
  UNIQUE(delivery_id,attempt_no)
);

COMMENT ON TABLE answer_email_deliveries IS '전문가 답변 이메일 발송 대기열 및 이력';
COMMENT ON COLUMN answer_email_deliveries.id IS '답변 알림 이메일 식별자';
COMMENT ON COLUMN answer_email_deliveries.contribution_id IS '알림 대상 전문가 답변 식별자';
COMMENT ON COLUMN answer_email_deliveries.recipient IS '질문자가 등록한 수신 이메일';
COMMENT ON COLUMN answer_email_deliveries.subject IS '이메일 제목';
COMMENT ON COLUMN answer_email_deliveries.body IS '답변 내용과 열람 링크를 포함한 발송 본문';
COMMENT ON COLUMN answer_email_deliveries.link_token_hash IS '답변 열람 토큰 SHA-256 해시';
COMMENT ON COLUMN answer_email_deliveries.link_expires_at IS '답변 링크 만료 일시';
COMMENT ON COLUMN answer_email_deliveries.status IS '발송 상태: QUEUED 대기, SENDING 전송 중, RETRY 재시도, SENT 접수 성공, FAILED 실패';
COMMENT ON COLUMN answer_email_deliveries.attempt_count IS '전체 발송 시도 횟수';
COMMENT ON COLUMN answer_email_deliveries.retry_count IS '현재 재발송 주기의 시도 횟수: 최대 5회';
COMMENT ON COLUMN answer_email_deliveries.version IS '발송 상태 경합 확인 버전';
COMMENT ON COLUMN answer_email_deliveries.next_attempt_at IS '다음 발송 시도 예정 일시';
COMMENT ON COLUMN answer_email_deliveries.lease_until IS '발송 작업 점유 만료 일시';
COMMENT ON COLUMN answer_email_deliveries.last_error_code IS '최근 발송 오류 코드: 공급자 응답 원문 제외';
COMMENT ON COLUMN answer_email_deliveries.sent_at IS '메일 서비스 접수 성공 일시';
COMMENT ON COLUMN answer_email_deliveries.created_at IS '발송 대기열 등록 일시';

COMMENT ON TABLE answer_email_attempts IS '답변 이메일 시도별 발송 결과 이력';
COMMENT ON COLUMN answer_email_attempts.id IS '발송 시도 식별자';
COMMENT ON COLUMN answer_email_attempts.delivery_id IS '이메일 발송 이력 식별자';
COMMENT ON COLUMN answer_email_attempts.attempt_no IS '누적 발송 시도 순번';
COMMENT ON COLUMN answer_email_attempts.status IS '발송 시도 상태';
COMMENT ON COLUMN answer_email_attempts.error_code IS '발송 오류 코드';
COMMENT ON COLUMN answer_email_attempts.started_at IS '시도 시작 일시';
COMMENT ON COLUMN answer_email_attempts.finished_at IS '시도 종료 일시';
