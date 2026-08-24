"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pause, Play, AlertCircle } from "lucide-react";
import { getAccounts, getConnectUrl, pauseAccount, resumeAccount } from "@/lib/api";
import { statusColor, formatNumber } from "@/lib/utils";

export default function Accounts() {
  const qc = useQueryClient();
  const [connecting, setConnecting] = useState(false);
  const { data: accounts, isLoading } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });

  const connect = useMutation({ mutationFn: getConnectUrl, onSuccess: d => { window.location.href = d.auth_url; } });
  const pause = useMutation({ mutationFn: pauseAccount, onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }) });
  const resume = useMutation({ mutationFn: resumeAccount, onSuccess: () => qc.invalidateQueries({ queryKey: ["accounts"] }) });

  async function handleConnect() {
    setConnecting(true);
    try { await connect.mutateAsync(); } finally { setConnecting(false); }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Instagram Accounts</h1><p className="text-gray-600 mt-1">Manage your connected Instagram accounts</p></div>
        <button onClick={handleConnect} disabled={connecting} className="flex items-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg font-medium"><Plus className="w-4 h-4" />{connecting ? "Connecting..." : "Connect Account"}</button>
      </div>

      {isLoading ? <div className="text-gray-600">Loading accounts...</div> : accounts && accounts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <div className="w-16 h-16 rounded-full bg-fuchsia-50 flex items-center justify-center mx-auto mb-4"><Plus className="w-8 h-8 text-fuchsia-600" /></div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No accounts connected yet</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">Connect your first Instagram account to start growing your audience with safe, transparent automation.</p>
          <button onClick={handleConnect} disabled={connecting} className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium">{connecting ? "Connecting..." : "Connect Instagram Account"}</button>
        </div>
      ) : (
        <div className="grid gap-4">
          {accounts?.map((a: any) => (
            <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {a.avatar_url ? <img src={a.avatar_url} alt={a.username} className="w-12 h-12 rounded-full" /> : <div className="w-12 h-12 rounded-full bg-gray-200" />}
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900">@{a.username}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColor(a.status)}`}>{a.status.replace("_", " ")}</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                      <span>{formatNumber(a.follower_count)} followers</span>
                      <span>{formatNumber(a.following_count)} following</span>
                      {a.risk_level && <span className="flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" />Risk: {a.risk_level}</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {a.status === "paused" ? (
                    <button onClick={() => resume.mutate(a.id)} disabled={resume.isPending} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"><Play className="w-4 h-4" />Resume</button>
                  ) : (
                    <button onClick={() => pause.mutate(a.id)} disabled={pause.isPending} className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"><Pause className="w-4 h-4" />Pause</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
