import { useNavigate, Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { monitorsApi, MonitorInput } from "@/lib/api";
import { Navbar } from "@/components/Navbar";
import { MonitorForm } from "@/components/MonitorForm";

export default function MonitorNew() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: MonitorInput) => monitorsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["monitors"] });
      navigate("/dashboard");
    },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to dashboard
          </Link>
          <h1 className="text-2xl font-bold mt-2">Add Monitor</h1>
        </div>
        {mutation.error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">
            {(mutation.error as Error).message}
          </div>
        )}
        <div className="bg-white rounded-xl border p-6">
          <MonitorForm
            onSubmit={async (data) => { await mutation.mutateAsync(data); }}
            isLoading={mutation.isPending}
            submitLabel="Create Monitor"
          />
        </div>
      </main>
    </div>
  );
}
