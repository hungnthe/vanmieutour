import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import App from './App.jsx';

const container = document.getElementById('root');
const root = createRoot(container);
flushSync(() => root.render(<App />));
