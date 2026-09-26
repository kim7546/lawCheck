import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

const migrations = new URL('../apps/api/prisma/migrations/', import.meta.url);
const db = new PGlite({ extensions: { btree_gist } });
const renameSnapshots = [];
try {
  const directories = (await readdir(migrations, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const [index, directory] of directories.entries()) {
    if (directory === '202609250006_prelaunch_cleanup') {
      // Verify the rename before exercising the intentionally destructive cleanup.
      for (const snapshot of renameSnapshots) {
        assert.deepEqual(
          (
            await db.query(
              `SELECT to_jsonb(t) AS data FROM ${snapshot.table} t ORDER BY coalesce(to_jsonb(t)->>'id', to_jsonb(t)->>'account_id')`,
            )
          ).rows,
          snapshot.rows,
        );
      }
      await db.exec(`
        INSERT INTO expert_login_sessions(id,account_id,token_hash,expires_at)
          VALUES(gen_random_uuid(),'00000000-0000-4000-8000-000000000001',repeat('c',64),'2030-01-01');
        INSERT INTO community_posts(id,author_id,title,content)
          VALUES('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000001','Old post','Old content');
        INSERT INTO community_replies(id,post_id,author_id,content) VALUES
          (gen_random_uuid(),'00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','Old author on current post'),
          (gen_random_uuid(),'00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000006','Current author on old post');
        INSERT INTO fo_browsers(id,token_hash,expires_at)
          VALUES('00000000-0000-4000-8000-000000000012',repeat('d',64),'2030-01-01');
        INSERT INTO review_contributions(id,post_id,expert_id,status,reply,completed_at)
          VALUES(gen_random_uuid(),'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000006','COMPLETED','Current expert reply',now());
        INSERT INTO review_choices(post_id,contribution_id)
          SELECT post_id,id FROM review_contributions WHERE status='COMPLETED';
        INSERT INTO fo_review_reads(browser_id,contribution_id)
          SELECT '00000000-0000-4000-8000-000000000012',id FROM review_contributions;
      `);
    }
    if (directory === '202609250005_expert_naming') {
      // Exercise the upgrade with populated credentials, sessions, consent, profile and author FKs.
      await db.exec(`
        INSERT INTO reviewer_accounts(id,email,name,password_hash,username,plan,expert_group,can_manage_codes) VALUES
          ('00000000-0000-4000-8000-000000000006','rename@example.com','Keep existing member','unchanged-hash','reviewer_legacy_user','BUSINESS','LAWYER',true);
        INSERT INTO reviewer_login_sessions(id,account_id,token_hash,expires_at) VALUES
          ('00000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000006',repeat('a',64),'2030-01-01');
        INSERT INTO reviewer_consents(id,account_id,kind,version,document) VALUES
          ('00000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000006','TERMS','original','{"text":"original reviewer wording"}');
        INSERT INTO reviewer_lawyer_profiles(account_id,mobile_phone,registration_number,issue_number,office_name,address,office_phone) VALUES
          ('00000000-0000-4000-8000-000000000006','01012345678','001234','ISSUE-001','Existing office','Existing address','0212345678');
        INSERT INTO community_posts(id,author_id,title,content) VALUES
          ('00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000006','Existing post','Existing content');
        INSERT INTO community_replies(id,post_id,author_id,content) VALUES
          ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000006','Existing reply');
      `);
      for (const table of [
        'reviewer_accounts',
        'reviewer_login_sessions',
        'reviewer_consents',
        'reviewer_lawyer_profiles',
        'review_board_posts',
        'review_contributions',
        'community_posts',
        'community_replies',
      ]) {
        const rows = (
          await db.query(
            `SELECT to_jsonb(t) AS data FROM ${table} t ORDER BY coalesce(to_jsonb(t)->>'id', to_jsonb(t)->>'account_id')`,
          )
        ).rows;
        renameSnapshots.push({
          table: table.replace('reviewer_', 'expert_'),
          rows: rows.map(({ data }) => {
            if (Object.hasOwn(data, 'reviewer_id')) {
              data.expert_id = data.reviewer_id;
              delete data.reviewer_id;
            }
            return { data };
          }),
        });
      }
    }
    if (directory === '202609250003_common_codes') {
      await db.exec(
        "INSERT INTO reviewer_accounts(id,email,name,password_hash,plan,expert_group) VALUES ('00000000-0000-4000-8000-000000000004','code-migration@example.com','Existing professional','unchanged','PRO','TAX_ACCOUNTANT')",
      );
    }
    if (directory === '202609240002_individual_reviews') {
      await db.exec(`
        INSERT INTO reviewer_accounts(id,email,name,password_hash) VALUES
          ('00000000-0000-4000-8000-000000000001','migration@example.com','Legacy reviewer','test');
        INSERT INTO review_board_posts(id,session_id,answer_message_id,question,ai_answer,requester_email,status,reviewer_id,reply,completed_at) VALUES
          ('00000000-0000-4000-8000-000000000002',gen_random_uuid(),gen_random_uuid(),'Q','AI','q@example.com','COMPLETED','00000000-0000-4000-8000-000000000001','Existing reply',now()),
          ('00000000-0000-4000-8000-000000000003',gen_random_uuid(),gen_random_uuid(),'Q2','AI2','q@example.com','REVIEWING','00000000-0000-4000-8000-000000000001',NULL,NULL);
      `);
    }
    await db.exec(await readFile(new URL(`${directory}/migration.sql`, migrations), 'utf8'));
    if (index === 0) {
      await db.exec(`INSERT INTO law_offices (id,code,name,is_active,updated_at)
        VALUES (gen_random_uuid(),'UPGRADE_TEST','Existing office',false,now())`);
    }
    console.log(`Migration passed: ${directory}`);
  }
  const { rows } = await db.query(
    "SELECT status, is_active FROM law_offices WHERE code='UPGRADE_TEST'",
  );
  assert.deepEqual(rows, [{ status: 'SUSPENDED', is_active: false }]);
  const tables = await db.query(
    "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'",
  );
  assert.equal(tables.rows[0].count, 33);
  for (const snapshot of renameSnapshots.filter(({ table }) =>
    [
      'expert_accounts',
      'expert_login_sessions',
      'expert_consents',
      'expert_lawyer_profiles',
      'community_posts',
      'community_replies',
    ].includes(table),
  )) {
    assert.deepEqual(
      (
        await db.query(
          `SELECT ${snapshot.table === 'expert_accounts' ? "to_jsonb(t) - 'is_active' - 'updated_at'" : 'to_jsonb(t)'} AS data FROM ${snapshot.table} t ORDER BY coalesce(to_jsonb(t)->>'id', to_jsonb(t)->>'account_id')`,
        )
      ).rows,
      snapshot.rows
        .filter(
          ({ data }) =>
            snapshot.table !== 'expert_accounts' ||
            data.id === '00000000-0000-4000-8000-000000000006',
        )
        .map(({ data }) => ({
          data: snapshot.table === 'expert_accounts' ? { ...data, beta_signup_code: null } : data,
        })),
    );
  }
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'reviewer_%'",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM information_schema.columns WHERE table_schema='public' AND column_name='reviewer_id'",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM pg_constraint WHERE connamespace='public'::regnamespace AND conname LIKE '%reviewer%'",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (
      await db.query(
        "SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname='public' AND indexname LIKE '%reviewer%'",
      )
    ).rows[0].count,
    0,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM expert_lawyer_profiles')).rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(
        'SELECT count(*)::int AS count FROM expert_accounts WHERE username IS NOT NULL',
      )
    ).rows[0].count,
    1,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM expert_accounts')).rows[0].count,
    1,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM review_board_posts')).rows[0].count,
    2,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM fo_review_reads')).rows[0].count,
    1,
  );
  assert.equal(
    (
      await db.query(`SELECT count(*)::int AS count FROM information_schema.columns
    WHERE table_name='review_board_posts' AND column_name IN ('status','expert_id','reply','completed_at')`)
    ).rows[0].count,
    0,
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM expert_consents')).rows[0].count,
    1,
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT code FROM common_code_details WHERE group_code='EXPERT_GROUP' ORDER BY sort_order,code",
      )
    ).rows.map((row) => row.code),
    ['LAWYER', 'LABOR_ATTORNEY', 'PATENT_ATTORNEY', 'TAX_ACCOUNTANT'],
  );
  assert.deepEqual(
    (
      await db.query(
        "SELECT plan,expert_group,password_hash,can_manage_codes FROM expert_accounts WHERE email='rename@example.com'",
      )
    ).rows,
    [
      {
        plan: 'BUSINESS',
        expert_group: 'LAWYER',
        password_hash: 'unchanged-hash',
        can_manage_codes: true,
      },
    ],
  );
  await assert.rejects(
    db.exec("UPDATE expert_accounts SET plan='UNKNOWN' WHERE email='rename@example.com'"),
  );
  await assert.rejects(
    db.exec(
      "UPDATE expert_accounts SET plan_code_group='EXPERT_GROUP',plan='LAWYER' WHERE email='rename@example.com'",
    ),
  );
  await assert.rejects(
    db.exec("DELETE FROM common_code_details WHERE group_code='PLAN' AND code='BUSINESS'"),
  );
  await assert.rejects(db.exec("DELETE FROM common_code_groups WHERE code='PLAN'"));
  assert.deepEqual(
    (await db.query('SELECT status, reply FROM review_contributions ORDER BY post_id')).rows,
    [{ status: 'COMPLETED', reply: 'Current expert reply' }],
  );
  assert.equal(
    (await db.query('SELECT count(*)::int AS count FROM review_choices')).rows[0].count,
    1,
  );
  const descriptions = (
    await db.query(`
    SELECT c.relname AS table_name, a.attname AS column_name,
      obj_description(c.oid,'pg_class') AS table_description,
      col_description(c.oid,a.attnum) AS column_description
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
    WHERE n.nspname='public' AND c.relkind='r'
  `)
  ).rows;
  assert.equal(descriptions.length, 261);
  for (const row of descriptions) {
    assert.match(row.table_description ?? '', /[가-힣]/, row.table_name);
    assert.match(row.column_description ?? '', /[가-힣]/, `${row.table_name}.${row.column_name}`);
  }
  await db.exec(
    await readFile(new URL('../apps/api/prisma/tests/integrity.sql', import.meta.url), 'utf8'),
  );
  // Reproduce an upgrade from optional profiles: fill only missing LAWYER rows, preserving data.
  await db.exec(`
    INSERT INTO expert_accounts(id,email,name,password_hash,username,expert_group) VALUES
      ('00000000-0000-4000-8000-000000000021','empty-profile@example.com','Missing lawyer profile','preserved-hash','empty_profile','LAWYER'),
      ('00000000-0000-4000-8000-000000000022','other-group@example.com','Other profession','preserved-hash','other_group','TAX_ACCOUNTANT'),
      ('00000000-0000-4000-8000-000000000023','no-group@example.com','No profession','preserved-hash','no_group',NULL);
  `);
  const accountSnapshot = (await db.query('SELECT * FROM expert_accounts ORDER BY id')).rows;
  const profileSnapshot = (
    await db.query('SELECT * FROM expert_lawyer_profiles ORDER BY account_id')
  ).rows;
  const backfill = await readFile(
    new URL('202609250009_backfill_lawyer_profiles/migration.sql', migrations),
    'utf8',
  );
  await db.exec(backfill);
  const backfilled = (await db.query('SELECT * FROM expert_lawyer_profiles ORDER BY account_id'))
    .rows;
  assert.equal(backfilled.length, profileSnapshot.length + 1);
  assert.deepEqual(
    backfilled.filter((row) => row.account_id !== '00000000-0000-4000-8000-000000000021'),
    profileSnapshot,
  );
  const added = backfilled.find((row) => row.account_id === '00000000-0000-4000-8000-000000000021');
  assert.ok(added);
  for (const column of [
    'mobile_phone',
    'registration_number',
    'issue_number',
    'office_name',
    'address',
    'office_phone',
  ])
    assert.equal(added[column], null);
  assert.ok(added.created_at);
  assert.deepEqual(
    (await db.query('SELECT * FROM expert_accounts ORDER BY id')).rows,
    accountSnapshot,
  );
  await db.exec(backfill);
  assert.deepEqual(
    (await db.query('SELECT * FROM expert_lawyer_profiles ORDER BY account_id')).rows,
    backfilled,
  );
  console.log(
    'Database integrity and legacy migration tests passed (isolated PostgreSQL/PGlite, 33 tables).',
  );
} finally {
  await db.close();
}
