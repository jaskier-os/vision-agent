// /**
//  * Google Cloud Vision WEB_DETECTION wrapper.
//  * Provides reverse image search / Google Lens functionality.
//  * Kept as alternative to Yandex scraping -- requires billing enabled on GCP project.
//  */
//
// import vision from '@google-cloud/vision';
//
// let client;
//
// function getClient() {
//   if (!client) {
//     client = new vision.ImageAnnotatorClient();
//   }
//   return client;
// }
//
// /**
//  * Run Google Cloud Vision WEB_DETECTION on a base64-encoded image.
//  * Returns structured JSON with web entities, matching images, source pages, etc.
//  * @param {string} imageBase64 - Raw base64 string (no data URL prefix)
//  * @returns {Promise<string>} - JSON string with web detection results
//  */
// export async function googleLens(imageBase64) {
//   const [result] = await getClient().webDetection({
//     image: { content: imageBase64 }
//   });
//
//   const wd = result.webDetection;
//   if (!wd) {
//     return JSON.stringify({ error: 'No web detection results returned' });
//   }
//
//   const output = {};
//
//   if (wd.bestGuessLabels?.length) {
//     output.bestGuessLabels = wd.bestGuessLabels.map(l => l.label);
//   }
//
//   if (wd.webEntities?.length) {
//     output.webEntities = wd.webEntities
//       .filter(e => e.description)
//       .map(e => ({ description: e.description, score: e.score }));
//   }
//
//   if (wd.fullMatchingImages?.length) {
//     output.fullMatchingImages = wd.fullMatchingImages.map(i => i.url);
//   }
//
//   if (wd.partialMatchingImages?.length) {
//     output.partialMatchingImages = wd.partialMatchingImages.map(i => i.url);
//   }
//
//   if (wd.pagesWithMatchingImages?.length) {
//     output.pagesWithMatchingImages = wd.pagesWithMatchingImages.map(p => ({
//       url: p.url,
//       title: p.pageTitle || ''
//     }));
//   }
//
//   if (wd.visuallySimilarImages?.length) {
//     output.visuallySimilarImages = wd.visuallySimilarImages.map(i => i.url);
//   }
//
//   return JSON.stringify(output, null, 2);
// }
