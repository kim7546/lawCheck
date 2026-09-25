BEGIN;

-- 오픈 전 정리: 개별 전문가 답변으로 대체된 단일 답변 저장 컬럼을 제거한다.
ALTER TABLE review_board_posts
  DROP COLUMN status,
  DROP COLUMN expert_id,
  DROP COLUMN reply,
  DROP COLUMN completed_at;
CREATE INDEX review_board_posts_created_at_id_idx ON review_board_posts(created_at, id);

-- 구형 가입 양식으로 만든 계정만 정리한다. 가입 아이디, 직역 상세 또는 동의가
-- 등록된 계정은 보존하며, 참조 데이터를 먼저 제거해 외래키를 유지한다.
CREATE TEMP TABLE prelaunch_legacy_experts ON COMMIT DROP AS
SELECT a.id FROM expert_accounts a
WHERE a.username IS NULL
  AND NOT EXISTS (SELECT 1 FROM expert_lawyer_profiles p WHERE p.account_id = a.id)
  AND NOT EXISTS (SELECT 1 FROM expert_consents c WHERE c.account_id = a.id);

DELETE FROM review_choices
WHERE contribution_id IN (
  SELECT id FROM review_contributions
  WHERE expert_id IN (SELECT id FROM prelaunch_legacy_experts)
);
-- 검증 답변 읽음 기록은 외래키의 ON DELETE CASCADE로 함께 정리된다.
DELETE FROM review_contributions WHERE expert_id IN (SELECT id FROM prelaunch_legacy_experts);
DELETE FROM community_replies WHERE author_id IN (SELECT id FROM prelaunch_legacy_experts);
DELETE FROM community_posts WHERE author_id IN (SELECT id FROM prelaunch_legacy_experts);
DELETE FROM expert_accounts WHERE id IN (SELECT id FROM prelaunch_legacy_experts);

COMMIT;
