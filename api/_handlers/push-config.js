export default async function handler(req, res) {
  return res.status(200).json({ vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '' })
}
