import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback } from "react"
import { Box } from "@mantine/core"
import React from "react"
import _ from "lodash";

function bubble({ parameters, setAnswer }) {
  const ref = useRef(null)
  const { image, question, radius_count, example } = parameters
  const [clicked, setClicked] = useState([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null);
  const [radius, setRadius] = useState(0)
  const [view, setView] = useState(false)

  // 2 sec timer
  useEffect(() => {
    const timer = setTimeout(() => {
      setView(true)
    }, 1500);
    return () => clearTimeout(timer);
  }, []);


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
      setSize({ width: scaledWidth, height: scaledHeight, multiplier: scaledWidth / img.width });
      setRadius((scaledWidth + scaledHeight) / 4 / radius_count)
    };
  }, [image]);


  const clickCallback = useCallback((e) => {
    const svg = d3.select(ref.current)
    const point = d3.pointer(e, svg.node())
    const clickedCircle = { x: point[0], y: point[1] }
    const clickedCircles = [...clicked, clickedCircle]
    setClicked(clickedCircles)
    setAnswer({
      status: true,
      answers: {
        circles: JSON.stringify({
          circles: clickedCircles.map(circle => ({
            x: parseInt(circle.x / size.multiplier),
            y: parseInt(circle.y / size.multiplier),
          })),
          radius: radius / size.multiplier,
          multiplier: size.multiplier,
          question: question
        })
      }
    })
  }, [clicked, setAnswer, size])

  return (
    <div>
      {example && (
        <h1 style={{
          color: "red",
          position: "fixed",
          top: "50px",
          left: "50%",
          transform: "translateX(-50%)",
          background: "transparent",
          padding: "10px",
          zIndex: 1000
        }}>Example Question</h1>
      )}
      <h1>Bubble View</h1>
      {question ? (
        <div>
          <h2>Please click on regions to reveal. Try to click areas that are <span style={{ color: "red" }} >relevant</span> to answering the question below:</h2>
          <h2>Q: {question}</h2>
        </div>
      ) : (
        <div>
          <h2>
            Please click on regions to reveal.<br />
            Then, provide a description of the key insights or takeaways from this visualization.
          </h2>
        </div>
      )}
      <Box ref={containerRef} className="ImageWrapper" style={{ width: "100%", display: view ? "flex" : "none" }}>
        <svg id="clickAccuracySvg" ref={ref} width={size.width} height={size.height} onClick={clickCallback}>
          <defs>
            <filter id="imageBlurFilter">
              <feGaussianBlur in="SourceGraphic" stdDeviation="11" />
            </filter>

            <mask id="unblurMask">
              <rect width="100%" height="100%" fill="white" />
              {clicked.length > 0 && (
                <circle
                  key={0}
                  cx={clicked[clicked.length - 1].x}
                  cy={clicked[clicked.length - 1].y}
                  r={radius}
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
          {clicked.length > 0 && (
            <circle
              key={0}
              cx={clicked[clicked.length - 1].x}
              cy={clicked[clicked.length - 1].y}
              r={radius}
              fill="transparent"
              stroke="red"
            />
          )}
        </svg>
      </Box>
    </div>
  )
}

export default bubble
