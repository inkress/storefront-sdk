import { InkressStorefrontSDK } from '../src/index';

// Example: Using the Reviews Resource
async function demonstrateReviewsUsage() {
  // Initialize the SDK
  const inkress = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username',
    authToken: 'your-auth-token' // Required for creating/updating/deleting reviews
  });

  try {
    console.log('=== Reviews Resource Examples ===');

    // Example 1: Get all reviews with pagination
    const allReviews = await inkress.reviews.list({
      page: 1,
      per_page: 20,
      sort: 'created_at',
      order: 'desc'
    });
    console.log('All reviews:', allReviews.data);

    // Example 2: Get reviews for a specific product
    const productId = 123;
    const productReviews = await inkress.reviews.getByProduct(productId, {
      per_page: 10,
      sort: 'rating',
      order: 'desc'
    });
    console.log(`Reviews for product ${productId}:`, productReviews.data);

    // Example 3: Get product review statistics
    const reviewStats = await inkress.reviews.getProductStats(productId);
    console.log('Review statistics:', reviewStats.data);

    // Example 4: Submit a new review (requires authentication)
    const newReview = await inkress.reviews.create({
      product_id: productId,
      rating: 5,
      title: 'Excellent product!',
      comment: 'This product exceeded my expectations. Great quality and fast shipping!'
    });
    console.log('New review created:', newReview.data);

    // Example 5: Get reviews by rating
    const fiveStarReviews = await inkress.reviews.getByProductAndRating(productId, 5, {
      per_page: 5
    });
    console.log('5-star reviews:', fiveStarReviews.data);

    // Example 6: Get verified purchase reviews
    const verifiedReviews = await inkress.reviews.getVerifiedReviews(productId, {
      per_page: 10
    });
    console.log('Verified purchase reviews:', verifiedReviews.data);

    // Example 7: Search reviews by content
    const searchResults = await inkress.reviews.search('excellent', {
      per_page: 10
    });
    console.log('Search results for "excellent":', searchResults.data);

    // Example 8: Get recent reviews across all products
    const recentReviews = await inkress.reviews.getRecent(5);
    console.log('Recent reviews:', recentReviews.data);

    // Example 9: Check if current customer can review a product
    const canReview = await inkress.reviews.canReview(productId);
    console.log('Can review product:', canReview.data);

    // Example 10: Get customer's own reviews
    const myReviews = await inkress.reviews.getByCustomer();
    console.log('My reviews:', myReviews.data);

    // Example 11: Get top-rated reviews for a product
    const topRated = await inkress.reviews.getTopRated(productId, {
      per_page: 5
    });
    console.log('Top-rated reviews:', topRated.data);

    // Example 12: Mark a review as helpful (if you have a review ID)
    if (allReviews.data && allReviews.result.entries.length > 0) {
      const reviewId = allReviews.result.entries[0].id;
      const helpfulResult = await inkress.reviews.markHelpful(reviewId);
      console.log('Marked as helpful:', helpfulResult.data);
    }

    // Example 13: Update your own review
    if (newReview.data) {
      const updatedReview = await inkress.reviews.update(newReview.data.id, {
        title: 'Updated: Excellent product!',
        comment: 'Updated comment: This product is amazing and I highly recommend it!'
      });
      console.log('Updated review:', updatedReview.data);
    }

    // Example 14: Get bulk statistics for multiple products
    const bulkStats = await inkress.reviews.getBulkStats([123, 124, 125]);
    console.log('Bulk review statistics:', bulkStats.data);

    // Example 15: Filter reviews by status (for moderation)
    const pendingReviews = await inkress.reviews.list({
      status: 'pending',
      per_page: 10
    });
    console.log('Pending reviews:', pendingReviews.data);

  } catch (error) {
    console.error('Reviews API error:', error);
  }
}

// Advanced example: Building a product review summary
async function buildProductReviewSummary(productId: number) {
  const sdk = new InkressStorefrontSDK({
    merchantUsername: 'your-merchant-username'
  });

  try {
    // Get review statistics
    const statsResponse = await sdk.reviews.getProductStats(productId);
    
    if (statsResponse.state === 'ok' && statsResponse.data) {
      const stats = statsResponse.data;
      
      console.log(`Product ${productId} Review Summary:`);
      console.log(`Total Reviews: ${stats.total_reviews}`);
      console.log(`Average Rating: ${stats.average_rating.toFixed(1)}/5`);
      console.log('Rating Distribution:');
      
      for (let i = 5; i >= 1; i--) {
        const count = stats.rating_distribution[i as keyof typeof stats.rating_distribution];
        const percentage = stats.total_reviews > 0 ? ((count / stats.total_reviews) * 100).toFixed(1) : '0';
        console.log(`  ${i} stars: ${count} reviews (${percentage}%)`);
      }

      // Get recent reviews
      const recentReviews = await sdk.reviews.getByProduct(productId, {
        per_page: 3,
        sort: 'created_at',
        order: 'desc',
        status: 'approved'
      });

      if (recentReviews.state === 'ok' && recentReviews.data) {
        console.log('\nRecent Reviews:');
        recentReviews.result.entries.forEach((review, index) => {
          console.log(`${index + 1}. ${review.title || 'No title'} (${review.rating}/5)`);
          console.log(`   ${review.comment || 'No comment'}`);
          console.log(`   - ${review.customer_name || 'Anonymous'} on ${new Date(review.created_at).toLocaleDateString()}`);
        });
      }
    }
  } catch (error) {
    console.error('Failed to build review summary:', error);
  }
}

// Helper function to format review data for display
function formatReviewForDisplay(review: any) {
  return {
    id: review.id,
    rating: `${review.rating}/5 stars`,
    title: review.title || 'No title',
    comment: review.comment || 'No comment',
    author: review.customer_name || 'Anonymous',
    date: new Date(review.created_at).toLocaleDateString(),
    verified: review.verified_purchase ? 'Verified Purchase' : 'Unverified',
    helpful: review.helpful_count ? `${review.helpful_count} people found this helpful` : 'No helpful votes'
  };
}

// Example usage
if (require.main === module) {
  demonstrateReviewsUsage();
  buildProductReviewSummary(123);
}

export {
  demonstrateReviewsUsage,
  buildProductReviewSummary,
  formatReviewForDisplay
};
