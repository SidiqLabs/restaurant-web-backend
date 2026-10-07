// Tests must provide required configuration explicitly rather than weakening
// production environment validation with development-only fallback values.
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://test:test@127.0.0.1:5432/restaurant_web_test";
process.env.JWT_SECRET =
  "test-only-jwt-secret-that-is-at-least-32-characters";
