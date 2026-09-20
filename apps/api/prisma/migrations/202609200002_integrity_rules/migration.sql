BEGIN;

-- Retain the existing flag while adding an explicit office lifecycle.
UPDATE law_offices SET status = 'SUSPENDED' WHERE NOT is_active;
ALTER TABLE law_offices ADD CONSTRAINT office_active_status
  CHECK (is_active = (status = 'ACTIVE'));

CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE lawyer_employments ADD CONSTRAINT employment_valid_period
  CHECK (ends_at IS NULL OR ends_at > starts_at);
ALTER TABLE lawyer_employments ADD CONSTRAINT employment_no_overlap
  EXCLUDE USING gist (law_office_id WITH =, lawyer_id WITH =,
    tstzrange(starts_at, ends_at, '[)') WITH &&)
  WHERE (status <> 'CANCELLED');
ALTER TABLE lawyer_leaves ADD CONSTRAINT leave_valid_period CHECK (ends_at > starts_at);
ALTER TABLE lawyer_leaves ADD CONSTRAINT approved_leave_has_approver
  CHECK (status <> 'APPROVED' OR approved_by IS NOT NULL);
ALTER TABLE staff_accounts ADD CONSTRAINT lawyer_role_has_profile
  CHECK (role <> 'LAWYER' OR lawyer_id IS NOT NULL);

-- Normalize at write time in the API; these indexes also protect against case variants.
CREATE UNIQUE INDEX staff_email_case_insensitive ON staff_accounts (law_office_id, lower(email));
CREATE UNIQUE INDEX lawyer_email_case_insensitive ON lawyers (law_office_id, lower(email));
ALTER TABLE chat_sessions ADD CONSTRAINT session_counts_valid
  CHECK (question_count >= 0 AND (max_question_count IS NULL OR max_question_count > 0));
ALTER TABLE chat_sessions ADD CONSTRAINT chat_token_hash_format CHECK (session_token_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE staff_sessions ADD CONSTRAINT staff_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE review_invitations ADD CONSTRAINT invitation_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE review_sessions ADD CONSTRAINT review_token_hash_format CHECK (token_hash ~ '^[a-f0-9]{64}$');
ALTER TABLE chat_messages ADD CONSTRAINT message_sequence_valid CHECK (sequence_no > 0);
ALTER TABLE chat_messages ADD CONSTRAINT message_role_matches_type CHECK (
  (message_type = 'USER_QUESTION' AND role = 'USER' AND parent_message_id IS NULL) OR
  (message_type IN ('AI_ANSWER', 'NON_LEGAL_NOTICE') AND role = 'ASSISTANT' AND parent_message_id IS NOT NULL) OR
  (message_type = 'SYSTEM_NOTICE' AND role = 'SYSTEM')
);
ALTER TABLE chat_messages ADD CONSTRAINT message_not_own_parent CHECK (parent_message_id IS DISTINCT FROM id);
ALTER TABLE verification_requests ADD CONSTRAINT assignment_version_valid CHECK (assignment_version >= 0);
ALTER TABLE verification_requests ADD CONSTRAINT verification_valid_expiry CHECK (expires_at > requested_at);
ALTER TABLE verification_requests ADD CONSTRAINT assigned_request_has_lawyer CHECK (
  status NOT IN ('ASSIGNED', 'REVIEWING', 'ANSWERED') OR (assigned_lawyer_id IS NOT NULL AND assignment_version > 0)
);
ALTER TABLE verification_requests ADD CONSTRAINT requested_has_no_assignee CHECK (status <> 'REQUESTED' OR assigned_lawyer_id IS NULL);
ALTER TABLE review_invitations ADD CONSTRAINT invitation_version_valid CHECK (assignment_version > 0);
ALTER TABLE assignment_history ADD CONSTRAINT history_version_valid CHECK (assignment_version > 0);
ALTER TABLE assignment_history ADD CONSTRAINT assignment_has_participant CHECK (from_lawyer_id IS NOT NULL OR to_lawyer_id IS NOT NULL);
ALTER TABLE lawyer_replies ADD CONSTRAINT reply_version_valid CHECK (assignment_version > 0);
ALTER TABLE lawyer_replies ADD CONSTRAINT reply_nonempty CHECK (length(trim(reply_body)) > 0);
ALTER TABLE email_outbox ADD CONSTRAINT outbox_attempt_count_valid CHECK (attempt_count >= 0);
ALTER TABLE email_outbox ADD CONSTRAINT outbox_event_target CHECK (
  (event_type = 'LAWYER_REVIEW_INVITATION' AND invitation_id IS NOT NULL AND reply_id IS NULL) OR
  (event_type = 'USER_LAWYER_REPLY' AND reply_id IS NOT NULL AND invitation_id IS NULL)
);
ALTER TABLE email_outbox ADD CONSTRAINT outbox_sent_timestamp CHECK (status <> 'SENT' OR sent_at IS NOT NULL);
ALTER TABLE email_outbox ADD CONSTRAINT outbox_sending_lease CHECK (status <> 'SENDING' OR lease_until IS NOT NULL);
ALTER TABLE email_outbox ADD CONSTRAINT outbox_clear_finished_payload
  CHECK (status NOT IN ('SENT', 'CANCELLED') OR encrypted_payload IS NULL);
ALTER TABLE email_delivery_attempts ADD CONSTRAINT delivery_attempt_positive CHECK (attempt_no > 0);
ALTER TABLE email_delivery_attempts ADD CONSTRAINT delivery_attempt_period CHECK (finished_at IS NULL OR finished_at >= started_at);

-- The composite answer FK ensures parent/session/office identity. This guard adds
-- semantic completion checks and fixes snapshots from server-held source messages.
CREATE FUNCTION guard_verification_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE q chat_messages%ROWTYPE; a chat_messages%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(NEW.law_office_id, NEW.session_id, NEW.question_message_id, NEW.ai_answer_message_id,
           NEW.question_snapshot, NEW.ai_answer_snapshot, NEW.additional_context)
       IS DISTINCT FROM ROW(OLD.law_office_id, OLD.session_id, OLD.question_message_id, OLD.ai_answer_message_id,
           OLD.question_snapshot, OLD.ai_answer_snapshot, OLD.additional_context) THEN
      RAISE EXCEPTION 'Verification source and snapshots are immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO q FROM chat_messages WHERE id = NEW.question_message_id FOR SHARE;
  SELECT * INTO a FROM chat_messages WHERE id = NEW.ai_answer_message_id FOR SHARE;
  IF q.id IS NULL OR a.id IS NULL OR q.message_type <> 'USER_QUESTION'
     OR a.message_type <> 'AI_ANSWER' OR a.processing_status <> 'COMPLETED'
     OR a.parent_message_id IS DISTINCT FROM q.id
     OR q.session_id <> NEW.session_id OR a.session_id <> NEW.session_id
     OR q.law_office_id <> NEW.law_office_id OR a.law_office_id <> NEW.law_office_id THEN
    RAISE EXCEPTION 'Verification requires a completed legal answer for the same question/session/office' USING ERRCODE = '23514';
  END IF;
  NEW.question_snapshot := q.content;
  NEW.ai_answer_snapshot := a.content;
  RETURN NEW;
END $$;
CREATE TRIGGER verification_snapshot_guard BEFORE INSERT OR UPDATE ON verification_requests
  FOR EACH ROW EXECUTE FUNCTION guard_verification_snapshot();

CREATE FUNCTION guard_reply_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r verification_requests%ROWTYPE;
BEGIN
  SELECT * INTO r FROM verification_requests WHERE id = NEW.verification_request_id FOR UPDATE;
  IF r.id IS NULL OR r.law_office_id <> NEW.law_office_id OR r.status NOT IN ('ASSIGNED', 'REVIEWING')
     OR r.assigned_lawyer_id IS DISTINCT FROM NEW.lawyer_id OR r.assignment_version <> NEW.assignment_version THEN
    RAISE EXCEPTION 'Reply must match the current assignment' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER reply_assignment_guard BEFORE INSERT ON lawyer_replies
  FOR EACH ROW EXECUTE FUNCTION guard_reply_assignment();

CREATE FUNCTION prevent_record_update() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Submitted replies and history records are immutable' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER immutable_reply BEFORE UPDATE ON lawyer_replies FOR EACH ROW EXECUTE FUNCTION prevent_record_update();
CREATE TRIGGER immutable_assignment_history BEFORE UPDATE ON assignment_history FOR EACH ROW EXECUTE FUNCTION prevent_record_update();
CREATE TRIGGER immutable_audit_log BEFORE UPDATE ON audit_logs FOR EACH ROW EXECUTE FUNCTION prevent_record_update();

COMMIT;
