import nodemailer from "nodemailer";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail(to: string, subject: string, html: string) {
  if (process.env.NODE_ENV === "development" && !process.env.SMTP_HOST) {
    console.log(`[email] DEV — would send to ${to}: ${subject}`);
    return;
  }
  const transporter = createTransport();
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:5173";

export async function sendVerificationEmail(to: string, token: string) {
  const link = `${appUrl()}/verify-email?token=${token}`;
  await sendMail(
    to,
    "Verify your email – Uptime Monitor",
    `<p>Click the link below to verify your email address. This link expires in 24 hours.</p>
     <p><a href="${link}">${link}</a></p>`
  );
}

export async function sendAdminNewUserNotification(
  adminEmail: string,
  userEmail: string
) {
  await sendMail(
    adminEmail,
    `New user awaiting approval: ${userEmail}`,
    `<p>A new user <strong>${userEmail}</strong> has verified their email and is awaiting your approval.</p>
     <p><a href="${appUrl()}/admin">Review in admin panel →</a></p>`
  );
}

export async function sendApprovalEmail(to: string) {
  await sendMail(
    to,
    "Your account has been approved – Uptime Monitor",
    `<p>Great news! Your account has been approved. You can now log in and start monitoring your sites.</p>
     <p><a href="${appUrl()}/login">Log in →</a></p>`
  );
}

export async function sendRejectionEmail(to: string, reason?: string | null) {
  await sendMail(
    to,
    "Account application update – Uptime Monitor",
    `<p>Unfortunately your account application was not approved.</p>
     ${reason ? `<p>Reason: ${reason}</p>` : ""}
     <p>Contact support if you believe this is an error.</p>`
  );
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const link = `${appUrl()}/reset-password?token=${token}`;
  await sendMail(
    to,
    "Reset your password – Uptime Monitor",
    `<p>Click the link below to reset your password. This link expires in 1 hour and can only be used once.</p>
     <p><a href="${link}">${link}</a></p>
     <p>If you did not request a password reset, you can safely ignore this email.</p>`
  );
}
