const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { requireJwtAuth } = require('~/server/middleware');
const {
  listController,
  getController,
  createController,
  updateController,
  deleteController,
  searchController,
  importController,
} = require('~/server/controllers/ContactController');

const router = express.Router();

const uploadRoot = path.join(os.tmpdir(), 'librechat-contacts-uploads');
fs.mkdirSync(uploadRoot, { recursive: true });

const csvStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadRoot),
  filename: (_req, file, cb) => {
    const id = crypto.randomUUID();
    const ext = path.extname(file.originalname || '.csv').toLowerCase() || '.csv';
    cb(null, `${id}${ext}`);
  },
});

const csvFilter = (_req, file, cb) => {
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (ext === '.csv' || file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
    return cb(null, true);
  }
  cb(new Error('Only CSV files are accepted for contact import'));
};

const csvUpload = multer({
  storage: csvStorage,
  fileFilter: csvFilter,
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1 GB to support 1M-row CSVs
});

router.use(requireJwtAuth);
router.use(express.json({ limit: '1mb' }));

router.get('/search', searchController);
router.post('/import', csvUpload.single('file'), importController);
router.get('/', listController);
router.post('/', createController);
router.get('/:id', getController);
router.patch('/:id', updateController);
router.delete('/:id', deleteController);

module.exports = router;
