import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';

// The control console shares the /grid terminal treatment, so it loads the same
// monospace face rather than the app-wide Inter.
const mono = JetBrains_Mono({
  variable: '--font-mx',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'RAAJJE//CONTROL',
  description: 'Data control console — censor resident records from every public view.',
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return <div className={mono.variable}>{children}</div>;
}
