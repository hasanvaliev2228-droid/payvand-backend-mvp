import type { ApiResponse } from '../lib/response';

export type { ApiResponse };

export interface ListResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
