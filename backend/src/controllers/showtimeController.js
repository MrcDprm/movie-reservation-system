const { body } = require('express-validator');
const { prisma } = require('../utils/prisma');
const { AppError, asyncHandler } = require('../utils/errors');

const showtimeValidators = [
  body('movieId').notEmpty().withMessage('movieId is required'),
  body('startTime').isISO8601().withMessage('Valid startTime is required'),
  body('endTime').isISO8601().withMessage('Valid endTime is required'),
  body('capacity').isInt({ min: 1, max: 200 }).withMessage('Capacity must be 1–200'),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a non-negative number'),
];

async function createSeatsForShowtime(tx, showtimeId, capacity) {
  await tx.seat.createMany({
    data: Array.from({ length: capacity }, (_, i) => ({
      showtimeId,
      seatNumber: i + 1,
    })),
  });
}

const getSeats = asyncHandler(async (req, res) => {
  const showtime = await prisma.showtime.findUnique({
    where: { id: req.params.id },
    include: {
      movie: { select: { id: true, title: true, posterUrl: true, genre: true } },
      seats: {
        orderBy: { seatNumber: 'asc' },
        select: {
          id: true,
          seatNumber: true,
          reservationId: true,
        },
      },
    },
  });

  if (!showtime) {
    throw new AppError('Showtime not found', 404);
  }

  const seats = showtime.seats.map((s) => ({
    id: s.id,
    seatNumber: s.seatNumber,
    available: s.reservationId === null,
  }));

  res.json({
    success: true,
    data: {
      showtime: {
        id: showtime.id,
        startTime: showtime.startTime,
        endTime: showtime.endTime,
        capacity: showtime.capacity,
        price: showtime.price,
        movie: showtime.movie,
      },
      seats,
      availableCount: seats.filter((s) => s.available).length,
    },
  });
});

const createShowtime = asyncHandler(async (req, res) => {
  const { movieId, startTime, endTime, capacity, price } = req.body;

  const movie = await prisma.movie.findUnique({ where: { id: movieId } });
  if (!movie) {
    throw new AppError('Movie not found', 404);
  }

  const start = new Date(startTime);
  const end = new Date(endTime);
  if (end <= start) {
    throw new AppError('endTime must be after startTime', 400);
  }

  const showtime = await prisma.$transaction(async (tx) => {
    const created = await tx.showtime.create({
      data: {
        movieId,
        startTime: start,
        endTime: end,
        capacity: Number(capacity),
        price,
      },
    });
    await createSeatsForShowtime(tx, created.id, Number(capacity));
    return created;
  });

  res.status(201).json({ success: true, data: { showtime } });
});

const updateShowtime = asyncHandler(async (req, res) => {
  const existing = await prisma.showtime.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new AppError('Showtime not found', 404);
  }

  const { startTime, endTime, price } = req.body;
  const data = {};

  if (startTime) data.startTime = new Date(startTime);
  if (endTime) data.endTime = new Date(endTime);
  if (price !== undefined) data.price = price;

  const start = data.startTime || existing.startTime;
  const end = data.endTime || existing.endTime;
  if (end <= start) {
    throw new AppError('endTime must be after startTime', 400);
  }

  const showtime = await prisma.showtime.update({
    where: { id: req.params.id },
    data,
  });

  res.json({ success: true, data: { showtime } });
});

const deleteShowtime = asyncHandler(async (req, res) => {
  const existing = await prisma.showtime.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    throw new AppError('Showtime not found', 404);
  }

  await prisma.showtime.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Showtime deleted' });
});

const listShowtimesAdmin = asyncHandler(async (req, res) => {
  const showtimes = await prisma.showtime.findMany({
    include: {
      movie: { select: { id: true, title: true } },
      _count: { select: { reservations: true, seats: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  res.json({ success: true, data: { showtimes } });
});

module.exports = {
  showtimeValidators,
  getSeats,
  createShowtime,
  updateShowtime,
  deleteShowtime,
  listShowtimesAdmin,
};
