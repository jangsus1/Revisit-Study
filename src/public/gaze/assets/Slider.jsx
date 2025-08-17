export default function DivergingSlider({ value, setValue, leftLabel = "", rightLabel = "", min = -1, max = 1, step = 0.01, tickInterval = 0.2, center = 0, onClick = () => {} }) {
  // Normalize value to a percentage [0, 100] within the given min-max range
  const percentage = ((value - min) / (max - min)) * 100;
  const middlePercentage = ((center - min) / (max - min)) * 100; // Normalize center to percentage scale

  // Background gradient calculation with dynamic center
  const background =
    value >= center
      ? `linear-gradient(
          to right,
          lightgray 0%,
          lightgray ${middlePercentage}%,
          #228BE6 ${middlePercentage}%,
          #228BE6 ${percentage}%,
          lightgray ${percentage}%,
          lightgray 100%
        )`
      : `linear-gradient(
          to right,
          lightgray 0%,
          lightgray ${percentage}%,
          #228BE6 ${percentage}%,
          #228BE6 ${middlePercentage}%,
          lightgray ${middlePercentage}%,
          lightgray 100%
        )`;

  // Generate tick marks starting from center in both directions
  const tickMarks = [];
  for (let i = center; i <= max; i += tickInterval) tickMarks.push(i);
  for (let i = center - tickInterval; i >= min; i -= tickInterval) tickMarks.push(i);
  return (
    <div style={{ position: "relative", width: "100%", maxWidth: "600px", margin: "50px auto" }}>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onClick={onClick}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        style={{
          width: "100%",
          appearance: "none",
          height: "8px",
          borderRadius: "4px",
          background,
          outline: "none",
          transition: "background 0.2s",
        }}
      />

      {/* Thumb styling */}
      <style>
        {`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: 20px;
            height: 20px;
            background: white;
            border: 3px solid black;
            border-radius: 50%;
            cursor: pointer;
          }
          input[type="range"]::-moz-range-thumb {
            width: 20px;
            height: 20px;
            background: white;
            border: 3px solid black;
            border-radius: 50%;
            cursor: pointer;
          }
        `}
      </style>

      {/* Label Ticks */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          width: "100%",
          marginTop: "10px",
          fontSize: "14px",
          color: "gray",
        }}
      >
        {tickMarks.map((mark, idx) => (
          <span
            key={mark}
            style={{
              position: "absolute",
              left: `${((mark - min) / (max - min)) * 100}%`,
              transform: "translateX(-10%)",
              top: "15px",
              width: "50px",
            }}
          > <>
          {mark.toFixed(1)}
          <br/>
          {idx === tickMarks.length - 1 && leftLabel}
          {idx === 3 && rightLabel}
          </>
            
          </span>
        ))}
      </div>
    </div>
  );
}
