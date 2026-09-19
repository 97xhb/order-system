import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return {
      status: 'ok',
      service: 'order-system-api',
      timestamp: new Date().toISOString(),
    };
  }
}
