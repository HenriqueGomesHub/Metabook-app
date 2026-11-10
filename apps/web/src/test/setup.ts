import { loadBundled } from '../data/content';

// In tests the content is loaded up front, as the app does before its first render.
await loadBundled();
