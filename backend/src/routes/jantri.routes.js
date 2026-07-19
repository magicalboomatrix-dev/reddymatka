const express = require('express');

const router = express.Router();
const jantriController = require('../controllers/jantri.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { cache } = require('../middleware/cache.middleware');

router.get('/', authenticate, authorize('admin', 'moderator'), cache(60), jantriController.getJantri);

module.exports = router;