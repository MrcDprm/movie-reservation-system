const express = require('express');
const { authenticate } = require('../middleware/auth');
const { getSeats } = require('../controllers/showtimeController');

const router = express.Router();

router.use(authenticate);
router.get('/:id/seats', getSeats);

module.exports = router;
