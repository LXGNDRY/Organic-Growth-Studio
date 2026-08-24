"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, TrendingUp, Activity, Shield, ArrowUpRight } from "lucide-react";
import { getAccounts, getEngagementStats } from "@/lib/api";
import { formatNumber, cn } from "@/lib/utils";

export default function DashboardOverview() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const { data: accounts, isLoading } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });

  const statsQuery = useQuery({
    queryKey: ["engagement-stats", accountId, "week"],
    queryFn: () => accountId ? getEngagementStats(accountId, "week") : null,
    enabled: !!accountId,
  });

  useEffect(() => { if (accounts && accounts.length > 0 && !accountId) setAccountId(accounts[0].id); }, [accounts, accountId]);

  const stats = statsQuery.data;

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Overview</h1><p className="text-gray-600 mt-1">Track your growth and engagement performance</p></div>

      {accounts && accounts.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {accounts.map((a: any) => (
            <button key={a.id} onClick={() => setAccountId(a.id)} className={cn("px-4 py-2 rounded-lg text-sm font-medium border transition-colors", accountId === a.id ? "bg-fuchsia-50 border-fuchsia-300 text-fuchsia-700" : "bg-white border-gray-200 text-gray-700 hover:border-gray-300")}>@{a.username}</button>
          ))}
        </div>
      )}

      {!isLoading && accounts && accounts.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Instagram accounts connected</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">Connect your first Instagram account to start growing your audience.</p>
          <button onClick={() => (window.location.href = "/dashboard/accounts")} className="bg-fuchsia-600 hover:bg-fuchsia-500 text-white px-6 py-2.5 rounded-lg font-medium">Connect account</button>
        </div>
      )}

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Actions" value={formatNumber(stats.total_actions)} icon={Activity} change={`${Math.round(stats.completion_rate * 100)}% completion`} type="positive" />
          <StatCard label="Follows" value={formatNumber(stats.follows)} icon={Users} change={`${(stats.follow_back_rate * 100).toFixed(1)}% follow back rate`} type="positive" />
          <StatCard label="Likes Sent" value={formatNumber(stats.likes)} icon={TrendingUp} change="From targeted accounts" type="neutral" />
          <StatCard label="Block Rate" value={`${(stats.blocked_rate * 100).toFixed(2)}%`} icon={Shield} change={stats.blocked_rate < 0.01 ? "Very low risk" : "Monitor closely"} type={stats.blocked_rate < 0.01 ? "positive" : "warning"} />
        </div>
      )}

      {accountId && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
          <p className="text-gray-500 text-sm">Full activity feed in the <a href="/dashboard/activity" className="text-fuchsia-600 hover:underline">Activity tab</a>.</p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon: Icon, change, type }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-start justify-between">
        <div><p className="text-sm text-gray-600">{label}</p><p className="text-2xl font-bold text-gray-900 mt-1">{value}</p></div>
        <div className="w-10 h-10 rounded-lg bg-fuchsia-50 flex items-center justify-center"><Icon className="w-5 h-5 text-fuchsia-600" /></div>
      </div>
      <div className={cn("flex items-center gap-1 mt-3 text-xs", type === "positive" && "text-green-600", type === "negative" && "text-red-600", type === "warning" && "text-yellow-600", type === "neutral" && "text-gray-500")}>
        {type === "positive" && <ArrowUpRight className="w-3.5 h-3.5" />}{change}
      </div>
    </div>
  );
}
