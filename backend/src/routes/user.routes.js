const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { authenticate } = require('../middleware/auth.middleware');

router.get('/profile', authenticate, userController.getProfile);
router.get('/bank-accounts', authenticate, userController.getBankAccounts);
router.post('/bank-accounts', authenticate, userController.addBankAccount);
router.put('/bank-accounts/:id', authenticate, userController.updateBankAccount);
router.delete('/bank-accounts/:id', authenticate, userController.deleteBankAccount);
router.put('/bank-accounts/:id/default', authenticate, userController.setDefaultBankAccount);
router.get('/account-statement', authenticate, userController.getAccountStatement);
router.get('/profit-loss', authenticate, userController.getProfitLoss);
router.get('/ui-config', authenticate, userController.getUiConfig);

module.exports = router;
