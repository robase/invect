import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Invect } from '@invect/ui';
import '@invect/ui/styles';
import { auth } from '@invect/user-auth';
import { rbac } from '@invect/rbac';
import { webhooks } from '@invect/webhooks';
import { versionControl } from '@invect/version-control';
import { mcp } from '@invect/mcp';
import { vercelWorkflowsPlugin } from '@invect/vercel-workflows';

import './app.css';

export const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/invect" replace />} />
        <Route
          path="/*"
          element={
            <div className="h-screen">
              <Invect
                config={{
                  apiPath: '/api/invect',
                  frontendPath: '/invect',
                  theme: 'dark',
                  plugins: [
                    auth(),
                    rbac(),
                    webhooks(),
                    versionControl(),
                    mcp(),
                    vercelWorkflowsPlugin(),
                  ],
                }}
              />
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
