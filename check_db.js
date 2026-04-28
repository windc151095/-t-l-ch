import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function run() {
  const q = collection(db, 'cvs');
  const snap = await getDocs(q);
  console.log(`Found ${snap.docs.length} cvs`);
  snap.docs.forEach(doc => {
    console.log(doc.id, doc.data());
  });
}
run();
