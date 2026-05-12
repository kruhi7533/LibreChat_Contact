const Contact = require('~/models/Contact');

const STANDARD_FIELDS = new Set(['name', 'company', 'role', 'email', 'notes']);
const NOTES_TRUNCATE = 2000;

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Convert a flat input object into the standard fields + an `attributes` map.
 * Any key not in STANDARD_FIELDS (and not `attributes` itself) is treated as
 * an arbitrary attribute. This keeps the API stable even when callers post
 * unknown fields.
 */
const partitionFields = (input = {}) => {
  const standard = {};
  const attributes =
    input.attributes && typeof input.attributes === 'object' ? { ...input.attributes } : {};
  for (const [key, value] of Object.entries(input)) {
    if (key === 'attributes') continue;
    if (STANDARD_FIELDS.has(key)) {
      standard[key] = value;
    } else if (value != null && value !== '') {
      attributes[key] = value;
    }
  }
  return { standard, attributes };
};

const toPlain = (doc) => {
  if (!doc) return doc;
  const obj = doc.toObject ? doc.toObject() : doc;
  if (obj.attributes instanceof Map) {
    obj.attributes = Object.fromEntries(obj.attributes);
  }
  delete obj.searchText;
  delete obj.__v;
  return obj;
};

/**
 * Attribute keys that are usually worth keeping even when the user's query
 * didn't explicitly target them — they're useful identifying/location context.
 */
const DEFAULT_RELEVANT_ATTRS = new Set([
  'city',
  'state',
  'country',
  'region',
  'location',
  'address',
  'tags',
  'Tags',
  'industry',
  'Industry',
]);

const toCompact = (doc, relevantAttrs = null) => {
  const obj = doc.toObject ? doc.toObject() : doc;
  const rawAttrs =
    obj.attributes instanceof Map ? Object.fromEntries(obj.attributes) : obj.attributes || {};

  let attributes = rawAttrs;
  if (relevantAttrs instanceof Set) {
    attributes = {};
    for (const [k, v] of Object.entries(rawAttrs)) {
      if (relevantAttrs.has(k) || relevantAttrs.has(k.toLowerCase())) {
        attributes[k] = v;
      }
    }
  }

  let notes = obj.notes || '';
  if (notes.length > NOTES_TRUNCATE) {
    notes = `${notes.slice(0, NOTES_TRUNCATE)}…`;
  }
  return {
    id: String(obj._id),
    name: obj.name,
    company: obj.company || null,
    role: obj.role || null,
    email: obj.email || null,
    notes: notes || null,
    attributes: Object.keys(attributes).length ? attributes : null,
  };
};

/**
 * Decide which attribute keys are relevant to the tool call. If the user gave
 * a free-text `query` but no structured filters, return null → keep all
 * attributes (verbose "tell me everything" mode). Otherwise, return a Set
 * containing the targeted `attribute_key` plus a small default set of
 * location/tag keys for context.
 */
const computeRelevantAttrs = ({ query, company, role, attribute_key } = {}) => {
  const hasStructured = Boolean(company || role || attribute_key);
  if (!hasStructured) {
    return null;
  }
  const relevant = new Set(DEFAULT_RELEVANT_ATTRS);
  if (attribute_key) {
    relevant.add(attribute_key);
    relevant.add(attribute_key.toLowerCase());
  }
  if (query && typeof query === 'string' && query.trim()) {
    return null;
  }
  return relevant;
};

const createContact = async (userId, payload) => {
  const { standard, attributes } = partitionFields(payload);
  if (!standard.name || !standard.name.trim()) {
    const err = new Error('Contact name is required');
    err.code = 'CONTACT_NAME_REQUIRED';
    throw err;
  }
  const doc = await Contact.create({
    user: userId,
    ...standard,
    attributes,
  });
  return toPlain(doc);
};

const updateContact = async (userId, contactId, payload) => {
  const { standard, attributes } = partitionFields(payload);
  const update = { ...standard };
  if (Object.keys(attributes).length) {
    update.attributes = attributes;
  }
  const doc = await Contact.findOneAndUpdate({ _id: contactId, user: userId }, update, {
    new: true,
    runValidators: true,
  });
  return doc ? toPlain(doc) : null;
};

const deleteContact = async (userId, contactId) => {
  const result = await Contact.findOneAndDelete({ _id: contactId, user: userId });
  return !!result;
};

const getContact = async (userId, contactId) => {
  const doc = await Contact.findOne({ _id: contactId, user: userId });
  return doc ? toPlain(doc) : null;
};

/**
 * Paginated list with optional free-text query.
 * - `q` uses the text index when present; falls back to a regex prefix match
 *   when the text query returns nothing (covers partial-token typing in the
 *   UI search bar).
 */
const listContacts = async (userId, { page = 1, limit = 50, q } = {}) => {
  const skip = (Math.max(1, page) - 1) * limit;
  const baseFilter = { user: userId };
  let filter = baseFilter;
  let useTextScore = false;

  if (q && q.trim()) {
    const trimmed = q.trim();
    const textFilter = { ...baseFilter, $text: { $search: trimmed } };
    const textCount = await Contact.countDocuments(textFilter);
    if (textCount > 0) {
      filter = textFilter;
      useTextScore = true;
    } else {
      const safe = escapeRegex(trimmed);
      const regex = new RegExp(safe, 'i');
      filter = {
        ...baseFilter,
        $or: [{ name: regex }, { company: regex }, { email: regex }, { role: regex }],
      };
    }
  }

  const query = Contact.find(filter);
  if (useTextScore) {
    query.select({ score: { $meta: 'textScore' } }).sort({ score: { $meta: 'textScore' } });
  } else {
    query.sort({ createdAt: -1 });
  }
  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit).lean(),
    Contact.countDocuments(filter),
  ]);
  return {
    items: items.map((doc) => {
      doc.attributes = doc.attributes || {};
      delete doc.searchText;
      delete doc.__v;
      return doc;
    }),
    total,
    page,
    limit,
  };
};

/**
 * Tool-facing search. Returns up to `limit` compact records relevant to the
 * structured filters and/or free-text query. Always tenant-scoped on userId.
 *
 * Strategy:
 *  1. Apply structured filters (company / role / email / attribute_*).
 *  2. If a free-text query is given, layer it on as a `$text` search.
 *  3. If the combined filter returns zero hits AND we have a query, fall back
 *     to a case-insensitive regex on name/company so e.g. "Acme" still finds
 *     "Acme Corp".
 */
const searchForTool = async (
  userId,
  { query, company, role, email, attribute_key, attribute_value, limit = 20 } = {},
) => {
  const cap = Math.min(Math.max(1, Number(limit) || 20), 50);
  const filter = { user: userId };

  if (company) {
    filter.company = new RegExp(`^${escapeRegex(company)}$`, 'i');
  }
  if (role) {
    filter.role = new RegExp(`^${escapeRegex(role)}$`, 'i');
  }
  if (email) {
    filter.email = email.toLowerCase();
  }
  if (attribute_key && attribute_value != null) {
    filter[`attributes.${attribute_key}`] = new RegExp(escapeRegex(String(attribute_value)), 'i');
  }

  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  let cursor;
  if (trimmedQuery) {
    cursor = Contact.find({ ...filter, $text: { $search: trimmedQuery } })
      .select({ score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' } })
      .limit(cap);
  } else {
    cursor = Contact.find(filter).sort({ createdAt: -1 }).limit(cap);
  }

  let docs = await cursor.lean();

  if (!docs.length && (company || role)) {
    const fuzzy = { user: userId };
    if (company) fuzzy.company = new RegExp(escapeRegex(company), 'i');
    if (role) fuzzy.role = new RegExp(escapeRegex(role), 'i');
    if (email) fuzzy.email = email.toLowerCase();
    if (attribute_key && attribute_value != null) {
      fuzzy[`attributes.${attribute_key}`] = new RegExp(escapeRegex(String(attribute_value)), 'i');
    }
    docs = await Contact.find(fuzzy).limit(cap).lean();
  }

  if (!docs.length && trimmedQuery) {
    const safe = escapeRegex(trimmedQuery);
    const regex = new RegExp(safe, 'i');
    docs = await Contact.find({
      ...filter,
      $or: [{ name: regex }, { company: regex }, { email: regex }, { role: regex }],
    })
      .limit(cap)
      .lean();
  }

  const relevantAttrs = computeRelevantAttrs({ query, company, role, attribute_key });
  return docs.map((doc) => toCompact(doc, relevantAttrs));
};

/**
 * Returns up to `limit` distinct company names from the user's contacts that
 * share at least one alphabetic token with `term`. Used to surface "did you
 * mean…" suggestions when an exact company lookup returns nothing.
 */
const getCompanySuggestions = async (userId, term, limit = 5) => {
  if (!term || typeof term !== 'string') return [];
  const tokens = term
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (!tokens.length) return [];
  const orClauses = tokens.map((t) => ({ company: new RegExp(escapeRegex(t), 'i') }));
  const matches = await Contact.distinct('company', {
    user: userId,
    company: { $nin: [null, ''] },
    $or: orClauses,
  });
  return matches.slice(0, limit);
};

module.exports = {
  createContact,
  updateContact,
  deleteContact,
  getContact,
  listContacts,
  searchForTool,
  getCompanySuggestions,
  partitionFields,
  toPlain,
  toCompact,
  computeRelevantAttrs,
  STANDARD_FIELDS,
};
