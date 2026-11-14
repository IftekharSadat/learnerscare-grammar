import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/fraunces/latin-600.css';
import '@fontsource/fraunces/latin-700.css';
import '@fontsource-variable/nunito/wght.css';
import './theme/tokens.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// easy-read font is only fetched when switched on
const loadEasy = () => void Promise.all([import('@fontsource/atkinson-hyperlegible/latin-400.css'), import('@fontsource/atkinson-hyperlegible/latin-700.css')]);
new MutationObserver(() => document.documentElement.dataset.font === 'easy' && loadEasy()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-font'] });
