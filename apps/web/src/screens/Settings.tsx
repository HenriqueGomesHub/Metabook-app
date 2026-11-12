import { useState } from 'react';
import { useAppData } from '../app/AppData';
import { Status } from '../components/Status';
import { Page } from './manage/Page';
import { Account } from './settings/Account';
import { CurateLink } from './settings/CurateLink';
import { Pairing } from './settings/Pairing';
import { SettingsForm } from './settings/SettingsForm';
import './atlas/atlas.css';

const TABS = [
  { id: 'study', label: 'Study' },
  { id: 'extension', label: 'Extension & account' },
] as const;

/** Two tabs, so neither scrolls: the study limits, then the extension and the account. */
export function Settings() {
  const { data, error, saveSettings } = useAppData();
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('study');
  if (!data) return <Status error={error} />;
  return (
    <Page
      user={data.user}
      title="Settings"
      actions={
        <div className="segments" role="tablist" aria-label="Settings">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              className="seg"
              aria-selected={id === tab}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'study' ? (
        <SettingsForm settings={data.settings} onSave={saveSettings} />
      ) : (
        <>
          <Pairing />
          <Account />
          <CurateLink />
        </>
      )}
    </Page>
  );
}
