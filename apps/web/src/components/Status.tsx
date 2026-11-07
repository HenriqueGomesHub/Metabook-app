/** Placeholder while app data loads, or the load error. */
export function Status({ error }: { error: Error | null }) {
  return error ? (
    <p className="status" role="alert">
      Couldn’t load your data: {error.message}
    </p>
  ) : (
    <p className="status" aria-busy="true">
      Loading…
    </p>
  );
}
