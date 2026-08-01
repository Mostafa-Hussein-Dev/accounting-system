import { MongoAbility } from '@casl/ability';

// The one file future modules extend when they add a subject — same role as
// TENANT_SCOPED_MODELS in prisma.service.ts for tenancy.
// 'post' and 'reverse' are sensitive, independently-permissioned journal actions
// (FR-901/PRD §5) — distinct from plain update so they can be granted on their
// own. 'manage' still implies all of them.
export type Action =
  'create' | 'read' | 'update' | 'delete' | 'post' | 'reverse' | 'manage';
export type Subjects =
  | 'User'
  | 'Company'
  | 'Role'
  | 'Branch'
  | 'Currency'
  | 'ExchangeRate'
  | 'Account'
  | 'TaxRate'
  | 'DocumentSequence'
  | 'JournalEntry'
  | 'Permission'
  | 'AuditLog'
  | 'Partner'
  | 'Uom'
  | 'Item'
  | 'Pricelist'
  | 'Location'
  | 'Stock'
  | 'all';
export type AppAbility = MongoAbility<[Action, Subjects]>;
