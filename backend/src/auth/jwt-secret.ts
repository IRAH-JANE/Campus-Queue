export function getJwtSecret(secret = process.env.JWT_SECRET): string {
  if (!secret || secret.trim().length === 0) {
    throw new Error(
      'JWT_SECRET is required. Set JWT_SECRET in the backend environment before starting the application.',
    );
  }

  return secret;
}
