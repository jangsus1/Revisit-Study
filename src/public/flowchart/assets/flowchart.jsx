import * as d3 from "d3";
import { useEffect, useRef, useState } from "react";
import React from "react";
import { Radio, Box, Text } from "@mantine/core";

function Flowchart({ parameters, setAnswer }) {
  const svgRef = useRef(null);
  const [selectedAnswer, setSelectedAnswer] = useState("");

  useEffect(() => {
    if (!svgRef.current) return;

    const width = 800;
    const height = 200;
    const nodeWidth = 120;
    const nodeHeight = 60;
    const nodeSpacing = 150;
    const startX = 50;
    const startY = height / 2;

    // Clear previous content
    d3.select(svgRef.current).selectAll("*").remove();

    const svg = d3.select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    // Define arrow marker
    svg.append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 60)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#333");

    // Create 5 nodes
    const nodes = Array.from({ length: 5 }, (_, i) => ({
      id: i + 1,
      x: startX + i * nodeSpacing,
      y: startY,
      label: `Node ${i + 1}`
    }));

    // Draw edges (arrows)
    const edges = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({
        source: nodes[i],
        target: nodes[i + 1]
      });
    }

    // Draw edges
    svg.selectAll(".edge")
      .data(edges)
      .enter()
      .append("line")
      .attr("class", "edge")
      .attr("x1", d => d.source.x + nodeWidth / 2)
      .attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x - nodeWidth / 2)
      .attr("y2", d => d.target.y)
      .attr("stroke", "#333")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead)");

    // Draw nodes
    svg.selectAll(".node")
      .data(nodes)
      .enter()
      .append("rect")
      .attr("class", "node")
      .attr("x", d => d.x - nodeWidth / 2)
      .attr("y", d => d.y - nodeHeight / 2)
      .attr("width", nodeWidth)
      .attr("height", nodeHeight)
      .attr("rx", 5)
      .attr("fill", "#e8e8e8")
      .attr("stroke", "#333")
      .attr("stroke-width", 2);

    // Draw labels
    svg.selectAll(".label")
      .data(nodes)
      .enter()
      .append("text")
      .attr("class", "label")
      .attr("x", d => d.x)
      .attr("y", d => d.y)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .attr("font-size", "14px")
      .attr("font-family", "Arial, sans-serif")
      .attr("fill", "#333")
      .text(d => d.label);

  }, []);

  const handleAnswerChange = (value) => {
    setSelectedAnswer(value);
    setAnswer({
      status: true,
      answers: {
        answer: value
      }
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "20px" }}>
      <div style={{ marginBottom: "30px" }}>
        <svg ref={svgRef}></svg>
      </div>
      
      <Box style={{ width: "100%", maxWidth: "800px", marginTop: "20px" }}>
        <Text size="lg" fw={500} mb="md">
          What is the correct path through the flowchart?
        </Text>
        <Radio.Group
          value={selectedAnswer}
          onChange={handleAnswerChange}
        >
          <Radio value="1-2-3-4-5" label="Node 1 → Node 2 → Node 3 → Node 4 → Node 5" mb="sm" />
          <Radio value="1-3-5" label="Node 1 → Node 3 → Node 5" mb="sm" />
          <Radio value="2-4-5" label="Node 2 → Node 4 → Node 5" mb="sm" />
          <Radio value="1-5" label="Node 1 → Node 5" mb="sm" />
        </Radio.Group>
      </Box>
    </div>
  );
}

export default Flowchart;