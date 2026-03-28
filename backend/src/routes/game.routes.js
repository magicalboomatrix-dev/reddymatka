const express = require('express');
const router = express.Router();
const gameController = require('../controllers/game.controller');
const { authenticate, authorize } = require('../middleware/auth.middleware');

router.get('/', gameController.listGames);
router.get('/:id', gameController.getGameInfo);
router.post('/', authenticate, authorize('admin'), gameController.createGame);
router.put('/:id', authenticate, authorize('admin'), gameController.updateGame);
router.delete('/:id', authenticate, authorize('admin'), gameController.deleteGame);
router.post('/:id/result', authenticate, authorize('admin'), gameController.declareResult);
router.post('/:id/settle', authenticate, authorize('admin'), gameController.settleBets);

module.exports = router;
