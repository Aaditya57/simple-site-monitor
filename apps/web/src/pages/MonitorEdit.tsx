import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { monitorsApi, MonitorInput } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { MonitorForm } from "@/components/MonitorForm";

export default function MonitorEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: monitor, isLoading } = useQuery({
    queryKey: ["monitor", id],
    queryFn: () => monitorsApi.get(id!),
  });

  const mutation = useMutation({
    mutationFn: (data: Partial<MonitorInput>) => monitorsApi.update(id!, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitors"] });
      qc.invalidateQueries({ queryKey: ["monitor", id] });
      navigate(`/monitors/${id}`);
    },
  });

  if (isLoading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!monitor) return <div className="min-h-screen flex items-center justify-center">Monitor not found</div>;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to={`/monitors/${id}`} className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to monitor
          </Link>
          <h1 className="text-2xl font-bold mt-2">Edit Monitor</h1>
        </div>
        {mutation.error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
            {(mutation.error as Error).message}
          </div>
        )}
        <div className="bg-white rounded-xl border p-6">
          <MonitorForm
            defaultValues={{
              name: monitor.name,
              url: monitor.url,
              intervalMinutes: monitor.intervalMinutes,
              timeoutSeconds: monitor.timeoutSeconds,
              expectedStatus: monitor.expectedStatus,
              keyword: monitor.keyword ?? undefined,
              keywordCaseInsensitive: monitor.keywordCaseInsensitive,
              tlsCheckEnabled: monitor.tlsCheckEnabled,
              tlsWarnDays: monitor.tlsWarnDays,
              dnsCheckEnabled: monitor.dnsCheckEnabled,
              additionalEmails: monitor.additionalEmails,
            }}
            onSubmit={async (data) => { await mutation.mutateAsync(data); }}
            isLoading={mutation.isPending}
            submitLabel="Save Changes"
          />
        </div>
      </main>
    </div>
  );
}
