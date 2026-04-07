-- RLS on `profiles` calls `is_superadmin()`, which queried `profiles` again as the
-- same role — infinite recursion → "stack depth limit exceeded" (SQLSTATE 54001).
-- SECURITY DEFINER runs the lookup with the function owner's privileges so the
-- inner SELECT does not re-enter RLS for the invoker.

alter function public.is_superadmin() security definer;
alter function public.is_superadmin() set search_path = public;
