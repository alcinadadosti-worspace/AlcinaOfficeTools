import type { DbConnection, DbQueryResult } from '@shared/ipc'

// Conectores de banco de dados. Os drivers são carregados sob demanda para
// não pesar na inicialização do aplicativo.

export async function runDbQuery(conn: DbConnection, sql: string, maxRows = 1_000_000): Promise<DbQueryResult> {
  throw new Error(
    `O conector "${conn.kind}" ainda não está disponível nesta versão. ` +
      `Exporte os dados para CSV/Excel ou use a fonte Web. (consulta com ${sql.length} caracteres, limite ${maxRows})`
  )
}

export async function listDbTables(conn: DbConnection): Promise<{ schema: string; name: string }[]> {
  throw new Error(`O conector "${conn.kind}" ainda não está disponível nesta versão.`)
}
