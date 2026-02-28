import { cn } from "@/lib/utils";

type Status = "UP" | "DOWN" | "PAUSED" | "UNKNOWN";

const config: Record<Status, { label: string; className: string }> = {
  UP: { label: "UP", className: "bg-green-100 text-green-800 border-green-200" },
  DOWN: { label: "DOWN", className: "bg-red-100 text-red-800 border-red-200" },
  PAUSED: { label: "PAUSED", className: "bg-gray-100 text-gray-600 border-gray-200" },
  UNKNOWN: { label: "UNKNOWN", className: "bg-yellow-100 text-yellow-800 border-yellow-200" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = (status as Status) in config ? (status as Status) : "UNKNOWN";
  const { label, className } = config[s];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border",
        className
      )}
    >
      {s === "UP" && <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5" />}
      {s === "DOWN" && <span className="w-1.5 h-1.5 rounded-full bg-red-500 mr-1.5" />}
      {label}
    </span>
  );
}
