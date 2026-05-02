const fs = require('fs');

// Create dist folder if it doesn't exist
if(!fs.existsSync('dist')) {
  fs.mkdirSync('dist', { recursive: true });
}

// Read the template
let script = fs.readFileSync('script.js', 'utf8');

// Replace placeholders with actual env vars
script = script.replace('__SUPABASE_URL__', process.env.SUPABASE_URL || '');
script = script.replace('__SUPABASE_KEY__', process.env.SUPABASE_KEY || '');

// Write the built version
fs.writeFileSync('dist/script.js', script);
fs.copyFileSync('index.html', 'dist/index.html');
fs.copyFileSync('style.css',  'dist/style.css');

console.log('✓ dist/ created');
console.log('✓ script.js built with env vars');
console.log('✓ index.html copied');
console.log('✓ style.css copied');
console.log('Build complete ✓');