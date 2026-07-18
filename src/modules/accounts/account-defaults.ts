import { AccountType, ControlType, NormalBalance } from '@prisma/client';

const { ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE } = AccountType;
const { DEBIT, CREDIT } = NormalBalance;

export interface DefaultAccountSeed {
  number: string;
  name: string;
  nameAr?: string;
  nameFr?: string;
  nameEn?: string;
  accountClass: number;
  type: AccountType;
  normalBalance: NormalBalance;
  /** Parent account's `number`, or null for a class-root account. Parents are
   *  always listed before their children so ids resolve in a single pass. */
  parentNumber: string | null;
  isControl?: boolean;
  controlType?: ControlType;
}

// A representative Plan Comptable Libanais skeleton (FR-104) — the 7 class roots
// plus common sub-accounts, including ALL control accounts (AR, AP, output/input
// VAT, cash, bank). Deliberately NOT the exhaustive official chart: it is a
// starting point each company edits and extends. Class-root nodes are grouping
// accounts (their type/normalBalance are representative of the class).
export const DEFAULT_CHART: DefaultAccountSeed[] = [
  // Class 1 — Capitaux propres (equity)
  {
    number: '1',
    name: 'Equity',
    nameFr: 'Capitaux propres',
    nameAr: 'رأس المال والاحتياطيات',
    accountClass: 1,
    type: EQUITY,
    normalBalance: CREDIT,
    parentNumber: null,
  },
  {
    number: '101',
    name: 'Share capital',
    nameFr: 'Capital',
    nameAr: 'رأس المال',
    accountClass: 1,
    type: EQUITY,
    normalBalance: CREDIT,
    parentNumber: '1',
  },
  {
    number: '110',
    name: 'Retained earnings',
    nameFr: 'Report à nouveau',
    nameAr: 'أرباح مدورة',
    accountClass: 1,
    type: EQUITY,
    normalBalance: CREDIT,
    parentNumber: '1',
  },
  {
    number: '120',
    name: 'Result for the year',
    nameFr: "Résultat de l'exercice",
    nameAr: 'نتيجة السنة',
    accountClass: 1,
    type: EQUITY,
    normalBalance: CREDIT,
    parentNumber: '1',
  },

  // Class 2 — Immobilisations (fixed assets)
  {
    number: '2',
    name: 'Fixed assets',
    nameFr: 'Immobilisations',
    nameAr: 'الأصول الثابتة',
    accountClass: 2,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: null,
  },
  {
    number: '210',
    name: 'Tangible fixed assets',
    nameFr: 'Immobilisations corporelles',
    nameAr: 'أصول ثابتة مادية',
    accountClass: 2,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '2',
  },

  // Class 3 — Stocks (inventory)
  {
    number: '3',
    name: 'Inventory',
    nameFr: 'Stocks',
    nameAr: 'المخزون',
    accountClass: 3,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: null,
  },
  {
    number: '310',
    name: 'Merchandise inventory',
    nameFr: 'Stocks de marchandises',
    nameAr: 'مخزون البضائع',
    accountClass: 3,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '3',
  },

  // Class 4 — Tiers (third parties)
  {
    number: '4',
    name: 'Third parties',
    nameFr: 'Tiers',
    nameAr: 'الغير',
    accountClass: 4,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: null,
  },
  {
    number: '400',
    name: 'Suppliers',
    nameFr: 'Fournisseurs',
    nameAr: 'الموردون',
    accountClass: 4,
    type: LIABILITY,
    normalBalance: CREDIT,
    parentNumber: '4',
    isControl: true,
    controlType: ControlType.AP,
  },
  {
    number: '410',
    name: 'Customers',
    nameFr: 'Clients',
    nameAr: 'العملاء',
    accountClass: 4,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '4',
    isControl: true,
    controlType: ControlType.AR,
  },
  {
    number: '445',
    name: 'State — VAT',
    nameFr: 'État — TVA',
    nameAr: 'الدولة - ضريبة القيمة المضافة',
    accountClass: 4,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '4',
  },
  {
    number: '4456',
    name: 'Input VAT (recoverable)',
    nameFr: 'TVA déductible',
    nameAr: 'ضريبة القيمة المضافة القابلة للاسترداد',
    accountClass: 4,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '445',
    isControl: true,
    controlType: ControlType.VAT_IN,
  },
  {
    number: '4457',
    name: 'Output VAT (collected)',
    nameFr: 'TVA collectée',
    nameAr: 'ضريبة القيمة المضافة المحصلة',
    accountClass: 4,
    type: LIABILITY,
    normalBalance: CREDIT,
    parentNumber: '445',
    isControl: true,
    controlType: ControlType.VAT_OUT,
  },

  // Class 5 — Comptes financiers (cash & bank)
  {
    number: '5',
    name: 'Financial accounts',
    nameFr: 'Comptes financiers',
    nameAr: 'الحسابات المالية',
    accountClass: 5,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: null,
  },
  {
    number: '510',
    name: 'Banks',
    nameFr: 'Banques',
    nameAr: 'المصارف',
    accountClass: 5,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '5',
    isControl: true,
    controlType: ControlType.BANK,
  },
  {
    number: '530',
    name: 'Cash on hand',
    nameFr: 'Caisse',
    nameAr: 'الصندوق',
    accountClass: 5,
    type: ASSET,
    normalBalance: DEBIT,
    parentNumber: '5',
    isControl: true,
    controlType: ControlType.CASH,
  },

  // Class 6 — Charges (expenses)
  {
    number: '6',
    name: 'Expenses',
    nameFr: 'Charges',
    nameAr: 'الأعباء',
    accountClass: 6,
    type: EXPENSE,
    normalBalance: DEBIT,
    parentNumber: null,
  },
  {
    number: '600',
    name: 'Purchases',
    nameFr: 'Achats',
    nameAr: 'المشتريات',
    accountClass: 6,
    type: EXPENSE,
    normalBalance: DEBIT,
    parentNumber: '6',
  },

  // Class 7 — Produits (revenue)
  {
    number: '7',
    name: 'Revenue',
    nameFr: 'Produits',
    nameAr: 'الإيرادات',
    accountClass: 7,
    type: REVENUE,
    normalBalance: CREDIT,
    parentNumber: null,
  },
  {
    number: '700',
    name: 'Sales',
    nameFr: 'Ventes',
    nameAr: 'المبيعات',
    accountClass: 7,
    type: REVENUE,
    normalBalance: CREDIT,
    parentNumber: '7',
  },
];
