// Local API server. Vite (port 5173) proxies /api here, so the browser sees one origin,
// exactly like on Vercel.
import { createApp } from './app.js';

const port = Number(process.env.API_PORT ?? 3001);
createApp().listen(port, () => console.log(`API on http://localhost:${port}`));
