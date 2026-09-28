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

Ours: calibration store (entry per dot / pursuit chunk, 'click' entries expire after 90 s, max 25 entries,
snapshot / restore), `ridgeDual.ts` (same weights as the library's primal ridge to ~1e-9; ~0.15 s for 400
rows, ~0.7 s for 900 rows, vs 3-5 s), lambda 1e-5, drift offset, Kalman smoothing (WebEyeTrack's
`KalmanFilter2D`), blink = mean eyeBlink blendshape > 0.5, `origin` = translation column of the raw facial transformation matrix (cm; RealEye 1.1 reads the column-major matrix as row-major, so its own headPose.translation* are wrong and unused).
