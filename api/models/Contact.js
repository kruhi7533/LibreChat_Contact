const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Contact schema.
 *
 * Design notes:
 * - `attributes` is a Mixed Map so contacts can carry arbitrary key-value
 *   metadata (Industry, Location, Funding Stage, Tags, etc.) without schema
 *   migrations.
 * - `searchText` is a denormalized concatenation of every searchable field,
 *   refreshed before save and indexed with a Mongo text index. This lets the
 *   `search_contacts` tool fall back to BM25-style keyword search when no
 *   exact filter matches.
 * - Compound indexes on (user, company), (user, name), (user, email) keep
 *   tenant-scoped exact-match queries cheap as the collection grows.
 */
const contactSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    company: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      trim: true,
      default: '',
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
    },
    notes: {
      type: String,
      default: '',
    },
    attributes: {
      type: Map,
      of: Schema.Types.Mixed,
      default: () => new Map(),
    },
    searchText: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' },
    minimize: false,
  },
);

contactSchema.index({ user: 1, company: 1 });
contactSchema.index({ user: 1, name: 1 });
contactSchema.index({ user: 1, email: 1 });
contactSchema.index({ user: 1, role: 1 });
contactSchema.index({ user: 1, createdAt: -1 });
contactSchema.index({ searchText: 'text' });

const buildSearchText = (doc) => {
  const parts = [doc.name, doc.company, doc.role, doc.email, doc.notes];
  if (doc.attributes) {
    const entries =
      doc.attributes instanceof Map
        ? Array.from(doc.attributes.entries())
        : Object.entries(doc.attributes);
    for (const [key, value] of entries) {
      if (value == null) continue;
      parts.push(key);
      if (Array.isArray(value)) {
        parts.push(value.join(' '));
      } else if (typeof value === 'object') {
        parts.push(JSON.stringify(value));
      } else {
        parts.push(String(value));
      }
    }
  }
  return parts.filter(Boolean).join(' ');
};

contactSchema.pre('save', function (next) {
  this.searchText = buildSearchText(this);
  next();
});

contactSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() || {};
  const $set = update.$set || update;
  const merged = { ...$set };
  if (merged.name || merged.company || merged.role || merged.email || merged.notes || merged.attributes) {
    merged.searchText = buildSearchText(merged);
    if (update.$set) {
      update.$set.searchText = merged.searchText;
    } else {
      update.searchText = merged.searchText;
    }
    this.setUpdate(update);
  }
  next();
});

const Contact = mongoose.models.Contact || mongoose.model('Contact', contactSchema);

module.exports = Contact;
module.exports.buildSearchText = buildSearchText;
