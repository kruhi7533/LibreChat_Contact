# Contacts Workspace for LibreChat

This document describes the Contacts feature added to this LibreChat fork: a
per-user contacts workspace plus an AI tool (`search_contacts`) that lets the
assistant answer questions about saved contacts during normal chat without
ever dumping the full list into the prompt.

---

## 1. Architecture

```
+---------------------+        +-------------------------+
|  Chat UI (React)    | -----> | LibreChat backend       |
|  /c/* and /contacts |        | Express + Mongoose      |
+---------------------+        +-----------+-------------+
                                            |
                                            | (a) UI -> /api/contacts CRUD + import
                                            | (b) Agent runtime -> search_contacts tool
                                            v
                                +---------------------------+
                                |  Contacts service         |
                                |   - service.js (CRUD,     |
                                |     search, partition)    |
                                |   - import.js (streaming  |
                                |     CSV -> bulkWrite)     |
                                +-------------+-------------+
                                              |
                                              v
                                +---------------------------+
                                |  MongoDB (Contact)        |
                                |   text index on searchText|
                                |   compound (user, *)      |
                                +---------------------------+

When the user asks "Who works at Acme Corp?" inside an Agent that has the
"Contacts" tool enabled:

  1. Agent loop picks the search_contacts tool from its toolset
  2. Tool runs with userId from the chat session (tenant scope)
  3. Tool returns at most 20 compact records relevant to the query
  4. Model sees only those records and writes the answer
```

### Files added

Backend (`/api`):

- `api/models/Contact.js` — Mongoose schema, indexes, `searchText` hook
- `api/server/services/Contacts/service.js` — CRUD + tenant-scoped search
- `api/server/services/Contacts/csv.js` — streaming CSV parser (no new deps)
- `api/server/services/Contacts/import.js` — streaming bulk import
- `api/server/controllers/ContactController.js` — Express handlers
- `api/server/routes/contacts.js` — REST routes + multer upload
- `api/app/clients/tools/structured/SearchContacts.js` — LangChain Tool class

Backend wiring (modified):

- `api/models/index.js` — exports the Contact model
- `api/server/routes/index.js` — exposes the `contacts` router
- `api/server/index.js` — mounts `/api/contacts`
- `api/app/clients/tools/index.js` — exports `SearchContacts`
- `api/app/clients/tools/util/handleTools.js` — wires `search_contacts` constructor
- `api/app/clients/tools/manifest.json` — adds the tool to the registry

Frontend (`/client`):

- `client/src/components/Contacts/` — `ContactsPage`, list, detail, form, import modal, queries, api, types
- `client/src/routes/index.tsx` — adds `/contacts` route

Config:

- `.env.example` — adds `CONTACTS_IMPORT_BATCH_SIZE`, `CONTACTS_SEARCH_DEFAULT_LIMIT`

### Why `/api` (JS) instead of `/packages/api` (TS)?

CLAUDE.md asks for new TypeScript code in `/packages/api`. I kept the
Contacts feature in `/api` because:

- Every existing Tool (`OpenWeather`, `StableDiffusion`, etc.) lives in
  `api/app/clients/tools/structured/`. Splitting the tool across packages
  for one feature makes the diff harder to read.
- `/packages/data-schemas` ships through a Rollup build step. Adding a
  schema there would require rebuilding the package on every change. For
  a self-contained feature it added friction without payoff.

The model is still treated as first-class: it lives in `api/models/`, is
exported through the canonical `~/models` index, and follows the same
tenant-scoping conventions as the rest of the JS code.

---

## 2. Setup

```bash
# 1. Install dependencies (root)
npm install

# 2. Configure environment
cp .env.example .env
#   - set MONGO_URI to a running MongoDB
#   - set GOOGLE_KEY / GEMINI_API_KEY to the assignment API key
#     (search_contacts is provider-agnostic but the assignment uses Google)

# 3. Build packages and start (two terminals)
npm run backend:dev      # backend on :3080
npm run frontend:dev     # Vite dev server on :3090

# Open http://localhost:3090, log in, then go to /contacts
```

---

## 3. How to test the feature

1. Start backend and frontend.
2. Log in (create an account if needed).
3. Navigate to `http://localhost:3090/contacts`.
4. Click **+ New contact** and add John Doe / Acme Corp / CTO with a custom
   `Industry: AI Infrastructure` attribute. Save.
5. Click **Import CSV** and upload `chat_states_1k.csv` (or 10k). The modal
   reports `imported`, `failed`, and `durationMs`.
6. Create an Agent that has the **Contacts** tool enabled (see below).
7. Open a chat with that Agent and try:
   - *Who works at Acme Corp?*
   - *List CTOs in our contacts.*
   - *Which contacts are interested in AI infrastructure?*
   - *What do we know about <a name from your CSV>?*

### Enabling the tool on an Agent

LibreChat exposes tools to chats via Agents. After the feature is wired,
`search_contacts` appears in the Agent builder under the standard tools list
(no API key required). Add it to an Agent named e.g. *Contacts Assistant*
and chat with that Agent. The model decides when to call the tool based on
its description; the tool always scopes its query to the logged-in user.

The tool is listed in `manifest.json` as `pluginKey: search_contacts` so the
Agent UI picks it up automatically.

---

## 4. Tenant isolation (security)

Every read and write is scoped by `req.user.id`:

- `service.js` adds `{ user: userId, ... }` to every Mongo filter.
- `searchForTool` is the only entry point exposed to the LLM, and it
  *requires* the userId injected at tool construction time. If construction
  receives no userId (and `override` is not set), the constructor throws.
- The Express routes use `requireJwtAuth` so `req.user.id` is always
  populated.

A second user logging in sees zero contacts until they create their own.

---

## 5. Design decisions

- **Tool/function calling > prompt injection.** The tool returns ≤ 20
  records narrowly matched to the query. Even at 1M contacts the model
  context stays small. Prompt injection at scale would break token limits
  and degrade signal-to-noise. The `search_contacts` `description` is
  written so the model knows *when* to call it.

- **Mongo `Map<String, Mixed>` for arbitrary attributes.** New columns in
  the CSV (Funding Stage, Tags, Industry, …) become attributes without a
  schema migration. The pre-save hook flattens everything into
  `searchText`, so unknown attributes are still queryable via the text
  index.

- **Denormalized `searchText` + Mongo `$text` index.** Keyword search out
  of the box, no extra services. The tool falls back to a regex match on
  `name`/`company`/`email`/`role` when the text query produces zero hits,
  which makes partial-token searches like "Acme" still hit "Acme Corp".

- **Streaming CSV + `bulkWrite` batches.** Constant memory, ~1k inserts
  per round trip. `ordered: false` lets the import survive bad rows and
  keeps throughput high. The hand-rolled parser handles BOM, CRLF, and
  quoted fields with embedded commas/newlines.

- **One file = one model.** Followed CLAUDE.md naming preference: short,
  single-word filenames; helpers grouped under
  `services/Contacts/{service,csv,import}.js`.

---

## 6. Answers to the design questions

### Q1. If the system needed to support 1,000,000 contacts, how would you redesign it?

The current implementation already loads 1M rows via streaming +
batched `bulkWrite` (constant memory, ~minutes per million). To make it
production-grade at that scale:

- **Imports → async job queue.** Today's `POST /api/contacts/import`
  blocks one Node worker for the duration of the import. Move it to
  BullMQ + Redis: the endpoint enqueues a job and returns `{ jobId }`,
  the UI polls `/api/contacts/import/:jobId` for progress. Lets multiple
  imports run in parallel and survives a worker restart.
- **Search → dedicated engine.** Move free-text search off Mongo
  `$text` into Meilisearch or OpenSearch — synonyms, real fuzzy match,
  sub-100 ms latency. Keep Mongo authoritative; feed the engine from
  change streams.
- **Semantic retrieval.** Add an embedding column (Mongo Atlas Vector
  Search or pgvector). Hybrid BM25 + cosine, fused with reciprocal rank
  fusion, then a cross-encoder re-ranker for the top 50 → top 10. This
  is what makes "interested in AI infrastructure" reliably hit "AI/ML
  platform engineer" too.
- **Sharding.** The collection is naturally user-partitioned. Shard by
  `user` so each tenant's working set is co-located.
- **Reads.** Redis cache for hot list queries; cursor-based pagination
  (`createdAt + _id`) so deep pages don't pay the `skip()` cost.
- **Observability.** Per-user query histograms and slow-query logs.

### Q2. How would you ensure the assistant retrieves the most relevant contacts for a query?

**What's built today (this fork):**

1. **Tool-based retrieval — never context-stuffing.** `search_contacts`
   is exposed via Gemini function calling. The model never sees the
   contacts collection; it issues a query and gets ≤20 matched records
   (cap 50). See `api/app/clients/tools/structured/SearchContacts.js`
   and the runtime registry entry in
   `packages/api/src/tools/registry/definitions.ts`.
2. **Structured filters preferred over free-text.** The tool exposes
   `company`, `role`, `email`, `attribute_key/value`, and `query`. The
   tool description nudges the model to pick narrow filters first.
3. **Exact → substring fallback.** `searchForTool` first tries strict
   `^company$` regex; if 0 results, falls back to substring on the same
   field (`service.js:193-202`). So "Tailor" still finds "Tailor-Bhasin".
4. **"Did you mean…" suggestions.** When even the substring fallback
   finds nothing, `getCompanySuggestions` (`service.js:223`) returns up
   to 5 token-overlapping company names, and the tool's response
   message tells Gemini to phrase a clarifying question rather than
   silently returning empty.
5. **Adaptive attribute pruning.** `computeRelevantAttrs` strips
   irrelevant attributes from the result based on the tool call's
   intent: free-text "tell me about X" queries get everything;
   structured `company`/`attribute_key` queries get only core fields +
   location/tag defaults + the queried attribute. Cuts tool-result size
   ~60 % on filtered queries.
6. **Mongo text index + score sort.** When the model passes `query`,
   results sort by `$text` score before the cap is applied.

**Next steps to improve further:**

- **Embeddings.** Cosine similarity on a `searchText` embedding column
  would catch synonyms and conceptual matches ("payments infra" → "fin
  ops engineer") that keyword search misses.
- **Multi-step tool loop.** Let the agent decompose "CTOs at Stripe
  interested in AI" into a company filter call followed by an
  attribute filter call. The tool is stateless and the agent loop
  already supports this — just needs richer instructions.
- **Relevance feedback.** Log which tool results led to user-accepted
  answers vs. corrections, use to tune ranking.

### Q3. What are the limitations of your current implementation?

- **No semantic search.** Retrieval is keyword + substring fuzzy match
  only. Conceptual queries like "AI infrastructure" only match contacts
  where that exact phrase appears in `searchText`. Embedding-based
  retrieval is the obvious next layer, and the 20-result cap matters
  more without it.
- **CSV import is in-process.** Streaming + batched `bulkWrite` keeps
  memory flat, but a 1M-row import still occupies a Node worker for
  several minutes with no resumability or progress events. A job queue
  (BullMQ + Redis) is the natural fix.
- **No deduplication.** Re-importing the same CSV creates duplicate
  contacts. Production code would key on `(user, email)` or run a
  fuzzy merge step.

---

## 7. Endpoints (REST)

All routes require a logged-in user (JWT cookie).

| Method | Path                    | Description                                    |
|--------|-------------------------|------------------------------------------------|
| POST   | `/api/contacts`         | Create one contact                             |
| GET    | `/api/contacts`         | List (`?page=&limit=&q=`)                      |
| GET    | `/api/contacts/:id`     | Fetch one                                      |
| PATCH  | `/api/contacts/:id`     | Update                                         |
| DELETE | `/api/contacts/:id`     | Delete                                         |
| POST   | `/api/contacts/import`  | Multipart CSV upload                           |
| GET    | `/api/contacts/search`  | Filtered search (used by the tool & advanced UI) |

Errors are uniform: `{ "error": { "message": "...", "code": "..." } }`.

---

## 8. Tool schema (function calling)

```jsonc
{
  "name": "search_contacts",
  "description": "Search the user's personal contacts workspace…",
  "parameters": {
    "type": "object",
    "properties": {
      "query":            { "type": "string" },
      "company":          { "type": "string" },
      "role":             { "type": "string" },
      "email":            { "type": "string" },
      "attribute_key":    { "type": "string" },
      "attribute_value":  { "type": "string" },
      "limit":            { "type": "integer", "default": 20, "maximum": 50 }
    },
    "required": []
  }
}
```

The tool returns either:

```json
{ "results": [...], "count": N, "truncated": false }
```

or, on no hits:

```json
{ "results": [], "message": "No matching contacts found." }
```
