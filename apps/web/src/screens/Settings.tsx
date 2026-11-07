import { useAppData } from '../app/AppData';
import { Status } from '../components/Status';
import { Page } from './manage/Page';
import { Account } from './settings/Account';
import { Pairing } from './settings/Pairing';
import { SettingsForm } from './settings/SettingsForm';

export function Settings() {
  const { data, error, saveSettings } = useAppData();
  if (!data) return <Status error={error} />;
  return (
    <Page
      user={data.user}
      title="Settings"
      subtitle="Daily limits, block defaults and the extension."
    >
      <SettingsForm settings={data.settings} onSave={saveSettings} />
      <Pairing />
      <Account />
    </Page>
  );
}
