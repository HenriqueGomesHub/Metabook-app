import { browser } from 'wxt/browser';
import { gameTokenFromPath, isGamePath } from '../src/game';
import type { ContentMessage } from '../src/messages';
import { parseResult } from '../src/parser';

/*
 * Passive, read-only. No network, no DOM writes, no styles, no injected scripts,
 * no patched globals. Navigation is detected by polling location.pathname.
 */
export default defineContentScript({
  matches: ['https://www.geoguessr.com/game/*'],
  runAt: 'document_idle',
  main() {
    let observer: MutationObserver | null = null;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    let activeToken: string | null = null;
    let failedToken: string | null = null;
    const sent = new Set<string>();

    const send = (message: ContentMessage) => {
      void browser.runtime.sendMessage(message).catch(() => undefined);
    };

    function stopObserving() {
      observer?.disconnect();
      observer = null;
      if (debounce) clearTimeout(debounce);
      debounce = undefined;
    }

    function fail(reason: string) {
      failedToken = activeToken;
      stopObserving();
      send({ type: 'parse-failed', reason });
    }

    function inspect() {
      debounce = undefined;
      if (!isGamePath(location.pathname)) return stopObserving();
      const token = gameTokenFromPath(location.pathname);
      if (!token || token !== activeToken) return;

      let parsed;
      try {
        parsed = parseResult(document);
      } catch {
        return fail('parse-error');
      }
      if (!parsed) return; // result screen not shown yet
      if (parsed.roundNumber === undefined) return fail('no-round');
      if (!parsed.truthCountry || !parsed.guessCountry) return fail('no-country');

      const key = `${token}:${parsed.roundNumber}`;
      if (sent.has(key)) return;
      sent.add(key);
      send({
        type: 'capture',
        gameKey: key,
        round: {
          id: `gg-${token}-${parsed.roundNumber}`.slice(0, 64),
          source: 'extension',
          playedAt: new Date().toISOString(),
          truth: { country: parsed.truthCountry },
          guess: { country: parsed.guessCountry },
          ...(parsed.distanceKm !== undefined && { distanceKm: parsed.distanceKm }),
          ...(parsed.score !== undefined && { score: parsed.score }),
        },
      });
    }

    function check() {
      if (!isGamePath(location.pathname)) {
        activeToken = null;
        return stopObserving();
      }
      const token = gameTokenFromPath(location.pathname);
      if (!token || token === failedToken) return stopObserving();
      if (token !== activeToken) {
        stopObserving();
        activeToken = token;
      }
      if (observer) return;
      observer = new MutationObserver(() => {
        if (!isGamePath(location.pathname)) return stopObserving();
        if (debounce) clearTimeout(debounce);
        debounce = setTimeout(inspect, 500);
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      inspect();
    }

    check();
    setInterval(check, 2000);
  },
});
