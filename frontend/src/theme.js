import { createTheme } from "@mui/material/styles";
import { PRIMARY_MAIN, SECONDARY_MAIN, CHAT_BODY_BACKGROUND, CHAT_LEFT_PANEL_BACKGROUND, HEADER_BACKGROUND, USERMESSAGE_BACKGROUND, BOTMESSAGE_BACKGROUND, primary_50 } from "./utilities/constants";

const theme = createTheme({
  typography: {
    fontFamily: 'Lato, -apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
  },
  palette: {
    primary: {
      main: PRIMARY_MAIN,
      50: primary_50,
    },
    background: {
      default: CHAT_BODY_BACKGROUND,
      chatBody: CHAT_BODY_BACKGROUND,
      chatLeftPanel: CHAT_LEFT_PANEL_BACKGROUND,
      header: HEADER_BACKGROUND,
      botMessage: BOTMESSAGE_BACKGROUND,
      userMessage: USERMESSAGE_BACKGROUND,
    },
    secondary: {
      main: SECONDARY_MAIN,
    },
  },
});

export default theme;
