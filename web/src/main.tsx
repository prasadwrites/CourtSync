import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import { ToastProvider } from './lib/toast';
import App from './App';
import { configMissing } from './lib/firebase';
import './index.css';

if (configMissing) {
  document.getElementById('root')!.innerHTML =
    '<div style="font-family:system-ui,sans-serif;max-width:520px;margin:15vh auto;padding:0 16px;line-height:1.5">' +
    '<h1 style="font-size:20px">CourtSync is not configured</h1>' +
    '<p>This build has no Firebase web settings. Fill in <code>web/.env.local</code> (see <code>web/.env.example</code>), then run <code>npm run deploy:dev</code> again.</p></div>';
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </StrictMode>,
  );
}
