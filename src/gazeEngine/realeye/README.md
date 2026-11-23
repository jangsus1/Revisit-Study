# RealEye backend for scatterplot_gaze

`RealEyeBackend.ts` runs RealEye Webcam EyeTracker Light Open **1.1.0** (RealEye sp. z o.o.) inside the
study, behind the same interface as `../webeyetrack/WebEyeTrackProxy.ts`. The library is imported at
runtime from jsDelivr (`@realeye-io/webcam-eyetracker-light-open@1.1.0/+esm` and
`.../dist/lib/features/FeatureExtractor.js/+esm`); nothing of it is vendored or bundled.

Licence: dual AGPL-3.0-or-later / commercial, with a no-fee commercial path for academic projects with a
grant budget under USD 1M. Pick one before collecting data (AGPL applies to the page that uses it).

Used from the library: `WebcamETLight.detectFace` (MediaPipe FaceLandmarker, VIDEO mode, GPU with CPU
fallback), `extractCombinedFeatures` (live frames) and `extractAugmentedFeatures` (calibration frames,
5 eye-crop shifts instead of 9). Checked: live features equal the (0, 0)-shift calibration row exactly;
1,631 values per frame. In 1.1 the library's head-pose compensation is disabled, so predictions are
features . weights, as here.

Ours: calibration store (one entry per calibration dot or per-trial check dot; the study uses
`maxPoints: 500` and `clickTTL: 0`, so per-trial dots never expire; snapshot / restore), calibration data pooled
over the session (Saxena et al., 2024) with a fit budget of 140 frames (`FRAME_BUDGET`; every entry is thinned to
the same evenly spaced subset of its frames, so no target is dropped), `ridgeDual.ts` (same weights as the
library's primal ridge to ~1e-9; ~0.15 s for 400 rows, ~0.7 s for 900 rows, vs 3-5 s), drift offset, Kalman
smoothing (WebEyeTrack's `KalmanFilter2D`), blink = mean eyeBlink blendshape > 0.5, `origin` = translation column
of the raw facial transformation matrix (cm; RealEye 1.1 reads the column-major matrix as row-major, so its own
headPose.translation* are wrong and unused).

Regularization (since 2026-09-30): the ridge lambda is chosen per fit by leave-one-entry-out cross-validation
(`ridgeDualCV`) from `LAMBDA_REL` = 1e-5 ... 10 times the mean squared feature-row norm; the chosen value is logged
as `lambdaRel` (with the CV curve). The library's fixed lambda 1e-5 (`LAMBDA`) is used only when a fit has fewer
than 4 entries. Reason: with a near-zero lambda the pooled refits (1,050-1,320 rows vs 1,653 features) doubled the
fixation noise in pilots 3 and 4. In the 39-participant study CV picked lambdaRel 0.01-1 for almost every fit
(full calibrations mostly 0.01-0.1, per-trial refits 0.1-1).
