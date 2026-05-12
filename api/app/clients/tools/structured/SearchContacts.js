const { z } = require('zod');
const { logger } = require('@librechat/data-schemas');
const { Tool } = require('@librechat/agents/langchain/tools');
const { searchForTool, getCompanySuggestions } = require('~/server/services/Contacts/service');

const DEFAULT_LIMIT = Number(process.env.CONTACTS_SEARCH_DEFAULT_LIMIT) || 20;

const searchContactsSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'Free-text search across name, company, role, email, notes, and arbitrary attributes (Industry, Tags, Location, city, state, application_status, etc.).',
    ),
  company: z
    .string()
    .optional()
    .describe('Exact (case-insensitive) company filter, e.g. "Acme Corp".'),
  role: z.string().optional().describe('Exact (case-insensitive) role filter, e.g. "CTO".'),
  email: z.string().optional().describe('Exact email filter (case-insensitive).'),
  attribute_key: z
    .string()
    .optional()
    .describe(
      'Filter by an arbitrary attribute key. Common keys: "city", "state", "Industry", "application_status", "Tags". Must be paired with attribute_value.',
    ),
  attribute_value: z
    .string()
    .optional()
    .describe(
      'Value to match against attribute_key (case-insensitive substring match). Required if attribute_key is set.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(50)
    .optional()
    .describe('Maximum number of contacts to return. Default 20, capped at 50.'),
});

class SearchContacts extends Tool {
  static lc_name() {
    return 'SearchContacts';
  }

  constructor(fields = {}) {
    super();
    this.name = 'search_contacts';
    this.description =
      'Search the user\'s personal contacts workspace. Use this whenever the user asks about people, companies, roles, locations, application status, or any saved contact information (e.g. "Who works at Acme?", "List CTOs", "What do we know about Sarah Chen?", "Find contacts in Mumbai"). Prefer narrow filters (company, role, attribute_key/value) over a broad query when possible. Returns at most 20 of the most relevant contacts.';
    this.schema = searchContactsSchema;
    /** @type {string} */
    this.userId = fields.userId;
    /** @type {boolean} */
    this.override = fields.override ?? false;
    if (!this.userId && !this.override) {
      throw new Error('search_contacts tool requires a userId for tenant scoping');
    }
  }

  async _call(args = {}) {
    if (!this.userId) {
      return JSON.stringify({
        results: [],
        message: 'Contacts are unavailable: no authenticated user.',
      });
    }
    try {
      const limit = Math.min(Math.max(1, Number(args.limit) || DEFAULT_LIMIT), 50);
      const results = await searchForTool(this.userId, {
        query: args.query,
        company: args.company,
        role: args.role,
        email: args.email,
        attribute_key: args.attribute_key,
        attribute_value: args.attribute_value,
        limit,
      });
      if (!results.length) {
        const suggestions = args.company
          ? await getCompanySuggestions(this.userId, args.company)
          : [];
        return JSON.stringify({
          results: [],
          suggestions,
          message: suggestions.length
            ? `No exact match for "${args.company}". Did you mean one of: ${suggestions.join(', ')}?`
            : 'No matching contacts found. The user may not have saved any contacts that match these filters.',
        });
      }
      return JSON.stringify({
        results,
        count: results.length,
        truncated: results.length === limit,
      });
    } catch (err) {
      logger.error('[search_contacts]', err);
      return JSON.stringify({ results: [], error: 'Contact search failed.' });
    }
  }
}

module.exports = SearchContacts;
