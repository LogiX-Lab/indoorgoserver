const serverless = require('serverless-http');
// process.env.NODE_ENV = 'production';
const app = require('../../server');

module.exports.handler = serverless(app);