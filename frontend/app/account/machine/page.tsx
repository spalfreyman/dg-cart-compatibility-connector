'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface MachineProfile {
  isGen1: boolean;
  isGen2: boolean;
  hasAdapter: boolean;
  isGen25: boolean;
}

export default function MachinePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MachineProfile>({ isGen1: false, isGen2: false, hasAdapter: false, isGen25: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/account/machine')
      .then((r) => {
        if (r.status === 401) { router.push('/account/login'); return null; }
        return r.json();
      })
      .then((data) => {
        if (data) setProfile(data);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const res = await fetch('/api/account/machine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        const d = await res.json();
        setError(d.error ?? 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center text-gray-400">
        Loading…
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Machine Settings</h1>
      <p className="text-gray-500 text-sm mb-8">
        Set your machine type so we can show you compatible products and flag any mismatches in your cart.
      </p>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100">
        <Toggle
          label="NESCAFÉ Dolce Gusto® (Gen 1)"
          description="Original machine — compatible with classic capsule range"
          checked={profile.isGen1}
          onChange={(v) => setProfile((p) => ({ ...p, isGen1: v }))}
        />
        <Toggle
          label="NESCAFÉ Dolce Gusto® NEO (Gen 2)"
          description="NEO machine — compatible with the NEO capsule range"
          checked={profile.isGen2}
          onChange={(v) => setProfile((p) => ({ ...p, isGen2: v }))}
        />
        <Toggle
          label="NEO Adapter"
          description="Adapter for Gen 1 machines — adds compatibility with select NEO capsules"
          checked={profile.hasAdapter}
          onChange={(v) => setProfile((p) => ({ ...p, hasAdapter: v }))}
          disabled={!profile.isGen1}
          disabledNote="Requires a Gen 1 machine"
        />
        <Toggle
          label="NESCAFÉ Dolce Gusto® NEO Latte (Gen 2.5)"
          description="NEO Latte machine — compatible with Gen 2.5 and Gen 2 capsule range"
          checked={profile.isGen25}
          onChange={(v) => setProfile((p) => ({ ...p, isGen25: v }))}
        />
      </div>

      {error && <p className="text-red-600 text-sm mt-4">{error}</p>}

      <div className="flex items-center gap-4 mt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-brand-red text-white px-8 py-3 rounded-full font-semibold hover:bg-brand-red-dark disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save Settings'}
        </button>
        {saved && (
          <span className="text-green-600 text-sm font-medium">Settings saved</span>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
  disabledNote,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledNote?: string;
}) {
  return (
    <div className={`flex items-start gap-4 p-5 ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 text-sm">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        {disabled && disabledNote && (
          <p className="text-xs text-amber-600 mt-0.5">{disabledNote}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
          checked ? 'bg-brand-red' : 'bg-gray-200'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
