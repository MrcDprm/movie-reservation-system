export default function Alert({ type = 'error', children, onClose }) {
  const styles =
    type === 'success'
      ? 'border-neon-cyan/40 bg-neon-cyan/10 text-neon-cyan'
      : 'border-red-500/40 bg-red-500/10 text-red-300';

  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <p>{children}</p>
      {onClose && (
        <button type="button" onClick={onClose} className="opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  );
}
