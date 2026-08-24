import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return num.toString();
}
export function statusColor(status: string): string {
  switch (status) {
    case "active": case "completed": return "text-green-600 bg-green-50";
    case "paused": return "text-yellow-600 bg-yellow-50";
    case "warming_up": case "ramping": case "executing": case "queued":
      return "text-blue-600 bg-blue-50";
    case "action_blocked": case "throttled": case "failed":
      return "text-red-600 bg-red-50";
    default: return "text-gray-600 bg-gray-50";
  }
}
export function formatRelativeTime(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
