import React, { useState } from "react";
import { Grid, Button, CircularProgress } from "@mui/material";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import axios from "axios";
import { CHAT_API } from "../utilities/constants";

function Attachment({ onFileUploadComplete }) {
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setUploading(true);
    setUploadStatus("");

    try {
      const response = await axios.post(CHAT_API, formData);
      console.log(JSON.stringify(response.data));
      setUploadStatus("File uploaded successfully!");
      onFileUploadComplete(file, "File page limit check succeeded.");
    } catch (error) {
      console.error(error);
      if (error.response && error.response.status === 413) {
        setUploadStatus("Error: Payload Too Large");
        onFileUploadComplete(file, "File size limit exceeded.");
      } else if (error.code === "ERR_NETWORK") {
        setUploadStatus("Network Error");
        onFileUploadComplete(file, "Network Error. Please try again later.");
      } else {
        setUploadStatus("Error uploading file.");
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Grid container direction="column" alignItems="flex-end" justifyContent="center">
      <Grid item xs={12}>
        <Button component="label" className="attachmentButton">
          <AttachFileIcon />
          <input type="file" accept="application/pdf" hidden onChange={handleFileUpload} />
          {uploading && <CircularProgress size={24} />}
        </Button>
      </Grid>
    </Grid>
  );
}

export default Attachment;
