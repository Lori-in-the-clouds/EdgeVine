export type StatusTone = "healthy" | "warning" | "offline" | "no-data";

export type StatusPillProps = {
  status: StatusTone;
  label?: string;
  className?: string;
};

const STATUS_LABELS: Record<StatusTone, string> = {
  healthy: "Ok",
  warning: "Warning",
  offline: "Offline",
  "no-data": "No data",
};

export function StatusPill({
  status,
  label,
  className = "",
}: StatusPillProps) {
  return (
    <span className={`vineyard-status-pill vineyard-status-pill--${status} ${className}`.trim()}>
      <span className="vineyard-status-pill__dot" aria-hidden="true" />
      <span>{label ?? STATUS_LABELS[status]}</span>
    </span>
  );
}
