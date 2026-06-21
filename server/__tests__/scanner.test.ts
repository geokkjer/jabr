// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseBookEntry } from '../scanner.js'
import type { Book } from '../scanner.js'

describe('parseBookEntry', () => {
  const baseDate = new Date('2024-01-01')

  it('parses Author - Title format', () => {
    const result = parseBookEntry('Tolkien - The Hobbit.epub', '.epub', 'Tolkien - The Hobbit.epub', '', 1000, baseDate)
    expect(result.title).toBe('The Hobbit')
    expect(result.author).toBe('Tolkien')
    expect(result.format).toBe('epub')
  })

  it('handles titles with hyphens', () => {
    const result = parseBookEntry('Dostoevsky - Crime and Punishment - A New Translation.epub', '.epub', 'path.epub', '', 2000, baseDate)
    expect(result.title).toBe('Crime and Punishment - A New Translation')
    expect(result.author).toBe('Dostoevsky')
  })

  it('uses parent directory as author when no dash', () => {
    const result = parseBookEntry('The Great Gatsby.pdf', '.pdf', 'Fitzgerald/The Great Gatsby.pdf', 'Fitzgerald', 3000, baseDate)
    expect(result.title).toBe('The Great Gatsby')
    expect(result.author).toBe('Fitzgerald')
  })

  it('defaults to Unknown when no author info', () => {
    const result = parseBookEntry('untitled.txt', '.txt', 'untitled.txt', '', 500, baseDate)
    expect(result.title).toBe('untitled')
    expect(result.author).toBe('Unknown')
  })

  it('sets format from extension', () => {
    const result = parseBookEntry('test.md', '.md', 'test.md', '', 100, baseDate)
    expect(result.format).toBe('md')
  })

  it('includes file stats', () => {
    const result = parseBookEntry('book.pdf', '.pdf', 'dir/book.pdf', 'dir', 999, baseDate)
    expect(result.size).toBe(999)
    expect(result.mtime).toBe(baseDate)
    expect(result.path).toBe('dir/book.pdf')
  })
})
