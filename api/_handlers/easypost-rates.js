import { requireMethod, requireAdmin, HttpError } from '../_lib/core.js'
import { easypost, fromAddress } from '../_lib/easypost.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  await requireAdmin(req)
  const { to_address, parcel } = req.body || {}
  if (!to_address?.street1 || !to_address?.city || !to_address?.state || !to_address?.zip) {
    throw new HttpError(400, 'Destination address is incomplete')
  }
  if (!(parseFloat(parcel?.weight) > 0)) throw new HttpError(400, 'Package weight (oz) is required')

  const from = fromAddress()
  if (!from.street1 || !from.zip) throw new HttpError(500, 'Set MAKER_STREET / MAKER_CITY / MAKER_STATE / MAKER_ZIP for the return address')

  const data = await easypost('/shipments', {
    shipment: {
      from_address: from,
      to_address: { country: 'US', ...to_address },
      parcel: {
        weight: parseFloat(parcel.weight),               // ounces
        length: parseFloat(parcel.length) || 9,
        width: parseFloat(parcel.width) || 6,
        height: parseFloat(parcel.height) || 0.5,        // sticker mailers are flat
      },
    },
  })

  const rates = (data.rates || [])
    .map(r => ({
      id: r.id,
      carrier: r.carrier,
      service: r.service,
      rate: r.rate,
      est_delivery_days: r.est_delivery_days,
      delivery_date: r.delivery_date,
    }))
    .sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))

  return res.status(200).json({ shipment_id: data.id, rates })
}
