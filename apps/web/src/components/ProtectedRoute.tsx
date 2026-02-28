import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/lib/authStore";

export function ProtectedRoute() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (user.status === "suspended") return <Navigate to="/suspended" replace />;
  if (user.status === "pending" || user.status === "unverified") {
    return <Navigate to="/pending" replace />;
  }
  if (user.status !== "approved" && user.role !== "admin") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
