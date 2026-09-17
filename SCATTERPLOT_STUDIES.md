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
| `scatterplot_gaze/assets/phase2_gaze.jsx` | as `phase2.jsx` | full-screen plot + webcam gaze recording + per-trial calibration |

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
- Attention checks use `skip` conditions on a questionnaire response; a failure lands on
  `attentionCheckFailed` (react component with the Prolific rejection link).
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
