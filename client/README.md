# client

The Citadel's frontend: a React 19 + Vite single-page app, styled with HeroUI and Tailwind 4, with Redux
Toolkit Query for data fetching and React Router 7 for routing.

See the [root README](../README.md) for setup, environment variables and how to run the full stack.

## Scripts

| Script            | What it does                                                                     |
| ----------------- | -------------------------------------------------------------------------------- |
| `npm run dev`     | Vite dev server on `:5173`, proxying `/api`, `/auth` and `/thronesdb` to the API |
| `npm run build`   | Type-checks (`tsc -b`) and builds to `dist/`                                     |
| `npm run preview` | Serves the built output                                                          |
| `npm run start`   | Serves `dist/` with `serve` (used by the Docker image)                           |
| `npm run lint`    | ESLint                                                                           |

`npm run build` fails unless `VITE_SENTRY_DSN` is set — see [`.env.example`](.env.example).

## Notes

- Shared models and helpers come from [`common/`](../common/) via the `common/*` TypeScript path alias, not
  an npm dependency, so changes there apply without a rebuild.
- Card rendering uses [`@agot/card-preview`](https://www.npmjs.com/package/@agot/card-preview), whose source
  lives in [`@agotCardPreview/`](../@agotCardPreview/). It is excluded from Vite's dep optimisation and React
  is deduped, so a `file:`-linked copy during library development doesn't end up with two React instances.
- Routes are declared in [`src/pages/index.tsx`](src/pages/index.tsx) as `navItems`, which drives both the
  router and the navigation menu. Each entry carries the permission required to see it.
