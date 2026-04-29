import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface AuthClaims {
  sub: string;
  nombre: string;
  rol: 'admin' | 'repartidor';
}

export function signToken(claims: AuthClaims): string {
  return jwt.sign(claims, config.jwtSecret, { expiresIn: '7d' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta token Bearer.' });
    return;
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthClaims;
    (req as Request & { user?: AuthClaims }).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido.' });
  }
}

export function requireMobileKey(req: Request, res: Response, next: NextFunction): void {
  if (!config.apiKeyMobile) {
    next();
    return;
  }
  const auth = req.headers.authorization;
  const expected = `Bearer ${config.apiKeyMobile}`;
  if (auth !== expected) {
    res.status(401).json({ error: 'API key inválida.' });
    return;
  }
  next();
}

export function requireMobileKeyOrAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = req.headers.authorization;
  const hasMobileKey = !!config.apiKeyMobile;
  if (hasMobileKey && auth === `Bearer ${config.apiKeyMobile}`) {
    next();
    return;
  }
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Falta Bearer válido para GPS.' });
    return;
  }
  const token = auth.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as AuthClaims;
    (req as Request & { user?: AuthClaims }).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Token/API key inválida.' });
  }
}
