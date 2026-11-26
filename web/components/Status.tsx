export function Status({ value }: { value: string }) {
  return (
    <span className={`badge badge-${value.toLowerCase()}`} data-testid="status">
      {value}
    </span>
  );
}

export function Alert({ message, kind = 'error' }: { message: string | null; kind?: 'error' | 'success' }) {
  if (!message) return null;
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`alert alert-${kind}`}>
      {message}
    </p>
  );
}
