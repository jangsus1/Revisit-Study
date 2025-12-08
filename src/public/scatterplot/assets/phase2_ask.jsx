import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback } from "react";
import { Box, Button } from "@mantine/core";
import React from "react";
import { NormalSlider } from "./Slider";

function Phase2({ parameters, setAnswer }) {

  // Plot margins - same as phase1 to ensure identical plot area
  const plotMargin = React.useMemo(() => ({ top: 40, right: 40, bottom: 60, left: 60 }), []);
  
  // Additional space for labels (beyond the plot margins)
  const labelSpace = React.useMemo(() => ({ left: 110, right: 0, top: 0, bottom: 0 }), []);
  
  // Total margins including space for labels
  const margin = React.useMemo(() => ({ 
    top: plotMargin.top + labelSpace.top,
    right: plotMargin.right + labelSpace.right,
    bottom: plotMargin.bottom + labelSpace.bottom,
    left: plotMargin.left + labelSpace.left
  }), [plotMargin, labelSpace]);
  
  const dotPadding = 10; // Padding around dots
  
  // Fixed size - maintain same plot area as phase1 (500x500) with additional label space
  // Phase1: 600 total with margins → plot area 500
  // Phase2: Need plot area 500, with extra 110px for left label space
  const fixedSize = { 
    width: 600 + 110,  // 710 total (110 extra for left label)
    height: 600        // Same as phase1
  }

  const ref = useRef(null);
  const { coordinates, example, seconds, label_seconds, correlation, label, X, Y } = parameters;
  const [view, setView] = useState("scatter1"); // scatter1, slider1, scatter2, slider2
  const [corrEstimateBefore, setCorrEstimateBefore] = useState(0);
  const [corrEstimateAfter, setCorrEstimateAfter] = useState(0);
  const [slider1Value, setSlider1Value] = useState(0);
  const [slider1Interacted, setSlider1Interacted] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);
  const [hasClickedScatter2, setHasClickedScatter2] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  // Calculate scales based on fixed size
  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);

  // Reset state when entering scatter1 view
  useEffect(() => {
    if (view === "scatter1") {
      setHasClicked(false);
    }
  }, [view]);

  // Reset state when entering scatter2 view
  useEffect(() => {
    if (view === "scatter2") {
      setHasClickedScatter2(false);
      const displayTime = seconds - label_seconds;
      setRemainingTime(displayTime);
    }
  }, [view, seconds, label_seconds]);

  // Timer for scatter1: After click, show blurred labels for label_seconds, then transition to slider1
  useEffect(() => {
    if (view !== "scatter1") return;
    if (!hasClicked) return;
    if (label_seconds === undefined || label_seconds === null) return;
    
    const timer = setTimeout(() => {
      setView("slider1");
    }, label_seconds * 1000);
    
    return () => {
      clearTimeout(timer);
    };
  }, [view, hasClicked, label_seconds]);

  const answerCallback = useCallback((corrAfter) => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          coordinates: coordinates,
          label: label,
          X: X,
          Y: Y,
          corrEstimateBefore: corrEstimateBefore,
          corrEstimateAfter: corrAfter,
        })
      }
    });
    setCorrEstimateAfter(corrAfter);
  }, [setAnswer, corrEstimateBefore, correlation, coordinates, label, X, Y]);

  // Timer for scatter2: Show revealed labels for (seconds - label_seconds) after click, then transition to slider2
  useEffect(() => {
    if (view !== "scatter2") return;
    if (!hasClickedScatter2) return; // Only start timer after click
    
    const displayTime = seconds - label_seconds;
    if (displayTime <= 0) {
      answerCallback(corrEstimateBefore);
      setView("slider2");
      return;
    }
    
    // Update remaining time every second
    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          answerCallback(corrEstimateBefore);
          setView("slider2");
          return 0;
        }
        return newTime;
      });
    }, 1000);
    
    // Also set a timeout as backup to transition
    const timeout = setTimeout(() => {
      answerCallback(corrEstimateBefore);
      setView("slider2");
    }, displayTime * 1000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [view, hasClickedScatter2, seconds, label_seconds, answerCallback, corrEstimateBefore]);

  // Answer callback - only called from slider2
  

  // Handle Continue button click from slider1
  const handleContinue = useCallback(() => {
    setCorrEstimateBefore(slider1Value);
    setCorrEstimateAfter(slider1Value); // Initialize with same value
    setView("scatter2");
  }, [slider1Value]);

  // Draw scatterplot with D3 - for both scatter1 and scatter2 views
  useEffect(() => {
    if (view !== "scatter1" && view !== "scatter2") return;
    if (!ref.current || !coordinates || coordinates.length === 0) return;
    
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

    // Add X-axis label with class for later selection - centered on x-axis
    const xAxisCenter = margin.left + plotWidth / 2;
    svg.append('text')
      .attr('class', 'x-label')
      .attr('x', xAxisCenter)
      .attr('y', fixedSize.height - 10)
      .attr('text-anchor', 'middle')
      .attr('font-size', '20px')
      .attr('font-weight', 'bold')
      .text(X)
      .style('filter', 'blur(50px)')
      .style('transition', 'filter 0.1s');

    // Add Y-axis label with class for later selection - normally oriented and wrapped
    const yLabelWidth = 150; // Limited width for wrapping (more space for text)
    const yLabelHeight = Math.abs(yScale.range()[1] - yScale.range()[0]); // Height of the plot area
    const yLabelPadding = 5; // Padding from the y-axis
    
    const yLabelGroup = svg.append('g')
      .attr('class', 'y-label-group');
    
    // Create foreignObject with div for text wrapping - positioned to the left of y-axis and centered vertically
    const yAxisCenter = margin.top + plotHeight / 2;
    const foreignObject = yLabelGroup.append('foreignObject')
      .attr('x', margin.left - yLabelWidth - yLabelPadding)
      .attr('y', yAxisCenter - yLabelHeight / 2)
      .attr('width', yLabelWidth)
      .attr('height', yLabelHeight);
    
    // Use html() to insert the div with proper namespacing
    foreignObject.html(`
      <div xmlns="http://www.w3.org/1999/xhtml" class="y-label" style="
        width: ${yLabelWidth}px;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 20px;
        font-weight: bold;
        text-align: center;
        word-wrap: break-word;
        overflow-wrap: break-word;
        filter: blur(50px);
        transition: filter 0.1s;
      ">${Y}</div>
    `);

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

    if (!ref.current) return;
    if (view !== "scatter1" && view !== "scatter2") return;
    
    const shouldBlur = view === "scatter1"
    const filterValue = shouldBlur ? 'blur(50px)' : 'none';
    
    // Update existing label elements
    svg.select('.x-label').style('filter', filterValue);
    
    // Update y-label div inside foreignObject
    const yLabelDiv = svg.select('.y-label-group foreignObject').node();
    if (yLabelDiv) {
      const div = yLabelDiv.querySelector('.y-label');
      if (div) {
        div.style.filter = filterValue;
      }
    }

  }, [view, coordinates, xScale, yScale, fixedSize, margin, X, Y]);

  // Handle click to start scatter1
  const handleClick = useCallback(() => {
    if (!hasClicked && view === "scatter1") {
      setHasClicked(true);
      // SVG blur is removed, but labels remain blurred (controlled by isBlurred state)
      // Labels will stay blurred for label_seconds duration
    }
  }, [hasClicked, view]);

  // Handle click to start scatter2
  const handleClickScatter2 = useCallback(() => {
    if (!hasClickedScatter2 && view === "scatter2") {
      setHasClickedScatter2(true);
      // Labels are already visible (not blurred), just remove overlay and start timer
    }
  }, [hasClickedScatter2, view]);

  return (
    <div>
      {example && (
        <h1 style={{ color: "red" }}>Example Question</h1>
      )}
      
      {/* Scatterplot 1: Blurred labels */}
      {(view === "scatter1") && (
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
                filter: !hasClicked ? 'blur(50px)' : 'none',
                transition: 'filter 0.1s',
                cursor: !hasClicked ? 'pointer' : 'default'
              }}
              onClick={handleClick}
            />
            {!hasClicked && (
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
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}
              >
                You have {label_seconds} seconds to estimate the correlation. <br />  Click to start!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slider 1: First correlation estimate */}
      {view === "slider1" && (
        <div style={{ width: '50%', margin: '50px auto', textAlign: 'center' }}>
          <h3>Estimate the correlation of the scatterplot you saw.</h3>
          <NormalSlider
            value={slider1Value}
            setValue={(value) => {
              setSlider1Value(value);
              setSlider1Interacted(true);
            }}
            min={0}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <Button disabled={!slider1Interacted} onClick={handleContinue}>Continue</Button>
          </div>
        </div>
      )}

      {/* Scatterplot 2: Labels always visible, overlay before click */}
      {view === "scatter2" && (
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          padding: "10px"
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
                filter: !hasClickedScatter2 ? 'blur(50px)' : 'none',
                transition: 'filter 0.1s',
                cursor: !hasClickedScatter2 ? 'pointer' : 'default'
              }}
              onClick={handleClickScatter2}
            />
            {!hasClickedScatter2 && (
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
                }}
              >
                You have additional {seconds - label_seconds} seconds to adjust the estimation. <br /><br />
                Variables: <br />
                X: {X} <br /> 
                Y: {Y} <br />
                <br />
                Click to continue!
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slider 2: Update correlation estimate */}
      {view === "slider2" && (
        <div style={{ width: '50%', margin: '50px auto', textAlign: 'center' }}>
          <h3>You may choose to revise your answer for the final prediction.</h3>
          <NormalSlider
            value={corrEstimateAfter}
            setValue={answerCallback}
            min={0}
            max={1}
            step={0.01}
            tickInterval={0.2}
          />
        </div>
      )}
    </div>
  );
}

export default Phase2;