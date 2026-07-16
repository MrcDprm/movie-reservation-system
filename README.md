# Aether Cinema — Movie Reservation System

![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-API-000000?style=for-the-badge&logo=express&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/Tailwind-CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![TanStack](https://img.shields.io/badge/TanStack-Query-FF4154?style=for-the-badge&logo=reactquery&logoColor=white)

> A production-oriented full-stack cinema booking platform with JWT authentication, per-showtime seat maps, **atomic concurrency-safe reservations**, live seat polling, role-based admin analytics, and a multi-stage Docker deployment (Nginx + Express + PostgreSQL).

---

## Features

| Area | Capability |
|------|------------|
| **Auth** | Register / login with bcrypt-hashed passwords and JWT bearer tokens; `USER` and `ADMIN` roles |
| **Seat mapping** | Each showtime owns seats `1…capacity`; unique `(showtimeId, seatNumber)` constraint |
| **Concurrency control** | Atomic `updateMany` with `reservationId: null` in the `WHERE` clause inside a Prisma interactive transaction — failed claim count rolls back the reservation |
| **Live availability** | Seat selection page polls every **3 seconds** via TanStack Query `refetchInterval` |
| **Pricing** | Per-showtime `price` (Decimal); admin revenue = Σ(price × seats) for confirmed bookings |
| **Cascading deletes** | Deleting a movie removes showtimes, seats, and reservations (`onDelete: Cascade`) |
| **Admin console** | Movie/showtime CRUD, capacity fill reports, revenue stats, promote users to admin |
| **UX** | Dark “high-end tech” UI — gunmetal surfaces, metallic silver type, gradient borders, glassmorphism nav |

---

## Tech Stack

**Backend:** Node.js 20 · Express · Prisma ORM · PostgreSQL 15 · JWT · bcryptjs · express-validator · helmet · cors  

**Frontend:** React 18 · Vite · Tailwind CSS · React Router · Axios · TanStack Query  

**Infrastructure:** Docker Compose · multi-stage frontend build (`node` → `nginx:alpine`) · health-checked Postgres  

---

## Architecture

```
┌─────────────────┐     JWT + REST      ┌─────────────────┐     Prisma      ┌──────────────────┐
│  Nginx (SPA)    │ ──────────────────► │  Express API    │ ──────────────► │  PostgreSQL 15   │
│  :8080 → :80    │   localhost:5000    │  :5000          │                 │  :5432           │
└─────────────────┘                     └─────────────────┘                 └──────────────────┘
```

Browser traffic hits the Nginx-served React app on **port 8080**. API calls go to the backend on **port 5000** (`VITE_API_URL`).

---

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)
- Ports **8080**, **5000**, and **5432** available on the host

---

## Quick Start

```bash
# 1. Clone / enter the project
cd movie-reservation-system

# 2. Copy environment (optional — defaults are already in .env.example)
cp .env.example .env

# 3. Build and start all services
docker compose up --build -d
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:8080 |
| Backend API | http://localhost:5000/api/health |
| Postgres | localhost:5432 |

On first boot the backend waits for Postgres, runs `prisma migrate deploy`, seeds demo data, then starts the API.

### Demo accounts

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@cinema.com` | `Admin123!` |
| User | `user@cinema.com` | `User123!` |

Stop services:

```bash
docker compose down
```

Persist data wipe (volume):

```bash
docker compose down -v
```

---

## Local development (without Docker)

### Backend

```bash
cd backend
cp ../.env.example .env   # set DATABASE_URL to localhost Postgres
npm install
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

### Frontend

```bash
cd frontend
npm install
# optional: echo VITE_API_URL=http://localhost:5000/api > .env
npm run dev
```

---

## API Documentation Summary

Base URL: `http://localhost:5000/api`  
Auth header: `Authorization: Bearer <token>`

### Auth

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/auth/register` | Public | Create user (`email`, `password`) |
| `POST` | `/auth/login` | Public | Returns `{ user, token }` |
| `GET` | `/auth/me` | Auth | Current user profile |

### Movies & showtimes

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET` | `/movies` | Auth | List movies; optional `?date=YYYY-MM-DD` |
| `GET` | `/movies/:id` | Auth | Movie detail + upcoming showtimes |
| `GET` | `/showtimes/:id/seats` | Auth | Seat map (`available` flag per seat) |

### Reservations

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `POST` | `/reservations` | Auth | Body: `{ showtimeId, seatNumbers: number[] }` |
| `GET` | `/reservations/me` | Auth | Current user’s reservations |
| `PATCH` | `/reservations/:id/cancel` | Auth | Cancel upcoming reservation (frees seats) |

### Admin

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| `GET/POST/PUT/DELETE` | `/admin/movies` | Admin | Movie CRUD |
| `GET/POST/PUT/DELETE` | `/admin/showtimes` | Admin | Showtime CRUD (creates seats on create) |
| `GET` | `/admin/reservations` | Admin | All reservations |
| `GET` | `/admin/stats` | Admin | Revenue + capacity report |
| `GET` | `/admin/users` | Admin | List users |
| `PATCH` | `/admin/users/:id/promote` | Admin | Promote to `ADMIN` |

### Atomic reservation algorithm

```javascript
await prisma.$transaction(async (tx) => {
  const reservation = await tx.reservation.create({
    data: { userId, showtimeId, status: 'CONFIRMED' },
  });

  const { count } = await tx.seat.updateMany({
    where: {
      showtimeId,
      seatNumber: { in: seatNumbers },
      reservationId: null, // only claim free seats
    },
    data: { reservationId: reservation.id },
  });

  if (count !== seatNumbers.length) {
    throw new Error('Seat already taken'); // rolls back reservation
  }
});
```

PostgreSQL applies row-level updates atomically; the `count` check detects lost races and aborts the transaction so no partial booking survives.

---

## Database Schema

```
User 1───* Reservation *───1 Showtime *───1 Movie
                │                │
                │                └───* Seat
                └────────────────────*
```

| Model | Key fields |
|-------|------------|
| **User** | `email`, `password`, `role` (`USER` \| `ADMIN`) |
| **Movie** | `title`, `description`, `posterUrl`, `genre` |
| **Showtime** | `movieId`, `startTime`, `endTime`, `capacity`, **`price`** |
| **Reservation** | `userId`, `showtimeId`, `status` (`CONFIRMED` \| `CANCELLED`) |
| **Seat** | `showtimeId`, `seatNumber`, `reservationId?` (null = available) |

**Relations & cascades**

- `Movie` → `Showtime` — `onDelete: Cascade`
- `Showtime` → `Seat`, `Reservation` — `onDelete: Cascade`
- `User` → `Reservation` — `onDelete: Cascade`
- `Reservation` → `Seat.reservationId` — `onDelete: SetNull` (seats freed if reservation row removed)

**Revenue:** confirmed reservations contribute `showtime.price × number_of_seats` to admin totals (no hardcoded flat fee).

---

## Project Structure

```
movie-reservation-system/
├── docker-compose.yml
├── .env.example
├── README.md
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh
│   ├── package.json
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.js
│   │   └── migrations/
│   └── src/
│       ├── index.js
│       ├── app.js
│       ├── middleware/
│       ├── controllers/
│       ├── routes/
│       └── utils/
└── frontend/
    ├── Dockerfile          # multi-stage → nginx
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    └── src/
        ├── api/
        ├── context/
        ├── components/
        └── pages/
```

---

## Security notes

- Passwords hashed with **bcrypt** (cost 12)
- JWT secret via environment variable — change `JWT_SECRET` before any real deployment
- Helmet + CORS enabled on the API
- Admin routes gated by `requireAdmin` middleware
- Input validation via `express-validator`

---
https://roadmap.sh/projects/movie-reservation-system
