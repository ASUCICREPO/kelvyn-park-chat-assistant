import React, { useState } from 'react';
import { Box, Button, Typography, Radio, RadioGroup, FormControlLabel } from '@mui/material';
import AppHeader from './AppHeader';
import ChatHeader from './ChatHeader';
import { useLanguage } from '../utilities/LanguageContext';
import { useCookies } from 'react-cookie';
import Grid from "@mui/material/Grid";
import { LANDING_PAGE_TEXT } from '../utilities/constants';

const LandingPage = () => {
  const [selectedLanguage, setSelectedLanguage] = useState('EN');
  const { setLanguage } = useLanguage();
  const [, setCookie] = useCookies(['language']);

  const handleLanguageChange = (event) => {
    setSelectedLanguage(event.target.value);
  };

  const handleSaveLanguage = () => {
    setLanguage(selectedLanguage);
    setCookie('language', selectedLanguage, { path: '/' });
    window.location.reload();
  };

  const texts = LANDING_PAGE_TEXT[selectedLanguage];

  return (
    <Box height="100vh" display="flex" flexDirection="column" sx={{ backgroundColor: '#f5f5f5' }}>
      <AppHeader showSwitch={false} />
      <Grid container direction="column" alignItems="center" flex={1} p={2}>
        <Box width="100%" mt={2}>
          <ChatHeader selectedLanguage={selectedLanguage} />
        </Box>
        <Box 
          display="flex" 
          flexDirection="column" 
          alignItems="center" 
          justifyContent="center" 
          p={2} 
          width="100%" 
          sx={{ backgroundColor: 'white', borderRadius: 2, boxShadow: 1, maxWidth: 600, mt: 4 }}
        >
          <Typography
            variant="h6"
            component="p"
            style={{ whiteSpace: "pre-line", textAlign: "center" }}
            sx={{ mb: 4, px: { xs: 2, sm: 4, md: 6, lg: 8 }, color: 'text.primary' }}
          >
          {texts.WELCOME_MESSAGE}
          </Typography>

          <Typography variant="h5" gutterBottom sx={{ color: 'primary.main' }}>
            {texts.CHOOSE_LANGUAGE}
          </Typography>
          <RadioGroup value={selectedLanguage} onChange={handleLanguageChange} row>
            <FormControlLabel value="EN" control={<Radio />} label={texts.ENGLISH} />
            <FormControlLabel value="ES" control={<Radio />} label={texts.SPANISH} />
          </RadioGroup>
          <Button 
            variant="contained" 
            onClick={handleSaveLanguage} 
            sx={{ mt: 2, transition: 'background-color 0.3s', ':hover': { backgroundColor: 'primary.dark' } }}
          >
            {texts.SAVE_CONTINUE}
          </Button>
        </Box>
      </Grid>
    </Box>
  );
};

export default LandingPage;
