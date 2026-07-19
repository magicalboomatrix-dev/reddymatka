const express = require('express');
const router = express.Router();
const support = require('../controllers/support.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

// ── User routes ──────────────────────────────────────────────────────────────
router.post('/tickets', authenticate, authorize('user'), support.createTicket);
router.get('/tickets/my', authenticate, authorize('user'), support.getMyTickets);

// ── Admin / Moderator routes ─────────────────────────────────────────────────
router.get('/tickets', authenticate, authorize('admin', 'moderator'), support.listTickets);
router.get('/tickets/stats', authenticate, authorize('admin', 'moderator'), support.getStats);
router.put('/tickets/:id/status', authenticate, authorize('admin', 'moderator'), support.setTicketStatus);

// ── Shared: both users and staff can view a ticket + messages and reply ───────
router.get('/tickets/:id', authenticate, support.getTicket);
router.post('/tickets/:id/messages', authenticate, support.addMessage);

module.exports = router;
