import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';
import './styles/finance-refinement.css';
import './styles/digital-rfp.css';
import './styles/ux-refinement.css';
import './styles/compact-layout.css';
import './styles/responsive-fix.css';
import './styles/overflow-polish.css';
import './styles/rf-liquidation-editor.css';
import './styles/rf-print-a4.css';
import './styles/admin-shell-polish.css';

const themeStorageKey = 'rfp-theme';
let savedTheme: string | null = null;
try {
  savedTheme = localStorage.getItem(themeStorageKey);
} catch {
  // Sandboxed previews can intentionally deny Web Storage.
}
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
