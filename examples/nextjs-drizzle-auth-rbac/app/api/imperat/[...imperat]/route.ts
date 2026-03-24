import { createInvectHandler } from '@invect/nextjs';
import { invectConfig } from '@/lib/invect';

const handler = createInvectHandler(invectConfig);

export const GET = handler.GET;
export const POST = handler.POST;
export const PATCH = handler.PATCH;
export const PUT = handler.PUT;
export const DELETE = handler.DELETE;
