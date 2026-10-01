/**
 * Per-trial gaze plumbing shared by the Task 2 (phase1_gaze) and Task 3 (phase2_gaze) trials:
 *  - a quick drift check / fine-tune before the plot (while `active`), see below; calls onReady() when done
 *  - gaze recording from the click (start) until stop(), and the common part of the `gaze` answer
 * Before every plot (2026-09-30) three dots appear where the trial's plot centre, x label and y label will
 * be (taskLayout.ts), 1 s each (gaze arrives ~400 ms after onset; the last 500 ms are used). At each dot the
 * current error is measured and calibration frames are collected at the same time; then:
 *   mean error <= threshold (6 % of width)                  -> 'none'   (frames dropped)
 *   <= large (15 %) and the 3 errors share one direction    -> 'offset' (half the drift, mean gaze - target, is
 *                                                                        corrected; frames dropped)
 *   otherwise                                               -> 'refit'  (frames added to the pooled calibration
 *                                                                        and fitted on the "Calibrating…" screen,
 *                                                                        then the 3 dots are re-checked; if the mean
 *                                                                        is worse the snapshot is restored and half
 *                                                                        the drift is corrected instead)
 * Pilot 4: a full offset fixed the current dots (81 -> 51 px) but only helped the next trial 89 -> 79 px
 * (half: 77), and a centre-only re-check reverted a refit that the y-label dot had triggered.
 * "Recalibrate briefly" (RecalibrateButton) makes the next trial use 7 dots (3 + the 4 plot quadrants) and
 * always refit (tier 'user').
 * If the dots find the head >= HEAD_WARN_MM away from its calibration position, the trial pauses on a
 * "You moved your head" screen (headWarning; the trial renders it with HeadMovedPanel) and the dots are
 * repeated after Continue; logged as shortCalib.headWarning / checks.preBeforeWarning.
 * If the dots give no usable samples (face lost / eyes closed), the same pause is shown once ("We lost your face";
 * shortCalib.noFaceWarning) and the dots are repeated.
 * After a page reload the tracker has no model: the trial first asks for and runs the 15-dot calibration
 * (shortCalib.reloadCalibration), so the remaining trials are not recorded uncalibrated.
 * Head shift is compared in lens-corrected mm (x distanceScale), the same scale as the on-screen guide.
 * Samples: [t_ms_since_click, x_px, y_px, open01, raw_x_px, raw_y_px, face_x_mm, face_y_mm, face_z_mm]
 * (x/y Kalman-smoothed, raw unsmoothed; face_* = 3D face origin in the camera frame, z = distance).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { gazeTracker, normToPx, headShiftMm } from "./gazeTracker";
import { FULL_GRID, meanPose, useDotSequence } from "./CalibrationOverlay";
import { fullscreenStats } from "./FullScreen";
import { useHeadTrace } from "./headTrace";
import { taskCalibPoints, taskPoint, trialCheckPoints } from "./taskLayout";

export const HEAD_WARN_MM = 40;

const round2 = (v) => (v ? [Math.round(v[0]), Math.round(v[1])] : null);

export function useTrialGaze({ active, onReady, view }) {
  const headLog = useHeadTrace(view);
  const [headWarning, setHeadWarning] = useState(false);   // false | "moved" | "noFace"
  const [setupNeeded, setSetupNeeded] = useState(false);
  const resumeRef = useRef(null);
  const resume = useCallback(() => { resumeRef.current?.(); }, []);
  const seq = useDotSequence();
  const { runTaskCheck, runValidation, fitPending, runCalibration, setMessage } = seq;
  const fsExitsAtMount = useRef(fullscreenStats.exits);
  const shortCalibRef = useRef(null);
  const samplesRef = useRef([]);
  const startAtRef = useRef(null);
  const unsubRef = useRef(null);
  const hiddenEventsRef = useRef([]);
  const started = useRef(false);
  const mountedRef = useRef(true);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ---- drift check / fine-tune before the trial ----
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    (async () => {
      const fullCalibPresent = !!gazeTracker.fullCalib;
      const userRequested = gazeTracker.userRecalRequested;
      gazeTracker.userRecalRequested = false;
      const thresholdPx = Math.round(0.06 * window.innerWidth);
      const largePx = Math.round(0.15 * window.innerWidth);
      const prevErrorPx = gazeTracker.lastTrialErrorPx ?? null;
      const points = userRequested
        ? [...trialCheckPoints(), ...["q1", "q2", "q3", "q4"].map(taskPoint)]
        : trialCheckPoints();
      const result = {
        method: "task3", points: points.map((p) => [Math.round(p.nx * 1e4) / 1e4, Math.round(p.ny * 1e4) / 1e4, p.target]),
        preErrorPx: null, preOffsetPx: null, spreadPx: null, postErrorPx: null, fallbackErrorPx: null, errorPx: null, n: 0,
        tier: "none", dots: points.length, reverted: false, thresholdPx, largePx, prevErrorPx, userRequested,
        offsetBeforePx: null, offsetPx: null, fitMs: null, error: null,
        // every check with per-dot errors / traces, head pose (mean over the dots) and its distance (mm) from
        // the head pose during the full calibration's validation
        checks: {}, head: null, headShiftMm: null, calibHead: gazeTracker.calibHead ?? null, headWarning: false,
      };
      const msg = "Look at each dot. Keep your head still.";
      const DWELL = 1000;
      const COLLECT = 500;
      const GAIN = 0.5;   // share of the measured drift corrected by the offset
      let snapshotTaken = false;
      const pause = async (kind) => {
        setHeadWarning(kind);
        await new Promise((r) => { resumeRef.current = r; });
        resumeRef.current = null;
        setHeadWarning(false);
      };
      try {
        setMessage("Starting the camera…");
        await gazeTracker.init();
        setMessage("");
        if (!gazeTracker.calibrated) {
          // page reloaded (or no calibration succeeded): calibrate before measuring anything
          setSetupNeeded(true);
          await new Promise((r) => { resumeRef.current = r; });
          resumeRef.current = null;
          setSetupNeeded(false);
          const calib = await runCalibration([...FULL_GRID, ...taskCalibPoints()], "calib", 1800, 1000);
          const last = calib[calib.length - 1];
          result.reloadCalibration = { dots: calib.length, fitMs: last?.fitMs ?? null, calibrated: gazeTracker.calibrated };
          gazeTracker.calibHead = meanPose(calib) ?? gazeTracker.calibHead;
        }
        const off0 = gazeTracker.offsetPx;
        result.offsetBeforePx = round2(off0);
        // snapshot first: restoring it drops the frames collected at the dots (and any refit / offset)
        await gazeTracker.snapshotCalibration();
        snapshotTaken = true;
        // head shift in lens-corrected mm (raw MediaPipe origin x distanceScale), as in the position guide
        const shiftOf = (check) => {
          const raw = headShiftMm(meanPose(check.points), gazeTracker.calibHead);
          return raw === null ? null : Math.round(raw * gazeTracker.distanceScale);
        };
        let pre = await runTaskCheck(points, DWELL, COLLECT, msg);
        let shift = shiftOf(pre);
        if (shift !== null && shift >= HEAD_WARN_MM) {
          // Clear warning, back to the calibration position, then the dots again
          await gazeTracker.restoreCalibration();
          result.headWarning = true;
          result.checks.preBeforeWarning = pre;
          result.headShiftBeforeWarningMm = shift;
          await pause("moved");
          await gazeTracker.snapshotCalibration();
          pre = await runTaskCheck(points, DWELL, COLLECT, msg);
          shift = shiftOf(pre);
        }
        if (pre.meanErrorPx === null) {
          // no usable samples at any dot (face lost, eyes closed): ask once, then repeat the dots
          await gazeTracker.restoreCalibration();
          result.noFaceWarning = true;
          result.checks.preBeforeNoFace = pre;
          await pause("noFace");
          await gazeTracker.snapshotCalibration();
          pre = await runTaskCheck(points, DWELL, COLLECT, msg);
          shift = shiftOf(pre);
        }
        result.checks.pre = pre;
        result.head = meanPose(pre.points);
        result.headShiftMm = shift;
        result.preErrorPx = pre.meanErrorPx;
        result.preOffsetPx = round2(pre.meanOffsetPx);
        result.n = pre.points.reduce((a, p) => a + (p.n ?? 0), 0);
        // how much the per-dot errors disagree in direction (mean distance from the common drift vector)
        const offs = pre.points.map((p) => p.offsetPx).filter(Boolean);
        if (pre.meanOffsetPx && offs.length) {
          result.spreadPx = Math.round(offs.reduce((a, o) => a + Math.hypot(o[0] - pre.meanOffsetPx[0], o[1] - pre.meanOffsetPx[1]), 0) / offs.length);
        }
        const driftFixed = pre.meanOffsetPx ? [off0[0] - GAIN * pre.meanOffsetPx[0], off0[1] - GAIN * pre.meanOffsetPx[1]] : null;
        result.gain = GAIN;

        if (!userRequested && (pre.meanErrorPx === null || pre.meanErrorPx <= thresholdPx)) {
          result.tier = "none";
          await gazeTracker.restoreCalibration();
        } else if (!userRequested && pre.meanErrorPx <= largePx && driftFixed && result.spreadPx !== null && result.spreadPx <= thresholdPx) {
          result.tier = "offset";
          await gazeTracker.restoreCalibration();
          await gazeTracker.setOffsetPx(driftFixed[0], driftFixed[1]);
        } else {
          result.tier = userRequested ? "user" : "refit";
          // The refit maps raw predictions straight onto the targets, so the old drift offset must not be
          // applied on top of it (the snapshot keeps it for a revert).
          await gazeTracker.setOffsetPx(0, 0);
          const fit = await fitPending();
          result.fitMs = fit.fitMs;
          result.lambdaRel = fit.lambdaRel ?? null;
          result.calib = pre.calib;
          // re-check the same 3 dots (the one that triggered the refit may be a label)
          const post = await runValidation(trialCheckPoints(), DWELL, COLLECT, msg);
          result.checks.post = post;
          result.postErrorPx = post.meanErrorPx;
          // compare on the same 3 dots (a user-requested check has 7)
          const pre3 = pre.points.slice(0, 3).map((p) => p.errorPx).filter((e) => e !== null);
          const base = pre3.length ? pre3.reduce((a, e) => a + e, 0) / pre3.length : null;
          if (post.meanErrorPx === null || (base !== null && post.meanErrorPx > base)) {
            await gazeTracker.restoreCalibration();
            result.reverted = true;
            if (driftFixed) await gazeTracker.setOffsetPx(driftFixed[0], driftFixed[1]);
          }
        }
        // Error kept for this trial: the 3-dot re-check after a kept refit, else the dots' mean error before any fix
        result.errorPx = (result.tier === "refit" || result.tier === "user") && !result.reverted ? result.postErrorPx : pre.meanErrorPx;
        result.offsetPx = round2(gazeTracker.offsetPx);
        gazeTracker.lastTrialErrorPx = result.errorPx;
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
        // leave the calibration as it was before this check (no half-applied refit / lost drift offset)
        if (snapshotTaken) await gazeTracker.restoreCalibration().catch(() => undefined);
      }
      shortCalibRef.current = { ...result, fullCalibPresent, hz: Math.round(gazeTracker.hz * 10) / 10 };
      if (mountedRef.current) onReadyRef.current?.();
    })();
  }, [active, runTaskCheck, runValidation, fitPending, runCalibration, setMessage]);

  const stop = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
  }, []);

  /** Start recording (at the click); returns the start time (performance.now). */
  const start = useCallback(() => {
    const startAt = performance.now();
    startAtRef.current = startAt;
    samplesRef.current = [];
    stop();
    unsubRef.current = gazeTracker.onSample((s) => {
      const [x, y] = normToPx(s.nx, s.ny);
      const [rx, ry] = normToPx(s.rx, s.ry);
      const o = s.origin && s.origin.length === 3 ? s.origin.map((v) => Math.round(v * 10)) : [null, null, null];
      samplesRef.current.push([Math.round(s.t - startAt), Math.round(x), Math.round(y), s.open && s.face ? 1 : 0, Math.round(rx), Math.round(ry), ...o]);
    });
    return startAt;
  }, [stop]);

  // Note tab switches during the trial; stop on unmount
  useEffect(() => {
    const onVis = () => hiddenEventsRef.current.push([Math.round(performance.now() - (startAtRef.current ?? performance.now())), document.hidden ? 1 : 0]);
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); stop(); };
  }, [stop]);

  /** Common fields of the `gaze` answer. */
  const payload = useCallback(() => {
    const startAt = startAtRef.current;
    const samples = samplesRef.current;
    const durationMs = samples.length ? samples[samples.length - 1][0] : 0;
    return {
      startAt: startAt === null ? null : Math.round(Date.now() - (performance.now() - startAt)),
      durationMs,
      shortCalib: shortCalibRef.current,
      fullCalib: gazeTracker.fullCalib ?? null,
      midCalib: gazeTracker.midCalib ?? null,
      device: gazeTracker.device,
      hz: samples.length > 1 ? Math.round((samples.length - 1) * 1000 / Math.max(1, durationMs) * 10) / 10 : 0,
      hidden: hiddenEventsRef.current,
      // full-screen exits on this page (the plot keeps running behind the "return to full screen" screen)
      fullscreenExits: fullscreenStats.exits - fsExitsAtMount.current,
      fullscreenNow: !!document.fullscreenElement,
      frameErrors: gazeTracker.frameErrors,
      cameraLostCount: gazeTracker.cameraLostCount,
      userRecalCount: gazeTracker.userRecalCount,
      ...headLog(),
      samples,
    };
  }, [headLog]);

  return {
    ...seq, start, stop, payload, startAtRef, headWarning, resume, setupNeeded,
  };
}
