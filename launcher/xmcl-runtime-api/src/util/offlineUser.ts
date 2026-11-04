export const isValidLocalProfileName = (name: unknown): name is string => typeof name === 'string' && name.length >= 3 && name.length <= 16 && !/[^a-zA-Z0-9_]/.test(name)
