import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <header className="max-w-6xl mx-auto px-4 py-6 flex justify-between items-center">
        <span className="font-bold text-xl text-primary">Uptime Monitor</span>
        <div className="flex gap-3">
          <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5">
            Log in
          </Link>
          <Link
            to="/signup"
            className="text-sm bg-primary text-primary-foreground px-4 py-1.5 rounded-md hover:opacity-90"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight text-foreground mb-6">
          Monitor your websites.
          <br />
          <span className="text-primary">Get alerted instantly.</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          Track HTTP uptime, TLS certificate expiry, keyword presence, and DNS health.
          Get email alerts the moment something goes wrong.
        </p>
        <Link
          to="/signup"
          className="inline-block bg-primary text-primary-foreground px-8 py-3 rounded-lg text-base font-semibold hover:opacity-90"
        >
          Start monitoring for free →
        </Link>

        <div className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
          {[
            { title: "HTTP & Latency", desc: "Monitor response codes and latency every 5–30 minutes." },
            { title: "TLS Expiry Alerts", desc: "Get warned days before your SSL certificate expires." },
            { title: "Keyword Checks", desc: "Verify your page contains expected content on every check." },
          ].map((f) => (
            <div key={f.title} className="p-6 bg-white rounded-xl border shadow-sm">
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
