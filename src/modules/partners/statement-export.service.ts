import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import ExcelJS from 'exceljs';
import { PartnerStatementResponseDto } from './dto/partner-statement-response.dto';

const usd = (n: number): string =>
  n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const lbp = (n: number | null): string =>
  n === null ? '—' : n.toLocaleString('en-US', { maximumFractionDigits: 0 });

/**
 * Renders a partner statement (FR-303) to PDF (pdfkit) or Excel (exceljs). Pure
 * formatting over the already-computed PartnerStatementResponseDto — no DB access.
 */
@Injectable()
export class StatementExportService {
  toPdf(s: PartnerStatementResponseDto): Promise<Buffer> {
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    const done = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    // Header
    doc.fontSize(18).text('Account Statement', { align: 'left' });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .text(`${s.name}  (${s.ref})`)
      .text(`Period: ${s.from} to ${s.to}`)
      .text(
        `Orientation: ${s.orientation} — a positive balance means ${
          s.orientation === 'receivable'
            ? 'the customer owes us'
            : 'we owe the supplier'
        }`,
      );
    if (s.conversion) {
      doc.text(
        `LBP rate (${s.conversion.rateType}, ${s.conversion.rateDate}): ${lbp(s.conversion.rate)} / USD`,
      );
    } else {
      doc.text(
        'LBP columns unavailable (no exchange rate on file for the period).',
      );
    }
    doc.moveDown(0.5);

    // Column layout (USD table; LBP summarised in the totals block).
    const cols = [
      { x: 40, w: 62, label: 'Date' },
      { x: 102, w: 78, label: 'Entry' },
      { x: 180, w: 150, label: 'Description' },
      { x: 330, w: 72, label: 'Debit', right: true },
      { x: 402, w: 72, label: 'Credit', right: true },
      { x: 474, w: 82, label: 'Balance', right: true },
    ];
    const drawRow = (
      cells: string[],
      y: number,
      opts: { bold?: boolean } = {},
    ): void => {
      doc.fontSize(9).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica');
      cols.forEach((c, i) => {
        doc.text(cells[i] ?? '', c.x, y, {
          width: c.w,
          align: c.right ? 'right' : 'left',
          lineBreak: false,
          ellipsis: true,
        });
      });
    };

    let y = doc.y;
    drawRow(
      cols.map((c) => c.label),
      y,
      { bold: true },
    );
    y += 16;
    doc
      .moveTo(40, y - 3)
      .lineTo(556, y - 3)
      .stroke();

    drawRow(['', '', 'Opening balance', '', '', usd(s.openingBalanceBase)], y, {
      bold: true,
    });
    y += 15;

    for (const r of s.rows) {
      if (y > 780) {
        doc.addPage();
        y = 40;
        drawRow(
          cols.map((c) => c.label),
          y,
          { bold: true },
        );
        y += 16;
      }
      drawRow(
        [
          r.date,
          r.entryNumber ?? '—',
          r.description ?? r.reference ?? '',
          r.debitBase ? usd(r.debitBase) : '',
          r.creditBase ? usd(r.creditBase) : '',
          usd(r.runningBalanceBase),
        ],
        y,
      );
      y += 14;
    }

    doc
      .moveTo(40, y + 2)
      .lineTo(556, y + 2)
      .stroke();
    y += 8;
    drawRow(
      [
        '',
        '',
        'Totals / Closing',
        usd(s.totalDebitBase),
        usd(s.totalCreditBase),
        usd(s.closingBalanceBase),
      ],
      y,
      { bold: true },
    );
    y += 18;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(
        `Closing balance: USD ${usd(s.closingBalanceBase)}` +
          (s.closingBalanceDisplay !== null
            ? `   |   LBP ${lbp(s.closingBalanceDisplay)}`
            : ''),
        40,
        y + 6,
      );

    doc.end();
    return done;
  }

  async toExcel(s: PartnerStatementResponseDto): Promise<Buffer> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Statement');

    ws.addRow(['Account Statement']).font = { size: 14, bold: true };
    ws.addRow([`${s.name} (${s.ref})`]);
    ws.addRow([`Period`, `${s.from} to ${s.to}`]);
    ws.addRow([`Orientation`, s.orientation]);
    ws.addRow([
      'LBP rate',
      s.conversion
        ? `${s.conversion.rate} /USD (${s.conversion.rateType}, ${s.conversion.rateDate})`
        : 'no rate on file',
    ]);
    ws.addRow([]);

    const header = [
      'Date',
      'Entry',
      'Reference',
      'Description',
      'Debit (USD)',
      'Credit (USD)',
      'Balance (USD)',
      'Debit (LBP)',
      'Credit (LBP)',
      'Balance (LBP)',
    ];
    const headerRow = ws.addRow(header);
    headerRow.font = { bold: true };

    ws.addRow([
      '',
      '',
      '',
      'Opening balance',
      '',
      '',
      s.openingBalanceBase,
      '',
      '',
      s.openingBalanceDisplay,
    ]);
    for (const r of s.rows) {
      ws.addRow([
        r.date,
        r.entryNumber ?? '',
        r.reference ?? '',
        r.description ?? '',
        r.debitBase || null,
        r.creditBase || null,
        r.runningBalanceBase,
        r.debitDisplay,
        r.creditDisplay,
        r.runningBalanceDisplay,
      ]);
    }
    const totals = ws.addRow([
      '',
      '',
      '',
      'Totals / Closing',
      s.totalDebitBase,
      s.totalCreditBase,
      s.closingBalanceBase,
      s.totalDebitDisplay,
      s.totalCreditDisplay,
      s.closingBalanceDisplay,
    ]);
    totals.font = { bold: true };

    ws.columns.forEach((c) => {
      c.width = 15;
    });

    return Buffer.from(await wb.xlsx.writeBuffer());
  }
}
