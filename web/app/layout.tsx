import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ERP Integration Lab',
  description: 'Leave management and warehouse stock with ERP synchronisation',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
