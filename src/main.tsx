import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import App from './App';
import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Root-Element #root nicht gefunden');

// Data Router (statt BrowserRouter) – nur damit kann eine Seite das Verlassen mit ungespeicherten Änderungen abfangen
// (useBlocker). Die eigentlichen Routen stehen weiter in App.
const router = createBrowserRouter([{ path: '*', element: <App /> }]);

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
