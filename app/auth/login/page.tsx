import AuthPageShell from "@/components/AuthPageShell";
import { LoginForm } from "@/components/login-form";
import { normalizeAuthNext } from "@/lib/authNext";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthPageShell>
      <LoginForm
        initialError={params.error}
        redirectTo={normalizeAuthNext(params.next)}
      />
    </AuthPageShell>
  );
}
