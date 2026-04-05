/**
 * shopify.list_products — List products from a Shopify store
 *
 * Retrieves products from the Shopify Admin REST API.
 * Requires a Shopify OAuth2 credential and the store subdomain.
 */

import { defineAction } from '../define-action';
import { SHOPIFY_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Shopify credential is required'),
  shop: z.string().min(1, 'Shop subdomain is required'),
  limit: z.number().int().min(1).max(250).optional().default(50),
});

export const shopifyListProductsAction = defineAction({
  id: 'shopify.list_products',
  name: 'List Products',
  description:
    'List products from a Shopify store. Returns product titles, descriptions, variants, and pricing.',
  provider: SHOPIFY_PROVIDER,
  actionCategory: 'read',
  tags: ['shopify', 'products', 'ecommerce', 'list', 'oauth2'],

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'shopify',
    description: 'Shopify OAuth2 credential for store access',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Shopify Credential',
        type: 'text',
        required: true,
        description: 'Shopify OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'shop',
        label: 'Shop Subdomain',
        type: 'text',
        required: true,
        placeholder: 'mystore',
        description: 'Shopify store subdomain (e.g. "mystore" for mystore.myshopify.com)',
        aiProvided: false,
      },
      {
        name: 'limit',
        label: 'Limit',
        type: 'number',
        defaultValue: 50,
        description: 'Maximum number of products to return (1–250)',
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, shop, limit } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return { success: false, error: `Credential not found: ${credentialId}` };
    }

    const accessToken =
      (credential.config?.accessToken as string) ?? (credential.config?.token as string);
    if (!accessToken) {
      return { success: false, error: 'No valid access token.' };
    }

    const baseUrl = `https://${encodeURIComponent(shop)}.myshopify.com/admin/api/2024-01`;

    context.logger.debug('Executing Shopify list products', { shop, limit });

    try {
      const response = await fetch(`${baseUrl}/products.json?limit=${limit}`, {
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Shopify API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const data = (await response.json()) as { products: unknown[] };

      return {
        success: true,
        output: {
          products: data.products,
          count: data.products.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to list Shopify products: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
