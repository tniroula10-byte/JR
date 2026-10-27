import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'John Rambo — Virtual Game Points Syndicate',
    short_name: 'John Rambo',
    description:
      'Invitation-only mobile-first PWA for virtual game points catalog, rupee offer negotiation, private support chat, and tracked tickets.',
    start_url: '/home',
    display: 'standalone',
    background_color: '#070913',
    theme_color: '#8B5CF6',
    orientation: 'portrait-primary',
    icons: [
      {
        src: '/icons/icon-192.svg',
        sizes: '192x192',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: '/icons/icon-512.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: '/icons/icon-maskable.svg',
        sizes: '512x512',
        type: 'image/svg+xml',
        purpose: 'maskable'
      }
    ]
  };
}
