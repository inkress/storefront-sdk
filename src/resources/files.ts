import type { HttpClient } from '../client';
import type {
  ApiResponse,
  PaginatedResponse,
  PaginationParams,
} from '../types';

// File-related types (could be moved to types.ts if needed)
export interface FileUpload {
  id: string;
  filename: string;
  original_filename: string;
  mime_type: string;
  size: number;
  url: string;
  secure_url?: string;
  public_id?: string;
  version?: number;
  width?: number;
  height?: number;
  format?: string;
  bytes: number;
  created_at: string;
  updated_at: string;
  tags?: string[];
  context?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface FileUploadResponse {
  file: FileUpload;
  success: boolean;
  message?: string;
}

export interface FileListParams extends PaginationParams {
  mime_type?: string;
  tags?: string;
  filename?: string;
  min_size?: number;
  max_size?: number;
  format?: string;
  search?: string;
}

export interface FileUploadOptions {
  filename?: string;
  tags?: string[];
  context?: Record<string, any>;
  metadata?: Record<string, any>;
  folder?: string;
  public_id?: string;
  overwrite?: boolean;
  unique_filename?: boolean;
  use_filename?: boolean;
}

export interface FileTransformOptions {
  width?: number;
  height?: number;
  crop?: 'scale' | 'fit' | 'limit' | 'mfit' | 'fill' | 'lfill' | 'pad' | 'lpad' | 'mpad' | 'crop' | 'thumb' | 'imagga_crop' | 'imagga_scale';
  gravity?: 'auto' | 'center' | 'north' | 'northeast' | 'east' | 'southeast' | 'south' | 'southwest' | 'west' | 'northwest';
  quality?: number | 'auto';
  format?: 'jpg' | 'png' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'ico' | 'pdf' | 'svg' | 'auto';
  fetch_format?: 'auto';
  flags?: string[];
  effect?: string;
  overlay?: string;
  underlay?: string;
  background?: string;
  opacity?: number;
  radius?: number | string;
  border?: string;
  color_space?: string;
  dpr?: number | 'auto';
}

/**
 * Files resource for managing file uploads and media assets
 * 
 * This resource provides functionality for:
 * - Uploading files (images, documents, etc.)
 * - Listing and searching uploaded files
 * - Getting file details and URLs
 * - Transforming images (resize, crop, format conversion)
 * - Managing file metadata and tags
 * - Deleting files
 */
export class FilesResource {
  constructor(private client: HttpClient) {}

  /**
   * List files with optional filtering and pagination
   * 
   * @param params - Query parameters for filtering and pagination
   * @returns Promise resolving to paginated list of files
   */
  async list(params?: FileListParams): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    return this.client.get<PaginatedResponse<FileUpload>>('/files', params);
  }

  /**
   * Get a specific file by ID
   * 
   * @param id - The file ID
   * @returns Promise resolving to the file details
   */
  async get(id: string): Promise<ApiResponse<FileUpload>> {
    return this.client.get<FileUpload>(`/files/${id}`);
  }

  /**
   * Upload a file
   * 
   * @param file - The file to upload (File or Blob)
   * @param options - Upload options
   * @returns Promise resolving to the uploaded file details
   */
  async upload(file: File | Blob, options?: FileUploadOptions): Promise<ApiResponse<FileUploadResponse>> {
    const formData = new FormData();
    
    // Add the file
    if (file instanceof File) {
      formData.append('file', file, options?.filename || file.name);
    } else {
      formData.append('file', file, options?.filename || 'upload');
    }

    // Add options as form fields
    if (options) {
      if (options.tags) formData.append('tags', options.tags.join(','));
      if (options.context) formData.append('context', JSON.stringify(options.context));
      if (options.metadata) formData.append('metadata', JSON.stringify(options.metadata));
      if (options.folder) formData.append('folder', options.folder);
      if (options.public_id) formData.append('public_id', options.public_id);
      if (options.overwrite !== undefined) formData.append('overwrite', String(options.overwrite));
      if (options.unique_filename !== undefined) formData.append('unique_filename', String(options.unique_filename));
      if (options.use_filename !== undefined) formData.append('use_filename', String(options.use_filename));
    }

    return this.client.post<FileUploadResponse>('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  }

  /**
   * Upload file from URL
   * 
   * @param url - The URL of the file to upload
   * @param options - Upload options
   * @returns Promise resolving to the uploaded file details
   */
  async uploadFromUrl(url: string, options?: FileUploadOptions): Promise<ApiResponse<FileUploadResponse>> {
    return this.client.post<FileUploadResponse>('/files/upload-url', {
      url,
      ...options,
    });
  }

  /**
   * Update file metadata
   * 
   * @param id - The file ID
   * @param updates - The metadata updates
   * @returns Promise resolving to the updated file details
   */
  async update(id: string, updates: Partial<Pick<FileUpload, 'tags' | 'context' | 'metadata'>>): Promise<ApiResponse<FileUpload>> {
    return this.client.put<FileUpload>(`/files/${id}`, updates);
  }

  /**
   * Delete a file
   * 
   * @param id - The file ID
   * @returns Promise resolving to void on successful deletion
   */
  async delete(id: string): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/files/${id}`);
  }

  /**
   * Get files by mime type
   * 
   * @param mimeType - The mime type to filter by (e.g., 'image/jpeg', 'image/*', 'application/pdf')
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of files
   */
  async getByMimeType(mimeType: string, params?: Omit<FileListParams, 'mime_type'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    return this.list({ ...params, mime_type: mimeType });
  }

  /**
   * Get image files only
   * 
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of image files
   */
  async getImages(params?: Omit<FileListParams, 'mime_type'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    return this.getByMimeType('image/*', params);
  }

  /**
   * Get document files only
   * 
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of document files
   */
  async getDocuments(params?: Omit<FileListParams, 'mime_type'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    return this.list({ 
      ...params, 
      mime_type: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/*'
    });
  }

  /**
   * Search files by filename or content
   * 
   * @param query - Search term
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of matching files
   */
  async search(query: string, params?: Omit<FileListParams, 'search'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    return this.list({ ...params, search: query });
  }

  /**
   * Get files by tags
   * 
   * @param tags - Tags to filter by (comma-separated string or array)
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of files with specified tags
   */
  async getByTags(tags: string | string[], params?: Omit<FileListParams, 'tags'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    const tagsString = Array.isArray(tags) ? tags.join(',') : tags;
    return this.list({ ...params, tags: tagsString });
  }

  /**
   * Get files within a size range
   * 
   * @param minSize - Minimum file size in bytes
   * @param maxSize - Maximum file size in bytes
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of files within size range
   */
  async getBySizeRange(
    minSize: number, 
    maxSize: number, 
    params?: Omit<FileListParams, 'min_size' | 'max_size'>
  ): Promise<ApiResponse<PaginatedResponse<FileUpload>>> {
    return this.list({ ...params, min_size: minSize, max_size: maxSize });
  }

  // Image transformation utilities

  /**
   * Generate a transformed image URL
   * 
   * @param file - The file object or file URL
   * @param transforms - Transformation options
   * @returns The transformed image URL
   */
  getTransformedUrl(file: FileUpload | string, transforms: FileTransformOptions): string {
    const baseUrl = typeof file === 'string' ? file : file.url;
    
    if (!transforms || Object.keys(transforms).length === 0) {
      return baseUrl;
    }

    // Build transformation parameters
    const params = new URLSearchParams();
    
    if (transforms.width) params.append('w', transforms.width.toString());
    if (transforms.height) params.append('h', transforms.height.toString());
    if (transforms.crop) params.append('c', transforms.crop);
    if (transforms.gravity) params.append('g', transforms.gravity);
    if (transforms.quality) params.append('q', transforms.quality.toString());
    if (transforms.format) params.append('f', transforms.format);
    if (transforms.fetch_format) params.append('f_auto', transforms.fetch_format);
    if (transforms.opacity) params.append('o', transforms.opacity.toString());
    if (transforms.radius) params.append('r', transforms.radius.toString());
    if (transforms.background) params.append('b', transforms.background);
    if (transforms.effect) params.append('e', transforms.effect);
    if (transforms.dpr) params.append('dpr', transforms.dpr.toString());

    if (transforms.flags && transforms.flags.length > 0) {
      params.append('fl', transforms.flags.join('.'));
    }

    // Add transformation parameters to URL
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}${params.toString()}`;
  }

  /**
   * Generate a resized image URL
   * 
   * @param file - The file object or file URL
   * @param width - Desired width
   * @param height - Desired height (optional)
   * @param crop - Crop mode (default: 'scale')
   * @returns The resized image URL
   */
  getResizedUrl(file: FileUpload | string, width: number, height?: number, crop: FileTransformOptions['crop'] = 'scale'): string {
    return this.getTransformedUrl(file, { width, height, crop });
  }

  /**
   * Generate a thumbnail URL
   * 
   * @param file - The file object or file URL
   * @param size - Thumbnail size (will be used for both width and height)
   * @returns The thumbnail URL
   */
  getThumbnailUrl(file: FileUpload | string, size: number = 150): string {
    return this.getTransformedUrl(file, { 
      width: size, 
      height: size, 
      crop: 'thumb',
      gravity: 'auto'
    });
  }

  /**
   * Generate an optimized image URL (auto format and quality)
   * 
   * @param file - The file object or file URL
   * @param width - Desired width (optional)
   * @param height - Desired height (optional)
   * @returns The optimized image URL
   */
  getOptimizedUrl(file: FileUpload | string, width?: number, height?: number): string {
    return this.getTransformedUrl(file, {
      width,
      height,
      format: 'auto',
      fetch_format: 'auto',
      quality: 'auto',
      flags: ['progressive']
    });
  }
}
