import { useState, useCallback } from "react";
import { NormalSlider } from "./Slider";
import React from "react";

function Phase3({ parameters, setAnswer }) {
  const { label, X, Y } = parameters;
  const [belief, setBelief] = useState(0.5);

  // Answer callback - called when belief slider is touched
  const answerCallback = useCallback((newBelief) => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          label: label,
          X: X,
          Y: Y,
          belief: (newBelief - 1) / 6,
        })
      }
    });
    setBelief(newBelief);
  }, [setAnswer, label, X, Y]);

  return (
    <div style={{ width: '50%', margin: '50px auto', textAlign: 'center' }}>
      <h3>How much do you believe this statement?</h3>
      <h3>{label}</h3>
      <div style={{ marginBottom: 100 }}>
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
    </div>
  );
}

export default Phase3;

