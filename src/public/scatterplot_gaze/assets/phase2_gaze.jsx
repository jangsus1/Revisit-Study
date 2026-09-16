import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback } from "react";
import React from "react";
import { NormalSlider } from "./Slider";
import { gazeTracker, normToPx } from "./gazeTracker";
import { CalibrationOverlay, shortCalibPoints, useDotSequence } from "./CalibrationOverlay";

// Copy of scatterplot/assets/phase2.jsx with (1) a short 3-dot + validation-dot calibration
// before the plot and (2) a gaze trace recorded from click-to-start until the slider appears.
function Phase2Gaze({ parameters, setAnswer }) {

  // Plot margins - same as phase1 to ensure identical plot area
  const plotMargin = React.useMemo(() => ({ top: 40, right: 40, bottom: 60, left: 60 }), []);
  const labelSpace = React.useMemo(() => ({ left: 110, right: 0, top: 0, bottom: 0 }), []);
  const margin = React.useMemo(() => ({
    top: plotMargin.top + labelSpace.top,
    right: plotMargin.right + labelSpace.right,
    bottom: plotMargin.bottom + labelSpace.bottom,
    left: plotMargin.left + labelSpace.left
  }), [plotMargin, labelSpace]);

  const dotPadding = 10;
  const fixedSize = { width: 600 + 110, height: 600 };

  const ref = useRef(null);
  const { coordinates, example, seconds, label_seconds, correlation, label, X, Y, label_idx } = parameters;
  const [view, setView] = useState("shortcalib"); // shortcalib, scatter, corrafter
  const [corrAfter, setCorrAfter] = useState(0);
  const [hasClicked, setHasClicked] = useState(false);
  const [isBlurred, setIsBlurred] = useState(true);
  const [labelsVisible, setLabelsVisible] = useState(false);

  // ---- gaze bookkeeping (refs so the render loop never re-runs because of them) ----
  const { dot, collecting, message, setMessage, runCalibration, runValidation } = useDotSequence();
  const shortCalibRef = useRef(null);
  const samplesRef = useRef([]);
  const startAtRef = useRef(null);
  const labelRevealAtRef = useRef(null);
  const unsubRef = useRef(null);
  const geometryRef = useRef(null);
  const hiddenEventsRef = useRef([]);
  const calibStarted = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);

  // ---- short calibration before the trial ----
  useEffect(() => {
    if (view !== "shortcalib" || calibStarted.current) return;
    calibStarted.current = true;
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
      const thresholdPx = Math.round(0.06 * window.innerWidth);
      const largePx = Math.round(0.15 * window.innerWidth);
      const prevErrorPx = gazeTracker.lastTrialErrorPx ?? null;
      const result = {
        preErrorPx: null, preOffsetPx: null, postErrorPx: null, fallbackErrorPx: null, errorPx: null, n: 0,
        tier: "none", dots: 0, reverted: false, thresholdPx, largePx, prevErrorPx,
        offsetBeforePx: null, offsetPx: null, calib: [], error: null,
      };
      const check = (label) => runValidation([{ nx: 0, ny: 0 }], 1300, 700, label);
      try {
        await gazeTracker.init();
        const off0 = gazeTracker.offsetPx;
        result.offsetBeforePx = [Math.round(off0[0]), Math.round(off0[1])];
        const pre = await check("Look at the centre dot");
        result.preErrorPx = pre.meanErrorPx;
        result.preOffsetPx = pre.meanOffsetPx ? [Math.round(pre.meanOffsetPx[0]), Math.round(pre.meanOffsetPx[1])] : null;
        result.n = pre.points[0]?.n ?? 0;
        // Offset that cancels the measured drift (gaze - target) on top of the current one
        const driftFixed = pre.meanOffsetPx ? [off0[0] - pre.meanOffsetPx[0], off0[1] - pre.meanOffsetPx[1]] : null;
        const worse = (post, base) => post.meanErrorPx === null || post.meanErrorPx > base;

        if (pre.meanErrorPx !== null && pre.meanErrorPx > thresholdPx) {
          if (pre.meanErrorPx <= largePx && driftFixed) {
            result.tier = "offset";
            await gazeTracker.setOffsetPx(driftFixed[0], driftFixed[1]);
            const post = await check("Look at the centre dot");
            result.postErrorPx = post.meanErrorPx;
            if (worse(post, pre.meanErrorPx)) {
              await gazeTracker.setOffsetPx(off0[0], off0[1]);
              result.reverted = true;
            }
          } else {
            const worsening = prevErrorPx !== null && pre.meanErrorPx > prevErrorPx;
            result.tier = worsening ? "strong" : "light";
            result.dots = worsening ? 5 : 3;
            await gazeTracker.snapshotCalibration();
            // The refit maps raw predictions straight onto the targets, so the old drift offset
            // must not be applied on top of it (the snapshot keeps it for a revert).
            await gazeTracker.setOffsetPx(0, 0);
            setMessage("Quick calibration: look at each dot");
            result.calib = await runCalibration(shortCalibPoints(label_idx ?? 0, result.dots), "click", 1300, 800);
            const post = await check("Look at the centre dot");
            result.postErrorPx = post.meanErrorPx;
            if (worse(post, pre.meanErrorPx)) {
              await gazeTracker.restoreCalibration();
              result.reverted = true;
              if (driftFixed) {
                // Fallback: plain drift correction from the pre-check
                await gazeTracker.setOffsetPx(driftFixed[0], driftFixed[1]);
                const post2 = await check("Look at the centre dot");
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
      if (mountedRef.current) setView("scatter");
    })();
  }, [view, label_idx, runCalibration, runValidation, setMessage]);

  const stopRecording = useCallback(() => {
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null; }
  }, []);

  // Reset state when entering scatter view
  useEffect(() => {
    if (view === "scatter") {
      setIsBlurred(true);
      setHasClicked(false);
      setLabelsVisible(false);
    }
  }, [view]);

  // Handle label visibility based on label_seconds
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    if (label_seconds === undefined || label_seconds === null) return;

    if (label_seconds === 0) {
      setLabelsVisible(true);
      labelRevealAtRef.current = 0;
      return;
    }
    if (label_seconds >= seconds) {
      setLabelsVisible(false);
      return;
    }
    const timer = setTimeout(() => {
      setLabelsVisible(true);
      labelRevealAtRef.current = Math.round(performance.now() - startAtRef.current);
    }, label_seconds * 1000);
    return () => clearTimeout(timer);
  }, [view, hasClicked, label_seconds, seconds]);

  // Timer to change view after seconds when in scatter view
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    const timer = setTimeout(() => {
      stopRecording();
      setView("corrafter");
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [view, hasClicked, seconds, stopRecording]);

  // Note tab switches during the trial; stop on unmount
  useEffect(() => {
    const onVis = () => hiddenEventsRef.current.push([Math.round(performance.now() - (startAtRef.current ?? performance.now())), document.hidden ? 1 : 0]);
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); stopRecording(); };
  }, [stopRecording]);

  // Capture the geometry needed to map gaze samples to areas of interest (viewport px)
  const captureGeometry = useCallback(() => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    const rect = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)];
    };
    geometryRef.current = {
      plotRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      plotArea: [Math.round(r.left + margin.left), Math.round(r.top + margin.top), Math.round(plotWidth), Math.round(plotHeight)],
      labelRects: { x: rect(svg.querySelector('.x-label')), y: rect(svg.querySelector('.y-label')) },
      viewport: [window.innerWidth, window.innerHeight],
      // Browser window placement on the physical screen: a change since calibration means the
      // calibration frame moved relative to the camera and the trial should be flagged.
      windowPos: [window.screenX, window.screenY, window.outerWidth, window.outerHeight],
      screen: [window.screen.width, window.screen.height],
      dpr: window.devicePixelRatio,
      scroll: [Math.round(window.scrollX), Math.round(window.scrollY)],
    };
  }, [margin, plotWidth, plotHeight]);

  // Answer callback - called when the slider is touched
  const answerCallback = useCallback((newCorrAfter) => {
    const startAt = startAtRef.current;
    const samples = samplesRef.current;
    const durationMs = samples.length ? samples[samples.length - 1][0] : 0;
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          corrAfter: newCorrAfter,
        }),
        gaze: JSON.stringify({
          startAt: startAt === null ? null : Math.round(Date.now() - (performance.now() - startAt)),
          labelRevealAt: labelRevealAtRef.current,
          seconds,
          labelSeconds: label_seconds,
          durationMs,
          ...(geometryRef.current ?? {}),
          shortCalib: shortCalibRef.current,
          fullCalib: gazeTracker.fullCalib ?? null,
          hz: samples.length > 1 ? Math.round((samples.length - 1) * 1000 / Math.max(1, durationMs) * 10) / 10 : 0,
          hidden: hiddenEventsRef.current,
          // [t_ms_since_click, x_px, y_px, open(1/0), raw_x_px, raw_y_px] in viewport pixels
          samples,
        }),
      }
    });
    setCorrAfter(newCorrAfter);
  }, [setAnswer, correlation, seconds, label_seconds]);

  // Draw scatterplot with D3 - only when view changes or coordinates change
  useEffect(() => {
    if (view !== "scatter") return;
    if (!ref.current || !coordinates || coordinates.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr('width', fixedSize.width).attr('height', fixedSize.height);

    const xAxis = d3.axisBottom(xScale).tickSize(0).tickFormat(() => '');
    const yAxis = d3.axisLeft(yScale).tickSize(0).tickFormat(() => '');

    svg.append('g')
      .attr('transform', `translate(0, ${fixedSize.height - margin.bottom})`)
      .call(xAxis)
      .selectAll('path')
      .style('stroke', '#000')
      .style('stroke-width', 2);

    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yAxis)
      .selectAll('path')
      .style('stroke', '#000')
      .style('stroke-width', 2);

    const xAxisCenter = margin.left + plotWidth / 2;
    svg.append('text')
      .attr('class', 'x-label')
      .attr('x', xAxisCenter)
      .attr('y', fixedSize.height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .text(X)
      .style('filter', 'blur(50px)')
      .style('transition', 'filter 0.1s');

    const yLabelWidth = 150;
    const yLabelHeight = Math.abs(yScale.range()[1] - yScale.range()[0]);
    const yLabelPadding = 5;
    const yLabelGroup = svg.append('g').attr('class', 'y-label-group');
    const yAxisCenter = margin.top + plotHeight / 2;
    const foreignObject = yLabelGroup.append('foreignObject')
      .attr('x', margin.left - yLabelWidth - yLabelPadding)
      .attr('y', yAxisCenter - yLabelHeight / 2)
      .attr('width', yLabelWidth)
      .attr('height', yLabelHeight);
    foreignObject.html(`
      <div xmlns="http://www.w3.org/1999/xhtml" class="y-label" style="
        width: ${yLabelWidth}px;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: bold;
        text-align: center;
        word-wrap: break-word;
        overflow-wrap: break-word;
        filter: blur(50px);
        transition: filter 0.1s;
      ">${Y}</div>
    `);

    const plotLeft = margin.left;
    const plotRight = fixedSize.width - margin.right;
    const plotTop = margin.top;
    const plotBottom = fixedSize.height - margin.bottom;
    svg.append('line').attr('x1', plotLeft).attr('y1', plotTop).attr('x2', plotLeft).attr('y2', plotBottom)
      .style('stroke', '#000').style('stroke-width', 2);
    svg.append('line').attr('x1', plotLeft).attr('y1', plotBottom).attr('x2', plotRight).attr('y2', plotBottom)
      .style('stroke', '#000').style('stroke-width', 2);

    svg.selectAll('.dot')
      .data(coordinates)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d[0]))
      .attr('cy', d => yScale(d[1]))
      .attr('r', 3)
      .attr('fill', 'black');

  }, [view, coordinates, xScale, yScale, fixedSize, margin, X, Y]);

  // Label blur toggle
  useEffect(() => {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    const shouldBlur = isBlurred || !labelsVisible;
    const filterValue = shouldBlur ? 'blur(50px)' : 'none';
    svg.select('.x-label').style('filter', filterValue);
    const yLabelDiv = svg.select('.y-label-group foreignObject').node();
    if (yLabelDiv) {
      const div = yLabelDiv.querySelector('.y-label');
      if (div) div.style.filter = filterValue;
    }
  }, [isBlurred, labelsVisible]);

  // Handle click to remove blur and start recording gaze
  const handleClick = useCallback(() => {
    if (hasClicked) return;
    setIsBlurred(false);
    setHasClicked(true);
    const startAt = performance.now();
    startAtRef.current = startAt;
    samplesRef.current = [];
    labelRevealAtRef.current = null;
    captureGeometry();
    stopRecording();
    unsubRef.current = gazeTracker.onSample((s) => {
      const [x, y] = normToPx(s.nx, s.ny);
      const [rx, ry] = normToPx(s.rx, s.ry);
      // [t_ms, x_px, y_px, open01, raw_x_px, raw_y_px] — x/y are Kalman-smoothed, raw is affine-only
      samplesRef.current.push([Math.round(s.t - startAt), Math.round(x), Math.round(y), s.open && s.face ? 1 : 0, Math.round(rx), Math.round(ry)]);
    });
  }, [hasClicked, captureGeometry, stopRecording]);

  return (
    <div>
      {example && view !== "scatter" && (
        <h1 style={{ color: "red" }}>Example Question</h1>
      )}
      {view === "shortcalib" && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} />
      )}
      {view === "scatter" && (
        // Full-viewport, plain white screen: hides the platform header, progress bar and Next
        // button so nothing but the plot competes for gaze. Same frame as the calibration dots.
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000, background: "#ffffff",
          display: "flex", justifyContent: "center", alignItems: "center", cursor: isBlurred ? "pointer" : "none"
        }}>
          {example && (
            <h1 style={{ color: "red", position: "absolute", top: 16, left: 24, margin: 0, fontSize: 22 }}>Example Question</h1>
          )}
          <div style={{ display: 'inline-block', position: 'relative' }}>
            <svg
              id="clickAccuracySvg"
              ref={ref}
              width={fixedSize.width}
              height={fixedSize.height}
              style={{
                display: 'block',
                filter: isBlurred ? 'blur(50px)' : 'none',
                transition: 'filter 0.1s',
                cursor: isBlurred ? 'pointer' : 'default'
              }}
              onClick={handleClick}
            />
            {isBlurred && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: '#666',
                  zIndex: 10,
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}
              >
                You have 5~10 seconds to estimate the correlation. <br />  Click to start!
              </div>
            )}
          </div>
        </div>
      )}

      {view === "corrafter" && (
        <div style={{ width: '50%', margin: '50px auto', textAlign: 'center' }}>
          <h3>Estimate the correlation of the scatterplot you saw.</h3>
          <NormalSlider
            value={corrAfter}
            setValue={answerCallback}
            min={0}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
        </div>
      )}
    </div>
  );
}

export default Phase2Gaze;
