import {
  createUser,
  findUserByEmail,
  findUserById,
  type UserRecord,
} from "./auth.repository.js";
import type {
  LoginInput,
  RegisterInput,
} from "./auth.schema.js";
import {
  hashPassword,
  verifyPassword,
} from "./password.js";
import { createAccessToken } from "./token.js";

export class AuthConflictError extends Error {}
export class InvalidCredentialsError extends Error {}
export class AuthenticatedUserNotFoundError extends Error {}

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRecord["role"];
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthResult {
  user: PublicUser;
  accessToken: string;
}

function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function hasErrorCode(
  error: unknown,
  code: string,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function isUniqueViolation(error: unknown): boolean {
  if (hasErrorCode(error, "23505")) {
    return true;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "cause" in error
  ) {
    return hasErrorCode(error.cause, "23505");
  }

  return false;
}

export async function registerUser(
  input: RegisterInput,
): Promise<AuthResult> {
  const passwordHash = await hashPassword(input.password);

  let user: UserRecord;

  try {
    user = await createUser({
      name: input.name,
      email: input.email,
      passwordHash,
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new AuthConflictError();
    }

    throw error;
  }

  return {
    user: toPublicUser(user),
    accessToken: await createAccessToken(user.id),
  };
}

export async function loginUser(
  input: LoginInput,
): Promise<AuthResult> {
  const user = await findUserByEmail(input.email);

  if (!user) {
    throw new InvalidCredentialsError();
  }

  const matches = await verifyPassword(
    user.passwordHash,
    input.password,
  );

  if (!matches) {
    throw new InvalidCredentialsError();
  }

  return {
    user: toPublicUser(user),
    accessToken: await createAccessToken(user.id),
  };
}

export async function getProfile(
  userId: string,
): Promise<PublicUser> {
  const user = await findUserById(userId);

  if (!user) {
    throw new AuthenticatedUserNotFoundError();
  }

  return toPublicUser(user);
}
