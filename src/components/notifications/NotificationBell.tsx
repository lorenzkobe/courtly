"use client";

import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const SAMPLE_ITEMS = [
  {
    id: "sample-booking",
    title: "Booking updates will appear here",
    body: "Cancellation and schedule changes become realtime once Supabase is enabled.",
  },
  {
    id: "sample-review",
    title: "Review moderation alerts",
    body: "Flag and moderation notifications are currently placeholder-only.",
  },
  {
    id: "sample-admin",
    title: "Admin alerts",
    body: "New bookings, reviews, and court onboarding alerts are queued for Supabase phase.",
  },
] as const;

export default function NotificationBell() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications placeholder">
          <Bell className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Notifications</p>
            <Badge variant="secondary">Placeholder</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Realtime notifications activate when Supabase is connected.
          </p>
        </div>

        <div className="max-h-80 overflow-y-auto px-2 py-2">
          {SAMPLE_ITEMS.map((item) => (
            <div
              key={item.id}
              className="rounded-lg px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <p className="font-medium">{item.title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
