const fs = require('fs');
const { logger } = require('@librechat/data-schemas');
const {
  createContact,
  updateContact,
  deleteContact,
  getContact,
  listContacts,
  searchForTool,
} = require('~/server/services/Contacts/service');
const { importCsv } = require('~/server/services/Contacts/import');

const errorResponse = (res, status, message, code) =>
  res.status(status).json({ error: { message, code } });

const listController = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const result = await listContacts(req.user.id, { page, limit, q });
    res.status(200).json(result);
  } catch (err) {
    logger.error('[contacts.list]', err);
    errorResponse(res, 500, 'Failed to list contacts', 'CONTACT_LIST_FAILED');
  }
};

const getController = async (req, res) => {
  try {
    const contact = await getContact(req.user.id, req.params.id);
    if (!contact) return errorResponse(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND');
    res.status(200).json(contact);
  } catch (err) {
    logger.error('[contacts.get]', err);
    errorResponse(res, 500, 'Failed to fetch contact', 'CONTACT_GET_FAILED');
  }
};

const createController = async (req, res) => {
  try {
    const contact = await createContact(req.user.id, req.body || {});
    res.status(201).json(contact);
  } catch (err) {
    if (err.code === 'CONTACT_NAME_REQUIRED') {
      return errorResponse(res, 400, err.message, err.code);
    }
    logger.error('[contacts.create]', err);
    errorResponse(res, 500, 'Failed to create contact', 'CONTACT_CREATE_FAILED');
  }
};

const updateController = async (req, res) => {
  try {
    const contact = await updateContact(req.user.id, req.params.id, req.body || {});
    if (!contact) return errorResponse(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND');
    res.status(200).json(contact);
  } catch (err) {
    logger.error('[contacts.update]', err);
    errorResponse(res, 500, 'Failed to update contact', 'CONTACT_UPDATE_FAILED');
  }
};

const deleteController = async (req, res) => {
  try {
    const ok = await deleteContact(req.user.id, req.params.id);
    if (!ok) return errorResponse(res, 404, 'Contact not found', 'CONTACT_NOT_FOUND');
    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error('[contacts.delete]', err);
    errorResponse(res, 500, 'Failed to delete contact', 'CONTACT_DELETE_FAILED');
  }
};

const searchController = async (req, res) => {
  try {
    const limitParam = parseInt(req.query.limit, 10);
    const results = await searchForTool(req.user.id, {
      query: req.query.q,
      company: req.query.company,
      role: req.query.role,
      email: req.query.email,
      attribute_key: req.query.attribute_key,
      attribute_value: req.query.attribute_value,
      limit: Number.isFinite(limitParam) ? limitParam : 20,
    });
    res.status(200).json({ results });
  } catch (err) {
    logger.error('[contacts.search]', err);
    errorResponse(res, 500, 'Failed to search contacts', 'CONTACT_SEARCH_FAILED');
  }
};

const importController = async (req, res) => {
  if (!req.file) {
    return errorResponse(res, 400, 'No CSV file uploaded', 'CONTACT_IMPORT_NO_FILE');
  }
  const tempPath = req.file.path;
  try {
    const summary = await importCsv({ userId: req.user.id, filePath: tempPath });
    res.status(200).json(summary);
  } catch (err) {
    logger.error('[contacts.import]', err);
    errorResponse(res, 500, 'CSV import failed', 'CONTACT_IMPORT_FAILED');
  } finally {
    fs.promises.unlink(tempPath).catch(() => {});
  }
};

module.exports = {
  listController,
  getController,
  createController,
  updateController,
  deleteController,
  searchController,
  importController,
};
