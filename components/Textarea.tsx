import React from 'react';
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="w-full rounded-xl border border-slate-300 px-3 py-2 min-h-24" {...props} />;
}