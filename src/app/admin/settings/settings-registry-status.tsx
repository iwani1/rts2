'use client';

import { useEffect, useState } from 'react';

type SettingStatus = {
  key: string;
  label: string;
  category: string;
  configured: boolean;
  updatedAt: string | null;
  blockedFeatures: string[];
};

export function SettingsRegistryStatus({ companyId, companyName }: { companyId: string; companyName: string }) {
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/admin/companies/${encodeURIComponent(companyId)}/settings`, { cache: 'no-store' });
        const body = await response.json() as { settings?: SettingStatus[]; error?: string };
        if (!response.ok || !body.settings) throw new Error(body.error || 'Unable to load settings status.');
        if (!cancelled) setSettings(body.settings);
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Unable to load settings status.');
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [companyId]);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!settings) return <p role="status">Loading policy settings status…</p>;

  const configuredCount = settings.filter((setting) => setting.configured).length;
  return <section className="settings-status-panel" aria-labelledby="settings-list-title">
    <div className="fleet-list-heading"><div>
      <p className="eyebrow">{companyName}</p>
      <h2 id="settings-list-title">Required policy registry</h2>
      <p className="muted">{configuredCount} of {settings.length} settings configured. A configured flag does not mean the policy value has been reviewed or approved.</p>
    </div></div>
    {settings.length === 0 ? <div className="audit-empty" role="status"><h3>No registered policy keys</h3><p>The policy catalogue is empty.</p></div> : <div className="audit-table-wrap" role="region" aria-label="Required policy settings" tabIndex={0}>
      <table className="audit-table settings-status-table">
        <caption className="visually-hidden">Registered policy keys, configuration status and blocked features</caption>
        <thead><tr><th scope="col">Policy</th><th scope="col">Category</th><th scope="col">Status</th><th scope="col">Last updated</th><th scope="col">Dependent features blocked while unset</th></tr></thead>
        <tbody>{settings.map((setting) => <tr key={setting.key}>
          <td><strong>{setting.label}</strong><code className="audit-secondary">{setting.key}</code></td>
          <td>{setting.category}</td>
          <td><span className={setting.configured ? 'setting-status setting-status-configured' : 'setting-status'}>{setting.configured ? 'Configured' : 'Not configured'}</span></td>
          <td>{setting.updatedAt ? new Intl.DateTimeFormat('en-GH', { dateStyle: 'medium', timeZone: 'Africa/Accra' }).format(new Date(setting.updatedAt)) : '—'}</td>
          <td>{setting.blockedFeatures.length > 0 ? setting.blockedFeatures.join(', ') : 'None listed'}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
