// src/ui/Button.tsx
import React from 'react';
import { theme } from '@/theme';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'solid' | 'outline';
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

export default function Button({
  variant='solid',
  className='',
  leftIcon,
  rightIcon,
  children,
  ...p
}: Props) {
  const base = 'px-3 py-2 rounded-lg text-sm transition-transform hover:scale-[1.01] inline-flex items-center gap-2';
  const solid = `text-white shadow-sm bg-gradient-to-r from-[${theme.colors.primary}] to-[${theme.colors.secondary}]`;
  const outline = 'border bg-white hover:bg-slate-50';

  return (
    <button {...p} className={`${base} ${variant==='solid'?solid:outline} ${className}`}>
      {leftIcon && <span className="shrink-0">{leftIcon}</span>}
      <span className="truncate">{children}</span>
      {rightIcon && <span className="shrink-0">{rightIcon}</span>}
    </button>
  );
}
