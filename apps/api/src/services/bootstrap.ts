import argon2 from "argon2";
import { getDb, users } from "@monitor/db";
import { eq } from "drizzle-orm";

export async function bootstrapAdmin() {
  const db = getDb();
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn("[bootstrap] ADMIN_EMAIL / ADMIN_PASSWORD not set; skipping admin bootstrap");
    return;
  }

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, "admin"))
    .limit(1);

  if (existing.length > 0) {
    console.log("[bootstrap] Admin user already exists; skipping");
    return;
  }

  const passwordHash = await argon2.hash(adminPassword);
  await db.insert(users).values({
    fullName: "Admin",
    email: adminEmail,
    passwordHash,
    role: "admin",
    status: "approved",
    emailVerified: true,
  });

  console.log(`[bootstrap] Admin user created: ${adminEmail}`);
}
