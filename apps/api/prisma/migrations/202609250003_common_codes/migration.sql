CREATE TABLE common_code_groups (
 code VARCHAR(50) PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{0,49}$'),
 name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
 description VARCHAR(500) NOT NULL DEFAULT '',
 sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 99999),
 is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE common_code_details (
 group_code VARCHAR(50) NOT NULL REFERENCES common_code_groups(code) ON DELETE RESTRICT ON UPDATE RESTRICT,
 code VARCHAR(50) NOT NULL CHECK (code ~ '^[A-Z][A-Z0-9_]{0,49}$'),
 name VARCHAR(100) NOT NULL CHECK (length(btrim(name)) > 0),
 description VARCHAR(500) NOT NULL DEFAULT '',
 sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order BETWEEN 0 AND 99999),
 is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY (group_code, code)
);
CREATE INDEX common_code_details_group_code_sort_order_code_idx ON common_code_details(group_code, sort_order, code);
INSERT INTO common_code_groups (code, name, description, sort_order) VALUES
 ('EXPERT_GROUP', '전문가 그룹', 'Office 전문가 직역 분류', 10),
 ('PLAN', '요금제', '회원 요금제 종류', 20);
INSERT INTO common_code_details (group_code, code, name, sort_order, is_active) VALUES
 ('EXPERT_GROUP','LAWYER','변호사',10,true),
 ('EXPERT_GROUP','LABOR_ATTORNEY','노무사',20,false),
 ('EXPERT_GROUP','PATENT_ATTORNEY','변리사',30,false),
 ('EXPERT_GROUP','TAX_ACCOUNTANT','세무사',40,false),
 ('PLAN','FREE','Free',10,true),
 ('PLAN','PRO','Pro',20,true),
 ('PLAN','BUSINESS','Business',30,true);

-- Convert existing values losslessly; NULL legacy professions remain NULL.
ALTER TABLE reviewer_accounts ALTER COLUMN plan DROP DEFAULT;
ALTER TABLE reviewer_accounts ALTER COLUMN plan TYPE VARCHAR(50) USING plan::text;
ALTER TABLE reviewer_accounts ALTER COLUMN plan SET DEFAULT 'FREE';
ALTER TABLE reviewer_accounts ALTER COLUMN expert_group TYPE VARCHAR(50) USING expert_group::text;
ALTER TABLE reviewer_accounts
 ADD COLUMN expert_code_group VARCHAR(50) NOT NULL DEFAULT 'EXPERT_GROUP' CHECK (expert_code_group = 'EXPERT_GROUP'),
 ADD COLUMN plan_code_group VARCHAR(50) NOT NULL DEFAULT 'PLAN' CHECK (plan_code_group = 'PLAN'),
 ADD COLUMN can_manage_codes BOOLEAN NOT NULL DEFAULT false,
 ADD CONSTRAINT reviewer_accounts_expert_code_group_expert_group_fkey FOREIGN KEY (expert_code_group, expert_group) REFERENCES common_code_details(group_code, code) ON DELETE RESTRICT ON UPDATE RESTRICT,
 ADD CONSTRAINT reviewer_accounts_plan_code_group_plan_fkey FOREIGN KEY (plan_code_group, plan) REFERENCES common_code_details(group_code, code) ON DELETE RESTRICT ON UPDATE RESTRICT;
DROP TYPE "ReviewerPlan";
DROP TYPE "ExpertGroupCode";
