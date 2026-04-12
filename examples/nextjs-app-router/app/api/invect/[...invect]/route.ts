import { config } from '@/invect.config';
import { createInvectHandler } from '@invect/nextjs';

const handler = createInvectHandler(config);

export const GET = handler.GET;
export const POST = handler.POST;
export const PUT = handler.PUT;
export const DELETE = handler.DELETE;
export const PATCH = handler.PATCH;
