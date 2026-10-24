-- Download-only shop orders are delivered the moment they're paid (the download link is
-- emailed), so they belong in Done, not To do. New ones already land as 'completed';
-- this moves any older paid ones that were left as 'confirmed'. Safe to run more than once.
UPDATE orders
SET status = 'completed'
WHERE source = 'shop'
  AND fulfillment = 'digital'
  AND status = 'confirmed'
  AND (balance_paid = true OR (price > 0 AND amount_paid >= price - 0.009));
