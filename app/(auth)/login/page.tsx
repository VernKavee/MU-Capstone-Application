import { signIn } from "../actions";
import { AuthForm, AuthLink } from "../auth-form";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams;
  return (
    <AuthForm
      title="Sign in"
      submitLabel="Sign in"
      action={signIn}
      error={typeof error === "string" ? error : undefined}
      footer={<>No account? <AuthLink href="/register">Register</AuthLink></>}
    />
  );
}
