import { eq } from "drizzle-orm";

import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";

export type UserRecord = typeof users.$inferSelect;

interface CreateUserInput {
  name: string;
  email: string;
  passwordHash: string;
}

export async function createUser(
  input: CreateUserInput,
): Promise<UserRecord> {
  const [user] = await db
    .insert(users)
    .values({
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
    })
    .returning();

  if (!user) {
    throw new Error("User insert did not return a record");
  }

  return user;
}

export async function findUserByEmail(
  email: string,
): Promise<UserRecord | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  return user;
}

export async function findUserById(
  id: string,
): Promise<UserRecord | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return user;
}
