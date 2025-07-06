import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Files Resource
async function demonstrateFilesUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token' // Required for uploading files
  });

  try {
    console.log('=== Files Resource Examples ===');

    // Example 1: List all files
    const allFiles = await inkress.files.list();
    console.log('All files:', allFiles.result?.entries.length || 0);

    // Example 2: Upload a file (simulating browser environment)
    // In a real browser environment, you'd get this from an input element
    const simulateFileUpload = async () => {
      // This is just for demonstration - in practice you'd get file from:
      // const fileInput = document.querySelector('input[type="file"]');
      // const file = fileInput.files[0];
      
      console.log('File upload would happen here with a real File object');
      
      // Example of what the upload would look like:
      /*
      const uploadResult = await inkress.files.upload(file, {
        tags: ['product-image', 'hero-banner'],
        folder: 'products',
        metadata: {
          description: 'Product hero image',
          category: 'marketing'
        }
      });
      
      console.log('Uploaded file:', uploadResult.result?.file);
      return uploadResult.result?.file;
      */
    };

    // Example 3: Upload from URL
    const urlUpload = await inkress.files.uploadFromUrl('https://example.com/sample-image.jpg', {
      filename: 'sample-product.jpg',
      tags: ['product', 'sample'],
      folder: 'products'
    });
    console.log('URL upload result:', urlUpload.result?.success);

    // Example 4: Get images only
    const images = await inkress.files.getImages({
      page: 1,
      page_size: 10
    });
    console.log('Image files:', images.result?.entries.length || 0);

    // Example 5: Search files
    const searchResults = await inkress.files.search('product', {
      page_size: 5
    });
    console.log('Search results:', searchResults.result?.entries.length || 0);

    // Example 6: Get files by tags
    const taggedFiles = await inkress.files.getByTags(['product', 'hero'], {
      page_size: 10
    });
    console.log('Tagged files:', taggedFiles.result?.entries.length || 0);

    // Example 7: Get files by mime type
    const jpegFiles = await inkress.files.getByMimeType('image/jpeg');
    console.log('JPEG files:', jpegFiles.result?.entries.length || 0);

    // Example 8: Get files within size range (1KB to 5MB)
    const mediumFiles = await inkress.files.getBySizeRange(1024, 5 * 1024 * 1024);
    console.log('Medium-sized files:', mediumFiles.result?.entries.length || 0);

    // Example 9: Get documents only
    const documents = await inkress.files.getDocuments();
    console.log('Document files:', documents.result?.entries.length || 0);

    // Example 10: Image transformation and URL generation
    if (allFiles.result?.entries && allFiles.result.entries.length > 0) {
      const firstFile = allFiles.result.entries[0];
      
      // Generate different transformed URLs
      const thumbnailUrl = inkress.files.getThumbnailUrl(firstFile, 150);
      const resizedUrl = inkress.files.getResizedUrl(firstFile, 800, 600, 'fit');
      const optimizedUrl = inkress.files.getOptimizedUrl(firstFile, 1200, 800);
      
      console.log('\nImage transformation examples:');
      console.log('Original URL:', firstFile.url);
      console.log('Thumbnail URL:', thumbnailUrl);
      console.log('Resized URL:', resizedUrl);
      console.log('Optimized URL:', optimizedUrl);

      // Custom transformation
      const customUrl = inkress.files.getTransformedUrl(firstFile, {
        width: 400,
        height: 300,
        crop: 'thumb',
        quality: 80,
        format: 'webp',
        gravity: 'auto'
      });
      console.log('Custom transformed URL:', customUrl);

      // Example 11: Update file metadata
      const updatedFile = await inkress.files.update(firstFile.id, {
        tags: ['updated', 'processed'],
        metadata: {
          processedAt: new Date().toISOString(),
          version: '2.0'
        }
      });
      console.log('Updated file tags:', updatedFile.result?.tags);
    }

    // Example 12: Get a specific file
    if (allFiles.result?.entries && allFiles.result.entries.length > 0) {
      const fileId = allFiles.result.entries[0].id;
      const specificFile = await inkress.files.get(fileId);
      console.log('Specific file:', specificFile.result?.filename);
    }

    console.log('\n✅ Files resource examples completed!');

  } catch (error) {
    console.error('❌ Error in files examples:', error);
  }
}

// Advanced file management examples
async function advancedFileManagement() {
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token'
  });

  try {
    console.log('\n=== Advanced File Management ===');

    // Example 1: Batch operations - get files by different criteria
    const [images, documents, recentFiles] = await Promise.all([
      inkress.files.getImages({ page_size: 20 }),
      inkress.files.getDocuments({ page_size: 10 }),
      inkress.files.list({ page_size: 15, sort: 'created_at', order: 'desc' })
    ]);

    console.log(`Found ${images.result?.entries.length || 0} images`);
    console.log(`Found ${documents.result?.entries.length || 0} documents`);
    console.log(`Found ${recentFiles.result?.entries.length || 0} recent files`);

    // Example 2: File organization by tags
    const organizationTags = ['hero-images', 'product-photos', 'thumbnails', 'documents'];
    
    for (const tag of organizationTags) {
      const taggedFiles = await inkress.files.getByTags(tag, { page_size: 5 });
      console.log(`Files with tag "${tag}":`, taggedFiles.result?.entries.length || 0);
    }

    // Example 3: Generate responsive image URLs
    const generateResponsiveUrls = (file: any) => {
      return {
        small: inkress.files.getResizedUrl(file, 320, 240, 'fit'),
        medium: inkress.files.getResizedUrl(file, 768, 576, 'fit'),
        large: inkress.files.getResizedUrl(file, 1200, 900, 'fit'),
        xlarge: inkress.files.getResizedUrl(file, 1920, 1080, 'fit'),
        thumbnail: inkress.files.getThumbnailUrl(file, 150)
      };
    };

    if (images.result?.entries && images.result.entries.length > 0) {
      const responsiveUrls = generateResponsiveUrls(images.result.entries[0]);
      console.log('\nResponsive image URLs:', responsiveUrls);
    }

    // Example 4: File cleanup - find large files for optimization
    const largeFiles = await inkress.files.getBySizeRange(5 * 1024 * 1024, Infinity); // Files > 5MB
    console.log(`Found ${largeFiles.result?.entries.length || 0} large files that might need optimization`);

    console.log('\n✅ Advanced file management examples completed!');

  } catch (error) {
    console.error('❌ Error in advanced file management:', error);
  }
}

// Run the demonstrations
async function runFilesDemo() {
  await demonstrateFilesUsage();
  await advancedFileManagement();
}

// Export for use in other examples
export { demonstrateFilesUsage, advancedFileManagement, runFilesDemo };

// Run if called directly
if (require.main === module) {
  runFilesDemo().catch(console.error);
}
