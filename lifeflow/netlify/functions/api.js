// DB_PATH を先にセット — database.js が require されるより前に必要
process.env.DB_PATH = process.env.DB_PATH || '/tmp/lifeflow.db';

const serverless = require('serverless-http');
const app = require('../../app');

module.exports.handler = serverless(app);
