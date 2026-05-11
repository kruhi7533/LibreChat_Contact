import React, { useState } from 'react';
import type { Contact, ContactInput } from './types';
import ContactForm from './ContactForm';
import { useDeleteContactMutation, useUpdateContactMutation } from './queries';

interface Props {
  contact: Contact;
  onClose: () => void;
}

const ContactDetail: React.FC<Props> = ({ contact, onClose }) => {
  const [editing, setEditing] = useState(false);
  const updateMutation = useUpdateContactMutation();
  const deleteMutation = useDeleteContactMutation();

  const attributes = contact.attributes || {};
  const attrEntries = Object.entries(attributes);

  const handleUpdate = async (input: ContactInput) => {
    await updateMutation.mutateAsync({ id: contact._id, input });
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete ${contact.name}?`)) return;
    await deleteMutation.mutateAsync(contact._id);
    onClose();
  };

  if (editing) {
    return (
      <ContactForm
        initial={contact}
        submitting={updateMutation.isLoading}
        onSubmit={handleUpdate}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs uppercase tracking-wide text-text-secondary">Name</div>
        <div className="text-base font-medium text-text-primary">{contact.name}</div>
      </div>
      {contact.company && (
        <div>
          <div className="text-xs uppercase tracking-wide text-text-secondary">Company</div>
          <div className="text-sm text-text-primary">{contact.company}</div>
        </div>
      )}
      {contact.role && (
        <div>
          <div className="text-xs uppercase tracking-wide text-text-secondary">Role</div>
          <div className="text-sm text-text-primary">{contact.role}</div>
        </div>
      )}
      {contact.email && (
        <div>
          <div className="text-xs uppercase tracking-wide text-text-secondary">Email</div>
          <a className="text-sm text-blue-500 hover:underline" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        </div>
      )}
      {contact.notes && (
        <div>
          <div className="text-xs uppercase tracking-wide text-text-secondary">Notes</div>
          <div className="whitespace-pre-wrap text-sm text-text-primary">{contact.notes}</div>
        </div>
      )}
      {attrEntries.length > 0 && (
        <div>
          <div className="mb-1 text-xs uppercase tracking-wide text-text-secondary">
            Custom attributes
          </div>
          <ul className="divide-y divide-border-light rounded-md border border-border-light">
            {attrEntries.map(([k, v]) => (
              <li key={k} className="flex justify-between gap-3 px-3 py-2 text-sm">
                <span className="font-medium text-text-secondary">{k}</span>
                <span className="text-right text-text-primary">
                  {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {contact.createdAt && (
        <div className="text-xs text-text-secondary">
          Created {new Date(contact.createdAt).toLocaleString()}
        </div>
      )}
      <div className="flex justify-end gap-2 pt-2">
        <button
          className="rounded-md border border-red-500 px-3 py-1.5 text-sm text-red-500 hover:bg-red-500/10"
          onClick={handleDelete}
          disabled={deleteMutation.isLoading}
        >
          Delete
        </button>
        <button
          className="rounded-md border border-border-light px-3 py-1.5 text-sm text-text-primary hover:bg-surface-hover"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>
    </div>
  );
};

export default ContactDetail;
