declare module 'sql.js' {
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database
  }
  interface Database {
    run(sql: string, params?: unknown[]): Database
    prepare(sql: string): Statement
    exec(sql: string): QueryExecResult[]
    export(): Uint8Array
    close(): void
  }
  interface Statement {
    bind(params?: unknown[]): boolean
    step(): boolean
    getAsObject(params?: unknown[]): Record<string, unknown>
    free(): boolean
  }
  interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }
  export default function initSqlJs(config?: Record<string, unknown>): Promise<SqlJsStatic>
}
