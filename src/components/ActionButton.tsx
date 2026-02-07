type ActionButtonProps = {
  label: string;
  onClick: () => void | Promise<void>;
};

export function ActionButton({ label, onClick }: ActionButtonProps) {
  return (
    <button onClick={onClick}>
      {label}
    </button>
  );
}
