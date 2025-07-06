import type { HttpClient } from '../client';
import type { 
  ApiResponse, 
  PaginatedResponse,
  Category,
  CategoryInput,
  CategoryListParams
} from '../types';

/**
 * Categories resource for managing product categories
 * 
 * Categories provide a way to organize products into hierarchical groups.
 * They support nested structures through parent_id relationships and can
 * be filtered by various criteria including kind, name, and description.
 */
export class CategoriesResource {
  constructor(private client: HttpClient) {}

  /**
   * List categories with optional filtering and pagination
   * 
   * @param params - Query parameters for filtering and pagination
   * @returns Promise resolving to paginated list of categories
   */
  async list(params?: CategoryListParams): Promise<ApiResponse<PaginatedResponse<Category>>> {
    return this.client.get<PaginatedResponse<Category>>('/categories', params);
  }

  /**
   * Get a specific category by ID
   * 
   * @param id - The category ID
   * @returns Promise resolving to the category
   */
  async get(id: number): Promise<ApiResponse<Category>> {
    return this.client.get<Category>(`/categories/${id}`);
  }

  /**
   * Create a new category (requires authentication)
   * 
   * @param input - The category data to create
   * @returns Promise resolving to the created category
   */
  async create(input: CategoryInput): Promise<ApiResponse<Category>> {
    return this.client.post<Category>('/categories', input);
  }

  /**
   * Update an existing category (requires authentication)
   * 
   * @param id - The category ID to update
   * @param input - The updated category data
   * @returns Promise resolving to the updated category
   */
  async update(id: number, input: CategoryInput): Promise<ApiResponse<Category>> {
    return this.client.put<Category>(`/categories/${id}`, input);
  }

  /**
   * Delete a category (requires authentication)
   * 
   * @param id - The category ID to delete
   * @returns Promise resolving to void on successful deletion
   */
  async delete(id: number): Promise<ApiResponse<void>> {
    return this.client.delete<void>(`/categories/${id}`);
  }

  // Convenience methods for common use cases

  /**
   * Search categories by name or description
   * 
   * @param query - Search term to match against name and description
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of matching categories
   */
  async search(query: string, params?: Omit<CategoryListParams, 'q'>): Promise<ApiResponse<PaginatedResponse<Category>>> {
    return this.list({ ...params, q: query });
  }

  /**
   * Get categories by kind (type)
   * 
   * @param kind - The category kind to filter by
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of categories of the specified kind
   */
  async getByKind(kind: number, params?: Omit<CategoryListParams, 'kind'>): Promise<ApiResponse<PaginatedResponse<Category>>> {
    return this.list({ ...params, kind });
  }

  /**
   * Get child categories of a parent category
   * 
   * @param parentId - The parent category ID
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of child categories
   */
  async getChildren(parentId: number, params?: Omit<CategoryListParams, 'parent_id'>): Promise<ApiResponse<PaginatedResponse<Category>>> {
    return this.list({ ...params, parent_id: parentId });
  }

  /**
   * Get root categories (categories without a parent)
   * 
   * @param params - Additional query parameters
   * @returns Promise resolving to paginated list of root categories
   */
  async getRoots(params?: CategoryListParams): Promise<ApiResponse<PaginatedResponse<Category>>> {
    // Filter out parent_id to get only root categories
    const { parent_id: _parent_id, ...restParams } = params || {};
    return this.list(restParams);
  }

  /**
   * Create a subcategory under a parent category (requires authentication)
   * 
   * @param parentId - The parent category ID
   * @param input - The category data (parent_id will be set automatically)
   * @returns Promise resolving to the created subcategory
   */
  async createSubcategory(parentId: number, input: Omit<CategoryInput, 'parent_id'>): Promise<ApiResponse<Category>> {
    return this.create({ ...input, parent_id: parentId });
  }

  /**
   * Get the full category tree starting from root categories
   * Note: This makes multiple API calls to build the tree structure
   * 
   * @param maxDepth - Maximum depth to traverse (default: 3)
   * @returns Promise resolving to a tree structure of categories
   */
  async getCategoryTree(maxDepth: number = 3): Promise<ApiResponse<CategoryTree[]>> {
    try {
      // Get root categories
      const rootsResponse = await this.getRoots({ page_size: 100 });
      
      if (rootsResponse.state !== 'ok' || !rootsResponse.result) {
        return {
          state: 'error',
          result: undefined
        };
      }

      // Build tree recursively
      const tree: CategoryTree[] = [];
      // getRoots returns PaginatedResponse<Category>, so access entries
      const rootCategories = (rootsResponse.result as any).entries;
      
      for (const category of rootCategories) {
        const categoryWithChildren = await this.buildCategoryTree(category, maxDepth - 1);
        tree.push(categoryWithChildren);
      }

      return {
        state: 'ok',
        result: tree
      };
    } catch (error) {
      return {
        state: 'error',
        result: undefined
      };
    }
  }

  /**
   * Build category tree recursively (helper method)
   * 
   * @private
   */
  private async buildCategoryTree(category: Category, depth: number): Promise<CategoryTree> {
    const categoryTree: CategoryTree = {
      ...category,
      children: []
    };

    if (depth > 0) {
      const childrenResponse = await this.getChildren(category.id, { page_size: 100 });
      
      if (childrenResponse.state === 'ok' && childrenResponse.result) {
        // getChildren returns PaginatedResponse<Category>, so access entries
        const children = (childrenResponse.result as any).entries;
        
        for (const child of children) {
          const childWithChildren = await this.buildCategoryTree(child, depth - 1);
          categoryTree.children.push(childWithChildren);
        }
      }
    }

    return categoryTree;
  }
}

/**
 * Category tree structure for hierarchical display
 */
export interface CategoryTree extends Category {
  children: CategoryTree[];
}
