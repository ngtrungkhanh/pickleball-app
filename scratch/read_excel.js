const xlsx = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, '../legacy/PICKLEBALL RANKING.xlsx');
try {
  const workbook = xlsx.readFile(filePath);
  console.log('Sheet Names:', workbook.SheetNames);
  
  for (const sheetName of workbook.SheetNames) {
    console.log(`\n--- Sheet: ${sheetName} ---`);
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
    console.log('Rows (first 5):');
    data.slice(0, 5).forEach(row => console.log(row));
  }
} catch (e) {
  console.error('Error reading excel file:', e.message);
}
