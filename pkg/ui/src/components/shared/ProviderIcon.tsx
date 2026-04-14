'use client';

import { memo } from 'react';
import * as Icons from 'lucide-react';
import { Zap } from 'lucide-react';
import { cn } from '../../lib/utils';
import { PROVIDER_SVG_ICONS } from '../../assets/provider-icons';

/**
 * Provider IDs that have a bundled inline SVG.
 * Derived automatically from the PROVIDER_SVG_ICONS map, excluding `_light` variants.
 */
const PROVIDERS_WITH_SVG_ICON = new Set(
  Object.keys(PROVIDER_SVG_ICONS).filter((k) => !k.endsWith('_light')),
);

/**
 * Providers whose dark-fill logo is invisible on dark backgrounds.
 * For these we ship a `{id}_light` variant and swap via CSS.
 */
const PROVIDERS_WITH_LIGHT_VARIANT = new Set(['github', 'anthropic', 'core']);

const PROVIDERS_WITH_TALL_ASPECT = new Set(['core']);

/**
 * Resolve a Lucide icon component from its name string.
 * Falls back to Zap if the name is not found.
 */
export const getLucideIcon = (iconName?: string): React.ElementType => {
  if (!iconName) {
    return Zap;
  }
  // @ts-ignore - Dynamic access to icons
  return Icons[iconName] || Zap;
};

export interface ProviderIconProps {
  /** Provider id — when it matches a known provider, a bundled inline SVG is rendered */
  providerId?: string;
  /** Lucide icon name (e.g. "Mail", "Github") */
  icon?: string;
  /** Raw SVG markup string — takes precedence over `icon` (legacy, prefer providerId) */
  svgIcon?: string;
  /** CSS class applied to the wrapper / Lucide icon component */
  className?: string;
}

/**
 * Renders a provider icon with the following priority:
 *
 * 1. **Bundled inline SVG** — if `providerId` matches a known provider
 * 2. **Inline SVG string** — if `svgIcon` is provided (legacy fallback)
 * 3. **Lucide icon** — resolved from the `icon` name string
 */
export const ProviderIcon = memo(function ProviderIcon({
  providerId,
  icon,
  svgIcon,
  className,
}: ProviderIconProps) {
  const isTallLogo = providerId ? PROVIDERS_WITH_TALL_ASPECT.has(providerId) : false;

  // 1. Bundled inline SVG for known providers
  if (providerId && PROVIDERS_WITH_SVG_ICON.has(providerId)) {
    const svgMarkup = PROVIDER_SVG_ICONS[providerId];

    // Providers with a dark logo that needs a light variant for dark mode
    if (PROVIDERS_WITH_LIGHT_VARIANT.has(providerId)) {
      const lightSvgMarkup = PROVIDER_SVG_ICONS[`${providerId}_light`];

      if (isTallLogo) {
        return (
          <span className={cn('inline-flex items-center justify-center shrink-0', className)}>
            <span
              className="inline-flex items-center justify-center h-full dark:hidden [&>svg]:w-auto [&>svg]:h-full"
              style={{ aspectRatio: '109 / 209' }}
              dangerouslySetInnerHTML={{ __html: svgMarkup }}
            />
            <span
              className="hidden items-center justify-center h-full dark:inline-flex [&>svg]:w-auto [&>svg]:h-full"
              style={{ aspectRatio: '109 / 209' }}
              dangerouslySetInnerHTML={{ __html: lightSvgMarkup }}
            />
          </span>
        );
      }

      return (
        <>
          <span
            className={cn(
              'inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full dark:hidden',
              className,
            )}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
          <span
            className={cn(
              'hidden items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full dark:inline-flex',
              className,
            )}
            dangerouslySetInnerHTML={{ __html: lightSvgMarkup }}
          />
        </>
      );
    }

    if (isTallLogo) {
      return (
        <span className={cn('inline-flex items-center justify-center shrink-0', className)}>
          <span
            className="inline-flex items-center justify-center h-full [&>svg]:w-auto [&>svg]:h-full"
            style={{ aspectRatio: '109 / 209' }}
            dangerouslySetInnerHTML={{ __html: svgMarkup }}
          />
        </span>
      );
    }

    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    );
  }

  // 2. Inline SVG string (legacy — for custom / third-party providers)
  if (svgIcon) {
    return (
      <span
        className={cn(
          'inline-flex items-center justify-center shrink-0 [&>svg]:w-full [&>svg]:h-full',
          className,
        )}
        dangerouslySetInnerHTML={{ __html: svgIcon }}
      />
    );
  }

  // 3. Lucide icon fallback
  const LucideIcon = getLucideIcon(icon);
  return <LucideIcon className={className} />;
});

ProviderIcon.displayName = 'ProviderIcon';
