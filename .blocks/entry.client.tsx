// The client entry of a framework build (bundle contract 3): app-render's host starts before the
// app's tree hydrates, as its page does before it imports a bundle.
import { startBlocksHost } from '@blockscom/app-render/hosted';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { HydratedRouter } from 'react-router/dom';

const mountHost = startBlocksHost();

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <HydratedRouter />
    </StrictMode>,
  );
  // After the page's root exists, so React listens on the document for the page's events.
  mountHost();
});
