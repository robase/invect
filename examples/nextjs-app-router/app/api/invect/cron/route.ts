import { config } from '@/invect.config';
import { createInvectCronHandler } from '@invect/nextjs';

export const GET = createInvectCronHandler(config);
