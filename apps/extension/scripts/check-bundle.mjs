import { readFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
const FORBIDDEN = [
  'postMessage', 'dispatchEvent', 'CustomEvent', 'fetch(', 'XMLHttpRequest', 'WebSocket',
  'createElement', 'innerHTML', 'insertAdjacent', 'appendChild', 'setAttribute', 'classList',
  '.style', 'console.', 'eval(', 'new Function',
];

const problems = [];
const content = readFileSync(new URL('content.js', dist), 'utf8');
for (const token of FORBIDDEN) if (content.includes(token)) problems.push(`content.js contains "${token}"`);

const manifest = JSON.parse(readFileSync(new URL('manifest.json', dist), 'utf8'));
if ('web_accessible_resources' in manifest) problems.push('manifest has web_accessible_resources');
if ('externally_connectable' in manifest) problems.push('manifest has externally_connectable');
if (JSON.stringify(manifest.permissions) !== '["storage","sidePanel"]') {
  problems.push(`manifest permissions must be exactly ["storage","sidePanel"], got ${JSON.stringify(manifest.permissions)}`);
}
const scripts = manifest.content_scripts ?? [];
if (scripts.length !== 1 || JSON.stringify(scripts[0].matches) !== '["https://www.geoguessr.com/game/*"]') {
  problems.push(`content_scripts must be one script matching only https://www.geoguessr.com/game/*, got ${JSON.stringify(scripts)}`);
}
if ((manifest.host_permissions ?? []).some((p) => p.includes('geoguessr.com'))) problems.push('manifest has a geoguessr.com host permission');
if ('content_security_policy' in manifest) problems.push('manifest sets content_security_policy (not needed; extension pages may frame https by default)');

if (problems.length > 0) {
  console.error('check-bundle FAILED:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log(`check-bundle OK: content.js (${content.length} bytes) has none of ${FORBIDDEN.length} forbidden tokens; manifest permissions = ["storage","sidePanel"], no web_accessible_resources.`);
