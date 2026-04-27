import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hallux — AI-aware PR reviewer',
  description:
    'Hallux catches what generic PR reviewers miss: hallucinated imports, phantom tests, and fabricated method calls in AI-generated code.',
  openGraph: {
    title: 'Hallux — AI-aware PR reviewer',
    description: 'Your AI is writing code your AI cannot review.',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        {children}
      </body>
    </html>
  );
}
