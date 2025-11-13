import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback } from "react"
import { Box, Button } from "@mantine/core"
import React from "react"
import _ from "lodash";

import DivergingSlider from "./Slider"


// timer for 5 seconds

function Plain({ parameters, setAnswer }) {
  const ref = useRef(null)
  const { image, radius, example, correlation, seconds } = parameters
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState("scatter") // scatter, slider, feedback
  const [newRadius, setNewRadius] = useState(radius)
  const containerRef = useRef(null);
  const [slider, setSlider] = useState(0)
  const [sliderInteracted, setSliderInteracted] = useState(false)


  // timer for 5 seconds to change view - starts after image is loaded
  useEffect(() => {
    if (!size.width) return; // Wait for image to be loaded and sized
    const timer = setTimeout(() => {
      setView("slider")
    }, seconds * 1000)
    return () => clearTimeout(timer)
  }, [size.width, seconds])


  const answerCallback = useCallback(() => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          corr_est: slider,
          corr_act: correlation
        })
      }
    })
  }, [slider, setAnswer])


  const jobDone = () => {
    answerCallback()
    setView("feedback")
  }


  useEffect(() => {
    const img = new Image();
    img.src = image;
    img.onload = () => {
      const parent = containerRef.current;
      const availableHeight = window.innerHeight - parent.getBoundingClientRect().top; // Height from parent top to bottom of viewport
      const availableWidth = window.innerWidth - parent.getBoundingClientRect().left; // Width from parent left to right of viewport
      const aspectRatio = img.width / img.height; // Image aspect ratio

      let scaledWidth, scaledHeight;
      if (availableHeight * aspectRatio <= availableWidth) {
        // Fit height first
        scaledHeight = availableHeight;
        scaledWidth = availableHeight * aspectRatio;
      } else {
        // Fit width first
        scaledWidth = availableWidth;
        scaledHeight = availableWidth / aspectRatio;
      }
      const multiplier = scaledWidth / img.width
      setSize({ width: scaledWidth, height: scaledHeight, multiplier: multiplier });
      setNewRadius(radius * multiplier)
    };
  }, [image]);

  return (
    <div>
      {example && (
        <div>
          <h1 style={{ color: "red" }}>Example Question</h1>
        </div>
      )}
      {view === "scatter" && (
        <Box ref={containerRef} className="ImageWrapper" style={{
          display: "flex",
          justifyContent: "center",  // Centers horizontally
          width: "100%",
        }}>
          <svg id="clickAccuracySvg" ref={ref} width={size.width} height={size.height}>

            <image
              href={image}
              width={size.width}
              height={size.height}
            />
            <rect x="0" y="0" width={size.width} height={size.height} fill="transparent" stroke="black" strokeWidth="1" />
          </svg>
        </Box>
      )}

      {view === "slider" && (
        <div style={{ width: '80%', margin: '50px auto' }}>
          <h2>Predict the Correlation!</h2>
          <DivergingSlider
            value={slider}
            setValue={(value) => {
              setSlider(value);
              setSliderInteracted(true);
            }}
            min={-1}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
          <Button sx={{ mt: 2 }} disabled={!sliderInteracted} onClick={jobDone}>Done</Button>
        </div>
      )}

      {view === "feedback" && (
        <div>
          <h2>Your estimation: {slider}</h2>
          <h2>Actual correlation: {correlation.toFixed(2)}</h2>
        </div>
      )}


    </div>
  )
}

export default Plain
