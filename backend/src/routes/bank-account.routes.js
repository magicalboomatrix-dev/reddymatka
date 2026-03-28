const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/', authenticate, userController.getBankAccounts);
router.post('/', authenticate, userController.addBankAccount);
router.put('/:id', authenticate, userController.updateBankAccount);
router.delete('/:id', authenticate, userController.deleteBankAccount);
router.put('/:id/default', authenticate, userController.setDefaultBankAccount);

module.exports = router;
