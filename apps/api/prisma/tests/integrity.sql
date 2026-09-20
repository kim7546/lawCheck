-- Only synthetic data is inserted; every change is rolled back, including helpers.
BEGIN;
CREATE FUNCTION pg_temp.expect_error(statement text, expected_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = expected_state THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE %, but statement succeeded: %', expected_state, statement;
END $$;

DO $$
DECLARE
  o uuid := gen_random_uuid(); other_o uuid := gen_random_uuid();
  s uuid := gen_random_uuid(); q uuid := gen_random_uuid(); a uuid := gen_random_uuid();
  l uuid := gen_random_uuid(); staff uuid := gen_random_uuid(); r uuid := gen_random_uuid();
  reply uuid := gen_random_uuid(); invitation uuid := gen_random_uuid(); mail uuid := gen_random_uuid();
BEGIN
  INSERT INTO law_offices(id,code,name,updated_at) VALUES (o,o::text,'Test',now()),(other_o,other_o::text,'Other',now());
  INSERT INTO lawyers(id,law_office_id,name,email,updated_at) VALUES(l,o,'Test','lawyer@example.test',now());
  INSERT INTO staff_accounts(id,law_office_id,email,password_hash,role,updated_at)
    VALUES(staff,o,'admin@example.test','test-only','OFFICE_ADMIN',now());
  PERFORM pg_temp.expect_error(format('INSERT INTO staff_accounts(id,law_office_id,email,password_hash,role,updated_at) VALUES(gen_random_uuid(),%L,''ADMIN@example.test'',''test'',''OFFICE_ADMIN'',now())',o),'23505');
  PERFORM pg_temp.expect_error(format('INSERT INTO staff_accounts(id,law_office_id,lawyer_id,email,password_hash,role,updated_at) VALUES(gen_random_uuid(),%L,%L,''other@example.test'',''test'',''LAWYER'',now())',other_o,l),'23503');
  INSERT INTO lawyer_employments(id,law_office_id,lawyer_id,starts_at,ends_at,created_by,updated_at)
    VALUES(gen_random_uuid(),o,l,'2026-01-01','2026-06-01',staff,now());
  PERFORM pg_temp.expect_error(format('INSERT INTO lawyer_employments(id,law_office_id,lawyer_id,starts_at,ends_at,created_by,updated_at) VALUES(gen_random_uuid(),%L,%L,''2026-05-01'',''2026-07-01'',%L,now())',o,l,staff),'23P01');
  INSERT INTO lawyer_employments(id,law_office_id,lawyer_id,starts_at,created_by,updated_at)
    VALUES(gen_random_uuid(),o,l,'2026-06-01',staff,now());
  INSERT INTO chat_sessions(id,law_office_id,session_token_hash,max_question_count,expires_at,updated_at)
    VALUES(s,o,replace(s::text,'-','')||replace(s::text,'-',''),NULL,now()+interval '1 day',now());
  PERFORM pg_temp.expect_error(format('UPDATE chat_sessions SET question_count=-1 WHERE id=%L',s),'23514');
  INSERT INTO chat_messages(id,law_office_id,session_id,role,message_type,content,sequence_no,request_key)
    VALUES(q,o,s,'USER','USER_QUESTION','Original question',1,'question-1');
  PERFORM pg_temp.expect_error(format('INSERT INTO chat_messages(id,law_office_id,session_id,role,message_type,content,sequence_no) VALUES(gen_random_uuid(),%L,%L,''USER'',''USER_QUESTION'',''wrong office'',2)',other_o,s),'23503');
  PERFORM pg_temp.expect_error(format('INSERT INTO chat_messages(id,law_office_id,session_id,role,message_type,content,sequence_no,request_key) VALUES(gen_random_uuid(),%L,%L,''USER'',''USER_QUESTION'',''duplicate'',3,''question-1'')',o,s),'23505');
  INSERT INTO chat_messages(id,law_office_id,session_id,parent_message_id,role,message_type,content,sequence_no,processing_status)
    VALUES(a,o,s,q,'ASSISTANT','AI_ANSWER','Original answer',2,'PROCESSING');
  PERFORM pg_temp.expect_error(format('INSERT INTO verification_requests(id,law_office_id,session_id,question_message_id,ai_answer_message_id,requester_email,question_snapshot,ai_answer_snapshot,expires_at,updated_at) VALUES(%L,%L,%L,%L,%L,''user@example.test'',''fake'',''fake'',now()+interval ''1 day'',now())',r,o,s,q,a),'23514');
  UPDATE chat_messages SET processing_status='COMPLETED', message_type='NON_LEGAL_NOTICE' WHERE id=a;
  PERFORM pg_temp.expect_error(format('INSERT INTO verification_requests(id,law_office_id,session_id,question_message_id,ai_answer_message_id,requester_email,question_snapshot,ai_answer_snapshot,expires_at,updated_at) VALUES(%L,%L,%L,%L,%L,''user@example.test'',''fake'',''fake'',now()+interval ''1 day'',now())',r,o,s,q,a),'23514');
  UPDATE chat_messages SET message_type='AI_ANSWER' WHERE id=a;
  INSERT INTO verification_requests(id,law_office_id,session_id,question_message_id,ai_answer_message_id,requester_email,question_snapshot,ai_answer_snapshot,expires_at,updated_at)
    VALUES(r,o,s,q,a,'user@example.test','fake','fake',now()+interval '1 day',now());
  IF NOT EXISTS(SELECT 1 FROM verification_requests WHERE id=r AND question_snapshot='Original question' AND ai_answer_snapshot='Original answer') THEN
    RAISE EXCEPTION 'Snapshots were not copied from source messages';
  END IF;
  PERFORM pg_temp.expect_error(format('UPDATE verification_requests SET question_snapshot=''tampered'' WHERE id=%L',r),'23514');
  PERFORM pg_temp.expect_error(format('INSERT INTO verification_requests SELECT gen_random_uuid(),law_office_id,session_id,question_message_id,ai_answer_message_id,requester_email,additional_context,question_snapshot,ai_answer_snapshot,status,assigned_lawyer_id,assignment_version,requested_at,assigned_at,claimed_at,completed_at,expires_at,created_at,updated_at FROM verification_requests WHERE id=%L',r),'23505');
  UPDATE verification_requests SET status='ASSIGNED',assigned_lawyer_id=l,assignment_version=2 WHERE id=r;
  PERFORM pg_temp.expect_error(format('INSERT INTO lawyer_replies(id,law_office_id,verification_request_id,lawyer_id,assignment_version,result_type,reply_body) VALUES(%L,%L,%L,%L,1,''GENERALLY_VALID'',''stale'')',reply,o,r,l),'23514');
  INSERT INTO lawyer_replies(id,law_office_id,verification_request_id,lawyer_id,assignment_version,result_type,reply_body)
    VALUES(reply,o,r,l,2,'GENERALLY_VALID','Reviewed');
  PERFORM pg_temp.expect_error(format('UPDATE lawyer_replies SET reply_body=''changed'' WHERE id=%L',reply),'23514');
  INSERT INTO review_invitations(id,law_office_id,verification_request_id,lawyer_id,assignment_version,token_hash,expires_at)
    VALUES(invitation,o,r,l,2,replace(invitation::text,'-','')||replace(invitation::text,'-',''),now()+interval '1 day');
  INSERT INTO email_outbox(id,law_office_id,verification_request_id,invitation_id,recipient,event_type,deduplication_key)
    VALUES(mail,o,r,invitation,'lawyer@example.test','LAWYER_REVIEW_INVITATION',mail::text);
  PERFORM pg_temp.expect_error(format('UPDATE email_outbox SET status=''SENT'' WHERE id=%L',mail),'23514');
  PERFORM pg_temp.expect_error(format('UPDATE email_outbox SET status=''SENDING'' WHERE id=%L',mail),'23514');
  PERFORM pg_temp.expect_error(format('UPDATE email_outbox SET event_type=''USER_LAWYER_REPLY'' WHERE id=%L',mail),'23514');
  UPDATE email_outbox SET status='SENT',sent_at=now() WHERE id=mail;
  INSERT INTO audit_logs(id,law_office_id,actor_type,action,entity_type,entity_id) VALUES(gen_random_uuid(),o,'SYSTEM','TEST','request',r);
  PERFORM pg_temp.expect_error(format('UPDATE audit_logs SET action=''changed'' WHERE law_office_id=%L',o),'23514');
END $$;
ROLLBACK;
