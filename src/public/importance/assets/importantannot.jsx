import * as d3 from "d3"
import { useEffect, useState, useRef, useCallback } from "react"
import { Box, Button } from "@mantine/core"
import React from "react"
import _ from "lodash"
import useImage from "use-image"
import { Stage, Layer, Line, Circle } from "react-konva"
import { Image as KonvaImage } from "react-konva"
import ToolBox from "./ToolBox"
import { use } from "react"

function ImportantAnnots({ parameters, setAnswer }) {
  const { image, question, example, ourDefinition } = parameters
  const [tool, setTool] = useState("stroke")
  const [size, setSize] = useState({ width: 0, height: 0 })
  const containerRef = useRef(null)
  // Store all finished shapes here
  // Each element is { tool: 'polygon' | 'stroke', points: number[] }
  const [shapes, setShapes] = useState([])

  // Current shape's points while the user is drawing
  const [currentPoints, setCurrentPoints] = useState([])

  // Track if user is actively drawing a freehand stroke (lasso)
  const [isDrawing, setIsDrawing] = useState(false)
  const stageRef = useRef(null)

  const [backgroundImage] = useImage(image)

  const finish = useCallback((shapes) => {
    setAnswer({
      status: true,
      answers: {
        annotations: JSON.stringify(shapes)
      }
    })
  }, [setAnswer, shapes])

  const changeTool = (newTool) => {
    // If switching tools, clear all drawn shapes & in-progress shape
    if (newTool !== tool) {
      setShapes([]);
      setCurrentPoints([]);
      setIsDrawing(false);
    }
    setTool(newTool);
  };

  const handleUndo = () => {
    // Undo simply removes the last completed shape
    const newShapes = shapes.slice(0, -1)
    setShapes(newShapes)
    finish(newShapes)
    // Also clear any in-progress shape
    setCurrentPoints([])
    setIsDrawing(false)
  }

  const handleClearAll = () => {
    setShapes([])
    setCurrentPoints([])
    setIsDrawing(false)
    finish([])
  }

  const handleMouseDown = (e) => {
    if (tool === "polygon") return
    // Start freehand stroke
    setIsDrawing(true)
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    // Initialize currentPoints with the starting point
    const x = parseInt(pos.x)
    const y = parseInt(pos.y)
    setCurrentPoints([x, y])
  }

  const handleMouseMove = (e) => {
    if (tool === "polygon" || !isDrawing) return
    // Add points while drawing freehand stroke
    const stage = stageRef.current
    const pos = stage.getPointerPosition()
    const x = parseInt(pos.x)
    const y = parseInt(pos.y)
    setCurrentPoints((prev) => [...prev, x, y])
  }

  const handleMouseUp = (e) => {
    if (tool === "polygon") return
    // Finish freehand stroke
    setIsDrawing(false)
    const newShapes = [...shapes, { tool: "stroke", points: currentPoints }]
    setShapes(newShapes)
    finish(newShapes);
    // Clear current points
    setCurrentPoints([])
  }

  // Click for polygon
  const handleClick = (e) => {
    if (tool !== "polygon") return

    const stage = stageRef.current
    const pos = stage.getPointerPosition()

    const x = parseInt(pos.x)
    const y = parseInt(pos.y)

    // Add the new point
    setCurrentPoints((prev) => [...prev, x, y])
  }

  // Optional: double click to close the polygon or any condition you want
  const handleDblClick = (e) => {
    if (tool !== "polygon") return
    // Once double-clicked, finalize the polygon
    const newShapes = [...shapes, { tool: "polygon", points: currentPoints }]
    setShapes(newShapes)
    finish(newShapes)
    setCurrentPoints([])
  }

  useEffect(() => {
    const img = new Image()
    img.src = image
    img.onload = () => {
      const parent = containerRef.current
      const availableHeight = window.innerHeight - parent.getBoundingClientRect().top
      const availableWidth = window.innerWidth - parent.getBoundingClientRect().left
      const aspectRatio = img.width / img.height

      let scaledWidth, scaledHeight
      if (availableHeight * aspectRatio <= availableWidth) {
        // Fit height first
        scaledHeight = availableHeight
        scaledWidth = availableHeight * aspectRatio
      } else {
        // Fit width first
        scaledWidth = availableWidth
        scaledHeight = availableWidth / aspectRatio
      }
      setSize({ width: scaledWidth, height: scaledHeight })
    }
  }, [image])

  return (
    <div>
      {example && (
        <h1 style={{ color: "red" }}>Example Question</h1>
      )}
      {question ? (
        <div>
          <h2>Please identify and annotate the regions that are critical to answering the question below:</h2>
          <h2>Q: {question}</h2>
        </div>
      ) : (
        <div>
          <h2>
            Please annotate the regions you consider important.<br />
            Then, provide a description of the key insights or takeaways from this visualization.
          </h2>
        </div>
      )}
      <Box ref={containerRef} className="ImageWrapper" style={{ width: "100%", display: "flex" }}>
        <Box
          style={{
            width: "250px",
            backgroundColor: "#f4f4f4",
            padding: "20px",
            borderRight: "1px solid #ddd",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        >
          <ToolBox
            tool={tool}
            setTool={changeTool}
            undo={handleUndo}
            clearAll={handleClearAll}
          />
        </Box>
        <Stage
          ref={stageRef}
          width={size.width}
          height={size.height}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onDblClick={handleDblClick}
          style={{ border: "1px solid black" }}
        >
          <Layer>
            {/* Background Image */}
            {backgroundImage && <KonvaImage image={backgroundImage} width={size.width} height={size.height} />}

            {/* Render all completed shapes */}
            {shapes.map((shape, i) => {
              const { tool: shapeTool, points } = shape
              const isPolygon = shapeTool === "polygon"
              return (
                <Line
                  key={i}
                  points={points}
                  stroke={isPolygon ? "blue" : "red"}
                  strokeWidth={2}
                  closed={true}
                  fill={
                    isPolygon
                      ? "rgba(0, 0, 255, 0.3)"
                      : "rgba(255, 0, 0, 0.3)"
                  }
                />
              )
            })}

            {/* Render in-progress shape */}
            {currentPoints.length > 0 && tool === "polygon" && (
              <Line
                points={currentPoints}
                stroke="blue"
                strokeWidth={2}
                closed={currentPoints.length > 3}
                fill={currentPoints.length > 3 ? "rgba(0, 150, 255, 0.3)" : null}
              />
            )}
            {currentPoints.length > 0 && tool === "stroke" && (
              <Line
                points={currentPoints}
                stroke="red"
                strokeWidth={2}
                closed={true}
                fill="rgba(255, 150, 0, 0.3)"
              />
            )}
            {/* A small circle on the last point in polygon mode */}
            {tool === "polygon" && currentPoints.length > 0 && (
              <Circle
                x={currentPoints[currentPoints.length - 2]}
                y={currentPoints[currentPoints.length - 1]}
                radius={5}
                fill="red"
              />
            )}
          </Layer>
        </Stage>
      </Box>
    </div>
  )
}

export default ImportantAnnots