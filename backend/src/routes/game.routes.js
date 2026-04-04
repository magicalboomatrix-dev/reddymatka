const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');
const { cache } = require('../middleware/cache.middleware');
const { adminActivity } = require('../middleware/admin-activity.middleware');

router.get('/', cache(30), gameController.listGames);
router.get('/:id', gameController.getGameInfo);
router.post('/', authenticate, authorize('admin'), gameController.createGame);
router.put('/:id', authenticate, authorize('admin'), gameController.updateGame);
router.delete('/:id', authenticate, authorize('admin'), gameController.deleteGame);
router.post('/:id/result', authenticate, authorize('admin'), adminActivity('declare_result', 'game_result'), gameController.declareResult);
router.post('/:id/settle', authenticate, authorize('admin'), gameController.settleBets);

module.exports = router;
