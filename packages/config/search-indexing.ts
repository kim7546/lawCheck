import { loadEnv, searchForWorkspaceRoot, type Connect, type Plugin } from 'vite';

const variableName = 'SEARCH_ENGINE_INDEXING_ENABLED';
// Crawlers must be able to read noindex; Disallow: / can leave URLs in search results.
const robotsTxt = 'User-agent: *\nAllow: /\n';

export function searchIndexing(): Plugin {
  let directives = 'noindex, nofollow';
  let isPreview = false;

  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    res.setHeader('X-Robots-Tag', directives);
    if (
      (req.method === 'GET' || req.method === 'HEAD') &&
      req.url?.split('?')[0] === '/robots.txt'
    ) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : robotsTxt);
      return;
    }
    next();
  };

  return {
    name: 'lawcheck-search-indexing',
    config(_config, env) {
      isPreview = env.isPreview === true;
    },
    configResolved(config) {
      // Deployment preview only uses runtime variables, never the local .env.
      const env =
        isPreview || config.envDir === false
          ? process.env
          : {
              ...loadEnv(config.mode, searchForWorkspaceRoot(config.root), variableName),
              ...loadEnv(config.mode, config.envDir, variableName),
            };
      const enabled = env[variableName]?.trim().toLowerCase() === 'true';
      directives = enabled ? 'index, follow' : 'noindex, nofollow';
    },
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'robots', content: directives } }];
    },
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robotsTxt });
    },
  };
}
