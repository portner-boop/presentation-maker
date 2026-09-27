import { NuqsAdapter } from 'nuqs/adapters/react-router/v8';
import { createBrowserRouter, Outlet } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';

// страницы грузятся отдельными чанками: первый экран не тянет код формы и режима спикера
const page = (load: () => Promise<{ Component: React.ComponentType }>) => ({ lazy: load });

export const router = createBrowserRouter([
  {
    element: (
      <NuqsAdapter>
        <Outlet />
      </NuqsAdapter>
    ),
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            index: true,
            ...page(() =>
              import('../pages/PresentationsPage').then((m) => ({
                Component: m.PresentationsPage,
              })),
            ),
          },
          {
            path: 'presentations/new',
            ...page(() =>
              import('../pages/NewPresentationPage').then((m) => ({
                Component: m.NewPresentationPage,
              })),
            ),
          },
          {
            path: 'presentations/:id',
            ...page(() =>
              import('../pages/PresentationPage').then((m) => ({ Component: m.PresentationPage })),
            ),
          },
          {
            path: 'templates',
            ...page(() =>
              import('../pages/TemplatesPage').then((m) => ({ Component: m.TemplatesPage })),
            ),
          },
          {
            path: 'templates/:id',
            ...page(() =>
              import('../pages/TemplatePage').then((m) => ({ Component: m.TemplatePage })),
            ),
          },
          {
            path: '*',
            ...page(() =>
              import('../pages/NotFoundPage').then((m) => ({ Component: m.NotFoundPage })),
            ),
          },
        ],
      },
    ],
  },
]);
