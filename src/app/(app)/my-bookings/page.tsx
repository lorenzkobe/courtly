"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  DollarSign,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
  registered: "bg-primary/10 text-primary border-primary/20",
  waitlisted: "bg-chart-3/15 text-chart-3 border-chart-3/30",
};

export default function MyBookingsPage() {
  const [tab, setTab] = useState("bookings");
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["my-bookings", user?.email],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({
        player_email: user?.email,
      });
      return data;
    },
    enabled: !!user?.email,
  });

  const { data: registrations = [], isLoading: loadingRegs } = useQuery({
    queryKey: ["my-registrations", user?.email],
    queryFn: async () => {
      const { data } = await courtlyApi.registrations.list({
        player_email: user?.email,
      });
      return data;
    },
    enabled: !!user?.email,
  });

  const cancelBooking = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.bookings.update(id, { status: "cancelled" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Booking cancelled");
    },
  });

  const isLoading = loadingBookings || loadingRegs;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <PageHeader
        title="My Bookings"
        subtitle="Manage your reservations and registrations"
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="bookings" className="font-heading">
            Court Bookings ({bookings.length})
          </TabsTrigger>
          <TabsTrigger value="tournaments" className="font-heading">
            Tournaments ({registrations.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : tab === "bookings" ? (
        bookings.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No bookings yet"
            description="Book a court to get started!"
          >
            <Button className="font-heading" asChild>
              <Link href="/courts">Browse Courts</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="space-y-4">
            {bookings.map((b) => (
              <Card
                key={b.id}
                className="border-border/50 transition-shadow hover:shadow-md"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex-1">
                      <div className="mb-2 flex items-center gap-2">
                        <h3 className="font-heading font-bold text-foreground">
                          {b.court_name || "Court"}
                        </h3>
                        <Badge
                          variant="outline"
                          className={statusStyles[b.status] ?? ""}
                        >
                          {b.status}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground sm:grid-cols-4">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-3.5 w-3.5" />
                          {b.date && format(new Date(b.date), "MMM d")}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5" />
                          {b.start_time} – {b.end_time}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5" />
                          {b.players_count} players
                        </div>
                        <div className="flex items-center gap-1.5">
                          <DollarSign className="h-3.5 w-3.5" />
                          <span className="font-semibold text-foreground">
                            ${b.total_cost}
                          </span>
                        </div>
                      </div>
                    </div>
                    {b.status === "confirmed" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        onClick={() => cancelBooking.mutate(b.id)}
                        disabled={cancelBooking.isPending}
                      >
                        <X className="mr-1 h-3.5 w-3.5" /> Cancel
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No registrations yet"
          description="Join a tournament to compete!"
        >
          <Button className="font-heading" asChild>
            <Link href="/tournaments">Browse Tournaments</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {registrations.map((r) => (
            <Card
              key={r.id}
              className="border-border/50 transition-shadow hover:shadow-md"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-heading font-bold text-foreground">
                        {r.tournament_name || "Tournament"}
                      </h3>
                      <Badge
                        variant="outline"
                        className={statusStyles[r.status] ?? ""}
                      >
                        {r.status}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.player_name}{" "}
                      {r.partner_name ? `& ${r.partner_name}` : ""}
                    </p>
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
