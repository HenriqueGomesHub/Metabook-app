import { defineConfig } from 'wxt';

const WILDCARD = 'https://*.supabase.co/functions/v1/ingest-rounds';

/** Only the configured ingest endpoint (or the Supabase wildcard) is ever granted as a host permission. */
function hostPermission(): string {
  const raw = process.env.VITE_METABOOK_INGEST_URL?.trim();
  if (!raw) return WILDCARD;
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('VITE_METABOOK_INGEST_URL must be https');
  return `${url.origin}${url.pathname}`;
}

export default defineConfig({
  manifest: {
    name: 'Metabook Companion (prototype)',
    description: 'Sends finished GeoGuessr round results to your own Metabook. Prototype, not for publishing.',
    permissions: ['storage'],
    host_permissions: [hostPermission()],
  },
});
