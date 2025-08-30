/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/app.js'],
  verbose: false,
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js']
};
