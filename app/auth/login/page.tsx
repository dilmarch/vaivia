import AuthPageShell from "@/components/AuthPageShell";
import { LoginForm } from "@/components/login-form";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;

  return (
    <AuthPageShell>
      <LoginForm initialError={params.error} />
    </AuthPageShell>
  );
}
