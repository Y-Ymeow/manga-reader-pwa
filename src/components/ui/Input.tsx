interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'password' | 'email' | 'number';
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
}

export function Input({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  disabled = false,
  className = '',
  autoFocus = false,
}: InputProps) {
  return (
    <input
      type={type}
      value={value}
      onInput={(e) => onChange((e.target as HTMLInputElement).value)}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      class={`
        w-full px-4 py-2
        bg-[#16213e] border border-[#2a2a4a] rounded-lg
        text-white placeholder-gray-500
        focus:outline-none focus:ring-2 focus:ring-[#e94560] focus:border-transparent
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    />
  );
}
