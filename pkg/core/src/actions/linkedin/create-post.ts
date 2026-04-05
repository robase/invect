/**
 * linkedin.create_post — Create a LinkedIn post
 *
 * Publishes a text post on behalf of the authenticated user using the
 * UGC Posts API. The personId (LinkedIn URN sub) is required and can be
 * obtained from the linkedin.get_profile action.
 * Requires a LinkedIn OAuth2 credential with w_member_social scope.
 */

import { defineAction } from '../define-action';
import { LINKEDIN_PROVIDER } from '../providers';
import { z } from 'zod/v4';

const LINKEDIN_API = 'https://api.linkedin.com';

const paramsSchema = z.object({
  credentialId: z.string().min(1, 'LinkedIn credential is required'),
  personId: z.string().min(1, 'LinkedIn person ID (sub) is required'),
  text: z.string().min(1, 'Post text is required'),
});

export const linkedinCreatePostAction = defineAction({
  id: 'linkedin.create_post',
  name: 'Create Post',
  description:
    'Create a text post on LinkedIn. Requires the person ID (obtainable from Get Profile) and the post content.',
  provider: LINKEDIN_PROVIDER,
  actionCategory: 'write',

  credential: {
    required: true,
    type: 'oauth2',
    oauth2Provider: 'linkedin',
    description: 'LinkedIn OAuth2 credential with w_member_social scope',
  },

  params: {
    schema: paramsSchema,
    fields: [
      {
        name: 'credentialId',
        label: 'LinkedIn Credential',
        type: 'text',
        required: true,
        description: 'LinkedIn OAuth2 credential for authentication',
        aiProvided: false,
      },
      {
        name: 'personId',
        label: 'Person ID',
        type: 'text',
        required: true,
        placeholder: 'abc123def',
        description:
          'LinkedIn person URN ID (the "sub" field from Get Profile). Used as urn:li:person:{personId}.',
        aiProvided: true,
      },
      {
        name: 'text',
        label: 'Post Text',
        type: 'textarea',
        required: true,
        placeholder: 'Excited to share...',
        description: 'The text content of the post. Supports Nunjucks templating.',
        aiProvided: true,
      },
    ],
  },

  tags: ['linkedin', 'post', 'share', 'social', 'write', 'oauth2'],

  async execute(params, context) {
    const { credentialId, personId, text } = params;

    let credential = context.credential;
    if (!credential && context.functions?.getCredential) {
      credential = await context.functions.getCredential(credentialId);
    }
    if (!credential) {
      return {
        success: false,
        error: `Credential not found: ${credentialId}. Please create a LinkedIn OAuth2 credential.`,
      };
    }

    const accessToken =
      (credential.config?.accessToken as string) ?? (credential.config?.token as string);
    if (!accessToken) {
      return {
        success: false,
        error: 'No valid access token in credential. Please re-authorize the LinkedIn credential.',
      };
    }

    context.logger.debug('Creating LinkedIn post', { personId });

    const body = {
      author: `urn:li:person:${personId}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    try {
      const response = await fetch(`${LINKEDIN_API}/v2/ugcPosts`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `LinkedIn API error: ${response.status} ${response.statusText} - ${errorText}`,
        };
      }

      const result = (await response.json()) as { id: string };

      return {
        success: true,
        output: {
          postId: result.id,
          author: `urn:li:person:${personId}`,
          text,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to create LinkedIn post: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});
