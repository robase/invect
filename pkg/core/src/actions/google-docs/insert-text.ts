/**
 * google_docs.insert_text — Insert text into a Google Docs document
 *
 * Inserts text at a specified position in an existing document.
 * Requires a Google Docs OAuth2 credential.
 */

import { defineAction } from '../define-action';
import { GOOGLE_DOCS_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const DOCS_API_BASE = 'https://docs.googleapis.com/v1/documents';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'Google Docs credential is required'),
  documentId: z.string().min(1, 'Document ID is required'),
  text: z.string().min(1, 'Text content is required'),
  index: z.number().int().min(1).optional().default(1),
});

export const googleDocsInsertTextAction = defineAction({
  id: 'google_docs.insert_text',
  name: 'Insert Text',
  description:
    'Insert text at a specific position in a Google Docs document. The index is 1-based (1 = beginning of document).',
  provider: GOOGLE_DOCS_PROVIDER,
  actionCategory: 'write',

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'google',
    description: 'Google Docs OAuth2 credential',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'Google Docs Credential',
        type: 'text',
        required: true,
        description: 'Google Docs OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'documentId',
        label: 'Document ID',
        type: 'text',
        required: true,
        description: 'The ID of the Google Docs document',
        aiProvided: true,
      },
      {
        name: 'text',
        label: 'Text',
        type: 'textarea',
        required: true,
        placeholder: 'Enter text to insert...',
        description: 'The text content to insert',
        aiProvided: true,
      },
      {
        name: 'index',
        label: 'Insert Position',
        type: 'number',
        defaultValue: 1,
        description: '1-based index position to insert the text (1 = beginning)',
        extended: true,
        aiProvided: true,
      },
    ],
  },

  tags: ['google', 'docs', 'document', 'insert', 'text', 'write', 'oauth2'],

  async execute(params, context) {
    const { credentialId, documentId, text, index } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return { success: false, error: `Credential not found: ${credentialId}` };
    }

    const accessToken = credential.config?.accessToken as string;
    if (!accessToken) {
      return { success: false, error: 'No valid access token. Please re-authorize.' };
    }

    context.logger.debug('Inserting text into Google Doc', {
      documentId,
      textLength: text.length,
      index,
    });

    try {
      const response = await fetch(`${DOCS_API_BASE}/${documentId}:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index },
                text,
              },
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `Google Docs API error: ${response.status} - ${errorText}`,
        };
      }

      return {
        success: true,
        output: {
          documentId,
          insertedAt: index,
          textLength: text.length,
          url: `https://docs.google.com/document/d/${documentId}/edit`,
        },
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return { success: false, error: `Google Docs operation failed: ${msg}` };
    }
  },
});
