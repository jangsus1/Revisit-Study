/**
 * Per-trial gaze plumbing shared by the Task 2 (phase1_gaze) and Task 3 (phase2_gaze) trials:
 *  - a test-first short calibration before the plot (while `active`): centre check -> nothing / drift offset /
 *    3-5 dots, each step re-checked and reverted if worse; calls onReady() when done
 *  - gaze recording from the click (start) until stop(), and the common part of the `gaze` answer
 * If the pre-check finds the head >= HEAD_WARN_MM away from its calibration position, the trial pauses on a
 * "You moved your head" screen (headWarning; the trial renders it with HeadMovedPanel) and the centre check
 * is repeated after Continue; logged as shortCalib.headWarning / checks.preBeforeWarning.
 * Samples: [t_ms_since_click, x_px, y_px, open01, raw_x_px, raw_y_px, face_x_mm, face_y_mm, face_z_mm]
 * (x/y Kalman-smoothed, raw unsmoothed; face_* = 3D face origin in the camera frame, z = distance).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { gazeTracker, normToPx, headShiftMm } from "./gazeTracker";
import { shortCalibPoints, useDotSequence } from "./CalibrationOverlay";
import { useHeadTrace } from "./headTrace";

export const HEAD_WARN_MM = 40;


export function useTrialGaze({ active, calibIndex, onReady, view }) {
  const headLog = useHeadTrace(view);
  const [headWarning, setHeadWarning] = useState(false);
  const resumeRef = useRef(null);
  const resume = useCallback(() => { resumeRef.current?.(); }, []);
  const seq = useDotSequence();
  const { runCalibration, runValidation, setMessage } = seq;
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

  // ---- short calibration before the trial ----
  useEffect(() => {
    if (!active || started.current) return;
    started.current = true;
    (async () => {
      // Test-first, tiered calibration:
      //   1. one centre validation dot measures the current error and its direction (~1.3 s)
      //   2. error <= threshold (6 % of width)        -> nothing, start the trial
      //      error <= large (15 % of width)           -> 'offset': shift every estimate by the measured
      //                                                  drift vector (no dots), then re-check
      //      error >  large                           -> dots: 3 ('light') or 5 ('strong' when the error
      //                                                  also grew since the previous trial), then re-check
      //   3. any step whose re-check is worse than the pre-check is reverted (offset put back /
      //      calibration state restored from a snapshot), and the drift offset is tried as a fallback
      const fullCalibPresent = !!gazeTracker.fullCalib;
      // "My head moved - recalibrate" pressed on an earlier screen: 5 dots whatever the error is
      const userRequested = gazeTracker.userRecalRequested;
      gazeTracker.userRecalRequested = false;
      const thresholdPx = Math.round(0.06 * window.innerWidth);
      const largePx = Math.round(0.15 * window.innerWidth);
      const prevErrorPx = gazeTracker.lastTrialErrorPx ?? null;
      const result = {
        preErrorPx: null, preOffsetPx: null, postErrorPx: null, fallbackErrorPx: null, errorPx: null, n: 0,
        tier: "none", dots: 0, reverted: false, thresholdPx, largePx, prevErrorPx,
        offsetBeforePx: null, offsetPx: null, calib: [], error: null,
        // pilot diagnostics: every centre check with per-sample traces, head pose at the pre-check and
        // its distance (mm) from the head pose during the full calibration's validation
        checks: {}, head: null, headShiftMm: null, calibHead: gazeTracker.calibHead ?? null,
      };
      const check = (label) => runValidation([{ nx: 0, ny: 0 }], 1300, 700, label);
      try {
        await gazeTracker.init();
        const off0 = gazeTracker.offsetPx;
        result.offsetBeforePx = [Math.round(off0[0]), Math.round(off0[1])];
        let pre = await check("Look at the centre dot. Keep your head still.");
        let shift = headShiftMm(pre.points[0]?.pose ?? null, gazeTracker.calibHead);
        result.headWarning = false;
        if (shift !== null && shift >= HEAD_WARN_MM) {
          // Clear warning, back to the calibration position, then measure again
          result.headWarning = true;
          result.checks.preBeforeWarning = pre;
          result.headShiftBeforeWarningMm = shift;
          setHeadWarning(true);
          await new Promise((r) => { resumeRef.current = r; });
          resumeRef.current = null;
          setHeadWarning(false);
          pre = await check("Look at the centre dot. Keep your head still.");
          shift = headShiftMm(pre.points[0]?.pose ?? null, gazeTracker.calibHead);
        }
        result.checks.pre = pre;
        result.head = pre.points[0]?.pose ?? null;
        result.headShiftMm = shift;
        result.preErrorPx = pre.meanErrorPx;
        result.preOffsetPx = pre.meanOffsetPx ? [Math.round(pre.meanOffsetPx[0]), Math.round(pre.meanOffsetPx[1])] : null;
        result.n = pre.points[0]?.n ?? 0;
        // Offset that cancels the measured drift (gaze - target) on top of the current one
        const driftFixed = pre.meanOffsetPx ? [off0[0] - pre.meanOffsetPx[0], off0[1] - pre.meanOffsetPx[1]] : null;
        const worse = (post, base) => post.meanErrorPx === null || (base !== null && post.meanErrorPx > base);

        result.userRequested = userRequested;
        if (userRequested || (pre.meanErrorPx !== null && pre.meanErrorPx > thresholdPx)) {
          if (!userRequested && pre.meanErrorPx <= largePx && driftFixed) {
            result.tier = "offset";
            await gazeTracker.setOffsetPx(driftFixed[0], driftFixed[1]);
            const post = await check("Look at the centre dot. Keep your head still.");
            result.checks.post = post;
            result.postErrorPx = post.meanErrorPx;
            if (worse(post, pre.meanErrorPx)) {
              await gazeTracker.setOffsetPx(off0[0], off0[1]);
              result.reverted = true;
            }
          } else {
            const worsening = prevErrorPx !== null && pre.meanErrorPx > prevErrorPx;
            result.tier = userRequested ? "user" : worsening ? "strong" : "light";
            result.dots = userRequested || worsening ? 5 : 3;
            await gazeTracker.snapshotCalibration();
            // The refit maps raw predictions straight onto the targets, so the old drift offset
            // must not be applied on top of it (the snapshot keeps it for a revert).
            await gazeTracker.setOffsetPx(0, 0);
            setMessage("Quick calibration: look at each dot. Keep your head still.");
            result.calib = await runCalibration(shortCalibPoints(calibIndex ?? 0, result.dots), "click", 1300, 800);
            const post = await check("Look at the centre dot. Keep your head still.");
            result.checks.post = post;
            result.postErrorPx = post.meanErrorPx;
            if (worse(post, pre.meanErrorPx)) {
              await gazeTracker.restoreCalibration();
              result.reverted = true;
              if (driftFixed) {
                // Fallback: plain drift correction from the pre-check
                await gazeTracker.setOffsetPx(driftFixed[0], driftFixed[1]);
                const post2 = await check("Look at the centre dot. Keep your head still.");
                result.checks.fallback = post2;
                result.fallbackErrorPx = post2.meanErrorPx;
                if (worse(post2, pre.meanErrorPx)) await gazeTracker.setOffsetPx(off0[0], off0[1]);
              }
            }
          }
        }
        // Final accepted error: the last check that was kept
        result.errorPx = result.reverted
          ? (result.fallbackErrorPx !== null && result.fallbackErrorPx <= result.preErrorPx ? result.fallbackErrorPx : result.preErrorPx)
          : (result.postErrorPx ?? result.preErrorPx);
        const offF = gazeTracker.offsetPx;
        result.offsetPx = [Math.round(offF[0]), Math.round(offF[1])];
        gazeTracker.lastTrialErrorPx = result.errorPx;
      } catch (err) {
        result.error = err instanceof Error ? err.message : String(err);
      }
      shortCalibRef.current = { ...result, fullCalibPresent, hz: Math.round(gazeTracker.hz * 10) / 10 };
      if (mountedRef.current) onReadyRef.current?.();
    })();
  }, [active, calibIndex, runCalibration, runValidation, setMessage]);

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
      ...headLog(),
      samples,
    };
  }, [headLog]);

  return {
    ...seq, start, stop, payload, startAtRef, headWarning, resume,
  };
}
