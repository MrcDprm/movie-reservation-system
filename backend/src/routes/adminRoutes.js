const express = require('express');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const {
  movieValidators,
  createMovie,
  updateMovie,
  deleteMovie,
  listMovies,
} = require('../controllers/movieController');
const {
  showtimeValidators,
  createShowtime,
  updateShowtime,
  deleteShowtime,
  listShowtimesAdmin,
} = require('../controllers/showtimeController');
const {
  listAllReservations,
  getStats,
  promoteUser,
  listUsers,
} = require('../controllers/adminController');

const router = express.Router();

router.use(authenticate, requireAdmin);

router.get('/movies', listMovies);
router.post('/movies', movieValidators, validate, createMovie);
router.put('/movies/:id', movieValidators, validate, updateMovie);
router.delete('/movies/:id', deleteMovie);

router.get('/showtimes', listShowtimesAdmin);
router.post('/showtimes', showtimeValidators, validate, createShowtime);
router.put('/showtimes/:id', updateShowtime);
router.delete('/showtimes/:id', deleteShowtime);

router.get('/reservations', listAllReservations);
router.get('/stats', getStats);
router.get('/users', listUsers);
router.patch('/users/:id/promote', promoteUser);

module.exports = router;
