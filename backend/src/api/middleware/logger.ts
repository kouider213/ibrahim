import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on('finish', () => {
    const ms    = Date.now() - start;
    const color = res.statusCode >= 500 ? '\x1b[31m'
                : res.statusCode >= 400 ? '\x1b[33m'
                : '\x1b[32m';
    console.log(
      `${color}[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} +${ms}ms\x1b[0m`,
    );
  });
  next();
}

export function errorHandler(
  err:   Error,
  _req:  Request,
  res:   Response,
  _next: NextFunction,
): void {
  console.error('[error]', err.message, err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
}
