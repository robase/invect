/**
 * woocommerce.create_product — Create a new product in a WooCommerce store
 *
 * Creates a product via the WooCommerce REST API.
 * Requires a WooCommerce API key credential (consumer key + consumer secret + site URL).
 */

import { defineAction } from '../define-action';
import { WOOCOMMERCE_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'WooCommerce credential is required'),
  name: z.string().min(1, 'Product name is required'),
  regularPrice: z.string().min(1, 'Regular price is required'),
  type: z.enum(['simple', 'grouped', 'external', 'variable']).optional().default('simple'),
  description: z.string().optional().default(''),
  shortDescription: z.string().optional().default(''),
});

export const woocommerceCreateProductAction = defineAction({
  id: 'woocommerce.create_product',
  name: 'Create Product',
  description:
    'Create a new product in a WooCommerce store. Specify name, price, type, and description.',
  provider: WOOCOMMERCE_PROVIDER,
  actionCategory: 'write',
  tags: ['woocommerce', 'product', 'ecommerce', 'create', 'write'],

  credential: {
    required: true,
    type: 'api_key',
    description: 'WooCommerce API credential (consumer key + consumer secret + site URL)',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'WooCommerce Credential',
        type: 'text',
        required: true,
        description: 'WooCommerce API credential for authentication',
        aiProvided: false,
      },
      {
        name: 'name',
        label: 'Product Name',
        type: 'text',
        required: true,
        description: 'The product name',
      },
      {
        name: 'regularPrice',
        label: 'Regular Price',
        type: 'text',
        required: true,
        placeholder: '29.99',
        description: 'Product regular price as a string (e.g. "29.99")',
      },
      {
        name: 'type',
        label: 'Product Type',
        type: 'select',
        defaultValue: 'simple',
        description: 'The type of product',
        options: [
          { label: 'Simple', value: 'simple' },
          { label: 'Grouped', value: 'grouped' },
          { label: 'External', value: 'external' },
          { label: 'Variable', value: 'variable' },
        ],
      },
      {
        name: 'description',
        label: 'Description',
        type: 'textarea',
        description: 'Full product description (HTML supported)',
      },
      {
        name: 'shortDescription',
        label: 'Short Description',
        type: 'textarea',
        description: 'Brief product summary (HTML supported)',
      },
    ],
  },

  async execute(params, context) {
    const { credentialId, name, regularPrice, type, description, shortDescription } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return { success: false, error: `Credential not found: ${credentialId}` };
    }

    const consumerKey = credential.config?.consumerKey as string;
    const consumerSecret = credential.config?.consumerSecret as string;
    const siteUrl = (credential.config?.siteUrl as string) ?? (credential.config?.url as string);

    if (!consumerKey || !consumerSecret) {
      return { success: false, error: 'WooCommerce consumer key and secret are required.' };
    }
    if (!siteUrl) {
      return { success: false, error: 'WooCommerce site URL is required in credential config.' };
    }

    const basicAuth = btoa(`${consumerKey}:${consumerSecret}`);

    context.logger.debug('Executing WooCommerce create product', { name, type });

    const product: Record<string, string> = {
      name,
      type,
      regular_price: regularPrice,
    };
    if (description) {
      product.description = description;
    }
    if (shortDescription) {
      product.short_description = shortDescription;
    }

    try {
      const response = await fetch(`${siteUrl}/wp-json/wc/v3/products`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(product),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `WooCommerce API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;

      return {
        success: true,
        output: data,
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create WooCommerce product: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
