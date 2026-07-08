import { SetMetadata } from '@nestjs/common';
import type { Action, Subjects } from '../casl-ability.types';

export type RequiredPermission = { action: Action; subject: Subjects };

export const REQUIRE_PERMISSIONS_KEY = 'require_permissions';

export const RequirePermissions = (...permissions: RequiredPermission[]) =>
  SetMetadata(REQUIRE_PERMISSIONS_KEY, permissions);
