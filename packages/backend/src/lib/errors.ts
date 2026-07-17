// lib/errors.ts — иерархия ошибок приложения
// Каждый класс имеет HTTP statusCode для автоматического маппинга в onError

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly code: string = "INTERNAL_ERROR",
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} ${id} не найден` : `${resource} не найден`, 404, "NOT_FOUND");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Доступ запрещён") {
    super(message, 403, "FORBIDDEN");
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Требуется авторизация") {
    super(message, 401, "UNAUTHORIZED");
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, message: string) {
    super(`${service}: ${message}`, 502, "EXTERNAL_SERVICE_ERROR");
  }
}
