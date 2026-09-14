import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { TelevizeObrazovka } from './components/televize/TelevizeObrazovka.tsx';
import './index.css';

/*
 * Okno pro televizi v učebně se sestaví místo celé aplikace.
 *
 * Rozhoduje se tady, ne v App: studio se v tom okně nemá postavit vůbec,
 * takže se na stěnu nedostane navigace ani poznámky učitele, a nespustí
 * se nic, co hraje.
 */
const jeTelevize = new URLSearchParams(window.location.search).has('televize');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      {jeTelevize ? <TelevizeObrazovka /> : <App />}
    </ErrorBoundary>
  </StrictMode>,
);

