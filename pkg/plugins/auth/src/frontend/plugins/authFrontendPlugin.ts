/**
 * @invect/user-auth — Auth Frontend Plugin Definition
 *
 * Registers the auth plugin's frontend contributions:
 * - Sidebar item: "Users" (admin-only)
 * - Route: /users → UserManagementPage
 *
 * Note: AuthProvider is NOT included as a plugin provider because
 * AuthenticatedInvect already wraps the tree with it. This plugin
 * only adds the user management UI.
 */

import { Users } from 'lucide-react';
import { ProfilePage } from '../components/ProfilePage';
import { UserManagementPage } from '../components/UserManagementPage';
import { SidebarUserMenu } from '../components/SidebarUserMenu';
import type { InvectFrontendPlugin } from '@invect/ui';

export const authFrontend: InvectFrontendPlugin = {
  id: 'user-auth',
  name: 'User Authentication',

  // ─── Sidebar ───
  sidebar: [
    {
      label: 'Users',
      icon: Users,
      path: '/users',
      position: 'top',
      permission: 'admin:*',
    },
  ],

  // ─── Sidebar Footer (user avatar + sign-out menu) ───
  sidebarFooter: SidebarUserMenu,

  // ─── Routes ───
  routes: [
    {
      path: '/profile',
      component: ProfilePage,
    },
    {
      path: '/users',
      component: UserManagementPage,
    },
  ],
};
