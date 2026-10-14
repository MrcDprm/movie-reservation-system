import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import Layout from './components/Layout.jsx';
import Movie from './pages/Movie.jsx';
import NotFound from './pages/NotFound.jsx';
import Program from './pages/Program.jsx';
import Showtime from './pages/Showtime.jsx';

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <Program /> },
      { path: '/movies/:slug', element: <Movie /> },
      { path: '/showtimes/:id', element: <Showtime /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
