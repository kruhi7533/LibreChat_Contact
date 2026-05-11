import React from 'react';
import type { Contact } from './types';

interface Props {
  contacts: Contact[];
  total: number;
  page: number;
  limit: number;
  loading?: boolean;
  selectedId?: string | null;
  onSelect: (contact: Contact) => void;
  onPageChange: (page: number) => void;
}

const ContactsList: React.FC<Props> = ({
  contacts,
  total,
  page,
  limit,
  loading,
  selectedId,
  onSelect,
  onPageChange,
}) => {
  const lastPage = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto">
        <table className="min-w-full divide-y divide-border-light text-sm">
          <thead className="sticky top-0 bg-surface-primary">
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Role</Th>
              <Th>Email</Th>
              <Th>Created</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-light">
            {loading && contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-text-secondary">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && contacts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-text-secondary">
                  No contacts yet. Use “New contact” or “Import CSV” to add some.
                </td>
              </tr>
            )}
            {contacts.map((c) => {
              const selected = selectedId === c._id;
              return (
                <tr
                  key={c._id}
                  className={`cursor-pointer hover:bg-surface-hover ${selected ? 'bg-surface-active' : ''}`}
                  onClick={() => onSelect(c)}
                >
                  <Td>{c.name}</Td>
                  <Td>{c.company || '—'}</Td>
                  <Td>{c.role || '—'}</Td>
                  <Td>{c.email || '—'}</Td>
                  <Td>{c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}</Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-border-light px-3 py-2 text-xs text-text-secondary">
        <div>
          {total} contact{total === 1 ? '' : 's'} • page {page} of {lastPage}
        </div>
        <div className="flex gap-2">
          <button
            className="rounded-md border border-border-light px-2 py-1 disabled:opacity-50"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </button>
          <button
            className="rounded-md border border-border-light px-2 py-1 disabled:opacity-50"
            disabled={page >= lastPage}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
};

const Th: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <th className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide text-text-secondary">
    {children}
  </th>
);
const Td: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <td className="truncate px-3 py-2 text-text-primary">{children}</td>
);

export default ContactsList;
