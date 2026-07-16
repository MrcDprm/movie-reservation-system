const express = require('express');
const { authenticate } = require('../middleware/auth');
const { listMovies, getMovie } = require('../controllers/movieController');

const router = express.Router();

router.use(authenticate);
router.get('/', listMovies);
router.get('/:id', getMovie);

module.exports = router;
