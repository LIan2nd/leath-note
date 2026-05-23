"use client";

import * as React from "react";
import { useSession } from "next-auth/react";
import { X, User, Mail, Calendar, FileText } from "lucide-react";
import { cn } from "~/lib/utils";
import { api } from "~/trpc/react";

interface ProfileCardProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatJoinDate(date: string | Date | undefined | null): string {
  if (!date) return "Unknown";
  const d = new Date(date);
  return d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ProfileCard({ isOpen, onClose }: ProfileCardProps) {
  const { data: session } = useSession();
  const { data: notes } = api.notes.list.useQuery(undefined, { enabled: isOpen });

  // Close on Escape key
  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !session?.user) return null;

  const user = session.user;
  const noteCount = notes?.length ?? 0;
  const initials = (user.name ?? user.email ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Card */}
      <div className="settings-modal relative w-full max-w-sm">
        {/* Header */}
        <div className="settings-modal-header px-5 py-4">
          <div className="flex items-center justify-between">
            <h3 className="embossed-text text-sm font-bold uppercase tracking-wider">
              Profile
            </h3>
            <button
              onClick={onClose}
              className="btn-skeuomorphic p-1.5"
              aria-label="Close profile"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Avatar + Name */}
        <div className="flex flex-col items-center gap-3 px-5 pt-5 pb-4">
          {user.image ? (
            <img
              src={user.image}
              alt={user.name ?? "Avatar"}
              className="h-16 w-16 rounded-full border-2 border-[#8b7355] shadow-md"
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#8b7355] bg-[#5c4a32] shadow-md">
              <span className="embossed-text text-lg font-bold">{initials}</span>
            </div>
          )}
          <div className="text-center">
            <p className="text-base font-semibold" style={{ color: "#e8dcc8", fontFamily: "'Courier Prime', monospace" }}>
              {user.name ?? "Anonymous"}
            </p>
          </div>
        </div>

        {/* Info rows */}
        <div className="space-y-0 px-5 pb-5">
          {/* Email */}
          <div className="flex items-center gap-3 rounded px-3 py-2.5 border-b border-white/10">
            <Mail className="h-4 w-4 shrink-0" style={{ color: "#c8b89a" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#c8b89a" }}>
                Email
              </p>
              <p className="truncate text-sm font-medium" style={{ color: "#e8dcc8", fontFamily: "'Courier Prime', monospace" }}>
                {user.email ?? "—"}
              </p>
            </div>
          </div>

          {/* Total Notes */}
          <div className="flex items-center gap-3 rounded px-3 py-2.5 border-b border-white/10">
            <FileText className="h-4 w-4 shrink-0" style={{ color: "#c8b89a" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#c8b89a" }}>
                Total Notes
              </p>
              <p className="text-sm font-medium" style={{ color: "#e8dcc8", fontFamily: "'Courier Prime', monospace" }}>
                {noteCount} {noteCount === 1 ? "note" : "notes"}
              </p>
            </div>
          </div>

          {/* User ID */}
          <div className="flex items-center gap-3 rounded px-3 py-2.5">
            <User className="h-4 w-4 shrink-0" style={{ color: "#c8b89a" }} />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider" style={{ color: "#c8b89a" }}>
                Account ID
              </p>
              <p className="truncate text-xs" style={{ color: "#e8dcc8", opacity: 0.85, fontFamily: "'Courier Prime', monospace" }}>
                {user.id}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
