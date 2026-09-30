import { useState, useCallback } from "react";
import React from "react";
import { Button } from "@mantine/core";
import { NormalSlider } from "./Slider";
import { Panel } from "./FullScreen";

// Task 1: belief rating for one statement, in the study's single page layout (Panel). The answer is
// saved when the slider is moved; Next (enabled after that) advances.
function Phase3({ parameters, setAnswer, advance }) {
  const { label, X, Y } = parameters;
  const [belief, setBelief] = useState(0.5);
  const [touched, setTouched] = useState(false);

  const answerCallback = useCallback((newBelief) => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          label: label,
          X: X,
          Y: Y,
          estimatedBelief: newBelief,
        })
      }
    });
    setBelief(newBelief);
    setTouched(true);
  }, [setAnswer, label, X, Y]);

  return (
    <Panel
      kicker="Task 1 of 3"
      title="How much do you believe this statement?"
      maxWidth={720}
      actions={<Button size="lg" disabled={!touched} onClick={() => advance?.()}>Next</Button>}
    >
      <div style={{ fontSize: 24, fontWeight: 600, color: "#222", margin: "18px 0 0" }}>“{label}”</div>
      <div style={{ width: 640, maxWidth: "90vw" }}>
        <NormalSlider
          value={belief}
          setValue={answerCallback}
          leftLabel="Not at all"
          rightLabel="Completely"
          min={0}
          max={1}
          step={0.01}
          tickInterval={0.1}
        />
      </div>
    </Panel>
  );
}

export default Phase3;
