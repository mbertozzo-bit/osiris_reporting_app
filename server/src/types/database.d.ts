import { Statement } from 'sqlite3';

export interface DatabaseResult {
  [key: string]: any;
}

export interface DatabaseRunResult {
  lastID: number;
  changes: number;
}

export interface Database {
  all(sql: string, params?: any[]): Promise<DatabaseResult[]>;
  get(sql: string, params?: any[]): Promise<DatabaseResult | undefined>;
  run(sql: string, params?: any[]): Promise<DatabaseRunResult>;
  exec(sql: string): Promise<void>;
  prepare(sql: string, params?: any[]): Promise<Statement>;
  close(): Promise<void>;
}