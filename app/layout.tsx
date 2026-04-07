import './globals.css';
import type { Metadata } from 'next';
import { Prompt } from 'next/font/google';
import 'leaflet/dist/leaflet.css';

const prompt = Prompt({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Green Cities Audit Tool',
  description: 'MVP starter for the Green Cities Audit Tool',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={prompt.className}>{children}</body>
    </html>
  );
}