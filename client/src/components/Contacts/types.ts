export interface Contact {
  _id: string;
  user?: string;
  name: string;
  company?: string;
  role?: string;
  email?: string;
  notes?: string;
  attributes?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ContactsListResponse {
  items: Contact[];
  total: number;
  page: number;
  limit: number;
}

export interface ImportSummary {
  imported: number;
  failed: number;
  durationMs: number;
  errors?: string[];
}

export interface ContactInput {
  name: string;
  company?: string;
  role?: string;
  email?: string;
  notes?: string;
  attributes?: Record<string, unknown>;
}
