export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export class Paginated<T> {
  constructor(
    public readonly data: T[],
    public readonly meta: PaginationMeta,
  ) {}

  static of<T>(
    data: T[],
    total: number,
    page: number,
    limit: number,
  ): Paginated<T> {
    return new Paginated(data, {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  }
}
