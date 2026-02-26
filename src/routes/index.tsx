import { createBrowserRouter } from 'react-router-dom';
import CompagnieLayout from '@/modules/compagnie/admin/layout/CompagnieLayout';
import MessagesCompagniePage from '@/modules/compagnie/pages/MessagesCompagniePage';

export const router = createBrowserRouter([
  {
    path: '/compagnie',
    element: <CompagnieLayout />,
    children: [
      {
        path: 'messages',
        element: <MessagesCompagniePage />,
      },
      // autres routes...
    ],
  },
]);
