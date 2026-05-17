"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, ShieldCheck, UserRound } from "lucide-react";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi, type MyProfileResponse } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatusLabel } from "@/lib/utils";
import {
  isValidBirthdateIso,
  isValidPersonName,
  normalizePhMobile,
  PH_MOBILE_REGEX,
} from "@/lib/validation/person-fields";
import { getPasswordValidation } from "@/lib/validation/password";

const PROFILE_QUERY_KEY = ["me", "profile"] as const;

type ProfileForm = {
  firstName: string;
  lastName: string;
  birthdate: string;
  mobileNumber: string;
  duprRating: string;
};

function buildForm(profile: MyProfileResponse): ProfileForm {
  return {
    firstName: profile.first_name ?? "",
    lastName: profile.last_name ?? "",
    birthdate: profile.birthdate ?? "",
    mobileNumber: profile.mobile_number ?? "",
    duprRating:
      profile.dupr_rating == null ? "2.00" : Number(profile.dupr_rating).toFixed(2),
  };
}

export default function ProfilePage() {
  const profileQuery = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: async () => {
      const { data } = await courtlyApi.me.profile.get();
      return data;
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold sm:text-3xl">
          Your profile
        </h1>
        <p className="text-sm text-muted-foreground">
          Manage your personal details and account password.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" />
            <CardTitle>Personal information</CardTitle>
          </div>
          <CardDescription>
            Your email and role are managed by Courtly. Contact support to
            change them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profileQuery.isLoading || !profileQuery.data ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <PersonalInfoForm
              key={profileQuery.data.id}
              profile={profileQuery.data}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle>Change password</CardTitle>
          </div>
          <CardDescription>
            Enter your current password, then choose a new one.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}

function PersonalInfoForm({ profile }: { profile: MyProfileResponse }) {
  const queryClient = useQueryClient();
  const { refreshSession } = useAuth();
  const isPlayer = profile.role === "user";

  const [form, setForm] = useState<ProfileForm>(() => buildForm(profile));

  const updateProfile = useMutation({
    mutationFn: async (payload: ProfileForm) => {
      const { data } = await courtlyApi.me.profile.update({
        firstName: payload.firstName.trim(),
        lastName: payload.lastName.trim(),
        birthdate: payload.birthdate,
        mobileNumber: normalizePhMobile(payload.mobileNumber),
        ...(isPlayer ? { duprRating: Number(payload.duprRating) } : {}),
      });
      return data;
    },
    onSuccess: async (data) => {
      queryClient.setQueryData(PROFILE_QUERY_KEY, data);
      setForm(buildForm(data));
      await refreshSession();
      toast.success("Profile updated");
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Could not update profile"));
    },
  });

  const validation = useMemo(() => {
    const trimmedMobile = normalizePhMobile(form.mobileNumber);
    const duprNum = Number(form.duprRating);
    return {
      firstNameOk: isValidPersonName(form.firstName.trim()),
      lastNameOk: isValidPersonName(form.lastName.trim()),
      birthdateOk: isValidBirthdateIso(form.birthdate),
      mobileOk: PH_MOBILE_REGEX.test(trimmedMobile),
      duprOk:
        !isPlayer ||
        (Number.isFinite(duprNum) && duprNum >= 2 && duprNum <= 8),
    };
  }, [form, isPlayer]);

  const valid = Object.values(validation).every(Boolean);

  const dirty = useMemo(() => {
    const current = buildForm(profile);
    return (
      form.firstName.trim() !== current.firstName ||
      form.lastName.trim() !== current.lastName ||
      form.birthdate !== current.birthdate ||
      normalizePhMobile(form.mobileNumber) !== current.mobileNumber ||
      (isPlayer && Number(form.duprRating).toFixed(2) !== current.duprRating)
    );
  }, [form, profile, isPlayer]);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid || !dirty || updateProfile.isPending) return;
        updateProfile.mutate(form);
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Email</Label>
          <Input value={profile.email} disabled readOnly />
        </div>
        <div className="space-y-2">
          <Label>Role</Label>
          <div>
            <Badge variant="secondary">
              {formatStatusLabel(profile.role)}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-first-name">First name</Label>
          <Input
            id="profile-first-name"
            value={form.firstName}
            onChange={(event) =>
              setForm({ ...form, firstName: event.target.value })
            }
            disabled={updateProfile.isPending}
          />
          {form.firstName.length > 0 && !validation.firstNameOk ? (
            <p className="text-xs text-destructive">
              Use at least 2 letters; spaces, hyphens, and apostrophes allowed.
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-last-name">Last name</Label>
          <Input
            id="profile-last-name"
            value={form.lastName}
            onChange={(event) =>
              setForm({ ...form, lastName: event.target.value })
            }
            disabled={updateProfile.isPending}
          />
          {form.lastName.length > 0 && !validation.lastNameOk ? (
            <p className="text-xs text-destructive">
              Use at least 2 letters; spaces, hyphens, and apostrophes allowed.
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-birthdate">Birthdate</Label>
          <Input
            id="profile-birthdate"
            type="date"
            value={form.birthdate}
            onChange={(event) =>
              setForm({ ...form, birthdate: event.target.value })
            }
            max={new Date().toISOString().slice(0, 10)}
            disabled={updateProfile.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-mobile">Mobile number</Label>
          <Input
            id="profile-mobile"
            inputMode="tel"
            placeholder="09171234567"
            value={form.mobileNumber}
            onChange={(event) =>
              setForm({ ...form, mobileNumber: event.target.value })
            }
            disabled={updateProfile.isPending}
          />
          {form.mobileNumber.length > 0 && !validation.mobileOk ? (
            <p className="text-xs text-destructive">
              Use a Philippine mobile number, e.g. 09171234567 or +639171234567.
            </p>
          ) : null}
        </div>
      </div>

      {isPlayer ? (
        <div className="space-y-2">
          <Label htmlFor="profile-dupr">DUPR rating</Label>
          <Input
            id="profile-dupr"
            type="number"
            step="0.01"
            min={2}
            max={8}
            value={form.duprRating}
            onChange={(event) =>
              setForm({ ...form, duprRating: event.target.value })
            }
            disabled={updateProfile.isPending}
          />
          <p className="text-xs text-muted-foreground">
            Self-reported DUPR (2.00–8.00). Used for open-play skill matching.
          </p>
          {!validation.duprOk ? (
            <p className="text-xs text-destructive">
              Enter a number between 2.00 and 8.00.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!valid || !dirty || updateProfile.isPending}
        >
          {updateProfile.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Saving…
            </>
          ) : (
            "Save changes"
          )}
        </Button>
      </div>
    </form>
  );
}

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const passwordChecks = getPasswordValidation(newPassword);
  const newPasswordOk = Object.values(passwordChecks).every(Boolean);
  const confirmOk = newPassword.length > 0 && newPassword === confirmNewPassword;
  const passwordsDiffer = currentPassword !== newPassword;

  const changePassword = useMutation({
    mutationFn: () =>
      courtlyApi.me.changePassword({
        currentPassword,
        newPassword,
        confirmPassword: confirmNewPassword,
      }),
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      toast.success("Password updated");
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, "Could not update password"));
    },
  });

  const canSubmit =
    Boolean(currentPassword) &&
    newPasswordOk &&
    confirmOk &&
    passwordsDiffer &&
    !changePassword.isPending;

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        changePassword.mutate();
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="current-password">Current password</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          disabled={changePassword.isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          disabled={changePassword.isPending}
        />
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
        <p className="mb-2 font-medium text-foreground">Password requirements</p>
        <ul className="space-y-1 text-muted-foreground">
          <li className={passwordChecks.minLength ? "text-emerald-600" : ""}>
            {passwordChecks.minLength ? "Pass" : "Pending"} — At least 8 characters
          </li>
          <li className={passwordChecks.uppercase ? "text-emerald-600" : ""}>
            {passwordChecks.uppercase ? "Pass" : "Pending"} — 1 uppercase letter
          </li>
          <li className={passwordChecks.lowercase ? "text-emerald-600" : ""}>
            {passwordChecks.lowercase ? "Pass" : "Pending"} — 1 lowercase letter
          </li>
          <li className={passwordChecks.number ? "text-emerald-600" : ""}>
            {passwordChecks.number ? "Pass" : "Pending"} — 1 number
          </li>
          <li className={passwordChecks.symbol ? "text-emerald-600" : ""}>
            {passwordChecks.symbol ? "Pass" : "Pending"} — 1 symbol
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm-new-password">Confirm new password</Label>
        <Input
          id="confirm-new-password"
          type="password"
          autoComplete="new-password"
          value={confirmNewPassword}
          onChange={(event) => setConfirmNewPassword(event.target.value)}
          disabled={changePassword.isPending}
        />
        {confirmNewPassword.length > 0 && !confirmOk ? (
          <p className="text-xs text-destructive">
            New password and confirmation must match.
          </p>
        ) : null}
        {currentPassword.length > 0 &&
        newPassword.length > 0 &&
        !passwordsDiffer ? (
          <p className="text-xs text-destructive">
            New password must be different from the current one.
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={!canSubmit}>
          {changePassword.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Updating…
            </>
          ) : (
            "Update password"
          )}
        </Button>
      </div>
    </form>
  );
}
