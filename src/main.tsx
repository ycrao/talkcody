// src/main.tsx
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import './index.css';

// Configure Monaco Environment before app starts
window.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'typescript' || label === 'javascript') {
      return new tsWorker();
    }
    return new editorWorker();
  },
};

// Use StrictMode only in development to help detect issues
// In production, avoid double-invocation of effects for better performance
const isDevelopment = import.meta.env.DEV;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  isDevelopment ? (
    <React.StrictMode>
      <App />
    </React.StrictMode>
  ) : (
    <App />
  )
);
