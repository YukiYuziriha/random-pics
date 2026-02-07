type ActionButtonProps = {
  label: string;
  onClick: () => void | Promise<void>;
};

export function ActionButton({ label, onClick }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      style={{
        background: '#24283b',
        color: '#c0caf5',
        border: '1px solid #565f89',
        borderRadius: '2px',
        fontFamily: 'monospace',
        fontSize: '12px',
        letterSpacing: '0.04em',
        padding: '5px 8px',
        minHeight: '28px',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );
}
