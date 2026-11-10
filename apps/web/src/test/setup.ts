import { configure } from '@testing-library/react';
import { loadBundled } from '../data/content';

// In tests the content is loaded up front, as the app does before its first render.
await loadBundled();

// Screens derive their stats from the whole clue catalogue (~7,000 clues); on a busy machine the
// first render can take more than the default 1 s that findBy* waits.
configure({ asyncUtilTimeout: 5000 });
