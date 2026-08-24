"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAccounts, getTargetingConfig, updateTargetingConfig } from "@/lib/api";

export default function Targeting() {
  const qc = useQueryClient();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [form, setForm] = useState<any>(null);
  const [saved, setSaved] = useState(false);

  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  const { data: config, isLoading } = useQuery({
    queryKey: ["targeting", accountId], queryFn: () => accountId ? getTargetingConfig(accountId) : null, enabled: !!accountId,
  });

  const update = useMutation({
    mutationFn: (data: any) => accountId ? updateTargetingConfig(accountId, data) : null,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["targeting", accountId] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  useEffect(() => { if (config && !form) setForm(config); }, [config, form]);
  if (accounts && accounts.length > 0 && !accountId) setAccountId(accounts[0].id);

  if (!accountId) return <div className="space-y-6"><h1 className="text-2xl font-bold text-gray-900">Targeting</h1><p className="text-gray-600">Connect an account first.</p></div>;

  function h(field: string, val: any) { setForm({ ...form, [field]: val }); }
  function hArr(field: string, text: string) { setForm({ ...form, [field]: text.split("\n").filter(Boolean) }); }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); if (form) update.mutate(form); }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Targeting</h1><p className="text-gray-600 mt-1">Define your ideal audience</p></div>
        {accounts && accounts.length > 1 && (
          <select value={accountId} onChange={e => { setAccountId(e.target.value); setForm(null); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {accounts.map((a: any) => <option key={a.id} value={a.id}>@{a.username}</option>)}
          </select>
        )}
      </div>

      {isLoading ? <div className="text-gray-600">Loading...</div> : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Audience Sources</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Competitor Accounts</label>
              <p className="text-sm text-gray-500 mb-2">Target users who follow these accounts. One per line.</p>
              <textarea value={form?.competitors?.join("\n") || ""} onChange={e => hArr("competitors", e.target.value)} rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" placeholder="@nike&#10;@adidas" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Hashtags</label>
              <textarea value={form?.hashtags?.join("\n") || ""} onChange={e => hArr("hashtags", e.target.value)} rows={4} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" placeholder="fitness&#10;running" />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Min followers</label><input type="number" value={form?.min_followers ?? 100} onChange={e => h("min_followers", parseInt(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Max followers</label><input type="number" value={form?.max_followers ?? 50000} onChange={e => h("max_followers", parseInt(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" /></div>
            </div>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={form?.skip_private_accounts ?? true} onChange={e => h("skip_private_accounts", e.target.checked)} className="w-4 h-4" /><span className="text-sm text-gray-700">Skip private accounts</span></label>
              <label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={form?.skip_business_accounts ?? false} onChange={e => h("skip_business_accounts", e.target.checked)} className="w-4 h-4" /><span className="text-sm text-gray-700">Skip business accounts</span></label>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <h2 className="text-lg font-semibold text-gray-900">Daily Action Limits</h2>
            <p className="text-sm text-gray-500">Start conservatively and increase gradually.</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Likes / day</label><input type="number" value={form?.daily_like_limit ?? 200} onChange={e => h("daily_like_limit", parseInt(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Follows / day</label><input type="number" value={form?.daily_follow_limit ?? 100} onChange={e => h("daily_follow_limit", parseInt(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" /></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Unfollows / day</label><input type="number" value={form?.daily_unfollow_limit ?? 100} onChange={e => h("daily_unfollow_limit", parseInt(e.target.value) || 0)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-fuchsia-500 focus:border-fuchsia-500 outline-none" /></div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            {saved && <span className="text-sm text-green-600 font-medium">✓ Settings saved</span>}
            <div className="ml-auto"><button type="submit" disabled={update.isPending} className="bg-fuchsia-600 hover:bg-fuchsia-500 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium">{update.isPending ? "Saving..." : "Save Changes"}</button></div>
          </div>
        </form>
      )}
    </div>
  );
}
