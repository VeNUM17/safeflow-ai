const fs = require('fs');
const db = JSON.parse(fs.readFileSync('server/data/psi_db.json', 'utf8'));

console.log('=== Database Summary ===');
console.log('Projects:', (db.projects || []).length);
console.log('Documents:', (db.documents || []).length);
console.log('Digital Drawings:', (db.digital_drawings || []).length);
console.log('Piping Lines:', (db.lines || []).length);
console.log('Process Streams:', (db.streams || []).length);
console.log('Equipment:', (db.equipment || []).length);

if (db.digital_drawings && db.digital_drawings.length > 0) {
  console.log('\n=== Digital Drawings ===');
  db.digital_drawings.forEach((d) => {
    console.log(`- ID: ${d.id}, Title: "${d.title}", Elements: ${(d.elements || []).length}, Connectors: ${(d.connectors || []).length}, Status: ${d.status}`);
  });
}
