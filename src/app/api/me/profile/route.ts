import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildFullName,
  isValidBirthdateIso,
  isValidPersonName,
  normalizePhMobile,
  PH_MOBILE_REGEX,
} from "@/lib/validation/person-fields";

type ProfileRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  birthdate: string | null;
  mobile_number: string | null;
  role: "user" | "admin" | "superadmin";
  is_active: boolean;
  dupr_rating: number | string | null;
  created_at: string;
};

type ProfileResponse = {
  id: string;
  email: string;
  full_name: string;
  first_name: string;
  last_name: string;
  birthdate: string;
  mobile_number: string;
  role: ProfileRow["role"];
  is_active: boolean;
  dupr_rating: number;
  created_at: string;
};

function toResponse(row: ProfileRow, email: string): ProfileResponse {
  return {
    id: row.id,
    email,
    full_name: row.full_name,
    first_name: row.first_name ?? "",
    last_name: row.last_name ?? "",
    birthdate: row.birthdate ? String(row.birthdate).slice(0, 10) : "",
    mobile_number: row.mobile_number ?? "",
    role: row.role,
    is_active: row.is_active,
    dupr_rating: row.dupr_rating == null ? 2 : Number(row.dupr_rating),
    created_at: row.created_at,
  };
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, dupr_rating, created_at",
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  return NextResponse.json(toResponse(data as ProfileRow, user.email ?? ""));
}

export async function PATCH(req: Request) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let patch: {
    firstName?: unknown;
    lastName?: unknown;
    birthdate?: unknown;
    mobileNumber?: unknown;
    duprRating?: unknown;
  };
  try {
    patch = (await req.json()) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { data: cur, error: curError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, dupr_rating, created_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (curError || !cur) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  const current = cur as ProfileRow;

  const firstName =
    typeof patch.firstName === "string"
      ? patch.firstName.trim()
      : (current.first_name ?? "").trim();
  const lastName =
    typeof patch.lastName === "string"
      ? patch.lastName.trim()
      : (current.last_name ?? "").trim();
  const birthdate =
    typeof patch.birthdate === "string"
      ? patch.birthdate.trim()
      : current.birthdate
        ? String(current.birthdate).slice(0, 10)
        : "";
  const mobileNumber =
    typeof patch.mobileNumber === "string"
      ? normalizePhMobile(patch.mobileNumber)
      : (current.mobile_number ?? "").trim();

  if (!isValidPersonName(firstName) || !isValidPersonName(lastName)) {
    return NextResponse.json(
      {
        error:
          "First name and last name must have at least 2 letters and may include spaces.",
      },
      { status: 400 },
    );
  }
  if (!isValidBirthdateIso(birthdate)) {
    return NextResponse.json(
      { error: "Please provide a valid birthdate." },
      { status: 400 },
    );
  }
  if (!PH_MOBILE_REGEX.test(mobileNumber)) {
    return NextResponse.json(
      {
        error:
          "Please provide a valid Philippine mobile number (e.g. 09171234567 or +639171234567).",
      },
      { status: 400 },
    );
  }

  let duprRating = current.dupr_rating == null ? 2 : Number(current.dupr_rating);
  if (current.role === "user" && patch.duprRating !== undefined) {
    const next = Number(patch.duprRating);
    if (!Number.isFinite(next) || next < 2 || next > 8) {
      return NextResponse.json(
        { error: "DUPR rating must be a number between 2.00 and 8.00." },
        { status: 400 },
      );
    }
    duprRating = Math.round(next * 100) / 100;
  }

  const fullName = buildFullName(firstName, lastName);

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      birthdate,
      mobile_number: mobileNumber,
      dupr_rating: duprRating,
    })
    .eq("id", user.id);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Could not update profile." },
      { status: 400 },
    );
  }

  const { data: next } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, dupr_rating, created_at",
    )
    .eq("id", user.id)
    .single();

  return NextResponse.json(toResponse(next as ProfileRow, user.email ?? ""));
}
