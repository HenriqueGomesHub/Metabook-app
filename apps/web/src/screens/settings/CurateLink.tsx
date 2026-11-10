import { useEffect, useState } from 'react';
import { useAppData } from '../../app/AppData';
import { ArrowIcon, LinkButton } from '../../components/Button';

/** Admins (cloud mode, app_admins row) get the way into /curate; everyone else sees nothing. */
export function CurateLink() {
  const { curation: api } = useAppData();
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    if (!api) return;
    let live = true;
    api.isAdmin().then(
      (yes) => live && setAdmin(yes),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [api]);
  if (!admin) return null;
  return (
    <section className="sheet" aria-label="Clue image curation">
      <h2 className="headline">Clue images</h2>
      <p className="note">Hide clue images from drills, or crop away what gives them away.</p>
      <div className="actions">
        <LinkButton to="/curate">
          Curate images
          <ArrowIcon />
        </LinkButton>
      </div>
    </section>
  );
}
