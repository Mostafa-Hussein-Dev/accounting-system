import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { resolveCompanyId } from './current-company-id.decorator';

const COMPANY_ID = 'b3f1c2e0-1234-4a5b-9c8d-1234567890ab';
const OTHER_COMPANY_ID = 'c4a2d3f1-5678-4b6c-8d9e-2345678901bc';

function captureError(fn: () => unknown): unknown {
  try {
    fn();
    return undefined;
  } catch (error) {
    return error;
  }
}

describe('resolveCompanyId', () => {
  it("returns the caller's own companyId for a company-scoped user", () => {
    expect(
      resolveCompanyId({ userId: 'u1', companyId: COMPANY_ID }, undefined),
    ).toBe(COMPANY_ID);
  });

  it('ignores a query override for a company-scoped user (cannot escalate to another tenant)', () => {
    expect(
      resolveCompanyId(
        { userId: 'u1', companyId: COMPANY_ID },
        OTHER_COMPANY_ID,
      ),
    ).toBe(COMPANY_ID);
  });

  it('resolves a platform admin (companyId null) to the explicitly requested company', () => {
    expect(
      resolveCompanyId({ userId: 'admin', companyId: null }, COMPANY_ID),
    ).toBe(COMPANY_ID);
  });

  it('rejects a platform admin request with no ?companyId= provided', () => {
    const error = captureError(() =>
      resolveCompanyId({ userId: 'admin', companyId: null }, undefined),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'COMPANY_ID_QUERY_PARAM_REQUIRED',
    });
  });

  it('rejects a platform admin request with a malformed ?companyId=', () => {
    const error = captureError(() =>
      resolveCompanyId({ userId: 'admin', companyId: null }, 'not-a-uuid'),
    );
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      code: 'INVALID_COMPANY_ID',
    });
  });

  it('rejects when there is no authenticated user at all', () => {
    expect(() => resolveCompanyId(undefined, COMPANY_ID)).toThrow(
      ForbiddenException,
    );
  });
});
