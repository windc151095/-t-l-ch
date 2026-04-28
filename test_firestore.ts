import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { readFileSync } from 'fs';

const config = JSON.parse(readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(config);
const db = getFirestore(app);

async function test() {
  try {
    const docRef = await addDoc(collection(db, 'cvs'), {
      fullName: 'Test User',
      phone: '0912345678',
      age: '25',
      address: 'Hanoi',
      job: 'Dev',
      target: 'Target',
      password: '1234',
      paymentImageUrl: '',
      guideName: 'Guide',
      guidePhoneLast4: '5678',
      phoneLast4: '5678',
      status: 'pending',
      createdAt: serverTimestamp()
    });
    console.log("Success:", docRef.id);
    process.exit(0);
  } catch (err) {
    console.error("Failed:", err.message);
    process.exit(1);
  }
}
test();
