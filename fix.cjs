const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /(                              const renderCVList = \(cvList: CV\[\]\) => cvList\.map\(\(cv\) => \([\s\S]*?                              \)\);\n)/;

const match = regex.exec(content);
if (match) {
  let fnContent = match[1];
  content = content.replace(fnContent, '');
  
  const targetRegex = /(                              if \(adminCvTab === 'learning' && !selectedCourseId\) \{)/;
  content = content.replace(targetRegex, fnContent + '\n$1');
  
  fs.writeFileSync('src/App.tsx', content);
  console.log('Fixed!');
} else {
  console.log('Not found!');
}
