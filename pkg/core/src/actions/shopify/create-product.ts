/**
 * shopify.create_product — Create a new product in a Shopify store
 *
 * Creates a product via the Shopify Admin REST API.
 * Requires a Shopify OAuth2 credential and the store subdomain.
 */

import { defineAction } from '../define-action';
import { SHOPIFY_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Shopify credential is required'),
  shop: z.string().min(1, 'Shop subdomain is required'),
  title: z.string().min(1, 'Product title is required'),
  bodyHtml: z.string().optional().default(''),
  vendor: z.string().optional().default(''),
  productType: z.string().optional().default(''),
  tags: z.string().optional().default(''),
});

export const shopifyCreateProductAction = defineAction({
  id: 'shopify.create_product',
  name: 'Create Product',
  description:
    'Create a new product in a Shopify store. Specify title, description, vendor, type, and tags.',
  provider: SHOPIFY_PROVIDER,
  actionCategory: 'write',
  tags: ['shopify', 'product', 'ecommerce', 'create', 'write', 'oauth2'],

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
        name: 'title',
        label: 'Title',
        type: 'text',
        required: true,
        description: 'The product title',
      },
      {
        name: 'bodyHtml',
        label: 'Description (HTML)',
        type: 'textarea',
        description: 'Product description in HTML format',
      },
      {
        name: 'vendor',
        label: 'Vendor',
        type: 'text',
        description: 'Product vendor / brand name',
      },
      {
        name: 'productType',
        label: 'Product Type',
        type: 'text',
        description: 'Product type (e.g. "Shoes", "T-Shirts")',
      },
      {
        name: 'tags',
        label: 'Tags',
        type: 'text',
        description: 'Comma-separated list of tags',
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, shop, title, bodyHtml, vendor, productType, tags } = params;

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

    context.logger.debug('Executing Shopify create product', { shop, title });

    const product: Record<string, string> = { title };
    if (bodyHtml) {
      product.body_html = bodyHtml;
    }
    if (vendor) {
      product.vendor = vendor;
    }
    if (productType) {
      product.product_type = productType;
    }
    if (tags) {
      product.tags = tags;
    }

    try {
      const response = await fetch(`${baseUrl}/products.json`, {
        method: 'POST',
        headers: {
          'X-Shopify-Access-Token': accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ product }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Shopify API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const data = (await response.json()) as { product: unknown };

      return {
        success: true,
        output: data.product,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create Shopify product: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
