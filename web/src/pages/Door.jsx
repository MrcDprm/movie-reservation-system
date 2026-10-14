// The door, for staff: point the phone camera at a ticket and the screen says whether to let
// the guest in. The server decides (signature, payment, time window, used or not); this page
// only reads the QR code and shows the answer in big colours.
import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';

import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatTime } from '../lib/format.js';
import { usePrefs } from '../lib/prefs.jsx';

const SCAN_EVERY_MS = 200; // ~5 frames a second is plenty and keeps old phones cool
const RESUME_AFTER_MS = 2500; // the next guest can step up without a tap
const SAME_CODE_MS = 4000; // the same ticket held in front of the camera is not sent again

const TONE = {
  ok: 'border-ok bg-ok/15 text-ok',
  already_used: 'border-warn bg-warn/15 text-warn',
};

function useCamera(videoRef) {
  const streamRef = useRef(null);
  const [state, setState] = useState('off'); // off | starting | on | denied | missing

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setState('off');
  }, []);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState('missing');
      return;
    }
    setState('starting');
    try {
      // The back camera on phones; any camera on laptops.
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setState('on');
    } catch (err) {
      setState(err?.name === 'NotAllowedError' ? 'denied' : 'missing');
    }
  }, [videoRef]);

  useEffect(() => stop, [stop]); // turn the camera off when leaving the page
  return { state, start, stop };
}

function Result({ answer, onNext }) {
  const { lang, t } = usePrefs();
  const { result, ticket } = answer;
  const tone = TONE[result] ?? 'border-danger bg-danger/15 text-danger';
  return (
    <div className={`flex h-full flex-col overflow-auto rounded-xl border-2 p-5 ${tone}`} role="status" aria-live="assertive">
      <p className="font-display text-3xl font-semibold">{t(`door.result.${result}`)}</p>
      {result === 'already_used' && ticket?.checkedInAt && (
        <p className="mt-1 text-sm">{t('door.usedAt', { time: formatTime(ticket.checkedInAt, lang) })}</p>
      )}
      {ticket && (
        <div className="my-4 grid gap-1 text-ink">
          <p className="font-display text-5xl font-semibold">
            {ticket.seat}
            {ticket.accessible && <span className="ml-2 align-middle text-base font-normal text-ink-2">♿</span>}
          </p>
          <p className="text-ink-2">
            {lang === 'en' ? ticket.movie.titleEn : ticket.movie.titleTr} · {formatTime(ticket.startsAt, lang)} · {ticket.hall}
          </p>
          <p className="text-sm text-ink-3">{ticket.name}</p>
        </div>
      )}
      <button type="button" onClick={onNext} className="mt-auto w-full rounded-lg border border-line bg-bg px-4 py-2.5 font-semibold text-ink">
        {t('door.next')}
      </button>
    </div>
  );
}

export default function Door() {
  const { t } = usePrefs();
  const { user, loading } = useAuth();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const busyRef = useRef(false);
  const lastRef = useRef({ code: '', at: 0 });
  const resumeRef = useRef(null);
  const camera = useCamera(videoRef);
  const [answer, setAnswer] = useState(null);
  const [manual, setManual] = useState('');
  const [error, setError] = useState(null);

  const next = useCallback(() => {
    clearTimeout(resumeRef.current);
    setAnswer(null);
    busyRef.current = false;
  }, []);

  const check = useCallback(
    async (code) => {
      busyRef.current = true;
      setError(null);
      try {
        const res = await api('/checkin', { method: 'POST', body: { code } });
        setAnswer(res);
        navigator.vibrate?.(res.result === 'ok' ? 80 : [80, 60, 80]); // a different buzz for "stop"
        resumeRef.current = setTimeout(next, RESUME_AFTER_MS);
      } catch (err) {
        setError(t(`error.${err.code}`));
        busyRef.current = false;
      }
    },
    [next, t],
  );

  // Read a frame a few times a second while the camera is on and no answer is on screen.
  useEffect(() => {
    if (camera.state !== 'on') return undefined;
    const timer = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (busyRef.current || !video?.videoWidth) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);
      const found = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, {
        inversionAttempts: 'dontInvert', // tickets are always dark on light
      });
      if (!found?.data) return;
      const now = Date.now();
      if (found.data === lastRef.current.code && now - lastRef.current.at < SAME_CODE_MS) return;
      lastRef.current = { code: found.data, at: now };
      check(found.data);
    }, SCAN_EVERY_MS);
    return () => clearInterval(timer);
  }, [camera.state, check]);

  useEffect(() => () => clearTimeout(resumeRef.current), []);

  if (!loading && !user) return <Navigate to="/login?next=%2Fdoor" replace />;
  if (loading) return null;
  if (user.role !== 'STAFF' && user.role !== 'ADMIN') {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-ink-2">{t('door.staffOnly')}</p>;
  }

  return (
    <div className="mx-auto grid max-w-xl gap-5 px-4 pt-8 sm:pt-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{t('door.title')}</h1>

      <div className="relative overflow-hidden rounded-xl border border-line bg-black">
        {/* playsInline + muted: iPhones would otherwise open the video full screen. */}
        <video ref={videoRef} playsInline muted className={`aspect-square w-full object-cover ${camera.state === 'on' ? '' : 'hidden'}`} />
        {camera.state === 'on' && <div className="pointer-events-none absolute inset-[18%] rounded-2xl border-2 border-white/70" aria-hidden="true" />}
        {camera.state !== 'on' && (
          <div className="grid aspect-square place-items-center p-6 text-center">
            <div className="grid justify-items-center gap-3">
              {(camera.state === 'denied' || camera.state === 'missing') && (
                <p className="text-sm text-white/80">{t(`door.camera.${camera.state}`)}</p>
              )}
              <button
                type="button"
                onClick={camera.start}
                disabled={camera.state === 'starting'}
                className="rounded-lg bg-velvet px-5 py-3 font-semibold text-on-velvet hover:bg-velvet-strong disabled:opacity-60"
              >
                {t('door.camera.start')}
              </button>
            </div>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        {/* The answer covers the camera, so the person at the door never has to scroll for it. */}
        {answer && (
          <div className="absolute inset-0 bg-bg">
            <Result answer={answer} onNext={next} />
          </div>
        )}
      </div>
      {camera.state === 'on' && (
        <button type="button" onClick={camera.stop} className="justify-self-start text-sm font-semibold text-ink-3 hover:text-ink">
          {t('door.camera.stop')}
        </button>
      )}

      {error && <p className="rounded-lg border border-danger/40 px-4 py-3 text-sm text-danger" role="alert">{error}</p>}

      {/* Without a camera (or for a damaged code) the text under the QR can be typed in. */}
      <form
        className="grid gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (manual.trim()) check(manual.trim());
        }}
      >
        <label htmlFor="door-code" className="text-sm font-semibold">
          {t('door.manual')}
        </label>
        <div className="flex gap-2">
          <input
            id="door-code"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            autoComplete="off"
            spellCheck="false"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm text-ink outline-none focus:border-velvet"
          />
          <button type="submit" className="rounded-lg border border-line px-4 font-semibold text-ink-2 hover:border-ink-3">
            {t('door.check')}
          </button>
        </div>
      </form>
    </div>
  );
}
