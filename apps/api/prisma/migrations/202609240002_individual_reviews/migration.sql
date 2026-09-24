-- Each reviewer has an independent state. Existing post columns remain unchanged.
CREATE TABLE review_contributions (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES review_board_posts(id) ON DELETE RESTRICT,
  reviewer_id UUID NOT NULL REFERENCES reviewer_accounts(id) ON DELETE RESTRICT,
  status VARCHAR(20) NOT NULL DEFAULT 'REVIEWING',
  reply TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ(3),
  CONSTRAINT review_contributions_post_id_reviewer_id_key UNIQUE(post_id, reviewer_id),
  CONSTRAINT review_contributions_post_id_id_key UNIQUE(post_id, id),
  CONSTRAINT review_contribution_state CHECK (
    (status = 'REVIEWING' AND reply IS NULL AND completed_at IS NULL) OR
    (status = 'COMPLETED' AND reply IS NOT NULL AND length(trim(reply)) > 0 AND completed_at IS NOT NULL)
  )
);
CREATE INDEX review_contributions_reviewer_id_status_idx ON review_contributions(reviewer_id, status);

-- Preserve already started/completed reviews from the first release.
INSERT INTO review_contributions(id, post_id, reviewer_id, status, reply, created_at, completed_at)
SELECT gen_random_uuid(), id, reviewer_id, status, reply, created_at, completed_at
FROM review_board_posts
WHERE reviewer_id IS NOT NULL AND status IN ('REVIEWING', 'COMPLETED');

CREATE TABLE review_choices (
  post_id UUID PRIMARY KEY REFERENCES review_board_posts(id) ON DELETE RESTRICT,
  contribution_id UUID NOT NULL,
  selected_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT review_choices_contribution_fkey FOREIGN KEY (post_id, contribution_id)
    REFERENCES review_contributions(post_id, id) ON DELETE RESTRICT ON UPDATE NO ACTION
);
