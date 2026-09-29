import { useId } from "react";

const PETAL = "M0 0 C -20 -10, -34 -26, -28 -41 C -22 -56, 22 -56, 28 -41 C 34 -26, 20 -10, 0 0 Z";

/** The Gen Clover clover mark (one red petal, three silver), as on genclover.com. */
export function CloverMark({ className = "h-8 w-8" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="-72 -72 144 144" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`s${id}`} x1="0.1" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="var(--clover-1, #FFFFFF)" />
          <stop offset="50%" stopColor="var(--clover-2, #D2D5DC)" />
          <stop offset="100%" stopColor="var(--clover-3, #7E838C)" />
        </linearGradient>
        <linearGradient id={`a${id}`} x1="0.1" y1="0" x2="0.75" y2="1">
          <stop offset="0%" stopColor="#FF5F64" />
          <stop offset="50%" stopColor="#E01F26" />
          <stop offset="100%" stopColor="#8E0F14" />
        </linearGradient>
      </defs>
      <g transform="rotate(45)">
        <path d={PETAL} fill={`url(#a${id})`} />
        <path d={PETAL} fill={`url(#s${id})`} transform="rotate(90)" />
        <path d={PETAL} fill={`url(#s${id})`} transform="rotate(180)" />
        <path d={PETAL} fill={`url(#s${id})`} transform="rotate(270)" />
      </g>
    </svg>
  );
}

/** "GEN CLOVER" wordmark in the display face, with the red three-bar "E". */
export function Wordmark({ className = "text-base" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline font-display font-bold leading-none tracking-brand text-neutral-900 uppercase ${className}`}>
      <span className="sr-only">Gen Clover</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        GEN<span className="w-[0.34em]" />CLOV
        <svg viewBox="0 0 10 15" aria-hidden="true" focusable="false" className="h-[0.72em] w-[0.5em] shrink-0 text-[#E01F26]" style={{ marginInline: "0.07em" }} preserveAspectRatio="none">
          <rect y="0" width="10" height="3.4" rx="0.4" fill="currentColor" />
          <rect y="5.8" width="10" height="3.4" rx="0.4" fill="currentColor" />
          <rect y="11.6" width="10" height="3.4" rx="0.4" fill="currentColor" />
        </svg>
        R
      </span>
    </span>
  );
}
