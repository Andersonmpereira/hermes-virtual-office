/**
 * Gera OFFICE_PASSWORD_HASH. A senha fica só no argumento e não é impressa de volta.
 * Uso: npx tsx scripts/hash-office-password.ts "uma senha"
 */
import { hashPassword } from '../src/lib/auth/password'

const password = process.argv[2]
if (!password) {
  console.error('Informe a senha como argumento. Ela não será gravada neste repositório.')
  process.exit(1)
}
console.log(hashPassword(password))
