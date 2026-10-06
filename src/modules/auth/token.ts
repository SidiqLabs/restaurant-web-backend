import { SignJWT, jwtVerify } from "jose";

import { env } from "../../config/env.js";

const ALGORITHM = "HS256";
const ISSUER = "foody-backend";
const AUDIENCE = "foody-frontend";
const ACCESS_TOKEN_LIFETIME = "15m";

const signingKey = new TextEncoder().encode(env.JWT_SECRET);

export async function createAccessToken(
  userId: string,
): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({
      alg: ALGORITHM,
      typ: "JWT",
    })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_LIFETIME)
    .sign(signingKey);
}

export async function verifyAccessToken(
  token: string,
): Promise<string> {
  const { payload } = await jwtVerify(token, signingKey, {
    algorithms: [ALGORITHM],
    issuer: ISSUER,
    audience: AUDIENCE,
    requiredClaims: ["sub", "iat", "exp"],
  });

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new Error("Invalid access token subject");
  }

  return payload.sub;
}
