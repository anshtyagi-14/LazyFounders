const fs = require('fs');
console.log(fs.readFileSync('packages/database/prisma/schema.prisma', 'utf8'));
