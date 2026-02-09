type ActionButtonProps = {
  label: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
};

export function ActionButton({ label, onClick, disabled = false }: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
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
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {label}
    </button>
  );
}
