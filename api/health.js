// Vercel Serverless Function: GET /api/health
module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  res.status(200).json({
    status: 'ONLINE',
    service: 'NeoPryce Multiverse API',
    version: '2.4.0',
    brightdata: process.env.BRIGHTDATA_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
    huggingface: process.env.HUGGINGFACE_API_KEY ? 'CONFIGURED' : 'NOT_CONFIGURED',
    timestamp: new Date().toISOString()
  });
};
