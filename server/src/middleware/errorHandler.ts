import type { Request, Response, NextFunction } from 'express';

interface ApiError extends Error {
  statusCode?: number;
  code?: string;
}

/**
 * 전역 에러 핸들러
 */
export function errorHandler(
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);

  // fal.ai 에러 매핑
  if (err.message.includes('rate limit') || err.message.includes('Too Many Requests')) {
    return res.status(429).json({
      error: 'RATE_LIMITED',
      message: 'API 호출 한도 초과. 잠시 후 다시 시도해주세요.',
      retryAfter: 60
    });
  }

  if (err.message.includes('invalid image') || err.message.includes('Invalid image')) {
    return res.status(400).json({
      error: 'INVALID_IMAGE',
      message: '이미지 형식이 올바르지 않습니다.'
    });
  }

  if (err.message.includes('not found') || err.message.includes('Not Found')) {
    return res.status(404).json({
      error: 'REQUEST_NOT_FOUND',
      message: '요청을 찾을 수 없습니다.'
    });
  }

  if (err.message.includes('Unauthorized') || err.message.includes('API key')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'API 키가 유효하지 않습니다. 서버 설정을 확인해주세요.'
    });
  }

  // 기본 에러
  res.status(err.statusCode || 500).json({
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production'
      ? '서버 오류가 발생했습니다.'
      : err.message
  });
}
