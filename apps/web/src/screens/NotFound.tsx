import { useAppData } from '../app/AppData';
import { ArrowIcon, LinkButton } from '../components/Button';
import { Header } from '../components/Header';

export function NotFound() {
  const { data } = useAppData();
  return (
    <div className="page">
      <Header user={data?.user ?? null} />
      <main className="page-main">
        <div className="page-title rise">
          <div>
            <h1 className="headline">This page doesn’t exist</h1>
            <p>The link may be old or mistyped.</p>
          </div>
        </div>
        <LinkButton to="/" className="rise d1">
          Back to Today
          <ArrowIcon />
        </LinkButton>
      </main>
    </div>
  );
}
