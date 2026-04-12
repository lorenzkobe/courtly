"use client";

import { Trophy } from "lucide-react";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";

export default function TournamentsPage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Tournaments"
        subtitle="Compete, improve, and have fun"
      />
      <EmptyState
        icon={Trophy}
        title="Available soon"
        description="Tournament listings and registration are not live yet. Check back later — we’re building this next."
      />
    </div>
  );
}
