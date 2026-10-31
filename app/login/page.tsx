export const metadata = { title: "Sign in · WeBuild Studio" };

const ERRORS: Record<string, string> = {
  wrong: "That password isn't right.",
  setup: "No password is set yet. Add CRM_PASSWORD in the project's environment variables, then redeploy.",
};

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="login">
      <picture>
        <source srcSet="/icon-dark.png" media="(prefers-color-scheme: dark)" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon-light.png" alt="" />
      </picture>
      <form method="post" action="/api/login">
        <input id="password" name="password" type="password" placeholder="Password" aria-label="Password" autoFocus autoComplete="current-password" required />
        <button type="submit">Sign in <kbd>↵</kbd></button>
      </form>
      {error && <p className="error">{ERRORS[error] ?? ERRORS.wrong}</p>}
    </main>
  );
}
