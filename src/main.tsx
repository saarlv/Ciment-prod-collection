// The app's entry, the same for every Blocks app. The platform restores it at every build, so an
// edit here is never saved: app-wide providers, chrome and <Toaster/> go in src/root.tsx.
/// <reference types="vite/client" />
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BlocksApp } from '@blocksdiy/blocks-client-sdk/app';

// The stylesheet first: a glob's imports run ahead of the file's other imports, so a plain import
// here would load after the app's modules and the CSS they import.
import.meta.glob('./index.css', { eager: true });

// The app's code, as BlocksApp renders it: the routes under src/routes/ inside src/root.tsx, or an
// older app's src/pages/ inside src/layout.tsx, and the chat-component renderer when the app has one.
const modules = import.meta.glob(
  [
    './routes/**/*.tsx',
    './root.tsx',
    './pages/**/*.tsx',
    './layout.tsx',
    './components/ui/agent-chat-code-component.tsx',
  ],
  { eager: true },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BlocksApp modules={modules} />
  </StrictMode>,
);
