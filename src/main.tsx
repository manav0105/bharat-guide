import { createRoot } from 'react-dom/client';
import { BharatGuide } from './BharatGuide';
import { ConvexReactClient } from 'convex/react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);
createRoot(document.getElementById('root')!).render(
  <ConvexAuthProvider client={convex}><BharatGuide /></ConvexAuthProvider>,
);
