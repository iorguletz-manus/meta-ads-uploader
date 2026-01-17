const GOOGLE_API_KEY = process.env.VITE_GOOGLE_API_KEY || 'AIzaSyBzVdG5Fy-L1sLVHM0QTRCJwrqJPYyH8Ek';
const fileId = '1R45vf6d-vKzuqWNZkb1auJSGuSZdOpBn';

async function test() {
  // Test metadata
  const metadataUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?key=${GOOGLE_API_KEY}&fields=name,mimeType,size`;
  console.log('Metadata URL:', metadataUrl);
  
  const metaRes = await fetch(metadataUrl);
  const metadata = await metaRes.json();
  console.log('Metadata response:', JSON.stringify(metadata, null, 2));
  
  if (metadata.error) {
    console.log('ERROR: Cannot get metadata');
    return;
  }
  
  // Test download
  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${GOOGLE_API_KEY}`;
  console.log('Download URL:', downloadUrl);
  
  const downloadRes = await fetch(downloadUrl);
  console.log('Download status:', downloadRes.status);
  console.log('Download headers:', Object.fromEntries(downloadRes.headers.entries()));
  
  if (downloadRes.ok) {
    const buffer = await downloadRes.arrayBuffer();
    console.log('Downloaded bytes:', buffer.byteLength);
  } else {
    const errorText = await downloadRes.text();
    console.log('Download error:', errorText);
  }
}

test().catch(console.error);
