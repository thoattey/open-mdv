import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';

// The console is monospace end to end; the rest of the app stays on Inter, so
// the face is loaded here rather than in the root layout.
const mono = JetBrains_Mono({
  variable: '--font-mx',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
});

export const metadata: Metadata = {
  title: 'RAAJJE//GRID',
  description: 'Terminal console for filtering the Raajje Atlas address and resident registers.',
};

export default function GridLayout({ children }: LayoutProps<'/grid'>) {
  return <div className={mono.variable}>{children}</div>;
}
