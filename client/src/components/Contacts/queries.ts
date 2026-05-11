import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchContacts,
  fetchContact,
  createContact,
  updateContact,
  deleteContact,
  importContacts,
} from './api';
import type { Contact, ContactInput, ContactsListResponse, ImportSummary } from './types';

const KEY = 'contacts' as const;

export const useContactsQuery = (params: { page: number; limit: number; q?: string }) =>
  useQuery<ContactsListResponse>(
    [KEY, 'list', params.page, params.limit, params.q || ''],
    () => fetchContacts(params),
    { keepPreviousData: true, refetchOnWindowFocus: false },
  );

export const useContactQuery = (id?: string) =>
  useQuery<Contact>([KEY, 'detail', id], () => fetchContact(id!), {
    enabled: !!id,
    refetchOnWindowFocus: false,
  });

export const useCreateContactMutation = () => {
  const qc = useQueryClient();
  return useMutation((input: ContactInput) => createContact(input), {
    onSuccess: () => qc.invalidateQueries([KEY, 'list']),
  });
};

export const useUpdateContactMutation = () => {
  const qc = useQueryClient();
  return useMutation(
    ({ id, input }: { id: string; input: ContactInput }) => updateContact(id, input),
    {
      onSuccess: (_data, vars) => {
        qc.invalidateQueries([KEY, 'list']);
        qc.invalidateQueries([KEY, 'detail', vars.id]);
      },
    },
  );
};

export const useDeleteContactMutation = () => {
  const qc = useQueryClient();
  return useMutation((id: string) => deleteContact(id), {
    onSuccess: () => qc.invalidateQueries([KEY, 'list']),
  });
};

export const useImportContactsMutation = () => {
  const qc = useQueryClient();
  return useMutation<ImportSummary, Error, File>((file) => importContacts(file), {
    onSuccess: () => qc.invalidateQueries([KEY, 'list']),
  });
};
