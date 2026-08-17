import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';

// The business register shares the /grid terminal treatment, so it loads the
// same monospace face rather than the app-wide Inter.
const mono = JetBrains_Mono({
  variable: '--font-mx',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'RAAJJE//BUSINESS',
  description: 'Terminal console for the Maldives business register — companies, permits, officers.',
};

export default function BusinessLayout({ children }: LayoutProps<'/business'>) {
  return <div className={mono.variable}>{children}</div>;
}
