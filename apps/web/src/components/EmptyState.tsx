import { ArrowIcon, Button, LinkButton } from './Button';

export type EmptyAction =
  { label: string; to: string; onClick?: never } | { label: string; onClick(): void; to?: never };

/**
 * The one empty state: an animated globe, a headline, a line of text and up to two pill
 * actions (the first is primary), centred in whatever area it fills. `fill` takes the whole
 * viewport (screens without a header); `compact` sits inside a panel.
 */
export function EmptyState({
  title,
  text,
  actions = [],
  size = 'area',
}: {
  title: string;
  text: string;
  actions?: EmptyAction[];
  size?: 'fill' | 'area' | 'compact';
}) {
  return (
    <section className={`empty empty-${size}`} aria-label={title}>
      <svg className="empty-globe" viewBox="0 0 48 48" aria-hidden="true">
        <circle className="g-outline" cx="24" cy="24" r="18" pathLength={1} />
        <path className="g-line" d="M6 24h36" pathLength={1} />
        <path className="g-line d" d="M9.5 14h29M9.5 34h29" pathLength={1} />
        <ellipse className="g-meridian" cx="24" cy="24" rx="8" ry="18" />
        <ellipse className="g-meridian late" cx="24" cy="24" rx="8" ry="18" />
      </svg>
      <h2 className="headline">{title}</h2>
      <p>{text}</p>
      {actions.length > 0 && (
        <div className="empty-actions">
          {actions.slice(0, 2).map((action, i) => {
            const variant = i === 0 ? 'cta' : 'ghost';
            const content = (
              <>
                {action.label}
                {i === 0 && <ArrowIcon />}
              </>
            );
            return action.to !== undefined ? (
              <LinkButton key={action.label} to={action.to} variant={variant}>
                {content}
              </LinkButton>
            ) : (
              <Button key={action.label} variant={variant} onClick={action.onClick}>
                {content}
              </Button>
            );
          })}
        </div>
      )}
    </section>
  );
}
