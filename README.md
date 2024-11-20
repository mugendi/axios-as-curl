# AxiosAsCurl

A Node.js library that provides an Axios-like interface while using `curl` under the hood. Perfect for scenarios where you need the power of curl with the convenience of Axios's API.

## But Why?

Axios and other NodeJS request clients are notorious for "ECONNREFUSED" and "ERR_NETWORK" errors. While there are workarounds too keep the agents alive and so on, they also break from time to time. I therefore developed this in-place-replacement for Axios which uses the more powerful `curl` to actully run the requests. It solved my problems immediately and I hope it solves yours too! ♥

## Features

- 🔄 Axios-compatible API
- 🛠️ Powered by system curl
- 📦 Support for multiple response types (JSON, text, stream, buffer)
- 📊 Detailed request metadata and timing information
- 🔁 Automatic retries with exponential backoff
- 📝 FormData support
- 🔍 Redirect following
- 🗑️ Automatic temporary file cleanup

## Installation

```bash
npm install axios-as-curl
```

## Basic Usage

```javascript
import AxiosAsCurl from 'axios-as-curl';

// Create an instance
const client = new AxiosAsCurl();

// Make requests
const response = await client.get('https://api.example.com/data');
console.log(response.data);
```

## Configuration

### Default Configuration

```javascript
const client = new AxiosAsCurl({
  timeout: 10000,
  maxRetries: 3,
  responseType: 'json', // 'json', 'text', 'stream', 'buffer'
  headers: {
    'User-Agent': 'Custom User Agent',
    Accept: '*/*',
  },
});
```

### Available Response Types

- `json` (default): Parses response as JSON
- `text`: Returns raw text response
- `stream`: Returns a readable stream
- `buffer`: Returns response as Buffer

## Examples

### POST Request with JSON Data

```javascript
const response = await client.post('https://api.example.com/users', {
  name: 'John Doe',
  email: 'john@example.com',
});

console.log(response.data);
console.log(response.metadata.duration); // Request duration in ms
```

### File Upload with FormData

```javascript
import FormData from 'form-data';

const form = new FormData();
form.append('file', Buffer.from('Hello World'), 'hello.txt');
form.append('name', 'test-file');

const response = await client.post('https://api.example.com/upload', form);
```

### Streaming Response

```javascript
const response = await client.get('https://api.example.com/download', {
  responseType: 'stream',
});

// Pipe to file
import { createWriteStream } from 'fs';
response.data.pipe(createWriteStream('download.file'));
```

### Request Metadata

Each response includes detailed metadata:

```javascript
const response = await client.get('https://api.example.com/data');

console.log(response.metadata);
// {
//   startTime: 1637001234567,
//   endTime: 1637001235567,
//   duration: 1000,
//   retries: 0,
//   redirects: 1,
//   tempFiles: 0,
//   finalUrl: 'https://api.example.com/data',
//   timings: {
//     dns: 0.1,
//     connect: 0.2,
//     ttfb: 0.3,
//     total: 1.0
//   }
// }
```

## API Reference

### Constructor Options

```typescript
interface AxiosAsCurlConfig {
  timeout?: number; // Request timeout in ms (default: 10000)
  maxRetries?: number; // Max retry attempts (default: 3)
  responseType?: 'json' | 'text' | 'stream' | 'buffer'; // Response type (default: 'json')
  headers?: Record<string, string>; // Default headers
}
```

### Available Methods

All methods return a Promise with response object:

- `get(url, config?)`
- `post(url, data?, config?)`
- `put(url, data?, config?)`
- `patch(url, data?, config?)`
- `delete(url, config?)`
- `request(config)`

### Response Object

```typescript
interface AxiosAsCurlResponse {
  data: any; // Response data
  status: number; // HTTP status code
  statusText: string; // HTTP status message
  headers: Record<string, string>; // Response headers
  config: AxiosAsCurlConfig; // Request configuration
  metadata: {
    startTime: number; // Request start timestamp
    endTime: number; // Request end timestamp
    duration: number; // Total duration in ms
    retries: number; // Number of retry attempts
    redirects: number; // Number of redirects
    tempFiles: number; // Number of temp files used
    finalUrl: string; // Final URL after redirects
    timings: {
      dns: number; // DNS lookup time in seconds
      connect: number; // Connection time in seconds
      ttfb: number; // Time to first byte in seconds
      total: number; // Total time in seconds
    };
  };
}
```

## Error Handling

```javascript
try {
  const response = await client.get('https://api.example.com/data');
} catch (error) {
  console.error(`Request failed: ${error.message}`);
  // Error will include retry information if retries were attempted
}
```

## Common Use Cases

### Custom Headers

```javascript
const response = await client.get('https://api.example.com/data', {
  headers: {
    Authorization: 'Bearer token',
    'Custom-Header': 'value',
  },
});
```

### Retry Configuration

```javascript
const client = new AxiosAsCurl({
  maxRetries: 5, // Will retry up to 5 times with exponential backoff
});
```

### Large File Download

```javascript
const response = await client.get('https://api.example.com/large-file', {
  responseType: 'stream',
});

await pipeline(response.data, createWriteStream('large-file.zip'));
```

## Notes

- Requires `curl` to be installed on the system
- Temporary files are automatically cleaned up after each request
- Follows redirects by default
- Uses exponential backoff for retries

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
