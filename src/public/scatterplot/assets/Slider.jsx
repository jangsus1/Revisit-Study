import { useState } from "react";

export function NormalSlider({ value, setValue, leftLabel = "", rightLabel = "", min = 0, max = 10, step = 0.1, tickInterval = 1, onClick = () => {} }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Normalize value to a percentage [0, 100] within the given min-max range
  const percentage = ((value - min) / (max - min)) * 100;

  // Single color scheme for normal slider
  const activeColor = "#4DABF7";
  const activeColorDark = "#339AF0";

  // Simple gradient from start to value
  const background = `linear-gradient(
    to right,
    ${activeColor} 0%,
    ${activeColor} ${percentage}%,
    #E9ECEF ${percentage}%,
    #E9ECEF 100%
  )`;

  // Generate tick marks from min to max
  const tickMarks = [];
  for (let i = min; i <= max; i += tickInterval) {
    tickMarks.push(i);
  }

  return (
    <div 
      style={{ 
        position: "relative", 
        width: "100%", 
        maxWidth: "700px", 
        margin: "40px auto",
        padding: "20px 10px 40px 10px"
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Value display tooltip */}
      {(isHovered || isDragging) && (
        <div
          style={{
            position: "absolute",
            left: `calc(${percentage}% + ${12 - percentage * 0.24}px)`,
            transform: "translateX(-50%)",
            top: "-45px",
            backgroundColor: activeColorDark,
            color: "white",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "16px",
            fontWeight: "600",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {value.toFixed(2)}
          <div
            style={{
              position: "absolute",
              bottom: "-6px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `6px solid ${activeColorDark}`,
            }}
          />
        </div>
      )}

      {/* Track container */}
      <div style={{ position: "relative", width: "100%", padding: "0", margin: "0", overflow: "visible", height: "12px" }}>
        {/* Visual track background that spans full width */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: "50%",
            transform: "translateY(-50%)",
            height: "12px",
            borderRadius: "6px",
            background: "#E9ECEF",
            zIndex: 1,
          }}
        />
        {/* Active track portion */}
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `calc(${percentage}% + ${12 - percentage * 0.24}px)`,
            top: "50%",
            transform: "translateY(-50%)",
            height: "12px",
            borderRadius: "6px",
            background: activeColor,
            zIndex: 1,
            transition: isDragging ? "none" : "width 0.3s ease",
          }}
        />
        {/* Slider input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onClick={onClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onChange={(e) => setValue(parseFloat(e.target.value))}
          style={{
            width: "100%",
            appearance: "none",
            height: "12px",
            borderRadius: "6px",
            outline: "none",
            cursor: "pointer",
            position: "relative",
            zIndex: 2,
            margin: 0,
            padding: 0,
            boxSizing: "border-box",
            background: "transparent",
          }}
        />
      </div>

      {/* Thumb styling */}
      <style>
        {`
          input[type="range"] {
            -webkit-appearance: none;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          
          input[type="range"]::-webkit-slider-runnable-track {
            width: 100%;
            height: 12px;
            border-radius: 6px;
            background: transparent;
            margin: 0;
            padding: 0;
          }
          
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: ${isHovered || isDragging ? "28px" : "24px"};
            height: ${isHovered || isDragging ? "28px" : "24px"};
            background: ${activeColorDark};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), 0 0 0 ${isHovered || isDragging ? "4px" : "0px"} ${activeColor}40;
            transition: all 0.2s ease;
            margin-top: -6px;
          }
          input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 4px ${activeColor}40;
          }
          input[type="range"]::-webkit-slider-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 6px ${activeColor}40;
          }
          
          input[type="range"]::-moz-range-track {
            width: 100%;
            height: 12px;
            border-radius: 6px;
            background: transparent;
            border: none;
          }
          
          input[type="range"]::-moz-range-thumb {
            width: ${isHovered || isDragging ? "28px" : "24px"};
            height: ${isHovered || isDragging ? "28px" : "24px"};
            background: ${activeColorDark};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
          }
          input[type="range"]::-moz-range-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          input[type="range"]::-moz-range-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          }
        `}
      </style>

      {/* Tick marks and labels - positioned to match slider thumb range */}
      <div
        style={{
          position: "relative",
          width: "calc(100% - 24px)",
          marginTop: "8px",
          marginLeft: "12px",
          marginRight: "12px",
          boxSizing: "border-box",
        }}
      >
        {tickMarks.map((mark, idx) => {
          const isActive = Math.abs(mark - value) < tickInterval / 2;
          const tickPercent = ((mark - min) / (max - min)) * 100;
          
          return (
            <div
              key={mark}
              style={{
                position: "absolute",
                left: `${tickPercent}%`,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {/* Tick mark */}
              <div
                style={{
                  width: "3px",
                  height: "14px",
                  backgroundColor: isActive ? activeColorDark : "#ADB5BD",
                  borderRadius: "1.5px",
                  transition: "all 0.2s ease",
                }}
              />
              
              {/* Value label */}
              <span
                style={{
                  fontSize: "15px",
                  fontWeight: isActive ? "700" : "600",
                  color: isActive ? activeColorDark : "#495057",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                  minWidth: "40px",
                }}
              >
                {mark.toFixed(1)}
              </span>
              
              {/* Text labels */}
              {(leftLabel && idx === 0) && (
                <span
                  style={{
                    fontSize: "14px",
                    color: "#495057",
                    fontWeight: "600",
                    marginTop: "4px",
                    textAlign: "center",
                  }}
                >
                  {leftLabel}
                </span>
              )}
              {(rightLabel && idx === tickMarks.length - 1) && (
                <span
                  style={{
                    fontSize: "14px",
                    color: "#495057",
                    fontWeight: "600",
                    marginTop: "4px",
                    textAlign: "center",
                  }}
                >
                  {rightLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DivergingSlider({ value, setValue, leftLabel = "", rightLabel = "", min = -1, max = 1, step = 0.01, tickInterval = 0.2, center = 0, onClick = () => {} }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Normalize value to a percentage [0, 100] within the given min-max range
  const percentage = ((value - min) / (max - min)) * 100;
  const middlePercentage = ((center - min) / (max - min)) * 100;

  // Determine colors based on position relative to center
  const isPositive = value >= center;
  const activeColor = isPositive ? "#4DABF7" : "#FF6B6B";
  const activeColorDark = isPositive ? "#339AF0" : "#EE5A6F";

  // Background gradient calculation with dynamic center
  const background =
    value >= center
      ? `linear-gradient(
          to right,
          #E9ECEF 0%,
          #E9ECEF ${middlePercentage}%,
          ${activeColor} ${middlePercentage}%,
          ${activeColor} ${percentage}%,
          #E9ECEF ${percentage}%,
          #E9ECEF 100%
        )`
      : `linear-gradient(
          to right,
          #E9ECEF 0%,
          #E9ECEF ${percentage}%,
          ${activeColor} ${percentage}%,
          ${activeColor} ${middlePercentage}%,
          #E9ECEF ${middlePercentage}%,
          #E9ECEF 100%
        )`;

  // Generate tick marks starting from center in both directions
  const tickMarks = [];
  for (let i = center; i <= max; i += tickInterval) tickMarks.push(i);
  for (let i = center - tickInterval; i >= min; i -= tickInterval) tickMarks.push(i);
  
  // Sort tick marks
  tickMarks.sort((a, b) => a - b);

  return (
    <div 
      style={{ 
        position: "relative", 
        width: "100%", 
        maxWidth: "700px", 
        margin: "40px auto",
        padding: "20px 10px 30px 10px"
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Value display tooltip */}
      {(isHovered || isDragging) && (
        <div
          style={{
            position: "absolute",
            left: `${percentage}%`,
            transform: "translateX(-50%)",
            top: "-45px",
            backgroundColor: activeColorDark,
            color: "white",
            padding: "6px 12px",
            borderRadius: "8px",
            fontSize: "14px",
            fontWeight: "600",
            whiteSpace: "nowrap",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          {value.toFixed(2)}
          <div
            style={{
              position: "absolute",
              bottom: "-6px",
              left: "50%",
              transform: "translateX(-50%)",
              width: 0,
              height: 0,
              borderLeft: "6px solid transparent",
              borderRight: "6px solid transparent",
              borderTop: `6px solid ${activeColorDark}`,
            }}
          />
        </div>
      )}

      {/* Track container */}
      <div style={{ position: "relative", width: "100%", padding: "12px 0" }}>
        {/* Center indicator line */}
        <div
          style={{
            position: "absolute",
            left: `${middlePercentage}%`,
            top: "12px",
            width: "2px",
            height: "12px",
            backgroundColor: "#868E96",
            transform: "translateX(-50%)",
            zIndex: 1,
            borderRadius: "1px",
          }}
        />
        
        {/* Slider input */}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onClick={onClick}
          onMouseDown={() => setIsDragging(true)}
          onMouseUp={() => setIsDragging(false)}
          onChange={(e) => setValue(parseFloat(e.target.value))}
          style={{
            width: "100%",
            appearance: "none",
            height: "12px",
            borderRadius: "6px",
            background,
            outline: "none",
            transition: isDragging ? "none" : "background 0.3s ease",
            cursor: "pointer",
            position: "relative",
            zIndex: 2,
          }}
        />
      </div>

      {/* Thumb styling */}
      <style>
        {`
          input[type="range"]::-webkit-slider-thumb {
            appearance: none;
            width: ${isHovered || isDragging ? "28px" : "24px"};
            height: ${isHovered || isDragging ? "28px" : "24px"};
            background: ${activeColorDark};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2), 0 0 0 ${isHovered || isDragging ? "4px" : "0px"} ${activeColor}40;
            transition: all 0.2s ease;
          }
          input[type="range"]::-webkit-slider-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3), 0 0 0 4px ${activeColor}40;
          }
          input[type="range"]::-webkit-slider-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4), 0 0 0 6px ${activeColor}40;
          }
          
          input[type="range"]::-moz-range-thumb {
            width: ${isHovered || isDragging ? "28px" : "24px"};
            height: ${isHovered || isDragging ? "28px" : "24px"};
            background: ${activeColorDark};
            border: 3px solid white;
            border-radius: 50%;
            cursor: pointer;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
            transition: all 0.2s ease;
          }
          input[type="range"]::-moz-range-thumb:hover {
            transform: scale(1.1);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          }
          input[type="range"]::-moz-range-thumb:active {
            transform: scale(1.15);
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
          }
          
          input[type="range"]::-moz-range-track {
            height: 12px;
            border-radius: 6px;
          }
        `}
      </style>

      {/* Tick marks and labels */}
      <div
        style={{
          position: "relative",
          width: "100%",
          marginTop: "8px",
        }}
      >
        {tickMarks.map((mark, idx) => {
          const isCenter = Math.abs(mark - center) < step / 2;
          const isActive = Math.abs(mark - value) < tickInterval / 2;
          
          return (
            <div
              key={mark}
              style={{
                position: "absolute",
                left: `${((mark - min) / (max - min)) * 100}%`,
                transform: "translateX(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "4px",
              }}
            >
              {/* Tick mark */}
              <div
                style={{
                  width: isCenter ? "3px" : "2px",
                  height: isCenter ? "16px" : "12px",
                  backgroundColor: isCenter ? "#495057" : isActive ? activeColorDark : "#CED4DA",
                  borderRadius: "1px",
                  transition: "all 0.2s ease",
                }}
              />
              
              {/* Value label */}
              <span
                style={{
                  fontSize: isCenter ? "14px" : "13px",
                  fontWeight: isCenter || isActive ? "600" : "500",
                  color: isCenter ? "#495057" : isActive ? activeColorDark : "#868E96",
                  transition: "all 0.2s ease",
                  textAlign: "center",
                  minWidth: "40px",
                }}
              >
                {mark.toFixed(1)}
              </span>
              
              {/* Text labels */}
              {(leftLabel && idx === 0) && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "#868E96",
                    fontWeight: "500",
                    marginTop: "2px",
                    textAlign: "center",
                  }}
                >
                  {leftLabel}
                </span>
              )}
              {(rightLabel && idx === tickMarks.length - 1) && (
                <span
                  style={{
                    fontSize: "11px",
                    color: "#868E96",
                    fontWeight: "500",
                    marginTop: "2px",
                    textAlign: "center",
                  }}
                >
                  {rightLabel}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
