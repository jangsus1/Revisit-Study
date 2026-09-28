# Building a scatterplot study on this reVISit fork

Practical notes for creating the next `public/scatterplot_*` study from a fresh session. The
research background, data files and analysis conventions live in
`../ScatterplotMitigation/CLAUDE.md`; this file is only about the platform mechanics.

## Layout of one study

```
public/<study>/config.py        generator: builds components, baseComponents, sequence and
                                REWRITES config.json in place (keeps studyMetadata + uiConfig)
public/<study>/config.json      seed on first run (metadata + uiConfig only), generated afterwards
public/<study>/assets/*.md      instruction pages (consent, phase intros, examples, main)
src/public/scatterplot/assets/  shared React stimuli: phase1.jsx (training), phase3.jsx (beliefs),
                                phase2*.jsx (main task variants), attentionCheck.jsx, Slider.jsx
public/global.json              register the study in BOTH `configsList` (landing order) and `configs`
```

Recipe: copy the closest existing study folder (`scatterplot_timing` is the newest), keep only
`studyMetadata` + `uiConfig` in `config.json`, edit `config.py`, run
`../../../ScatterplotMitigation/.venv/bin/python config.py` inside the folder, add it to
`global.json`, commit with `git commit --no-verify` (husky needs yarn; use `corepack yarn` for
yarn), push `main` to deploy to GitHub Pages.

## Stimulus variants (`src/public/scatterplot/assets/`)

| File | Parameters | Behaviour |
|---|---|---|
| `phase2.jsx` | `seconds`, `label_seconds` | labels un-blur at `label_seconds` and stay; `label_seconds >= seconds` = never |
| `phase2_control.jsx` | `seconds`, `label_start`, `label_end` | labels visible only in `[start, end)`; start = end = seconds → never |
| `phase2_timing.jsx` | same as control | copy with generic "5 to 11 seconds" start text (used by `scatterplot_timing`) |
| `phase2_post_label.jsx`, `phase2_interval.jsx` | old pilots | estimate before/after label; repeated intervals |
| `scatterplot_gaze/assets/phase2_gaze.jsx` | `label_start`, `label_end` (as `phase2_timing.jsx`; falls back to `label_seconds`) | full-screen plot + webcam gaze recording + per-trial test-first calibration |

All variants emit `answer = {actualCorr, corrAfter}` via `setAnswer({status:true, answers:{answer: JSON}})`.
Every reactive response must carry `"hidden": true`, otherwise reVISit renders the raw answer
JSON as a bullet under the stimulus (visible since responses moved off the disabled sidebar).
Plot: fixed 500 × 500 px area, 50 points, r = 3 px, labels blurred with `blur(50px)`.
Every file under `src/public/**` is eagerly bundled (`import.meta.glob`), so keep heavy
dependencies out of there (the gaze engine lives in `src/gazeEngine/` and is imported dynamically).

## Component naming and parameters

`phase2_{label_idx}_{corr}_{exp}_{...condition}` where `corr ∈ {2,4,6,8}` (= r × 10),
`exp ∈ {0,1}` is the plot variant, and the condition suffix is study specific
(`_{label_seconds}`, `_{start}_{end}`, `_{before}_{after}_{display}` or `_base`).
Coordinates are generated once per `(corr, label_idx, exp)` with
`np.random.seed(hash((corr, label_idx, exp)) % 2**32)`, so the same plot is reproduced across
studies and across conditions. Baselines (labels never shown) must reuse the coordinates of their
revealed partner; the analysis subtracts them per participant.
Put every design variable into `parameters` (e.g. `blur_before`, `label_display`, `blur_after`);
the tidy export turns each into a `parameters_<name>` column.

## Sequence patterns that work

- **Scheme blocks** (all studies): the phase-2 block is a list of scheme blocks, one is dealt per
  participant. `order: "random", numSamples: 1` picks one at random;
  `order: "latinSquare", numSamples: 1` deals them evenly (each scheme once per N participants).
  reVISit builds the Latin square client side over the block's children, so nested blocks are fine.
- **Sampling one condition per label**: a nested `{id, order:"random", numSamples:1, components:[...]}`
  group per label (extend / duration studies).
- **Guaranteed separation** of two trials that share a plot: reVISit's `random` order cannot
  enforce a minimum distance, so pre-shuffle in `config.py` with a per-scheme `RandomState` and
  emit the scheme as `order: "fixed"` (`scatterplot_timing`, `MIN_GAP = 4`).
- **Comprehension check with retry, three strikes** (`scatterplot_timing`, preferred): one markdown
  component (`attention_check.md` = the correlation reading text) with four radio questions
  `belowStimulus`, `correctAnswer` for each, `provideFeedback: true`, `trainingAttempts: 3`,
  `allowFailedTraining: false`. Next becomes "Check Answer"; a wrong question shows "Please try
  again. You have N attempts left." (a correct one a green alert) and Next stays locked until all
  are right. After the 3rd wrong check reVISit marks the participant rejected ("Failed training")
  and routes to `__trainingFailed`, which shows `uiConfig.trainingFailedMsg` (markdown) and
  auto-redirects to `uiConfig.trainingFailedRedirectURL` after `trainingFailedRedirectDelay` ms
  (fork-only fields; timing study uses the Prolific screen-out code C1N03H9S). Wrong attempts are
  stored per participant (`incorrectAnswers`, `checkAnswer.attemptsUsed`) and exported as the tidy
  columns `incorrectAnswers` / `attemptsUsed` (selected by default; fork addition in
  `src/components/downloader/DownloadTidy.tsx`).
- Older studies (extend / interval / duration / gaze) use `skip` conditions on a questionnaire
  response; a failure lands on `attentionCheckFailed` (react component with the Prolific
  rejection link).
- Jump to a trial in the dev server: index N is encrypted with `src/utils/encryptDecryptIndex.ts`
  (AES-ECB + base64); `node -e` with `crypto-js` reproduces it. First phase-2 trial ≈ index 37.

## Next button gating

Stimuli gate Next with `setAnswer({status:false})` until the participant has interacted.
By default reVISit leaves the button enabled and shows
"Please complete the stimulus interaction to continue." on click. To **disable** the button
instead, set `"nextButtonDisabledUntilValid": true` in `uiConfig` (or per component). This is a
fork-only flag (`src/parser/types.ts`, `src/components/response/ResponseBlock.tsx`); the schemas
were regenerated with `yarn generate-schemas`. All scatterplot studies since Sept 2026 set it.
Because `config.py` preserves `uiConfig`, set it in the seed `config.json` once.

Other uiConfig fields the studies use: `withSidebar: false` (so every response must use
`location: belowStimulus`/`aboveStimulus`, otherwise the parser warns for every component),
`withProgressBar`, `urlParticipantIdParam: "PROLIFIC_PID"`, `studyEndMsg` with the Prolific
completion link, `helpTextPath`.

## Participants and testing

- A participant keeps the config snapshot from their first load. After changing a config, use
  "Next Participant" in the study browser or a fresh `PROLIFIC_PID` to see the change.
- Prolific completion / rejection codes live in `config.py` (`prolificRedirection*`) and in
  `uiConfig.studyEndMsg`; new studies are usually created with the previous study's codes as
  placeholders — replace them before collection.
- Data export: analysis dashboard → tidy CSV → `../ScatterplotMitigation/data/<study>_all_tidy.csv`.
- The embedded browser pane blocks the webcam; gaze studies must be tested in a real Chrome window.

## Eye-tracking variant (`scatterplot_gaze`)

Built from the timing generator: copy `scatterplot_timing/config.py`, point the phase-2 base at
`phase2_gaze.jsx` with a second hidden reactive response `gaze`, add `create_gaze_components()`
(webcamPermission, gazeCalibration, gazeFinalCheck, gazeEnd), put webcamPermission + gazeCalibration
before the examples, no instruction page between examples and main trials, and gazeFinalCheck + gazeEnd
after phase 2. Keep `studyRules` (desktop, mouse, ≥1024×700, Chrome/Edge/Firefox) in the seed config.
The embedded browser pane has no camera: trials still run (tracker init fails, gaze is empty), so label
timing and Next gating can be checked there; calibration needs a real Chrome window.

## Gaze tracker playground (comparison bench)

`/gaze_playground` (listed on the landing page; deployed at `/Revisit-Study/gaze_playground`) runs several
webcam trackers **at the same time on the same camera** and shows them the same dots, so their accuracy is
compared on identical eye movements. Component `src/public/gaze_playground/assets/GazeBench.tsx`; engines in
`src/gazeEngine/compare/` (loaded lazily), all behind one interface (`GazeEngineBase`: `beginPoint(target)` →
collect frames → `endPoint()` refits; output in viewport px, unsmoothed; constant drift `offset`):

| engine | method | licence / loading |
|---|---|---|
| WebEyeTrack (study) | the study's `gazeTracker` (BlazeGaze CNN + affine), raw output | MIT, vendored |
| RealEye Light 1.1 | landmarks + blendshapes + eye crops (1,653 features) → ridge + head-pose compensation; ≤ 8 frames per dot | AGPL-3.0 / free academic licence, jsDelivr ESM at runtime |
| EyeGesturesLite method | re-implementation: 30 eye landmarks normalized to the face box + face scale/shift → linear regression | re-implemented (original licence requires their logo) |

(WebGazer 3.5.3 and an iris + head-pose polynomial ridge were tried on 2026-09-27 and dropped as clearly worse.)
Buttons: Start, position guide (distance meter), calibration layout (9 grid = study, 13 = grid + inner, 17 = RealEye
4x4 + centre, 13 task-region = 3x3 over plot + labels + 4 corners; dots in random order, 1.8 s / 1.0 s collect,
then an 8-dot task-region check), checks (task region, centre, 5, 9 calibration targets, 8 off-grid, 25), Fix drift (centre-dot offset for every engine, then 5-dot check), reset, export JSON
(local download). Per check and engine: accuracy (mean over dots of the median sample error), best/worst dot,
sample-error IQR, precision (spread SD, sample-to-sample RMS), bias and error left after removing it, data loss,
Hz; an error-range chart and a map of median gaze per dot. Running all engines costs frame rate (each engine runs
its own face mesh); untick engines to compare at full speed. Open it in a real Chrome window (the embedded
browser has no camera). Not tried with a real face yet (verified headless with Chrome's fake camera only).

### Position guide before calibration (`PositionGuide.tsx`)

`gazeCalibration` (study) and the bench show a mirrored camera preview with a face oval and a distance meter
(WebEyeTrack's 3D face-origin z; assumes a ~60° vertical camera FOV, so approximate). Target 45–70 cm; the Start
button unlocks after 1.5 s in range, or after 30 s regardless ("start anyway"). Each calibration attempt logs
`position = {distanceCm, ready, guideMs, overridden}` in `perAttempt[]`.

### Calibration fits after the dots, not during them

Since 2026-09-27 every calibration (full 9-dot, per-trial 3/5-dot, bench) only *collects* eye samples while a
dot is shown (`calibEnd({defer: true})`); the tracker adapts to all points in order afterwards
(`calibFlush` / `gazeTracker.flushCalibration()`, `finishCalibration()` on bench engines) on a blank screen
("You can blink and relax your eyes"). Before, WebEyeTrack's `adapt()` ran inside each dot and held the dot
until it finished. Same result (eye patches do not depend on the weights); the last `calib[]` entry logs `fitMs`.

### Smooth pursuit and the "Calibrating…" screen (2026-09-28)

`gazeCalibration` now runs 9 fixation dots, then **20 s of smooth pursuit** (dot on a 3:2 Lissajous curve over
80 % of the viewport, peak ~0.31 viewport widths/s), then a "Calibrating…" spinner screen while the tracker fits,
then the 5-dot validation. Pursuit frames are paired with the dot position 80 ms earlier (`PURSUIT_LAG_MS`), the
first 600 ms of motion are skipped; WebEyeTrack's worker buffers timestamped frames and splits them into 12
support-set entries of ≤ 10 frames (`pursuitEnd`), so `maxPoints` is now 25 (9 dots + 12 chunks + per-trial dots).
The last `calib[]` entry logs `pursuit = {durationMs, lagMs, skipMs, frames, chunks, n, trace}` with
`trace = [t_since_motion_onset, raw_x, raw_y, target_x, target_y, open]` (estimate the real lag from it).
Per-trial short calibrations stay dot-only but also end on the spinner screen. The bench offers Dots / Smooth
pursuit / Dots + pursuit with the same path and timing (`lissajous`, `animatePursuit` in `CalibrationOverlay.tsx`).
