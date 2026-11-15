import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig, type Plugin} from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

function githubPagesSpaPlugin(): Plugin {
  return {
    name: 'github-pages-spa-files',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url || '/';
        const cleanPath = rawUrl.split('?')[0];
        if (cleanPath === '/' || cleanPath === '/index.html') {
          try {
            const templatePath = path.resolve(rootDir, 'src/app.html');
            const rawHtml = fs.readFileSync(templatePath, 'utf-8');
            const html = await server.transformIndexHtml(rawUrl, rawHtml);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
            return;
          } catch (err) {
            next(err);
            return;
          }
        }
        next();
      });
    },
    closeBundle() {
      const distDir = path.resolve(rootDir, 'dist');
      const emittedHtml = path.join(distDir, 'src', 'app.html');
      const indexHtml = path.join(distDir, 'index.html');
      const sourceHtmlPath = fs.existsSync(emittedHtml) ? emittedHtml : indexHtml;
      if (!fs.existsSync(sourceHtmlPath)) return;

      let html = fs.readFileSync(sourceHtmlPath, 'utf-8');
      const assetsDir = path.join(distDir, 'assets');
      let combinedCss = '';
      let combinedJs = '';

      if (fs.existsSync(assetsDir)) {
        const files = fs.readdirSync(assetsDir).sort();
        for (const file of files) {
          const full = path.join(assetsDir, file);
          if (file.endsWith('.css')) {
            combinedCss += fs.readFileSync(full, 'utf-8').replace(/<\/style>/gi, '<\\/style>') + '\n';
          } else if (file.endsWith('.js')) {
            combinedJs += fs.readFileSync(full, 'utf-8').replace(/<\/script>/gi, '<\\/script>') + '\n';
          }
        }
      }

      html = html.replace(/<link\b[^>]*rel=["'](?:stylesheet|modulepreload)["'][^>]*assets\/[^>]*>\s*/gi, '');
      html = html.replace(/<script\b[^>]*src=["'][^"']*assets\/[^"']*["'][^>]*><\/script>\s*/gi, '');

      if (combinedCss) {
        html = html.replace('</head>', () => `    <style>${combinedCss}</style>\n  </head>`);
      }
      if (combinedJs) {
        html = html.replace('</body>', () => `    <script>${combinedJs}</script>\n  </body>`);
      }

      fs.writeFileSync(indexHtml, html, 'utf-8');
      fs.copyFileSync(indexHtml, path.join(distDir, '404.html'));
      fs.writeFileSync(path.join(distDir, '.nojekyll'), '');
      fs.copyFileSync(indexHtml, path.resolve(rootDir, 'index.html'));

      // Remove intermediate src/app.html and external assets/ since everything is self-contained inside index.html
      fs.rmSync(path.join(distDir, 'src'), {recursive: true, force: true});
      fs.rmSync(assetsDir, {recursive: true, force: true});
    },
  };
}

export default defineConfig(() => {
  return {
    // Relative base works both at root domains (localhost / custom domains)
    // and on GitHub Pages project URLs (https://<user>.github.io/<repo>/).
    base: './',
    plugins: [react(), tailwindcss(), githubPagesSpaPlugin()],
    build: {
      cssCodeSplit: false,
      assetsInlineLimit: 100000000,
      rollupOptions: {
        input: path.resolve(rootDir, 'src/app.html'),
        output: {
          format: 'iife' as const,
          codeSplitting: false,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
