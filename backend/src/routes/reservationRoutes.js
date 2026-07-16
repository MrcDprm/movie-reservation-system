const express = require('express');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  reservationValidators,
  createReservation,
  myReservations,
  cancelReservation,
} = require('../controllers/reservationController');

const router = express.Router();

router.use(authenticate);
router.post('/', reservationValidators, validate, createReservation);
router.get('/me', myReservations);
router.patch('/:id/cancel', cancelReservation);

module.exports = router;
