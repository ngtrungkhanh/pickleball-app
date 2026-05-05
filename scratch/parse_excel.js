const xlsx = require('xlsx');

const workbook = xlsx.readFile('legacy/PICKLEBALL RANKING.xlsx');
console.log('Sheet Names:', workbook.SheetNames);

for (const sheetName of workbook.SheetNames) {
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
  console.log(`\n--- Sheet: ${sheetName} ---`);
  console.log(data.slice(0, 5));
}
