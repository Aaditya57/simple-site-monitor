import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow, format } from "date-fns";
import { monitorsApi, MonitorCheck } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { StatusBadge } from "@/components/StatusBadge";

export default function MonitorDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: monitor, isLoading: mLoading } = useQuery({
    queryKey: ["monitor", id],
    queryFn: () => monitorsApi.get(id!),
    refetchInterval: 30_000,
  });

  const { data: checks = [], isLoading: cLoading } = useQuery({
    queryKey: ["checks", id],
    queryFn: () => monitorsApi.checks(id!),
    refetchInterval: 30_000,
  });

  const pause = useMutation({
    mutationFn: () => monitorsApi.pause(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitor", id] }),
  });
  const resume = useMutation({
    mutationFn: () => monitorsApi.resume(id!),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["monitor", id] }),
  });
  const remove = useMutation({
    mutationFn: () => monitorsApi.delete(id!),
    onSuccess: () => navigate("/dashboard"),
  });

  if (mLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!monitor) return <div className="min-h-screen flex items-center justify-center">Monitor not found</div>;

  const displayStatus = monitor.isPaused ? "PAUSED" : monitor.currentStatus;
  const upCount = checks.filter((c) => c.status === "UP").length;
  const uptimePct = checks.length > 0 ? Math.round((upCount / checks.length) * 100) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Dashboard
          </Link>
        </div>

        <div className="bg-white rounded-xl border p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="text-2xl font-bold">{monitor.name}</h1>
                <StatusBadge status={displayStatus} />
              </div>
              <a
                href={monitor.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary hover:underline"
              >
                {monitor.url}
              </a>
              <div className="flex gap-6 mt-3 text-sm text-muted-foreground">
                <span>Every {monitor.intervalMinutes}m</span>
                {monitor.lastCheckedAt && (
                  <span>
                    Checked {formatDistanceToNow(new Date(monitor.lastCheckedAt), { addSuffix: true })}
                  </span>
                )}
                {monitor.lastLatencyMs !== null && <span>{monitor.lastLatencyMs}ms</span>}
                {uptimePct !== null && <span>{uptimePct}% uptime (last {checks.length})</span>}
                {monitor.currentStatus === "DOWN" && monitor.lastStatusChangedAt && (
                  <span className="text-red-600">
                    Down for {formatDistanceToNow(new Date(monitor.lastStatusChangedAt))}
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/monitors/${id}/edit`}
                className="px-3 py-1.5 border rounded-md text-xs hover:bg-muted"
              >
                Edit
              </Link>
              {monitor.isPaused ? (
                <button
                  onClick={() => resume.mutate()}
                  className="px-3 py-1.5 border rounded-md text-xs text-green-600 hover:bg-green-50"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={() => pause.mutate()}
                  className="px-3 py-1.5 border rounded-md text-xs hover:bg-muted"
                >
                  Pause
                </button>
              )}
              <button
                onClick={() => { if (confirm(`Delete "${monitor.name}"?`)) remove.mutate(); }}
                className="px-3 py-1.5 border border-destructive/30 rounded-md text-xs text-destructive hover:bg-destructive/5"
              >
                Delete
              </button>
            </div>
          </div>

          {/* Config chips */}
          <div className="flex flex-wrap gap-2 mt-4">
            {monitor.tlsCheckEnabled && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs">
                TLS check (warn at {monitor.tlsWarnDays}d)
              </span>
            )}
            {monitor.keyword && (
              <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded text-xs">
                Keyword: "{monitor.keyword}"
              </span>
            )}
            {monitor.dnsCheckEnabled && (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 rounded text-xs">
                DNS check
              </span>
            )}
          </div>
        </div>

        {/* Checks table */}
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="px-6 py-4 border-b">
            <h2 className="font-semibold">Check History</h2>
            <p className="text-xs text-muted-foreground">Last {checks.length} checks</p>
          </div>
          {cLoading ? (
            <div className="py-10 text-center text-muted-foreground">Loading...</div>
          ) : checks.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground">No checks yet</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  {["Time", "Status", "HTTP", "Latency", "TLS Days", "Keyword", "Error"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {checks.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}

function CheckRow({ check: c }: { check: MonitorCheck }) {
  return (
    <tr className={c.status === "DOWN" ? "bg-red-50/50" : ""}>
      <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">
        {format(new Date(c.checkedAt), "MMM d, HH:mm:ss")}
      </td>
      <td className="px-4 py-2">
        <StatusBadge status={c.status} />
      </td>
      <td className="px-4 py-2 text-xs">{c.httpStatusCode ?? "—"}</td>
      <td className="px-4 py-2 text-xs">{c.latencyMs !== null ? `${c.latencyMs}ms` : "—"}</td>
      <td className="px-4 py-2 text-xs">
        {c.tlsDaysRemaining !== null ? (
          <span className={c.tlsDaysRemaining <= 10 ? "text-red-600 font-medium" : ""}>
            {c.tlsDaysRemaining}d
          </span>
        ) : "—"}
      </td>
      <td className="px-4 py-2 text-xs">
        {c.keywordMatch === null ? "—" : c.keywordMatch ? "✓" : "✗"}
      </td>
      <td className="px-4 py-2 text-xs text-muted-foreground max-w-[200px] truncate">
        {c.errorType ?? "—"}
      </td>
    </tr>
  );
}
