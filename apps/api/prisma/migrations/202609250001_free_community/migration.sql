CREATE TYPE "ReviewerPlan" AS ENUM ('FREE', 'PRO', 'BUSINESS');
ALTER TABLE reviewer_accounts ADD COLUMN plan "ReviewerPlan" NOT NULL DEFAULT 'FREE';
CREATE TABLE community_posts (
 id UUID PRIMARY KEY, author_id UUID NOT NULL REFERENCES reviewer_accounts(id) ON DELETE RESTRICT,
 title VARCHAR(200) NOT NULL CHECK (length(btrim(title)) > 0),
 content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 20000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX community_posts_created_at_id_idx ON community_posts(created_at, id);
CREATE TABLE community_replies (
 id UUID PRIMARY KEY, post_id UUID NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
 author_id UUID NOT NULL REFERENCES reviewer_accounts(id) ON DELETE RESTRICT,
 content TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 1 AND 5000),
 created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX community_replies_post_id_created_at_id_idx ON community_replies(post_id, created_at, id);
