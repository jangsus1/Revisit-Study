import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback } from "react"
import { Box, Button } from "@mantine/core"
import React from "react"
import { NormalSlider } from "./Slider"
import { usePlotScale } from "./plotScale";
import { TASK_MARGIN, TASK_RESERVED, TASK_SIZE } from "./taskLayout";
import { CalibrationOverlay } from "./CalibrationOverlay";
import { FullscreenGate, Panel } from "./FullScreen";
import { useTrialGaze } from "./trialGaze";
import HeadMovedPanel, { RecalibrateButton, SetupAgainPanel } from "./HeadMovedPanel";

// Task 2 (training, unlabeled plots) with eye tracking: the same per-trial short calibration and gaze
// recording as the Task 3 trials (trialGaze.jsx), so Task 2 gives a no-label gaze baseline. The plot is
// shown in a full-window overlay (same frame as the calibration dots); slider and feedback stay as before.


function Phase1Gaze({ parameters, setAnswer, advance }) {
  const ref = useRef(null)
  const { coordinates, example, correlation, seconds, label_seconds } = parameters
  
  const [view, setView] = useState("shortcalib") // shortcalib, scatter, slider, feedback
  // While viewing, the plot uses the Task 3 frame (taskLayout.ts: 110-px empty label strip on the left), so it
  // sits at the same screen position as the Task 3 plots and under the per-trial calibration dots. The
  // feedback screen keeps the plain 600x600 plot.
  const taskFrame = view !== "feedback"
  const margin = taskFrame ? TASK_MARGIN : { top: 40, right: 40, bottom: 60, left: 60 }
  const dotPadding = 10 // Padding around dots
  const fixedSize = taskFrame ? TASK_SIZE : { width: 600, height: 600 }
  // Shown larger than the design size (viewBox): full window while viewing, inside the feedback panel
  // (plot + result lines + button in one window, may shrink below the design size) afterwards
  const scatterScale = usePlotScale(TASK_SIZE.width, TASK_SIZE.height, TASK_RESERVED[0], TASK_RESERVED[1])
  const layoutScale = usePlotScale(600, 600, 80, 300, 1.2, 0.7)
  const [answered, setAnswered] = useState(false)

  const scale = view === "scatter" ? scatterScale : layoutScale
  const tg = useTrialGaze({ active: view === "shortcalib", onReady: () => setView("scatter"), view })
  const { payload } = tg
  const geometryRef = useRef(null)
  const [slider, setSlider] = useState(0)
  const [sliderInteracted, setSliderInteracted] = useState(false)
  const [isBlurred, setIsBlurred] = useState(true)
  const [hasClicked, setHasClicked] = useState(false)
  const [countdown, setCountdown] = useState(2)
  
  // Calculate scales based on fixed size
  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);

  // Reset blur state when entering scatter view
  useEffect(() => {
    if (view === "scatter") {
      setIsBlurred(true);
      setHasClicked(false);
    }
  }, [view]);

  // Draw scatterplot with D3
  useEffect(() => {
    if (view !== "scatter" && view !== "feedback") return;
    if (!coordinates || coordinates.length === 0) return;
    if (!ref.current) return;
    
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    // Use fixed size
    svg.attr('width', fixedSize.width * scale).attr('height', fixedSize.height * scale).attr('viewBox', `0 0 ${fixedSize.width} ${fixedSize.height}`);

    // Add proper axes with visible lines
    const xAxis = d3.axisBottom(xScale).tickSize(0).tickFormat(() => '');
    const yAxis = d3.axisLeft(yScale).tickSize(0).tickFormat(() => '');

    // X-axis
    svg.append('g')
      .attr('transform', `translate(0, ${fixedSize.height - margin.bottom})`)
      .call(xAxis)
      .selectAll('path')
      .style('stroke', '#000')
      .style('stroke-width', 2);

    // Y-axis
    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yAxis)
      .selectAll('path')
      .style('stroke', '#000')
      .style('stroke-width', 2);

    // Add only left and bottom borders
    const plotLeft = margin.left;
    const plotRight = fixedSize.width - margin.right;
    const plotTop = margin.top;
    const plotBottom = fixedSize.height - margin.bottom;
    
    // Left border
    svg.append('line')
      .attr('x1', plotLeft)
      .attr('y1', plotTop)
      .attr('x2', plotLeft)
      .attr('y2', plotBottom)
      .style('stroke', '#000')
      .style('stroke-width', 2);
    
    // Bottom border
    svg.append('line')
      .attr('x1', plotLeft)
      .attr('y1', plotBottom)
      .attr('x2', plotRight)
      .attr('y2', plotBottom)
      .style('stroke', '#000')
      .style('stroke-width', 2);

    // Add scatter points
    svg.selectAll('.dot')
      .data(coordinates)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d[0]))
      .attr('cy', d => yScale(d[1]))
      .attr('r', 3)
      .attr('fill', 'black');
  }, [view, coordinates, xScale, yScale, fixedSize, margin, scale]);

  // Geometry for mapping gaze samples (viewport px)
  const captureGeometry = useCallback(() => {
    const svg = ref.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    geometryRef.current = {
      plotRect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      plotArea: [Math.round(r.left + margin.left * scale), Math.round(r.top + margin.top * scale), Math.round(plotWidth * scale), Math.round(plotHeight * scale)],
      plotScale: Math.round(scale * 1000) / 1000,
      labelRects: null,
      viewport: [window.innerWidth, window.innerHeight],
      windowPos: [window.screenX, window.screenY, window.outerWidth, window.outerHeight],
      screen: [window.screen.width, window.screen.height],
      dpr: window.devicePixelRatio,
      scroll: [Math.round(window.scrollX), Math.round(window.scrollY)],
    };
  }, [margin, plotWidth, plotHeight, scale]);

  // Handle click to remove blur and start recording gaze
  const handleClick = useCallback(() => {
    if (!hasClicked) {
      setIsBlurred(false);
      setHasClicked(true);
      captureGeometry();
      tg.start();
    }
  }, [hasClicked, captureGeometry, tg]);

  // timer for 5 seconds to change view - starts after click
  useEffect(() => {
    if (!hasClicked) return;
    const timer = setTimeout(() => {
      tg.stop()
      setView("slider")
    }, seconds * 1000)
    return () => clearTimeout(timer)
  }, [hasClicked, seconds, tg.stop])


  const answerCallback = useCallback(() => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          estimatedCorr: slider,
        }),
        gaze: JSON.stringify({
          ...payload(),
          labelRevealAt: null,
          labelHideAt: null,
          seconds,
          ...(geometryRef.current ?? {}),
        }),
      }
    })
    setAnswered(true)
  }, [slider, correlation, setAnswer, coordinates, payload, seconds])


  const jobDone = () => {
    setView("feedback")
  }

  // Timer to call answerCallback 2 seconds after feedback view is shown
  useEffect(() => {
    if (view !== "feedback") return;
    
    // Call answerCallback after 2 seconds
    const callbackTimer = setTimeout(() => {
      answerCallback();
    }, 2000);
    
    return () => {
      clearTimeout(callbackTimer);
    };
  }, [view, answerCallback]);

  const diff = slider - correlation;

  return (
    <div>
      <FullscreenGate />
      {tg.headWarning && <HeadMovedPanel kind={tg.headWarning} onContinue={tg.resume} />}
      {tg.setupNeeded && <SetupAgainPanel onStart={tg.resume} />}
      {view === "shortcalib" && (
        <CalibrationOverlay dot={tg.dot} collecting={tg.collecting} message={tg.message} fitting={tg.fitting} />
      )}
      {view === "scatter" && (
        // Full-viewport plain screen (hides the platform header / Next), same frame as the dots
        <div style={{
          position: "fixed", inset: 0, zIndex: 2000, background: "#ffffff",
          display: "flex", justifyContent: "center", alignItems: "center", cursor: isBlurred ? "pointer" : "none"
        }}>
          <div 
            style={{ 
              display: 'inline-block',
              position: 'relative'
            }}
          >
            <svg 
              id="clickAccuracySvg" 
              ref={ref} 
              width={fixedSize.width * scale}
              height={fixedSize.height * scale}
              viewBox={`0 0 ${fixedSize.width} ${fixedSize.height}`}
              style={{ 
                display: 'block', 
                filter: isBlurred ? 'blur(50px)' : 'none',
                cursor: isBlurred ? 'pointer' : 'none'
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
                You have 5 seconds to estimate the correlation. <br />  Click to start!
              </div>
            )}
          </div>
        </div>
      )}

      {view === "slider" && (
        <Panel
          kicker="Task 2 of 3"
          title="How strong was the correlation?"
          maxWidth={720}
          actions={<Button size="lg" disabled={!sliderInteracted} onClick={jobDone}>Check answer</Button>}
        >
          <div style={{ width: 640, maxWidth: "90vw" }}>
            <NormalSlider
              value={slider}
              setValue={(value) => {
                setSlider(value);
                setSliderInteracted(true);
              }}
              onClick={() => setSliderInteracted(true)}
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

      {view === "feedback" && (
        <Panel
          kicker="Task 2 of 3"
          maxWidth={900}
          actions={<Button size="lg" disabled={!answered} onClick={() => advance?.()}>Next</Button>}
        >
          <svg
            id="feedbackSvg"
            ref={ref}
            width={fixedSize.width * scale}
            height={fixedSize.height * scale}
            viewBox={`0 0 ${fixedSize.width} ${fixedSize.height}`}
            style={{ display: 'block', margin: '0 auto' }}
          />
          <div style={{ fontSize: 22, marginTop: 8 }}>
            Correct: <strong style={{ color: '#222' }}>{correlation.toFixed(2)}</strong>
            {'   ·   '}
            You: <strong style={{ color: '#222' }}>{slider.toFixed(2)}</strong>
            {' '}
            <span style={{ color: Math.abs(diff) <= 0.1 ? '#2f9e44' : '#e8590c' }}>({diff > 0 ? "+" : ''}{diff.toFixed(2)})</span>
          </div>
          <RecalibrateButton />
        </Panel>
      )}

    </div>
  )
}

export default Phase1Gaze
