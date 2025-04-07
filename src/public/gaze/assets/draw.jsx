import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback, useMemo } from "react"
import { Box, Button, Slider } from "@mantine/core"
import React from "react"
import _ from "lodash";
import DivergingSlider from "./Slider"
// Import ttrack modules
import { Registry, initializeTrrack } from "@trrack/core";

function Draw({ parameters, setAnswer }) {
  const ref = useRef(null)
  const { image, label, X, Y } = parameters
  const [clicked, setClicked] = useState([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [view, setView] = useState("remember", "draw", "report") // scatter, corrbefore, corrafter, belief
  const [corrAfter, setCorrAfter] = useState(0)
  const [remember, setRemember] = useState(4)
  const containerRef = useRef(null);

  // Initialize ttrack with a registry and click action
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
    return { actions: { clickAction }, trrack: trrackInst };
  }, []);


  // Answer callback for the slider in the "corrafter" view
  const answerCallback = useCallback((corrAfter) => {
    setAnswer({
      answers: {
        status: true,
        answer: JSON.stringify({
          clicked: clicked,
          remember: remember,
          corrAfter: corrAfter,
        })
      },
      provenanceGraph: trrack.graph.backend,
    })
    setCorrAfter(corrAfter)
  }, [clicked, trrack, setAnswer])

  // Adjust image size when in scatter view
  useEffect(() => {
    if (view !== "draw") return;
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
      const multiplier = scaledWidth / img.width
      setSize({ width: scaledWidth, height: scaledHeight, multiplier: multiplier });
    };
  }, [image, view]);

  // Click callback that records click events and tracks them with ttrack
  const clickCallback = useCallback((e) => {
    const svg = d3.select(ref.current)
    const point = d3.pointer(e, svg.node())
    const clickedCircle = { x: parseInt(point[0]), y: parseInt(point[1]) }
    if (clicked.length >= 20) {
      alert("You have already clicked 20 points. Please click Done Button.");
      return;
    }
    const newClicked = [...clicked, clickedCircle]
    setClicked(newClicked)
    // Create a click record with current radius and image scale multiplier
    const clickRecord = { x: clickedCircle.x, y: clickedCircle.y, multiplier: size.multiplier }
    trrack.apply('click', actions.clickAction(clickRecord));
  }, [clicked, size, trrack, actions]);

  return (
    <div>
      {view === "draw" && (
        <div>
          <h3>Please draw the scatterplot you recall. You have {20 - clicked.length} points left to draw.</h3>
          <Box ref={containerRef} className="ImageWrapper" style={{
            display: "flex",
            justifyContent: "center",  // Centers horizontally
            width: "100%",
          }}>
            <svg id="clickAccuracySvg" ref={ref} width={size.width} height={size.height} onClick={clickCallback} style={{ border: "1px solid black", marginRight: 10 }}>

              <image
                href={image}
                width={size.width}
                height={size.height}
              />
              {clicked.map(c => (
                <circle
                  key={0}
                  cx={c.x}
                  cy={c.y}
                  r={5}
                  fill="black"
                  stroke="black"
                />
              ))}
            </svg>
            <Button disabled={clicked.length < 20} onClick={() => setView("corrafter")}>Done</Button>
          </Box>
          
        </div>
      )}

      {view === "corrafter" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>Estimate the correlation of the scatterplot.</h3>
          <h3>X: {X}</h3>
          <h3>Y: {Y}</h3>

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

      {view === "remember" && (
        <div style={{ width: '50%', margin: '50px auto' }}>
          <h3>How much do you remember about this scatterplot that you've seen?</h3>
          <h3>X: {X}</h3>
          <h3>Y: {Y}</h3>

          <div style={{ marginBottom: 100, marginTop: 100 }}>

            <DivergingSlider
              value={remember}
              setValue={setRemember}
              min={1}
              max={7}
              center={4}
              step={1}
              leftLabel="Definitely No"
              rightLabel="Definitely Yes"
              tickInterval={1}
            />

          </div>
          <Button onClick={() => setView("draw")}>Done</Button>
        </div>
      )}
    </div>
  )
}

export default Draw