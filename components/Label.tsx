import React from 'react';

type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

export function Label({ children, className = '', ...props }: LabelProps) {
  return (
    <label
      className={`block text-sm font-medium text-slate-700 mb-2 ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}