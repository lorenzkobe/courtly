import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const skillConfig: Record<
  string,
  { label: string; className: string }
> = {
  beginner: {
    label: "Beginner",
    className: "bg-chart-3/15 text-chart-3 border-chart-3/30",
  },
  intermediate: {
    label: "Intermediate",
    className: "bg-chart-4/15 text-chart-4 border-chart-4/30",
  },
  advanced: {
    label: "Advanced",
    className: "bg-destructive/10 text-destructive border-destructive/20",
  },
  open: {
    label: "All Levels",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  all_levels: {
    label: "All Levels",
    className: "bg-primary/10 text-primary border-primary/20",
  },
};

export default function SkillBadge({ level }: { level: string }) {
  const config = skillConfig[level] ?? skillConfig.open;
  return (
    <Badge
      variant="outline"
      className={cn("text-xs font-medium", config.className)}
    >
      {config.label}
    </Badge>
  );
}
