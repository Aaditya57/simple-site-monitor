import { useForm } from "react-hook-form";
import { MonitorInput } from "@/lib/api";

interface Props {
  defaultValues?: Partial<MonitorInput>;
  onSubmit: (data: MonitorInput) => Promise<void>;
  isLoading?: boolean;
  submitLabel?: string;
}

export function MonitorForm({
  defaultValues,
  onSubmit,
  isLoading,
  submitLabel = "Save Monitor",
}: Props) {
  const { register, handleSubmit, watch, formState: { errors } } = useForm<MonitorInput>({
    defaultValues: {
      intervalMinutes: 10,
      timeoutSeconds: 10,
      expectedStatus: "2xx_3xx",
      tlsCheckEnabled: true,
      tlsWarnDays: 10,
      keywordCaseInsensitive: false,
      dnsCheckEnabled: false,
      ...defaultValues,
    },
  });

  const url = watch("url");
  const isHttps = url?.startsWith("https://");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1">Monitor Name</label>
        <input
          {...register("name", { required: "Name is required" })}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="My Website"
        />
        {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
      </div>

      {/* URL */}
      <div>
        <label className="block text-sm font-medium mb-1">URL</label>
        <input
          {...register("url", {
            required: "URL is required",
            pattern: {
              value: /^https?:\/\/.+/,
              message: "URL must start with http:// or https://",
            },
          })}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="https://example.com"
        />
        {errors.url && <p className="text-destructive text-xs mt-1">{errors.url.message}</p>}
      </div>

      {/* Interval */}
      <div>
        <label className="block text-sm font-medium mb-1">Check Interval</label>
        <select
          {...register("intervalMinutes", { valueAsNumber: true })}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value={1}>Every 1 minute</option>
          <option value={5}>Every 5 minutes</option>
          <option value={10}>Every 10 minutes</option>
          <option value={15}>Every 15 minutes</option>
          <option value={30}>Every 30 minutes</option>
        </select>
      </div>

      {/* Timeout */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Request Timeout (seconds)
        </label>
        <input
          type="number"
          min={5}
          max={30}
          {...register("timeoutSeconds", { valueAsNumber: true })}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Expected status */}
      <div>
        <label className="block text-sm font-medium mb-1">Expected HTTP Status</label>
        <select
          {...register("expectedStatus")}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="2xx_3xx">Any 2xx or 3xx (default)</option>
          <option value="2xx">Any 2xx only</option>
          <option value="200">200 OK exactly</option>
        </select>
      </div>

      {/* Keyword check */}
      <div className="space-y-2">
        <label className="block text-sm font-medium">Keyword Check (optional)</label>
        <input
          {...register("keyword")}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Expected text in the response body"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...register("keywordCaseInsensitive")} />
          Case-insensitive match
        </label>
      </div>

      {/* TLS check */}
      {isHttps && (
        <div className="space-y-2 p-4 bg-muted rounded-lg">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" {...register("tlsCheckEnabled")} />
            TLS Certificate Check
          </label>
          <div>
            <label className="block text-sm text-muted-foreground mb-1">
              Warn when cert expires within (days)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              {...register("tlsWarnDays", { valueAsNumber: true })}
              className="w-32 border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>
      )}

      {/* DNS check */}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register("dnsCheckEnabled")} />
        DNS Check (verify hostname resolves)
      </label>

      {/* Additional emails */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Additional Alert Emails (comma-separated, optional)
        </label>
        <input
          {...register("additionalEmails", {
            setValueAs: (v: string) =>
              v ? v.split(",").map((e) => e.trim()).filter(Boolean) : [],
          })}
          className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="team@example.com, ops@example.com"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading}
        className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {isLoading ? "Saving..." : submitLabel}
      </button>
    </form>
  );
}
