const fs = require('fs');

async function main() {
  try {
    // 1. Fetch current documents
    console.log('Fetching documents from http://localhost:3001/api/documents...');
    const getRes = await fetch('http://localhost:3001/api/documents');
    if (!getRes.ok) {
      throw new Error(`Failed to fetch documents: ${getRes.status}`);
    }
    const data = await getRes.json();
    const documents = data.documents;
    console.log(`Fetched ${documents.length} documents successfully.`);

    if (documents.length === 0) {
      console.log('No documents found to modify.');
      return;
    }

    // 2. Modify one document (simulate an AI update)
    const docToModify = { ...documents[0] };
    docToModify.body = docToModify.body + '\n\nFounder-approved AI update:\n- This is a test AI change.';
    docToModify.updatedAt = new Date().toISOString().slice(0, 10);
    
    const updatedDocuments = documents.map(d => d.id === docToModify.id ? docToModify : d);

    // 3. POST updated documents back to the server
    console.log('Posting updated documents back to http://localhost:3001/api/documents...');
    const postRes = await fetch('http://localhost:3001/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ documents: updatedDocuments })
    });

    const resPayload = await postRes.json();
    console.log('POST Response Status:', postRes.status);
    console.log('POST Response Body:', resPayload);

  } catch (err) {
    console.error('Test failed:', err);
  }
}

main();
