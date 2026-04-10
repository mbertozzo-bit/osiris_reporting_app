import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthRequest extends Request {
  user?: {
    username: string;
  };
}

// In-memory token revocation store used to invalidate JWTs on logout.
// Key: raw token, Value: expiration timestamp (ms)
const revokedTokens = new Map<string, number>();

function cleanupRevokedTokens(): void {
  const now = Date.now();
  for (const [token, expiresAt] of revokedTokens.entries()) {
    if (expiresAt <= now) {
      revokedTokens.delete(token);
    }
  }
}

function isTokenRevoked(token: string): boolean {
  cleanupRevokedTokens();
  return revokedTokens.has(token);
}

export function revokeToken(token: string): void {
  if (!token) {
    return;
  }

  const decoded = jwt.decode(token) as jwt.JwtPayload | null;
  const expiresAtSeconds = typeof decoded?.exp === 'number' ? decoded.exp : undefined;
  const fallbackExpiresAt = Date.now() + (24 * 60 * 60 * 1000);
  const expiresAt = expiresAtSeconds ? expiresAtSeconds * 1000 : fallbackExpiresAt;

  revokedTokens.set(token, expiresAt);
  cleanupRevokedTokens();
}

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  if (isTokenRevoked(token)) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('JWT_SECRET not configured');
    }
    
    const decoded = jwt.verify(token, secret) as { username: string };
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function validateLoginCredentials(username: string, password: string): boolean {
  const expectedUsername = process.env.LOGIN_USERNAME || 'Osiris';
  const expectedPassword = process.env.LOGIN_PASSWORD || 'Osiris';
  
  console.log(`DEBUG AUTH: Attempt by "${username}". Expected: "${expectedUsername}"`);
  
  return username === expectedUsername && password === expectedPassword;
}

export function generateToken(username: string): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET not configured');
  }
  
  return jwt.sign({ username }, secret, { expiresIn: '24h' });
}
