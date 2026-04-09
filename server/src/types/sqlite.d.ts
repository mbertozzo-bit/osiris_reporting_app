declare module 'sqlite' {
  import { Database as SQLiteDatabase } from 'sqlite3';
  
  export interface Database extends SQLiteDatabase {}
  export function open(options: { filename: string; driver: any }): Promise<Database>;
}