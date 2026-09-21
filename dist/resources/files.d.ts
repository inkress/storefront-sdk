import type { HttpClient } from '../client';
import type { ApiResponse, PaginatedResponse, PaginationParams } from '../types';
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
export declare class FilesResource {
    private client;
    constructor(client: HttpClient);
    /**
     * List files with optional filtering and pagination
     *
     * @param params - Query parameters for filtering and pagination
     * @returns Promise resolving to paginated list of files
     */
    list(params?: FileListParams): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Get a specific file by ID
     *
     * @param id - The file ID
     * @returns Promise resolving to the file details
     */
    get(id: string): Promise<ApiResponse<FileUpload>>;
    /**
     * Upload a file
     *
     * @param file - The file to upload (File or Blob)
     * @param options - Upload options
     * @returns Promise resolving to the uploaded file details
     */
    upload(file: File | Blob, options?: FileUploadOptions): Promise<ApiResponse<FileUploadResponse>>;
    /**
     * Upload a file from a URL.
     *
     * There is no server-side "upload by URL" endpoint, so this fetches the
     * resource client-side and uploads the bytes through the same `/files/pubload`
     * path as {@link upload}.
     *
     * @param url - The URL of the file to fetch and upload
     * @param options - Upload options
     * @returns Promise resolving to the uploaded file details
     */
    uploadFromUrl(url: string, options?: FileUploadOptions): Promise<ApiResponse<FileUploadResponse>>;
    /**
     * Update file metadata
     *
     * @param id - The file ID
     * @param updates - The metadata updates
     * @returns Promise resolving to the updated file details
     */
    update(id: string, updates: Partial<Pick<FileUpload, 'tags' | 'context' | 'metadata'>>): Promise<ApiResponse<FileUpload>>;
    /**
     * Delete a file
     *
     * @param id - The file ID
     * @returns Promise resolving to void on successful deletion
     */
    delete(id: string): Promise<ApiResponse<void>>;
    /**
     * Get files by mime type
     *
     * @param mimeType - The mime type to filter by (e.g., 'image/jpeg', 'image/*', 'application/pdf')
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of files
     */
    getByMimeType(mimeType: string, params?: Omit<FileListParams, 'mime_type'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Get image files only
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of image files
     */
    getImages(params?: Omit<FileListParams, 'mime_type'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Get document files only
     *
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of document files
     */
    getDocuments(params?: Omit<FileListParams, 'mime_type'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Search files by filename or content
     *
     * @param query - Search term
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of matching files
     */
    search(query: string, params?: Omit<FileListParams, 'search'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Get files by tags
     *
     * @param tags - Tags to filter by (comma-separated string or array)
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of files with specified tags
     */
    getByTags(tags: string | string[], params?: Omit<FileListParams, 'tags'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Get files within a size range
     *
     * @param minSize - Minimum file size in bytes
     * @param maxSize - Maximum file size in bytes
     * @param params - Additional query parameters
     * @returns Promise resolving to paginated list of files within size range
     */
    getBySizeRange(minSize: number, maxSize: number, params?: Omit<FileListParams, 'min_size' | 'max_size'>): Promise<ApiResponse<PaginatedResponse<FileUpload>>>;
    /**
     * Generate a transformed image URL
     *
     * @param file - The file object or file URL
     * @param transforms - Transformation options
     * @returns The transformed image URL
     */
    getTransformedUrl(file: FileUpload | string, transforms: FileTransformOptions): string;
    /**
     * Generate a resized image URL
     *
     * @param file - The file object or file URL
     * @param width - Desired width
     * @param height - Desired height (optional)
     * @param crop - Crop mode (default: 'scale')
     * @returns The resized image URL
     */
    getResizedUrl(file: FileUpload | string, width: number, height?: number, crop?: FileTransformOptions['crop']): string;
    /**
     * Generate a thumbnail URL
     *
     * @param file - The file object or file URL
     * @param size - Thumbnail size (will be used for both width and height)
     * @returns The thumbnail URL
     */
    getThumbnailUrl(file: FileUpload | string, size?: number): string;
    /**
     * Generate an optimized image URL (auto format and quality)
     *
     * @param file - The file object or file URL
     * @param width - Desired width (optional)
     * @param height - Desired height (optional)
     * @returns The optimized image URL
     */
    getOptimizedUrl(file: FileUpload | string, width?: number, height?: number): string;
}
//# sourceMappingURL=files.d.ts.map