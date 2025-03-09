import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Box } from "@mantine/core"
import React from "react"
import _ from "lodash";
import { Registry, initializeTrrack } from "@trrack/core";

function bubble({ parameters, setAnswer }) {
  const ref = useRef(null)
  const { image, question, radius } = parameters
  const [clicked, setClicked] = useState(null);
  const [size, setSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null);


  const { actions, trrack } = useMemo(() => {
    const reg = Registry.create();
    const clickAction = reg.register('click', (state, clickRecord) => {
      state.clickRecord = clickRecord;
      return state;
    });
    const trrackInst = initializeTrrack({
      registry: reg,
      initialState: { clickRecord: { timestamp: new Date().getTime() } },
    });
    return {
      actions: { clickAction },
      trrack: trrackInst,
    };
  }, []);

  // Update applyAnswer to record the click event via ttrack and include the ttrack provenance in the answer
  const clickCallback = useCallback((e) => {
    const svg = d3.select(ref.current)
    const point = d3.pointer(e, svg.node())
    const clickedCircle = { x: point[0], y: point[1] }
    setClicked(clickedCircle)
    const clickRecord = { x: clickedCircle.x, y: clickedCircle.y, radius: radius, multiplier: size.multiplier }
    trrack.apply('click', actions.clickAction(clickRecord));
    setAnswer({
      status: true,
      provenanceGraph: trrack.graph.backend,
      answers: {},
    });
  }, [actions, trrack, clicked, setAnswer, size, question]);



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
    };
  }, [image]);

  return (
    <div>
      <h3>Click on the image to reveal</h3>
      <Box ref={containerRef} className="ImageWrapper" style={{ width: "100%", display: "block" }}>
        <svg id="clickAccuracySvg" ref={ref} width={size.width} height={size.height} onClick={clickCallback} style={{border: "1px solid black"}}>
          <defs>
            <filter
              id="imageBlurFilter"
              x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
              <feComponentTransfer>
                <feFuncA type="linear" slope="2.5" />
              </feComponentTransfer>

            </filter>

            <mask id="unblurMask">
              <rect width="100%" height="100%" fill="white" />
              {clicked && <circle
                key={0}
                cx={clicked.x}
                cy={clicked.y}
                r={radius}
                fill="black"
              />}

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
          {clicked && <circle
            key={0}
            cx={clicked.x}
            cy={clicked.y}
            r={radius}
            fill="transparent"
            stroke="red"
          />}
        </svg>
      </Box>
    </div>
  )
}

export default bubble
