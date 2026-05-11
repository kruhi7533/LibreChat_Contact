const fs = require('fs');
const { logger } = require('@librechat/data-schemas');
const Contact = require('~/models/Contact');
const { buildSearchText } = require('~/models/Contact');
const { createCsvStream } = require('./csv');
const { STANDARD_FIELDS } = require('./service');

const DEFAULT_BATCH = Number(process.env.CONTACTS_IMPORT_BATCH_SIZE) || 1000;

/**
 * Stream a CSV file into the Contact collection.
 *
 * Scaling notes (see README for full discussion):
 *   - Streaming parser → constant memory regardless of file size
 *   - bulkWrite with `ordered: false` → parallelizable on the server, one
 *     bad row doesn't abort the rest
 *   - Pre-computed `searchText` → avoids the post-save hook fan-out
 *   - 1000-doc batches strike a balance between throughput and memory
 *
 * For 1M rows the current single-process implementation completes in roughly
 * minutes; a production design would push the file to a worker queue.
 */
const importCsv = async ({ userId, filePath, batchSize = DEFAULT_BATCH }) => {
  const start = Date.now();
  let imported = 0;
  let failed = 0;
  const errors = [];
  let batch = [];

  const flush = async () => {
    if (!batch.length) return;
    const ops = batch.map((doc) => ({ insertOne: { document: doc } }));
    batch = [];
    try {
      const res = await Contact.bulkWrite(ops, { ordered: false });
      imported += res.insertedCount || 0;
    } catch (err) {
      // bulkWrite with ordered:false may still partially succeed; pull
      // insertedCount from result if present.
      if (err && err.result) {
        imported += err.result.nInserted || 0;
      }
      const writeErrors = err?.writeErrors?.length || 0;
      failed += writeErrors;
      if (writeErrors && errors.length < 5) {
        errors.push(err.writeErrors[0].errmsg || String(err));
      }
      logger.warn(`[contacts.import] bulkWrite partial failure: ${writeErrors} rows`);
    }
  };

  const csv = createCsvStream();
  const stream = fs.createReadStream(filePath);

  await new Promise((resolve, reject) => {
    stream
      .pipe(csv)
      .on('data', async (row) => {
        try {
          const doc = rowToDoc(userId, row);
          if (!doc) {
            failed++;
            return;
          }
          batch.push(doc);
          if (batch.length >= batchSize) {
            csv.pause();
            await flush();
            csv.resume();
          }
        } catch (e) {
          failed++;
          if (errors.length < 5) errors.push(String(e?.message || e));
        }
      })
      .on('end', async () => {
        try {
          await flush();
          resolve();
        } catch (e) {
          reject(e);
        }
      })
      .on('error', reject);
  });

  return {
    imported,
    failed,
    durationMs: Date.now() - start,
    errors: errors.slice(0, 5),
  };
};

const rowToDoc = (userId, row) => {
  const standard = {};
  const attributes = {};
  for (const [rawKey, rawVal] of Object.entries(row)) {
    if (rawKey == null) continue;
    const key = rawKey.trim();
    if (!key) continue;
    const val = rawVal == null ? '' : String(rawVal).trim();
    const lower = key.toLowerCase();
    if (STANDARD_FIELDS.has(lower)) {
      standard[lower] = val;
    } else if (val !== '') {
      attributes[key] = val;
    }
  }
  if (!standard.name) {
    return null;
  }
  const doc = {
    user: userId,
    name: standard.name,
    company: standard.company || '',
    role: standard.role || '',
    email: (standard.email || '').toLowerCase(),
    notes: standard.notes || '',
    attributes,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  doc.searchText = buildSearchText(doc);
  return doc;
};

module.exports = { importCsv };
