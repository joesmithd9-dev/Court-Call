# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
# CourtCall Frontend

Real-time courtroom list system — public live list and registrar control screen.

## Quick Start

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at `http://localhost:5173`. API calls proxy to `http://localhost:3000`.

## Routes

| Route | Description |
|---|---|
| `/public/:courtDayId` | Public live list (counsel-facing, read-only) |
| `/registrar/:courtDayId` | Registrar mission control (full court management) |

## Running Against the Backend

The Vite dev server proxies all `/v1/*` requests to `http://localhost:3000`. Start the backend on port 3000, then run the frontend.

To change the backend URL, edit `vite.config.ts` proxy target.

## API Assumptions

The frontend assumes these API endpoints exist:

### Public
- `GET /v1/public/court-days/:id` — returns full court day snapshot with cases
- `GET /v1/public/court-days/:id/stream` — SSE stream of real-time updates

### Registrar
- `GET /v1/registrar/court-days/:id` — returns full court day snapshot
- `PATCH /v1/registrar/court-days/:id` — update court day status
- `PATCH /v1/registrar/court-days/:id/cases/:caseId` — update individual case
- `POST /v1/registrar/court-days/:id/start-next` — start next case
- `POST /v1/registrar/court-days/:id/reorder` — reorder cases

### Expected CourtDay Shape

```json
{
  "id": "uuid",
  "courtName": "Supreme Court — Court 1",
  "courtRoom": "1A",
  "judgeName": "Justice Smith",
  "date": "2026-04-06",
  "status": "live|scheduled|judge_rose|at_lunch|adjourned|ended",
  "statusMessage": "Back at 14:15",
  "resumeTime": "2026-04-06T14:15:00Z",
  "currentCaseId": "uuid",
  "cases": [
    {
      "id": "uuid",
      "courtDayId": "uuid",
      "position": 1,
      "caseName": "Smith v Jones",
      "caseNumber": "SC/2026/1234",
      "status": "pending|calling|hearing|adjourned|stood_down|not_before|concluded|vacated",
      "scheduledTime": "2026-04-06T10:00:00Z",
      "startedAt": "2026-04-06T10:05:00Z",
      "estimatedMinutes": 30,
      "predictedStartTime": "2026-04-06T11:00:00Z",
      "notBeforeTime": "2026-04-06T14:00:00Z",
      "adjournedToTime": "2026-04-06T14:30:00Z",
      "note": "Counsel running late",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### SSE Event Envelope

```json
{
  "type": "court_day_updated|case_updated|case_reordered|case_added|case_removed|heartbeat",
  "data": { "...partial court day or case data..." },
  "timestamp": "2026-04-06T10:05:00Z"
}
```

## Tech Stack

- React 19 + TypeScript (Vite)
- Tailwind CSS v4
- Zustand (lightweight state)
- Native EventSource for SSE
- PWA with basic service worker

## PWA

The app is installable as a PWA. The service worker caches the app shell and court day snapshots for offline viewing.
