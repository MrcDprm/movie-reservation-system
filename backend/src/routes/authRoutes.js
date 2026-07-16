const express = require('express');
const { validate } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const {
  registerValidators,
  loginValidators,
  register,
  login,
  me,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', registerValidators, validate, register);
router.post('/login', loginValidators, validate, login);
router.get('/me', authenticate, me);

module.exports = router;
