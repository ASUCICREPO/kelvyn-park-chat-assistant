import React, { useState, useEffect, useRef } from "react";
import { Grid, Avatar, Typography } from "@mui/material";
import BotAvatar from "../Assets/BotAvatar.svg";
import { WEBSOCKET_API } from "../utilities/constants";
import { useLanguage } from "../utilities/LanguageContext"; 
import { ALLOW_MARKDOWN_BOT } from "../utilities/constants";
import ReactMarkdown from "react-markdown";

const StreamingMessage = ({ initialMessage, setProcessing }) => {
  const [responses, setResponses] = useState([]);
  const ws = useRef(null);
  const messageBuffer = useRef(""); // Buffer to hold incomplete JSON strings
  const { language } = useLanguage();

  useEffect(() => {
    // Initialize WebSocket connection
    ws.current = new WebSocket(WEBSOCKET_API);

    ws.current.onopen = () => {
      console.log("WebSocket Connected");
      // Send initial message
      ws.current.send(JSON.stringify({ action: "sendMessage", prompt: initialMessage, Language: language }));
    };

    ws.current.onmessage = (event) => {
      try {
        messageBuffer.current += event.data; // Append new data to buffer
        const parsedData = JSON.parse(messageBuffer.current); // Try to parse the full buffer
        
        if (parsedData.type === "end") {
          setProcessing(false); // Set processing to false when parsing is complete
          console.log("end of conversation");
        }
        
        if (parsedData.type === "delta") {
          setResponses((prev) => [...prev, parsedData.text]);
        }

        // Clear buffer on successful parse
        messageBuffer.current = "";
      } catch (e) {
        if (e instanceof SyntaxError) {
          console.log("Received incomplete JSON, waiting for more data...");
        } else {
          console.error("Error processing message: ", e);
          // Clear buffer if error is not related to JSON parsing
          messageBuffer.current = "";
        }
      }
    };

    ws.current.onerror = (error) => {
      console.log("WebSocket Error: ", error);
    };

    ws.current.onclose = (event) => {
      if (event.wasClean) {
        console.log(`WebSocket closed cleanly, code=${event.code}, reason=${event.reason}`);
      } else {
        console.log("WebSocket Disconnected unexpectedly");
      }
    };

    // Cleanup function to close WebSocket connection
    return () => {
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [initialMessage, setProcessing]);

  return (
    <Grid container direction="row" justifyContent="flex-start" alignItems="flex-end">
      <Grid item>
        <Avatar alt="Bot Avatar" src={BotAvatar} />
      </Grid>
      {ALLOW_MARKDOWN_BOT ? (
        <Grid item className="botMessage" sx={{ backgroundColor: (theme) => theme.palette.background.botMessage }}>
          <Typography variant="body2" sx={{ "& li": { color: "black !important" } }}>
            <ReactMarkdown>{responses.join("")}</ReactMarkdown>
          </Typography>
        </Grid>
      ) : (
        <Grid item className="botMessage" sx={{ backgroundColor: (theme) => theme.palette.background.botMessage }}>
          <Typography variant="body2" sx={{ "& li": { color: "black !important" } }}>
            <ReactMarkdown>{responses.join("")}</ReactMarkdown>
          </Typography>
        </Grid>
      )}
    </Grid>
  );
};

export default StreamingMessage;
