import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-3xl shadow-xl border border-slate-200 ${className}`}>{children}</div>;
}
export function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="p-6 pb-0">{children}</div>;
}
export function CardTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-slate-900">{children}</h2>;
}
export function CardDescription({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500 mt-2">{children}</p>;
}
export function CardContent({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`p-6 ${className}`}>{children}</div>;
}