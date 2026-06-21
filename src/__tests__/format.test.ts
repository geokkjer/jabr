import { describe, it, expect } from 'vitest'
import { formatSize } from '@/utils/format'

describe('formatSize', () => {
  it('returns bytes for sizes under 1 KB', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('returns KB for sizes between 1 KB and 1 MB', () => {
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(1048575)).toBe('1024.0 KB')
  })

  it('returns MB for sizes over 1 MB', () => {
    expect(formatSize(1048576)).toBe('1.0 MB')
    expect(formatSize(2097152)).toBe('2.0 MB')
    expect(formatSize(1610612736)).toBe('1536.0 MB')
  })

  it('handles negative values', () => {
    expect(formatSize(-1)).toBe('0 B')
  })
})
