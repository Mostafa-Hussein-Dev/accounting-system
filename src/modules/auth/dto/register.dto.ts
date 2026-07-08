import { ApiProperty, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CreateCompanyDto } from '../../companies/dto/create-company.dto';
import { CreateUserDto } from '../../users/dto/create-user.dto';

export class RegisterUserDto extends OmitType(CreateUserDto, [
  'companyId',
] as const) {}

export class RegisterDto {
  @ApiProperty({
    description: 'The new company to create.',
    type: CreateCompanyDto,
  })
  @ValidateNested()
  @Type(() => CreateCompanyDto)
  company!: CreateCompanyDto;

  @ApiProperty({
    description:
      "The company's first user. This user is created inside the new company — companyId is not accepted here, it is always the newly created company.",
    type: RegisterUserDto,
  })
  @ValidateNested()
  @Type(() => RegisterUserDto)
  user!: RegisterUserDto;
}
