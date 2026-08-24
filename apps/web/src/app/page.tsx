import Link from "next/link";
import { Zap, Shield, Eye, BarChart3 } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-950 text-white">
      <nav className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="text-xl font-bold bg-gradient-to-r from-fuchsia-400 to-pink-500 bg-clip-text text-transparent">Instagro</div>
          <div className="flex items-center gap-4">
            <Link href="/auth/signin" className="text-sm text-gray-300 hover:text-white">Sign in</Link>
            <Link href="/auth/signup" className="text-sm bg-fuchsia-600 hover:bg-fuchsia-500 px-4 py-2 rounded-lg font-medium">Start free</Link>
          </div>
        </div>
      </nav>
      <section className="max-w-7xl mx-auto px-6 py-24 text-center">
        <div className="inline-block px-4 py-1.5 mb-6 text-xs font-medium bg-fuchsia-500/20 text-fuchsia-300 rounded-full border border-fuchsia-500/30">Transparent Instagram growth — no black boxes</div>
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-6">
          Grow your Instagram{" "}
          <span className="bg-gradient-to-r from-fuchsia-400 via-pink-500 to-purple-500 bg-clip-text text-transparent">the right way</span>
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-10">Safety-first automation with full visibility. See every action, understand the risk, build a real engaged audience.</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/auth/signup" className="bg-fuchsia-600 hover:bg-fuchsia-500 px-8 py-3 rounded-lg font-semibold">Start 7-day free trial</Link>
          <Link href="#features" className="border border-white/20 hover:bg-white/10 px-8 py-3 rounded-lg font-medium">Learn more</Link>
        </div>
      </section>
      <section id="features" className="max-w-7xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { icon: Eye, title: "Full transparency", desc: "Every action is logged and visible. No hidden operations." },
            { icon: Shield, title: "Safety-first pacing", desc: "Smart warm-up periods and adaptive throttling keep your account safe." },
            { icon: BarChart3, title: "Quality scoring", desc: "Every gained follower is scored for realness and engagement." },
            { icon: Zap, title: "AI targeting", desc: "Our AI finds the users most likely to engage with your content." },
          ].map((f) => (
            <div key={f.title} className="p-6 bg-white/5 rounded-xl border border-white/10 hover:border-fuchsia-500/50 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-fuchsia-500/20 flex items-center justify-center mb-4"><f.icon className="w-6 h-6 text-fuchsia-400" /></div>
              <h3 className="font-semibold text-lg mb-2">{f.title}</h3>
              <p className="text-gray-400 text-sm">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-white/10 mt-24">
        <div className="max-w-7xl mx-auto px-6 py-8 text-center text-gray-500 text-sm">© 2024 Instagro. Built with transparency in mind.</div>
      </footer>
    </div>
  );
}
