import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CreateCompanyDto } from '../../companies/dto/create-company.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class RegisterUserDto extends OmitType(CreateUserDto, [
  'companyId',
] as const) {}

// The registrant is always the owner of the new company, so ownerUserId is not
// accepted here.
export class RegisterCompanyDto extends OmitType(CreateCompanyDto, [
  'ownerUserId',
] as const) {}

export class RegisterDto {
  @ApiProperty({
    description: 'The new company to create.',
    type: RegisterCompanyDto,
  })
  @ValidateNested()
  @Type(() => RegisterCompanyDto)
  company!: RegisterCompanyDto;

  @ApiProperty({
    description:
      "The company's first user. This user is created inside the new company — companyId is not accepted here, it is always the newly created company.",
    type: RegisterUserDto,
  })
  @ValidateNested()
  @Type(() => RegisterUserDto)
  user!: RegisterUserDto;
}
