const fileId = '1R45vf6d-vKzuqWNZkb1auJSGuSZdOpBn';

async function testUrl(name, url) {
  console.log(`\n=== Testing ${name} ===`);
  console.log('URL:', url);
  
  try {
    const res = await fetch(url, { redirect: 'follow' });
    console.log('Status:', res.status);
    console.log('Content-Type:', res.headers.get('content-type'));
    console.log('Content-Length:', res.headers.get('content-length'));
    console.log('Content-Disposition:', res.headers.get('content-disposition'));
    
    if (res.ok) {
      const buffer = await res.arrayBuffer();
      console.log('Downloaded bytes:', buffer.byteLength);
      
      // Check if it's HTML (error page) or actual file
      const firstBytes = new Uint8Array(buffer.slice(0, 100));
      const text = new TextDecoder().decode(firstBytes);
      if (text.includes('<!DOCTYPE') || text.includes('<html')) {
        console.log('WARNING: Got HTML page, not file!');
        console.log('First 200 chars:', new TextDecoder().decode(buffer.slice(0, 200)));
      } else {
        console.log('SUCCESS: Got binary file!');
      }
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

async function main() {
  // Method 1: Classic uc export
  await testUrl('uc?export=download', `https://drive.google.com/uc?export=download&id=${fileId}`);
  
  // Method 2: drive.usercontent.google.com
  await testUrl('drive.usercontent', `https://drive.usercontent.google.com/download?id=${fileId}&export=download`);
  
  // Method 3: With confirm parameter (for large files)
  await testUrl('uc with confirm', `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`);
}

main();
