import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PermissionResponseDto } from './dto/permission-response.dto';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * All seeded permissions (global reference data), ordered by subject/action —
   * for the frontend's custom-role builder to populate a permissions picker.
   * Small fixed catalogue, so it is returned unpaginated.
   */
  async findAll(): Promise<PermissionResponseDto[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: [{ subject: 'asc' }, { action: 'asc' }],
    });
    return permissions.map(PermissionResponseDto.fromEntity);
  }
}
