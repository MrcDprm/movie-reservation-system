import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.jsx';
import { PrefsProvider } from './lib/prefs.jsx';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retrying a 4xx (not found, not logged in) would only repeat the same answer.
      retry: (count, error) => count < 2 && !(error?.status >= 400 && error?.status < 500),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PrefsProvider>
        <App />
      </PrefsProvider>
    </QueryClientProvider>
  </StrictMode>,
);
