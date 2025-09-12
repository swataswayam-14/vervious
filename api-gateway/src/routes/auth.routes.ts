import { Router, type Request, type Response, type NextFunction } from "express";
import { type ZodSchema, ZodError, z } from "zod";
import { getNatsClient } from "../nats/client.js";

import { NATS_SUBJECTS, type AuthLoginRequest,
    type AuthLoginResponse,
    type AuthRegisterRequest,
    type ApiResponse, } from "../types/message.types.js";
import { userSchema } from "../utils/validations.js";

const router = Router();

const validate =
  (schema: ZodSchema, source: "body" | "query" | "params" = "body") =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      req[source] = schema.parse(req[source]);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const response: ApiResponse = {
          success: false,
          error: "Validation failed",
          data: err.issues,
        };
        return res.status(400).json(response);
      }
      next(err);
    }
  };

router.post("/register", validate(userSchema), async (req, res, next) => {
  try {
    const { email, password, name, role} = req.body;

    const natsClient = getNatsClient();
    const registerRequest: AuthRegisterRequest = {
      email,
      password,
      name,
      role,
      messageId: Date.now().toString(),
      timestamp: new Date(),
    };

    const registerResponse = await natsClient.request<
      AuthRegisterRequest,
      AuthLoginResponse
    >(NATS_SUBJECTS.AUTH_REGISTER, registerRequest, 10000);
    
    if (!registerResponse.success) {
      return res.status(400).json({
        success: false,
        error: registerResponse.error,
      });
    }

    res.status(201).json({
      success: true,
      data: {
        user: registerResponse.user,
        tokens: registerResponse.tokens,
      },
      message: "User registered successfully",
    });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/login",
  validate(
    userSchema.pick({ email: true, password: true })
  ),
  async (req, res, next) => {
    try {
      const { email, password } = req.body;

      const natsClient = getNatsClient();
      const loginRequest: AuthLoginRequest = {
        email,
        password,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const loginResponse = await natsClient.request<
        AuthLoginRequest,
        AuthLoginResponse
      >(NATS_SUBJECTS.AUTH_LOGIN, loginRequest, 10000);

      if (!loginResponse.success) {
        return res.status(401).json({
          success: false,
          error: loginResponse.error,
        });
      }

      res.json({
        success: true,
        data: {
          user: loginResponse.user,
          tokens: loginResponse.tokens,
        },
        message: "Login successful",
      });
    } catch (error) {
      next(error);
    }
  }
);
router.post(
  "/refresh",
  validate(
    userSchema.pick({ email: true }).extend({
      refreshToken: z.string().min(1, "Refresh token is required"),
    })
  ),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      const natsClient = getNatsClient();
      const refreshRequest = {
        refreshToken,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const refreshResponse = await natsClient.request<
        any,
        AuthLoginResponse
      >(
        NATS_SUBJECTS.AUTH_REFRESH,
        refreshRequest,
        10000
      );

      if (!refreshResponse.success) {
        return res.status(401).json({
          success: false,
          error: refreshResponse.error,
        });
      }

      res.json({
        success: true,
        data: {
          tokens: refreshResponse.tokens,
        },
        message: "Token refreshed successfully",
      });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/logout",
  validate(
    z.object({
      refreshToken: z.string().min(1, "Refresh token is required"),
    })
  ),
  async (req, res, next) => {
    try {
      const { refreshToken } = req.body;

      const natsClient = getNatsClient();
      const logoutRequest = {
        refreshToken,
        messageId: Date.now().toString(),
        timestamp: new Date(),
      };

      const logoutResponse = await natsClient.request<
        any,
        { success: boolean; error?: string; message?: string }
      >(NATS_SUBJECTS.AUTH_LOGOUT, logoutRequest, 5000);

      if (!logoutResponse.success) {
        return res.status(400).json({
          success: false,
          error: logoutResponse.error || "Logout failed",
        });
      }

      res.json({
        success: true,
        message: logoutResponse.message || "Logout successful",
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as authRoutes };
