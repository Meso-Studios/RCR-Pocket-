# Rhythm Canvas Reboot

Mobile-friendly HTML5 4-lane rhythm game built with React, TypeScript, Tailwind CSS, and Canvas 2D.

## Running Standalone or in an HTML Compiler

`index.html` at the repository root (and `dist/index.html`) is compiled into a **self-contained single-file HTML5 build** with all styles and application code bundled inline.

- You can open `index.html` directly in a browser, run it inside an HTML compiler/viewer, or host the repository folder on any static server without a build step.
- Source files live in `src/` (with `src/app.html` as the Vite HTML template).

## Hosting on GitHub Pages

Both GitHub Pages deployment methods work out of the box:

1. **Deploy from a branch (quickest)**:
   - Push this repository to GitHub on `main`.
   - Open **Settings → Pages → Build and deployment → Source**, pick **Deploy from a branch**, select **`main`** and **`/ (root)`**, and save.
2. **GitHub Actions (auto-rebuilds on every source edit)**:
   - Open **Settings → Pages → Build and deployment → Source** and select **GitHub Actions**.
   - Pushing to `main` (or `master`) runs `.github/workflows/deploy.yml`, verifies TypeScript + Vite build, and publishes `dist/`.

## Local Development

```bash
npm install
npm run dev
```

To rebuild the standalone `index.html` and `dist/` after editing files in `src/`:

```bash
npm run build
```
