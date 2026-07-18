import { MongoAbility } from '@casl/ability';

// The one file future modules extend when they add a subject — same role as
// TENANT_SCOPED_MODELS in prisma.service.ts for tenancy.
export type Action = 'create' | 'read' | 'update' | 'delete' | 'manage';
export type Subjects =
  | 'User'
  | 'Company'
  | 'Role'
  | 'Branch'
  | 'Currency'
  | 'ExchangeRate'
  | 'Account'
  | 'all';
export type AppAbility = MongoAbility<[Action, Subjects]>;
