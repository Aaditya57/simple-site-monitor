import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useAuthStore } from "@/lib/authStore";

export function Navbar() {
  const { user, clearAuth } = useAuthStore();
  const navigate = useNavigate();

  const logout = async () => {
    await axios.post("/api/auth/logout", {}, { withCredentials: true }).catch(() => {});
    clearAuth();
    navigate("/login");
  };

  return (
    <nav className="border-b bg-white">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to="/dashboard" className="font-bold text-primary text-lg">
          Uptime Monitor
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {user?.role === "admin" && (
            <Link to="/admin" className="text-muted-foreground hover:text-foreground">
              Admin
            </Link>
          )}
          <Link to="/settings" className="text-muted-foreground hover:text-foreground">
            Settings
          </Link>
          <button
            onClick={logout}
            className="text-muted-foreground hover:text-foreground"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
