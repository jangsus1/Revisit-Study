import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Box, Button, Slider } from "@mantine/core";
import React from "react";
import _, { set } from "lodash";
import DivergingSlider from "./Slider";
import { Registry, initializeTrrack } from "@trrack/core";

function Bubble({ parameters, setAnswer }) {
  const ref = useRef(null);
  const { image, radius, example, seconds, correlation, label, X, Y } = parameters;
  const [clicked, setClicked] = useState([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [view, setView] = useState("belief"); // belief, corrbefore, scatter, corrafter
  const [newRadius, setNewRadius] = useState(radius);
  const containerRef = useRef(null);
  const [belief, setBelief] = useState(4);
  const [corrBefore, setCorrBefore] = useState(0);
  const [corrAfter, setCorrAfter] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [draggedPoint, setDraggedPoint] = useState(null);
  const [startedBubble, setStartedBubble] = useState(false);

  // Initialize ttrack with a registry and a "click" action (we reuse this action for drag recordings)
  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();
    const clickAction = reg.register('click', (state, clickRecord) => {
      state.clickRecord = clickRecord;
      return state;
    });
    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: { clickRecord: {} },
    });
    return { actions: { clickAction }, trrack: trrackInst };
  }, []);

  // Timer to change view after a delay when in scatter view
  useEffect(() => {
    if (view !== "scatter") return;
    if (startedBubble == false) return;
    const timer = setTimeout(() => {
      setView("corrafter");
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [view, seconds, startedBubble]);

  // Answer callback for the slider in the "corrafter" view
  const answerCallback = useCallback((newCorrAfter) => {
    setAnswer({
      answers: {
        status: true,
        answer: JSON.stringify({
          clicked: clicked,
          corrBefore: corrBefore,
          corrActual: correlation,
          corrAfter: newCorrAfter,
          belief: (belief - 1) / 6
        })
      },
      provenanceGraph: trrack.graph.backend,
    });
    setCorrAfter(newCorrAfter);
  }, [clicked, corrBefore, correlation, trrack, setAnswer, belief]);

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
      setNewRadius(radius * multiplier);
    };
  }, [image, view, radius]);

  // Function to record a point: update state and log via ttrack
  const recordPoint = useCallback((x, y) => {
    const clickedCircle = { x: parseInt(x), y: parseInt(y) };
    setClicked(old => [...old, clickedCircle]);
    const clickRecord = {
      x: clickedCircle.x,
      y: clickedCircle.y,
      radius: newRadius,
      multiplier: size.multiplier
    };
    trrack.apply('click', actions.clickAction(clickRecord));
  }, [newRadius, size, trrack, actions]);

  // Debounced version to control the capture rate
  const debouncedRecordPoint = useMemo(() => _.debounce((x, y) => {
    recordPoint(x, y);
  }, 200), [recordPoint]);

  useEffect(() => {
    return () => debouncedRecordPoint.cancel();
  }, [debouncedRecordPoint]);

  // Handle mouse down: start dragging and record the initial position.
  const handleMouseDown = useCallback((e) => {
    const svg = d3.select(ref.current);
    const point = d3.pointer(e, svg.node());
    setIsDragging(true);
    setStartedBubble(true);
    setDraggedPoint({ x: parseInt(point[0]), y: parseInt(point[1]) });
    debouncedRecordPoint(point[0], point[1]);
  }, [debouncedRecordPoint]);

  // Handle mouse move: if dragging, update circle position and record via the debounced function.
  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const svg = d3.select(ref.current);
    const point = d3.pointer(e, svg.node());
    setDraggedPoint({ x: parseInt(point[0]), y: parseInt(point[1]) });
    debouncedRecordPoint(point[0], point[1]);
  }, [isDragging, debouncedRecordPoint]);

  // Handle mouse up: stop dragging and flush any pending recording.
  const handleMouseUp = useCallback((e) => {
    if (!isDragging) return;
    setIsDragging(false);
    debouncedRecordPoint.flush();
  }, [isDragging, debouncedRecordPoint]);

  return (
    <div>
      {example && (
        <h1 style={{ color: "red" }}>Example Question</h1>
      )}
      {view === "scatter" && (
        <div>
          <h3>Explore the scatterplot of the two variables through dragging with your mouse!</h3>
          <h3>X: {X} &nbsp;&nbsp; / &nbsp;&nbsp; Y: {Y}</h3>
          <h3></h3>
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
              onMouseLeave={handleMouseUp}
            >
              <defs>
                <filter id="imageBlurFilter">
                  <feGaussianBlur in="SourceGraphic" stdDeviation={17} />
                </filter>
                <mask id="unblurMask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect x="0" y="0" width="13.1%" height="100%" fill="black" />
                  <rect x="0" y="89%" width="100%" height="12.8%" fill="black" />
                  {draggedPoint && (
                    <circle
                      key={0}
                      cx={draggedPoint.x}
                      cy={draggedPoint.y}
                      r={newRadius}
                      fill="black"
                    />
                  )}
                </mask>
              </defs>
              <image
                href={image}
                width={size.width}
                height={size.height}
              />
              <image
                href={image}
                width={size.width}
                height={size.height}
                filter="url(#imageBlurFilter)"
                mask="url(#unblurMask)"
              />
              {draggedPoint && (
                <circle
                  key={0}
                  cx={draggedPoint.x}
                  cy={draggedPoint.y}
                  r={newRadius}
                  fill="transparent"
                  stroke="red"
                />
              )}
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
            setValue={setCorrBefore}
            min={-1}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
          <Button float="right" onClick={() => setView("scatter")}>Done</Button>
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
              setValue={setBelief}
              leftLabel="Not at all"
              rightLabel="Completely"
              min={1}
              max={7}
              step={1}
              tickInterval={1}
              center={4}
            />
          </div>
          <Button onClick={() => setView("corrbefore")}>Done</Button>
        </div>
      )}
    </div>
  );
}

export default Bubble;