import { cn } from "@/lib/utils";

const TONES = {
  accent: "bg-accent",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
  ink: "bg-ink",
};

/** A proportional bar; CSS handles motion without loading the chart runtime. */
export function ProgressTrack({ label, value, tone = "accent", className, height = "h-1.5", animate = true }: {
  label?: string;
  /** 0–100. */
  value: number;
  tone?: keyof typeof TONES;
  className?: string;
  height?: string;
  animate?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-surface-sunken", height, className)}
      role="progressbar" aria-label={label} aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn("h-full rounded-full", TONES[tone], animate && "progress-fill")}
        style={{ width: `${clamped}%` }} />
    </div>
  );
}
