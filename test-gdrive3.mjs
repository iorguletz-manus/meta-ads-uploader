const fileId = '1R45vf6d-vKzuqWNZkb1auJSGuSZdOpBn';

async function downloadLargeFile() {
  console.log('=== Downloading large file with virus scan bypass ===');
  
  // Step 1: Get the warning page to extract cookies and confirm token
  const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  console.log('Initial URL:', initialUrl);
  
  const initialRes = await fetch(initialUrl);
  const html = await initialRes.text();
  
  console.log('Got HTML page, length:', html.length);
  
  // Extract the confirm token from the page
  // Look for: href="/uc?export=download&amp;confirm=t&amp;uuid=..."
  const confirmMatch = html.match(/href="\/uc\?export=download&amp;confirm=([^&"]+)&amp;/);
  const uuidMatch = html.match(/uuid=([^&"]+)/);
  
  console.log('Confirm token:', confirmMatch ? confirmMatch[1] : 'not found');
  console.log('UUID:', uuidMatch ? uuidMatch[1] : 'not found');
  
  // Also look for the download form action
  const formMatch = html.match(/action="([^"]+)"/);
  console.log('Form action:', formMatch ? formMatch[1] : 'not found');
  
  // Try with confirm=t and uuid
  if (uuidMatch) {
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t&uuid=${uuidMatch[1]}`;
    console.log('\nTrying with UUID:', downloadUrl);
    
    const downloadRes = await fetch(downloadUrl);
    console.log('Status:', downloadRes.status);
    console.log('Content-Type:', downloadRes.headers.get('content-type'));
    console.log('Content-Length:', downloadRes.headers.get('content-length'));
    console.log('Content-Disposition:', downloadRes.headers.get('content-disposition'));
    
    if (downloadRes.ok) {
      const contentType = downloadRes.headers.get('content-type');
      if (contentType && !contentType.includes('text/html')) {
        console.log('SUCCESS! Got file, not HTML');
        const buffer = await downloadRes.arrayBuffer();
        console.log('Downloaded bytes:', buffer.byteLength);
      } else {
        const text = await downloadRes.text();
        if (text.includes('<!DOCTYPE')) {
          console.log('Still got HTML page');
          console.log('First 500 chars:', text.slice(0, 500));
        } else {
          console.log('Got something else, length:', text.length);
        }
      }
    }
  }
  
  // Alternative: Try with cookies
  console.log('\n=== Trying with download_warning cookie ===');
  const cookieUrl = `https://drive.google.com/uc?export=download&confirm=t&id=${fileId}`;
  const cookieRes = await fetch(cookieUrl, {
    headers: {
      'Cookie': `download_warning_${fileId}=t`
    }
  });
  console.log('Status:', cookieRes.status);
  console.log('Content-Type:', cookieRes.headers.get('content-type'));
  console.log('Content-Length:', cookieRes.headers.get('content-length'));
}

downloadLargeFile().catch(console.error);
