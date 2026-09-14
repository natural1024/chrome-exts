import React from 'react';
import { createRoot } from 'react-dom/client';
import Options from './Options';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found in options/index.html');

createRoot(rootEl).render(
  <React.StrictMode>
    <Options />
  </React.StrictMode>
);
