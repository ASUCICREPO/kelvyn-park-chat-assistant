import React, { useState, useEffect } from "react";
import { Grid, Avatar, Typography, CircularProgress } from "@mui/material";
import BotAvatar from "../Assets/BotAvatar.svg";
import PdfIcon from "../Assets/pdf_logo.svg";
import {BOTMESSAGE_BACKGROUND} from "../utilities/constants";
function BotFileCheckReply({ message, fileName, fileStatus }) {
  const messageAlignment = "flex-start";
  

  const [animationState, setAnimationState] = useState("checking");

  useEffect(() => {
    let timeout;
    if (animationState === "checking") {
      if (fileStatus === "File page limit check succeeded.") {
        timeout = setTimeout(() => setAnimationState("success"), 1000);
      } else if (fileStatus === "File size limit exceeded." || fileStatus === "Network Error. Please try again later.") {
        timeout = setTimeout(() => setAnimationState("fail"), 1000);
      }
    }
    return () => clearTimeout(timeout);
  }, [animationState, fileStatus]);

  return (
    <Grid container direction="row" justifyContent={messageAlignment} alignItems="center">
      <Grid item>
        <Avatar alt="Bot Avatar" src={BotAvatar} />
      </Grid>
      <Grid item style={{ background: BOTMESSAGE_BACKGROUND, borderRadius: 20, padding: 10, marginLeft: 5 }}>
        {fileStatus ? (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <img src={PdfIcon} alt="PDF Icon" style={{ width: 40, height: 40, borderRadius: "50%" }} />
              <Typography>{fileName}</Typography>
            </div>
            <div className={`file-status-box ${animationState}`}>
              <Typography>{animationState === "checking" ? "Checking file size..." : fileStatus}</Typography>
              {animationState === "checking" && <CircularProgress size={24} className="loading" />}
            </div>
            {animationState === "success" && <Typography style={{ marginTop: "4px", color: "green" }}>File uploaded successfully</Typography>}
            {animationState === "fail" && <Typography style={{ marginTop: "4px", color: "red" }}>{fileStatus}</Typography>}
          </div>
        ) : (
          <Typography>{message}</Typography>
        )}
      </Grid>
    </Grid>
  );
}

export default BotFileCheckReply;
