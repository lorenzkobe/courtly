"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatStatusLabel } from "@/lib/utils";

export default function CourtAccountDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: ["court-account", id],
    queryFn: async () => {
      const { data: d } = await courtlyApi.courtAccounts.get(id);
      return d;
    },
    enabled: !!id,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8 md:px-10">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
        <p className="text-muted-foreground">Court account not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/superadmin/court-accounts">Back to accounts</Link>
        </Button>
      </div>
    );
  }

  const { account, courts, primaryAdmin } = data;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <Button variant="ghost" className="mb-4 -ml-2" asChild>
        <Link href="/superadmin/court-accounts">
          <ArrowLeft className="mr-2 h-4 w-4" /> Court accounts
        </Link>
      </Button>

      <PageHeader
        title={account.name}
        subtitle={account.contact_email}
        alignActions="start"
      >
        <Badge
          variant="outline"
          className={
            account.status === "active"
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive"
          }
        >
          {formatStatusLabel(account.status)}
        </Badge>
      </PageHeader>

      <div className="mt-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-base">Account details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <span className="text-muted-foreground">Primary admin</span>
              <span>
                {primaryAdmin ? (
                  <>
                    <span className="font-medium">{primaryAdmin.full_name}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {primaryAdmin.email}
                    </span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Not assigned</span>
                )}
              </span>
            </div>
            {account.notes ? (
              <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
                <span className="text-muted-foreground">Notes</span>
                <span className="whitespace-pre-wrap">{account.notes}</span>
              </div>
            ) : null}
            <div className="grid gap-1 sm:grid-cols-[8rem_1fr]">
              <span className="text-muted-foreground">Created</span>
              <span>
                {new Date(account.created_at).toLocaleString(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 font-heading text-base">
              <Building2 className="h-4 w-4" />
              Linked courts ({courts.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {courts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No courts are linked to this account yet. Assign them from{" "}
                <Link
                  href="/admin/courts"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  court management
                </Link>{" "}
                (superadmin).
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Court</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courts.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5 shrink-0" />
                          {c.location}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="font-normal">
                          {formatStatusLabel(c.status)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
