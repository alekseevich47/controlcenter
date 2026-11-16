export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  if (error instanceof Error) {
    if (error.message === 'Некорректный id') {
      return new ApiError(400, 'validation', error.message)
    }
    if (error.message === 'Vault заблокирован') {
      return new ApiError(423, 'locked', error.message)
    }
    return new ApiError(400, 'validation', error.message.slice(0, 240))
  }
  return new ApiError(500, 'internal', 'Внутренняя ошибка')
}
