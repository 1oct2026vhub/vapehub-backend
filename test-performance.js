/**
 * Performance Test Script
 * 
 * This script tests the performance of the original vs optimized fetchProducts function
 * Run with: node test-performance.js
 */

const { performance } = require('perf_hooks');
const { fetchProducts } = require('./components/product/helper/product.helper');
const { fetchProductsOptimized } = require('./components/product/helper/product.helper.optimized');

async function testPerformance() {
  console.log('🚀 Starting Performance Test...\n');

  const testQueries = [
    {
      name: 'Basic Query (limit=10)',
      query: { sort_by: 'id', order: 'DESC', limit: 10, offset: 0 }
    },
    {
      name: 'Basic Query (limit=50)',
      query: { sort_by: 'id', order: 'DESC', limit: 50, offset: 0 }
    },
    {
      name: 'With Keyword Search',
      query: { sort_by: 'id', order: 'DESC', limit: 10, offset: 0, keyword: 'vape' }
    },
    {
      name: 'With Price Range',
      query: { sort_by: 'id', order: 'DESC', limit: 10, offset: 0, price_range: '10-50' }
    },
    {
      name: 'With Category Filter',
      query: { sort_by: 'id', order: 'DESC', limit: 10, offset: 0, categories: '1,2,3' }
    },
    {
      name: 'Complex Query (multiple filters)',
      query: { 
        sort_by: 'createdAt', 
        order: 'DESC', 
        limit: 20, 
        offset: 0, 
        keyword: 'vape',
        price_range: '10-100',
        categories: '1,2'
      }
    }
  ];

  for (const test of testQueries) {
    console.log(`📊 Testing: ${test.name}`);
    console.log('=' .repeat(50));

    // Test original function
    try {
      const startOriginal = performance.now();
      const resultOriginal = await fetchProducts(test.query);
      const endOriginal = performance.now();
      const timeOriginal = endOriginal - startOriginal;

      console.log(`✅ Original Function:`);
      console.log(`   ⏱️  Time: ${timeOriginal.toFixed(2)}ms`);
      console.log(`   📦 Products: ${resultOriginal.products.length}`);
      console.log(`   📊 Total Count: ${resultOriginal.pagination.total_count}`);
      console.log(`   🏷️  Categories: ${resultOriginal.category_items.length}`);
      console.log(`   🏢 Brands: ${resultOriginal.brand_items.length}`);
      console.log(`   🎯 Deals: ${resultOriginal.deal_items.length}`);
      console.log(`   🔧 Attributes: ${resultOriginal.attributes.length}`);
      console.log(`   💰 Price Ranges: ${resultOriginal.price_ranges.length}`);

    } catch (error) {
      console.log(`❌ Original Function Error: ${error.message}`);
    }

    console.log('');

    // Test optimized function
    try {
      const startOptimized = performance.now();
      const resultOptimized = await fetchProductsOptimized(test.query);
      const endOptimized = performance.now();
      const timeOptimized = endOptimized - startOptimized;

      console.log(`🚀 Optimized Function:`);
      console.log(`   ⏱️  Time: ${timeOptimized.toFixed(2)}ms`);
      console.log(`   📦 Products: ${resultOptimized.products.length}`);
      console.log(`   📊 Total Count: ${resultOptimized.pagination.total_count}`);
      console.log(`   🏷️  Categories: ${resultOptimized.category_items.length}`);
      console.log(`   🏢 Brands: ${resultOptimized.brand_items.length}`);
      console.log(`   🎯 Deals: ${resultOptimized.deal_items.length}`);
      console.log(`   🔧 Attributes: ${resultOptimized.attributes.length}`);
      console.log(`   💰 Price Ranges: ${resultOptimized.price_ranges.length}`);

      // Calculate improvement
      if (timeOriginal && timeOptimized) {
        const improvement = ((timeOriginal - timeOptimized) / timeOriginal * 100).toFixed(1);
        const speedup = (timeOriginal / timeOptimized).toFixed(2);
        console.log(`   📈 Performance Improvement: ${improvement}% faster`);
        console.log(`   🚀 Speedup: ${speedup}x`);
      }

    } catch (error) {
      console.log(`❌ Optimized Function Error: ${error.message}`);
    }

    console.log('\n' + '=' .repeat(50) + '\n');
  }

  console.log('✅ Performance test completed!');
}

// Run the test
testPerformance().catch(console.error);

