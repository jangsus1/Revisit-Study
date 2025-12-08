import * as d3 from "d3";
import { useEffect, useState, useRef, useCallback } from "react";
import { Box, Button } from "@mantine/core";
import React from "react";
import { NormalSlider } from "./Slider";

// ============================================================================
// GLOBAL CONFIGURATION OPTIONS
// ============================================================================
// Set to true to always use slope = 1 (45-degree line through data centroid)
// Set to false to use the actual regression slope calculated from data
const USE_FIXED_SLOPE = true;
const FIXED_SLOPE_VALUE = 1;
// ============================================================================

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
  const { coordinates, example, seconds, label_seconds, correlation, label, X, Y, type } = parameters;
  const [view, setView] = useState("scatter"); // scatter, corrafter, belief
  const [corrAfter, setCorrAfter] = useState(0);
  const [hasClicked, setHasClicked] = useState(false);
  const [isBlurred, setIsBlurred] = useState(true);
  const [labelsVisible, setLabelsVisible] = useState(false);

  // Calculate regression line and statistics
  const regressionData = React.useMemo(() => {
    if (!coordinates || coordinates.length === 0) return null;
    
    // Calculate means (centroid of data)
    const xMean = d3.mean(coordinates, d => d[0]);
    const yMean = d3.mean(coordinates, d => d[1]);
    
    let slope, intercept;
    
    if (USE_FIXED_SLOPE) {
      // Use fixed slope (default: 1 for 45-degree line)
      // Line passes through data centroid: y - yMean = slope * (x - xMean)
      slope = FIXED_SLOPE_VALUE;
      intercept = yMean - slope * xMean;
    } else {
      // Calculate actual regression slope and intercept from data
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < coordinates.length; i++) {
        const xDiff = coordinates[i][0] - xMean;
        const yDiff = coordinates[i][1] - yMean;
        numerator += xDiff * yDiff;
        denominator += xDiff * xDiff;
      }
      slope = numerator / denominator;
      intercept = yMean - slope * xMean;
    }
    
    // Calculate standard deviation of residuals (for band width)
    const residuals = coordinates.map(d => {
      const predicted = slope * d[0] + intercept;
      return Math.abs(d[1] - predicted);
    });
    const stdDev = d3.deviation(residuals);
    
    return { xMean, yMean, slope, intercept, stdDev };
  }, [coordinates]);

  // Calculate scales based on fixed size
  const plotWidth = fixedSize.width - margin.left - margin.right;
  const plotHeight = fixedSize.height - margin.top - margin.bottom;
  const xScale = d3.scaleLinear().domain([0, 1]).range([margin.left + dotPadding, margin.left + plotWidth]);
  const yScale = d3.scaleLinear().domain([0, 1]).range([margin.top + plotHeight - dotPadding, margin.top]);

  // Reset state when entering scatter view
  useEffect(() => {
    if (view === "scatter") {
      setIsBlurred(true);
      setHasClicked(false);
      setLabelsVisible(false);
    }
  }, [view]);

  // Handle label visibility based on label_seconds
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    if (label_seconds === undefined || label_seconds === null) return;
    
    // Case 1: label_seconds === 0: Show labels immediately
    if (label_seconds === 0) {
      setLabelsVisible(true);
      return;
    }
    
    // Case 2: label_seconds >= seconds: Never show labels
    if (label_seconds >= seconds) {
      setLabelsVisible(false);
      return;
    }
    
    // Case 3: 0 < label_seconds < seconds: Show labels after label_seconds
    const timer = setTimeout(() => {
      setLabelsVisible(true);
    }, label_seconds * 1000);
    
    return () => {
      clearTimeout(timer);
    };
  }, [view, hasClicked, label_seconds, seconds]);

  // Timer to change view after seconds when in scatter view
  useEffect(() => {
    if (view !== "scatter") return;
    if (!hasClicked) return;
    const timer = setTimeout(() => {
      setView("corrafter");
    }, seconds * 1000);
    return () => clearTimeout(timer);
  }, [view, hasClicked, seconds]);

  // Answer callback - called when belief slider is touched
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
          corrAfter: corrAfter,
        })
      }
    });
    setCorrAfter(corrAfter);
  }, [setAnswer, corrAfter, correlation, coordinates, label, X, Y]);

  // Draw scatterplot with D3 - only when view changes or coordinates change
  useEffect(() => {
    if (view !== "scatter") return;
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

    // Add regression band if regression data is available
    if (regressionData) {
      const { slope, intercept, stdDev } = regressionData;
      
      // Create points for the regression line across the plot
      const xDomain = xScale.domain();
      const yDomain = yScale.domain();
      
      const bandData = [];
      const steps = 100;
      for (let i = 0; i <= steps; i++) {
        const x = xDomain[0] + (xDomain[1] - xDomain[0]) * (i / steps);
        const yPred = slope * x + intercept;
        bandData.push({ x, yPred });
      }
      
      // Create a clip path to constrain all bands to the plot area
      const defs = svg.append('defs');
      const clipId = 'plot-area-clip';
      defs.append('clipPath')
        .attr('id', clipId)
        .append('rect')
        .attr('x', margin.left)
        .attr('y', margin.top)
        .attr('width', plotWidth)
        .attr('height', plotHeight);
      
      // Determine if we should use continuous or discrete banding
      const useContinuous = type === 'continuous';
      
      if (useContinuous) {
        // Continuous colormap-like band centered on the regression line
        const gradientId = 'band-gradient-continuous';

        // Calculate the regression line direction in PIXEL space
        // In pixel space, y is inverted, so we need to account for this
        const x1Data = xDomain[0];
        const x2Data = xDomain[1];
        const y1Data = slope * x1Data + intercept;
        const y2Data = slope * x2Data + intercept;
        
        // Convert to pixel coordinates
        const x1Pixel = xScale(x1Data);
        const y1Pixel = yScale(y1Data);
        const x2Pixel = xScale(x2Data);
        const y2Pixel = yScale(y2Data);
        
        // Direction vector of regression line in pixel space
        const lineDx = x2Pixel - x1Pixel;
        const lineDy = y2Pixel - y1Pixel;
        const lineLen = Math.sqrt(lineDx * lineDx + lineDy * lineDy);
        
        // Perpendicular direction (rotate 90 degrees)
        const perpDx = -lineDy / lineLen;
        const perpDy = lineDx / lineLen;
        
        // Anchor point at center of the regression line in pixel space
        const anchorXPixel = (x1Pixel + x2Pixel) / 2;
        const anchorYPixel = (y1Pixel + y2Pixel) / 2;
        
        // Gradient length should cover the full plot diagonal
        const plotDiagonal = Math.sqrt(plotWidth * plotWidth + plotHeight * plotHeight);
        const halfLen = plotDiagonal / 2;
        
        // Gradient endpoints perpendicular to the regression line
        const gradX1 = anchorXPixel + perpDx * halfLen;
        const gradY1 = anchorYPixel + perpDy * halfLen;
        const gradX2 = anchorXPixel - perpDx * halfLen;
        const gradY2 = anchorYPixel - perpDy * halfLen;

        const linearGradient = defs.append('linearGradient')
          .attr('id', gradientId)
          .attr('gradientUnits', 'userSpaceOnUse')
          .attr('x1', gradX1)
          .attr('y1', gradY1)
          .attr('x2', gradX2)
          .attr('y2', gradY2);

        // Symmetric palette: light at edges, darker at center (regression line)
        // Gradient goes from one side → center → other side
        const colors = [
          { offset: '0%', color: '#8fb1e5', opacity: 0 },
          { offset: '20%', color: '#8fb1e5', opacity: 0.2 },
          { offset: '30%', color: '#8fb1e5', opacity: 0.4 },
          { offset: '40%', color: '#8fb1e5', opacity: 0.6 },
          { offset: '50%', color: '#8fb1e5', opacity: 0.8 },  // Center (regression line)
          { offset: '60%', color: '#8fb1e5', opacity: 0.6 },
          { offset: '70%', color: '#8fb1e5', opacity: 0.4 },
          { offset: '80%', color: '#8fb1e5', opacity: 0.2 },
          { offset: '100%', color: '#8fb1e5', opacity: 0 }
        ];
        
        colors.forEach(({ offset, color, opacity }) => {
          linearGradient.append('stop')
            .attr('offset', offset)
            .attr('stop-color', color)
            .attr('stop-opacity', opacity);
        });

        // Cover entire plot area with clipping
        svg.append('rect')
          .attr('class', 'regression-band-background')
          .attr('x', margin.left)
          .attr('y', margin.top)
          .attr('width', plotWidth)
          .attr('height', plotHeight)
          .attr('clip-path', `url(#${clipId})`)
          .attr('fill', `url(#${gradientId})`);

      } else {
        // Discrete color bands covering entire plot height, centered on regression line
        // Create a group for all bands with clipping applied
        const bandGroup = svg.append('g')
          .attr('clip-path', `url(#${clipId})`);
        
        const numBands = 6; // number of steps on each side
        const totalSpan = yDomain[1] - yDomain[0];
        const bandStep = totalSpan / numBands; // large enough to reach boundaries

        // Monotonic sequential palette (light blues, darker near center)
        const palette = ['#f4f8ff', '#e7effb', '#d5e3f7', '#c0d4f2', '#a8c2ec', '#8fb1e5'];
        const paletteSize = palette.length;

        // From negative to positive bands to ensure full coverage
        for (let i = -numBands; i < numBands; i++) {
          const lowerOffset = i * bandStep;
          const upperOffset = (i + 1) * bandStep;

          // Don't clamp here - let the clip path handle boundaries
          const bandDataRange = bandData.map(d => ({
            x: d.x,
            yLower: d.yPred + lowerOffset,
            yUpper: d.yPred + upperOffset
          }));

          // Color index based on distance from regression line (center darker)
          const dist = Math.abs((i + 0.5) / numBands);
          const colorIndex = Math.min(Math.round(dist * (paletteSize - 1)), paletteSize - 1);
          const fillColor = palette[colorIndex];

          const areaBand = d3.area()
            .x(d => xScale(d.x))
            .y0(d => yScale(d.yLower))
            .y1(d => yScale(d.yUpper));

          bandGroup.append('path')
            .datum(bandDataRange)
            .attr('class', `regression-band-${i}`)
            .attr('d', areaBand)
            .attr('fill', fillColor)
            .attr('opacity', 0.65);

          // Border for distinction
          const borderLine = d3.line()
            .x(d => xScale(d.x))
            .y(d => yScale(d.yUpper));

          bandGroup.append('path')
            .datum(bandDataRange)
            .attr('class', `band-border-${i}`)
            .attr('d', borderLine)
            .attr('stroke', '#7f9fcf')
            .attr('stroke-width', 0.6)
            .attr('stroke-dasharray', '4,3')
            .attr('fill', 'none')
            .attr('opacity', 0.5);
        }
      }
    }

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

  }, [view, coordinates, xScale, yScale, fixedSize, margin, X, Y, regressionData, plotWidth, plotHeight]);

  // SEPARATE effect to update label blur - this doesn't need scales!
  useEffect(() => {
    if (!ref.current) return;
    
    const svg = d3.select(ref.current);
    const shouldBlur = isBlurred || !labelsVisible;
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
    
  }, [isBlurred, labelsVisible]);

  // Handle click to remove blur
  const handleClick = useCallback(() => {
    if (!hasClicked) {
      setIsBlurred(false);
      setHasClicked(true);
    }
  }, [hasClicked]);

  return (
    <div>
      {example && (
        <h1 style={{ color: "red" }}>Example Question</h1>
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
                  whiteSpace: 'nowrap',
                  textAlign: 'center'
                }}
              >
                You have 5 seconds to estimate the correlation. <br />  Click to start!
              </div>
            )}
          </div>
        </div>
      )}

      {view === "corrafter" && (
        <div style={{ width: '50%', margin: '50px auto', textAlign: 'center' }}>
          <h3>Estimate the correlation of the scatterplot you saw.</h3>
          <NormalSlider
            value={corrAfter}
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