import { useTheme } from '../contexts/ThemeProvider';

/**
 * Returns the class name string for portal wrappers that need to be inside the
 * `.invect` CSS scope.
 *
 * Radix portals render to `document.body`, which sits outside the main `.invect`
 * container. Without a wrapper, portal content loses access to invect's CSS
 * variables and the Tailwind `dark:` variant.
 *
 * Usage:
 * ```tsx
 * const portalClass = useInvectPortalClass();
 * return (
 *   <SomePrimitive.Portal>
 *     <div className={portalClass}>
 *       {children}
 *     </div>
 *   </SomePrimitive.Portal>
 * );
 * ```
 */
export function useInvectPortalClass(): string {
  const { resolvedTheme } = useTheme();

  return `invect ${resolvedTheme}`;
}
