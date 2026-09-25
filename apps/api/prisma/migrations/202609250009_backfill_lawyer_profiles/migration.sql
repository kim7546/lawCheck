BEGIN;

-- 변호사로 가입한 회원은 추후 정보를 보완할 수 있도록 빈 상세 행도 보유한다.
-- 직역 미선택 회원과 다른 직역 회원은 대상에서 제외하고 기존 상세 정보는 보존한다.
INSERT INTO expert_lawyer_profiles (account_id)
SELECT a.id
FROM expert_accounts a
WHERE a.expert_group = 'LAWYER'
  AND NOT EXISTS (
    SELECT 1 FROM expert_lawyer_profiles p WHERE p.account_id = a.id
  )
ON CONFLICT (account_id) DO NOTHING;

COMMIT;
