"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ArrowLeft, Check, DollarSign } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { courtlyApi } from "@/lib/api/courtly-client";

const TIME_SLOTS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
  "20:00",
  "21:00",
];

export default function BookCourtPage() {
  const params = useParams<{ id: string }>();
  const courtId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selectedDate, setSelectedDate] = useState(addDays(new Date(), 1));
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerEmail, setPlayerEmail] = useState("");
  const [playersCount, setPlayersCount] = useState(2);
  const [notes, setNotes] = useState("");

  const { data: court, isLoading } = useQuery({
    queryKey: ["court", courtId],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.get(courtId);
      return data;
    },
    enabled: !!courtId,
  });

  const { data: existingBookings = [] } = useQuery({
    queryKey: ["bookings-for-court", courtId, selectedDate],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({
        court_id: courtId,
        date: format(selectedDate, "yyyy-MM-dd"),
      });
      return data.filter((b) => b.status === "confirmed");
    },
    enabled: !!courtId && !!selectedDate,
  });

  const bookedSlots = existingBookings.map((b) => b.start_time);

  const createBooking = useMutation({
    mutationFn: async (payload: Parameters<typeof courtlyApi.bookings.create>[0]) => {
      const { data } = await courtlyApi.bookings.create(payload);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Court booked successfully!");
      router.push("/my-bookings");
    },
  });

  const handleTimeSelect = (time: string) => {
    if (!startTime || (startTime && endTime)) {
      setStartTime(time);
      setEndTime(null);
    } else if (time > startTime) {
      setEndTime(time);
    } else {
      setStartTime(time);
      setEndTime(null);
    }
  };

  const calculateHours = () => {
    if (!startTime || !endTime) return 0;
    const start = Number.parseInt(startTime.split(":")[0] ?? "0", 10);
    const end = Number.parseInt(endTime.split(":")[0] ?? "0", 10);
    return end - start;
  };

  const totalCost = calculateHours() * (court?.hourly_rate || 0);

  const handleSubmit = () => {
    if (!startTime || !endTime || !playerName || !playerEmail || !court) {
      toast.error("Please fill in all required fields");
      return;
    }
    createBooking.mutate({
      court_id: courtId,
      court_name: court.name,
      date: format(selectedDate, "yyyy-MM-dd"),
      start_time: startTime,
      end_time: endTime,
      player_name: playerName,
      player_email: playerEmail,
      players_count: playersCount,
      total_cost: totalCost,
      notes,
      status: "confirmed",
    });
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8 md:px-10">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!court) {
    return (
      <div className="px-6 py-8 text-center md:px-10">
        <p className="text-muted-foreground">Court not found.</p>
        <Button
          variant="outline"
          onClick={() => router.push("/courts")}
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Courts
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <Button
        variant="ghost"
        onClick={() => router.push("/courts")}
        className="mb-4 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Courts
      </Button>

      <PageHeader title={`Book ${court.name}`} subtitle={court.location} />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="font-heading text-lg">
              Select Date & Time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">
                Date
              </Label>
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                disabled={(date) => date < new Date()}
                className="rounded-xl border"
              />
            </div>
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">
                Time Slots — {format(selectedDate, "EEE, MMM d")}
              </Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Select start time, then end time
              </p>
              <div className="grid grid-cols-4 gap-2">
                {TIME_SLOTS.map((time) => {
                  const isBooked = bookedSlots.includes(time);
                  const isStart = startTime === time;
                  const isEnd = endTime === time;
                  const isInRange =
                    startTime &&
                    endTime &&
                    time > startTime &&
                    time < endTime;
                  return (
                    <Button
                      key={time}
                      size="sm"
                      variant={
                        isStart || isEnd
                          ? "default"
                          : isInRange
                            ? "secondary"
                            : "outline"
                      }
                      disabled={isBooked}
                      onClick={() => handleTimeSelect(time)}
                      className={`font-mono text-xs ${isBooked ? "opacity-40 line-through" : ""}`}
                    >
                      {time}
                    </Button>
                  );
                })}
              </div>
              {startTime && endTime ? (
                <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-primary">
                    <Check className="h-4 w-4" />
                    {startTime} – {endTime} ({calculateHours()} hrs)
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Your Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="name">Full Name *</Label>
                <Input
                  id="name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={playerEmail}
                  onChange={(e) => setPlayerEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <Label htmlFor="players">Number of Players</Label>
                <Input
                  id="players"
                  type="number"
                  min={1}
                  max={8}
                  value={playersCount}
                  onChange={(e) =>
                    setPlayersCount(Number.parseInt(e.target.value, 10))
                  }
                />
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-5">
              <h3 className="mb-3 font-heading text-lg font-bold">
                Booking Summary
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Court</span>
                  <span className="font-medium">{court.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-medium">
                    {format(selectedDate, "MMM d, yyyy")}
                  </span>
                </div>
                {startTime && endTime ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Time</span>
                      <span className="font-medium">
                        {startTime} – {endTime}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">
                        {calculateHours()} hour(s)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rate</span>
                      <span className="font-medium flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {court.hourly_rate}/hr
                      </span>
                    </div>
                    <div className="mt-2 flex justify-between border-t pt-2">
                      <span className="font-heading font-bold">Total</span>
                      <span className="font-heading text-lg font-bold text-primary">
                        ${totalCost}
                      </span>
                    </div>
                  </>
                ) : null}
              </div>
              <Button
                className="mt-4 w-full font-heading font-semibold shadow-lg shadow-primary/20"
                size="lg"
                onClick={handleSubmit}
                disabled={
                  !startTime ||
                  !endTime ||
                  !playerName ||
                  !playerEmail ||
                  createBooking.isPending
                }
              >
                {createBooking.isPending ? "Booking..." : "Confirm Booking"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
