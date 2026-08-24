"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAccounts, getEngagementActions } from "@/lib/api";
import { statusColor, formatRelativeTime } from "@/lib/utils";

export default function Activity() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [action, setAction] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const { data: accounts } = useQuery({ queryKey: ["accounts"], queryFn: getAccounts });
  if (accounts && accounts.length > 0 && !accountId) setAccountId(accounts[0].id);

  const { data: actions, isLoading } = useQuery({
    queryKey: ["actions", accountId, status, action, page],
    queryFn: () => accountId ? getEngagementActions(accountId, { status, action_type: action, page, page_size: 20 }) : null,
    enabled: !!accountId,
  });

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold text-gray-900">Activity Feed</h1><p className="text-gray-600 mt-1">Full transparency — every action taken on your account</p></div>
      <div className="flex flex-wrap gap-3 items-center">
        {accounts && accounts.length > 0 && (
          <select value={accountId || ""} onChange={e => { setAccountId(e.target.value); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
            {accounts.map((a: any) => <option key={a.id} value={a.id}>@{a.username}</option>)}
          </select>
        )}
        <select value={status || ""} onChange={e => { setStatus(e.target.value || undefined); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">All statuses</option>
          <option value="completed">Completed</option><option value="failed">Failed</option><option value="pending">Pending</option>
        </select>
        <select value={action || ""} onChange={e => { setAction(e.target.value || undefined); setPage(1); }} className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
          <option value="">All actions</option>
          <option value="like">Likes</option><option value="follow">Follows</option><option value="unfollow">Unfollows</option>
        </select>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr><th className="text-left px-6 py-3 font-medium text-gray-600">Target</th><th className="text-left px-6 py-3 font-medium text-gray-600">Action</th><th className="text-left px-6 py-3 font-medium text-gray-600">Status</th><th className="text-left px-6 py-3 font-medium text-gray-600">Duration</th><th className="text-left px-6 py-3 font-medium text-gray-600">When</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading activity...</td></tr>}
              {!isLoading && actions?.items?.length === 0 && <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No activity yet.</td></tr>}
              {actions?.items?.map((a: any) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium text-gray-900">@{a.target_username}</td>
                  <td className="px-6 py-4 text-gray-700 capitalize">{a.action_type.replace("_", " ")}</td>
                  <td className="px-6 py-4"><span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColor(a.status)}`}>{a.status.replace("_", " ")}</span></td>
                  <td className="px-6 py-4 text-gray-500">{a.duration_ms ? `${a.duration_ms}ms` : "-"}</td>
                  <td className="px-6 py-4 text-gray-500">{a.created_at ? formatRelativeTime(a.created_at) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {actions && actions.total > 20 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">Showing page {page} of {Math.ceil(actions.total / 20)}</p>
            <div className="flex gap-2">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Previous</button>
              <button onClick={() => setPage(page + 1)} disabled={page * 20 >= actions.total} className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
