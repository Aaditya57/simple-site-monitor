import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios, { AxiosError } from "axios";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirm) {
      return setError("Passwords do not match");
    }
    setError("");
    setLoading(true);
    try {
      await axios.post("/api/auth/signup", {
        fullName: form.fullName,
        email: form.email,
        password: form.password,
        captchaToken: "dev-bypass", // Replace with actual captcha widget token
      });
      navigate("/verify-email-pending");
    } catch (err) {
      setError(
        (err as AxiosError<{ error: string }>).response?.data?.error ?? "Signup failed"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md bg-white rounded-xl border shadow-sm p-8">
        <h1 className="text-2xl font-bold mb-1">Create an account</h1>
        <p className="text-muted-foreground text-sm mb-6">
          Free to use. Admin approval required after sign-up.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-md">{error}</div>
        )}

        <form onSubmit={submit} className="space-y-4">
          {(
            [
              { label: "Full Name", key: "fullName", type: "text", placeholder: "Jane Doe" },
              { label: "Email", key: "email", type: "email", placeholder: "you@example.com" },
              { label: "Password", key: "password", type: "password", placeholder: "Min 10 chars, 1 letter + 1 number" },
              { label: "Confirm Password", key: "confirm", type: "password", placeholder: "" },
            ] as const
          ).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-sm font-medium mb-1">{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={set(key)}
                required
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={placeholder}
              />
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
