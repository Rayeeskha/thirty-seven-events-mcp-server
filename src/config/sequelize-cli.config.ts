import { env } from './env';

const connection = {
  username: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  host: env.DB_HOST,
  port: env.DB_PORT,
  dialect: 'mysql' as const,
};

// sequelize-cli selects the entry by NODE_ENV; the database itself is chosen via DB_NAME.
export = {
  development: connection,
  test: connection,
  production: connection,
};
