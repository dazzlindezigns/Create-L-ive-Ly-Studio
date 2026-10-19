import { db, requireMethod, HttpError, isEmail, firstName, APP_URL, BRAND } from '../_lib/core.js'
import { layout, rows, panel, button, emailMaker, sendEmail, esc, escBr } from '../_lib/email.js'
import { notifyAdmins } from '../_lib/push.js'
import { storageUrlsOnly, cleanAddress, formatAddress } from '../_lib/validate.js'
import { STICKER_BAR } from '../../src/brand.js'

export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const b = req.body || {}

  const customerName = String(b.customerName || '').trim()
  const customerEmail = String(b.customerEmail || '').trim().toLowerCase()
  if (!customerName || !isEmail(customerEmail)) throw new HttpError(400, 'Name and a valid email are required')
  if (!b.productType) throw new HttpError(400, 'Pick a product type')

  const quantity = Math.max(1, Math.min(100000, parseInt(b.quantity, 10) || 1))
  const isEvent = b.productType === STICKER_BAR.label
  const needBy = /^\d{4}-\d{2}-\d{2}$/.test(b.needBy || '') ? b.needBy : null
  if (isEvent && !needBy) throw new HttpError(400, 'Pick your event date')
  const e = b.eventDetails || {}
  const s = (v, n = 200) => String(v || '').trim().slice(0, n) || null
  const eventDetails = isEvent
    ? { eventType: s(e.eventType, 80), startTime: s(e.startTime, 20), duration: s(e.duration, 20), venue: s(e.venue), address: s(e.address, 300) }
    : null
  if (isEvent && !eventDetails.address) throw new HttpError(400, 'Add the event location')
  const fulfillment = isEvent ? 'event' : b.fulfillment === 'shipping' ? 'shipping' : 'pickup'
  const shippingAddress = fulfillment === 'shipping' ? cleanAddress(b.shippingAddress, customerName) : null
  if (fulfillment === 'shipping' && !shippingAddress) throw new HttpError(400, 'Complete shipping address is required')

  const { data: order, error } = await db().from('orders').insert({
    customer_name: customerName.slice(0, 200),
    customer_email: customerEmail,
    customer_phone: String(b.customerPhone || '').trim().slice(0, 40) || null,
    product_type: String(b.productType).slice(0, 120),
    quantity,
    size: String(b.size || '').slice(0, 80) || null,
    finish: String(b.finish || '').slice(0, 80) || null,
    description: String(b.description || '').slice(0, 5000),
    need_by: needBy,
    event_details: eventDetails,
    notes: String(b.notes || '').slice(0, 5000) || null,
    image_urls: storageUrlsOnly(b.imageUrls, 'order-files'),
    fulfillment,
    shipping_address: shippingAddress,
    source: 'form',
    status: 'pending',
  }).select().single()
  if (error) throw new HttpError(500, error.message)

  const needByLabel = order.need_by
    ? new Date(order.need_by + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null
  const files = (order.image_urls || []).map((u, i) => `<a href="${esc(u)}">File ${i + 1}</a>`).join(' · ')
  const delivery = isEvent ? 'On-site Sticker Bar'
    : fulfillment === 'shipping' ? `Ship to ${esc(formatAddress(shippingAddress))}` : esc(BRAND.pickupLabel)
  const eventRows = isEvent ? [
    ['Event date', `<strong>${esc(needBy && new Date(needBy + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))}</strong>`],
    ['Time', esc([eventDetails.startTime, eventDetails.duration].filter(Boolean).join(' · '))],
    ['Event type', esc(eventDetails.eventType)],
    ['Guests', String(quantity)],
    ['Location', esc([eventDetails.venue, eventDetails.address].filter(Boolean).join(' — '))],
  ] : []

  await Promise.all([
    emailMaker(isEvent ? `🎉 Sticker Bar request from ${customerName} (${needBy})` : `New order request from ${customerName}`, layout({
      heading: isEvent ? 'New Sticker Bar request' : 'New order request',
      body: rows([
        ['Customer', `<strong>${esc(customerName)}</strong>`],
        ['Email', `<a href="mailto:${esc(customerEmail)}">${esc(customerEmail)}</a>`],
        ['Phone', esc(order.customer_phone)],
        ...(isEvent ? [['Booking', `<strong>${esc(order.product_type)}</strong>`], ...eventRows] : [
          ['Product', `<strong>${esc(order.product_type)}</strong> × ${quantity}`],
          ['Size / finish', esc([order.size, order.finish].filter(Boolean).join(' · '))],
          ['Need by', esc(needByLabel)],
        ]),
        ['Details', escBr(order.description)],
        ['Delivery', delivery],
        ['Files', files],
        ['Notes', escBr(order.notes)],
      ]) + button('Open in dashboard →', `${APP_URL}/dashboard/order/${order.id}`),
    }), customerEmail),

    sendEmail({
      to: customerEmail,
      log: { orderId: order.id, kind: 'request_received' },
      subject: `We got your request, ${firstName(customerName)}!`,
      html: layout({
        heading: 'Request received!',
        body: `<p style="margin:0 0 8px;">Hey ${esc(firstName(customerName))}! Thank you for your ${isEvent ? 'Sticker Bar booking request' : 'custom order request'}. We'll review the details and send your quote soon${isEvent ? ' — your date is not reserved until the deposit is paid' : ''}.</p>
          ${panel(isEvent ? 'Your event' : 'Your request', rows([
            ...(isEvent ? eventRows : [
              ['Product', `${esc(order.product_type)} × ${quantity}`],
              ['Size / finish', esc([order.size, order.finish].filter(Boolean).join(' · '))],
              ['Need by', esc(needByLabel)],
            ]),
            ['Delivery', delivery],
          ]))}
          <p style="font-size:13px;color:#999;margin:0;">Questions in the meantime? Just reply to this email.</p>`,
      }),
    }).catch(e => console.error('customer email failed', e)),

    notifyAdmins({
      title: isEvent ? '🎉 New Sticker Bar booking request' : '✨ New order request',
      body: isEvent
        ? `${firstName(customerName)} · ${needBy} · ${quantity} guests`
        : `${firstName(customerName)} wants ${quantity} × ${order.product_type}`,
      url: `/dashboard/order/${order.id}`,
    }),
  ])

  return res.status(200).json({ orderId: order.id })
}
