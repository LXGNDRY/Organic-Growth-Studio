"use client";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getSubscription, createPortalSession } from "@/lib/api";

export default function Settings() {
  const [loading, setLoading] = useState(false);
  const { data: subscription, isLoading } = useQuery({ queryKey: ["subscription"], queryFn: getSubscription });

  const portal = useMutation({ mutationFn: (url: string) => createPortalSession(url), onSuccess: d => { window.location.href = d.url; } });

  async function handleBilling() {
    setLoading(true);
    try { await portal.mutateAsync(`${window.location.origin}/dashboard/settings`); }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div><h1 className="text-2xl font-bold text-gray-900">Settings</h1><p className="text-gray-600 mt-1">Manage your account, plan, and preferences</p></div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Subscription</h2>
        {isLoading ? <p className="text-gray-600">Loading...</p> : (
          <>
            <div className="grid grid-cols-2 gap-4 py-3 border-b border-gray-100">
              <span className="text-gray-600">Plan</span><span className="font-medium text-gray-900 capitalize">{subscription?.plan_tier || "Starter (free trial)"}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 py-3 border-b border-gray-100">
              <span className="text-gray-600">Status</span><span className="font-medium text-gray-900 capitalize">{subscription?.status || "Active"}</span>
            </div>
            <div className="grid grid-cols-2 gap-4 py-3">
              <span className="text-gray-600">Billing</span><span className="font-medium text-gray-900 capitalize">{subscription?.billing_period || "Monthly"}</span>
            </div>
            <button onClick={handleBilling} disabled={loading} className="mt-2 w-full bg-gray-900 hover:bg-gray-800 disabled:opacity-50 text-white px-4 py-2.5 rounded-lg font-medium">{loading ? "Opening portal..." : "Manage Billing"}</button>
          </>
        )}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Danger Zone</h2>
        <p className="text-sm text-gray-600">Permanently delete your account. This cannot be undone.</p>
        <button className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 px-4 py-2.5 rounded-lg font-medium">Delete Account</button>
      </div>
    </div>
  );
}
