"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import TournamentCard from "@/components/tournaments/TournamentCard";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useSelectedSport } from "@/lib/stores/selected-sport";

export default function TournamentsPage() {
  const [skillFilter, setSkillFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const selectedSport = useSelectedSport((s) => s.sport);

  const { data: tournaments = [], isLoading } = useQuery({
    queryKey: ["tournaments", selectedSport],
    queryFn: async () => {
      const { data } = await courtlyApi.tournaments.list({
        sort: "-date",
        sport: selectedSport,
      });
      return data;
    },
  });

  const filtered = tournaments.filter((t) => {
    const skillMatch = skillFilter === "all" || t.skill_level === skillFilter;
    const formatMatch = formatFilter === "all" || t.format === formatFilter;
    return skillMatch && formatMatch;
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Tournaments"
        subtitle="Compete, improve, and have fun"
      >
        <Select value={formatFilter} onValueChange={setFormatFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Format" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="singles">Singles</SelectItem>
            <SelectItem value="doubles">Doubles</SelectItem>
            <SelectItem value="mixed_doubles">Mixed Doubles</SelectItem>
            <SelectItem value="round_robin">Round Robin</SelectItem>
          </SelectContent>
        </Select>
        <Select value={skillFilter} onValueChange={setSkillFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Skill" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
            <SelectItem value="open">Open</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title="No tournaments found"
          description="Check back soon for upcoming tournaments."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {filtered.map((t) => (
            <TournamentCard key={t.id} tournament={t} />
          ))}
        </div>
      )}
    </div>
  );
}
