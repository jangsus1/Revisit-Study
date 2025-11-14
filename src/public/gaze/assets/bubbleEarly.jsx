import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Box, Button, Slider } from "@mantine/core";
import React from "react";
import _ from "lodash";
import DivergingSlider from "./Slider";



function BubbleEarly({ parameters, setAnswer }) {
  const ref = useRef(null);
  const { image, radius, ratio, seconds, revealSeconds, correlation, label, X, Y } = parameters;
  const [clicked, setClicked] = useState([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState("scatter"); // scatter, corrafter, belief
  const [circleRatio, setCircleRatio] = useState(ratio);
  const [newRadius, setNewRadius] = useState(0);
  const [currentMousePos, setCurrentMousePos] = useState(null);
  const containerRef = useRef(null);
  const [belief, setBelief] = useState(4);
  const [corrAfter, setCorrAfter] = useState(0);
  const [hasClicked, setHasClicked] = useState(false);
  const [beliefInteracted, setBeliefInteracted] = useState(false);
  const [corrAfterInteracted, setCorrAfterInteracted] = useState(false);
  const [showLabels, setShowLabels] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(seconds);
  const [labelBlur, setLabelBlur] = useState(10); // Start with high blur
  const startTimeRef = useRef(null);

  // Show labels immediately when in scatter view (blurred)
  useEffect(() => {
    if (view === "scatter") {
      setShowLabels(true);
      setLabelBlur(10); // Start blurred
    } else {
      setShowLabels(false);
    }
  }, [view]);

  // Countdown timer and label blur removal
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    if (!size.width) return; // Wait for image to be loaded and sized
    
    // Reset time remaining when starting
    setTimeRemaining(seconds);
    
    startTimeRef.current = Date.now();
    
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      const remaining = Math.max(0, seconds - elapsed);
      setTimeRemaining(Math.ceil(remaining));
      
      // Suddenly unblur after revealSeconds (no transition)
      if (elapsed >= revealSeconds) {
        setLabelBlur(0);
      }
    }, 100); // Update every 100ms for smooth countdown
    
    return () => {
      clearInterval(interval);
      startTimeRef.current = null;
    };
  }, [view, hasClicked, size.width, seconds, revealSeconds]);

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

  // Answer callback for the slider in the "belief" view
  const answerCallback = useCallback((newBelief) => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          clicked: clicked,
          radius: newRadius,
          size: size,
          corrAfter: corrAfter,
          corrActual: correlation,
          belief: (newBelief - 1) / 6
        })
      }
    });
    setBelief(newBelief);
  }, [clicked, corrAfter, correlation, setAnswer, newRadius, size]);

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
      {view === "scatter" && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Explore the scatterplot of the two variables for {seconds} seconds through clicking and moving your mouse!</h3>
            {hasClicked && (
              <div style={{ 
                fontSize: '14px', 
                color: '#666', 
                fontWeight: 'bold',
                padding: '4px 8px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                minWidth: '50px',
                textAlign: 'center'
              }}>
                {timeRemaining}s
              </div>
            )}
          </div>
          {showLabels && (
            <h2 style={{
              filter: `blur(${labelBlur}px)`,
              opacity: 1,
              color: labelBlur === 0 ? 'red' : undefined
            }}>
              X: {X} <br/> Y: {Y}
            </h2>
          )}
          
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

      {view === "corrafter" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>Estimate the correlation of the scatterplot.</h3>

          <DivergingSlider
            value={corrAfter}
            setValue={(value) => {
              setCorrAfter(value);
              setCorrAfterInteracted(true);
            }}
            min={-1}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
          <Button float="right" disabled={!corrAfterInteracted} onClick={() => setView("belief")}>Done</Button>
        </div>
      )}

      {view === "belief" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>Rate your belief about the statement below using a Likert scale slider.</h3>
          <h4>{label}</h4>
          <div style={{ marginBottom: 100 }}>
            <DivergingSlider
              value={belief}
              onClick={() => setBeliefInteracted(true)}
              setValue={answerCallback}
              leftLabel="Not at all"
              rightLabel="Completely"
              min={1}
              max={7}
              step={1}
              tickInterval={1}
              center={4}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default BubbleEarly;