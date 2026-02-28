import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { adminApi } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { StatusBadge } from "@/components/StatusBadge";

type Tab = "users" | "monitors" | "health" | "audit";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("users");
  const [statusFilter, setStatusFilter] = useState("pending");

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Admin Panel</h1>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b">
          {(["users", "monitors", "health", "audit"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium capitalize -mb-px border-b-2 transition-colors ${
                tab === t
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "audit" ? "Audit Log" : t}
            </button>
          ))}
        </div>

        {tab === "users" && <UsersTab statusFilter={statusFilter} setStatusFilter={setStatusFilter} />}
        {tab === "monitors" && <MonitorsTab />}
        {tab === "health" && <HealthTab />}
        {tab === "audit" && <AuditTab />}
      </main>
    </div>
  );
}

function UsersTab({
  statusFilter,
  setStatusFilter,
}: {
  statusFilter: string;
  setStatusFilter: (s: string) => void;
}) {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin", "users", statusFilter],
    queryFn: () => adminApi.users(statusFilter || undefined),
  });

  const approve = useMutation({
    mutationFn: (id: string) => adminApi.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => adminApi.reject(id, reason),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
  const suspend = useMutation({
    mutationFn: (id: string) => adminApi.suspend(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "users"] }),
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        {["pending", "approved", "rejected", "suspended", ""].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize ${
              statusFilter === s
                ? "bg-primary text-primary-foreground"
                : "bg-white border text-muted-foreground hover:text-foreground"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading...</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                {["Email", "Name", "Status", "Verified", "Joined", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 text-sm">{u.email}</td>
                  <td className="px-4 py-3 text-sm text-muted-foreground">{u.fullName}</td>
                  <td className="px-4 py-3">
                    <span className="text-xs capitalize">{u.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs">{u.emailVerified ? "✓" : "✗"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {format(new Date(u.createdAt), "MMM d, yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {u.status === "pending" && (
                        <>
                          <button
                            onClick={() => approve.mutate(u.id)}
                            className="text-xs text-green-600 hover:text-green-700 font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const reason = prompt("Rejection reason (optional):");
                              reject.mutate({ id: u.id, reason: reason ?? undefined });
                            }}
                            className="text-xs text-red-500 hover:text-red-600"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      {u.status === "approved" && (
                        <button
                          onClick={() => {
                            if (confirm(`Suspend ${u.email}?`)) suspend.mutate(u.id);
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Suspend
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MonitorsTab() {
  const { data: monitors = [], isLoading } = useQuery({
    queryKey: ["admin", "monitors"],
    queryFn: adminApi.monitors,
  });

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading...</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Name", "URL", "Status", "Interval", "Created"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {monitors.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3">{m.name}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{m.url}</td>
                <td className="px-4 py-3"><StatusBadge status={m.isPaused ? "PAUSED" : m.currentStatus} /></td>
                <td className="px-4 py-3 text-xs">{m.intervalMinutes}m</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {format(new Date(m.createdAt), "MMM d, yyyy")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function HealthTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "health"],
    queryFn: adminApi.health,
    refetchInterval: 30_000,
  });

  if (isLoading) return <div className="py-10 text-center text-muted-foreground">Loading...</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatCard
        title="Worker Status"
        value={data?.worker?.alive ? "Online" : "Offline"}
        sub={data?.worker?.lastHeartbeatAt
          ? `Last beat: ${format(new Date(data.worker.lastHeartbeatAt), "HH:mm:ss")}`
          : "No heartbeat"}
        ok={data?.worker?.alive}
      />
      <StatCard title="Total Monitors" value={data?.monitors?.total} />
      <StatCard title="Checks (24h)" value={data?.checks?.last24h} />
    </div>
  );
}

function StatCard({ title, value, sub, ok }: { title: string; value: unknown; sub?: string; ok?: boolean }) {
  return (
    <div className="bg-white rounded-xl border p-6">
      <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">{title}</p>
      <p className={`text-2xl font-bold ${ok === false ? "text-destructive" : ok === true ? "text-green-600" : ""}`}>
        {String(value ?? "—")}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function AuditTab() {
  const { data: log = [], isLoading } = useQuery({
    queryKey: ["admin", "audit"],
    queryFn: adminApi.auditLog,
  });

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      {isLoading ? (
        <div className="py-10 text-center text-muted-foreground">Loading...</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Time", "Action", "Target", "Reason"].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {(log as Array<{ id: string; action: string; targetUserId: string; reason: string; createdAt: string }>).map((entry) => (
              <tr key={entry.id}>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {format(new Date(entry.createdAt), "MMM d, HH:mm")}
                </td>
                <td className="px-4 py-3 text-xs font-medium capitalize">{entry.action}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{entry.targetUserId}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{entry.reason ?? "—"}</td>
              </tr>
            ))}
            {log.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No audit entries</td></tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
