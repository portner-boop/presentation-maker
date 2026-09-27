import '@mantine/core/styles.layer.css';
import '@mantine/dropzone/styles.layer.css';
import '@mantine/notifications/styles.layer.css';
import './styles/tokens.css';
import './styles/global.css';

import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createHead, UnheadProvider } from '@unhead/react/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './app/router';
import { cssVariablesResolver, theme } from './app/theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, retry: 1, refetchOnWindowFocus: true },
  },
});

const head = createHead({
  init: [
    { titleTemplate: (title) => (title ? `${title} · Presentation Maker` : 'Presentation Maker') },
  ],
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UnheadProvider head={head}>
      <QueryClientProvider client={queryClient}>
        <MantineProvider
          theme={theme}
          cssVariablesResolver={cssVariablesResolver}
          forceColorScheme="light"
        >
          <Notifications position="bottom-right" limit={3} />
          <RouterProvider router={router} />
        </MantineProvider>
      </QueryClientProvider>
    </UnheadProvider>
  </StrictMode>,
);
