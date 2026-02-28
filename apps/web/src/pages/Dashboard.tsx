import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { monitorsApi, Monitor } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { StatusBadge } from "@/components/StatusBadge";

type Filter = "all" | "up" | "down" | "paused";

export default function Dashboard() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ["monitors"],
    queryFn: monitorsApi.list,
    refetchInterval: 30_000,
  });

  const pause = useMutation({
    mutationFn: (id: string) => monitorsApi.pause(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitors"] }),
  });
  const resume = useMutation({
    mutationFn: (id: string) => monitorsApi.resume(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitors"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => monitorsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitors"] }),
  });

  const filtered = monitors.filter((m) => {
    if (filter === "up") return m.currentStatus === "UP" && !m.isPaused;
    if (filter === "down") return m.currentStatus === "DOWN";
    if (filter === "paused") return m.isPaused;
    return true;
  });

  const tlsExpiring = monitors.filter(
    (m) => m.lastLatencyMs !== null && m.currentStatus === "UP"
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Monitors</h1>
            <p className="text-muted-foreground text-sm mt-0.5">
              {monitors.length} monitor{monitors.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <Link
            to="/monitors/new"
            className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
          >
            + Add Monitor
          </Link>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          {(["all", "up", "down", "paused"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize ${
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "bg-white border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="py-20 text-center text-muted-foreground">Loading...</div>
        ) : monitors.length === 0 ? (
          <div className="py-20 text-center">
            <p className="text-muted-foreground mb-4">You have no monitors yet.</p>
            <Link
              to="/monitors/new"
              className="bg-primary text-primary-foreground px-6 py-2 rounded-md text-sm font-medium hover:opacity-90"
            >
              Add your first monitor →
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Name", "Status", "Last Check", "Latency", "Interval", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((m) => (
                  <MonitorRow
                    key={m.id}
                    monitor={m}
                    onPause={() => pause.mutate(m.id)}
                    onResume={() => resume.mutate(m.id)}
                    onDelete={() => {
                      if (confirm(`Delete "${m.name}"?`)) remove.mutate(m.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function MonitorRow({
  monitor: m,
  onPause,
  onResume,
  onDelete,
}: {
  monitor: Monitor;
  onPause: () => void;
  onResume: () => void;
  onDelete: () => void;
}) {
  const displayStatus = m.isPaused ? "PAUSED" : m.currentStatus;
  return (
    <tr className="hover:bg-muted/30">
      <td className="px-4 py-3">
        <Link to={`/monitors/${m.id}`} className="font-medium hover:text-primary">
          {m.name}
        </Link>
        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{m.url}</p>
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={displayStatus} />
      </td>
      <td className="px-4 py-3 text-muted-foreground text-xs">
        {m.lastCheckedAt
          ? formatDistanceToNow(new Date(m.lastCheckedAt), { addSuffix: true })
          : "Never"}
      </td>
      <td className="px-4 py-3 text-xs">
        {m.lastLatencyMs !== null ? `${m.lastLatencyMs}ms` : "—"}
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">
        {m.intervalMinutes}m
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2">
          <Link
            to={`/monitors/${m.id}/edit`}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Edit
          </Link>
          {m.isPaused ? (
            <button onClick={onResume} className="text-xs text-green-600 hover:text-green-700">
              Resume
            </button>
          ) : (
            <button onClick={onPause} className="text-xs text-muted-foreground hover:text-foreground">
              Pause
            </button>
          )}
          <button onClick={onDelete} className="text-xs text-destructive hover:opacity-80">
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}
