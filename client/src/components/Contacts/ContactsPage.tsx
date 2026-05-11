import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import ContactsList from './ContactsList';
import ContactDetail from './ContactDetail';
import ContactForm from './ContactForm';
import ImportModal from './ImportModal';
import {
  useContactsQuery,
  useCreateContactMutation,
  useContactQuery,
} from './queries';
import type { Contact, ContactInput } from './types';

const PAGE_SIZE = 20;
const DRAWER_DEFAULT = 400;
const DRAWER_MIN = 0;
const DRAWER_MAX = 700;
const DRAWER_STORAGE_KEY = 'contacts:drawerWidth';

const getInitialDrawerWidth = (): number => {
  if (typeof window === 'undefined') return DRAWER_DEFAULT;
  const saved = window.localStorage.getItem(DRAWER_STORAGE_KEY);
  if (saved == null) return DRAWER_DEFAULT;
  const parsed = Number(saved);
  if (!Number.isFinite(parsed)) return DRAWER_DEFAULT;
  return Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, parsed));
};

const useDebounced = <T,>(value: T, delay = 300): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

const ContactsPage: React.FC = () => {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const debouncedQ = useDebounced(searchInput, 300);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const isLargeScreen = useMediaQuery('(min-width: 1024px)');
  const [drawerWidth, setDrawerWidth] = useState<number>(getInitialDrawerWidth);
  const [isResizing, setIsResizing] = useState(false);
  const resizeCleanup = useRef<(() => void) | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedQ]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = drawerWidth;
      let rafId: number | null = null;
      let latestWidth = drawerWidth;

      const onMove = (ev: MouseEvent) => {
        if (rafId != null) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          const delta = startX - ev.clientX;
          const next = Math.max(DRAWER_MIN, Math.min(DRAWER_MAX, startWidth + delta));
          latestWidth = next;
          setDrawerWidth(next);
        });
      };
      const onUp = () => {
        if (rafId != null) cancelAnimationFrame(rafId);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        setIsResizing(false);
        resizeCleanup.current = null;
        window.localStorage.setItem(DRAWER_STORAGE_KEY, String(Math.round(latestWidth)));
      };

      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'col-resize';
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      setIsResizing(true);
      resizeCleanup.current = onUp;
    },
    [drawerWidth],
  );

  useEffect(() => {
    return () => {
      if (resizeCleanup.current) resizeCleanup.current();
    };
  }, []);

  const listQuery = useContactsQuery({ page, limit: PAGE_SIZE, q: debouncedQ || undefined });
  const detailQuery = useContactQuery(selectedId || undefined);
  const createMutation = useCreateContactMutation();

  const items = listQuery.data?.items ?? [];
  const total = listQuery.data?.total ?? 0;

  const drawerContent = useMemo(() => {
    if (creating) {
      return (
        <ContactForm
          submitting={createMutation.isLoading}
          onCancel={() => setCreating(false)}
          onSubmit={async (input: ContactInput) => {
            const created = await createMutation.mutateAsync(input);
            setCreating(false);
            setSelectedId(created._id);
          }}
        />
      );
    }
    if (detailQuery.data) {
      return (
        <ContactDetail
          contact={detailQuery.data}
          onClose={() => setSelectedId(null)}
        />
      );
    }
    if (selectedId && detailQuery.isLoading) {
      return <div className="text-sm text-text-secondary">Loading…</div>;
    }
    return (
      <div className="flex h-full items-center justify-center text-sm text-text-secondary">
        Select a contact to see details, or create a new one.
      </div>
    );
  }, [creating, detailQuery.data, detailQuery.isLoading, selectedId, createMutation.isLoading]);

  return (
    <div className="flex h-full w-full flex-col bg-surface-primary text-text-primary">
      <header className="flex items-center justify-between gap-3 border-b border-border-light px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            to="/c/new"
            className="rounded-md border border-border-light px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
          >
            ← Back to chat
          </Link>
          <h1 className="text-lg font-semibold">Contacts</h1>
          <span className="text-xs text-text-secondary">
            Personal workspace · the assistant can search this from chat
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, company, role, attribute…"
            className="w-64 rounded-md border border-border-light bg-surface-primary px-3 py-1.5 text-sm outline-none focus:border-border-heavy"
          />
          <button
            onClick={() => setImporting(true)}
            className="rounded-md border border-border-light px-3 py-1.5 text-sm hover:bg-surface-hover"
          >
            Import CSV
          </button>
          <button
            onClick={() => {
              setSelectedId(null);
              setCreating(true);
            }}
            className="rounded-md bg-text-primary px-3 py-1.5 text-sm text-surface-primary hover:opacity-90"
          >
            + New contact
          </button>
        </div>
      </header>
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <ContactsList
            contacts={items}
            total={total}
            page={page}
            limit={PAGE_SIZE}
            loading={listQuery.isLoading}
            selectedId={selectedId}
            onSelect={(c: Contact) => {
              setCreating(false);
              setSelectedId(c._id);
            }}
            onPageChange={setPage}
          />
        </div>
        {isLargeScreen && drawerWidth > 0 && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize details panel"
            tabIndex={0}
            onMouseDown={handleResizeStart}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                setDrawerWidth((w) => {
                  const next = Math.min(DRAWER_MAX, w + 20);
                  window.localStorage.setItem(DRAWER_STORAGE_KEY, String(next));
                  return next;
                });
              } else if (e.key === 'ArrowRight') {
                setDrawerWidth((w) => {
                  const next = Math.max(DRAWER_MIN, w - 20);
                  window.localStorage.setItem(DRAWER_STORAGE_KEY, String(next));
                  return next;
                });
              }
            }}
            className={`group relative w-1 flex-shrink-0 cursor-col-resize bg-border-light hover:bg-blue-500/40 focus:bg-blue-500/60 focus:outline-none ${
              isResizing ? 'bg-blue-500/60' : ''
            }`}
            style={{ transition: isResizing ? 'none' : 'background-color 120ms ease' }}
          >
            <span className="pointer-events-none absolute inset-y-0 -left-1 -right-1" />
          </div>
        )}
        <aside
          className="overflow-auto border-t border-border-light lg:border-t-0 lg:border-l"
          style={
            isLargeScreen
              ? { width: drawerWidth, padding: drawerWidth > 0 ? '1rem' : 0 }
              : { padding: '1rem' }
          }
        >
          {(!isLargeScreen || drawerWidth > 0) && drawerContent}
        </aside>
        {isLargeScreen && drawerWidth === 0 && (
          <button
            type="button"
            onClick={() => {
              setDrawerWidth(DRAWER_DEFAULT);
              window.localStorage.setItem(DRAWER_STORAGE_KEY, String(DRAWER_DEFAULT));
            }}
            className="absolute right-2 top-16 rounded-md border border-border-light bg-surface-primary px-2 py-1 text-xs text-text-secondary hover:bg-surface-hover"
            aria-label="Show details panel"
          >
            Show details
          </button>
        )}
      </div>
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </div>
  );
};

export default ContactsPage;
