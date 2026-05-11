import React, { useEffect, useMemo, useState } from 'react';
import type { Contact, ContactInput } from './types';

interface AttrRow {
  id: string;
  key: string;
  value: string;
}

interface Props {
  initial?: Contact | null;
  submitting?: boolean;
  onSubmit: (input: ContactInput) => Promise<void> | void;
  onCancel: () => void;
}

const newRow = (): AttrRow => ({
  id: Math.random().toString(36).slice(2),
  key: '',
  value: '',
});

const attributesToRows = (attributes?: Record<string, unknown> | null): AttrRow[] => {
  if (!attributes) return [];
  return Object.entries(attributes).map(([k, v]) => ({
    id: k,
    key: k,
    value: typeof v === 'object' ? JSON.stringify(v) : String(v ?? ''),
  }));
};

const ContactForm: React.FC<Props> = ({ initial, onSubmit, onCancel, submitting }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [company, setCompany] = useState(initial?.company ?? '');
  const [role, setRole] = useState(initial?.role ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [rows, setRows] = useState<AttrRow[]>(attributesToRows(initial?.attributes));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(initial?.name ?? '');
    setCompany(initial?.company ?? '');
    setRole(initial?.role ?? '');
    setEmail(initial?.email ?? '');
    setNotes(initial?.notes ?? '');
    setRows(attributesToRows(initial?.attributes));
  }, [initial?._id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    const attributes: Record<string, string> = {};
    for (const r of rows) {
      const k = r.key.trim();
      if (!k) continue;
      attributes[k] = r.value;
    }
    try {
      await onSubmit({ name: name.trim(), company, role, email, notes, attributes });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    }
  };

  const inputCls = useMemo(
    () =>
      'w-full rounded-md border border-border-light bg-surface-primary px-3 py-2 text-sm text-text-primary outline-none focus:border-border-heavy',
    [],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Name *</label>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Company</label>
          <input className={inputCls} value={company} onChange={(e) => setCompany(e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">Role</label>
          <input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs font-medium text-text-secondary">Email</label>
          <input
            type="email"
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs font-medium text-text-secondary">Notes</label>
        <textarea
          className={`${inputCls} min-h-[80px]`}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>
      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-xs font-medium text-text-secondary">Custom attributes</label>
          <button
            type="button"
            className="text-xs text-text-secondary underline hover:text-text-primary"
            onClick={() => setRows((prev) => [...prev, newRow()])}
          >
            + Add attribute
          </button>
        </div>
        {rows.length === 0 && (
          <div className="text-xs text-text-secondary">
            Add Industry, Location, Tags, or any other key-value pair.
          </div>
        )}
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={row.id} className="flex gap-2">
              <input
                placeholder="Key"
                className={`${inputCls} max-w-[180px]`}
                value={row.key}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, key: e.target.value } : r)))
                }
              />
              <input
                placeholder="Value"
                className={inputCls}
                value={row.value}
                onChange={(e) =>
                  setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, value: e.target.value } : r)))
                }
              />
              <button
                type="button"
                aria-label="Remove attribute"
                className="rounded-md border border-border-light px-2 text-xs text-text-secondary hover:bg-surface-hover"
                onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </div>
      {error && <div className="text-sm text-red-500">{error}</div>}
      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          className="rounded-md border border-border-light px-4 py-2 text-sm text-text-primary hover:bg-surface-hover"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="rounded-md bg-text-primary px-4 py-2 text-sm text-surface-primary hover:opacity-90 disabled:opacity-50"
          disabled={submitting}
        >
          {submitting ? 'Saving…' : initial ? 'Save changes' : 'Create contact'}
        </button>
      </div>
    </form>
  );
};

export default ContactForm;
