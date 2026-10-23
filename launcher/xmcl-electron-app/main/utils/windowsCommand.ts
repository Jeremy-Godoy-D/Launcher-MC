export function quoteWindowsArgument(value: string) {
  if (value.length === 0) return '""'
  if (!/[\s"]/u.test(value)) return value
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`
}
