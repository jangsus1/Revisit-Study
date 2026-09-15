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
      let fullCalibPresent = !!gazeTracker.fullCalib;
      let result = { errorPx: null, n: 0, calib: [], error: null };
      try {
        await gazeTracker.init();
        setMessage("Quick calibration: look at each dot");
        result.calib = await runCalibration(shortCalibPoints(label_idx ?? 0), "click", 1500, 900);
        const v = await runValidation([{ nx: 0, ny: 0 }], 1400, 800, "Look at the centre dot");
        result.errorPx = v.meanErrorPx;
        result.n = v.points[0]?.n ?? 0;
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
          // [t_ms_since_click, x_px, y_px, open(1/0)] in viewport pixels
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
      samplesRef.current.push([Math.round(s.t - startAt), Math.round(x), Math.round(y), s.open && s.face ? 1 : 0]);
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
