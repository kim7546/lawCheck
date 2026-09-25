CREATE TYPE "ExpertGroupCode" AS ENUM ('LAWYER', 'LABOR_ATTORNEY', 'PATENT_ATTORNEY', 'TAX_ACCOUNTANT');
CREATE TYPE "OfficeConsentKind" AS ENUM ('TERMS', 'PRIVACY', 'EXPERT_POLICY');

-- Preserve legacy accounts without asserting a profession or consent they never supplied.
ALTER TABLE reviewer_accounts ADD COLUMN expert_group "ExpertGroupCode";

CREATE TABLE reviewer_consents (
  id UUID PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES reviewer_accounts(id) ON DELETE CASCADE,
  kind "OfficeConsentKind" NOT NULL,
  version VARCHAR(40) NOT NULL,
  document JSONB NOT NULL,
  accepted_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX reviewer_consents_account_id_kind_version_key ON reviewer_consents(account_id, kind, version);
