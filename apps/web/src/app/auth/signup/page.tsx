"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signUp } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

export default function SignUp() {
  const router = useRouter();
  const { setUser, setTenant } = useAuthStore();
  const [form, setForm] = useState({ email: "", password: "", firstName: "", lastName: "", companyName: "" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function h(field: string) { return (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [field]: e.target.value }); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      const r = await signUp(form);
      setUser(r.user); setTenant(r.tenant); router.push("/dashboard");
    } catch (err: any) { setError(err.message || "Sign up failed"); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="text-2xl font-bold bg-gradient-to-r from-fuchsia-500 to-pink-500 bg-clip-text text-transparent">Instagro</Link>
          <h1 className="mt-6 text-3xl font-bold text-gray-900">Create account</h1>
          <p className="mt-2 text-gray-600">Start your 7-day free trial</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
                <input type="text" value={form.firstName} onChange={h("firstName")} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" placeholder="John" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
                <input type="text" value={form.lastName} onChange={h("lastName")} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" placeholder="Doe" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company / Brand</label>
              <input type="text" value={form.companyName} onChange={h("companyName")} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" placeholder="Your brand" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={h("email")} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" placeholder="you@example.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input type="password" value={form.password} onChange={h("password")} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" minLength={8} placeholder="••••••••" required />
              <p className="mt-1 text-xs text-gray-500">Minimum 8 characters</p>
            </div>
            <button type="submit" disabled={loading} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-lg">{loading ? "Creating account..." : "Create account"}</button>
          </form>
          <p className="mt-6 text-center text-sm text-gray-600">Already have an account?{" "}<Link href="/auth/signin" className="text-fuchsia-600 hover:text-fuchsia-500 font-medium">Sign in</Link></p>
        </div>
      </div>
    </div>
  );
}
