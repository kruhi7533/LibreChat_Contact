/**
 * Minimal streaming CSV parser.
 *
 * Why not a library? The assignment runs in a forked LibreChat repo and
 * adding a new dep just for one route is overkill. This implementation
 * handles:
 *   - BOM stripping
 *   - Quoted fields containing commas / quotes / newlines
 *   - "" escape inside quoted fields
 *   - LF and CRLF line endings
 *   - Trailing newline / empty lines
 *
 * It exposes a Transform stream that emits one parsed row object per push,
 * keying values by the header row.
 */
const { Transform } = require('stream');

const BOM = '﻿';

const createCsvStream = () => {
  let buffer = '';
  let headers = null;
  let inQuotes = false;
  let field = '';
  let row = [];
  let firstChunk = true;

  const flushField = () => {
    row.push(field);
    field = '';
  };

  const flushRow = (push) => {
    if (row.length === 0 && field === '') return;
    flushField();
    if (!headers) {
      headers = row.map((h) => h.trim());
    } else if (row.length === 1 && row[0] === '') {
      // empty trailing line
    } else {
      const obj = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]] = row[i] != null ? row[i] : '';
      }
      push(obj);
    }
    row = [];
  };

  return new Transform({
    readableObjectMode: true,
    writableObjectMode: false,
    transform(chunk, _enc, cb) {
      let str = chunk.toString('utf8');
      if (firstChunk) {
        firstChunk = false;
        if (str.startsWith(BOM)) {
          str = str.slice(1);
        }
      }
      buffer += str;

      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (inQuotes) {
          if (ch === '"') {
            if (buffer[i + 1] === '"') {
              field += '"';
              i++;
            } else {
              inQuotes = false;
            }
          } else {
            field += ch;
          }
        } else {
          if (ch === '"') {
            inQuotes = true;
          } else if (ch === ',') {
            flushField();
          } else if (ch === '\n') {
            flushRow((obj) => this.push(obj));
          } else if (ch === '\r') {
            // swallow; a following \n will flush the row
          } else {
            field += ch;
          }
        }
      }

      // We've consumed the buffer fully (single pass); reset it.
      buffer = '';
      cb();
    },
    flush(cb) {
      if (field !== '' || row.length > 0) {
        flushRow((obj) => this.push(obj));
      }
      cb();
    },
  });
};

module.exports = { createCsvStream };
