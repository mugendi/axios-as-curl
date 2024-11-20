import { exec } from 'child_process';
import { promisify } from 'util';
import FormData from 'form-data';
import { writeFile, unlink } from 'fs/promises';
import { createReadStream, createWriteStream } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { pipeline } from 'stream/promises';
import { PassThrough } from 'stream';

const execAsync = promisify(exec);


export class AxiosToCurl {
  #defaults;
  #tempFiles = new Set();
  
  constructor(defaultConfig = {}) {
    this.#defaults = {
      timeout: 10000,
      maxRetries: 3,
      responseType: 'json', // 'json', 'text', 'stream', 'buffer'
      headers: {
        'User-Agent': 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1; SV1)',
        'Accept': '*/*'
      },
      ...defaultConfig
    };
  }

  static create(config) {
    return new AxiosToCurl(config);
  }

  async request(options) {
    const metadata = {
      startTime: Date.now(),
      retries: 0,
      redirects: 0,
      tempFiles: 0,
      finalUrl: options.url,
      timings: {
        dns: null,
        connect: null,
        ttfb: null,
        total: null
      }
    };

    try {
      const config = this.#mergeConfig(options);
      const curlCommand = await this.#buildCurlCommand(config, metadata);
      const response = await this.#executeCurlWithRetry(curlCommand, config, metadata);
      
      // Clean up temp files after successful request
      await this.#cleanupTempFiles();
      
      return response;
    } catch (error) {
      // In case of error, we still want to clean up
      await this.#cleanupTempFiles();
      throw error;
    }
  }

  #mergeConfig(options) {
    return {
      ...this.#defaults,
      ...options,
      headers: { ...this.#defaults.headers, ...options.headers }
    };
  }

  async #buildCurlCommand(config, metadata) {
    const parts = ['curl'];

    // Add timing information
    parts.push('--write-out', '"%{time_namelookup} %{time_connect} %{time_starttransfer} %{time_total} %{num_redirects} %{url_effective}"');

    // Method
    if (config.method) {
      parts.push('-X', config.method.toUpperCase());
    }

    // Headers
    for (const [key, value] of Object.entries(config.headers)) {
      parts.push('-H', `"${key}: ${value}"`);
    }

    // Follow redirects
    parts.push('--location');

    // Output handling based on response type
    if (config.responseType === 'stream') {
      const outputFile = join(tmpdir(), `response-${Math.random().toString(36).slice(2)}`);
      this.#tempFiles.add(outputFile);
      parts.push('-o', outputFile);
      metadata.outputFile = outputFile;
    }

    // Data
    if (config.data) {
      await this.#handleData(parts, config.data, metadata);
    }

    // URL (always last)
    parts.push(`"${config.url}"`);

    return parts.join(' ');
  }

  async #handleData(parts, data, metadata) {
    if (data instanceof FormData) {
      await this.#handleFormData(parts, data, metadata);
    } else {
      await this.#handleRegularData(parts, data, metadata);
    }
  }

  async #handleRegularData(parts, data, metadata) {
    const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);
    
    if (dataStr.length > 1000) {
      const tmpFile = join(tmpdir(), `data-${Math.random().toString(36).slice(2)}`);
      await writeFile(tmpFile, dataStr);
      this.#tempFiles.add(tmpFile);
      metadata.tempFiles++;
      parts.push('--data', `@${tmpFile}`);
    } else {
      parts.push('--data', `"${dataStr}"`);
    }
  }

  async #handleFormData(parts, formData, metadata) {
    for (const [key, value] of formData.entries()) {
      if (value instanceof Buffer || value instanceof Uint8Array) {
        const tmpFile = join(tmpdir(), `upload-${Math.random().toString(36).slice(2)}`);
        await writeFile(tmpFile, value);
        this.#tempFiles.add(tmpFile);
        metadata.tempFiles++;
        parts.push('-F', `"${key}=@${tmpFile}"`);
      } else {
        parts.push('-F', `"${key}=${value}"`);
      }
    }
  }

  async #cleanupTempFiles() {
    for (const file of this.#tempFiles) {
      try {
        await unlink(file);
      } catch (error) {
        console.warn(`Failed to cleanup temporary file ${file}:`, error);
      }
    }
    this.#tempFiles.clear();
  }

  async #executeCurlWithRetry(curlCommand, config, metadata) {
    let lastError;
    const maxRetries = config.maxRetries || this.#defaults.maxRetries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          metadata.retries++;
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }

        return await this.#executeCurl(curlCommand, config, metadata);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) {
          throw new Error(`Curl command failed after ${maxRetries} retries: ${error.message}`);
        }
      }
    }
  }

  async #executeCurl(curlCommand, config, metadata) {
    try {
      const { stdout, stderr } = await execAsync(curlCommand, {
        maxBuffer: 1024 * 1024 * 10 // 10MB buffer
      });

      // Parse timing information from curl output
      const [dns, connect, ttfb, total, redirects, finalUrl, ...output] = stdout.trim().split(' ');
      
      metadata.timings = {
        dns: parseFloat(dns),
        connect: parseFloat(connect),
        ttfb: parseFloat(ttfb),
        total: parseFloat(total)
      };
      metadata.redirects = parseInt(redirects, 10);
      metadata.finalUrl = finalUrl;
      metadata.endTime = Date.now();
      metadata.duration = metadata.endTime - metadata.startTime;

      // Handle different response types
      let data;
      if (config.responseType === 'stream') {
        const stream = new PassThrough();
        const fileStream = createReadStream(metadata.outputFile);
        pipeline(fileStream, stream).catch(console.error);
        data = stream;
      } else {
        const responseText = output.join(' ');
        if (config.responseType === 'json') {
          try {
            data = JSON.parse(responseText);
          } catch {
            data = responseText;
          }
        } else if (config.responseType === 'buffer') {
          data = Buffer.from(responseText);
        } else {
          data = responseText;
        }
      }

      return {
        data,
        status: 200, // We should parse this from curl output
        statusText: 'OK',
        headers: {}, // We should parse headers from curl output
        config,
        metadata
      };
    } catch (error) {
      throw new Error(`Curl command failed: ${error.message}`);
    }
  }

  // Axios compatibility methods
  async get(url, config = {}) {
    return this.request({ ...config, method: 'get', url });
  }

  async post(url, data, config = {}) {
    return this.request({ ...config, method: 'post', url, data });
  }

  async put(url, data, config = {}) {
    return this.request({ ...config, method: 'put', url, data });
  }

  async patch(url, data, config = {}) {
    return this.request({ ...config, method: 'patch', url, data });
  }

  async delete(url, config = {}) {
    return this.request({ ...config, method: 'delete', url });
  }
}

export default AxiosToCurl;