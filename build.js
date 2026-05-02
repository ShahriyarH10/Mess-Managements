const fs = require('fs');

// Read the template
let script = fs.readFileSync('script.js', 'utf8');

// Replace placeholders with actual env vars
script = script.replace('__SUPABASE_URL__', process.env.SUPABASE_URL);
script = script.replace('__SUPABASE_KEY__', process.env.SUPABASE_KEY);

// Write the built version
fs.writeFileSync('dist/script.js', script);
fs.copyFileSync('index.html', 'dist/index.html');
fs.copyFileSync('style.css',  'dist/style.css');

console.log('Build complete ✓');