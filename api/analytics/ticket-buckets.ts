import { aggregateTicketBucketsForPeriod } from '../../server/ticketBuckets';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { startDate, endDate, branchName, segmentFilter, excludeToday, buckets, forceRefresh } = body;

    if (!startDate || !endDate || !Array.isArray(buckets)) {
      return res.status(400).json({ error: 'startDate, endDate, and buckets array are required.' });
    }

    const result = await aggregateTicketBucketsForPeriod({
      startDate,
      endDate,
      branchName: branchName || 'All',
      segmentFilter: segmentFilter || 'ALL',
      excludeToday: excludeToday !== false,
      buckets,
      forceRefresh: Boolean(forceRefresh)
    });

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('Vercel ticket bucket aggregation error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to aggregate ticket buckets' });
  }
}
