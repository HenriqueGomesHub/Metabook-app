import type { ButtonHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import type { LinkProps } from 'react-router-dom';

type Variant = 'cta' | 'ghost';

export function ArrowIcon() {
  return (
    <svg className="icon arrow" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export function Button({
  variant = 'cta',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button type="button" className={className ? `${variant} ${className}` : variant} {...props} />
  );
}

export function LinkButton({
  variant = 'cta',
  className,
  ...props
}: LinkProps & { variant?: Variant }) {
  return <Link className={className ? `${variant} ${className}` : variant} {...props} />;
}
