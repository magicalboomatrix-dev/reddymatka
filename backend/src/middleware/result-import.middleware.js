const multer = require('multer');

const allowedMimeTypes = new Set([
  'text/csv',
  'application/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

module.exports = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const extension = String(file.originalname || '').toLowerCase();
    const isAllowedExtension = extension.endsWith('.csv') || extension.endsWith('.xls') || extension.endsWith('.xlsx');
    if (allowedMimeTypes.has(file.mimetype) || isAllowedExtension) {
      return cb(null, true);
    }

    return cb(new Error('Invalid file type. Only CSV, XLS, and XLSX files are allowed.'), false);
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});