import React, { useState, useRef, useEffect } from "react";
import { Grid, Avatar, Typography, Box } from "@mui/material";
import Attachment from "./Attachment";
import ChatInput from "./ChatInput";
import UserAvatar from "../Assets/UserAvatar.svg";
import StreamingResponse from "./StreamingResponse"; // Import StreamingResponse component
import createMessageBlock from "../utilities/createMessageBlock";
import { ALLOW_FILE_UPLOAD, ALLOW_VOICE_RECOGNITION } from "../utilities/constants";
import BotFileCheckReply from "./BotFileCheckReply";
import SpeechRecognitionComponent from "./SpeechRecognition";

function ChatBody() {
  const [messageList, setMessageList] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    scrollToBottom();
  }, [messageList]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleSendMessage = (message) => {
    setProcessing(true); // Set processing to true when sending a message
    const newMessageBlock = createMessageBlock(message, "USER", "TEXT", "SENT");
    setMessageList([...messageList, newMessageBlock]);
    getBotResponse(setMessageList, setProcessing, message);
  };

  const handleFileUploadComplete = (file, fileStatus) => {
    const newMessageBlock = createMessageBlock(`File uploaded: ${file.name}`, "USER", "FILE", "SENT", file.name, fileStatus);
    setMessageList((prevList) => [...prevList, newMessageBlock]);

    setTimeout(() => {
      const botMessageBlock = createMessageBlock(fileStatus === "File page limit check succeeded." ? "Checking file size." : fileStatus === "File size limit exceeded." ? "File size limit exceeded. Please upload a smaller file." : "Network Error. Please try again later.", "BOT", "FILE", "RECEIVED", file.name, fileStatus);
      setMessageList((prevList) => [...prevList, botMessageBlock]);
    }, 1000); // Simulate processing time
  };

  const getMessage = () => message;

  return (
    <>
      <Box display="flex" flexDirection="column" justifyContent="space-between" className="appHeight100 appWidth100">
        <Box flex={1} overflow="auto" className="chatScrollContainer">
          {messageList.map((msg, index) => (
            <Box key={index} mb={2}>
              {msg.sentBy === "USER" ? <UserReply message={msg.message} /> : msg.sentBy === "BOT" && msg.state === "PROCESSING" ? <StreamingResponse initialMessage={msg.message} setProcessing={setProcessing} /> : <BotFileCheckReply message={msg.message} fileName={msg.fileName} fileStatus={msg.fileStatus} messageType={msg.sentBy === "USER" ? "user_doc_upload" : "bot_response"} />}
            </Box>
          ))}
          <div ref={messagesEndRef} />
        </Box>

        <Box display="flex" justifyContent="space-between" alignItems="flex-end" sx={{ flexShrink: 0 }}>
          <Box sx={{ display: ALLOW_VOICE_RECOGNITION ? "flex" : "none" }}>
            <SpeechRecognitionComponent setMessage={setMessage} getMessage={getMessage} />
          </Box>
          <Box sx={{ display: ALLOW_FILE_UPLOAD ? "flex" : "none" }}>
            <Attachment onFileUploadComplete={handleFileUploadComplete} />
          </Box>
          <Box sx={{ width: "100%" }} ml={2}>
            <ChatInput onSendMessage={handleSendMessage} processing={processing} message={message} setMessage={setMessage} />
          </Box>
        </Box>
      </Box>
    </>
  );
}

export default ChatBody;

function UserReply({ message }) {
  return (
    <Grid container direction="row" justifyContent="flex-end" alignItems="flex-end">
      <Grid item className="userMessage" sx={{ backgroundColor: (theme) => theme.palette.background.userMessage }}>
        <Typography variant="body2">{message}</Typography>
      </Grid>
      <Grid item>
        <Avatar alt={"User Profile Pic"} src={UserAvatar} />
      </Grid>
    </Grid>
  );
}

const getBotResponse = (setMessageList, setProcessing, message) => {
  const botMessageBlock = createMessageBlock(message, "BOT", "TEXT", "PROCESSING");
  setMessageList((prevList) => [...prevList, botMessageBlock]);
  // WebSocket connection and handling will be done by the StreamingResponse component
};
