import { ApiProperty } from '@nestjs/swagger';
import { AccountResponseDto } from './account-response.dto';

// A node in the chart-of-accounts tree (GET /accounts/tree): an account plus
// its nested children, ordered by account number at every level.
export class AccountTreeNodeDto extends AccountResponseDto {
  @ApiProperty({ type: () => [AccountTreeNodeDto] })
  children!: AccountTreeNodeDto[];
}
