"use client";

import { cn } from "@/lib/utils";

const PROSE_CLASSES = [
  "text-sm leading-relaxed text-foreground",
  "[&_h1]:font-heading [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3",
  "[&_h2]:font-heading [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2",
  "[&_h3]:font-heading [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
  "[&_h4]:font-heading [&_h4]:text-base [&_h4]:font-semibold [&_h4]:mt-3 [&_h4]:mb-1",
  "[&_p]:my-2",
  "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-6",
  "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:my-1",
  "[&_blockquote]:my-3 [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground [&_blockquote]:italic",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs",
  "[&_pre]:rounded-lg [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-xs [&_pre]:overflow-x-auto",
  "[&_hr]:my-4 [&_hr]:border-border",
  "[&_strong]:font-semibold",
];

export default function TermsHtmlView({
  html,
  className,
  emptyMessage = "No content yet.",
}: {
  html: string;
  className?: string;
  emptyMessage?: string;
}) {
  const trimmed = html?.trim();
  if (!trimmed) {
    return (
      <p className={cn("text-sm text-muted-foreground italic", className)}>
        {emptyMessage}
      </p>
    );
  }
  return (
    <div
      className={cn(PROSE_CLASSES.join(" "), className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
