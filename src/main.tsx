import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/finance-refinement.css';
import './styles/digital-rfp.css';
import './styles/ux-refinement.css';
import './styles/compact-layout.css';
import './styles/responsive-fix.css';

const themeStorageKey = 'rfp-theme';
const savedTheme = localStorage.getItem(themeStorageKey);
const initialTheme =
  savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : window.matchMedia?.('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';

document.documentElement.classList.toggle('dark', initialTheme === 'dark');
document.documentElement.dataset.theme = initialTheme;
document.documentElement.style.colorScheme = initialTheme;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
