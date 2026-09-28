import bcrypt from 'bcryptjs'

const ROUNDS = 10

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash) return false
  try {
    return await bcrypt.compare(password, hash)
  } catch {
    return false
  }
}

/** Server-side password policy (mirrored in the UI for instant feedback). */
export function passwordProblems(password: string): string[] {
  const problems: string[] = []
  if (password.length < 8) problems.push('at least 8 characters')
  if (!/[A-Za-z]/.test(password)) problems.push('at least one letter')
  if (!/[0-9]/.test(password)) problems.push('at least one number')
  return problems
}
