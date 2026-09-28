import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, preview } from 'vite';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const tempRoot = resolve(repoRoot, '.tmp');
await mkdir(tempRoot, { recursive: true });
const testDir = await mkdtemp(join(tempRoot, 'search-indexing-'));
const variableName = 'SEARCH_ENGINE_INDEXING_ENABLED';
const savedEnv = Object.fromEntries(
  [variableName, 'PORT', 'API_PROXY_TARGET', 'NODE_ENV'].map((key) => [key, process.env[key]]),
);
const robotsTxt = 'User-agent: *\nAllow: /\n';
const cases = [
  { name: 'default', value: undefined, enabled: false, build: true },
  { name: 'enabled', value: 'true', enabled: true, build: true },
  { name: 'disabled', value: 'false', enabled: false },
  { name: 'empty', value: '', enabled: false },
  { name: 'invalid', value: 'tru', enabled: false },
  { name: 'normalized', value: ' TrUe ', enabled: true },
];

function setEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function checkHtml(html, directives, label) {
  const tags = html.match(/<meta\b[^>]*\bname="robots"[^>]*>/g) ?? [];
  assert.equal(tags.length, 1, `${label}: exactly one robots tag`);
  assert.ok(tags[0].includes(`content="${directives}"`), `${label}: ${directives}`);
}

async function checkServer(server, directives, label) {
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const path of ['/', '/index.html', '/nested/page?check=1']) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200, `${label}: ${path}`);
    assert.equal(response.headers.get('x-robots-tag'), directives, `${label}: ${path} header`);
    assert.match(response.headers.get('content-type'), /text\/html/);
    checkHtml(await response.text(), directives, `${label}: ${path}`);
  }
  for (const path of ['/', '/nested/page', '/robots.txt']) {
    const response = await fetch(`${origin}${path}`, { method: 'HEAD' });
    assert.equal(response.status, 200, `${label}: HEAD ${path}`);
    assert.equal(response.headers.get('x-robots-tag'), directives);
    assert.equal(await response.text(), '');
  }
  const robots = await fetch(`${origin}/robots.txt?check=1`);
  assert.equal(robots.status, 200);
  assert.equal(robots.headers.get('x-robots-tag'), directives);
  assert.match(robots.headers.get('content-type'), /text\/plain/);
  assert.equal(await robots.text(), robotsTxt);
  const asset = await fetch(`${origin}/brand/aiqaver-symbol.png`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('x-robots-tag'), directives);
  assert.equal(asset.headers.get('content-type'), 'image/png');
  await asset.arrayBuffer();
}

async function closePreview(server) {
  await new Promise((resolve, reject) => {
    server.httpServer.close((error) => (error ? reject(error) : resolve()));
    server.httpServer.closeAllConnections();
  });
}

const devOptions = {
  host: '127.0.0.1',
  port: 0,
  strictPort: false,
  hmr: false,
  watch: null,
  preTransformRequests: false,
};

try {
  process.env.PORT = '0';
  delete process.env.API_PROXY_TARGET;
  for (const app of ['fo', 'bo', 'admin']) {
    const root = join(repoRoot, 'apps', app);
    const outputs = new Map();
    for (const scenario of cases) {
      setEnv(variableName, scenario.value);
      const directives = scenario.enabled ? 'index, follow' : 'noindex, nofollow';
      const common = {
        root,
        configFile: join(root, 'vite.config.ts'),
        // Keep results independent of a developer's .env files.
        envDir: false,
        logLevel: 'silent',
        cacheDir: join(testDir, 'cache', app),
        optimizeDeps: { noDiscovery: true, include: [] },
      };
      process.env.NODE_ENV = 'development';
      const dev = await createServer({ ...common, server: devOptions });
      try {
        await dev.listen();
        assert.equal(dev.config.env[variableName], undefined);
        await checkServer(dev, directives, `${app}/${scenario.name}/dev`);
      } finally {
        await dev.close();
      }

      process.env.NODE_ENV = 'production';
      if (scenario.build) {
        const outDir = join(testDir, app, scenario.name);
        await build({ ...common, build: { outDir, emptyOutDir: false } });
        checkHtml(await readFile(join(outDir, 'index.html'), 'utf8'), directives, `${app}/build`);
        assert.equal(await readFile(join(outDir, 'robots.txt'), 'utf8'), robotsTxt);
        outputs.set(scenario.enabled, outDir);
      }
      const deployed = await preview({
        ...common,
        configFile: join(root, 'vite.preview.config.ts'),
        build: { outDir: outputs.get(scenario.enabled) },
        preview: { host: '127.0.0.1', port: 0, strictPort: false },
      });
      try {
        await checkServer(deployed, directives, `${app}/${scenario.name}/preview`);
      } finally {
        await closePreview(deployed);
      }
      console.log(`${app}: ${scenario.name} passed (dev, preview, matching build artifact).`);
    }
  }

  // Exercise real env files in an isolated workspace, without touching the user's .env.
  const workspace = join(testDir, 'env-workspace');
  const root = join(workspace, 'apps', 'fixture');
  await mkdir(root, { recursive: true });
  await writeFile(join(workspace, 'package.json'), '{"private":true,"workspaces":["apps/*"]}');
  await writeFile(
    join(root, 'index.html'),
    '<!doctype html><html><head></head><body></body></html>',
  );
  await writeFile(join(workspace, '.env'), `${variableName}=true\n`);
  for (const scenario of [
    { name: 'root env', expected: 'index, follow' },
    { name: 'app override', appEnv: 'false', expected: 'noindex, nofollow' },
    { name: 'mode override', appEnv: 'false', modeEnv: 'true', expected: 'index, follow' },
    {
      name: 'process override',
      appEnv: 'true',
      modeEnv: 'true',
      processEnv: 'false',
      expected: 'noindex, nofollow',
    },
  ]) {
    setEnv(variableName, scenario.processEnv);
    process.env.NODE_ENV = 'development';
    if (scenario.appEnv !== undefined)
      await writeFile(join(root, '.env'), `${variableName}=${scenario.appEnv}\n`);
    if (scenario.modeEnv !== undefined)
      await writeFile(join(root, '.env.development'), `${variableName}=${scenario.modeEnv}\n`);
    const dev = await createServer({
      root,
      configFile: join(repoRoot, 'apps', 'fo', 'vite.config.ts'),
      logLevel: 'silent',
      cacheDir: join(testDir, 'env-cache'),
      server: devOptions,
      optimizeDeps: { noDiscovery: true, include: [] },
    });
    try {
      await dev.listen();
      const response = await fetch(`http://127.0.0.1:${dev.httpServer.address().port}/`);
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('x-robots-tag'), scenario.expected);
      checkHtml(await response.text(), scenario.expected, scenario.name);
      assert.equal(dev.config.env[variableName], undefined);
    } finally {
      await dev.close();
    }
    console.log(`Environment precedence: ${scenario.name} passed.`);
  }
  delete process.env[variableName];
  process.env.NODE_ENV = 'production';
  const deployed = await preview({
    root: join(repoRoot, 'apps', 'fo'),
    configFile: join(repoRoot, 'apps', 'fo', 'vite.preview.config.ts'),
    envDir: root,
    build: { outDir: join(testDir, 'fo', 'default') },
    logLevel: 'silent',
    preview: { host: '127.0.0.1', port: 0, strictPort: false },
  });
  try {
    await checkServer(deployed, 'noindex, nofollow', 'preview ignores local env');
  } finally {
    await closePreview(deployed);
  }
  console.log('Preview ignores local env; all search indexing checks passed.');
} finally {
  for (const [key, value] of Object.entries(savedEnv)) setEnv(key, value);
  // Only remove the temporary directory created by this script inside this workspace.
  assert.equal(dirname(resolve(testDir)), tempRoot);
  assert.ok(basename(testDir).startsWith('search-indexing-'));
  await rm(testDir, { recursive: true, force: true });
}
