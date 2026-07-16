const { body } = require('express-validator');
const { prisma } = require('../utils/prisma');
const { AppError, asyncHandler } = require('../utils/errors');

const reservationValidators = [
  body('showtimeId').notEmpty().withMessage('showtimeId is required'),
  body('seatNumbers')
    .isArray({ min: 1 })
    .withMessage('seatNumbers must be a non-empty array'),
  body('seatNumbers.*').isInt({ min: 1 }).withMessage('Each seat number must be a positive integer'),
];

/**
 * Atomic seat claim:
 * 1. Create reservation
 * 2. updateMany WHERE reservationId IS NULL
 * 3. If count !== requested length → throw → transaction rolls back
 */
const createReservation = asyncHandler(async (req, res) => {
  const { showtimeId, seatNumbers } = req.body;
  const uniqueSeats = [...new Set(seatNumbers.map(Number))];

  if (uniqueSeats.length !== seatNumbers.length) {
    throw new AppError('Duplicate seat numbers are not allowed', 400);
  }

  const showtime = await prisma.showtime.findUnique({
    where: { id: showtimeId },
    include: { movie: { select: { title: true } } },
  });

  if (!showtime) {
    throw new AppError('Showtime not found', 404);
  }

  if (new Date(showtime.startTime) <= new Date()) {
    throw new AppError('Cannot reserve seats for a showtime that has already started', 400);
  }

  try {
    const reservation = await prisma.$transaction(async (tx) => {
      const created = await tx.reservation.create({
        data: {
          userId: req.user.id,
          showtimeId,
          status: 'CONFIRMED',
        },
      });

      const { count } = await tx.seat.updateMany({
        where: {
          showtimeId,
          seatNumber: { in: uniqueSeats },
          reservationId: null,
        },
        data: {
          reservationId: created.id,
        },
      });

      if (count !== uniqueSeats.length) {
        throw new AppError('One or more seats are already taken', 409);
      }

      return tx.reservation.findUnique({
        where: { id: created.id },
        include: {
          seats: { orderBy: { seatNumber: 'asc' } },
          showtime: {
            include: { movie: { select: { id: true, title: true, posterUrl: true } } },
          },
        },
      });
    });

    res.status(201).json({ success: true, data: { reservation } });
  } catch (err) {
    if (err instanceof AppError) throw err;
    // Prisma may wrap application errors from interactive transactions
    if (err?.message?.includes('already taken')) {
      throw new AppError('One or more seats are already taken', 409);
    }
    throw err;
  }
});

const myReservations = asyncHandler(async (req, res) => {
  const reservations = await prisma.reservation.findMany({
    where: { userId: req.user.id },
    include: {
      seats: { orderBy: { seatNumber: 'asc' } },
      showtime: {
        include: { movie: { select: { id: true, title: true, posterUrl: true, genre: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: { reservations } });
});

const cancelReservation = asyncHandler(async (req, res) => {
  const reservation = await prisma.reservation.findUnique({
    where: { id: req.params.id },
    include: { showtime: true },
  });

  if (!reservation) {
    throw new AppError('Reservation not found', 404);
  }

  if (reservation.userId !== req.user.id && req.user.role !== 'ADMIN') {
    throw new AppError('Not authorized to cancel this reservation', 403);
  }

  if (reservation.status === 'CANCELLED') {
    throw new AppError('Reservation is already cancelled', 400);
  }

  if (new Date(reservation.showtime.startTime) <= new Date()) {
    throw new AppError('Cannot cancel a reservation after the showtime has started', 400);
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.seat.updateMany({
      where: { reservationId: reservation.id },
      data: { reservationId: null },
    });

    return tx.reservation.update({
      where: { id: reservation.id },
      data: { status: 'CANCELLED' },
      include: {
        seats: true,
        showtime: {
          include: { movie: { select: { id: true, title: true } } },
        },
      },
    });
  });

  res.json({ success: true, data: { reservation: updated } });
});

module.exports = {
  reservationValidators,
  createReservation,
  myReservations,
  cancelReservation,
};
