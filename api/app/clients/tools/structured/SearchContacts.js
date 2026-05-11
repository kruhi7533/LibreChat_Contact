const { logger } = require('@librechat/data-schemas');
const { Tool } = require('@librechat/agents/langchain/tools');
const { searchForTool } = require('~/server/services/Contacts/service');

const searchContactsJsonSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'Free-text search across name, company, role, email, notes, and arbitrary attributes (Industry, Tags, Location, etc.).',
    },
    company: {
      type: 'string',
      description: 'Exact (case-insensitive) company filter, e.g. "Acme Corp".',
    },
    role: {
      type: 'string',
      description: 'Exact (case-insensitive) role filter, e.g. "CTO".',
    },
    email: {
      type: 'string',
      description: 'Exact email filter (case-insensitive).',
    },
    attribute_key: {
      type: 'string',
      description:
        'Filter by an arbitrary attribute key. Common keys: "Industry", "Location", "Funding Stage", "Tags". Must be paired with attribute_value.',
    },
    attribute_value: {
      type: 'string',
      description:
        'Value to match against attribute_key (case-insensitive substring match). Required if attribute_key is set.',
    },
    limit: {
      type: 'integer',
      description: 'Maximum number of contacts to return. Default 20, capped at 50.',
      default: 20,
      maximum: 50,
    },
  },
  required: [],
};

const SEARCH_CONTACTS_DEFAULT_LIMIT = Number(process.env.CONTACTS_SEARCH_DEFAULT_LIMIT) || 20;

class SearchContacts extends Tool {
  static lc_name() {
    return 'SearchContacts';
  }

  constructor(fields = {}) {
    super();
    this.name = 'search_contacts';
    this.description =
      "Search the user's personal contacts workspace. Use this whenever the user asks " +
      'about people, companies, roles, or anything that may live in their saved contacts ' +
      "(e.g. \"Who works at Acme?\", \"List CTOs\", \"What do we know about Sarah Chen?\", " +
      "\"Which contacts are interested in AI infrastructure?\"). Prefer narrow filters " +
      '(company, role, attribute_key/value) over a broad query when possible. Returns at ' +
      'most 20 of the most relevant contacts so the user does not need to dump their full list.';
    this.schema = searchContactsJsonSchema;
    /** @type {string} */
    this.userId = fields.userId;
    /** @type {boolean} Used to allow construction without a user (e.g. for tool listing). */
    this.override = fields.override ?? false;
    if (!this.userId && !this.override) {
      throw new Error('search_contacts tool requires a userId for tenant scoping');
    }
  }

  static get jsonSchema() {
    return searchContactsJsonSchema;
  }

  async _call(args = {}) {
    if (!this.userId) {
      return JSON.stringify({
        results: [],
        message: 'Contacts are unavailable: no authenticated user.',
      });
    }
    try {
      const limit = Math.min(
        Math.max(1, Number(args.limit) || SEARCH_CONTACTS_DEFAULT_LIMIT),
        50,
      );
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
        return JSON.stringify({
          results: [],
          message:
            'No matching contacts found. The user may not have saved any contacts that match these filters.',
        });
      }
      return JSON.stringify({
        results,
        count: results.length,
        truncated: results.length === limit,
      });
    } catch (err) {
      logger.error('[search_contacts]', err);
      return JSON.stringify({
        results: [],
        error: 'Contact search failed.',
      });
    }
  }
}

module.exports = SearchContacts;
