import fetch from 'node-fetch';

async function testStreamingAbort() {
  console.log('Initiating streaming request...');
  const controller = new AbortController();
  
  try {
    const response = await fetch('http://localhost:3000/api/summarize?stream=true', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        url: 'https://news.ycombinator.com', // use a real article if possible, HN is fine to test
      }),
      signal: controller.signal
    });

    console.log('Response status:', response.status);

    if (response.body) {
      // Consume a bit of the stream, then abort
      let chunkCount = 0;
      for await (const chunk of response.body) {
        process.stdout.write(chunk);
        chunkCount++;
        
        if (chunkCount >= 5) {
          console.log('\n\n--- Aborting stream midway ---');
          controller.abort();
          break;
        }
      }
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('Stream successfully aborted locally.');
    } else {
      console.error('Error:', error);
    }
  }
}

testStreamingAbort();
