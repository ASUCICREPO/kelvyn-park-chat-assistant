import React from "react";
import { Grid, AppBar } from "@mui/material";
import Logo from "../Assets/header_logo.svg";
import Switch from "./Switch.jsx";
import { ALLOW_MULTLINGUAL } from "../utilities/constants";

function AppHeader({ showSwitch }) {

  return (
    <AppBar
      position="static"
      sx={{
        backgroundColor: (theme) => theme.palette.background.header,
        height: "5rem",
        boxShadow: "none",
        borderBottom: (theme) => `1.5px solid ${theme.palette.primary[50]}`,
      }}
    >
      <Grid
        container
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ padding: "0 3rem" }}
        className="appHeight100"
      >
        <Grid item>
          <img src={Logo} alt={`App main Logo`} height={48} />
        </Grid>
        <Grid item>
          <Grid container alignItems="center" justifyContent="space-evenly" spacing={2}>
            <Grid item sx={{ display: ALLOW_MULTLINGUAL && showSwitch ? "flex" : "none" }}>
              <Switch />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
    </AppBar>
  );
}

export default AppHeader;
