/**
 * Parse Stringified NBT (SNBT) format used by Minecraft and mods such as FTB Quests.
 * Unsafe integer longs are returned as bigint; quoted values remain strings.
 * Throws SyntaxError with the input position for malformed or truncated input.
 */
export function parseSnbt(input: string): any {
  let pos = 0
  const len = input.length
  let nodes = 0

  function syntaxError(message: string): never {
    throw new SyntaxError(`${message} at position ${pos}`)
  }
  if (len > 4 * 1024 * 1024) syntaxError('SNBT exceeds size limit')

  function skipWhitespaceAndComments() {
    while (pos < len) {
      const ch = input[pos]
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' || ch === ',') {
        pos++
        continue
      }
      if (ch === '#' || (ch === '/' && input[pos + 1] === '/')) {
        while (pos < len && input[pos] !== '\n') {
          pos++
        }
        continue
      }
      if (ch === '/' && input[pos + 1] === '*') {
        pos += 2
        while (pos < len && !(input[pos] === '*' && input[pos + 1] === '/')) {
          pos++
        }
        if (pos >= len) syntaxError('Unterminated block comment')
        pos += 2
        continue
      }
      break
    }
  }

  function parseString(): string {
    const quote = input[pos]
    pos++ // skip quote
    let res = ''
    while (pos < len) {
      const ch = input[pos]
      if (ch === '\\') {
        pos++
        if (pos < len) {
          const esc = input[pos]
          if (esc === 'n') res += '\n'
          else if (esc === 't') res += '\t'
          else if (esc === 'r') res += '\r'
          else res += esc
          pos++
        }
      } else if (ch === quote) {
        pos++
        return res
      } else {
        res += ch
        pos++
      }
    }
    return syntaxError('Unterminated string')
  }

  function parseUnquoted(): string {
    const start = pos
    while (pos < len) {
      const ch = input[pos]
      if (
        ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n' ||
        ch === ',' || ch === ':' || ch === '{' || ch === '}' ||
        ch === '[' || ch === ']' || ch === '#' || ch === '/'
      ) {
        break
      }
      pos++
    }
    if (pos === start) syntaxError(`Expected a token, found ${JSON.stringify(input[pos])}`)
    return input.substring(start, pos)
  }

  function parseValue(depth = 0): any {
    if (++nodes > 100000 || depth > 64) syntaxError('SNBT exceeds structure limit')
    skipWhitespaceAndComments()
    if (pos >= len) syntaxError('Expected a value')

    const ch = input[pos]
    if (ch === '{') {
      return parseCompound(depth + 1)
    }
    if (ch === '[') {
      return parseList(depth + 1)
    }
    if (ch === '"' || ch === "'") {
      return parseString()
    }

    const token = parseUnquoted()
    if (token === 'true') return true
    if (token === 'false') return false
    if (token === 'null') return null

    // Check if number with optional type suffix (b, s, l, f, d, B, S, L, F, D)
    const longMatch = /^([+-]?\d+)[lL]$/.exec(token)
    if (longMatch) {
      if (longMatch[1].length > 128) syntaxError('SNBT number exceeds size limit')
      const value = BigInt(longMatch[1])
      return value >= BigInt(Number.MIN_SAFE_INTEGER) && value <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(value)
        : value
    }
    const numMatch = /^([+-]?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))[bsfdBSFD]?$/.exec(token)
    if (numMatch) {
      if (numMatch[1].length > 128) syntaxError('SNBT number exceeds size limit')
      const numStr = numMatch[1]
      if (numStr.startsWith('0x') || numStr.startsWith('-0x') || numStr.startsWith('+0x')) {
        const hexVal = parseInt(numStr, 16)
        if (!Number.isNaN(hexVal)) return hexVal
      }
      const num = Number(numStr)
      if (!Number.isFinite(num)) syntaxError('Invalid SNBT number')
      return num
    }

    return token
  }

  function parseCompound(depth: number): Record<string, any> {
    pos++ // skip '{'
    const obj: Record<string, any> = {}

    while (pos < len) {
      skipWhitespaceAndComments()
      if (input[pos] === '}') {
        pos++
        return obj
      }
      if (pos >= len) syntaxError('Unterminated compound')

      let key: string
      const ch = input[pos]
      if (ch === '"' || ch === "'") {
        key = parseString()
      } else {
        key = parseUnquoted()
      }

      skipWhitespaceAndComments()
      if (input[pos] !== ':') syntaxError('Expected ":" after compound key')
      pos++

      if (key === '__proto__') syntaxError('Unsafe SNBT key')
      const val = parseValue(depth)
      obj[key] = val
    }

    return syntaxError('Unterminated compound')
  }

  function parseList(depth: number): any[] {
    pos++ // skip '['
    skipWhitespaceAndComments()

    // Check array type prefixes like [B;, [I;, [L;
    if (pos + 1 < len && (input[pos] === 'B' || input[pos] === 'I' || input[pos] === 'L') && input[pos + 1] === ';') {
      pos += 2 // skip 'B;' or 'I;' or 'L;'
    }

    const list: any[] = []
    while (pos < len) {
      skipWhitespaceAndComments()
      if (input[pos] === ']') {
        pos++
        return list
      }
      if (pos >= len) syntaxError('Unterminated list')
      const val = parseValue(depth)
      list.push(val)
    }

    return syntaxError('Unterminated list')
  }

  skipWhitespaceAndComments()
  const value = parseValue()
  skipWhitespaceAndComments()
  if (pos !== len) syntaxError('Unexpected trailing input')
  return value
}
