// Update with your config settings.

export default {
  development: {
    client: "pg",
    connection: process.env.LIT_GATHER_CONTROLLER_DB_URL,
    migrations: {
      tableName: "knex_migrations",
    },
  },

  production: {
    client: "pg",
    connection: {
      connectionString: process.env.LIT_GATHER_CONTROLLER_DB_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },
};
