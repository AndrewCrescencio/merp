import { describe, expect, it } from 'vitest'
import { escapeLikePattern } from './repository'

describe('escapeLikePattern', () => {
  it('escapes % wildcards', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%')
    expect(escapeLikePattern('%%')).toBe('\\%\\%')
  })

  it('escapes _ wildcards', () => {
    expect(escapeLikePattern('_a')).toBe('\\_a')
  })

  it('escapes backslashes', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b')
  })

  it('leaves plain strings untouched', () => {
    expect(escapeLikePattern('acme')).toBe('acme')
  })
})
