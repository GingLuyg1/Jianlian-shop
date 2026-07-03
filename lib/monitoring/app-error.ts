import type { AppErrorCode } from "./error-codes";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly status: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message = "提交内容不完整或格式不正确。") { super("VALIDATION_FAILED", message, 400); }
}
export class AuthenticationError extends AppError {
  constructor(message = "请先登录。") { super("AUTH_REQUIRED", message, 401); }
}
export class AuthorizationError extends AppError {
  constructor(message = "无权限执行此操作。") { super("PERMISSION_DENIED", message, 403); }
}
export class NotFoundError extends AppError {
  constructor(code: AppErrorCode = "PRODUCT_NOT_FOUND", message = "请求的资源不存在。") { super(code, message, 404); }
}
export class ConflictError extends AppError {
  constructor(message = "数据已被修改，请刷新后重试。") { super("INTERNAL_ERROR", message, 409); }
}
export class RateLimitError extends AppError {
  constructor(message = "请求过于频繁，请稍后再试。") { super("INTERNAL_ERROR", message, 429); }
}
export class ExternalServiceError extends AppError {
  constructor(message = "外部服务暂时不可用。") { super("INTERNAL_ERROR", message, 503); }
}
export class DatabaseError extends AppError {
  constructor(message = "数据库暂时不可用，请稍后重试。") { super("DATABASE_UNAVAILABLE", message, 503); }
}
