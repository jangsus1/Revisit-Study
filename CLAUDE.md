# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Also read `AGENTS.md` at the repo root: it holds the project's conventions (terminology, library rules, testing placement, "DO NOT" list) and is the authoritative source when the two disagree.

## Commands

Use **yarn**, never npm (see the `p_DO_NOT_USE_NPM_USE_YARN` marker file). `package-lock.json` is still committed and CI (`dependency-lock-drift.yml`) fails if it drifts from `yarn.lock`, so after changing dependencies regenerate both (`yarn install`, then `npm install --package-lock-only --ignore-scripts`) and run `node scripts/check-lockfile-drift.mjs`.

```bash
yarn install                 # also installs the husky pre-commit hook (lint-staged -> yarn lint)
yarn serve                   # Vite dev server on http://localhost:8080
yarn build                   # tsc && vite build (CI runs this)
yarn typecheck               # tsc --noEmit
yarn lint                    # eslint src (Airbnb rules; public/ and src/public/ are ignored)

yarn unittest                                    # vitest, jsdom, watch mode
yarn unittest run src/parser/tests/parser.spec.ts  # single file
yarn unittest run -t "name of test"              # single test by name
yarn unittest-coverage

yarn test                                        # Playwright E2E (starts yarn serve itself)
yarn test tests/demo-image.spec.ts --project=chromium   # single E2E file, chromium only
yarn test --project=chromium -g "title substring"

yarn generate-schemas            # regenerate src/parser/*Schema.json after editing src/parser/types.ts
yarn generate-library-examples   # scaffold public/library-<name>/ example studies + regenerate library docs
```

Playwright runs `chromium` and `webkit` projects; CI retries twice, local runs don't. AGENTS.md asks that Playwright suites be delegated to an agent and run with Chromium rather than run blindly via `yarn test`.

## Architecture

reVISit is a single-page React 18 + TypeScript + Vite app (Mantine UI, Redux Toolkit, React Router 7) that runs user studies described by a JSON/YAML/HJSON DSL ("reVISit.spec"). Three personas: **study designer** (writes configs), **participant** (takes the study), **analyst** (uses the `/analysis` UI).

### Where studies live

- `public/global.json` lists every study id in `configsList`; each study is `public/<studyId>/config.json` plus static assets (`public/<studyId>/assets/`). `public/` is served verbatim by Vite, so nothing there is compiled.
- React/TS stimuli for a study go in `src/public/<studyId>/assets/*.tsx` (mirroring the `public/` path). `src/routes/utils.tsx` eagerly loads everything under `src/public/**` with `import.meta.glob`, and `react-component`-type components and dynamic-block `functionPath`s resolve against that map. Vite `?raw`/static assets stay in `public/`.
- Reusable libraries: `public/libraries/<name>/config.json` (+ `src/public/libraries/<name>/assets/` for React code). Studies import them via `importedLibraries` and reference `$<lib>.components.<x>` / `$<lib>.sequences.<x>`. Each non-test library needs a `public/library-<name>/` example study (see AGENTS.md "Adding Libraries").
- `test-*` studies in `public/` exist for E2E coverage; `tests/*.spec.ts` (repo root) are the Playwright specs that drive them, with helpers in `tests/utils.ts`.

### Config parsing (`src/parser/`)

`src/parser/types.ts` is the source of truth for the DSL; `StudyConfigSchema.json`, `GlobalConfigSchema.json`, and `LibraryConfigSchema.json` are generated from it with `ts-json-schema-generator` and must be regenerated when types change. `parseStudyConfig` in `parser.ts` does: parse (JSON, falling back to HJSON/YAML) → Ajv-validate against the schema → `loadLibrariesParseNamespace` (fetch imported library configs, namespace them) → `expandLibrarySequences` → `verifyStudyConfig` (semantic checks). It never throws; it returns the config with `errors` and `warnings` arrays that the UI surfaces. Components can inherit via `baseComponent` (`src/utils/handleComponentInheritance.ts`).

### App boot and participant flow

`src/main.tsx` → `StorageEngineProvider` → `GlobalConfigParser.tsx` (top-level routes: `/` study browser, `/:studyId/*` participant/reviewer, `/analysis/stats/:studyId/:analysisTab`, `/settings`, `/login`; analysis and settings are wrapped in `ProtectedRoute`) → `components/Shell.tsx` for a study. Shell fetches and parses the config, calls `storageEngine.initializeStudyDb`, obtains the participant's sequence assignment (Latin-square/random sequences are pre-generated in `utils/handleRandomSequences.tsx` and stored as a `sequenceArray`), then builds the Redux store with `studyStoreCreator` (`src/store/store.tsx`) and installs the per-study routes.

Each step renders through `StepRenderer` → `controllers/ComponentController.tsx`, which switches on the component `type` (`markdown`, `website` → iframe, `image`, `react-component`, `vega`, `video`) and wraps it with `components/response/ResponseBlock.tsx` for the `response` inputs (above/below stimulus or sidebar). Iframe and React stimuli communicate answers/provenance back via `postMessage` events and `store/hooks/useRevisitTrrack.tsx` (Trrack provenance graphs are attached to answers).

### Sequence model

The study `sequence` tree is flattened to a list by `utils/getSequenceFlatMap.ts`; the current position is the index in the URL, obfuscated with `utils/encryptDecryptIndex.ts`. Answers are keyed `${componentName}_${index}`. The one exception is a **dynamic block** (`functionPath` pointing at a `src/public/...` function): it is a nested sequence with its own `funcIndex` URL segment, and the function is called with prior answers to decide the next component (`useCurrentComponent` in `src/routes/utils.tsx`). Skip/condition logic lives in `utils/handleConditionLogic.ts`; next/previous navigation in `store/hooks/useNextStep.ts` / `usePreviousStep.ts`.

### Storage engines (`src/storage/`)

`engines/types.ts` defines the abstract `StorageEngine` (and `CloudStorageEngine` for auth/admin features). Implementations: `LocalStorageEngine` (localforage/IndexedDB), `FirebaseStorageEngine`, `SupabaseStorageEngine`. `initialize.ts` picks one from `VITE_STORAGE_ENGINE` in `.env`; in dev a cloud engine that fails to connect falls back to localStorage, in prod it does not. Per-study modes (`dataCollectionEnabled`, `developmentModeEnabled`, `dataSharingEnabled`) gate behavior across the app. Participant data shape (`ParticipantData`, `StoredAnswer`) is in `src/store/types.ts`, separate from the config types.

### Analysis UI (`src/analysis/`)

`individualStudy/` holds the tabs (summary, stats, table, replay, thinkAloud, LiveMonitor, management, config). Replay reconstructs a participant's session from stored provenance (`store/hooks/useReplay.ts`).

## Conventions that matter here

- ESLint enforces `import/order`, no file extensions in imports (except `.json`), `no-console` except `warn`/`error`, unused vars must be `_`-prefixed. Only `lodash.debounce`, `lodash.throttle`, `lodash.isequal`, `lodash.merge` are allowed.
- No dynamic `import(...)` anywhere in `src/` or tests; static top-level imports only. No new dependencies without approval.
- Unit tests sit in a sibling `tests/` folder with the same basename plus `.spec.` (e.g. `src/store/hooks/useReplay.ts` → `src/store/hooks/tests/useReplay.spec.tsx`); root-level app files test under `src/tests/`. `vitest-localstorage-mock` is preloaded.
- Study folder names may contain spaces/periods; the app normalizes them to underscores in URLs, so use in-app generated links.
- Large library media belongs in the `revisit-studies/library-assets` repo, referenced by tag-pinned raw GitHub URLs, not committed here.
- Releases: feature branches → `dev` → one PR into protected `main` whose title is exactly the version (e.g. `v2.4.4`); the release workflow updates pinned references (like the `$schema` URLs in configs) and tags automatically.
