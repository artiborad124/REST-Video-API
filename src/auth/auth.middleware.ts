import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    if (req.originalUrl.includes('/share') || req.originalUrl.includes('/uploads')  ) {
      return next();
    }
    const token = req.headers['authorization'];
    const staticToken = process.env.STATIC_API_TOKEN;
    
    if (!token || token !== staticToken) {
      throw new UnauthorizedException('Invalid API Token');
    }
    next();
  }
}