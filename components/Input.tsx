import React from 'react';
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="w-full rounded-xl border border-slate-300 px-3 py-2" {...props} />;
}