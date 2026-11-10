// The `wipemedia` step: deletes every object in the old public `media` bucket (candidates/,
// approved/ and anything else), 100 per request. The bucket itself is then deleted by hand.
export async function wipeMedia({ storage }) {
  const paths = await storage.listAll();
  const folders = {};
  for (const p of paths) {
    const folder = p.includes('/') ? p.split('/')[0] : '(root)';
    folders[folder] = (folders[folder] ?? 0) + 1;
  }
  const removed = await storage.remove(paths);
  return { counts: { listed: paths.length, removed, ...folders } };
}
