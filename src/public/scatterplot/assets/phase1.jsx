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
  
  // Fixed size for everything
  const fixedSize = { width: 600, height: 600 }
  
  const [view, setView] = useState("scatter") // scatter, slider, feedback
  const [slider, setSlider] = useState(0)
  const [sliderInteracted, setSliderInteracted] = useState(false)
  const [isBlurred, setIsBlurred] = useState(true)
  const [hasClicked, setHasClicked] = useState(false)
  const [countdown, setCountdown] = useState(2)
  
  // Calculate scales based on fixed size
  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);

  // Reset blur state when entering scatter view
  useEffect(() => {
    if (view === "scatter") {
      setIsBlurred(true);
      setHasClicked(false);
    }
  }, [view]);

  // Draw scatterplot with D3
  useEffect(() => {
    if (view !== "scatter" && view !== "feedback") return;
    if (!coordinates || coordinates.length === 0) return;
    if (!ref.current) return;
    
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    // Use fixed size
    svg.attr('width', fixedSize.width).attr('height', fixedSize.height);

    // Add proper axes with visible lines
    const xAxis = d3.axisBottom(xScale).tickSize(0).tickFormat(() => '');
    const yAxis = d3.axisLeft(yScale).tickSize(0).tickFormat(() => '');

    // X-axis
    svg.append('g')
      .attr('transform', `translate(0, ${fixedSize.height - margin.bottom})`)
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
    const plotRight = fixedSize.width - margin.right;
    const plotTop = margin.top;
    const plotBottom = fixedSize.height - margin.bottom;
    
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
  }, [view, coordinates, xScale, yScale, fixedSize, margin]);

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
    const timer = setTimeout(() => {
      setView("slider")
    }, seconds * 1000)
    return () => clearTimeout(timer)
  }, [hasClicked, seconds])


  const answerCallback = useCallback(() => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          coordinates: coordinates,
          corr_est: slider,
          corr_act: correlation,
          size: fixedSize,
        })
      }
    })
  }, [slider, correlation, setAnswer, coordinates, fixedSize])


  const jobDone = () => {
    setView("feedback")
  }

  // Timer to call answerCallback 2 seconds after feedback view is shown
  useEffect(() => {
    if (view !== "feedback") return;
    
    // Call answerCallback after 2 seconds
    const callbackTimer = setTimeout(() => {
      answerCallback();
    }, 2000);
    
    return () => {
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
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          padding: "20px"
        }}>
          <div 
            style={{ 
              display: 'inline-block',
              position: 'relative'
            }}
          >
            <svg 
              id="clickAccuracySvg" 
              ref={ref} 
              width={fixedSize.width} 
              height={fixedSize.height}
              style={{ 
                display: 'block', 
                filter: isBlurred ? 'blur(50px)' : 'none',
                transition: 'filter 0.1s',
                cursor: isBlurred ? 'pointer' : 'default'
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
        </div>
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
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: "100%",
          padding: "20px"
        }}>
          <div 
            style={{ 
              display: 'inline-block',
              position: 'relative',
              marginBottom: '20px'
            }}
          >
            <svg 
              id="feedbackSvg" 
              ref={ref} 
              width={fixedSize.width} 
              height={fixedSize.height}
              style={{ 
                display: 'block'
              }}
            />
          </div>
          <div style={{ textAlign: 'center' }}>
            <h2>Actual correlation: {correlation.toFixed(2)}</h2>
            <h2>Your estimation: {slider.toFixed(2)} ({diff>0 ? "+" : ''}{diff.toFixed(2)})</h2>
          </div>
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
