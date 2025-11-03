import type {
  RequestConfig,
  ApiResponse,
  RequestInterceptor,
  ResponseInterceptor,
  ErrorInterceptor,
} from './types';
import { ApiError } from './types';

export class ApiClient {
  private baseURL: string;
  private defaultHeaders: Record<string, string>;
  private requestInterceptors: RequestInterceptor[] = [];
  private responseInterceptors: ResponseInterceptor[] = [];
  private errorInterceptors: ErrorInterceptor[] = [];
  private defaultTimeout: number;

  constructor(config: {
    baseURL?: string;
    defaultHeaders?: Record<string, string>;
    timeout?: number;
  } = {}) {
    this.baseURL = config.baseURL || '';
    this.defaultHeaders = config.defaultHeaders || {};
    this.defaultTimeout = config.timeout || 30000;
  }

  useRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  useResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  useErrorInterceptor(interceptor: ErrorInterceptor): void {
    this.errorInterceptors.push(interceptor);
  }

  async request<T>(endpoint: string, config: RequestConfig = {}): Promise<ApiResponse<T>> {
    let requestConfig: RequestConfig = {
      method: config.method || 'GET',
      headers: { ...this.defaultHeaders, ...config.headers },
      params: config.params,
      body: config.body,
      timeout: config.timeout || this.defaultTimeout,
    };

    for (const interceptor of this.requestInterceptors) {
      requestConfig = await interceptor(requestConfig);
    }

    const url = this.buildURL(endpoint, requestConfig.params);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestConfig.timeout);

    try {
      const response = await fetch(url, {
        method: requestConfig.method,
        headers: requestConfig.headers,
        body: requestConfig.body ? JSON.stringify(requestConfig.body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      let data: T;
      const contentType = response.headers.get('content-type');
      
      if (contentType?.includes('application/json')) {
        data = await response.json() as T;
      } else if (contentType?.includes('text/')) {
        data = (await response.text()) as unknown as T;
      } else {
        data = (await response.blob()) as unknown as T;
      }

      const apiResponse: ApiResponse<T> = {
        data,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      };

      if (!response.ok) {
        const error = new ApiError(
          `API Request failed: ${response.statusText}`,
          response.status,
          response.statusText,
          data,
          response
        );

        let processedError = error;
        for (const interceptor of this.errorInterceptors) {
          processedError = await interceptor(processedError);
        }
        throw processedError;
      }

      let processedResponse = apiResponse;
      for (const interceptor of this.responseInterceptors) {
        processedResponse = await interceptor(processedResponse);
      }

      return processedResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof ApiError) {
        throw error;
      }

      const apiError = new ApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        0,
        'Network Error'
      );

      let processedError = apiError;
      for (const interceptor of this.errorInterceptors) {
        processedError = await interceptor(processedError);
      }

      throw processedError;
    }
  }

  async get<T>(endpoint: string, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'GET' });
  }

  async post<T>(endpoint: string, data?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'POST', body: data });
  }

  async put<T>(endpoint: string, data?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PUT', body: data });
  }

  async patch<T>(endpoint: string, data?: unknown, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'PATCH', body: data });
  }

  async delete<T>(endpoint: string, config?: Omit<RequestConfig, 'method' | 'body'>): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { ...config, method: 'DELETE' });
  }

  private buildURL(endpoint: string, params?: Record<string, string | number | boolean>): string {
    const base = this.baseURL || 'http://localhost';
    
    let url: URL;
    if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
      url = new URL(endpoint);
    } else {
      const baseUrl = new URL(base);
      const endpointPath = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const basePath = baseUrl.pathname.endsWith('/') 
        ? baseUrl.pathname.slice(0, -1) 
        : baseUrl.pathname;
      const fullPath = basePath + endpointPath;
      url = new URL(fullPath, baseUrl.origin);
    }
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, String(value));
      });
    }

    return url.toString();
  }
}

export function createApiClient(config?: {
  baseURL?: string;
  defaultHeaders?: Record<string, string>;
  timeout?: number;
}): ApiClient {
  return new ApiClient(config);
}
