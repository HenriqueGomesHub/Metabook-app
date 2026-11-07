import { readFileSync } from 'node:fs';

const pool = JSON.parse(readFileSync(new URL('../content/pool.json', import.meta.url), 'utf8'));
const q = (v) => `'${String(v).replaceAll("'", "''")}'`;
const values = pool.map((c) => `(${q(c.code)}, ${q(c.name)}, ${q(c.continent)}, ${c.in_pool === true})`);
if (values.length > 0) {
  console.log(
    `insert into pool_countries (code, name, continent, in_pool) values\n${values.join(',\n')}\non conflict do nothing;`,
  );
}
