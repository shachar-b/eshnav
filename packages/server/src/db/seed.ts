import { openDatabase, resolveDbPath } from './connection.js';
import { seedFamilyData } from './seed-data.js';

const dbPath = resolveDbPath(process.env.DB_PATH);
const db = openDatabase(dbPath);
seedFamilyData(db);
db.$client.close();
console.log(`eshnav family database seeded at ${dbPath}`);
