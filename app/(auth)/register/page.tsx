import { signUp } from "../actions";
import { AuthForm, AuthLink } from "../auth-form";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const { error } = await searchParams;
  return (
    <AuthForm
      title="Register"
      submitLabel="Create account"
      pendingLabel="Creating the account"
      action={signUp}
      error={typeof error === "string" ? error : undefined}
      footer={<>Already registered? <AuthLink href="/login">Sign in</AuthLink></>}
    />
  );
}
