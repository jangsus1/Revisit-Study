import React from "react";
import { Box } from "@mantine/core";

function AttentionCheck({ parameters, setAnswer }) {
  const { link } = parameters;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      width: "100%",
      minHeight: "400px",
      padding: "40px"
    }}>
      <Box
        style={{
          maxWidth: "600px",
          padding: "40px",
          border: "2px solid #e74c3c",
          borderRadius: "8px",
          backgroundColor: "#fff",
          textAlign: "center"
        }}
      >
        <h2 style={{ color: "#e74c3c", marginBottom: "20px" }}>
          Comprehension Check Failed
        </h2>
        <p style={{ fontSize: "18px", marginBottom: "30px", lineHeight: "1.6" }}>
          Sorry, but you have failed the comprehension check questions and will not be able to continue our study. <b>However, you will still be compensated with a bonus payment for your time.</b> Please <b>return</b> your submission with this link:
        </p>
        {link && (
          <div style={{ marginTop: "30px" }}>
            <a 
              href={link} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "#3498db", wordBreak: "break-all", fontSize: "16px" }}
            >
              {link}
            </a>
          </div>
        )}
      </Box>
    </div>
  );
}

export default AttentionCheck;

