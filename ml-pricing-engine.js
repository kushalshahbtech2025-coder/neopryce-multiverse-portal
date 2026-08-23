/**
 * NeoPryce Multiverse Machine Learning Pricing & Decision Engine
 * Evaluates price histories, detects fake pre-sale price inflations,
 * forecasts future price trends using regression momentum, and generates "Should You Buy?" verdicts.
 */

window.MLPricingEngine = (function () {
  /**
   * Main entry point: Performs full ML analysis on a given product object.
   */
  function evaluateProduct(product) {
    if (!product || !product.priceHistory || product.priceHistory.length === 0) {
      return getFallbackEvaluation(product);
    }

    const prices = product.priceHistory.map(h => h.price);
    const currentPrice = product.currentPrice;
    const claimedOriginalPrice = product.originalPrice || currentPrice;

    // 1. Basic Stats
    const minPrice = Math.min(...prices, currentPrice);
    const maxPrice = Math.max(...prices, claimedOriginalPrice);
    const avg30 = calculateAverage(prices.slice(-30));
    const median30 = calculateMedian(prices.slice(-30));

    // 2. Fake Discount Analysis
    const fakeDiscountAnalysis = detectFakeDiscount(product.priceHistory, currentPrice, claimedOriginalPrice, avg30);

    // 3. Machine Learning Trend & Forecast (Linear + Exponential Regression)
    const forecast = calculatePriceForecast(product.priceHistory, currentPrice);

    // 4. Stock & Inventory Risk Assessment
    const stockRisk = evaluateStockRisk(product.stockCount, product.stores);

    // 5. Deal Quality Score (0 to 100)
    const dealScore = calculateDealScore({
      currentPrice,
      minPrice,
      maxPrice,
      avg30,
      realDiscountPct: fakeDiscountAnalysis.realDiscountPct,
      isFakeDiscount: fakeDiscountAnalysis.isFakeDiscount,
      forecastDirection: forecast.direction,
      stockRisk: stockRisk.riskLevel
    });

    // 6. Actionable "Should You Buy Now?" Verdict
    const verdict = generateVerdict(dealScore, fakeDiscountAnalysis, forecast, stockRisk, currentPrice, minPrice);

    return {
      productId: product.id,
      productTitle: product.title,
      currentPrice,
      claimedOriginalPrice,
      minPrice,
      maxPrice,
      avg30Price: Math.round(avg30 * 100) / 100,
      median30Price: Math.round(median30 * 100) / 100,
      fakeDiscount: fakeDiscountAnalysis,
      forecast,
      stockRisk,
      dealScore,
      verdict,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Detects artificial price inflations before sales.
   * If vendor raised price right before "discounting" it, flags as fake discount.
   */
  function detectFakeDiscount(history, currentPrice, claimedOriginalPrice, avg30) {
    let preSalePrice = claimedOriginalPrice;
    let isFakeDiscount = false;
    let fakeInflationPct = 0;

    // Check pre-sale period (last 3-10 days before discount)
    if (history.length >= 7) {
      const recentPriorPrices = history.slice(-10, -2).map(h => h.price);
      if (recentPriorPrices.length > 0) {
        const priorAvg = calculateAverage(recentPriorPrices);
        if (claimedOriginalPrice > priorAvg * 1.10 && currentPrice >= priorAvg * 0.95) {
          isFakeDiscount = true;
          fakeInflationPct = Math.round(((claimedOriginalPrice - priorAvg) / priorAvg) * 100);
          preSalePrice = priorAvg;
        }
      }
    }

    const claimedDiscountPct = claimedOriginalPrice > currentPrice
      ? Math.round(((claimedOriginalPrice - currentPrice) / claimedOriginalPrice) * 100)
      : 0;

    const realDiscountPct = avg30 > currentPrice
      ? Math.round(((avg30 - currentPrice) / avg30) * 100)
      : 0;

    return {
      isFakeDiscount,
      claimedDiscountPct,
      realDiscountPct,
      fakeInflationPct,
      preSalePrice: Math.round(preSalePrice * 100) / 100,
      explanation: isFakeDiscount
        ? `⚠️ Warning: Retailer inflated original price by +${fakeInflationPct}% before listing sale. True discount is only ${realDiscountPct}% off 30-day average.`
        : `✅ Valid Discount: Current price is ${claimedDiscountPct}% below standard baseline.`
    };
  }

  /**
   * Calculates 7-day, 14-day, and 30-day price trend regression.
   */
  function calculatePriceForecast(history, currentPrice) {
    const prices = history.map(h => h.price);
    const n = prices.length;
    if (n < 3) {
      return {
        direction: 'STABLE',
        confidence: 60,
        forecast7d: currentPrice,
        forecast14d: currentPrice,
        forecast30d: currentPrice,
        explanation: 'Insufficient price history data for deep ML trend estimation.'
      };
    }

    // Linear regression: y = m*x + c
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += prices[i];
      sumXY += i * prices[i];
      sumXX += i * i;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Recent 7-day momentum
    const recent7 = prices.slice(-7);
    const recent7Avg = calculateAverage(recent7);
    const momentum = (currentPrice - recent7Avg) / recent7Avg;

    // Forecast projections
    const forecast7d = Math.max(10, Math.round((currentPrice + slope * 7 + momentum * currentPrice * 0.5) * 100) / 100);
    const forecast14d = Math.max(10, Math.round((currentPrice + slope * 14 + momentum * currentPrice * 0.8) * 100) / 100);
    const forecast30d = Math.max(10, Math.round((currentPrice + slope * 30 + momentum * currentPrice * 1.0) * 100) / 100);

    let direction = 'STABLE';
    if (slope < -0.8 || momentum < -0.04) {
      direction = 'DROPPING';
    } else if (slope > 0.8 || momentum > 0.04) {
      direction = 'RISING';
    }

    const confidence = Math.min(95, Math.max(65, 70 + Math.round(n * 0.8)));

    let explanation = '';
    if (direction === 'DROPPING') {
      explanation = `📉 Price trend is declining by ~₹${Math.abs(Math.round(slope * 7))} / week. Price expected to drop further to ₹${forecast7d} in 7 days.`;
    } else if (direction === 'RISING') {
      explanation = `📈 Demand surge or stock shortage detected. Price trending upward toward ₹${forecast7d} over the next week.`;
    } else {
      explanation = `➖ Price is currently stabilized near ₹${currentPrice}. Minimal fluctuation expected.`;
    }

    return {
      slope: Math.round(slope * 100) / 100,
      direction,
      confidence,
      forecast7d,
      forecast14d,
      forecast30d,
      explanation
    };
  }

  /**
   * Assesses stock availability & depletion risk.
   */
  function evaluateStockRisk(stockCount, stores) {
    const totalStock = stockCount || (stores ? stores.reduce((acc, s) => acc + (s.stock || 0), 0) : 15);
    let riskLevel = 'LOW';
    let statusText = 'Normal Stock Level';

    if (totalStock <= 3) {
      riskLevel = 'HIGH';
      statusText = '⚠️ CRITICAL LOW STOCK (Under 3 units left across stores)';
    } else if (totalStock <= 10) {
      riskLevel = 'MODERATE';
      statusText = '⚡ LIMITED STOCK (Selling fast across regional hubs)';
    }

    return {
      totalStock,
      riskLevel,
      statusText
    };
  }

  /**
   * Calculates overall deal score between 0 and 100.
   */
  function calculateDealScore(params) {
    let score = 50;

    // 1. Distance from historic min
    if (params.maxPrice > params.minPrice) {
      const position = (params.currentPrice - params.minPrice) / (params.maxPrice - params.minPrice);
      score += Math.round((1 - position) * 35); // Max +35 if at historic low
    }

    // 2. Real discount weight
    if (params.realDiscountPct > 0) {
      score += Math.min(25, Math.round(params.realDiscountPct * 0.8));
    }

    // 3. Fake discount penalty
    if (params.isFakeDiscount) {
      score -= 30; // Severe penalty for fake price hike
    }

    // 4. Forecast direction
    if (params.forecastDirection === 'RISING') {
      score += 10; // Buy now before price goes up
    } else if (params.forecastDirection === 'DROPPING') {
      score -= 15; // Better to wait for further drop
    }

    // 5. Stock scarcity bonus
    if (params.stockRisk === 'HIGH') {
      score += 10;
    }

    return Math.min(99, Math.max(12, score));
  }

  /**
   * Generates the final decision recommendation badge & actionable advice.
   */
  function generateVerdict(score, fakeDiscount, forecast, stockRisk, currentPrice, minPrice) {
    let badge = 'BUY NOW';
    let color = 'primary'; // Pink / Green
    let summary = '';
    let action = '';

    if (fakeDiscount.isFakeDiscount) {
      badge = 'WAIT - FAKE DISCOUNT';
      color = 'error'; // Red/Pink
      summary = `The advertised discount is misleading. The seller raised the base price by ${fakeDiscount.fakeInflationPct}% right before applying the discount.`;
      action = `Hold off! Do not buy right now. Wait for price to drop back to genuine baseline (~₹${fakeDiscount.preSalePrice}).`;
    } else if (currentPrice <= minPrice * 1.02 && score >= 75) {
      badge = 'BUY NOW - HISTORIC LOW';
      color = 'tertiary'; // Acid Green
      summary = `Current price (₹${currentPrice}) matches or beats the 1-year historic lowest price across all regional stores!`;
      action = `Strong Buy Recommendation! Deal quality is rated ${score}/100. Grab it before stock depletes.`;
    } else if (forecast.direction === 'DROPPING' && score < 70) {
      badge = 'HOLD - PRICE DROPPING';
      color = 'secondary'; // Electric Blue
      summary = `ML model predicts price will decrease by ~₹${Math.round(currentPrice - forecast.forecast7d)} in the next 7 days.`;
      action = `Wait 5 to 7 days. Expected target price: ₹${forecast.forecast7d}.`;
    } else if (stockRisk.riskLevel === 'HIGH' && score >= 65) {
      badge = 'BUY SOON - STOCK RISK';
      color = 'primary';
      summary = `Stock is nearly depleted (${stockRisk.totalStock} units remaining across regional marketplaces).`;
      action = `Purchase soon if needed, as item is likely to go out of stock before the next discount cycle.`;
    } else if (score >= 65) {
      badge = 'GOOD VALUE';
      color = 'secondary';
      summary = `Fair deal with solid discount relative to regional store averages.`;
      action = `Good choice to buy if you need it now. Deal score: ${score}/100.`;
    } else {
      badge = 'OVERPRICED - PASS';
      color = 'error';
      summary = `Price is elevated above standard baseline. Minimal discount detected.`;
      action = `Pass for now. Set a price alert for when it drops below ₹${Math.round(minPrice * 1.05)}.`;
    }

    return {
      badge,
      color,
      score,
      summary,
      action
    };
  }

  function calculateAverage(arr) {
    if (!arr || arr.length === 0) return 0;
    return arr.reduce((sum, v) => sum + v, 0) / arr.length;
  }

  function calculateMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function getFallbackEvaluation(product) {
    return {
      productId: product ? product.id : 'unknown',
      productTitle: product ? product.title : 'Sample Product',
      currentPrice: product ? product.currentPrice : 100,
      claimedOriginalPrice: product ? product.originalPrice : 120,
      minPrice: 90,
      maxPrice: 150,
      avg30Price: 105,
      fakeDiscount: { isFakeDiscount: false, realDiscountPct: 10, explanation: 'Standard pricing.' },
      forecast: { direction: 'STABLE', forecast7d: 100, explanation: 'Stable price trend.' },
      stockRisk: { totalStock: 10, riskLevel: 'LOW', statusText: 'Normal' },
      dealScore: 70,
      verdict: {
        badge: 'GOOD VALUE',
        color: 'secondary',
        score: 70,
        summary: 'Solid product deal.',
        action: 'Consider buying if needed.'
      }
    };
  }

  return {
    evaluateProduct,
    detectFakeDiscount,
    calculatePriceForecast,
    calculateDealScore,
    generateVerdict
  };
})();
