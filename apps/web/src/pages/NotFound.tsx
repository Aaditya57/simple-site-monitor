import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <h1 className="text-7xl font-bold text-muted mb-4">404</h1>
        <p className="text-xl text-muted-foreground mb-6">Page not found</p>
        <Link to="/" className="text-primary hover:underline">
          Go home →
        </Link>
      </div>
    </div>
  );
}
