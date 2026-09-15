# Vendored WebEyeTrack

Source: https://github.com/RedForestAI/WebEyeTrack, folder `js/src`, MIT license (see `LICENSE`).
Upstream commit at vendoring time: see `UPSTREAM_COMMIT.txt`.

Why vendored: the npm package `webeyetrack@0.0.2` hard-codes the BlazeGaze model path to the
domain root (`/web/model.json`), which breaks under the GitHub Pages base path, uses a webpack
`worker-loader` import that Vite cannot resolve, and offers no explicit calibration API (only a
global click listener).

Model weights live in `public/scatterplot_gaze/web/` (copied from
`js/examples/minimal-example/public/web/`).

## Local modifications (all files carry `// @ts-nocheck`; upstream compiles non-strict)

- `WebEyeTrackProxy.ts` — rewritten: Vite module worker via `new Worker(new URL(...))`,
  explicit `baseUrl`, no window click listener, `start()`, `calibStart/calibEnd/resetCalib`
  request-response API, `dispose()`, frames stamped with `performance.now()`.
- `WebEyeTrackWorker.ts` — rewritten: sequential message queue, calibration buffering,
  slim `stepResult` payload, `initError`.
- `WebcamClient.ts` — takes an `HTMLVideoElement`, rejects on `getUserMedia` failure,
  double-start guard, `getStream()`.
- `WebEyeTrack.ts` — `rawPog` in results; affine fit requires ≥4 distinct targets; pruning
  evicts expired/oldest `'click'` entries before `'calib'` entries and disposes tensors;
  `resetCalib(baseUrl)` and `calibStats()`; Kalman filter reset.
- `BlazeGaze.ts` — disposes the previous model on reload.
- `types.ts` — type-only MediaPipe import, `rawPog`, `SlimGazeResult`, `CalibResult`.
- `index.ts` not vendored (re-exports a type as a value, which breaks `isolatedModules`).
