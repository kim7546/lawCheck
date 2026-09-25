BEGIN;

-- Rename in place: keep account IDs, credentials, sessions, consent snapshots and replies.
ALTER TABLE reviewer_accounts RENAME TO expert_accounts;
ALTER TABLE reviewer_lawyer_profiles RENAME TO expert_lawyer_profiles;
ALTER TABLE reviewer_consents RENAME TO expert_consents;
ALTER TABLE reviewer_login_sessions RENAME TO expert_login_sessions;
ALTER TABLE review_board_posts RENAME COLUMN reviewer_id TO expert_id;
ALTER TABLE review_contributions RENAME COLUMN reviewer_id TO expert_id;

-- PostgreSQL keeps old constraint/index names on table and column renames.
DO $$
DECLARE item record;
BEGIN
  FOR item IN
    SELECT rel.relname AS table_name, con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = rel.relnamespace
    WHERE ns.nspname = 'public' AND con.conname LIKE '%reviewer%'
      AND rel.relname IN ('expert_accounts', 'expert_lawyer_profiles', 'expert_consents', 'expert_login_sessions', 'review_board_posts', 'review_contributions')
  LOOP
    EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I', item.table_name, item.conname, replace(item.conname, 'reviewer', 'expert'));
  END LOOP;
  FOR item IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND indexname LIKE '%reviewer%'
      AND tablename IN ('expert_accounts', 'expert_lawyer_profiles', 'expert_consents', 'expert_login_sessions', 'review_board_posts', 'review_contributions')
  LOOP
    EXECUTE format('ALTER INDEX public.%I RENAME TO %I', item.indexname, replace(item.indexname, 'reviewer', 'expert'));
  END LOOP;
END $$;

COMMIT;
