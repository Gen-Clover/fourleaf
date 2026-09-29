const TONES = {
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  gray: "bg-neutral-100 text-neutral-700",
};

export function StatusBadgeClient({ label, tone }: { label: string; tone: keyof typeof TONES }) {
  return <span className={`badge ${TONES[tone]}`}>{label}</span>;
}
