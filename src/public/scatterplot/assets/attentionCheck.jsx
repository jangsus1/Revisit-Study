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
          maxWidth: "700px",
          padding: "40px",
          border: "2px solid #e74c3c",
          borderRadius: "8px",
          backgroundColor: "#fff",
          textAlign: "left"
        }}
      >
        <h2 style={{ color: "#e74c3c", marginBottom: "20px", textAlign: "center" }}>
          Comprehension Check Failed
        </h2>
        <p style={{ fontSize: "16px", marginBottom: "20px", lineHeight: "1.8" }}>
          Thank you for participating in our study. Unfortunately, you did not pass the comprehension questions required to continue. To resolve this, we would like to offer you two options:
        </p>
        
        <div style={{ marginBottom: "20px", padding: "20px", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
          <h3 style={{ fontSize: "18px", marginBottom: "10px", color: "#2c3e50" }}>
            Option 1 (Return for Partial Payment):
          </h3>
          <p style={{ fontSize: "15px", lineHeight: "1.7", marginBottom: "10px" }}>
            You can return your submission on Prolific. If you do so, we will provide a <strong>$0.50 partial payment</strong> for your time.
          </p>
          {link && (
            <a 
              href={link} 
              target="_blank" 
              rel="noopener noreferrer"
              style={{ color: "#3498db", wordBreak: "break-all", fontSize: "14px", textDecoration: "underline" }}
            >
              {link}
            </a>
          )}
          <div style={{ marginTop: "15px", padding: "12px", backgroundColor: "#f8d7da", borderLeft: "3px solid #e74c3c", borderRadius: "4px" }}>
            <p style={{ fontSize: "14px", lineHeight: "1.6", margin: "0", color: "#721c24" }}>
              <strong>⚠️ Critical:</strong> If you do NOT return your submission within 24 hours, we will have to Reject your response and no payment will be provided.
            </p>
          </div>
        </div>

        <div style={{ marginBottom: "10px", padding: "15px", backgroundColor: "#f8f9fa", borderRadius: "6px" }}>
          <h3 style={{ fontSize: "18px", marginBottom: "10px", color: "#2c3e50" }}>
            Option 2 (Retry the Study):
          </h3>
          <p style={{ fontSize: "15px", lineHeight: "1.7", marginBottom: "0" }}>
            If you would like to try the study again for the full reward, please <strong>send us a message on Prolific</strong> to request a new link to restart the task.
          </p>
          <div style={{marginTop: "15px", padding: "15px", backgroundColor: "#fff3cd", borderLeft: "4px solid #ffc107", marginBottom: "15px" }}>
          <p style={{ fontSize: "15px", lineHeight: "1.7", margin: "0", color: "#856404" }}>
            <strong>Note:</strong> If you do not pass the comprehension questions after a second attempt, you will not be able to participate in the study and should return your submission for Option 1.
          </p>
        </div>
        </div>

        

        <div style={{ padding: "15px", backgroundColor: "#f8d7da", borderLeft: "4px solid #e74c3c", marginTop: "15px" }}>
          <p style={{ fontSize: "15px", lineHeight: "1.7", margin: "0", color: "#721c24" }}>
            <strong>Important:</strong> Please take one of these actions within the next <strong>24 hours</strong>. If the submission is not returned or completed by then, we will unfortunately have to reject your response.
          </p>
        </div>
      </Box>
    </div>
  );
}

export default AttentionCheck;

