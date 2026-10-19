import { db, requireMethod, getOrder, HttpError, firstName, APP_URL } from '../_lib/core.js'
import { layout, button, emailMaker, esc, escBr } from '../_lib/email.js'
import { notifyAdmins } from '../_lib/push.js'
import { COLORS } from '../../src/brand.js'

// Customer approves the proof or requests changes on /proof/:id.
export default async function handler(req, res) {
  requireMethod(req, 'POST')
  const { orderId, action, note } = req.body || {}
  const order = await getOrder(orderId)

  if (!['approved', 'changes'].includes(action)) throw new HttpError(400, 'Invalid action')
  if (order.proof_status !== 'sent') throw new HttpError(400, 'There is no proof waiting for your review')
  const revisionNote = String(note || '').trim().slice(0, 5000)
  if (action === 'changes' && !revisionNote) throw new HttpError(400, 'Tell us what you would like changed')

  const now = new Date().toISOString()
  const updates = action === 'approved'
    ? { proof_status: 'approved', proof_approved_at: now, status: 'proof_approved' }
    : {
        proof_status: 'changes_requested',
        status: 'revisions_requested',
        revision_notes: revisionNote,
        revision_history: [
          ...(order.revision_history || []),
          { round: (order.revision_history || []).length + 1, note: revisionNote, submittedAt: now },
        ],
      }

  const { error } = await db().from('orders').update(updates).eq('id', order.id)
  if (error) throw new HttpError(500, error.message)

  const name = order.customer_name
  const approved = action === 'approved'
  await Promise.all([
    notifyAdmins({
      title: approved ? '✅ Proof approved!' : '✏️ Changes requested',
      body: approved
        ? `${firstName(name)} approved their proof — ready for production!`
        : `${firstName(name)}: ${revisionNote.slice(0, 80)}${revisionNote.length > 80 ? '…' : ''}`,
      url: `/dashboard/order/${order.id}`,
    }),
    emailMaker(approved ? `✅ ${name} approved their proof` : `✏️ ${name} requested changes`, layout({
      heading: approved ? 'Proof approved!' : 'Changes requested',
      body: (approved
        ? `<p><strong>${esc(name)}</strong> approved the proof for ${esc(order.product_type)}. You're clear to start production.</p>`
        : `<p style="margin:0 0 12px;"><strong>${esc(name)}</strong> requested changes:</p>
           <div style="background:${COLORS.card2};border-left:3px solid ${COLORS.primary};border-radius:0 8px 8px 0;padding:14px 16px;">${escBr(revisionNote)}</div>`)
        + button('Open order →', `${APP_URL}/dashboard/order/${order.id}`),
    })),
  ])

  return res.status(200).json({ success: true })
}
