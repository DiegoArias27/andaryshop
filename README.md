# ANDARY SHOP — Frontend

React + Vite (TypeScript) storefront. See the root [README.md](../README.md) for the full project overview and deployment instructions.

## Local development

```bash
npm install
cp .env.example .env   # then edit VITE_API_URL / VITE_WHATSAPP_NUMBER
npm run dev
```

## Scripts

- `npm run dev` — Vite dev server
- `npm run build` — typecheck (`tsc -b`) + production build to `dist/`
- `npm run preview` — preview the production build locally
- `npm run lint` — ESLint
