# LibreChat — Contacts Workspace Integration

> **Assignment submission.** This repository is a fork of [LibreChat](https://github.com/danny-avila/LibreChat) extended with a **Contacts** feature. Users can store contacts (with arbitrary attributes), bulk-import from CSV, and ask the AI assistant questions about them in normal chat. The assistant only sees contacts relevant to the query — never the entire list.

For the original LibreChat documentation, see the [upstream README](https://github.com/danny-avila/LibreChat/blob/main/README.md). The detailed design write-up for this feature lives in [CONTACTS_FEATURE.md](CONTACTS_FEATURE.md).

---

## What was implemented

### Core requirements

- **Contact data model** — core fields (`name`, `company`, `role`, `email`, `notes`, `createdAt`) plus an `attributes` map for arbitrary key/value metadata (Industry, Location, Funding Stage, Tags, …) without schema migrations.
- **Bulk CSV import** — streaming parser + batched `bulkWrite` to ingest the provided datasets (1k / 10k / 1M rows) with constant memory.
- **Contacts UI** — dedicated page at `/contacts` to list, view, create, and import contacts, including arbitrary attributes.
- **Chat integration** — a `search_contacts` LLM tool that the assistant calls during normal chat to fetch only the contacts relevant to the user's query.
- **Tenant isolation** — every read/write is scoped to the authenticated user; the LLM tool cannot leak data across users.

### Extra-credit / bonus

- **Relevance-based retrieval** — the model receives at most ~20 narrowly-matched records (structured filters + free-text fallback), not the whole table.
- **Contact search** via Mongo `$text` index plus regex fallback for partial tokens.
- **Tool exposed via LibreChat's Agent system** — provider-agnostic; tested with the assignment's Google/Gemini key.

### Files added

**Backend (`/api`)**

- [api/models/Contact.js](api/models/Contact.js) — Mongoose schema, indexes, `searchText` denormalization hook
- [api/server/services/Contacts/service.js](api/server/services/Contacts/service.js) — CRUD + tenant-scoped search
- [api/server/services/Contacts/csv.js](api/server/services/Contacts/csv.js) — streaming CSV parser (no new deps; handles BOM, CRLF, quoted fields)
- [api/server/services/Contacts/import.js](api/server/services/Contacts/import.js) — streaming bulk import
- [api/server/controllers/ContactController.js](api/server/controllers/ContactController.js) — Express handlers
- [api/server/routes/contacts.js](api/server/routes/contacts.js) — REST routes + multer upload
- [api/app/clients/tools/structured/SearchContacts.js](api/app/clients/tools/structured/SearchContacts.js) — LangChain Tool for chat integration

**Frontend (`/client`)**

- [client/src/components/Contacts/](client/src/components/Contacts/) — `ContactsPage`, list, detail, form, import modal, queries, api, types
- [client/src/routes/index.tsx](client/src/routes/index.tsx) — adds the `/contacts` route

**Wiring (modified)**

- [api/models/index.js](api/models/index.js), [api/server/routes/index.js](api/server/routes/index.js), [api/server/index.js](api/server/index.js) — model + route registration
- [api/app/clients/tools/index.js](api/app/clients/tools/index.js), [api/app/clients/tools/util/handleTools.js](api/app/clients/tools/util/handleTools.js), [api/app/clients/tools/manifest.json](api/app/clients/tools/manifest.json) — tool registry
- [.env.example](.env.example) — adds `CONTACTS_IMPORT_BATCH_SIZE`, `CONTACTS_SEARCH_DEFAULT_LIMIT`

---

## Quick start

### Prerequisites

- **Node.js** ≥ 20.19.0 (or ≥ 22.12.0)
- **MongoDB** running locally or reachable via `MONGO_URI`
- **Google AI API key** (provided in the assignment) for the chat assistant

### Setup

```bash
# 1. Clone and install
git clone <this-repo-url> LibreChat_Contact
cd LibreChat_Contact
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env:
#   MONGO_URI=mongodb://localhost:27017/LibreChat
#   GOOGLE_KEY=<assignment Google API key>

# 3. Build shared packages (first run only)
npm run build:data-provider
npm run build:data-schemas
npm run build:api
npm run build:client-package
```

### Run (development)

Two terminals:

```bash
# Terminal 1 — backend on http://localhost:3080
npm run backend:dev

# Terminal 2 — frontend (Vite + HMR) on http://localhost:3090
npm run frontend:dev
```

### Run with Docker

For a local containerized launch that builds the app from source and only
starts the runtime services it needs:

```bash
docker compose -f docker-compose.local.yml up -d --build
```

If you want the full upstream Docker stack instead, use the existing
`docker-compose.yml` or `deploy-compose.yml` files, but note those pull extra
images and expect more environment variables.

Open **http://localhost:3090**, register an account, then visit **http://localhost:3090/contacts**.

### Run (production build)

```bash
npm run frontend     # builds client + all packages sequentially
npm run backend      # serves both API and built client on :3080
```

---

## Using the feature

1. **Add a contact manually** — open `/contacts`, click **+ New contact**, fill core fields, add custom attributes (e.g. `Industry: AI Infrastructure`).
2. **Bulk import** — click **Import CSV**, upload one of the assignment datasets:
   - https://storage.googleapis.com/assignment-input-files-serri/chat_states_1k.csv
   - https://storage.googleapis.com/assignment-input-files-serri/chat_states_10k.csv
   - https://storage.googleapis.com/assignment-input-files-serri/chat_states_1M.csv
3. **Create an Agent** with the **Contacts** tool enabled (Agent builder → Tools → `search_contacts`).
4. **Chat with that Agent** and try queries like:
   - *Who works at Acme Corp?*
   - *List all CTOs in our contacts.*
   - *Which contacts are interested in AI infrastructure?*
   - *What do we know about Sarah Chen?*

The assistant will invoke `search_contacts` automatically and answer using only the matched records.

---

## Architecture (short version)

```
Chat UI (React)  ──►  LibreChat backend (Express + Mongoose)
   /contacts                │
   page                     ├─ (a) UI  ──► /api/contacts CRUD + import
                            └─ (b) Agent runtime ──► search_contacts tool
                                                            │
                                                            ▼
                              MongoDB Contact collection
                              (text index on searchText,
                               compound index on user)
```

- **Why function calling, not prompt injection?** Sending all contacts into the prompt breaks token limits and degrades signal. The tool returns ≤ 20 relevant records — small, fast, scales to 1M rows.
- **Arbitrary attributes** — stored as `Map<String, Mixed>` and flattened into a denormalized `searchText` field on save, so any attribute is searchable via the Mongo text index without a migration.
- **Tenant isolation** — `searchForTool` requires a `userId` injected at tool construction; every Mongo query is scoped to that user.

Full details, design tradeoffs, and answers to the design questions are in [CONTACTS_FEATURE.md](CONTACTS_FEATURE.md).

---

## Design questions (summary)

> Full answers in [CONTACTS_FEATURE.md §6](CONTACTS_FEATURE.md).

**Q1 — Scaling to 1M contacts.** Current code already streams imports and uses Mongo text indexes. For production: move free-text search to Meilisearch/OpenSearch, add embeddings for hybrid retrieval, shard by `user`, push imports to a BullMQ + Redis job queue, and switch reads to cursor pagination + Redis cache.

**Q2 — Most-relevant retrieval.** The model never sees the full collection — `search_contacts` returns at most 20 records that match its structured filters (`company`, `role`, `attribute_key/value`) or free-text `query`. Built-in: exact → substring fuzzy fallback (so "Tailor" finds "Tailor-Bhasin"), "did you mean…" suggestions when nothing matches, and adaptive attribute pruning that cuts tool-result size ~60 % on filtered queries. Next layer: embedding-based semantic retrieval (hybrid BM25 + cosine, cross-encoder re-rank).

**Q3 — Limitations.** (1) No semantic search — keyword + fuzzy substring only, so conceptual queries like "AI infrastructure" miss unless that phrase is literally indexed. (2) CSV import is in-process — constant memory thanks to streaming, but a 1M-row load occupies a Node worker for minutes with no resumability. (3) No deduplication on re-import.

---

## REST endpoints

All routes require a logged-in user (JWT cookie).

| Method | Path                    | Description                              |
|--------|-------------------------|------------------------------------------|
| POST   | `/api/contacts`         | Create one contact                       |
| GET    | `/api/contacts`         | List (`?page=&limit=&q=`)                |
| GET    | `/api/contacts/:id`     | Fetch one                                |
| PATCH  | `/api/contacts/:id`     | Update                                   |
| DELETE | `/api/contacts/:id`     | Delete                                   |
| POST   | `/api/contacts/import`  | Multipart CSV upload                     |
| GET    | `/api/contacts/search`  | Filtered search (used by the LLM tool)   |

---

## Tech stack

- **Backend** — Node.js, Express, Mongoose, Multer, LangChain Tool interface
- **Frontend** — React 18, TypeScript, React Query, Tailwind, Vite
- **Database** — MongoDB (text index + compound `(user, *)` indexes)
- **LLM** — Google Gemini via LibreChat's existing Google provider (any provider with tool-calling will work)

---

## Acknowledgements

Built on top of [LibreChat](https://github.com/danny-avila/LibreChat) by Danny Avila and contributors. The Contacts feature is the only addition in this fork; the rest of the application is upstream.
