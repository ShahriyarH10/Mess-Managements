/**
 * Vercel Speed Insights - Alternative npm package implementation
 * 
 * This file demonstrates how to use @vercel/speed-insights package
 * if you decide to use a bundler (webpack, rollup, vite, etc.)
 * 
 * By default, the project uses the script tag approach (see index.html <head>)
 * which works immediately when deployed to Vercel without any build step.
 * 
 * To use this file instead:
 * 1. Set up a bundler for your project
 * 2. Import this file in your main JavaScript entry point
 * 3. Remove the Speed Insights script tags from index.html
 */

// Uncomment the following if using with a bundler:
// import { injectSpeedInsights } from '@vercel/speed-insights';

// Initialize Speed Insights with optional configuration
// injectSpeedInsights({
//   // Optional: Set sample rate (0-1). Default is 1 (100%)
//   // sampleRate: 1.0,
//   
//   // Optional: Enable debug mode to see events in console
//   // debug: false,
//   
//   // Optional: Modify or filter events before sending
//   // beforeSend: (data) => {
//   //   // Filter out sensitive routes
//   //   if (data.url.includes('/admin') || data.url.includes('/api')) {
//   //     return null; // Don't send this event
//   //   }
//   //   return data; // Send the event as is
//   // },
//   
//   // Optional: Specify dynamic routes
//   // route: window.location.pathname,
// });

// Export for potential use in other modules
// export { injectSpeedInsights };
