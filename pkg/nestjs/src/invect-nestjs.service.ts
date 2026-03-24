import { Injectable, Inject } from '@nestjs/common';
import { Invect } from '@invect/core';

@Injectable()
export class InvectService {
  constructor(@Inject('INVECT_CORE') private readonly core: Invect) {}

  getCore(): Invect {
    return this.core;
  }
}
