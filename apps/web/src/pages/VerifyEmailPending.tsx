import { Link } from "react-router-dom";

export default function VerifyEmailPending() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md text-center bg-white rounded-xl border shadow-sm p-10">
        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-muted-foreground text-sm mb-6">
          We've sent a verification link to your email address. Click it to verify your account.
          The link expires in 24 hours.
        </p>
        <p className="text-xs text-muted-foreground">
          Didn't receive it?{" "}
          <Link to="/login" className="text-primary hover:underline">
            Try again
          </Link>
        </p>
      </div>
    </div>
  );
}
