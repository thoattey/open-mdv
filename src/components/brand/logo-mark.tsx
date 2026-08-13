import { cn } from '@/lib/utils';

/**
 * The Raajje Atlas mark: a broken reef ring around a lagoon — an atoll seen
 * from above, which doubles as a map pin. Inherits `currentColor`, so it takes
 * the surrounding text colour in both themes.
 */
export function LogoMark({ className, ...props }: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn('size-5', className)}
      {...props}
    >
      <circle
        cx="16"
        cy="16"
        r="11"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="16 4 10 5 14 4 12.115 4"
        transform="rotate(-18 16 16)"
      />
      <circle cx="16" cy="16" r="3.75" fill="currentColor" />
    </svg>
  );
}
