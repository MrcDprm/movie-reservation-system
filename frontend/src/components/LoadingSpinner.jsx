export default function LoadingSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 animate-fade-in">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-silver-400/30 border-t-neon-cyan" />
      <p className="text-sm text-silver-400">{label}</p>
    </div>
  );
}
