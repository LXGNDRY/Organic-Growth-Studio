"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Target, Activity, Settings, LogOut, Menu, X, Zap } from "lucide-react";
import { useAuthStore } from "@/store/auth";
import { cn } from "@/lib/utils";

const nav = [
  { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { name: "Accounts", href: "/dashboard/accounts", icon: Users },
  { name: "Targeting", href: "/dashboard/targeting", icon: Target },
  { name: "Activity", href: "/dashboard/activity", icon: Activity },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, tenant, isAuthenticated, logout } = useAuthStore();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = localStorage.getItem("access_token");
    if (!t) router.push("/auth/signin");
  }, [router, isAuthenticated]);

  function handleLogout() {
    const rt = localStorage.getItem("refresh_token") || "";
    if (rt) { import("@/lib/api").then(({ signOut }) => signOut(rt)); }
    logout(); router.push("/");
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {open && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0", open ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
            <Link href="/dashboard" className="text-xl font-bold bg-gradient-to-r from-fuchsia-500 to-pink-500 bg-clip-text text-transparent">Instagro</Link>
            <button className="lg:hidden p-2 text-gray-500" onClick={() => setOpen(false)}><X className="w-5 h-5" /></button>
          </div>
          <nav className="flex-1 px-3 py-4 space-y-1">
            {nav.map(item => {
              const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
              return (
                <Link key={item.name} href={item.href} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium", active ? "bg-fuchsia-50 text-fuchsia-700" : "text-gray-700 hover:bg-gray-100")} onClick={() => setOpen(false)}>
                  <item.icon className="w-5 h-5" />{item.name}
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t border-gray-200">
            {tenant && <div className="mb-3 p-3 bg-gray-50 rounded-lg"><p className="text-xs text-gray-500">Plan</p><p className="text-sm font-medium text-gray-900 capitalize">{tenant.plan_tier}</p></div>}
            <button onClick={handleLogout} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"><LogOut className="w-5 h-5" />Sign out</button>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 bg-white border-b border-gray-200">
          <div className="flex items-center justify-between h-16 px-4 lg:px-8">
            <button className="lg:hidden p-2 text-gray-500" onClick={() => setOpen(true)}><Menu className="w-5 h-5" /></button>
            <div className="flex-1" />
            <div className="flex items-center gap-4">
              <span className="hidden sm:flex items-center gap-2 text-sm text-gray-600"><Zap className="w-4 h-4 text-fuchsia-500" />{tenant?.plan_tier || "Starter"} plan</span>
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-400 to-pink-500 flex items-center justify-center text-white text-sm font-medium">{user?.first_name?.[0] || user?.email?.[0]?.toUpperCase() || "U"}</div>
            </div>
          </div>
        </header>
        <main className="p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
