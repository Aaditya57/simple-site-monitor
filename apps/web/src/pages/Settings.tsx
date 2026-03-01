import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";
import api from "@/lib/api";
import { Navbar } from "@/components/Navbar";

export default function Settings() {
  const qc = useQueryClient();
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => api.get("/api/me").then((r) => r.data) });

  const [fullName, setFullName] = useState(me?.fullName ?? "");
  const [nameMsg, setNameMsg] = useState("");

  const [pw, setPw] = useState({ current: "", new: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");

  const updateName = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.put("/api/me", { fullName });
    setNameMsg("Name updated.");
    qc.invalidateQueries({ queryKey: ["me"] });
  };

  const updatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwErr("");
    if (pw.new !== pw.confirm) return setPwErr("Passwords do not match");
    try {
      await api.put("/api/me/password", { currentPassword: pw.current, newPassword: pw.new });
      setPwMsg("Password updated. Please log in again.");
    } catch (err) {
      setPwErr((err as AxiosError<{ error: string }>).response?.data?.error ?? "Failed");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Profile */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Profile</h2>
          <form onSubmit={updateName} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                value={me?.email ?? ""}
                disabled
                className="w-full border rounded-md px-3 py-2 text-sm bg-muted text-muted-foreground"
              />
            </div>
            {nameMsg && <p className="text-green-600 text-sm">{nameMsg}</p>}
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm hover:opacity-90"
            >
              Save
            </button>
          </form>
        </div>

        {/* Change password */}
        <div className="bg-white rounded-xl border p-6">
          <h2 className="font-semibold mb-4">Change Password</h2>
          <form onSubmit={updatePassword} className="space-y-4">
            {["current", "new", "confirm"].map((k) => (
              <div key={k}>
                <label className="block text-sm font-medium mb-1 capitalize">
                  {k === "confirm" ? "Confirm new password" : `${k} password`}
                </label>
                <input
                  type="password"
                  value={pw[k as keyof typeof pw]}
                  onChange={(e) => setPw((p) => ({ ...p, [k]: e.target.value }))}
                  required
                  className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            ))}
            {pwErr && <p className="text-destructive text-sm">{pwErr}</p>}
            {pwMsg && <p className="text-green-600 text-sm">{pwMsg}</p>}
            <button
              type="submit"
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm hover:opacity-90"
            >
              Update Password
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
