import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback } from "react"
import { Box, Button } from "@mantine/core"
import React from "react"
import { NormalSlider } from "./Slider"


// timer for 5 seconds

function Plain({ parameters, setAnswer }) {
  const ref = useRef(null)
  const { coordinates, example, correlation, seconds, label_seconds } = parameters
  
  // Margins for axes
  const margin = { top: 40, right: 40, bottom: 60, left: 60 }
  const dotPadding = 10 // Padding around dots
  
  // Default size fallback
  const defaultSize = { width: 500, height: 500 }
  
  const [size, setSize] = useState(defaultSize)
  const [view, setView] = useState("scatter") // scatter, slider, feedback
  const containerRef = useRef(null);
  const [slider, setSlider] = useState(0)
  const [sliderInteracted, setSliderInteracted] = useState(false)
  const [isBlurred, setIsBlurred] = useState(true)
  const [hasClicked, setHasClicked] = useState(false)
  const [countdown, setCountdown] = useState(2)
  const [xScale, setXScale] = useState(() => {
    const defaultPlotWidth = defaultSize.width - margin.left - margin.right;
    return d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + defaultPlotWidth]);
  })
  const [yScale, setYScale] = useState(() => {
    const defaultPlotHeight = defaultSize.height - margin.top - margin.bottom;
    return d3.scaleLinear().domain([0, 1]).range([margin.top + defaultPlotHeight - dotPadding, margin.top]);
  })

  // Reset blur state when entering scatter view
  useEffect(() => {
    if (view === "scatter") {
      setIsBlurred(true);
      setHasClicked(false);
    }
  }, [view]);

  // Calculate size based on container
  useEffect(() => {
    if (view !== "scatter") return;
    
    const calculateSize = () => {
      if (!containerRef.current) {
        // Use default size if container not ready
        const width = defaultSize.width - margin.left - margin.right;
        const height = defaultSize.height - margin.top - margin.bottom;
        setSize(defaultSize);
        const defaultPlotWidth = defaultSize.width - margin.left - margin.right;
        const defaultPlotHeight = defaultSize.height - margin.top - margin.bottom;
        // X: padding from left border, no padding on right
        setXScale(d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + defaultPlotWidth]));
        // Y: padding from bottom border, no padding on top
        setYScale(d3.scaleLinear().domain([0, 1]).range([margin.top + defaultPlotHeight - dotPadding, margin.top]));
        return;
      }
      
      const parent = containerRef.current;
      const rect = parent.getBoundingClientRect();
      const availableHeight = window.innerHeight - rect.top - 200;
      const availableWidth = window.innerWidth - 120;
      
      // Use a reasonable aspect ratio for scatterplot
      const aspectRatio = 1.0;
      let width, height;
      if (availableHeight * aspectRatio <= availableWidth) {
        height = Math.max(500, availableHeight);
        width = height * aspectRatio;
      } else {
        width = Math.max(500, availableWidth);
        height = width / aspectRatio;
      }
      
      const newSize = { 
        width: width + margin.left + margin.right, 
        height: height + margin.top + margin.bottom 
      };
      
      // Only update if size actually changed to prevent infinite loop
      if (newSize.width !== size.width || newSize.height !== size.height) {
        setSize(newSize);
      }
      
      // Set up scales with padding from left and bottom borders
      // Calculate the actual plot area
      const plotWidth = width;
      const plotHeight = height;
      // X: padding from left border, no padding on right
      setXScale(d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]));
      // Y: padding from bottom border, no padding on top
      setYScale(d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]));
    };
    
    // Calculate immediately
    calculateSize();
    
    // Also recalculate after a short delay to ensure DOM is ready
    const timeoutId = setTimeout(calculateSize, 100);
    
    // Handle window resize
    window.addEventListener('resize', calculateSize);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', calculateSize);
    };
  }, [view, dotPadding, margin]);

  // Draw scatterplot with D3
  useEffect(() => {
    if (view !== "scatter") return;
    if (!ref.current || !xScale || !yScale || !coordinates || coordinates.length === 0) return;
    if (!size.width || !size.height || size.width === 0 || size.height === 0) return;
    
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    // Ensure SVG has proper dimensions
    svg.attr('width', size.width).attr('height', size.height);

    // Add proper axes with visible lines
    const xAxis = d3.axisBottom(xScale).tickSize(0).tickFormat(() => '');
    const yAxis = d3.axisLeft(yScale).tickSize(0).tickFormat(() => '');

    // X-axis
    svg.append('g')
      .attr('transform', `translate(0, ${size.height - margin.bottom})`)
      .call(xAxis)
      .selectAll('path')
      .style('stroke', '#000')
      .style('stroke-width', 2);

    // Y-axis
    svg.append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(yAxis)
      .selectAll('path')
      .style('stroke', '#000')
      .style('stroke-width', 2);

    // Add only left and bottom borders
    const plotLeft = margin.left;
    const plotRight = size.width - margin.right;
    const plotTop = margin.top;
    const plotBottom = size.height - margin.bottom;
    
    // Left border
    svg.append('line')
      .attr('x1', plotLeft)
      .attr('y1', plotTop)
      .attr('x2', plotLeft)
      .attr('y2', plotBottom)
      .style('stroke', '#000')
      .style('stroke-width', 2);
    
    // Bottom border
    svg.append('line')
      .attr('x1', plotLeft)
      .attr('y1', plotBottom)
      .attr('x2', plotRight)
      .attr('y2', plotBottom)
      .style('stroke', '#000')
      .style('stroke-width', 2);

    // Add scatter points
    svg.selectAll('.dot')
      .data(coordinates)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d[0]))
      .attr('cy', d => yScale(d[1]))
      .attr('r', 3)
      .attr('fill', 'black');

  }, [view, coordinates, xScale, yScale, size, margin]);

  // Handle click to remove blur
  const handleClick = useCallback(() => {
    if (!hasClicked) {
      setIsBlurred(false);
      setHasClicked(true);
    }
  }, [hasClicked]);

  // timer for 5 seconds to change view - starts after click
  useEffect(() => {
    if (!hasClicked) return;
    if (!size.width) return;
    const timer = setTimeout(() => {
      setView("slider")
    }, seconds * 1000)
    return () => clearTimeout(timer)
  }, [hasClicked, size.width, seconds])


  const answerCallback = useCallback(() => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          coordinates: coordinates,
          corr_est: slider,
          corr_act: correlation,
          size: size,
        })
      }
    })
  }, [slider, correlation, setAnswer, coordinates, size])


  const jobDone = () => {
    setView("feedback")
  }

  // Timer to call answerCallback 2 seconds after feedback view is shown
  useEffect(() => {
    if (view !== "feedback") return;
    
    // Reset countdown when entering feedback view
    setCountdown(2);
    
    // Countdown timer that updates every second
    const countdownInterval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownInterval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    // Call answerCallback after 2 seconds
    const callbackTimer = setTimeout(() => {
      answerCallback();
    }, 2000);
    
    return () => {
      clearInterval(countdownInterval);
      clearTimeout(callbackTimer);
    };
  }, [view, answerCallback]);

  const diff = slider - correlation;

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
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          position: "relative",
          minHeight: `${defaultSize.height}px`,
          padding: "20px"
        }}>
          <div 
            style={{ 
              display: 'inline-block',
              position: 'relative',
              overflow: 'visible'
            }}
          >
            <svg 
              id="clickAccuracySvg" 
              ref={ref} 
              width={size.width || defaultSize.width} 
              height={size.height || defaultSize.height}
              style={{ 
                display: 'block', 
                filter: isBlurred ? 'blur(50px)' : 'none',
                transition: 'filter 0.1s',
                cursor: isBlurred ? 'pointer' : 'default',
                overflow: 'visible'
              }}
              onClick={handleClick}
            />
            {isBlurred && (
              <div 
                style={{ 
                  position: 'absolute', 
                  top: '50%', 
                  left: '50%', 
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: '#666',
                  zIndex: 10,
                  whiteSpace: 'nowrap'
                }}
              >
                Click to reveal the scatterplot
              </div>
            )}
          </div>
        </Box>
      )}

      {view === "slider" && (
        <div style={{ width: '80%', margin: '50px auto', textAlign: 'center' }}>
          <h2>Predict the Correlation!</h2>
          <NormalSlider
            value={slider}
            setValue={(value) => {
              setSlider(value);
              setSliderInteracted(true);
            }}
            min={0}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <Button disabled={!sliderInteracted} onClick={jobDone}>Done</Button>
          </div>
        </div>
      )}

      {view === "feedback" && (
        <div>
          <h2>Actual correlation: {correlation.toFixed(2)}</h2>
          <h2>Your estimation: {slider.toFixed(2)} ({diff>0 ? "+" : ''}{diff.toFixed(2)})</h2>
          {/* {countdown > 0 && (
            <Box
              style={{
                margin: '30px auto',
                padding: '20px',
                border: '2px solid #333',
                borderRadius: '8px',
                backgroundColor: '#f5f5f5',
                textAlign: 'center',
                maxWidth: '400px'
              }}
            >
              <p style={{ fontSize: '18px', margin: 0 }}>
               {countdown} second{countdown !== 1 ? 's' : ''} left
              </p>
            </Box>
          )} */}
        </div>
      )}


    </div>
  )
}

export default Plain
