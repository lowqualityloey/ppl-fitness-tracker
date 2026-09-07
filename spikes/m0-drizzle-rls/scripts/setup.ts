/** Apply the schema and seed fixtures without running the test suite. */
import { resetAndSeed } from '../src/setup-db.js';

const f = await resetAndSeed();
console.log('seeded:');
console.log(`  A ${f.userA.email} ${f.userA.id} set=${f.userA.setId}`);
console.log(`  B ${f.userB.email} ${f.userB.id} set=${f.userB.setId}`);
