import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import http from 'node:http';
import https from 'node:https';
import type { Readable } from 'node:stream';
import { Logger } from 'pino';
import { FetchError } from '@lazyfounders/shared';
import { FetchClientConfig, FetchOptions, FetchResult } from './types';

/**
 * Production-grade HTTP client wrapping Axios for the Discovery Service.
 */
export class FetchClient {
  private readonly axiosInstance: AxiosInstance;
  private readonly httpAgent: http.Agent;
  private readonly httpsAgent: https.Agent;

  constructor(
    private readonly config: FetchClientConfig,
    private readonly logger: Logger
  ) {
    this.httpAgent = new http.Agent({
      keepAlive: this.config.keepAlive,
      maxSockets: this.config.maxSockets,
    });

    this.httpsAgent = new https.Agent({
      keepAlive: this.config.keepAlive,
      maxSockets: this.config.maxSockets,
    });

    this.axiosInstance = axios.create({
      timeout: this.config.timeoutMs,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      maxRedirects: this.config.maxRedirects,
      decompress: true,
      responseType: 'arraybuffer', // Always default to arraybuffer to safely process binary or text data
      validateStatus: () => true, // We handle errors ourselves based on response
      headers: {
        'Accept': '*/*',
        'Accept-Encoding': 'gzip, br, deflate',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Sets up Axios request and response interceptors.
   */
  private setupInterceptors(): void {
    this.axiosInstance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
      // ETag and If-Modified-Since logic mapping
      if (config.headers) {
        if (config.headers['X-Custom-ETag']) {
          config.headers['If-None-Match'] = config.headers['X-Custom-ETag'];
          delete config.headers['X-Custom-ETag'];
        }
        if (config.headers['X-Custom-If-Modified-Since']) {
          config.headers['If-Modified-Since'] = config.headers['X-Custom-If-Modified-Since'];
          delete config.headers['X-Custom-If-Modified-Since'];
        }
      }

      this.logger.debug(
        { url: config.url, method: config.method, headers: config.headers },
        'Starting HTTP request'
      );
      return config;
    });

    this.axiosInstance.interceptors.response.use((response: AxiosResponse) => {
      this.logger.debug(
        {
          url: response.config.url,
          status: response.status,
          contentType: response.headers['content-type'],
          contentLength: response.headers['content-length'],
        },
        'Received HTTP response'
      );
      return response;
    });
  }

  /**
   * Performs an HTTP fetch operation.
   *
   * @param url - The target URL to fetch.
   * @param options - Optional fetch parameters overriding defaults.
   * @returns A Promise resolving to a populated FetchResult.
   */
  public async fetch(url: string, options?: FetchOptions): Promise<FetchResult> {
    const startTime = performance.now();
    const requestHeaders: Record<string, string> = { ...options?.headers };

    if (options?.userAgent) {
      requestHeaders['User-Agent'] = options.userAgent;
    }
    
    // We pass ETags in custom headers to bypass Axios defaults, intercepted before request
    if (options?.etag) {
      requestHeaders['X-Custom-ETag'] = options.etag;
    }
    if (options?.ifModifiedSince) {
      requestHeaders['X-Custom-If-Modified-Since'] = options.ifModifiedSince;
    }

    try {
      const response = await this.axiosInstance.request({
        url,
        method: 'GET',
        headers: requestHeaders,
        timeout: options?.timeout ?? this.config.timeoutMs,
        maxRedirects: options?.followRedirects === false ? 0 : (options?.maxRedirects ?? this.config.maxRedirects),
        proxy: options?.proxy ? {
          host: options.proxy.host,
          port: options.proxy.port,
          protocol: options.proxy.protocol ?? 'http',
          auth: options.proxy.username ? {
            username: options.proxy.username,
            password: options.proxy.password ?? '',
          } : undefined,
        } : false,
      });

      const durationMs = performance.now() - startTime;
      const isNotModified = response.status === 304;

      if (response.status >= 400) {
        throw new FetchError(
          `Fetch failed with status ${response.status}`,
          response.config.url || url,
          response.status,
          'http'
        );
      }

      const bodyBuffer = isNotModified ? Buffer.alloc(0) : Buffer.from(response.data);

      return {
        url,
        finalUrl: response.request?.res?.responseUrl || response.config.url || url,
        statusCode: response.status,
        headers: response.headers as Record<string, string | string[] | undefined>,
        body: bodyBuffer,
        contentType: (response.headers['content-type'] as string) || null,
        contentEncoding: (response.headers['content-encoding'] as string) || null,
        etag: (response.headers['etag'] as string) || null,
        lastModified: (response.headers['last-modified'] as string) || null,
        isNotModified,
        strategy: 'http', // Default, to be overwritten by the strategy itself
        durationMs,
        byteSize: bodyBuffer.length,
      };
    } catch (error: any) {
      // Avoid re-wrapping FetchError
      if (error instanceof FetchError) {
        throw error;
      }
      throw new FetchError(
        error.message || 'Unknown fetch error',
        url,
        error.response?.status || null,
        'http',
        { cause: error }
      );
    }
  }

  /**
   * Fetches data as a readable stream, ideal for large sitemaps.
   *
   * @param url - The target URL to fetch.
   * @param options - Optional fetch parameters.
   * @returns A Stream and Response Headers.
   */
  public async fetchStream(
    url: string,
    options?: FetchOptions
  ): Promise<{ stream: Readable; headers: Record<string, string> }> {
    const requestHeaders: Record<string, string> = { ...options?.headers };
    if (options?.userAgent) {
      requestHeaders['User-Agent'] = options.userAgent;
    }

    try {
      const response = await this.axiosInstance.request({
        url,
        method: 'GET',
        headers: requestHeaders,
        timeout: options?.timeout ?? this.config.timeoutMs,
        maxRedirects: options?.followRedirects === false ? 0 : (options?.maxRedirects ?? this.config.maxRedirects),
        responseType: 'stream',
      });

      if (response.status >= 400) {
        throw new FetchError(
          `Stream fetch failed with status ${response.status}`,
          url,
          response.status,
          'http'
        );
      }

      return {
        stream: response.data as Readable,
        headers: response.headers as Record<string, string>,
      };
    } catch (error: any) {
      if (error instanceof FetchError) {
        throw error;
      }
      throw new FetchError(
        error.message || 'Unknown stream fetch error',
        url,
        error.response?.status || null,
        'http',
        { cause: error }
      );
    }
  }

  /**
   * Cleans up the HTTP agents.
   */
  public dispose(): void {
    this.httpAgent.destroy();
    this.httpsAgent.destroy();
  }
}
