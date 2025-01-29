import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback } from "react"
import { Box } from "@mantine/core"
import React from "react"
import _ from "lodash";

const isObjectInList = (obj, list) => {
  return list.some(item =>
    Object.keys(obj).every(key => obj[key] === item[key])
  );
};


function bubble({ parameters, setAnswer }) {
  const ref = useRef(null)
  const { image, question, radius_count, example } = parameters
  const [clicked, setClicked] = useState([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null);
  const [radius, setRadius] = useState(0)


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
    const clickedCircle = { x: parseInt(point[0]), y: parseInt(point[1]) }
    const clickedCircles = [...clicked, clickedCircle]
    setClicked(clickedCircles)
    setAnswer({
      status: true,
      answers: {
        circles: JSON.stringify(clickedCircles)
      }
    })
  }, [clicked, setAnswer])

  return (
    <div>
      {example && (
        <h1 style={{color:"red"}}>Example Question</h1>
      )}
      {question ? (
        <div>
          <h2>Please click on regions to reveal. Try to click areas that are relevant to answering the question below:</h2>
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
      <Box ref={containerRef} className="ImageWrapper" style={{ width: "100%" }}>
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
                border="black"
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

          <g id="rectangles"></g>
        </svg>
      </Box>
    </div>
  )
}

export default bubble
