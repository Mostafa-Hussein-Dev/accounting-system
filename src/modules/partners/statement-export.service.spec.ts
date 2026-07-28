import { StatementExportService } from './statement-export.service';
import { PartnerStatementResponseDto } from './dto/partner-statement-response.dto';

const sample = (): PartnerStatementResponseDto => ({
  partnerId: 'p1',
  ref: '410001',
  name: 'ACME Trading SARL',
  from: '2026-01-01',
  to: '2026-03-31',
  baseCurrency: 'USD',
  displayCurrency: 'LBP',
  orientation: 'receivable',
  conversion: {
    currency: 'LBP',
    rateType: 'Official',
    rate: 89500,
    rateDate: '2026-03-31',
  },
  openingBalanceBase: 100,
  openingBalanceDisplay: 8950000,
  rows: [
    {
      date: '2026-03-01',
      entryNumber: 'JE-2026-0001',
      journalEntryId: 'j1',
      reference: 'INV-1',
      description: 'Sale',
      debitBase: 250,
      creditBase: 0,
      runningBalanceBase: 350,
      amountOriginal: 250,
      currency: 'USD',
      debitDisplay: 22375000,
      creditDisplay: 0,
      runningBalanceDisplay: 31325000,
    },
  ],
  totalDebitBase: 250,
  totalCreditBase: 0,
  totalDebitDisplay: 22375000,
  totalCreditDisplay: 0,
  closingBalanceBase: 350,
  closingBalanceDisplay: 31325000,
});

describe('StatementExportService', () => {
  const svc = new StatementExportService();

  it('renders a valid PDF buffer', async () => {
    const buf = await svc.toPdf(sample());
    expect(buf.length).toBeGreaterThan(500);
    // PDF magic bytes.
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders a valid XLSX buffer', async () => {
    const buf = await svc.toExcel(sample());
    expect(buf.length).toBeGreaterThan(500);
    // XLSX is a ZIP: starts with "PK".
    expect(buf.subarray(0, 2).toString('latin1')).toBe('PK');
  });

  it('handles a statement with no conversion rate', async () => {
    const s = sample();
    s.conversion = null;
    s.closingBalanceDisplay = null;
    s.rows[0].runningBalanceDisplay = null;
    const pdf = await svc.toPdf(s);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
