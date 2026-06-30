import { config } from 'dotenv';
config({ path: '.env.local' });
import { getFirestoreClient } from './src/lib/firebase-admin';
import { promises as fs } from 'fs';
import { encrypt } from './src/lib/encryption';

const go = async () => {
  try {
    const firestore = getFirestoreClient();
    if (!firestore) throw new Error("no firestore");
    const collection = firestore.collection('brainDocuments');
    const docs = await collection.get();
    
    // delete all docs
    if (docs.size > 0) {
      let batch = firestore.batch();
      let count = 0;
      docs.forEach(d => {
        batch.delete(d.ref);
        count++;
        if (count % 400 === 0) {
          batch.commit();
          batch = firestore.batch();
        }
      });
      await batch.commit();
      console.log('Deleted old docs:', docs.size);
    }
    
    // insert from JSON
    const raw = await fs.readFile('./data/brain-documents.json', 'utf8');
    const data = JSON.parse(raw);
    const toInsert = data.documents || data;
    
    let batch2 = firestore.batch();
    let count2 = 0;
    const ENCRYPTED_FIELDS = ['panCardUrl', 'aadhaarCardUrl', 'bankDetailsUrl', 'offerLetterUrl', 'panCard', 'aadhaarCard', 'bankDetails'];
    
    for (const doc of toInsert) {
      if (doc.fields) {
        for (const key of ENCRYPTED_FIELDS) {
          if (doc.fields[key] && doc.fields[key] !== '' && doc.fields[key] !== '[PROTECTED]') {
            doc.fields[key] = encrypt(doc.fields[key]);
          }
        }
      }
      batch2.set(collection.doc(doc.id), doc);
      count2++;
      if (count2 % 400 === 0) {
        await batch2.commit();
        batch2 = firestore.batch();
      }
    }
    await batch2.commit();
    console.log('Inserted ' + toInsert.length + ' docs');
  } catch (e) {
    console.error(e);
  }
};
go();
