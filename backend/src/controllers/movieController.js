const { body } = require('express-validator');
const { prisma } = require('../utils/prisma');
const { AppError, asyncHandler } = require('../utils/errors');

const movieValidators = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('posterUrl').trim().notEmpty().withMessage('Poster URL is required'),
  body('genre').trim().notEmpty().withMessage('Genre is required'),
];

function startOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function endOfDay(dateStr) {
  const d = new Date(dateStr);
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

const listMovies = asyncHandler(async (req, res) => {
  const { date } = req.query;

  let where = {};
  if (date) {
    where = {
      showtimes: {
        some: {
          startTime: {
            gte: startOfDay(date),
            lte: endOfDay(date),
          },
        },
      },
    };
  }

  const movies = await prisma.movie.findMany({
    where,
    include: {
      showtimes: {
        where: date
          ? {
              startTime: {
                gte: startOfDay(date),
                lte: endOfDay(date),
              },
            }
          : {
              startTime: { gte: new Date() },
            },
        orderBy: { startTime: 'asc' },
      },
    },
    orderBy: { title: 'asc' },
  });

  res.json({ success: true, data: { movies } });
});

const getMovie = asyncHandler(async (req, res) => {
  const movie = await prisma.movie.findUnique({
    where: { id: req.params.id },
    include: {
      showtimes: {
        where: { startTime: { gte: new Date() } },
        orderBy: { startTime: 'asc' },
      },
    },
  });

  if (!movie) {
    throw new AppError('Movie not found', 404);
  }

  res.json({ success: true, data: { movie } });
});

const createMovie = asyncHandler(async (req, res) => {
  const { title, description, posterUrl, genre } = req.body;
  const movie = await prisma.movie.create({
    data: { title, description, posterUrl, genre },
  });
  res.status(201).json({ success: true, data: { movie } });
});

const updateMovie = asyncHandler(async (req, res) => {
  const { title, description, posterUrl, genre } = req.body;
  const existing = await prisma.movie.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new AppError('Movie not found', 404);
  }

  const movie = await prisma.movie.update({
    where: { id: req.params.id },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(posterUrl !== undefined && { posterUrl }),
      ...(genre !== undefined && { genre }),
    },
  });

  res.json({ success: true, data: { movie } });
});

const deleteMovie = asyncHandler(async (req, res) => {
  const existing = await prisma.movie.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new AppError('Movie not found', 404);
  }

  await prisma.movie.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Movie deleted' });
});

module.exports = {
  movieValidators,
  listMovies,
  getMovie,
  createMovie,
  updateMovie,
  deleteMovie,
};
