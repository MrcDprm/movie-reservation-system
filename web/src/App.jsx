import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/Account.jsx';
import Booking from './pages/Booking.jsx';
import Movie from './pages/Movie.jsx';
import NotFound from './pages/NotFound.jsx';
import Program from './pages/Program.jsx';
import Showtime from './pages/Showtime.jsx';
import Tickets from './pages/Tickets.jsx';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Program /> },
      { path: '/movies/:slug', element: <Movie /> },
      { path: '/showtimes/:id', element: <Showtime /> },
      { path: '/tickets', element: <Tickets /> },
      { path: '/bookings/:id', element: <Booking /> },
      { path: '/login', element: <Login /> },
      { path: '/register', element: <Register /> },
      { path: '/verify-email', element: <VerifyEmail /> },
      { path: '/forgot-password', element: <ForgotPassword /> },
      { path: '/reset-password', element: <ResetPassword /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
