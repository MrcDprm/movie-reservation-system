// A typographic poster built from the film's data and two colours: no image files, so no
// copyright questions, and every film still gets its own look.
import { usePrefs } from '../lib/prefs.jsx';

// Measured in the browser: the title box is ~82% of the poster and a bold Fraunces letter is
// ~0.58em wide on average, so 0.58 / 0.82 per letter, rounded up a little for safety.
const FIT = 0.72;

export default function Poster({ movie, size = 'md' }) {
  const { lang } = usePrefs();
  const title = lang === 'en' ? movie.titleEn : movie.titleTr;
  const big = size === 'lg';
  const small = size === 'sm'; // list thumbnails: no room for the director's name
  // The longest word must fit on one line: the font size follows the poster's width (container
  // query unit cqi) divided by that word's length, capped for short titles. Long words carry a
  // soft hyphen (U+00AD) in the data, so "Muayene-hanesi" counts as two shorter parts.
  const longestPart = Math.max(4, ...title.split(/[\s\u00ad]+/).map((part) => part.length));
  const fontSize = `min(${big ? 3.4 : 2}rem, calc(100cqi / ${(longestPart * FIT).toFixed(2)}))`;

  return (
    <div
      className="poster relative flex aspect-[2/3] flex-col overflow-hidden rounded-md p-[4%] shadow-lg shadow-black/30"
      style={{ '--paper': movie.posterPaper, '--poster-ink': movie.posterInk, containerType: 'inline-size' }}
      role="img"
      aria-label={`${title}, ${movie.year}`}
    >
      <div className="poster-frame flex flex-1 flex-col justify-between gap-2 rounded-sm px-[5%] py-[7%]">
        <p className="text-[0.6rem] font-semibold uppercase leading-snug tracking-[0.22em] opacity-80">{small ? '' : movie.director}</p>
        <h3
          className="font-semibold leading-[0.98] tracking-tight"
          style={{ fontSize, fontVariationSettings: '"SOFT" 50, "WONK" 1', overflowWrap: 'break-word' }}
          lang={lang}
        >
          {title}
        </h3>
        <div className="flex items-end justify-between text-xs">
          <span className="font-semibold tracking-widest">{movie.year}</span>
          <span className="opacity-70">{movie.runtimeMin}′</span>
        </div>
      </div>
    </div>
  );
}
