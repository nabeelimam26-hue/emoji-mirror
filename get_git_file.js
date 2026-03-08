const { execSync } = require('child_process');
const fs = require('fs');

try {
  const result = execSync('git show HEAD:src/App.jsx', {
    cwd: 'c:\\Users\\ADMIN\\Desktop\\emoji-mirror',
    encoding: 'utf-8'
  });
  
  fs.writeFileSync('c:\\Users\\ADMIN\\Desktop\\emoji-mirror\\temp_app.txt', result, 'utf-8');
  console.log('Done! File written to temp_app.txt');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
