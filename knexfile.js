// Update with your config settings.

export default {
  development: {
    client: "pg",
    connection: process.env.LIT_GATEWAY_DB_URL,
    migrations: {
      tableName: "knex_migrations",
    },
  },

  staging: {
    client: "pg",
    connection: process.env.LIT_GATEWAY_DB_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },

  production: {
    client: "pg",
    connection: process.env.LIT_GATEWAY_DB_URL,
    pool: {
      min: 2,
      max: 10,
    },
    migrations: {
      tableName: "knex_migrations",
    },
  },
};
