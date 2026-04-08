import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Addams Mansion Pinball',
  description: 'A gothic pinball game',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0, background: '#050008' }}>
        {children}
      </body>
    </html>
  );
}
