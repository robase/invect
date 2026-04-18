import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Invect } from '@invect/ui';
import '@invect/ui/styles';
import { invectConfig } from '../../express-drizzle/invect.config';

import './app.css';

export const App = () => {
  // Override apiPath so the Vite dev server reaches the Express backend on port 3000.
  const config = {
    ...invectConfig,
    apiPath: import.meta.env.VITE_INVECT_API_BASE_URL ?? 'http://localhost:3000/invect',
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/invect" replace />} />
        <Route
          path="/*"
          element={
            <div className="h-screen">
              <Invect config={config} />
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
};

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(<App />);
}
