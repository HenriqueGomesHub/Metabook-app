export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  return (
    <div
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div style={{ width: `${max ? (value / max) * 100 : 0}%` }} />
    </div>
  );
}
