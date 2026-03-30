import React from 'react';

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline';
};

export function Button({ variant = 'default', className = '', ...props }: Props) {
  const base = 'px-4 py-2 rounded-2xl text-sm font-medium transition';
  const styles = variant === 'outline'
    ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
    : 'bg-[#10472f] text-white hover:opacity-90';
  return <button className={`${base} ${styles} ${className}`} {...props} />;
}