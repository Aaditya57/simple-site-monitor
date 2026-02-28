/** Verifies a captcha token server-side. Returns true if valid. */
export async function verifyCaptcha(token: string): Promise<boolean> {
  if (process.env.NODE_ENV === "development" && !process.env.CAPTCHA_SECRET) {
    // Skip captcha in development if not configured
    return true;
  }

  const provider = process.env.CAPTCHA_PROVIDER ?? "hcaptcha";
  const secret = process.env.CAPTCHA_SECRET!;

  const url =
    provider === "recaptcha"
      ? "https://www.google.com/recaptcha/api/siteverify"
      : "https://hcaptcha.com/siteverify";

  const body = new URLSearchParams({ secret, response: token });

  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  const data = (await resp.json()) as { success: boolean };
  return data.success === true;
}
