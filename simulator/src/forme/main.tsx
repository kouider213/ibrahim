import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// 13/11 : FORME s'ouvre aussi sans réseau (sous-sol de la salle) — même service worker que l'app Dzaryx
if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('/ibrahim/sw.js', { scope: '/ibrahim/' }).catch(() => {}); });
