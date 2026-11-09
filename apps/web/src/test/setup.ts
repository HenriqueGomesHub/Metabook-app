import { loadBundled } from '../data/content';
import { loadMedia } from '../data/media';

// In tests the content is loaded up front, as the app does before its first render.
await Promise.all([loadBundled(), loadMedia()]);
