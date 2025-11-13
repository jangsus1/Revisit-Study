import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Box, Button, Slider } from "@mantine/core";
import React from "react";
import _ from "lodash";
import DivergingSlider from "./Slider";
function Bubble({ parameters, setAnswer }) {
  const ref = useRef(null);
  const { image, radius, ratio, example, seconds, correlation, label, X, Y } = parameters;
  const [clicked, setClicked] = useState([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState("belief"); // belief, corrbefore, scatter, corrafter
  const [circleRatio, setCircleRatio] = useState(ratio);
  const [newRadius, setNewRadius] = useState(0);
  const [currentMousePos, setCurrentMousePos] = useState(null);
  const containerRef = useRef(null);
  const [belief, setBelief] = useState(4);
  const [corrBefore, setCorrBefore] = useState(0);
  const [corrAfter, setCorrAfter] = useState(0);
  const [hasClicked, setHasClicked] = useState(false);
  const [beliefInteracted, setBeliefInteracted] = useState(false);
  const [corrBeforeInteracted, setCorrBeforeInteracted] = useState(false);

  // Timer to change view after a delay when in scatter view
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    if (!size.width) return; // Wait for image to be loaded and sized
    const timer = setTimeout(() => {
      setView("corrafter");
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [view, seconds, hasClicked, size.width]);

  // Answer callback for the slider in the "corrafter" view
  const answerCallback = useCallback((newCorrAfter) => {
    setAnswer({
      answers: {
        answer: JSON.stringify({
          clicked: clicked,
          radius: newRadius,
          size: size,
          corrBefore: corrBefore,
          corrActual: correlation,
          corrAfter: newCorrAfter,
          belief: (belief - 1) / 6
        })
      }
    });
    setCorrAfter(newCorrAfter);
  }, [clicked, corrBefore, correlation, setAnswer, belief]);

  // Adjust image size when in scatter view
  useEffect(() => {
    if (view !== "scatter") return;
    const img = new Image();
    img.src = image;
    img.onload = () => {
      const parent = containerRef.current;
      const availableHeight = window.innerHeight - parent.getBoundingClientRect().top;
      const availableWidth = window.innerWidth - parent.getBoundingClientRect().left;
      const aspectRatio = img.width / img.height;
      let scaledWidth, scaledHeight;
      if (availableHeight * aspectRatio <= availableWidth) {
        scaledHeight = availableHeight;
        scaledWidth = availableHeight * aspectRatio;
      } else {
        scaledWidth = availableWidth;
        scaledHeight = availableWidth / aspectRatio;
      }
      const multiplier = scaledWidth / img.width;
      setSize({ width: scaledWidth, height: scaledHeight, multiplier });

      // Determine circle ratio: prefer provided ratio; otherwise derive from legacy radius using original image width
      const derivedRatio = (typeof ratio === "number")
        ? ratio
        : (typeof radius === "number" && img.width > 0)
          ? radius / img.width
          : 0.1;
      setCircleRatio(derivedRatio);
      setNewRadius(derivedRatio * scaledWidth);
    };
  }, [image, view, ratio, radius]);

  // Recompute pixel radius if container resizes or ratio changes (defensive)
  useEffect(() => {
    if (!size.width || typeof circleRatio !== "number") return;
    setNewRadius(circleRatio * size.width);
  }, [size.width, circleRatio]);

  // Function to record a point in clicked variable
  const recordPoint = useCallback((x, y) => {
    const clickedCircle = { x: parseInt(x), y: parseInt(y), time: Date.now() };
    setClicked(old => {
      const newArray = [...old, clickedCircle];
      return newArray;
    });
  }, [setClicked]);

  // Throttled version for mouse movement recording after click
  const throttledRecordPoint = useMemo(
  () => _.throttle((x, y) => recordPoint(x, y), 100, { leading: true, trailing: true }),
  [recordPoint]
);

// cancel when component unmounts
useEffect(() => {
  return () => throttledRecordPoint.cancel();
}, [throttledRecordPoint]);


  // Handle mouse down: start recording mouse movements
  const handleMouseDown = useCallback((e) => {
    const svg = d3.select(ref.current);
    const point = d3.pointer(e, svg.node());
    setHasClicked(true);
    throttledRecordPoint(point[0], point[1]);
  }, [throttledRecordPoint]);

  // Handle mouse move: record coordinates only if user has clicked
  const handleMouseMove = useCallback((e) => {
    if (!hasClicked) {
      return;
    }
    const svg = d3.select(ref.current);
    const point = d3.pointer(e, svg.node());
    setCurrentMousePos({ x: parseInt(point[0]), y: parseInt(point[1]) });
    throttledRecordPoint(point[0], point[1]);
  }, [hasClicked, throttledRecordPoint]);

  // Handle mouse up: flush any pending recording
  const handleMouseUp = useCallback(() => {
    throttledRecordPoint.flush();
  }, [throttledRecordPoint]);

  const handleMouseLeave = useCallback(() => {
    throttledRecordPoint.flush();
    setCurrentMousePos(null);
  }, [throttledRecordPoint]);

  return (
    <div>
      {example && (
        <h1 style={{ color: "red" }}>Example Question</h1>
      )}
      {view === "scatter" && (
        <div>
          <h3>Explore the scatterplot of the two variables for {seconds} seconds through clicking and moving your mouse!</h3>
          <h3>X: {X} &nbsp;&nbsp; / &nbsp;&nbsp; Y: {Y}</h3>
          
          <Box ref={containerRef} className="ImageWrapper" style={{
            display: "flex",
            justifyContent: "center",  // Centers horizontally
            alignItems: "center",       // Centers vertically
            width: "100%",
          }}>
            <svg
              id="clickAccuracySvg"
              ref={ref}
              width={size.width}
              height={size.height}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseLeave}
            >
              <defs>
                <mask id="revealMask">
                  {/* Start with white background (visible), cut holes with black circles */}
                  <rect width="100%" height="100%" fill="white" />
                  {currentMousePos && (
                    <circle
                      cx={currentMousePos.x}
                      cy={currentMousePos.y}
                      r={newRadius}
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              
              {/* Scatter plot image */}
              <image
                href={image}
                width={size.width}
                height={size.height}
              />
              
              {/* White overlay that gets holes cut through it to reveal the image */}
              <rect
                x="0"
                y="0"
                width={size.width}
                height={size.height}
                fill="white"
                mask="url(#revealMask)"
              />
              
              {/* Red circle indicator at current mouse position */}
              {currentMousePos && (
                <circle
                  cx={currentMousePos.x}
                  cy={currentMousePos.y}
                  r={newRadius}
                  fill="transparent"
                  stroke="red"
                  strokeWidth="1"
                />
              )}
              
              {/* Border */}
              <rect x="0" y="0" width={size.width} height={size.height} fill="transparent" stroke="black" strokeWidth="1" />
            </svg>
          </Box>
        </div>
      )}

      {view === "corrbefore" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>Predict the correlation of the two variables below:</h3>
          <h3>X: {X}</h3>
          <h3>Y: {Y}</h3>
          <DivergingSlider
            value={corrBefore}
            setValue={(value) => {
              setCorrBefore(value);
              setCorrBeforeInteracted(true);
            }}
            min={-1}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
          <Button float="right" disabled={!corrBeforeInteracted} onClick={() => setView("scatter")}>Done</Button>
        </div>
      )}

      {view === "corrafter" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>Estimate the correlation of the scatterplot.</h3>
          <DivergingSlider
            value={corrAfter}
            setValue={answerCallback}
            min={-1}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
        </div>
      )}

      {view === "belief" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>How much do you believe about this statement?</h3>
          <h3>{label}</h3>
          <div style={{ marginBottom: 100 }}>
            <DivergingSlider
              value={belief}
              onClick={() => setBeliefInteracted(true)}
              setValue={(value) => {
                setBelief(value);
              }}
              leftLabel="Not at all"
              rightLabel="Completely"
              min={1}
              max={7}
              step={1}
              tickInterval={1}
              center={4}
            />
          </div>
          <Button disabled={!beliefInteracted} onClick={() => setView("corrbefore")}>Done</Button>
        </div>
      )}
    </div>
  );
}

export default Bubble;