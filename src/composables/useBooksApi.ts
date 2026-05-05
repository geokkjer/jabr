import type { Book } from '@/types'
import { usePostgrest } from './usePostgrest'

export function useBooksApi() {
  const pg = usePostgrest()

  async function list(params?: {
    search?: string
    sort?: string
    order?: 'asc' | 'desc'
    limit?: number
  }): Promise<Book[]> {
    const query: Record<string, unknown> = {
      select: 'id,title,author,format,size,identifiers,mtime',
      order: `${params?.sort || 'title'}.${params?.order || 'asc'}`,
      limit: params?.limit || 100,
    }

    if (params?.search) {
      query.or = `(title.ilike.*${params.search}*,author.ilike.*${params.search}*)`
    }

    return pg.get<Book>('books', query)
  }

  async function getById(id: string): Promise<Book | null> {
    return pg.getOne<Book>('books', id)
  }

  async function fetchContent(bookId: string, format: string): Promise<ArrayBuffer> {
    const mime =
      format === 'epub'
        ? 'application/epub+zip'
        : format === 'pdf'
          ? 'application/pdf'
          : 'text/plain'
    return pg.getBinary(bookId, mime)
  }

  return { list, getById, fetchContent }
}
