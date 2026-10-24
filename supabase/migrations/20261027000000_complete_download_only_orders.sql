-- Download-only shop orders are delivered the moment they're paid, so any paid one that isn't
-- marked Complete yet gets closed out here — whatever status it's sitting in, and even if its
-- delivery field wasn't set to 'digital'. Safe to run more than once.
UPDATE orders
SET status = 'completed', fulfillment = 'digital'
WHERE source = 'shop'
  AND status IN ('confirmed', 'in_production', 'ready_for_pickup', 'shipped')
  AND (balance_paid = true OR (price > 0 AND amount_paid >= price - 0.009))
  AND jsonb_typeof(shop_cart) = 'array'
  AND jsonb_array_length(shop_cart) > 0
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(shop_cart) AS line
    WHERE coalesce(line->>'kind', '') <> 'digital'
  );
