// Demo data: two halls, eight classic films and showtimes for the next 14 days.
// Safe to run again: halls and films are upserted, showtimes are only added where missing.
//   npm run db:seed          (main database, .env)
import { getPrisma } from '../server/db.js';

// --- Halls -------------------------------------------------------------------------------

// Seats are numbered left to right; an aisle is a gap in `col`, so the map is drawn
// from the data alone.
function hallSeats({ rows, perRow, aisleAfter = [], accessible = [] }) {
  const seats = [];
  for (const row of rows) {
    let col = 0;
    for (let number = 1; number <= perRow; number++) {
      col++;
      seats.push({
        row,
        number,
        col,
        kind: accessible.includes(`${row}${number}`) ? 'ACCESSIBLE' : 'STANDARD',
      });
      if (aisleAfter.includes(number)) col++; // leave an empty column
    }
  }
  return seats;
}

const HALLS = [
  {
    slug: 'buyuk-salon',
    name: 'Büyük Salon',
    seats: hallSeats({
      rows: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'], // no "I": it looks like "1"
      perRow: 14,
      aisleAfter: [3, 11],
      accessible: ['K1', 'K2', 'K13', 'K14'],
    }),
  },
  {
    slug: 'kucuk-salon',
    name: 'Küçük Salon',
    seats: hallSeats({
      rows: ['A', 'B', 'C', 'D', 'E', 'F'],
      perRow: 10,
      aisleAfter: [5],
      accessible: ['F1', 'F10'],
    }),
  },
];

// --- Films (public domain classics; summaries written for this project) -----------------

const MOVIES = [
  {
    slug: 'dr-caligari', titleTr: "Dr. Caligari'nin Muayenehanesi", titleEn: 'The Cabinet of Dr. Caligari',
    originalTitle: 'Das Cabinet des Dr. Caligari', year: 1920, director: 'Robert Wiene', runtimeMin: 76,
    summaryTr: 'Bir panayır hipnozcusu ve uyurgezer Cesare, küçük bir kasabada işlenen cinayetlerin ardındaki karanlık sırrı saklar. Eğri büyrü dekorlarıyla Alman dışavurumculuğunun simgesi.',
    summaryEn: 'A fairground hypnotist and the sleepwalker Cesare hide a dark secret behind a series of murders in a small town. The crooked sets made it the icon of German Expressionism.',
    posterInk: '#1b1712', posterPaper: '#d9c49a',
  },
  {
    slug: 'nosferatu', titleTr: 'Nosferatu', titleEn: 'Nosferatu',
    originalTitle: 'Nosferatu, eine Symphonie des Grauens', year: 1922, director: 'F. W. Murnau', runtimeMin: 94,
    summaryTr: 'Emlakçı Hutter, Kont Orlok\'a ev satmak için Karpatlar\'a gider; kont onu izleyerek şehre vebayı getirir. Sinemanın ilk vampir filmlerinden.',
    summaryEn: 'Estate agent Hutter travels to the Carpathians to sell a house to Count Orlok, who follows him home and brings the plague. One of the first vampire films.',
    posterInk: '#e8e2d4', posterPaper: '#2a2422',
  },
  {
    slug: 'the-kid', titleTr: 'Yumurcak', titleEn: 'The Kid',
    originalTitle: 'The Kid', year: 1921, director: 'Charlie Chaplin', runtimeMin: 68,
    summaryTr: 'Şarlo sokakta bulduğu bir bebeği büyütür; yıllar sonra yetkililer çocuğu ondan almaya gelir. Kahkahayla gözyaşını aynı sahnede buluşturan ilk uzun metrajı.',
    summaryEn: 'The Tramp raises a baby he finds in the street; years later the authorities come to take the boy away. His first feature, mixing laughter and tears in the same scene.',
    posterInk: '#2b2b2b', posterPaper: '#e9dfcb',
  },
  {
    slug: 'sherlock-jr', titleTr: 'Sherlock Jr.', titleEn: 'Sherlock Jr.',
    originalTitle: 'Sherlock Jr.', year: 1924, director: 'Buster Keaton', runtimeMin: 45,
    summaryTr: 'Dedektif olmak isteyen bir sinema makinisti rüyasında perdedeki filmin içine girer. Kurgu numaraları bugün bile şaşırtıyor.',
    summaryEn: 'A projectionist who dreams of being a detective walks into the film on the screen. Its editing tricks still surprise today.',
    posterInk: '#f2e6c9', posterPaper: '#7a2e22',
  },
  {
    slug: 'potemkin', titleTr: 'Potemkin Zırhlısı', titleEn: 'Battleship Potemkin',
    originalTitle: 'Bronenosets Potyomkin', year: 1925, director: 'Sergei Eisenstein', runtimeMin: 75,
    summaryTr: '1905\'te kurtlu et yüzünden isyan eden denizciler ve Odessa merdivenleri. Montaj sinemasının ders kitaplarına giren örneği.',
    summaryEn: 'Sailors who mutiny over rotten meat in 1905, and the Odessa Steps. The textbook example of montage cinema.',
    posterInk: '#f4ede0', posterPaper: '#a3261c',
  },
  {
    slug: 'the-general', titleTr: 'General', titleEn: 'The General',
    originalTitle: 'The General', year: 1926, director: 'Buster Keaton, Clyde Bruckman', runtimeMin: 78,
    summaryTr: 'Bir makinist, çalınan lokomotifi ve sevdiği kadını kurtarmak için düşman hattına tek başına girer. Dublörsüz tren sahneleriyle ünlü.',
    summaryEn: 'An engine driver goes behind enemy lines alone to rescue his stolen locomotive and the woman he loves. Famous for train stunts done without doubles.',
    posterInk: '#1d2b3a', posterPaper: '#e7d8b1',
  },
  {
    slug: 'metropolis', titleTr: 'Metropolis', titleEn: 'Metropolis',
    originalTitle: 'Metropolis', year: 1927, director: 'Fritz Lang', runtimeMin: 153,
    summaryTr: 'Yerin altında çalışan işçiler ile kulelerde yaşayan seçkinler arasında bölünmüş bir gelecek şehri ve bir robot. Bilimkurgu sinemasının atası.',
    summaryEn: 'A city of the future split between workers underground and an elite in the towers, and a robot. The ancestor of science-fiction cinema.',
    posterInk: '#d6b25e', posterPaper: '#16181d',
  },
  {
    slug: 'night-of-the-living-dead', titleTr: 'Yaşayan Ölülerin Gecesi', titleEn: 'Night of the Living Dead',
    originalTitle: 'Night of the Living Dead', year: 1968, director: 'George A. Romero', runtimeMin: 96,
    summaryTr: 'Bir çiftlik evine sığınan yabancılar, dışarıda dolaşan ölülere karşı bir gece boyunca dayanmaya çalışır. Modern zombi filminin başlangıcı.',
    summaryEn: 'Strangers hiding in a farmhouse try to survive one night against the dead walking outside. The beginning of the modern zombie film.',
    posterInk: '#c9c4b8', posterPaper: '#111111',
  },
];

// --- Showtimes ---------------------------------------------------------------------------

const DAYS_AHEAD = 14;
// Istanbul is UTC+3 all year.
const SLOTS = [
  { hourUtc: 11, minute: 0, priceCents: 15000 }, // 14:00, matinee
  { hourUtc: 14, minute: 30, priceCents: 15000 }, // 17:30
  { hourUtc: 18, minute: 0, priceCents: 18000 }, // 21:00
];

export function plannedShowtimes(halls, movies, from = new Date()) {
  const start = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const planned = [];
  for (let day = 0; day < DAYS_AHEAD; day++) {
    halls.forEach((hall, h) => {
      SLOTS.forEach((slot, s) => {
        const startsAt = new Date(start + day * 86_400_000 + slot.hourUtc * 3_600_000 + slot.minute * 60_000);
        if (startsAt <= from) return;
        // Rotate films so each hall and day has a different programme.
        const movie = movies[(day * SLOTS.length + s + h * 3) % movies.length];
        planned.push({ hallId: hall.id, movieId: movie.id, startsAt, priceCents: slot.priceCents });
      });
    });
  }
  return planned;
}

export async function seed(prisma) {
  const halls = [];
  for (const { seats, ...hall } of HALLS) {
    const saved = await prisma.hall.upsert({ where: { slug: hall.slug }, update: { name: hall.name }, create: hall });
    await prisma.hallSeat.createMany({ data: seats.map((s) => ({ ...s, hallId: saved.id })), skipDuplicates: true });
    halls.push(saved);
  }
  const movies = [];
  for (const movie of MOVIES) {
    movies.push(await prisma.movie.upsert({ where: { slug: movie.slug }, update: movie, create: movie }));
  }
  const { count } = await prisma.showtime.createMany({
    data: plannedShowtimes(halls, movies),
    skipDuplicates: true, // the (hallId, startsAt) pair is unique
  });
  return { halls: halls.length, movies: movies.length, showtimesAdded: count };
}

// Run only when started as a script (`node prisma/seed.js`), not when a test imports it.
if (import.meta.main) {
  const prisma = getPrisma();
  seed(prisma)
    .then((result) => console.log('seed:', result))
    .finally(() => prisma.$disconnect());
}
