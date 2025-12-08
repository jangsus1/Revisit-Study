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
  const { coordinates, example, label_intervals, correlation, label, X, Y } = parameters;
  
  // New state management for dynamic intervals
  const [currentIntervalIndex, setCurrentIntervalIndex] = useState(0);
  const [currentPhase, setCurrentPhase] = useState("scatter"); // "scatter" | "slider"
  const [estimates, setEstimates] = useState([]); // Array of correlation estimates after each interval
  const [currentSliderValue, setCurrentSliderValue] = useState(0);
  const [sliderInteracted, setSliderInteracted] = useState(false);
  const [hasClicked, setHasClicked] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  // Get current interval configuration
  const currentInterval = label_intervals && label_intervals[currentIntervalIndex];
  const showLabels = currentInterval ? currentInterval[0] : false;
  const duration = currentInterval ? currentInterval[1] : 0;
  const totalIntervals = label_intervals ? label_intervals.length : 0;
  const isLastInterval = currentIntervalIndex >= totalIntervals - 1;

  // Calculate scales based on fixed size
  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);

  // Reset state when entering a new scatter phase
  useEffect(() => {
    if (currentPhase === "scatter") {
      setHasClicked(false);
      setRemainingTime(duration);
    }
  }, [currentPhase, currentIntervalIndex, duration]);

  // Reset slider state when entering slider phase
  useEffect(() => {
    if (currentPhase === "slider") {
      // Initialize slider with previous estimate if available
      const previousEstimate = estimates.length > 0 ? estimates[estimates.length - 1] : 0;
      setCurrentSliderValue(previousEstimate);
      setSliderInteracted(false);
    }
  }, [currentPhase, currentIntervalIndex, estimates]);

  // Timer for scatter phase: After click, show plot for duration seconds, then transition to slider
  useEffect(() => {
    if (currentPhase !== "scatter") return;
    if (!hasClicked) return;
    if (duration === undefined || duration === null || duration <= 0) return;
    
    // Update remaining time every second
    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        const newTime = prev - 1;
        if (newTime <= 0) {
          setCurrentPhase("slider");
          return 0;
        }
        return newTime;
      });
    }, 1000);
    
    // Also set a timeout as backup to transition
    const timeout = setTimeout(() => {
      setCurrentPhase("slider");
    }, duration * 1000);
    
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [currentPhase, hasClicked, duration, currentIntervalIndex]);

  // Final answer callback - called when all intervals are complete
  const submitFinalAnswer = useCallback((allEstimates) => {
    setAnswer({
      status: true,
      answers: {
        answer: JSON.stringify({
          actualCorr: correlation,
          // coordinates: coordinates,
          // label: label,
          // X: X,
          // Y: Y,
          estimates: allEstimates,
          intervals: label_intervals,
        })
      }
    });
  }, [setAnswer, correlation, coordinates, label, X, Y, label_intervals]);

  // Handle Continue button click from slider
  const handleSliderContinue = useCallback(() => {
    const newEstimates = [...estimates, currentSliderValue];
    setEstimates(newEstimates);
    
    if (isLastInterval) {
      // All intervals complete, submit final answer
      submitFinalAnswer(newEstimates);
    } else {
      // Move to next interval - reset hasClicked first to ensure blur is applied immediately
      setHasClicked(false);
      setCurrentIntervalIndex(prev => prev + 1);
      setCurrentPhase("scatter");
    }
  }, [currentSliderValue, estimates, isLastInterval, submitFinalAnswer]);

  // Draw scatterplot with D3
  useEffect(() => {
    if (currentPhase !== "scatter") return;
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

    // Determine if labels should be blurred based on current interval's showLabels setting
    const shouldBlurLabels = !showLabels;
    const filterValue = shouldBlurLabels ? 'blur(50px)' : 'none';

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
      .style('filter', filterValue)
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
        filter: ${filterValue};
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

  }, [currentPhase, currentIntervalIndex, coordinates, xScale, yScale, fixedSize, margin, X, Y, showLabels, plotWidth, plotHeight]);

  // Handle click to start scatter viewing
  const handleClick = useCallback(() => {
    if (!hasClicked && currentPhase === "scatter") {
      setHasClicked(true);
    }
  }, [hasClicked, currentPhase]);

  // Generate overlay message based on current interval
  const getOverlayMessage = () => {
    const newMessage = currentIntervalIndex === 0 ? `You'll about to see a NEW scatterplot.` : `You will continue to see the SAME scatterplot.`;
    if (showLabels) {
      return (
        <>
          {newMessage} <br />
          You have {duration} seconds. <br />
          <br />
          Variables will be shown:<br />
          X: {X}<br />
          Y: {Y}<br />
          <br />
          Click to {currentIntervalIndex === 0 ? "start" : "continue"}!
        </>
      );
    } else {
      return (
        <> 
        {newMessage} <br />
          You have {duration} seconds.<br />
          <br />
          Variables will be hidden.
          <br />
          Click to {currentIntervalIndex === 0 ? "start" : "continue"}!
        </>
      );
    }
  };

  // Generate slider prompt based on current interval
  const getSliderPrompt = () => {
    if (currentIntervalIndex === 0) {
      return "Estimate the correlation of the scatterplot you saw.";
    } else {
      return `You may revise your correlation estimate.`;
    }
  };

  return (
    <div>
      {example && (
        <h1 style={{ color: "red" }}>Example Question</h1>
      )}
      
      {/* Scatterplot View */}
      {currentPhase === "scatter" && (
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
                  textAlign: 'center'
                }}
              >
                {getOverlayMessage()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slider View */}
      {currentPhase === "slider" && (
        <div style={{ width: '50%', margin: '50px auto', textAlign: 'center' }}>
          <h3>{getSliderPrompt()}</h3>
          <div onClick={() => setSliderInteracted(true)}>
            <NormalSlider
              value={currentSliderValue}
              setValue={(value) => {
                setCurrentSliderValue(value);
                setSliderInteracted(true);
              }}
              min={0}
              max={1}
              step={0.01}
              tickInterval={0.2}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '20px' }}>
            <Button 
              disabled={!sliderInteracted} 
              onClick={handleSliderContinue}
            >
              {isLastInterval ? "Submit" : "Continue"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default Phase2;
