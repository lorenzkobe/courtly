import { cn } from "@/lib/utils";

export default function PageHeader({
  title,
  subtitle,
  children,
  /** `start` lines actions up with the title row; `end` aligns to the bottom of the title block (subtitle). */
  alignActions = "end",
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  alignActions?: "start" | "end";
}) {
  return (
    <div
      className={cn(
        "mb-8 flex flex-col gap-4 sm:flex-row sm:justify-between",
        alignActions === "start" ? "sm:items-start" : "sm:items-end",
      )}
    >
      <div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-1 text-base text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children ? (
        <div className="flex flex-wrap items-center gap-3">{children}</div>
      ) : null}
    </div>
  );
}
