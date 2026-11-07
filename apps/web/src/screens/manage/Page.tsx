import type { ReactNode } from 'react';
import { Header } from '../../components/Header';
import type { AuthUser } from '../../data';
import './manage.css';

/** Shared frame of the management screens: top bar, title row, content. */
export function Page({
  user,
  title,
  subtitle,
  actions,
  children,
}: {
  user: AuthUser | null;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="page">
      <Header user={user} />
      <div className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="page-actions">{actions}</div>}
        </div>
        <div className="manage">{children}</div>
      </div>
    </div>
  );
}
