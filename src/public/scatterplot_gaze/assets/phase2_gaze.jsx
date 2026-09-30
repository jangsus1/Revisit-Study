import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback } from "react";
import React from "react";
import { NormalSlider } from "./Slider";
import { CalibrationOverlay } from "./CalibrationOverlay";
import { useTrialGaze } from "./trialGaze";
import HeadMovedPanel, { RecalibrateButton } from "./HeadMovedPanel";
import { FullscreenGate, Panel } from "./FullScreen";
import { Button } from "@mantine/core";
import { usePlotScale } from "./plotScale";

// Trial of the timing design (labels visible during [label_start, label_end) seconds after the click,
// plot shown for `seconds`; label_start = label_end = seconds means never shown) with (1) a test-first
// short calibration before the plot and (2) a gaze trace recorded from click-to-start until the slider.
// Falls back to the old `label_seconds` semantics (reveal at s, keep) when label_start is absent.
function Phase2Gaze({ parameters, setAnswer, advance }) {

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
  // Shown larger than the 600-px design size (viewBox); the trial screen is a full-window overlay
  const scale = usePlotScale(fixedSize.width, fixedSize.height, 40, 40);

  const ref = useRef(null);
  const { coordinates, example, seconds, label_seconds, label_start, label_end, correlation, label, X, Y, label_idx } = parameters;
  // Label window in seconds after the click; hide time >= seconds means "until the plot disappears"
  const showAt = label_start ?? label_seconds;
  const hideAt = label_start !== undefined && label_start !== null ? label_end : seconds;
  const [view, setView] = useState("shortcalib"); // shortcalib, scatter, corrafter
  const [corrAfter, setCorrAfter] = useState(0);
  const [touched, setTouched] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);
  const [isBlurred, setIsBlurred] = useState(true);
  const [labelsVisible, setLabelsVisible] = useState(false);

  // ---- gaze: short calibration before the plot, recording from the click (see trialGaze.jsx) ----
  const tg = useTrialGaze({ active: view === "shortcalib", calibIndex: label_idx, onReady: () => setView("scatter"), view });
  const { dot, collecting, message, fitting } = tg;
  const labelRevealAtRef = useRef(null);
  const labelHideAtRef = useRef(null);
  const geometryRef = useRef(null);

  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);



  // Reset state when entering scatter view
  useEffect(() => {
    if (view === "scatter") {
      setIsBlurred(true);
      setHasClicked(false);
      setLabelsVisible(false);
    }
  }, [view]);

  // Label visibility: shown during [showAt, hideAt) seconds after the click (timers are measured
  // from the click time, not from when this effect runs)
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    if (showAt === undefined || showAt === null) return;
    if (showAt >= seconds || hideAt <= showAt) {
      setLabelsVisible(false);
      return;
    }
    const since = () => performance.now() - tg.startAtRef.current;
    const timers = [];
    const show = () => {
      setLabelsVisible(true);
      labelRevealAtRef.current = Math.round(since());
    };
    if (showAt <= 0) show();
    else timers.push(setTimeout(show, Math.max(0, showAt * 1000 - since())));
    if (hideAt < seconds) {
      timers.push(setTimeout(() => {
        setLabelsVisible(false);
        labelHideAtRef.current = Math.round(since());
      }, Math.max(0, hideAt * 1000 - since())));
    }
    return () => timers.forEach(clearTimeout);
  }, [view, hasClicked, showAt, hideAt, seconds]);

  // Timer to change view after seconds when in scatter view
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    const timer = setTimeout(() => {
      tg.stop();
      setView("corrafter");
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [view, hasClicked, seconds, tg.stop]);


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
    const textRect = (el) => {
      if (!el) return null;
      const range = document.createRange();
      range.selectNodeContents(el);
      const b = range.getBoundingClientRect();
      return b.width > 0 && b.height > 0 ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : rect(el);
    };
    geometryRef.current = {
      plotRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      plotArea: [Math.round(r.left + margin.left * scale), Math.round(r.top + margin.top * scale), Math.round(plotWidth * scale), Math.round(plotHeight * scale)],
      plotScale: Math.round(scale * 1000) / 1000,
      // label AOIs = the rendered text itself (a Range over the text), not the containing box: the y label's
      // foreignObject spans the whole left strip. labelBoxes keeps the old container rectangles.
      labelRects: { x: textRect(svg.querySelector('.x-label')), y: textRect(svg.querySelector('.y-label')) },
      labelBoxes: { x: rect(svg.querySelector('.x-label')), y: rect(svg.querySelector('.y-label')) },
      viewport: [window.innerWidth, window.innerHeight],
      // Browser window placement on the physical screen: a change since calibration means the
      // calibration frame moved relative to the camera and the trial should be flagged.
      windowPos: [window.screenX, window.screenY, window.outerWidth, window.outerHeight],
      screen: [window.screen.width, window.screen.height],
      dpr: window.devicePixelRatio,
      scroll: [Math.round(window.scrollX), Math.round(window.scrollY)],
    };
  }, [margin, plotWidth, plotHeight, scale]);

  // Answer callback - called when the slider is touched
  const { payload } = tg;
  const answerCallback = useCallback((newCorrAfter) => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          corrAfter: newCorrAfter,
        }),
        gaze: JSON.stringify({
          ...payload(),
          labelRevealAt: labelRevealAtRef.current,
          labelHideAt: labelHideAtRef.current,
          labelStart: label_start ?? null,
          labelEnd: label_end ?? null,
          seconds,
          labelSeconds: label_seconds,
          ...(geometryRef.current ?? {}),
        }),
      }
    });
    setCorrAfter(newCorrAfter);
    setTouched(true);
  }, [setAnswer, correlation, seconds, label_seconds, label_start, label_end, payload]);

  // Draw scatterplot with D3 - only when view changes or coordinates change
  useEffect(() => {
    if (view !== "scatter") return;
    if (!ref.current || !coordinates || coordinates.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();
    svg.attr('width', fixedSize.width * scale).attr('height', fixedSize.height * scale).attr('viewBox', `0 0 ${fixedSize.width} ${fixedSize.height}`);

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

  }, [view, coordinates, xScale, yScale, fixedSize, margin, X, Y, scale]);

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
    labelRevealAtRef.current = null;
    labelHideAtRef.current = null;
    captureGeometry();
    tg.start();
  }, [hasClicked, captureGeometry, tg]);

  return (
    <div>
      <FullscreenGate />
      {tg.headWarning && <HeadMovedPanel onContinue={tg.resume} />}
      {view === "shortcalib" && (
        <CalibrationOverlay dot={dot} collecting={collecting} message={message} fitting={fitting} />
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
              width={fixedSize.width * scale}
              height={fixedSize.height * scale}
              viewBox={`0 0 ${fixedSize.width} ${fixedSize.height}`}
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
                You have 5 to 11 seconds to view the scatterplot. <br />  Click to start!
              </div>
            )}
          </div>
        </div>
      )}

      {view === "corrafter" && (
        <Panel
          kicker={example ? "Task 3 of 3 · example" : "Task 3 of 3"}
          title="How strong was the correlation?"
          maxWidth={720}
          actions={<Button size="lg" disabled={!touched} onClick={() => advance?.()}>Next</Button>}
        >
          <div style={{ width: 640, maxWidth: "90vw" }}>
            <NormalSlider
              value={corrAfter}
              setValue={answerCallback}
              leftLabel="None (0)"
              rightLabel="Perfect (1)"
              min={0}
              max={1}
              step={0.01}
              tickInterval={0.2}
            />
          </div>
          <RecalibrateButton />
        </Panel>
      )}
    </div>
  );
}

export default Phase2Gaze;
