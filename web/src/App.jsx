import { useEffect, useState } from 'react';

// Placeholder until the real pages are built: shows that the page and the API are connected.
export default function App() {
  const [status, setStatus] = useState('…');

  useEffect(() => {
    fetch('/api/health')
      .then((response) => response.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus('unreachable'));
  }, []);

  return (
    <main className="min-h-screen grid place-items-center">
      <p>API: {status}</p>
    </main>
  );
}
