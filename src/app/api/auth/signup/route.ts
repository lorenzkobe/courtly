import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
const PH_MOBILE_REGEX = /^(?:\+63|0)9\d{9}$/;

function getPasswordValidation(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    symbol: /[^A-Za-z0-9]/.test(password),
  };
}

function isValidBirthdate(value: string) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed <= new Date();
}

function isValidName(value: string) {
  const trimmed = value.trim();
  if (!NAME_REGEX.test(trimmed)) return false;
  const letterCount = trimmed.replace(/[^A-Za-z]/g, "").length;
  return letterCount >= 2;
}

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

  if (!isValidName(firstName) || !isValidName(lastName)) {
    return NextResponse.json(
      {
        error:
          "First name and last name must have at least 2 letters and may include spaces.",
      },
      { status: 400 },
    );
  }

  if (!isValidBirthdate(birthdate)) {
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

  const passwordValidation = getPasswordValidation(password);
  const isPasswordValid = Object.values(passwordValidation).every(Boolean);
  if (!isPasswordValid) {
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
  const fullName = `${firstName} ${lastName}`.trim();
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
