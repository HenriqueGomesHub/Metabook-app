/** Placeholder while app data loads, or the load error. */
export function Status({ error }: { error: Error | null }) {
  return error ? (
    <p className="status" role="alert">
      Couldn’t load your data: {error.message}
    </p>
  ) : (
    <div className="status status-loading" aria-busy="true" aria-live="polite">
      <span className="status-mark" aria-hidden="true" />
      Loading your cards…
    </div>
  );
}
