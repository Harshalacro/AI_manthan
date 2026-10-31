import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import Intro from './components/Intro';
import './index.css';

function introLang() {
  try {
    return localStorage.getItem('jd.lang') === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Intro lang={introLang()} />
  </StrictMode>,
);
