"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  DollarSign,
  Search,
  Users,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/auth/management";

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
};

export default function AdminBookingsPage() {
  const { user } = useAuth();
  const globalAdmin = isSuperadmin(user);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-bookings", globalAdmin ? "all" : "managed"],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({ manageable: true });
      return data;
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: string;
    }) => {
      await courtlyApi.bookings.update(id, {
        status: status as "confirmed" | "cancelled" | "completed",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Booking updated");
    },
  });

  const filtered = bookings.filter((b) => {
    const statusMatch = statusFilter === "all" || b.status === statusFilter;
    const q = search.toLowerCase();
    const searchMatch =
      !search ||
      b.player_name?.toLowerCase().includes(q) ||
      b.player_email?.toLowerCase().includes(q) ||
      b.court_name?.toLowerCase().includes(q);
    return statusMatch && searchMatch;
  });

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    revenue: bookings
      .filter((b) => b.status !== "cancelled")
      .reduce((sum, b) => sum + (b.total_cost || 0), 0),
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title={globalAdmin ? "Court bookings" : "My court bookings"}
        subtitle={
          globalAdmin
            ? "Reservations on any court in the directory"
            : "Reservations on courts you manage"
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Bookings", value: stats.total, color: "text-foreground" },
          { label: "Confirmed", value: stats.confirmed, color: "text-primary" },
          {
            label: "Cancelled",
            value: stats.cancelled,
            color: "text-destructive",
          },
          {
            label: "Revenue",
            value: `$${stats.revenue.toFixed(2)}`,
            color: "text-chart-3",
          },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-5">
              <p className="mb-1 text-sm text-muted-foreground">{s.label}</p>
              <p className={`font-heading text-2xl font-bold ${s.color}`}>
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, court..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No bookings found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <Card
              key={b.id}
              className="border-border/50 transition-shadow hover:shadow-sm"
            >
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="font-heading font-bold text-foreground">
                        {b.court_name || "Court"}
                      </span>
                      <Badge
                        variant="outline"
                        className={statusStyles[b.status] ?? ""}
                      >
                        {b.status}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {b.player_name}
                      </span>
                      <span>{b.player_email}</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />{" "}
                        {b.date && format(new Date(b.date), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {b.start_time} –{" "}
                        {b.end_time}
                      </div>
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" /> {b.players_count}{" "}
                        players
                      </div>
                      <div className="flex items-center gap-1 font-semibold text-foreground">
                        <DollarSign className="h-3.5 w-3.5" /> ${b.total_cost}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {b.status === "confirmed" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() =>
                            updateStatus.mutate({
                              id: b.id,
                              status: "completed",
                            })
                          }
                        >
                          Complete
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-destructive/20 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                          onClick={() =>
                            updateStatus.mutate({
                              id: b.id,
                              status: "cancelled",
                            })
                          }
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
