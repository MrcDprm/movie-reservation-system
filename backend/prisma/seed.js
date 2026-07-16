const { PrismaClient, Role } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const movies = [
  {
    title: 'Neon Horizon',
    description:
      'A rogue navigator charts a course through collapsing wormholes to save a dying megacity. Visually spectacular cyberpunk thriller.',
    posterUrl: 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=900&fit=crop',
    genre: 'Sci-Fi',
  },
  {
    title: 'Shadow Protocol',
    description:
      'An elite operative must infiltrate a black-site AI facility before a weaponized algorithm goes live worldwide.',
    posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=900&fit=crop',
    genre: 'Action',
  },
  {
    title: 'The Last Frame',
    description:
      'A documentary filmmaker discovers footage that rewrites her family history—and puts her in mortal danger.',
    posterUrl: 'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=900&fit=crop',
    genre: 'Thriller',
  },
  {
    title: 'Aurora Drift',
    description:
      'Two estranged siblings reunite on a polar research vessel as the northern lights begin behaving impossibly.',
    posterUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&h=900&fit=crop',
    genre: 'Drama',
  },
];

function hoursFromNow(hours) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + hours);
  return d;
}

async function main() {
  console.log('Seeding database...');

  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@cinema.com' },
  });
  if (existingAdmin) {
    console.log('Seed data already present — skipping.');
    return;
  }

  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const userPassword = await bcrypt.hash('User123!', 12);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@cinema.com',
      password: adminPassword,
      role: Role.ADMIN,
    },
  });

  const demoUser = await prisma.user.create({
    data: {
      email: 'user@cinema.com',
      password: userPassword,
      role: Role.USER,
    },
  });

  const createdMovies = [];
  for (const movie of movies) {
    createdMovies.push(await prisma.movie.create({ data: movie }));
  }

  const showtimeConfigs = [
    { movieIndex: 0, startOffset: 4, durationHours: 2, capacity: 50, price: 14.5 },
    { movieIndex: 0, startOffset: 28, durationHours: 2, capacity: 40, price: 12.0 },
    { movieIndex: 1, startOffset: 6, durationHours: 2.5, capacity: 50, price: 16.0 },
    { movieIndex: 1, startOffset: 30, durationHours: 2.5, capacity: 50, price: 13.5 },
    { movieIndex: 2, startOffset: 8, durationHours: 2, capacity: 36, price: 11.0 },
    { movieIndex: 3, startOffset: 10, durationHours: 2.25, capacity: 48, price: 15.0 },
  ];

  for (const cfg of showtimeConfigs) {
    const startTime = hoursFromNow(cfg.startOffset);
    const endTime = new Date(startTime.getTime() + cfg.durationHours * 60 * 60 * 1000);

    const showtime = await prisma.showtime.create({
      data: {
        movieId: createdMovies[cfg.movieIndex].id,
        startTime,
        endTime,
        capacity: cfg.capacity,
        price: cfg.price,
      },
    });

    await prisma.seat.createMany({
      data: Array.from({ length: cfg.capacity }, (_, i) => ({
        showtimeId: showtime.id,
        seatNumber: i + 1,
      })),
    });
  }

  console.log('Seed complete.');
  console.log(`  Admin: ${admin.email} / Admin123!`);
  console.log(`  User:  ${demoUser.email} / User123!`);
  console.log(`  Movies: ${createdMovies.length}, Showtimes: ${showtimeConfigs.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
