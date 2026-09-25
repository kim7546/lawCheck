-- Legacy accounts retain their email login; no profession information is fabricated.
ALTER TABLE reviewer_accounts ADD COLUMN username VARCHAR(30)
  CHECK (username IS NULL OR username ~ '^[a-z][a-z0-9_]{3,29}$');
CREATE UNIQUE INDEX reviewer_accounts_username_key ON reviewer_accounts(username);

CREATE TABLE reviewer_lawyer_profiles (
 account_id UUID PRIMARY KEY REFERENCES reviewer_accounts(id) ON DELETE CASCADE,
 mobile_phone VARCHAR(20) NOT NULL CHECK (mobile_phone ~ '^(010[0-9]{8}|01[16789][0-9]{7,8})$'),
 registration_number VARCHAR(50) NOT NULL CHECK (length(btrim(registration_number)) > 0),
 issue_number VARCHAR(100) NOT NULL CHECK (length(btrim(issue_number)) > 0),
 office_name VARCHAR(200) NOT NULL CHECK (length(btrim(office_name)) > 0),
 address VARCHAR(500) NOT NULL CHECK (length(btrim(address)) > 0),
 office_phone VARCHAR(20) NOT NULL CHECK (office_phone ~ '^(0[0-9]{8,10}|1[0-9]{7})$'),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
