"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, ShieldAlert } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";
import TermsHtmlView from "@/components/admin/TermsHtmlView";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import { queryKeys } from "@/lib/query/query-keys";
import { useTermsRealtime } from "@/lib/terms/use-terms-realtime";

export default function TermsAcceptanceGate() {
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const [confirmDeclineOpen, setConfirmDeclineOpen] = useState(false);

  useTermsRealtime({ enabled: isAdmin });

  const { data } = useQuery({
    queryKey: queryKeys.terms.adminState(),
    queryFn: async () => {
      const { data: payload } = await courtlyApi.adminTerms.state();
      return payload;
    },
    enabled: isAdmin,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const acceptMutation = useMutation({
    mutationFn: async () => {
      await courtlyApi.adminTerms.accept();
    },
    onSuccess: () => {
      toast.success("Thanks for accepting the Terms & Conditions.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms.adminState() });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not record acceptance."));
    },
  });

  const declineMutation = useMutation({
    mutationFn: async () => {
      await courtlyApi.adminTerms.decline();
      await logout();
    },
    onSuccess: () => {
      window.location.href = "/login";
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not record decline."));
    },
  });

  const signOut = useMutation({
    mutationFn: async () => {
      await logout();
    },
    onSuccess: () => {
      window.location.href = "/login";
    },
  });

  if (!isAdmin) return null;
  if (!data) return null;
  if (data.status === "no_terms" || data.status === "accepted") return null;

  const isDeclined = data.status === "declined";

  return (
    <>
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
      >
        <header className="flex items-center gap-3 border-b border-border px-6 py-4">
          <Image
            src="/courtly-logo.svg"
            alt="Courtly"
            width={36}
            height={36}
          />
          <div>
            <h1 className="font-heading text-lg font-bold tracking-tight">Courtly</h1>
            <p className="text-xs text-muted-foreground">Admin Terms & Conditions</p>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-6 py-8">
            {isDeclined ? (
              <div className="space-y-5 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
                  <ShieldAlert className="h-7 w-7 text-red-600" />
                </div>
                <div>
                  <h2 className="font-heading text-2xl font-bold tracking-tight">
                    Access declined
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    You declined the current Terms & Conditions, so your admin access is paused.
                    Please contact your superadmin to regain access.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="font-heading text-2xl font-bold tracking-tight">
                    Terms & Conditions
                  </h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Please review and accept the latest Terms & Conditions to continue using
                    Courtly as an admin (v{data.version}).
                  </p>
                </div>
                <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
                  <TermsHtmlView html={data.content_html} emptyMessage="No content yet." />
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="border-t border-border bg-card px-6 py-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:justify-end">
            {isDeclined ? (
              <Button
                variant="outline"
                onClick={() => signOut.mutate()}
                disabled={signOut.isPending}
              >
                <LogOut className="mr-2 h-4 w-4" />
                {signOut.isPending ? "Signing out…" : "Sign out"}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setConfirmDeclineOpen(true)}
                  disabled={acceptMutation.isPending || declineMutation.isPending}
                >
                  Decline
                </Button>
                <Button
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending || declineMutation.isPending}
                >
                  {acceptMutation.isPending ? "Saving…" : "Accept & continue"}
                </Button>
              </>
            )}
          </div>
        </footer>
      </div>

      <Dialog
        open={confirmDeclineOpen}
        onOpenChange={(open) => {
          if (!open && !declineMutation.isPending) setConfirmDeclineOpen(false);
        }}
      >
        <DialogContent linkDescription>
          <DialogHeader>
            <DialogTitle>Decline Terms & Conditions?</DialogTitle>
            <DialogDescription>
              You will be signed out and your admin access will be paused. To regain access,
              you&apos;ll need to contact your superadmin to reset your response. Continue?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeclineOpen(false)}
              disabled={declineMutation.isPending}
            >
              Keep reviewing
            </Button>
            <Button
              variant="destructive"
              onClick={() => declineMutation.mutate()}
              disabled={declineMutation.isPending}
            >
              {declineMutation.isPending ? "Signing out…" : "Decline & sign out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
