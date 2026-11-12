import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

type Theme = 'light' | 'dark';
const storageKey = 'rfp-theme';

function preferredTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(storageKey);
  } catch {
    // Sandboxed previews can intentionally deny Web Storage.
  }
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>(() => preferredTheme());
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // Theme still applies for this document when persistence is unavailable.
    }
  }, [theme]);
  const dark = theme === 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle focus-ring ${compact ? 'theme-toggle-compact' : ''}`}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      aria-pressed={dark}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
      <span className={compact ? 'sr-only' : ''}>{dark ? 'Light' : 'Dark'} mode</span>
    </button>
  );
}
