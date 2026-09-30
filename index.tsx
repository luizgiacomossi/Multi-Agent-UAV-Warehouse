import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ThemeService } from './services/theme/ThemeService';

// Initialize and apply saved theme tokens immediately to DOM
ThemeService.getInstance();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);