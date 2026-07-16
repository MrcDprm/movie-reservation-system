const { prisma } = require('../utils/prisma');
const { AppError, asyncHandler } = require('../utils/errors');

const listAllReservations = asyncHandler(async (req, res) => {
  const reservations = await prisma.reservation.findMany({
    include: {
      user: { select: { id: true, email: true } },
      seats: { orderBy: { seatNumber: 'asc' } },
      showtime: {
        include: { movie: { select: { id: true, title: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: { reservations } });
});

const getStats = asyncHandler(async (req, res) => {
  const confirmed = await prisma.reservation.findMany({
    where: { status: 'CONFIRMED' },
    include: {
      seats: true,
      showtime: { select: { id: true, price: true, capacity: true, movieId: true } },
    },
  });

  let totalRevenue = 0;
  let seatsSold = 0;

  for (const reservation of confirmed) {
    const seatCount = reservation.seats.length;
    seatsSold += seatCount;
    totalRevenue += Number(reservation.showtime.price) * seatCount;
  }

  const showtimes = await prisma.showtime.findMany({
    include: {
      movie: { select: { title: true } },
      seats: { select: { reservationId: true } },
    },
    orderBy: { startTime: 'asc' },
  });

  const capacityReport = showtimes.map((st) => {
    const reserved = st.seats.filter((s) => s.reservationId !== null).length;
    const fillRate =
      st.capacity > 0 ? Math.round((reserved / st.capacity) * 1000) / 10 : 0;
    const price = Number(st.price);
    return {
      showtimeId: st.id,
      movieTitle: st.movie.title,
      startTime: st.startTime,
      capacity: st.capacity,
      reserved,
      available: st.capacity - reserved,
      fillRate,
      price,
      projectedRevenue: Number((price * reserved).toFixed(2)),
    };
  });

  const [movieCount, userCount, confirmedCount, cancelledCount] = await Promise.all([
    prisma.movie.count(),
    prisma.user.count(),
    prisma.reservation.count({ where: { status: 'CONFIRMED' } }),
    prisma.reservation.count({ where: { status: 'CANCELLED' } }),
  ]);

  res.json({
    success: true,
    data: {
      summary: {
        totalRevenue: totalRevenue.toFixed(2),
        seatsSold,
        confirmedReservations: confirmedCount,
        cancelledReservations: cancelledCount,
        movieCount,
        userCount,
      },
      capacityReport,
    },
  });
});

const promoteUser = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.role === 'ADMIN') {
    throw new AppError('User is already an admin', 400);
  }

  const updated = await prisma.user.update({
    where: { id: req.params.id },
    data: { role: 'ADMIN' },
    select: { id: true, email: true, role: true },
  });

  res.json({ success: true, data: { user: updated } });
});

const listUsers = asyncHandler(async (req, res) => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      _count: { select: { reservations: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: { users } });
});

module.exports = {
  listAllReservations,
  getStats,
  promoteUser,
  listUsers,
};
