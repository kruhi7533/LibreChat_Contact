import axios from 'axios';
import type {
  Contact,
  ContactInput,
  ImportSummary,
  ContactsListResponse,
} from './types';

const BASE = '/api/contacts';

const extractMessage = (err: unknown, fallback: string): string => {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { error?: { message?: string }; message?: string } | undefined;
    const msg = data?.error?.message || data?.message;
    if (msg) return msg;
    if (status) return `Request failed (${status})`;
  }
  return fallback;
};

export const fetchContacts = async (params: {
  page?: number;
  limit?: number;
  q?: string;
}): Promise<ContactsListResponse> => {
  try {
    const { data } = await axios.get<ContactsListResponse>(BASE, { params });
    return data;
  } catch (err) {
    throw new Error(extractMessage(err, 'Failed to load contacts'));
  }
};

export const fetchContact = async (id: string): Promise<Contact> => {
  try {
    const { data } = await axios.get<Contact>(`${BASE}/${encodeURIComponent(id)}`);
    return data;
  } catch (err) {
    throw new Error(extractMessage(err, 'Failed to load contact'));
  }
};

export const createContact = async (input: ContactInput): Promise<Contact> => {
  try {
    const { data } = await axios.post<Contact>(BASE, input);
    return data;
  } catch (err) {
    throw new Error(extractMessage(err, 'Failed to create contact'));
  }
};

export const updateContact = async (id: string, input: ContactInput): Promise<Contact> => {
  try {
    const { data } = await axios.patch<Contact>(`${BASE}/${encodeURIComponent(id)}`, input);
    return data;
  } catch (err) {
    throw new Error(extractMessage(err, 'Failed to update contact'));
  }
};

export const deleteContact = async (id: string): Promise<void> => {
  try {
    await axios.delete(`${BASE}/${encodeURIComponent(id)}`);
  } catch (err) {
    throw new Error(extractMessage(err, 'Failed to delete contact'));
  }
};

export const importContacts = async (file: File): Promise<ImportSummary> => {
  const form = new FormData();
  form.append('file', file);
  try {
    const { data } = await axios.post<ImportSummary>(`${BASE}/import`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  } catch (err) {
    throw new Error(extractMessage(err, 'Failed to import contacts'));
  }
};
