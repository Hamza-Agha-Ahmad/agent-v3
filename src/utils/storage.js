const fs = require('fs-extra');
const path = require('path');
const STORAGE_PATH = process.env.STORAGE_PATH || './storage';

fs.ensureDirSync(STORAGE_PATH);

module.exports = {
  save: (key, data) =>
    fs.writeJson(path.join(STORAGE_PATH, `${key}.json`), data, { spaces: 2 }),
  load: (key) =>
    fs.readJson(path.join(STORAGE_PATH, `${key}.json`)).catch(() => null),
  keys: () =>
    fs.readdir(STORAGE_PATH).then(files => files.map(f => f.replace('.json', '')))
};