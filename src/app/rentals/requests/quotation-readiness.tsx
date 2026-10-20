import Link from 'next/link';
import type { SettingKey } from '@/modules/settings/registry';

type SettingStatus = {
  key: SettingKey;
  label: string;
  configured: boolean;
};

const quotationPolicyKeys: SettingKey[] = [
  'rental.pricing_models',
  'rental.distance_time_policy',
  'finance.tax_lines',
  'rental.deposit_policy',
  'rental.quote_validity',
];

export function QuotationReadiness({ settings, canEditPolicies }: { settings: SettingStatus[]; canEditPolicies: boolean }) {
  const statusByKey = new Map(settings.map((setting) => [setting.key, setting]));
  const requirements = quotationPolicyKeys.map((key) => {
    const setting = statusByKey.get(key);
    return { key, label: setting?.label ?? key, configured: Boolean(setting?.configured) };
  });
  const missing = requirements.filter((setting) => !setting.configured);

  return <section className="vehicle-editor quotation-readiness" aria-labelledby="quotation-readiness-title">
    <div className="vehicle-editor-heading"><div><p className="eyebrow">Quotation prerequisites</p><h2 id="quotation-readiness-title">Quotation is not available yet</h2></div></div>
    <p className="muted">Pricing, tax, deposit and validity policies must be explicitly entered and validated before a quote can be prepared. A recorded setting value alone does not mean it is valid or approved.</p>
    <ul aria-label="Quotation policy prerequisites">
      {requirements.map((setting) => <li key={setting.key}>
        <strong>{setting.label}</strong> — {setting.configured ? 'Value recorded; validation still required' : 'Not configured'}
      </li>)}
    </ul>
    {missing.length > 0 && <p className="form-help">{missing.length} required {missing.length === 1 ? 'policy is' : 'policies are'} not configured. No pricing or tax defaults are assumed.</p>}
    {!missing.length && <p className="form-help">All required keys have recorded values, but quote validation and generation workflows have not been implemented.</p>}
    {canEditPolicies && <p className="form-help"><Link href="/admin/settings">Review policy settings</Link></p>}
  </section>;
}
