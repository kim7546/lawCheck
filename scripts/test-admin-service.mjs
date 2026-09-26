import assert from 'node:assert/strict';
import { createServer, get } from 'node:http';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';

// Exercise the production Admin artifact with its own origin and API proxy.
// Neither FO/BO nor a database is needed, and no real accounts are used.
const upstream = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader(
    'Set-Cookie',
    'qaver_admin=preview-test; Path=/api/v1/admin; HttpOnly; SameSite=Strict',
  );
  res.end(JSON.stringify({ path: req.url, cookie: req.headers.cookie ?? '' }));
});
let admin;
function statusForHost(origin, host) {
  // Use http.get so the exact Host header reaches Vite (fetch can normalize Host).
  return new Promise((resolve, reject) => {
    get(`${origin}/admin`, { headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    }).on('error', reject);
  });
}
try {
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  process.env.API_PROXY_TARGET = `http://127.0.0.1:${upstream.address().port}`;
  process.env.PORT = '0';
  process.env.RAILWAY_PUBLIC_DOMAIN = 'admin.preview.test';
  process.env.PREVIEW_ALLOWED_HOSTS = 'custom-admin.preview.test';
  admin = await preview({
    root: fileURLToPath(new URL('../apps/admin', import.meta.url)),
    configFile: fileURLToPath(new URL('../apps/admin/vite.preview.config.ts', import.meta.url)),
    logLevel: 'silent',
  });
  const origin = `http://127.0.0.1:${admin.httpServer.address().port}`;
  for (const path of ['/', '/admin', '/admin/']) {
    const page = await fetch(`${origin}${path}`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /AI QAVER Admin/);
    assert.match(html, /noindex, nofollow/);
    for (const asset of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g))
      assert.equal((await fetch(`${origin}${asset[1]}`)).status, 200);
  }
  assert.equal(
    (await fetch(`${origin}/brand/aiqaver-admin.png`)).headers.get('content-type'),
    'image/png',
  );
  for (const host of [
    'admin.aiqaver.com',
    'lawcheckadmin-production.up.railway.app',
    'admin.preview.test',
    'custom-admin.preview.test',
  ])
    assert.equal(await statusForHost(origin, host), 200);
  assert.equal(await statusForHost(origin, 'untrusted.invalid'), 403);
  assert.equal(await statusForHost(origin, 'admin.aiqaver.com.untrusted.invalid'), 403);
  assert.equal(
    await statusForHost(origin, 'lawcheckadmin-production.up.railway.app.untrusted.invalid'),
    403,
  );
  const response = await fetch(`${origin}/api/v1/admin/me`, {
    headers: { Cookie: 'qaver_admin=preview-test' },
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    path: '/api/v1/admin/me',
    cookie: 'qaver_admin=preview-test',
  });
  assert.equal(
    response.headers.get('set-cookie'),
    'qaver_admin=preview-test; Path=/api/v1/admin; HttpOnly; SameSite=Strict',
  );
  console.log(
    'Standalone Admin preview passed: routes, assets, allowed hosts, API proxy and cookie forwarding.',
  );
} finally {
  if (admin)
    await new Promise((resolve, reject) => {
      admin.httpServer.close((error) => (error ? reject(error) : resolve()));
      admin.httpServer.closeAllConnections();
    });
  await new Promise((resolve, reject) => {
    upstream.close((error) => (error ? reject(error) : resolve()));
    upstream.closeAllConnections();
  });
}
