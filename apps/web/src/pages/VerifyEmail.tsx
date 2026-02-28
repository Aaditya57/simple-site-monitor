import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "axios";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setState("error");
      setMessage("Missing verification token.");
      return;
    }
    axios
      .get(`/api/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then((r) => { setState("success"); setMessage(r.data.message); })
      .catch((e) => { setState("error"); setMessage(e.response?.data?.error ?? "Verification failed."); });
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center bg-white rounded-xl border shadow-sm p-10">
        {state === "loading" && <p className="text-muted-foreground">Verifying...</p>}
        {state === "success" && (
          <>
            <h1 className="text-2xl font-bold text-green-700 mb-2">Email verified!</h1>
            <p className="text-muted-foreground text-sm mb-4">{message}</p>
            <Link to="/pending" className="text-primary hover:underline text-sm">
              View account status →
            </Link>
          </>
        )}
        {state === "error" && (
          <>
            <h1 className="text-2xl font-bold text-destructive mb-2">Verification failed</h1>
            <p className="text-muted-foreground text-sm mb-4">{message}</p>
            <Link to="/login" className="text-primary hover:underline text-sm">
              Back to login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
