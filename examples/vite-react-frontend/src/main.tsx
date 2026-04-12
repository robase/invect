import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { Invect, InvectShell, OAuth2CallbackHandler } from '@invect/ui';
import { AuthenticatedInvect, authFrontend } from '@invect/user-auth/ui';
import { rbacFrontend } from '@invect/rbac/ui';
import { webhooksFrontend } from '@invect/webhooks/ui';

import './app.css';

import '@invect/ui/styles';

export const App = () => {
  const apiBaseUrl = import.meta.env.VITE_INVECT_API_BASE_URL ?? '/api/invect';

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/invect" replace />} />

        {/* OAuth2 callback route - must be at root level to receive redirects */}
        <Route path="/oauth/callback" element={<OAuth2CallbackHandler />} />

        {/* Main app routes */}
        <Route
          path="/*"
          element={
            <div className="h-screen">
              <AuthenticatedInvect
                apiBaseUrl={apiBaseUrl}
                InvectComponent={Invect}
                ShellComponent={InvectShell}
                plugins={[authFrontend, rbacFrontend, webhooksFrontend]}
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
