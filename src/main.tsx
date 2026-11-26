import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely register offline Service Worker without breaking dev or iframe sandboxes
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // Gracefully ignore in restricted preview contexts
      });
    } catch {
      // ignore
    }
  });
}

createRoot(document.getElementById('root')!).render(<App />);
