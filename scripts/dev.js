// `npm run dev`: start the API and the Vite dev server together; Ctrl+C stops both.
import { spawn } from 'node:child_process';

const run = (script) => spawn('npm', ['run', script], { stdio: 'inherit', shell: true });
const children = [run('dev:api'), run('dev:web')];

const stop = () => children.forEach((child) => child.kill());
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
children.forEach((child) => child.on('exit', (code) => code && stop()));
