import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPasswordPolicySatisfied } from "@/lib/validation/password";
import {
  buildFullName,
  EMAIL_REGEX,
  isValidBirthdateIso,
  isValidPersonName,
  PH_MOBILE_REGEX,
} from "@/lib/validation/person-fields";

export async function POST(req: Request) {
  let email = "";
  let firstName = "";
  let lastName = "";
  let birthdate = "";
  let mobileNumber = "";
  let password = "";
  let confirmPassword = "";

  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    birthdate = typeof body?.birthdate === "string" ? body.birthdate.trim() : "";
    mobileNumber = typeof body?.mobileNumber === "string" ? body.mobileNumber.trim() : "";
    password = typeof body?.password === "string" ? body.password : "";
    confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (
    !email ||
    !firstName ||
    !lastName ||
    !birthdate ||
    !mobileNumber ||
    !password ||
    !confirmPassword
  ) {
    return NextResponse.json(
      { error: "All required fields must be provided." },
      { status: 400 },
    );
  }

  if (!EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

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

  if (!isPasswordPolicySatisfied(password)) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Password and confirm password must match." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const fullName = buildFullName(firstName, lastName);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        first_name: firstName,
        last_name: lastName,
        birthdate,
        mobile_number: mobileNumber,
      },
    },
  });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not create your account. Please try again." },
      { status: 400 },
    );
  }

  const user = await readSessionUser();
  return NextResponse.json({ user });
}
