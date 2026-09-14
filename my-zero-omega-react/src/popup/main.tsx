import React from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './Popup';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root not found in popup/index.html');

createRoot(rootEl).render(
  <React.StrictMode>
    <Popup />
  </React.StrictMode>
);
