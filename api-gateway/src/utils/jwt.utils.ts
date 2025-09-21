import { generateCorrelationId } from "../helpers/helpers.js";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { config } from "../config/config.js";

export interface JWTPayload extends JwtPayload {
  userId: string;
  email: string;
  sessionId: string;
  type: "access" | "refresh";
}

export class JWTUtils {
  static generateAccessToken(userId: string, email: string, sessionId: string): string {
    const payload: JWTPayload = {
      userId,
      email,
      sessionId,
      type: "access",
    };

    return jwt.sign(payload, config.jwt.secret, {
        expiresIn: config.jwt.accessTokenExpiry,
    } as SignOptions);
  }

  static generateRefreshToken(userId: string, email: string, sessionId: string): string {
    const payload: JWTPayload = {
      userId,
      email,
      sessionId,
      type: "refresh",
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.refreshTokenExpiry,
    } as SignOptions);
  }

  static verifyToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwt.secret) as JWTPayload;
  }

  static getTokenExpiry(token: string): Date | null {
    const decoded = jwt.decode(token) as JwtPayload | null;
    if (!decoded || !decoded.exp) return null;
    return new Date(decoded.exp * 1000);
  }

  static generateSessionId(): string {
    return generateCorrelationId();
  }
}
